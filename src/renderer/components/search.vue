<template>
  <div class="flick-select">
    <div
      :class="clipboardFile[0].name ? 'clipboard-tag' : 'clipboard-img'"
      v-if="!!clipboardFile.length"
    >
      <img style="margin-right: 8px" :src="getIcon()" />
      <div class="ellipse">{{ clipboardFile[0].name }}</div>
      <a-tag color="#aaa" v-if="clipboardFile.length > 1">
        {{ clipboardFile.length }}
      </a-tag>
    </div>
    <div
      v-else
      class="search-context"
      :class="{ 'has-plugin': currentPlugin.cmd }"
    >
      <button
        class="logo-button"
        type="button"
        :aria-label="menuLabel"
        :title="menuLabel"
        @click="() => emit('openMenu')"
      >
        <img
          class="flick-logo"
          :src="searchLogoUrl"
          alt=""
          @error="logoLoadFailed = true"
        />
      </button>
      <div class="select-tag" v-show="currentPlugin.cmd">
        {{ currentPluginDisplayLabel }}
      </div>
      <button
        v-if="currentPlugin.cmd"
        class="context-close"
        type="button"
        :aria-label="exitPluginLabel"
        :title="exitPluginLabel"
        @mousedown.prevent
        @click="closeTag"
      >
        <CloseOutlined />
      </button>
    </div>
    <a-input
      id="search"
      ref="mainInput"
      class="main-input"
      @input="(e) => changeValue(e)"
      @keydown="handleKeydown"
      :value="searchValue"
      :placeholder="effectivePlaceholder"
      @focus="emit('focus')"
      :aria-label="searchLabel"
      autocomplete="off"
      :spellcheck="false"
    >
      <template #suffix>
        <div class="suffix-tool">
          <LoadingOutlined
            v-if="pluginLoading"
            class="status-icon loading-icon"
            :aria-label="loadingLabel"
          />
          <button
            v-if="searchValue"
            class="input-action"
            type="button"
            :aria-label="clearLabel"
            :title="clearLabel"
            @mousedown.prevent
            @click="emit('clearSearchValue')"
          >
            <CloseCircleFilled />
          </button>
          <span class="suffix-divider" aria-hidden="true"></span>
          <button
            class="input-action more-button"
            type="button"
            :aria-label="moreLabel"
            :title="moreLabel"
            @mousedown.prevent
            @click="showSeparate()"
          >
            <MoreOutlined />
          </button>
        </div>
      </template>
    </a-input>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  CloseCircleFilled,
  CloseOutlined,
  LoadingOutlined,
  MoreOutlined,
} from '@ant-design/icons-vue';
import fileIconUrl from '../assets/file.png';
import { normalizeDetachInputCapability } from '@/common/utils/detachInput';
import { resolveRecentPluginNavigation } from '../utils/recentPluginNavigation';

import localConfig from '../confOp';

const config: any = ref(localConfig.getConfig());
const clipboardIcon = ref('');

const isChinese = computed(() => config.value.perf.common.lang === 'zh-CN');
const text = (zh: string, en: string) => (isChinese.value ? zh : en);
const menuLabel = computed(() => text('打开 Flick 菜单', 'Open Flick menu'));
const moreLabel = computed(() => text('更多操作', 'More actions'));
const clearLabel = computed(() => text('清除搜索内容', 'Clear search'));
const exitPluginLabel = computed(() =>
  text('退出当前插件', 'Exit current plugin')
);
const loadingLabel = computed(() =>
  text('插件更新检测中', 'Checking plugin updates')
);
const searchLabel = computed(() =>
  text('搜索应用、插件或命令', 'Search apps, plugins, or commands')
);

type PluginItem = Record<string, any>;

