<template>
  <div :class="[platform, 'detach']">
    <div class="info">
      <img :src="plugInfo.logo" />
      <input
        autofocus
        @input="changeValue"
        v-if="showInput"
        :value="plugInfo.subInput?.value"
        :placeholder="plugInfo.subInput?.placeholder"
      />
      <span v-else>{{ plugInfo.pluginName }}</span>
    </div>
    <div class="handle-container">
      <div class="handle">
        <div
          class="plugin-menu-btn"
          role="button"
          tabindex="0"
          aria-label="插件菜单"
          @click.stop="openPluginMenu"
          @keydown.enter.stop="openPluginMenu"
          @keydown.space.prevent.stop="openPluginMenu"
          title="菜单"
        >
          <span class="plugin-menu-icon">
            <i></i>
            <i></i>
            <i></i>
          </span>
        </div>
        <div
          class="devtool"
          role="button"
          tabindex="0"
          aria-label="切换插件开发者工具"
          :class="{ active: devToolsActive }"
          @click.stop="toggleDevTools"
          @keydown.enter.stop="toggleDevTools"
          @keydown.space.prevent.stop="toggleDevTools"
          :title="devToolsActive ? '关闭开发者工具' : '开发者工具'"
        ></div>
        <div
          class="pin"
          role="button"
          tabindex="0"
          aria-label="切换窗口置顶"
          :class="{ active: pinned }"
          @click.stop="togglePin"
          @keydown.enter.stop="togglePin"
          @keydown.space.prevent.stop="togglePin"
          :title="pinned ? '取消固定' : '固定在最前'"
        ></div>
      </div>
      <div class="window-handle" v-if="platform !== 'darwin'">
        <div
          class="minimize"
          role="button"
          tabindex="0"
          aria-label="最小化"
          @click="minimize"
          @keydown.enter="minimize"
        ></div>
        <div
          class="maximize"
          role="button"
          tabindex="0"
          aria-label="最大化或还原"
          @click="maximize"
          @keydown.enter="maximize"
        ></div>
        <div
          class="close"
          role="button"
          tabindex="0"
          aria-label="关闭"
          @click="close"
          @keydown.enter="close"
        ></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import throttle from 'lodash.throttle';
import { ref } from 'vue';

const api = window.detach;
const platform = api.platform;

const pinned = ref(false);
/** 插件 BrowserView 的开发者工具是否打开（与壳页无关） */
const devToolsActive = ref(false);
const showInput = ref(false);
const detachAlwaysShowSearch = ref(false);

const storeInfo = localStorage.getItem('flick-system-detach') || '{}';
const plugInfo = ref({});

function pinStorageKey() {
  return `flick-detach-pin:${plugInfo.value.name || 'default'}`;
}

function syncDetachAlwaysOnTop() {
  void api.setPinned(pinned.value);
}

function loadPinFromStorage() {
  try {
    pinned.value = localStorage.getItem(pinStorageKey()) === '1';
  } catch {
    pinned.value = false;
  }
  syncDetachAlwaysOnTop();
}

function togglePin() {
  pinned.value = !pinned.value;
  try {
    localStorage.setItem(pinStorageKey(), pinned.value ? '1' : '0');
  } catch {
    /* ignore */
  }
  syncDetachAlwaysOnTop();
}

/** BrowserView 在 ready-to-show 后才挂上，壳脚本可能早于此时执行 */
function scheduleDevToolsListenerSetup() {
  let attempts = 0;
  const tick = () => {
    void api.getDevToolsState().then((opened) => {
      devToolsActive.value = opened;
      if (!opened && ++attempts < 10) setTimeout(tick, 100);
    });
  };
  setTimeout(tick, 0);
}

function toggleDevTools() {
  void api.toggleDevTools().then((opened) => {
    devToolsActive.value = opened;
  });
}

api.onDevToolsState((opened) => {
  devToolsActive.value = opened;
});

api.onAlwaysShowSearch((enabled) => {
  detachAlwaysShowSearch.value = enabled;
  ensureSubInputStubWhenAlwaysShow();
  updateShowInputFromState();
});

function ensureSubInputStubWhenAlwaysShow() {
  if (detachAlwaysShowSearch.value && !plugInfo.value.subInput) {
    plugInfo.value.subInput = { value: '', placeholder: '' };
  }
}

function updateShowInputFromState() {
  if (detachAlwaysShowSearch.value) {
    ensureSubInputStubWhenAlwaysShow();
    showInput.value = true;
    return;
  }
  const si = plugInfo.value.subInput;
  showInput.value = !!(si && (!!si.value || !!si.placeholder));
}

window.initDetach = (pluginInfo) => {
  if (
    typeof pluginInfo.logo === 'string' &&
    pluginInfo.logo.startsWith('file://')
  ) {
    pluginInfo.logo = `image://${pluginInfo.logo.slice('file://'.length)}`;
  }
  plugInfo.value = pluginInfo;
  detachAlwaysShowSearch.value = !!pluginInfo.detachAlwaysShowSearch;
  if (detachAlwaysShowSearch.value && !plugInfo.value.subInput) {
    plugInfo.value.subInput = { value: '', placeholder: '' };
  }
  showInput.value =
    detachAlwaysShowSearch.value ||
    (pluginInfo.subInput &&
      (!!pluginInfo.subInput.value || !!pluginInfo.subInput.placeholder));
  localStorage.setItem('flick-system-detach', JSON.stringify(pluginInfo));
  loadPinFromStorage();
  scheduleDevToolsListenerSetup();
};

try {
  window.initDetach(JSON.parse(storeInfo));
} catch (e) {
  // ...
}

