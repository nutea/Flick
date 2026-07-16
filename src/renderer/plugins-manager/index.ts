import { reactive, toRefs, ref } from 'vue';
import appSearch from '@/core/app-search';
import { PluginHandler } from '@/core';
import commonConst from '@/common/utils/commonConst';
import searchManager from './search';
import optionsManager from './options';
import {
  PLUGIN_INSTALL_DIR as baseDir,
  PLUGIN_HISTORY,
} from '@/common/constans/renderer';
import { message } from 'ant-design-vue';

const { nativeImage, ipcRenderer } = window.require('electron');
const { getGlobal } = window.require('@electron/remote');
const path = window.require('path');
const { exec } = window.require('child_process');

const createPluginManager = (): any => {
  const pluginInstance = new PluginHandler({
    baseDir,
  });

  const state: any = reactive({
    appList: [],
    plugins: [],
    localPlugins: [],
    currentPlugin: {},
    pluginLoading: false,
    pluginHistory: [],
  });

  const appList: any = ref([]);

  const initPlugins = async () => {
    initPluginHistory();
    appList.value = await appSearch(nativeImage);
    initLocalStartPlugin();
  };

  const initPluginHistory = () => {
    const result = window.flick.db.get(PLUGIN_HISTORY) || {};
    if (result && result.data) {
      state.pluginHistory = result.data;
    }
  };

  const initLocalStartPlugin = () => {
    const result = ipcRenderer.sendSync('msg-trigger', {
      type: 'dbGet',
      data: { id: 'flick-local-start-app' },
    });
    if (result && result.value) {
      appList.value.push(...result.value);
    }
  };

  window.removeLocalStartPlugin = ({ plugin }) => {
    appList.value = appList.value.filter((app) => app.desc !== plugin.desc);
  };

  window.addLocalStartPlugin = ({ plugin }) => {
    window.removeLocalStartPlugin({ plugin });
    appList.value.push(plugin);
  };

  const loadPlugin = async (plugin) => {
    setSearchValue('');
    // 缩窗由主进程 openPlugin 内 resizeLauncherContent 统一处理；此处再发 setExpendHeight 会与主进程次序交叉，高 DPI 下二次改尺寸导致跳动
    state.pluginLoading = true;
    state.currentPlugin = plugin;
    // 自带的插件不需要检测更新
    if (
      plugin.name === 'flick-system-feature' ||
      plugin.name === 'flick-system-super-panel'
    ) {
      return;
    }
    await pluginInstance.upgrade(plugin.name);
    state.pluginLoading = false;
  };

  const openPlugin = async (plugin, option) => {
    if (plugin.pluginType === 'ui' || plugin.pluginType === 'system') {
      if (state.currentPlugin && state.currentPlugin.name === plugin.name) {
        window.flick.showMainWindow();
        return;
      }
      const pluginPayload = JSON.parse(
        JSON.stringify({
          ...plugin,
          ext: plugin.ext || {
            code: plugin.feature.code,
            type: plugin.cmd.type || 'text',
            payload: null,
          },
        })
      );
      /** invoke：sendSync + async msg-trigger 会在 await 微任务之后才设 returnValue，重定向恒为假 */
      const redirected = await ipcRenderer.invoke(
        'flick:try-redirect-singleton-detach',
        pluginPayload
      );
      if (redirected) {
        changePluginHistory({
          ...plugin,
          ...option,
          originName: plugin.name,
        });
        return;
      }
    }

    ipcRenderer.send('msg-trigger', {
      type: 'removePlugin',
    });
    window.captureSearchSnapshotForNextDetach?.();
    window.initFlick();

    if (plugin.pluginType === 'ui' || plugin.pluginType === 'system') {
      await loadPlugin(plugin);
      window.flick.openPlugin(
        JSON.parse(
          JSON.stringify({
            ...plugin,
            ext: plugin.ext || {
              code: plugin.feature.code,
              type: plugin.cmd.type || 'text',
              payload: null,
            },
          })
        )
      );
    }
    if (plugin.pluginType === 'app') {
      try {
        exec(plugin.action);
      } catch (e) {
        message.error('启动应用出错，请确保启动应用存在！');
      }
    }
    changePluginHistory({
      ...plugin,
      ...option,
      originName: plugin.name,
    });
  };

  const changePluginHistory = (plugin) => {
    const unpin = state.pluginHistory.filter((plugin) => !plugin.pin);
    const pin = state.pluginHistory.filter((plugin) => plugin.pin);
    const isPin = state.pluginHistory.find((p) => p.name === plugin.name)?.pin;
    if (isPin) {
      pin.forEach((p, index) => {
        if (p.name === plugin.name) {
          plugin = pin.splice(index, 1)[0];
        }
      });
      pin.unshift(plugin);
    } else {
      unpin.forEach((p, index) => {
        if (p.name === plugin.name) {
          unpin.splice(index, 1);
        }
      });
      unpin.unshift(plugin);
    }
    if (state.pluginHistory.length > 8) {
      unpin.pop();
    }
    state.pluginHistory = [...pin, ...unpin];
    const result = window.flick.db.get(PLUGIN_HISTORY) || {};
    window.flick.db.put({
      _id: PLUGIN_HISTORY,
      _rev: result._rev,
      data: JSON.parse(JSON.stringify(state.pluginHistory)),
    });
  };

  const setPluginHistory = (plugins) => {
    state.pluginHistory = plugins;
    const unpin = state.pluginHistory.filter((plugin) => !plugin.pin);
    const pin = state.pluginHistory.filter((plugin) => plugin.pin);
    state.pluginHistory = [...pin, ...unpin];
    const result = window.flick.db.get(PLUGIN_HISTORY) || {};
    window.flick.db.put({
      _id: PLUGIN_HISTORY,
      _rev: result._rev,
      data: JSON.parse(JSON.stringify(state.pluginHistory)),
    });
  };

  const { searchValue, onSearch, setSearchValue, placeholder } =
    searchManager();
  const {
    options,
    searchFocus,
    setOptionsRef,
    clipboardFile,
    clearClipboardFile,
    readClipboardContent,
  } = optionsManager({
    searchValue,
    appList,
    openPlugin,
    currentPlugin: toRefs(state).currentPlugin,
  });
  // plugin operation
  const getPluginInfo = async ({ pluginName, pluginPath }) => {
    const pluginInfo = await pluginInstance.getAdapterInfo(
      pluginName,
      pluginPath
    );
    return {
      ...pluginInfo,
      icon: pluginInfo.logo,
      indexPath: `file://${path.join(pluginPath, '../', pluginInfo.main)}`,
    };
  };

  const changeSelect = (select) => {
    state.currentPlugin = select;
  };

  const addPlugin = (plugin: any) => {
    state.plugins.unshift(plugin);
  };

  const removePlugin = (plugin: any) => {
    // todo
  };

  window.loadPlugin = (plugin) => loadPlugin(plugin);

  window.updatePlugin = ({ currentPlugin }: any) => {
    state.currentPlugin = currentPlugin;
    getGlobal('LOCAL_PLUGINS').updatePlugin(currentPlugin);
  };

  window.setCurrentPlugin = ({ currentPlugin }) => {
    state.currentPlugin = currentPlugin;
    setSearchValue('');
  };

  window.initFlick = () => {
    state.currentPlugin = {};
    setSearchValue('');
    setOptionsRef([]);
    window.setSubInput({ placeholder: '' });
  };

  window.pluginLoaded = () => {
    state.pluginLoading = false;
  };

  window.searchFocus = (args, strict) => {
    ipcRenderer.send('msg-trigger', {
      type: 'removePlugin',
    });
    window.initFlick();
    searchFocus(args, strict);
  };

  return {
    ...toRefs(state),
    initPlugins,
    addPlugin,
    removePlugin,
    onSearch,
    getPluginInfo,
    openPlugin,
    changeSelect,
    options,
    searchValue,
    placeholder,
    searchFocus,
    setSearchValue,
    clipboardFile,
    clearClipboardFile,
    readClipboardContent,
    setPluginHistory,
    changePluginHistory,
  };
};

export default createPluginManager;