const props = withDefaults(
  defineProps<{
    searchValue?: string | number;
    placeholder?: string;
    pluginHistory?: PluginItem[];
    currentPlugin?: PluginItem;
    pluginLoading?: boolean;
    clipboardFile?: PluginItem[];
    recentPluginNavigationEnabled?: boolean;
  }>(),
  {
    searchValue: '',
    placeholder: '',
    pluginHistory: () => [],
    currentPlugin: () => ({}),
    pluginLoading: false,
    clipboardFile: () => [],
    recentPluginNavigationEnabled: false,
  }
);

const currentPluginDisplayLabel = computed(() => {
  const pluginName =
    props.currentPlugin.originName || props.currentPlugin.name || '';
  if (pluginName === 'flick-system-feature') {
    return text('设置中心', 'Settings');
  }
  return props.currentPlugin.cmd;
});

const logoLoadFailed = ref(false);
const defaultLogoUrl = config.value.perf.custom.logoUrl;
const searchLogoUrl = computed(() =>
  logoLoadFailed.value
    ? defaultLogoUrl
    : props.currentPlugin.logoUrl || config.value.perf.custom.logoUrl
);

watch(
  () => [props.currentPlugin.logoUrl, config.value.perf.custom.logoUrl],
  () => {
    logoLoadFailed.value = false;
  }
);

const effectivePlaceholder = computed(() => {
  if (props.pluginLoading) {
    return text('正在检查插件更新…', 'Checking plugin updates…');
  }
  if (props.placeholder) return props.placeholder;
  const configured = config.value.perf.custom.placeholder;
  const legacyDefaults = [
    '你好，Flick！请输入插件关键词',
    'Hello, Flick! Please enter a plugin keyword',
  ];
  if (configured && !legacyDefaults.includes(configured)) return configured;
  return text('搜索应用、插件或命令…', 'Search apps, plugins, or commands…');
});

const changeValue = (e) => {
  // if (props.currentPlugin.name === 'flick-system-feature') return;
  targetSearch({ value: e.target.value });
  emit('onSearch', e);
};

const emit = defineEmits([
  'onSearch',
  'changeCurrent',
  'openMenu',
  'changeSelect',
  'choosePlugin',
  'focus',
  'clearSearchValue',
  'readClipboardContent',
  'clearClipbord',
]);

const keydownEvent = (e, key: string) => {
  e.preventDefault();
  const { ctrlKey, shiftKey, altKey, metaKey } = e;
  const modifiers: Array<string> = [];
  ctrlKey && modifiers.push('control');
  shiftKey && modifiers.push('shift');
  altKey && modifiers.push('alt');
  metaKey && modifiers.push('meta');
  window.flick.sendPluginKeyDown(e.code, modifiers);
  const runPluginDisable =
    (e.target.value === '' && !props.pluginHistory.length) ||
    props.currentPlugin.name;
  switch (key) {
    case 'up':
      emit('changeCurrent', -1);
      break;
    case 'down':
      emit('changeCurrent', 1);
      break;
    case 'left':
      emit('changeCurrent', -1);
      break;
    case 'right':
      emit('changeCurrent', 1);
      break;
    case 'enter':
      if (runPluginDisable) return;
      emit('choosePlugin');
      break;
    default:
      break;
  }
};

const checkNeedInit = (e) => {
  const { ctrlKey, metaKey } = e;

  // 输入已空时继续按 Backspace：仅在有插件上下文或剪贴板内容时才关闭，
  // 否则会反复 changeSelect({})，触发 currentPlugin 引用变化与 setExpendHeight，导致窗口高度异常变化。
  if (e.target.value === '' && e.keyCode === 8) {
    const hasPluginContext =
      props.currentPlugin?.name || props.currentPlugin?.cmd;
    const hasClipboard = !!props.clipboardFile?.length;
    if (hasPluginContext || hasClipboard) {
      void closeTag();
    }
  }
  // 手动粘贴
  if ((ctrlKey || metaKey) && e.key === 'v') {
    emit('readClipboardContent');
  }
};

