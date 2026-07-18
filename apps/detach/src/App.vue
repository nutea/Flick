<template>
  <div :class="[platform, 'detach']">
    <div class="info">
      <img :src="plugInfo.logoUrl" />
      <div
        v-if="showInput"
        class="detach-input-frame"
        :data-role="detachInput.role"
      >
        <input
          ref="inputElement"
          @input="changeValue"
          @keydown.esc.prevent="focusPlugin"
          :value="detachInput.value"
          :placeholder="detachInput.placeholder"
          :aria-label="detachInput.role === 'filter' ? '筛选' : '搜索'"
          autocomplete="off"
          :spellcheck="false"
        />
      </div>
      <span v-else class="plugin-title">{{ plugInfo.pluginName }}</span>
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
import { nextTick, ref } from 'vue';
import {
  normalizeDetachInputRequest,
  resolveDetachInputState,
} from '../../../src/common/utils/detachInput';

const api = window.detach;
const platform = api.platform;

const pinned = ref(false);
/** 插件 BrowserView 的开发者工具是否打开（与壳页无关） */
const devToolsActive = ref(false);
const showInput = ref(false);
const inputElement = ref(null);
const detachInput = ref(
  resolveDetachInputState({
    capability: 'optional',
    policy: 'auto',
    request: null,
  })
);

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

api.onInputPolicy((policy) => {
  detachInput.value.policy = policy;
  updateShowInputFromState(false);
});

function focusPlugin() {
  void api.focusPlugin();
}

function updateShowInputFromState(focusWhenRequested = true) {
  detachInput.value = resolveDetachInputState({
    capability: detachInput.value.capability,
    policy: detachInput.value.policy,
    request: detachInput.value,
  });
  showInput.value = detachInput.value.visible;
  if (focusWhenRequested && detachInput.value.focus) {
    void nextTick(() => inputElement.value?.focus());
  } else {
    focusPlugin();
  }
}

window.initDetach = (pluginInfo) => {
  plugInfo.value = pluginInfo;
  const source = pluginInfo.detachInput || {};
  detachInput.value = resolveDetachInputState({
    capability: source.capability,
    policy: source.policy === 'always' ? 'always' : 'auto',
    request: source,
  });
  showInput.value = detachInput.value.visible;
  localStorage.setItem('flick-system-detach', JSON.stringify(pluginInfo));
  loadPinFromStorage();
  scheduleDevToolsListenerSetup();
  if (detachInput.value.focus) {
    void nextTick(() => inputElement.value?.focus());
  } else {
    focusPlugin();
  }
};

try {
  window.initDetach(JSON.parse(storeInfo));
} catch (e) {
  // ...
}

const sendInputChange = throttle((value) => {
  api.sendInput(value);
}, 500);

const changeValue = (e) => {
  const value = String(e.target?.value ?? '');
  detachInput.value.value = value;
  sendInputChange(value);
};

const focusDetachInput = () => {
  if (!showInput.value) return false;
  inputElement.value?.focus();
  inputElement.value?.select();
  return true;
};

const openPluginMenu = async () => {
  const { name, pluginName, version, description } = plugInfo.value;
  await api.openPluginMenu({
    name,
    pluginName,
    version,
    description,
    detachInputCapability: detachInput.value.capability,
  });
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
    detachInput.value.value = String(value ?? '');
    updateShowInputFromState(false);
  },
  setSubInput: (payload) => {
    const placeholder =
      payload != null && typeof payload === 'object' && 'placeholder' in payload
        ? payload.placeholder
        : payload;
    const request = normalizeDetachInputRequest({
      ...detachInput.value,
      requested: true,
      placeholder: placeholder != null ? String(placeholder) : '',
      focus:
        payload != null && typeof payload === 'object'
          ? payload.isFocus === true
          : false,
      role:
        payload != null && typeof payload === 'object'
          ? payload.role
          : 'search',
    });
    Object.assign(detachInput.value, request);
    updateShowInputFromState();
  },
  removeSubInput: () => {
    detachInput.value.requested = false;
    detachInput.value.focus = false;
    detachInput.value.placeholder = '';
    updateShowInputFromState(false);
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
    if (e.metaKey && e.code === 'KeyL' && focusDetachInput()) {
      e.preventDefault();
      return;
    }
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
    if (e.ctrlKey && e.code === 'KeyL' && focusDetachInput()) {
      e.preventDefault();
      return;
    }
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
  background: var(--color-body-bg);
  box-shadow: inset 0 -1px 0 var(--color-border-light);
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
  flex: 0 0 auto;
}

.detach-input-frame {
  width: clamp(160px, 32vw, 420px);
  max-width: calc(100% - 56px);
  height: 34px;
  display: flex;
  align-items: center;
  box-sizing: border-box;
  overflow: hidden;
  background: var(--color-fill-subtle);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-control);
  transition:
    border-color var(--motion-fast) ease,
    background-color var(--motion-fast) ease,
    box-shadow var(--motion-fast) ease;
  -webkit-app-region: no-drag;
}

.detach-input-frame:hover {
  background: var(--color-input-hover);
  border-color: var(--color-border-hover);
}

.detach-input-frame:focus-within {
  background: var(--color-body-bg);
  border-color: var(--color-accent);
  box-shadow:
    0 0 0 2px var(--color-focus-ring),
    var(--shadow-control);
}

.detach-input-frame input {
  background: transparent;
  color: var(--color-text-primary);
  width: 100%;
  min-width: 0;
  height: 32px;
  line-height: 32px;
  font-size: 14px;
  border: none;
  padding: 0 11px;
  outline: none;
  box-sizing: border-box;
  caret-color: var(--color-accent);
  -webkit-app-region: no-drag;
}

.detach-input-frame input::placeholder {
  color: var(--color-text-desc);
  user-select: none;
}

.detach .info {
  display: flex;
  align-items: center;
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  overflow: hidden;
}

.plugin-title {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
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
  background-color: var(--color-list-hover);
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
  flex: 0 0 auto;
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
  background-color: var(--color-list-hover);
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
