import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { getChildProcess, getElectron, getOs, getPath } from './electron';
import { flickDb } from './db';
import { openPlugin } from './open-plugin';
import { parseCmdRegex } from './cmd-regex';
import type {
  CmdItem,
  FeatureItem,
  MatchPluginItem,
  OptionPlugin,
  TriggerSuperPanelPayload,
  TranslateState,
  UserPluginItem,
} from './types';
import {
  fetchTranslationRaw,
  isTranslateConfigured,
  resolveTranslatePrefsFromPreferencesData,
  type SuperPanelTranslatePrefs,
} from './translate-config';

const EXPLORER_LIKE = [
  'explorer.exe',
  'SearchApp.exe',
  'SearchHost.exe',
  'FESearchHost.exe',
  'Finder.app',
];
const SUPER_PANEL_PREF_DB_ID = 'flick-system-super-panel-preferences';

function msgTriggerSync<T>(type: string, data: unknown): T {
  const { ipcRenderer } = getElectron();
  const res = ipcRenderer.sendSync('msg-trigger', { type, data });
  if (res instanceof Error) throw res;
  return res as T;
}

function getDesktopPath(): string {
  return msgTriggerSync<string>('getPath', { name: 'desktop' });
}

function basenameWinOrMac(p: string): string {
  const seg = p.split(/[/\\]/);
  return seg[seg.length - 1] || '';
}

function isExplorerLikeWindow(fileUrl: string): boolean {
  const name = basenameWinOrMac(fileUrl);
  return EXPLORER_LIKE.includes(name);
}

function normalizeFsPath(p: string): string {
  return String(p || '')
    .replace(/^file:\/\//, '')
    .trim();
}

/** 仅保留可见文本：去掉零宽/方向控制/BOM 等不可见字符，再 trim。 */
function normalizeVisibleText(raw: string): string {
  return String(raw || '')
    .replace(/[\u200B-\u200D\uFEFF\u2060\u00AD\u200E\u200F\u202A-\u202E]/g, '')
    .trim();
}

/** 选中的是磁盘上的文件夹路径时，与 explorer 壳窗口走同一套「终端打开 / 新建文件 / 复制路径」 */
function isDirectoryPath(p: string): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    const s = normalizeFsPath(p);
    if (!s) return false;
    return fs.statSync(s).isDirectory();
  } catch {
    return false;
  }
}

