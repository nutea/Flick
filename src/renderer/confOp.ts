const LOCAL_CONFIG_KEY = 'flick-local-config';

const localConfig = {
  getConfig(): any {
    const data: any = window.flick.db.get(LOCAL_CONFIG_KEY) || {};
    const config = data.data;
    const logo = config?.perf?.custom?.logo;
    if (typeof logo === 'string' && logo.startsWith('file://')) {
      config.perf.custom.logo = `image://${logo.slice('file://'.length)}`;
    }
    return config;
  },

  setConfig(data) {
    const localConfig: any = window.flick.db.get(LOCAL_CONFIG_KEY) || {};
    window.flick.db.put({
      _id: LOCAL_CONFIG_KEY,
      _rev: localConfig._rev,
      data: {
        ...localConfig.data,
        ...data,
      },
    });
  },
};

export default localConfig;
