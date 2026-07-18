const LOCAL_CONFIG_KEY = 'flick-local-config';

const localConfig = {
  getConfig(): any {
    const data: any = window.flick.db.get(LOCAL_CONFIG_KEY) || {};
    const config = data.data;
    if (config?.perf?.custom) {
      config.perf.custom.logoUrl = window.flick.resolveConfiguredLogo(
        config.perf.custom.logo
      );
    }
    return config;
  },

  setConfig(data: any) {
    const localConfig: any = window.flick.db.get(LOCAL_CONFIG_KEY) || {};
    const next = JSON.parse(JSON.stringify(data));
    if (next?.perf?.custom) delete next.perf.custom.logoUrl;
    window.flick.db.put({
      _id: LOCAL_CONFIG_KEY,
      _rev: localConfig._rev,
      data: {
        ...localConfig.data,
        ...next,
      },
    });
  },
};

export default localConfig;