export function useSuperPanel() {
  const pathMod = getPath();
  const os = getOs();
  const { ipcRenderer, clipboard } = getElectron();
  const { spawn, exec } = getChildProcess();

  const pinned = ref(false);

  /** 翻译请求代数：面板关闭或新一轮 trigger 时递增，防止旧请求完成后写回 state */
  let translateSeq = 0;

  const state = reactive({
    translate: null as TranslateState | null,
    loading: false,
    fileUrl: '',
    selectedText: '',
    selectedFileUrl: '',
    autoTranslate: false,
    /** 选中文本超过该长度则不发起翻译（与偏好 `translateMaxChars` 一致，默认 2000） */
    translateMaxChars: 2000,
    translatePrefs: {} as SuperPanelTranslatePrefs,
    matchPlugins: [] as MatchPluginItem[],
    userPlugins: [] as UserPluginItem[],
  });

  const commonPlugins: MatchPluginItem[] = [
    {
      type: 'default',
      name: '终端打开',
      logo: '',
      click: () => {
        if (os.type() === 'Windows_NT') {
          spawn(`start cmd.exe /k "cd /d ${state.fileUrl}"`, [], { shell: true });
        } else {
          spawn('open', ['-a', 'Terminal', state.fileUrl]);
        }
      },
    },
    {
      type: 'default',
      name: '新建文件',
      logo: '',
      click: () => {
        ipcRenderer.send('create-file', {
          title: '请选择要保存的文件名',
          buttonLabel: '保存',
          defaultPath: state.fileUrl.replace('file://', ''),
          showsTagField: false,
          nameFieldLabel: '',
        });
      },
    },
    {
      type: 'default',
      name: '复制路径',
      logo: '',
      click: () => {
        clipboard.writeText(state.fileUrl.replace('file://', ''));
      },
    },
  ];

  const selectedPlugins: MatchPluginItem[] = [
    {
      type: 'default',
      name: '复制当前路径',
      logo: '',
      click: () => {
        clipboard.writeText(state.fileUrl.replace('file://', ''));
      },
    },
  ];

  function effectiveTranslateMaxChars(): number {
    const n = state.translateMaxChars;
    if (typeof n === 'number' && Number.isFinite(n) && n >= 1) {
      return Math.min(100000, Math.floor(n));
    }
    return 2000;
  }

  function runTranslate(word: string) {
    const mySeq = translateSeq;
    const visibleWord = normalizeVisibleText(word);
    const prefs = state.translatePrefs;
    const maxLen = effectiveTranslateMaxChars();
    const allow =
      state.autoTranslate &&
      !!visibleWord &&
      isTranslateConfigured(prefs) &&
      visibleWord.length <= maxLen;
    if (!allow) {
      state.translate = null;
      state.loading = false;
      return;
    }
    state.loading = true;
    fetchTranslationRaw(visibleWord, prefs)
      .then((raw) => {
        if (mySeq !== translateSeq) return;
        const parsed = JSON.parse(raw) as TranslateState;
        const hasBasic = !!parsed?.basic?.explains?.filter((line) => String(line || '').trim()).length;
        const hasTranslation = !!parsed?.translation?.filter((line) => String(line || '').trim()).length;
        state.translate = hasBasic || hasTranslation ? { ...parsed, src: visibleWord } : null;
      })
      .catch(() => {
        if (mySeq !== translateSeq) return;
        state.translate = null;
      })
      .finally(() => {
        if (mySeq !== translateSeq) return;
        state.loading = false;
      });
  }

  function cancelTranslateBecausePanelGone() {
    translateSeq += 1;
    state.translate = null;
    state.loading = false;
  }

  function collectTextPlugins(text: string, optionPlugin: OptionPlugin[]) {
    for (const plugin of optionPlugin) {
      for (const feature of plugin.features) {
        for (const cmd of feature.cmds) {
          if (cmd.type === 'regex' && cmd.match && parseCmdRegex(cmd.match).test(text)) {
            state.matchPlugins.push({
              type: 'ext',
              name: cmd.label || feature.code,
              logo: plugin.logo,
              click: () =>
                openPlugin({
                  plugin: plugin as unknown as Record<string, unknown>,
                  feature,
                  cmd,
                  data: text,
                }),
            });
          }
          if (cmd.type === 'over') {
            state.matchPlugins.push({
              type: 'ext',
              name: cmd.label || feature.code,
              logo: plugin.logo,
              click: () =>
                openPlugin({
                  plugin: plugin as unknown as Record<string, unknown>,
                  feature,
                  cmd,
                  data: text,
                }),
            });
          }
        }
      }
    }
  }

  function collectFilePlugins(fileUrl: string, ext: string, optionPlugin: OptionPlugin[]) {
    const imgRe = /\.(png|jpg|gif|jpeg|webp)$/i;
    for (const plugin of optionPlugin) {
      for (const feature of plugin.features) {
        for (const cmd of feature.cmds) {
          if (cmd.type === 'img' && imgRe.test(ext)) {
            state.matchPlugins.unshift({
              type: 'ext',
              name: cmd.label || feature.code,
              logo: plugin.logo,
              click: () => {
                const data = ipcRenderer.sendSync(
                  'get-file-base64',
                  state.fileUrl.replace('file://', '')
                );
                openPlugin({
                  plugin: plugin as unknown as Record<string, unknown>,
                  feature,
                  cmd,
                  data,
                });
              },
            });
          }
          if (cmd.type === 'file' && cmd.match && parseCmdRegex(cmd.match).test(ext)) {
            state.matchPlugins.unshift({
              type: 'ext',
              name: cmd.label || feature.code,
              logo: plugin.logo,
              click: () =>
                openPlugin({
                  plugin: plugin as unknown as Record<string, unknown>,
                  feature,
                  cmd,
                  data: {
                    isFile: true,
                    isDirectory: false,
                    name: pathMod.basename(fileUrl),
                    path: fileUrl,
                  },
                }),
            });
          }
        }
      }
    }
  }

  function refreshUserPlugins() {
    const doc = flickDb.get('super-panel-user-plugins') as {
      data?: UserPluginItem[];
    } | null;
    if (!doc?.data) {
      state.userPlugins = [];
      return;
    }
    state.userPlugins = doc.data.map((row) => ({
      ...row,
      click: () =>
        openPlugin({
          plugin: row as unknown as Record<string, unknown>,
          feature: row.ext,
          cmd: row.cmd,
        }),
    }));
  }

  function refreshPreferences() {
    try {
      const doc = flickDb.get(SUPER_PANEL_PREF_DB_ID) as {
        data?: {
          autoTranslate?: boolean;
          translateMaxChars?: number;
        } & SuperPanelTranslatePrefs;
      } | null;
      const data = doc?.data as Record<string, unknown> | undefined;
      const prefs = resolveTranslatePrefsFromPreferencesData(data);
      state.translatePrefs = prefs;
      const rawMax = data?.translateMaxChars;
      state.translateMaxChars =
        typeof rawMax === 'number' && Number.isFinite(rawMax) && rawMax >= 1
          ? Math.min(100000, Math.floor(rawMax))
          : 2000;
      const wantOn = data?.autoTranslate !== false;
      state.autoTranslate = wantOn && isTranslateConfigured(prefs);
    } catch {
      state.translatePrefs = {};
      state.autoTranslate = false;
    }
  }

  function resolveCurrentFolder(cb: (folder: string) => void) {
    if (os.type() === 'Darwin') {
      exec(
        `osascript -e 'tell application "Finder" to get the POSIX path of (target of front window as alias)'`,
        { encoding: 'utf8' },
        (err, stdout) => {
          if (!err && stdout) cb(stdout.trim().replace(/\/$/, ''));
        }
      );
    } else if (os.type() === 'Windows_NT') {
      ipcRenderer
        .invoke('get-path-async')
        .then((data: { stdout?: string }) => {
          const folder = String(data?.stdout ?? '').trim();
          if (folder) cb(folder);
        });
    }
  }

  function onTrigger(_e: unknown, payload: TriggerSuperPanelPayload) {
    try {
      translateSeq += 1;
      state.matchPlugins = [];
      state.translate = null;
      state.loading = false;
      refreshPreferences();

      const { text, fileUrl, optionPlugin = [] } = payload;
      state.selectedText = String(text ?? '');
      state.selectedFileUrl = fileUrl == null ? '' : String(fileUrl);
      const ext = pathMod.extname(fileUrl || '');
      state.fileUrl = (fileUrl ?? '') as string;

      if (fileUrl === null) {
        state.matchPlugins = [...commonPlugins];
        state.fileUrl = getDesktopPath();
        return;
      }

      if (!fileUrl && text) {
        collectTextPlugins(text, optionPlugin);
        runTranslate(text);
        return;
      }

      if (fileUrl && isExplorerLikeWindow(String(fileUrl))) {
        state.matchPlugins = [...commonPlugins];
        const desktopPath = getDesktopPath();
        state.fileUrl = desktopPath;
        state.selectedFileUrl = desktopPath;
        resolveCurrentFolder((folder) => {
          state.fileUrl = folder;
          state.selectedFileUrl = folder;
          nextTick(() => reportHeight());
        });
        return;
      }

      if (fileUrl && isDirectoryPath(String(fileUrl))) {
        const folder = normalizeFsPath(String(fileUrl));
        state.matchPlugins = [...commonPlugins];
        state.fileUrl = folder;
        state.selectedFileUrl = folder;
        return;
      }

      state.matchPlugins = [...selectedPlugins];
      state.fileUrl = String(fileUrl);
      collectFilePlugins(String(fileUrl), ext, optionPlugin);
    } finally {
      // 等 Vue 把本次 payload 刷进 DOM 并上报高度后再让主进程 show，避免先闪旧内容、再与 setSize 同步抖动
      nextTick(() => {
        reportHeight();
        setTimeout(() => {
          ipcRenderer.send('superPanel-content-applied');
        }, 48);
      });
    }
  }

  function togglePin() {
    pinned.value = !pinned.value;
    ipcRenderer.send('trigger-pin', pinned.value);
  }

  function hidePanel() {
    ipcRenderer.send('superPanel-hidden');
  }

  function showMainWindow() {
    ipcRenderer.send('msg-trigger', { type: 'showMainWindow' });
  }

  function openInstalled() {
    openPlugin({
      plugin: {
        name: 'flick-system-feature',
        main: 'index.html',
        preload: 'preload.js',
      },
      cmd: '已安装插件',
      feature: {
        code: '已安装插件',
        type: 'text',
        payload: 'flick 插件市场',
      },
    });
  }

  function runPluginClick(item: MatchPluginItem | UserPluginItem, ev?: Event) {
    hidePanel();
    item.click(ev);
  }

  const translate = computed(() => state.translate);
  const loading = computed(() => state.loading);
  const selectedText = computed(() => state.selectedText);
  const selectedFileUrl = computed(() => state.selectedFileUrl);
  const matchPlugins = computed(() => state.matchPlugins);
  const userPlugins = computed(() => state.userPlugins);

  function reportHeight() {
    const el = document.getElementById('app');
    if (!el) return;
    ipcRenderer.send('superPanel-setSize', parseInt(getComputedStyle(el).height, 10));
  }

  let offTrigger: (() => void) | undefined;
  let offPinState: (() => void) | undefined;
  let offPanelDismissed: (() => void) | undefined;

  onMounted(() => {
    refreshUserPlugins();
    refreshPreferences();
    const handler = (_e: Electron.IpcRendererEvent, payload: TriggerSuperPanelPayload) =>
      onTrigger(_e, payload);
    const pinStateHandler = (_e: Electron.IpcRendererEvent, pin: boolean) => {
      pinned.value = !!pin;
    };
    const dismissedHandler = () => cancelTranslateBecausePanelGone();
    ipcRenderer.on('trigger-super-panel', handler);
    ipcRenderer.on('superPanel-pin-state', pinStateHandler);
    ipcRenderer.on('super-panel-dismissed', dismissedHandler);
    offTrigger = () => ipcRenderer.removeListener('trigger-super-panel', handler);
    offPinState = () => ipcRenderer.removeListener('superPanel-pin-state', pinStateHandler);
    offPanelDismissed = () =>
      ipcRenderer.removeListener('super-panel-dismissed', dismissedHandler);
    ipcRenderer
      .invoke('superPanel-get-pin-state')
      .then((pin: unknown) => {
        pinned.value = !!pin;
      })
      .catch(() => {
        pinned.value = false;
      });
  });

  onUnmounted(() => {
    offTrigger?.();
    offPinState?.();
    offPanelDismissed?.();
  });

  watch(
    [matchPlugins, translate],
    () => {
      refreshUserPlugins();
      setTimeout(reportHeight, 50);
    },
    { deep: true }
  );

  return {
    state,
    pinned,
    translate,
    loading,
    selectedText,
    selectedFileUrl,
    matchPlugins,
    userPlugins,
    togglePin,
    showMainWindow,
    openInstalled,
    runPluginClick,
    reportHeight,
  };
}
