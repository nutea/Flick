<template>
  <div id="components-layout">
    <Search
      :currentPlugin="currentPlugin"
      @changeCurrent="changeIndex"
      @onSearch="onSearch"
      @openMenu="openMenu"
      @changeSelect="changeSelect"
      :searchValue="searchValue"
      :placeholder="placeholder"
      :pluginLoading="pluginLoading"
      :pluginHistory="pluginHistory"
      :clipboardFile="clipboardFile || []"
      :recentPluginNavigationEnabled="recentPluginNavigationEnabled"
      @choosePlugin="choosePlugin"
      @focus="searchFocus"
      @clear-search-value="clearSearchValue"
      @clearClipbord="clearClipboardFile"
      @readClipboardContent="readClipboardContent"
    />
    <Result
      :pluginHistory="pluginHistory"
      :currentPlugin="currentPlugin"
      :searchValue="searchValue"
      :currentSelect="currentSelect"
      :keyboardNavigation="keyboardNavigation"
      :options="visibleOptions"
      :clipboardFile="clipboardFile || []"
      @setPluginHistory="setPluginHistory"
      @choosePlugin="choosePlugin"
      @selectIndex="setCurrentSelect"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, watch, ref, toRaw, nextTick } from 'vue';
import Result from './components/result.vue';
import Search from './components/search.vue';
import getWindowHeight from '../common/utils/getWindowHeight';
import createPluginManager from './plugins-manager';
import { PLUGIN_HISTORY } from '@/common/constans/renderer';
import { message } from 'ant-design-vue';
import debounce from 'lodash.debounce';
import localConfig from './confOp';

const {
  initPlugins,
  getBuiltinPlugin,
  options,
  onSearch,
  searchValue,
  changeSelect,
  openPlugin,
  currentPlugin,
  placeholder,
  pluginLoading,
  searchFocus,
  clipboardFile,
  setSearchValue,
  clearClipboardFile,
  readClipboardContent,
  pluginHistory,
  setPluginHistory,
  changePluginHistory,
} = createPluginManager();

initPlugins();

const currentSelect = ref(0);
const keyboardNavigation = ref(true);
const menuPluginInfo: any = ref({});

const config: any = ref(localConfig.getConfig());

const visibleOptions = computed(() =>
  [...options.value]
    .sort((a, b) => (Number(b.zIndex) || 0) - (Number(a.zIndex) || 0))
    .slice(0, 20)
);

const visibleHistory = computed(() => pluginHistory.value.slice(0, 8));

const recentPluginNavigationEnabled = computed(
  () =>
    !currentPlugin.value.name &&
    String(searchValue.value ?? '').length === 0 &&
    !clipboardFile.value?.length &&
    config.value.perf.common.history &&
    !visibleOptions.value.length &&
    visibleHistory.value.length > 0
);

getBuiltinPlugin('flick-system-feature').then((res) => {
  menuPluginInfo.value = res;
});

getBuiltinPlugin('flick-system-super-panel');

const calcLauncherHeight = () =>
  getWindowHeight(
    visibleOptions.value,
    pluginLoading.value || !config.value.perf.common.history
      ? []
      : pluginHistory.value,
    {
      searchValue: searchValue.value,
      clipboardFileLength: clipboardFile.value?.length ?? 0,
      historyEnabled: config.value.perf.common.history,
    }
  );

let heightApplyToken = 0;
let lastCommittedLauncherHeight = 0;

const applyHeightAfterPaint = async () => {
  if (currentPlugin.value.name) {
    lastCommittedLauncherHeight = 0;
    return;
  }
  const token = ++heightApplyToken;
  await nextTick();
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
  if (token !== heightApplyToken || currentPlugin.value.name) return;
  const height = calcLauncherHeight();
  if (height === lastCommittedLauncherHeight) return;
  lastCommittedLauncherHeight = height;
  window.flick.setExpendHeight(height);
};

const flushExpendHeight = debounce(() => {
  void applyHeightAfterPaint();
}, 16);

const flushEmptySearchHeight = debounce(() => {
  void applyHeightAfterPaint();
}, 120);

window.refreshLauncherHeight = () => {
  lastCommittedLauncherHeight = 0;
  flushEmptySearchHeight.cancel();
  flushExpendHeight.cancel();
  void applyHeightAfterPaint();
};

