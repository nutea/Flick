const LOCAL_CONFIG_KEY = 'flick-local-config';

const localConfig = {
  getConfig(): Promise<any> {
    const data: any = window.flick.db.get(LOCAL_CONFIG_KEY) || {};
    return data.data;
  },

  setConfig(data: any) {
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