const handleKeydown = (e) => {
  checkNeedInit(e);
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    if (
      e.target.value ||
      props.currentPlugin?.name ||
      props.clipboardFile.length
    ) {
      if (e.target.value) emit('clearSearchValue');
      else void closeTag();
    } else {
      window.flick.hideMainWindow();
    }
    return;
  }

  const recentPluginDirection = resolveRecentPluginNavigation({
    key: e.key,
    value: e.target.value,
    enabled: props.recentPluginNavigationEnabled,
    isComposing: e.isComposing,
    ctrlKey: e.ctrlKey,
    shiftKey: e.shiftKey,
    altKey: e.altKey,
    metaKey: e.metaKey,
  });
  if (recentPluginDirection) {
    e.preventDefault();
    emit('changeCurrent', recentPluginDirection);
    return;
  }

  const keyMap: Record<string, string> = {
    ArrowDown: 'down',
    ArrowUp: 'up',
    Enter: 'enter',
  };
  const key = e.key === 'Tab' ? (e.shiftKey ? 'up' : 'down') : keyMap[e.key];
  if (key) keydownEvent(e, key);
};

const targetSearch = ({ value }) => {
  if (props.currentPlugin.name) {
    return window.flick.sendSubInputChange(value);
  }
};

let closingPlugin = false;
const closeTag = async () => {
  if (closingPlugin) return;
  closingPlugin = true;
  try {
    await window.flick.removePlugin();
    emit('changeSelect', {});
    emit('clearClipbord');
  } finally {
    closingPlugin = false;
  }
};

const showSeparate = async () => {
  let pluginMenu: any[] = [
    {
      id: 'toggle-hide-on-blur',
      label: config.value.perf.common.hideOnBlur ? '钉住' : '自动隐藏',
    },
    {
      id: 'language',
      label:
        config.value.perf.common.lang === 'zh-CN'
          ? '切换语言'
          : 'Change Language',
      submenu: [
        {
          id: 'language-zh-CN',
          label: '简体中文',
        },
        {
          id: 'language-en-US',
          label: 'English',
        },
      ],
    },
  ];
  if (props.currentPlugin && props.currentPlugin.logoUrl) {
    const separateKey = config.value.perf.shortCut.separate || 'Ctrl+D';
    const name = props.currentPlugin.name;
    const canFileConfig = name && name !== 'flick-system-super-panel';
    const flickCfg = canFileConfig
      ? await window.flick.getPluginFlickConfig(name)
      : { autoDetach: false, detachInputPolicy: 'auto' };
    const autoDetachOn = !!flickCfg.autoDetach;
    const detachInputPolicy = flickCfg.detachInputPolicy ?? 'auto';
    const detachInputCapability = normalizeDetachInputCapability(
      props.currentPlugin.pluginSetting?.detach?.input
    );

    const pluginBlock: any[] = [
      {
        id: 'detach-plugin',
        label: '分离为独立窗口',
        accelerator: separateKey,
      },
      { type: 'separator' },
      {
        id: 'about-plugin',
        label: '关于插件应用',
      },
    ];
    const settingsSubmenu: any[] = [];
    if (canFileConfig) {
      settingsSubmenu.push({
        id: 'toggle-auto-detach',
        label: '自动分离为独立窗口',
        type: 'checkbox',
        checked: autoDetachOn,
      });
      if (detachInputCapability === 'optional') {
        settingsSubmenu.push({
          id: 'toggle-detach-input-policy',
          label: '始终显示标题栏输入框',
          type: 'checkbox',
          checked: detachInputPolicy === 'always',
        });
      } else if (detachInputCapability === 'required') {
        settingsSubmenu.push({
          label: '标题栏输入框（插件需要）',
          type: 'checkbox',
          checked: true,
          enabled: false,
        });
      }
    }
    if (canFileConfig && settingsSubmenu.length) {
      pluginBlock.push({
        label: '插件应用设置',
        submenu: settingsSubmenu,
      });
    }
    pluginBlock.push(
      { type: 'separator' },
      {
        id: 'hide-main-window',
        label: '退出到后台',
        accelerator: 'Escape',
      },
      {
        id: 'stop-plugin',
        label: '结束运行',
      },
      { type: 'separator' },
      {
        id: 'open-devtools',
        label: '开发者工具',
      }
    );
    pluginMenu = pluginMenu.concat(pluginBlock);
  }
  const action = await window.flick.showContextMenu(pluginMenu);
  const name = props.currentPlugin?.name;
  if (action === 'toggle-hide-on-blur') changeHideOnBlur();
  else if (action === 'language-zh-CN') changeLang('zh-CN');
  else if (action === 'language-en-US') changeLang('en-US');
  else if (action === 'detach-plugin') newWindow();
  else if (action === 'toggle-auto-detach' && name)
    await window.flick.flipPluginAutoDetach(name);
  else if (action === 'toggle-detach-input-policy' && name)
    await window.flick.flipPluginDetachInputPolicy(name);
  else if (action === 'hide-main-window') window.flick.hideMainWindow();
  else if (action === 'stop-plugin') await closeTag();
  else if (action === 'open-devtools') window.flick.openPluginDevTools();
  else if (action === 'about-plugin') {
    const p = props.currentPlugin;
    const lines = [
      p.pluginName || p.name,
      p.version ? `版本：${p.version}` : '',
      p.description || '',
    ].filter(Boolean);
    await window.flick.showMessageBox({
      title: '关于插件应用',
      message: lines[0] || p.name,
      detail: lines.slice(1).join('\n') || undefined,
    });
  }
};

