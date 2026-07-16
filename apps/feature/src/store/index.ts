import { createStore } from 'vuex';
import request from '@/assets/request';

const getTotalPluginsSafe = async (): Promise<Market.Plugin[]> => {
  try {
    return await request.getTotalPlugins();
  } catch {
    return [];
  }
};

const isDownload = (item: Market.Plugin, targets: any[]) => {
  let isDownload = false;
  targets.some((plugin) => {
    if (plugin.name === item.name) {
      isDownload = true;
    }
    return isDownload;
  });
  return isDownload;
};
const LOCAL_PLUGIN_JSON = 'localPluginJson';
export default createStore({
  state: {
    totalPlugins: [],
    localPlugins: [],
    searchValue: '',
    active: ['finder'],
  },
  mutations: {
    commonUpdate(state: any, payload) {
      Object.keys(payload).forEach((key) => {
        state[key] = payload[key];
      });
    },
    setSearchValue(state: any, payload) {
      state.searchValue = payload;
    },
  },
  actions: {
    async saveLocalPlugins({ dispatch, state }, plugins) {
      // 先移除
      window.flick.db.remove(LOCAL_PLUGIN_JSON);
      window.flick.db.put({
        _id: LOCAL_PLUGIN_JSON,
        data: JSON.stringify(plugins),
      });
      await dispatch('init');
    },
    async deleteLocalPlugins({ dispatch, state }) {
      // 先移除
      window.flick.db.remove(LOCAL_PLUGIN_JSON);
      await dispatch('init');
    },
    async init({ commit }) {
      const tPlugins = await getTotalPluginsSafe();
      const lTPlugins = window.flick.db.get(LOCAL_PLUGIN_JSON);
      const totalPlugins = tPlugins.concat(JSON.parse(lTPlugins?.data || '[]'));

      const localPlugins = window.market.getLocalPlugins();

      totalPlugins.forEach((origin: Market.Plugin) => {
        origin.isdownload = isDownload(origin, localPlugins);
        origin.isloading = false;
      });
      // 修复卸载失败，一直转圈的问题。
      localPlugins.forEach((origin: Market.Plugin) => {
        origin.isloading = false;
      });

      commit('commonUpdate', {
        localPlugins,
        totalPlugins,
      });
    },
    startDownload({ commit, state }, name) {
      const totalPlugins = JSON.parse(JSON.stringify(state.totalPlugins));
      totalPlugins.forEach((origin: Market.Plugin) => {
        if (origin.name === name) {
          origin.isloading = true;
        }
      });
      commit('commonUpdate', {
        totalPlugins,
      });
    },

    startUnDownload({ commit, state }, name) {
      const localPlugins = window.market.getLocalPlugins();
      localPlugins.forEach((origin: Market.Plugin) => {
        if (origin.name === name) {
          origin.isloading = true;
        }
      });
      commit('commonUpdate', {
        localPlugins,
      });
    },

    errorUnDownload({ commit, state }, name) {
      const localPlugins = window.market.getLocalPlugins();
      // 修复卸载失败，一直转圈的问题。
      localPlugins.forEach((origin: Market.Plugin) => {
        if (origin.name === name) {
          origin.isloading = false;
        }
      });

      commit('commonUpdate', {
        localPlugins,
      });
    },

    successDownload({ commit, state }, name) {
      const totalPlugins = JSON.parse(JSON.stringify(state.totalPlugins));
      totalPlugins.forEach((origin: Market.Plugin) => {
        if (origin.name === name) {
          origin.isloading = false;
          origin.isdownload = true;
        }
      });
      const localPlugins = window.market.getLocalPlugins();

      commit('commonUpdate', {
        totalPlugins,
        localPlugins,
      });
    },

    async updateLocalPlugin({ commit }) {
      const localPlugins = window.market.getLocalPlugins();
      const totalPlugins = await getTotalPluginsSafe();

      totalPlugins.forEach((origin: Market.Plugin) => {
        origin.isdownload = isDownload(origin, localPlugins);
        origin.isloading = false;
      });

      commit('commonUpdate', {
        localPlugins,
        totalPlugins,
      });
    },
  },
  modules: {},
});
