<template>
  <div :class="[process.platform, 'detach']">
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
        <div class="plugin-menu-btn" @click.stop="openPluginMenu" title="菜单">
          <span class="plugin-menu-icon">
            <i></i>
            <i></i>
            <i></i>
          </span>
        </div>
        <div
          class="devtool"
          :class="{ active: devToolsActive }"
          @click.stop="toggleDevTools"
          :title="devToolsActive ? '关闭开发者工具' : '开发者工具'"
        ></div>
        <div
          class="pin"
          :class="{ active: pinned }"
          @click.stop="togglePin"
          :title="pinned ? '取消固定' : '固定在最前'"
        ></div>
      </div>
      <div class="window-handle" v-if="process.platform !== 'darwin'">
        <div class="minimize" @click="minimize"></div>
        <div class="maximize" @click="maximize"></div>
        <div class="close" @click="close"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import throttle from 'lodash.throttle';
import { nextTick, ref } from 'vue';

const { ipcRenderer } = window.require('electron');
const remote = window.require('@electron/remote');
const { Menu, dialog, getCurrentWindow } = remote;

const process = window.require('process');

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
  try {
    const win = getCurrentWindow();
    if (!win || typeof win.setAlwaysOnTop !== 'function') return;
    /** 独立窗口已 enable remote；置顶用当前 BrowserWindow，避免 ipc 侧 fromWebContents 解析不到 sender */
    win.setAlwaysOnTop(pinned.value);
  } catch {
    /* ignore */
  }
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

function getPluginWebContents() {
  try {
    const win = getCurrentWindow();
    const bv = win.getBrowserView();
    return bv?.webContents ?? null;
  } catch {
    return null;
  }
}

let devToolsListenersAttachedFor = 0;

function setupPluginDevToolsListenersOnce(wc) {
  if (!wc || wc.isDestroyed()) return;
  if (devToolsListenersAttachedFor === wc.id) return;
  devToolsListenersAttachedFor = wc.id;
  wc.on('devtools-opened', () => {
    devToolsActive.value = true;
  });
  wc.on('devtools-closed', () => {
    devToolsActive.value = false;
  });
}

function syncDevToolsState() {
  const wc = getPluginWebContents();
  devToolsActive.value = !!(wc && !wc.isDestroyed() && wc.isDevToolsOpened());
}

/** BrowserView 在 ready-to-show 后才挂上，壳脚本可能早于此时执行 */
function scheduleDevToolsListenerSetup() {
  let attempts = 0;
  const tick = () => {
    const wc = getPluginWebContents();
    if (wc && !wc.isDestroyed()) {
      setupPluginDevToolsListenersOnce(wc);
      syncDevToolsState();
      return;
    }
    if (++attempts < 50) {
      setTimeout(tick, 40);
    }
  };
  nextTick(tick);
}

function toggleDevTools() {
  const wc = getPluginWebContents();
  if (!wc || wc.isDestroyed()) return;
  setupPluginDevToolsListenersOnce(wc);
  if (wc.isDevToolsOpened()) {
    wc.closeDevTools();
    devToolsActive.value = false;
  } else {
    wc.openDevTools({ mode: 'detach' });
    devToolsActive.value = true;
  }
}

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
  ipcRenderer.send('msg-trigger', {
    type: 'detachInputChange',
    data: {
      text: e.target.value,
    },
  });
}, 500);

const zoomPlugin = (action) => {
  void ipcRenderer.invoke('flick:detach-adjust-plugin-zoom', {
    action,
    winId: getCurrentWindow().id,
  });
};

const openPluginMenu = async () => {
  const name = plugInfo.value.name;
  const canFileConfig = name && name !== 'flick-system-super-panel';
  const flickCfg = canFileConfig
    ? await ipcRenderer.invoke('flick:get-plugin-flick-config', name)
    : { autoDetach: false, detachAlwaysShowSearch: false };

  const items = [
    {
      label: '关于插件应用',
      click: () => {
        const p = plugInfo.value;
        const lines = [
          p.pluginName || p.name,
          p.version ? `版本：${p.version}` : '',
          p.description || '',
        ].filter(Boolean);
        dialog.showMessageBoxSync(getCurrentWindow(), {
          type: 'info',
          title: '关于插件应用',
          message: lines[0] || p.name || '',
          detail: lines.slice(1).join('\n') || undefined,
          buttons: ['确定'],
          noLink: true,
        });
      },
    },
  ];

  if (canFileConfig) {
    items.push({
      label: '插件应用设置',
      submenu: [
        {
          label: '自动分离为独立窗口',
          type: 'checkbox',
          checked: !!flickCfg.autoDetach,
          click() {
            void ipcRenderer.invoke('flick:flip-plugin-auto-detach', name);
          },
        },
        {
          label: '独立窗口显示搜索框',
          type: 'checkbox',
          checked: !!flickCfg.detachAlwaysShowSearch,
          click() {
            void ipcRenderer
              .invoke('flick:flip-plugin-detach-always-show-search', name)
              .then((res) => {
                detachAlwaysShowSearch.value = !!res?.detachAlwaysShowSearch;
                if (detachAlwaysShowSearch.value && !plugInfo.value.subInput) {
                  plugInfo.value.subInput = {
                    value: '',
                    placeholder: '',
                  };
                }
                updateShowInputFromState();
              });
          },
        },
      ],
    });
  }

  items.push({
    label: '缩放比例',
    submenu: [
      { label: '放大', click: () => zoomPlugin('in') },
      { label: '缩小', click: () => zoomPlugin('out') },
      { label: '重置为 100%', click: () => zoomPlugin('reset') },
    ],
  });

  Menu.buildFromTemplate(items).popup({ window: getCurrentWindow() });
};

const minimize = () => {
  ipcRenderer.send('detach:service', { type: 'minimize' });
};

const maximize = () => {
  ipcRenderer.send('detach:service', { type: 'maximize' });
};

const close = () => {
  ipcRenderer.send('detach:service', { type: 'close' });
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

if (process.platform === 'darwin') {
  window.onkeydown = (e) => {
    if (e.code === 'Escape') {
      ipcRenderer.send('detach:service', { type: 'endFullScreen' });
      return;
    }
    if (e.metaKey && (e.code === 'KeyW' || e.code === 'KeyQ')) {
      window.handle.close();
    }
  };
} else {
  window.onkeydown = (e) => {
    if (e.ctrlKey && e.code === 'KeyW') {
      window.handle.close();
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
  font-family: system-ui, 'PingFang SC', 'Helvetica Neue', 'Microsoft Yahei',
    sans-serif;
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