const changeLang = (lang) => {
  const cfg = { ...config.value };
  cfg.perf.common.lang = lang;
  localConfig.setConfig(JSON.parse(JSON.stringify(cfg)));
  config.value = cfg;
};

const changeHideOnBlur = () => {
  const cfg = { ...config.value };
  cfg.perf.common.hideOnBlur = !cfg.perf.common.hideOnBlur;
  localConfig.setConfig(JSON.parse(JSON.stringify(cfg)));
  config.value = cfg;
};

const fallbackClipboardIcon = fileIconUrl;

const updateClipboardIcon = async () => {
  const current = props.clipboardFile?.[0];
  if (!current) {
    clipboardIcon.value = '';
    return;
  }
  if (current.dataUrl) {
    clipboardIcon.value = current.dataUrl;
    return;
  }
  if (!current.path) {
    clipboardIcon.value = fallbackClipboardIcon;
    return;
  }
  try {
    clipboardIcon.value =
      (await window.flick.getFileIcon(current.path)) || fallbackClipboardIcon;
  } catch {
    clipboardIcon.value = fallbackClipboardIcon;
  }
};

const getIcon = () => clipboardIcon.value || fallbackClipboardIcon;

watch(
  () => props.clipboardFile,
  () => {
    void updateClipboardIcon();
  },
  {
    deep: true,
    immediate: true,
  }
);

const newWindow = () => {
  window.flick.detachPlugin();
  // todo
};

const mainInput = ref(null);
window.flick.onShow(() => {
  (mainInput.value as unknown as HTMLDivElement).focus();
});

window.flick.onHide(() => {
  emit('clearSearchValue');
});
</script>

