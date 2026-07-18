import { reactive, toRefs, ref } from 'vue';
import searchManager from './search';
import optionsManager from './options';
import { PLUGIN_HISTORY } from '@/common/constans/renderer';
import { message } from 'ant-design-vue';
import {
  rehydrateRecentPlugin,
  recentPluginTaskKey,
  sanitizeRecentPlugin,
  sanitizeRecentPluginHistory,
} from './pluginHistory';

const createPluginManager = (): any => {
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
    appList.value = await window.flick.getInstalledApps();
    initLocalStartPlugin();
  };

  const initPluginHistory = () => {
    const result = window.flick.db.get(PLUGIN_HISTORY) || {};
    if (result && result.data) {
      const installedPlugins: any[] = window.flick.getLocalPlugins();
      const installedByName = new Map<string, any>(
        installedPlugins.map((plugin) => [plugin.name, plugin])
      );
      state.pluginHistory = sanitizeRecentPluginHistory(
        result.data.map((item) => {
          const originName = item.originName || item.name;
          const installed = installedByName.get(originName);
          return rehydrateRecentPlugin(item, installed);
        })
      );
    }
  };

  const initLocalStartPlugin = () => {
    const result = window.flick.db.get('flick-local-start-app');
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
    // 插件输入框声明属于插件实例；切换时不能继承上一个插件的
    // placeholder / requested / focus / role。
    window.removeSubInput();
    // 缩窗由主进程 openPlugin 内 resizeLauncherContent 统一处理；此处再发 setExpendHeight 会与主进程次序交叉，高 DPI 下二次改尺寸导致跳动
    state.pluginLoading = true;
    state.currentPlugin = plugin;
    // 自带的插件不需要检测更新
    const runtimeName = plugin.originName || plugin.name;
    if (
      runtimeName === 'flick-system-feature' ||
      runtimeName === 'flick-system-super-panel'
    ) {
      state.pluginLoading = false;
      return;
    }
    if (
      typeof runtimeName === 'string' &&
      /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(runtimeName)
    ) {
      await window.flick.upgradePlugin(runtimeName);
    }
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
      const redirected =
        await window.flick.tryRedirectSingletonDetach(pluginPayload);
      if (redirected) {
        changePluginHistory({
          ...plugin,
          ...option,
          name: plugin.name,
          originName: plugin.originName || plugin.name,
        });
        return;
      }
    }

    await window.flick.removePlugin();
    window.captureSearchSnapshotForNextDetach?.();
    window.initFlick();

    if (plugin.pluginType === 'ui' || plugin.pluginType === 'system') {
      await loadPlugin(plugin);
      await window.flick.openPlugin(
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
        await window.flick.launchApp(plugin.desc);
      } catch (e) {
        message.error('启动应用出错，请确保启动应用存在！');
      }
    }
    changePluginHistory({
      ...plugin,
      ...option,
      name: plugin.name,
      originName: plugin.originName || plugin.name,
    });
  };

  const changePluginHistory = (plugin) => {
    plugin = sanitizeRecentPlugin(plugin);
    const unpin = state.pluginHistory.filter((plugin) => !plugin.pin);
    const pin = state.pluginHistory.filter((plugin) => plugin.pin);
    const taskKey = recentPluginTaskKey(plugin);
    const isSameTask = (candidate) =>
      recentPluginTaskKey(candidate) === taskKey;
    const isPin = state.pluginHistory.find(isSameTask)?.pin;
    if (isPin) {
      pin.forEach((p, index) => {
        if (isSameTask(p)) {
          pin.splice(index, 1);
        }
      });
      plugin.pin = true;
      pin.unshift(plugin);
    } else {
      unpin.forEach((p, index) => {
        if (isSameTask(p)) {
          unpin.splice(index, 1);
        }
      });
      unpin.unshift(plugin);
    }
    while (pin.length + unpin.length > 8 && unpin.length) {
      unpin.pop();
    }
    state.pluginHistory = sanitizeRecentPluginHistory([...pin, ...unpin]);
    const result = window.flick.db.get(PLUGIN_HISTORY) || {};
    window.flick.db.put({
      _id: PLUGIN_HISTORY,
      _rev: result._rev,
      data: JSON.parse(JSON.stringify(state.pluginHistory)),
    });
  };

  const setPluginHistory = (plugins) => {
    state.pluginHistory = sanitizeRecentPluginHistory(plugins);
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
  const getBuiltinPlugin = async (name: string) => {
    const pluginInfo = await window.flick.getBuiltinPlugin(name);
    return {
      ...pluginInfo,
      logo: pluginInfo.logoUrl,
      icon: pluginInfo.logoUrl,
      indexPath: pluginInfo.indexUrl,
    };
  };

  const changeSelect = (select) => {
    state.currentPlugin = select;
  };

  const addPlugin = (plugin: any) => {
    state.plugins.unshift(plugin);
  };

  const removePlugin = (_plugin: any) => {
    // todo
  };

  window.loadPlugin = (plugin) => loadPlugin(plugin);

  window.updatePlugin = ({ currentPlugin }: any) => {
    state.currentPlugin = currentPlugin;
    window.flick.updateLocalPlugin(currentPlugin);
  };

  window.setCurrentPlugin = ({ currentPlugin }) => {
    state.currentPlugin = currentPlugin;
    setSearchValue('');
    window.removeSubInput();
  };

  window.initFlick = () => {
    state.currentPlugin = {};
    setSearchValue('');
    setOptionsRef([]);
    window.removeSubInput();
  };

  window.pluginLoaded = () => {
    state.pluginLoading = false;
  };

  window.searchFocus = async (args, strict) => {
    await window.flick.removePlugin();
    window.initFlick();
    searchFocus(args, strict);
  };

  return {
    ...toRefs(state),
    initPlugins,
    addPlugin,
    removePlugin,
    onSearch,
    getBuiltinPlugin,
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
