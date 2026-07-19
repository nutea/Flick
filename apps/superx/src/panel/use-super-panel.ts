import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue';
import { flickDb } from './db';
import { openPlugin } from './open-plugin';
import { matchesFileCommand, toPluginFilePayload } from './file-selection';
import { matchesTextCommand, normalizeSelectionText } from './text-selection';
import {
  commandMatchKey,
  matchRuleOverrideId,
  normalizeMatchRulesDocument,
  SUPER_PANEL_MATCH_RULES_DB_ID,
  type SuperPanelMatchRuleOverride,
} from '../../../shared/super-panel-match-rules';
import type {
  CmdItem,
  FeatureItem,
  MatchPluginItem,
  OptionPlugin,
  SelectedFileItem,
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

const SUPER_PANEL_PREF_DB_ID = 'flick-system-super-panel-preferences';
const panel = window.superPanel;

function basenameWinOrMac(p: string): string {
  const seg = p.split(/[/\\]/);
  return seg[seg.length - 1] || '';
}

function normalizeFsPath(p: string): string {
  return String(p || '')
    .replace(/^file:\/\//, '')
    .trim();
}

function extensionName(p: string): string {
  const clean = String(p || '').split(/[?#]/, 1)[0];
  const name = basenameWinOrMac(clean);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot) : '';
}

export function useSuperPanel() {
  const pinned = ref(false);
  let activeRequestId = 0;
  let layoutObserver: ResizeObserver | undefined;
  let layoutFrame = 0;
  let lastReportedRequestId = 0;
  let lastReportedHeight = 0;

  /** 翻译请求代数：面板关闭或新一轮 trigger 时递增，防止旧请求完成后写回 state */
  let translateSeq = 0;

  const state = reactive({
    translate: null as TranslateState | null,
    loading: false,
    fileUrl: '',
    selectedText: '',
    selectedFileUrl: '',
    selectedFiles: [] as SelectedFileItem[],
    selectedFileIsDirectory: false,
    autoTranslate: false,
    /** 选中文本超过该长度则不发起翻译（与偏好 `translateMaxChars` 一致，默认 2000） */
    translateMaxChars: 2000,
    translatePrefs: {} as SuperPanelTranslatePrefs,
    matchPlugins: [] as MatchPluginItem[],
    userPlugins: [] as UserPluginItem[],
  });
  let matchRuleOverrides = new Map<string, SuperPanelMatchRuleOverride>();

  const commonPlugins: MatchPluginItem[] = [
    {
      type: 'default',
      name: '终端打开',
      logo: '',
      icon: 'terminal',
      click: () => {
        void panel.openTerminal(normalizeFsPath(state.fileUrl));
      },
    },
    {
      type: 'default',
      name: '新建文件',
      logo: '',
      icon: 'create-file',
      click: () => {
        void panel.createFile(normalizeFsPath(state.fileUrl));
      },
    },
    {
      type: 'default',
      name: '复制路径',
      logo: '',
      icon: 'copy',
      click: () => {
        panel.copyText(state.selectedFiles.map((file) => file.path).join('\n'));
      },
    },
  ];

  const selectedPlugins: MatchPluginItem[] = [
    {
      type: 'default',
      name: '复制路径',
      logo: '',
      icon: 'copy',
      click: () => {
        panel.copyText(state.selectedFiles.map((file) => file.path).join('\n'));
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
    const visibleWord = normalizeSelectionText(word);
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

  interface PluginCandidate {
    key: string;
    priority: number;
    order: number;
    item: MatchPluginItem;
  }

  function isCommandObject(cmd: string | CmdItem): cmd is CmdItem {
    return !!cmd && typeof cmd === 'object' && typeof cmd.type === 'string';
  }

  function refreshMatchRuleOverrides() {
    const document = normalizeMatchRulesDocument(
      flickDb.get(SUPER_PANEL_MATCH_RULES_DB_ID)
    );
    matchRuleOverrides = new Map(document.data.map((row) => [row.id, row]));
  }

  function effectiveCommand(
    pluginName: string,
    featureCode: string,
    command: CmdItem,
    commandIndex: number
  ): CmdItem {
    const key = commandMatchKey(command, commandIndex);
    const override = matchRuleOverrides.get(
      matchRuleOverrideId(pluginName, featureCode, key)
    );
    if (!override) return command;
    return {
      ...command,
      ...(typeof override.priority === 'number'
        ? { priority: override.priority }
        : {}),
      matchRules: {
        ...(command.matchRules || {}),
        ...override.matchRules,
      },
    };
  }

  function collectCandidates(
    optionPlugin: OptionPlugin[],
    matchCommand: (cmd: CmdItem) => boolean,
    payloadForCommand: (cmd: CmdItem) => unknown
  ): MatchPluginItem[] {
    const candidates: PluginCandidate[] = [];
    let order = 0;
    for (const plugin of optionPlugin) {
      const features = Array.isArray(plugin?.features) ? plugin.features : [];
      for (const feature of features) {
        const commands = Array.isArray(feature?.cmds) ? feature.cmds : [];
        for (const [commandIndex, sourceCommand] of commands.entries()) {
          if (!isCommandObject(sourceCommand)) continue;
          const cmd = effectiveCommand(
            plugin.name,
            feature.code,
            sourceCommand,
            commandIndex
          );
          if (cmd.matchRules?.enabled === false || !matchCommand(cmd)) continue;
          const name = cmd.label || feature.code;
          candidates.push({
            key: `${plugin.name}\u0000${feature.code}\u0000${name}`,
            priority:
              typeof cmd.priority === 'number' && Number.isFinite(cmd.priority)
                ? cmd.priority
                : 0,
            order: order++,
            item: {
              type: 'ext',
              name,
              logo: plugin.logoUrl || plugin.logo,
              click: () =>
                openPlugin({
                  plugin: plugin as unknown as Record<string, unknown>,
                  feature,
                  cmd,
                  data: payloadForCommand(cmd),
                }),
            },
          });
        }
      }
    }
    candidates.sort((a, b) => b.priority - a.priority || a.order - b.order);
    const seen = new Set<string>();
    return candidates
      .filter((candidate) => {
        if (seen.has(candidate.key)) return false;
        seen.add(candidate.key);
        return true;
      })
      .map((candidate) => candidate.item);
  }

  function collectTextPlugins(
    text: string,
    optionPlugin: OptionPlugin[]
  ): MatchPluginItem[] {
    return collectCandidates(
      optionPlugin,
      (cmd) => matchesTextCommand(cmd, text),
      () => text
    );
  }

  function collectFilePlugins(
    files: SelectedFileItem[],
    selectedFileDataUrl: string,
    optionPlugin: OptionPlugin[]
  ): MatchPluginItem[] {
    const imgRe = /\.(png|jpg|gif|jpeg|webp)$/i;
    const singleFile = files.length === 1 ? files[0] : null;
    const pluginPayload = toPluginFilePayload(files);
    return collectCandidates(
      optionPlugin,
      (cmd) =>
        (cmd.type === 'img' &&
          !!singleFile?.isFile &&
          imgRe.test(singleFile.extension) &&
          !!selectedFileDataUrl) ||
        matchesFileCommand(cmd, files),
      (cmd) => (cmd.type === 'img' ? selectedFileDataUrl : pluginPayload)
    );
  }

  let currentPluginLogos = new Map<string, string>();

  function refreshUserPlugins(optionPlugins?: OptionPlugin[]) {
    if (optionPlugins) {
      currentPluginLogos = new Map(
        optionPlugins
          .filter((plugin) => plugin.name && (plugin.logoUrl || plugin.logo))
          .map((plugin) => [plugin.name, plugin.logoUrl || plugin.logo])
      );
    }
    const doc = flickDb.get('super-panel-user-plugins') as {
      data?: UserPluginItem[];
    } | null;
    if (!doc?.data) {
      state.userPlugins = [];
      return;
    }
    state.userPlugins = doc.data.map((row) => ({
      ...row,
      logo: (row.name && currentPluginLogos.get(row.name)) || row.logo,
      click: () =>
        openPlugin({
          plugin: row as unknown as Record<string, unknown>,
          feature: row.ext as FeatureItem,
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

  function onTrigger(_e: unknown, payload: TriggerSuperPanelPayload) {
    try {
      activeRequestId = payload.requestId;
      lastReportedRequestId = 0;
      lastReportedHeight = 0;
      translateSeq += 1;
      state.matchPlugins = [];
      state.translate = null;
      state.loading = false;
      refreshPreferences();
      refreshMatchRuleOverrides();
      const {
        text,
        fileUrl,
        fileUrls = [],
        selectedFiles = [],
        optionPlugin = [],
        selectedFileIsDirectory = false,
        selectedFileDataUrl = '',
      } = payload;
      refreshUserPlugins(optionPlugin);
      const normalizedFiles = selectedFiles
        .filter(
          (file): file is SelectedFileItem =>
            !!file && typeof file.path === 'string' && !!file.path.trim()
        )
        .map((file) => ({
          path: normalizeFsPath(file.path),
          name: file.name || basenameWinOrMac(file.path),
          extension: file.extension || extensionName(file.path),
          isFile: file.isFile === true,
          isDirectory: file.isDirectory === true,
        }));
      if (normalizedFiles.length === 0) {
        const legacyPaths = fileUrls.length
          ? fileUrls
          : fileUrl
            ? [String(fileUrl)]
            : [];
        normalizedFiles.push(
          ...legacyPaths.map((rawPath, index) => ({
            path: normalizeFsPath(rawPath),
            name: basenameWinOrMac(rawPath),
            extension: extensionName(rawPath),
            isFile: index > 0 || selectedFileIsDirectory !== true,
            isDirectory: index === 0 && selectedFileIsDirectory === true,
          }))
        );
      }
      state.selectedFiles = normalizedFiles;
      state.selectedText = String(text ?? '');
      state.selectedFileUrl = normalizedFiles[0]?.path || '';
      state.selectedFileIsDirectory =
        normalizedFiles.length === 1 && normalizedFiles[0].isDirectory;
      state.fileUrl = normalizedFiles[0]?.path || '';

      if (normalizedFiles.length === 0 && text) {
        state.matchPlugins = collectTextPlugins(text, optionPlugin);
        runTranslate(text);
        return;
      }

      if (normalizedFiles.length === 0 && !text) {
        state.fileUrl = '';
        state.selectedFileUrl = '';
        return;
      }

      if (normalizedFiles.length === 1 && normalizedFiles[0].isDirectory) {
        const folder = normalizedFiles[0].path;
        state.matchPlugins = [
          ...collectFilePlugins(
            normalizedFiles,
            selectedFileDataUrl,
            optionPlugin
          ),
          ...commonPlugins,
        ];
        state.fileUrl = folder;
        state.selectedFileUrl = folder;
        return;
      }

      state.matchPlugins = [
        ...collectFilePlugins(
          normalizedFiles,
          selectedFileDataUrl,
          optionPlugin
        ),
        ...selectedPlugins,
      ];
    } finally {
      const requestId = payload.requestId;
      nextTick(() => {
        if (requestId !== activeRequestId) return;
        reportLayout();
        panel.contentApplied(requestId);
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
  const selectedFiles = computed(() => state.selectedFiles);
  const selectedFileIsDirectory = computed(() => state.selectedFileIsDirectory);
  const matchPlugins = computed(() => state.matchPlugins);
  const userPlugins = computed(() => state.userPlugins);

  function reportLayout() {
    const el = document.querySelector<HTMLElement>('.main');
    if (!el || activeRequestId < 1) return;
    const height = Math.max(50, Math.ceil(el.getBoundingClientRect().height));
    if (
      lastReportedRequestId === activeRequestId &&
      lastReportedHeight === height
    )
      return;
    lastReportedRequestId = activeRequestId;
    lastReportedHeight = height;
    panel.reportLayout({
      requestId: activeRequestId,
      height,
    });
  }

  function scheduleLayoutReport() {
    if (layoutFrame) cancelAnimationFrame(layoutFrame);
    layoutFrame = requestAnimationFrame(() => {
      layoutFrame = 0;
      reportLayout();
    });
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
    const app = document.querySelector<HTMLElement>('.main');
    if (app) {
      layoutObserver = new ResizeObserver(scheduleLayoutReport);
      layoutObserver.observe(app);
    }
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
    layoutObserver?.disconnect();
    if (layoutFrame) cancelAnimationFrame(layoutFrame);
  });

  return {
    state,
    pinned,
    translate,
    loading,
    selectedText,
    selectedFileUrl,
    selectedFiles,
    selectedFileIsDirectory,
    matchPlugins,
    userPlugins,
    togglePin,
    showMainWindow,
    openInstalled,
    runPluginClick,
    reportLayout,
  };
}
