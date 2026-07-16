import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  watch,
} from 'vue';
import { flickDb } from './db';
import { openPlugin } from './open-plugin';
import { parseCmdRegex } from './cmd-regex';
import type {
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
const panel = window.superPanel;

function getDesktopPath(): string {
  return panel.getDesktopPath();
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

function extensionName(p: string): string {
  const clean = String(p || '').split(/[?#]/, 1)[0];
  const name = basenameWinOrMac(clean);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot) : '';
}

function normalizeLogo(raw: string): string {
  const value = String(raw || '');
  if (value.startsWith('file://')) {
    return `image://${value.slice('file://'.length)}`;
  }
  return value;
}

export function useSuperPanel() {
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
        void panel.openTerminal(normalizeFsPath(state.fileUrl));
      },
    },
    {
      type: 'default',
      name: '新建文件',
      logo: '',
      click: () => {
        void panel.createFile(normalizeFsPath(state.fileUrl));
      },
    },
    {
      type: 'default',
      name: '复制路径',
      logo: '',
      click: () => {
        panel.copyText(normalizeFsPath(state.fileUrl));
      },
    },
  ];

  const selectedPlugins: MatchPluginItem[] = [
    {
      type: 'default',
      name: '复制当前路径',
      logo: '',
      click: () => {
        panel.copyText(normalizeFsPath(state.fileUrl));
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
        const hasBasic = !!parsed?.basic?.explains?.filter((line) =>
          String(line || '').trim()
        ).length;
        const hasTranslation = !!parsed?.translation?.filter((line) =>
          String(line || '').trim()
        ).length;
        state.translate =
          hasBasic || hasTranslation ? { ...parsed, src: visibleWord } : null;
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
          if (
            cmd.type === 'regex' &&
            cmd.match &&
            parseCmdRegex(cmd.match).test(text)
          ) {
            state.matchPlugins.push({
              type: 'ext',
              name: cmd.label || feature.code,
              logo: normalizeLogo(plugin.logo),
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
              logo: normalizeLogo(plugin.logo),
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

  function collectFilePlugins(
    fileUrl: string,
    ext: string,
    selectedFileDataUrl: string,
    optionPlugin: OptionPlugin[]
  ) {
    const imgRe = /\.(png|jpg|gif|jpeg|webp)$/i;
    for (const plugin of optionPlugin) {
      for (const feature of plugin.features) {
        for (const cmd of feature.cmds) {
          if (cmd.type === 'img' && imgRe.test(ext) && selectedFileDataUrl) {
            state.matchPlugins.unshift({
              type: 'ext',
              name: cmd.label || feature.code,
              logo: normalizeLogo(plugin.logo),
              click: () => {
                openPlugin({
                  plugin: plugin as unknown as Record<string, unknown>,
                  feature,
                  cmd,
                  data: selectedFileDataUrl,
                });
              },
            });
          }
          if (
            cmd.type === 'file' &&
            cmd.match &&
            parseCmdRegex(cmd.match).test(ext)
          ) {
            state.matchPlugins.unshift({
              type: 'ext',
              name: cmd.label || feature.code,
              logo: normalizeLogo(plugin.logo),
              click: () =>
                openPlugin({
                  plugin: plugin as unknown as Record<string, unknown>,
                  feature,
                  cmd,
                  data: {
                    isFile: true,
                    isDirectory: false,
                    name: basenameWinOrMac(fileUrl),
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
      logo: normalizeLogo(row.logo),
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
    if (panel.platform === 'darwin' || panel.platform === 'win32') {
      panel.getCurrentFolder().then((data) => {
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

      const {
        text,
        fileUrl,
        optionPlugin = [],
        selectedFileIsDirectory = false,
        selectedFileDataUrl = '',
      } = payload;
      state.selectedText = String(text ?? '');
      state.selectedFileUrl = fileUrl == null ? '' : String(fileUrl);
      const ext = extensionName(fileUrl || '');
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

      if (fileUrl && selectedFileIsDirectory) {
        const folder = normalizeFsPath(String(fileUrl));
        state.matchPlugins = [...commonPlugins];
        state.fileUrl = folder;
        state.selectedFileUrl = folder;
        return;
      }

      state.matchPlugins = [...selectedPlugins];
      state.fileUrl = String(fileUrl);
      collectFilePlugins(
        String(fileUrl),
        ext,
        selectedFileDataUrl,
        optionPlugin
      );
    } finally {
      // 等 Vue 把本次 payload 刷进 DOM 并上报高度后再让主进程 show，避免先闪旧内容、再与 setSize 同步抖动
      nextTick(() => {
        reportHeight();
        setTimeout(() => {
          panel.contentApplied();
        }, 48);
      });
    }
  }

  function togglePin() {
    pinned.value = !pinned.value;
    panel.setPinned(pinned.value);
  }

  function hidePanel() {
    panel.hide();
  }

  function showMainWindow() {
    panel.showMainWindow();
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
    panel.setHeight(parseInt(getComputedStyle(el).height, 10));
  }

  let offTrigger: (() => void) | undefined;
  let offPinState: (() => void) | undefined;
  let offPanelDismissed: (() => void) | undefined;

  onMounted(() => {
    refreshUserPlugins();
    refreshPreferences();
    offTrigger = panel.onTrigger((payload) =>
      onTrigger(null, payload as TriggerSuperPanelPayload)
    );
    offPinState = panel.onPinState((pin) => {
      pinned.value = pin;
    });
    offPanelDismissed = panel.onDismissed(cancelTranslateBecausePanelGone);
    panel
      .getPinState()
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