watch(
  [
    options,
    pluginHistory,
    currentPlugin,
    clipboardFile,
    () => config.value.perf.common.history,
  ],
  () => {
    currentSelect.value = 0;
    keyboardNavigation.value = true;
    flushEmptySearchHeight.cancel();
    flushExpendHeight();
  },
  {
    immediate: true,
    flush: 'post',
  }
);

watch(
  searchValue,
  () => {
    currentSelect.value = 0;
    keyboardNavigation.value = true;
    if (currentPlugin.value.name) return;
    if (!searchValue.value) {
      flushEmptySearchHeight.cancel();
      flushExpendHeight();
      return;
    }
    if (options.value.length) {
      flushEmptySearchHeight.cancel();
      flushExpendHeight();
      return;
    }
    flushEmptySearchHeight();
  },
  { flush: 'post' }
);

const changeIndex = (index) => {
  const len = visibleOptions.value.length
    ? visibleOptions.value.length
    : recentPluginNavigationEnabled.value
      ? visibleHistory.value.length
      : 0;
  if (!len) return;
  keyboardNavigation.value = true;
  if (currentSelect.value + index > len - 1) {
    currentSelect.value = 0;
  } else if (currentSelect.value + index < 0) {
    currentSelect.value = len - 1;
  } else {
    currentSelect.value = currentSelect.value + index;
  }
};

const setCurrentSelect = (index: number) => {
  const len = visibleOptions.value.length
    ? visibleOptions.value.length
    : recentPluginNavigationEnabled.value
      ? visibleHistory.value.length
      : 0;
  if (!Number.isInteger(index) || index < 0 || index >= len) return;
  keyboardNavigation.value = false;
  currentSelect.value = index;
};

const openMenu = (ext) => {
  openPlugin({
    ...toRaw(menuPluginInfo.value),
    feature: menuPluginInfo.value.features[0],
    cmd: '设置中心',
    ext,
    click: () => openMenu(ext),
  });
};

window.flick.onOpenMenu(openMenu);

const choosePlugin = async (plugin) => {
  if (visibleOptions.value.length) {
    const currentChoose = visibleOptions.value[currentSelect.value];
    currentChoose?.click();
  } else {
    const localPlugins = window.flick.getLocalPlugins();
    const currentChoose =
      plugin ||
      (recentPluginNavigationEnabled.value
        ? visibleHistory.value[currentSelect.value]
        : undefined);
    if (!currentChoose) return;
    let hasRemove = true;
    if (currentChoose.pluginType === 'app') {
      hasRemove = false;
      changePluginHistory(currentChoose);
      void window.flick.launchApp(currentChoose.desc).catch(() => {
        message.error('启动应用出错，请确保启动应用存在！');
      });
      return;
    }
    localPlugins.find((plugin) => {
      if (plugin.name === currentChoose.originName) {
        hasRemove = false;
        return true;
      }
      return false;
    });
    if (hasRemove) {
      const result = window.flick.db.get(PLUGIN_HISTORY) || {};
      const history = result.data.filter(
        (item) => item.originName !== currentChoose.originName
      );
      setPluginHistory(history);
      return message.warning('插件已被卸载！');
    }
    changePluginHistory(currentChoose);
    try {
      await window.flick.openPlugin(
        JSON.parse(
          JSON.stringify({
            ...currentChoose,
            ext: {
              code: currentChoose.feature.code,
              type: currentChoose.cmd.type || 'text',
              payload: null,
            },
          })
        )
      );
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : '插件启动失败，请重试'
      );
    }
  }
};

const clearSearchValue = () => {
  setSearchValue('');
};
</script>

<style lang="less">
@import './assets/var.less';
html,
body,
#app {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;
}

body {
  background: var(--color-body-bg);
  user-select: none;
}

input,
textarea {
  user-select: text;
}

button,
input {
  font: inherit;
}

#components-layout {
  height: 100vh;
  overflow: hidden;
  background: var(--color-body-bg);
  color: var(--color-text-content);
  font-family:
    Inter,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    'PingFang SC',
    'Microsoft YaHei',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  border: 1px solid var(--color-border-subtle);
  box-sizing: border-box;
  ::-webkit-scrollbar {
    width: 0;
  }
  &.drag {
    -webkit-app-region: drag;
  }
}
</style>