<style lang="less">
.flick-select {
  display: flex;
  padding: 0 10px 0 12px;
  background: var(--color-body-bg);
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  align-items: center;
  height: 60px;
  box-sizing: border-box;
  border-bottom: 1px solid transparent;
  z-index: 120;
  -webkit-app-region: drag;
  transition: border-color var(--motion-fast) ease;
  .ellipse {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200px;
  }
  .search-context {
    display: flex;
    align-items: center;
    flex: 0 0 auto;
    min-width: 40px;
    height: 44px;
    border-radius: var(--radius-lg);
    transition: background-color var(--motion-fast) ease;
    -webkit-app-region: no-drag;
    &.has-plugin {
      max-width: 300px;
      padding-right: 5px;
      background: var(--color-fill-subtle);
      border: 1px solid var(--color-border-subtle);
    }
  }
  .logo-button,
  .input-action,
  .context-close {
    border: 0;
    margin: 0;
    padding: 0;
    color: inherit;
    background: transparent;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    -webkit-app-region: no-drag;
  }
  .logo-button {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-md);
    transition: background-color var(--motion-fast) ease;
    &:hover {
      background: var(--color-fill-hover);
    }
    &:focus-visible {
      outline: 2px solid var(--color-focus-ring);
      outline-offset: 1px;
    }
  }
  .select-tag {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    user-select: none;
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-primary);
    max-width: 210px;
    margin: 0 5px 0 4px;
  }
  .context-close {
    width: 26px;
    height: 26px;
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
    &:hover {
      color: var(--color-text-primary);
      background: var(--color-fill-hover);
    }
  }

  .main-input {
    height: 40px !important;
    box-sizing: border-box;
    flex: 1;
    border: none;
    outline: none;
    box-shadow: none !important;
    background: var(--color-body-bg);
    padding: 0 0 0 10px;
    -webkit-app-region: no-drag;
    .ant-select-selection,
    .ant-input,
    .ant-select-selection__rendered {
      caret-color: var(--ant-primary-color);
      height: 100% !important;
      font-size: 17px;
      line-height: 24px;
      border: none !important;
      background: var(--color-body-bg);
      color: var(--color-text-primary);
    }
  }

  .flick-logo {
    width: 30px;
    height: 30px;
    object-fit: cover;
    border-radius: 9px;
  }
  .icon-tool {
    width: 40px;
    height: 40px;
    background: #574778;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 100%;
    img {
      width: 32px;
    }
  }
  .icon-tool {
    background: var(--color-input-hover);
  }
  .ant-input:focus {
    border: none;
    box-shadow: none;
  }
  .suffix-tool {
    display: flex;
    align-items: center;
    gap: 2px;
    height: 40px;
    .input-action,
    .status-icon {
      width: 32px;
      height: 32px;
      border-radius: var(--radius-md);
      font-size: 17px;
      color: var(--color-text-muted);
    }
    .input-action:hover {
      color: var(--color-text-primary);
      background: var(--color-fill-hover);
    }
    .input-action:focus-visible {
      outline: 2px solid var(--color-focus-ring);
      outline-offset: -1px;
    }
    .more-button {
      font-size: 21px;
    }
    .suffix-divider {
      width: 1px;
      height: 18px;
      margin: 0 4px;
      background: var(--color-border-subtle);
    }
    .loading-icon {
      color: var(--ant-primary-color);
    }
    .loading {
      color: var(--ant-primary-color);
      position: absolute;
      top: 0;
      left: 0;
    }
    .update-tips {
      position: absolute;
      right: 46px;
      top: 50%;
      font-size: 14px;
      transform: translateY(-50%);
      color: #aaa;
    }
  }
  .clipboard-tag {
    white-space: pre;
    user-select: none;
    font-size: 16px;
    height: 32px;
    position: relative;
    align-items: center;
    display: flex;
    border: 1px solid var(--color-border-subtle);
    padding: 0 8px;
    margin-right: 12px;
    border-radius: var(--radius-md);
    background: var(--color-fill-subtle);
    img {
      width: 24px;
      height: 24px;
      margin-right: 6px;
    }
  }
  .clipboard-img {
    white-space: pre;
    user-select: none;
    font-size: 16px;
    height: 32px;
    position: relative;
    align-items: center;
    display: flex;
    img {
      width: 32px;
      height: 32px;
    }
  }
}
</style>