const changeValue = throttle((e) => {
  api.sendInput(e.target.value);
}, 500);

const openPluginMenu = async () => {
  const { name, pluginName, version, description } = plugInfo.value;
  await api.openPluginMenu({ name, pluginName, version, description });
};

const minimize = () => {
  api.windowAction('minimize');
};

const maximize = () => {
  api.windowAction('maximize');
};

const close = () => {
  api.windowAction('close');
};

Object.assign(window, {
  setSubInputValue: ({ value }) => {
    if (!plugInfo.value.subInput) plugInfo.value.subInput = {};
    plugInfo.value.subInput.value = value;
    updateShowInputFromState();
  },
  setSubInput: (payload) => {
    const placeholder =
      payload != null && typeof payload === 'object' && 'placeholder' in payload
        ? payload.placeholder
        : payload;
    if (!plugInfo.value.subInput) plugInfo.value.subInput = {};
    plugInfo.value.subInput.placeholder =
      placeholder != null ? String(placeholder) : '';
    updateShowInputFromState();
  },
  removeSubInput: () => {
    plugInfo.value.subInput = null;
    updateShowInputFromState();
  },
});

window.enterFullScreenTrigger = () => {
  document.querySelector('.detach').classList.remove('darwin');
};
window.leaveFullScreenTrigger = () => {
  const titleDom = document.querySelector('.detach');
  if (!titleDom.classList.contains('darwin')) {
    titleDom.classList.add('darwin');
  }
};

window.maximizeTrigger = () => {
  const btnMaximize = document.querySelector('.maximize');
  if (!btnMaximize || btnMaximize.classList.contains('unmaximize')) return;
  btnMaximize.classList.add('unmaximize');
};

window.unmaximizeTrigger = () => {
  const btnMaximize = document.querySelector('.maximize');
  if (!btnMaximize) return;
  btnMaximize.classList.remove('unmaximize');
};

if (platform === 'darwin') {
  window.onkeydown = (e) => {
    if (e.code === 'Escape') {
      api.windowAction('endFullScreen');
      return;
    }
    if (e.metaKey && (e.code === 'KeyW' || e.code === 'KeyQ')) {
      api.windowAction('close');
    }
  };
} else {
  window.onkeydown = (e) => {
    if (e.ctrlKey && e.code === 'KeyW') {
      api.windowAction('close');
      return;
    }
  };
}
</script>

<style>
html,
body {
  margin: 0;
  padding: 0;
  font-family:
    system-ui, 'PingFang SC', 'Helvetica Neue', 'Microsoft Yahei', sans-serif;
  user-select: none;
  overflow: hidden;
}

.detach {
  width: 100%;
  height: 50px;
  display: flex;
  align-items: center;
  color: var(--color-text-primary);
}

.detach {
  flex: 1;
  display: flex;
  align-items: center;
  font-size: 18px;
  padding-left: 10px;
  font-weight: 500;
  box-sizing: border-box;
  justify-content: space-between;
}

.detach.darwin {
  padding-left: 80px;
  -webkit-app-region: drag;
}

.detach.win32 {
  -webkit-app-region: drag;
}

.detach img {
  width: 36px;
  height: 36px;
  margin-right: 10px;
}

.detach input {
  background-color: var(--color-body-bg);
  color: var(--color-text-primary);
  width: 360px;
  height: 36px;
  line-height: 36px;
  border-radius: 4px;
  font-size: 14px;
  border: none;
  padding: 0 10px;
  outline: none;
  -webkit-app-region: no-drag;
}

.detach input::-webkit-input-placeholder {
  color: #aaa;
  user-select: none;
}

.detach .info {
  display: flex;
  align-items: center;
}

.handle {
  display: flex;
  -webkit-app-region: no-drag;
}

.handle > div {
  width: 36px;
  height: 36px;
  border-radius: 18px;
  cursor: pointer;
  margin-right: 6px;
}

.handle > div:hover {
  background-color: #dee2e6;
}

.handle .plugin-menu-btn {
  display: flex;
  align-items: center;
  justify-content: center;
}

.plugin-menu-icon {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: 18px;
  height: 12px;
}

.plugin-menu-icon i {
  display: block;
  height: 2px;
  background: #444;
  border-radius: 1px;
}

.detach.dark .plugin-menu-icon i {
  background: #ccc;
}

.handle .pin {
  background: center / 20px no-repeat url('./assets/unpin.svg');
}

.handle .pin.active {
  background-image: url('./assets/pin.svg');
}

.handle .devtool {
  background: center / 20px no-repeat url('./assets/tool.svg');
}

.handle .devtool.active {
  background-image: url('./assets/tool-filled.svg');
  background-size: 23px;
}

.handle-container {
  display: flex;
  align-items: center;
}

.window-handle {
  display: flex;
  align-items: stretch;
  height: 50px;
  -webkit-app-region: no-drag;
}

.window-handle > div {
  width: 48px;
  height: 50px;
  cursor: pointer;
}

.window-handle > div:hover {
  background-color: #dee2e6;
}

.window-handle .minimize {
  background: center / 20px no-repeat url('./assets/minimize.svg');
}

.window-handle .maximize {
  background: center / 20px no-repeat url('./assets/maximize.svg');
}

.window-handle .unmaximize {
  background: center / 20px no-repeat url('./assets/unmaximize.svg');
}

.window-handle .close {
  background: center / 20px no-repeat url('./assets/close.svg');
}

.window-handle .close:hover {
  background-color: #e53935 !important;
  background-image: url('./assets/close-hover.svg') !important;
}
</style>
