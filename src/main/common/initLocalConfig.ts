import defaultConfig from '@/common/constans/defaultConfig';
import DBInstance from './db';
import { migrateConfiguredLogo } from './configPresentation';
const LOCAL_CONFIG_KEY = 'flick-local-config';

const db = new DBInstance();

const localConfig = {
  async init(): Promise<any> {
    const localConfig: any = await db.dbGet({ data: { id: LOCAL_CONFIG_KEY } });
    const previous = localConfig?.data || {};
    const next = {
      ...defaultConfig,
      ...previous,
      version: defaultConfig.version,
      perf: {
        ...defaultConfig.perf,
        ...previous.perf,
        custom: {
          ...defaultConfig.perf.custom,
          ...previous.perf?.custom,
          logo: migrateConfiguredLogo(previous.perf?.custom?.logo),
        },
        shortCut: {
          ...defaultConfig.perf.shortCut,
          ...previous.perf?.shortCut,
        },
        common: {
          ...defaultConfig.perf.common,
          ...previous.perf?.common,
        },
        local: {
          ...defaultConfig.perf.local,
          ...previous.perf?.local,
        },
      },
    };
    if (JSON.stringify(previous) === JSON.stringify(next)) return;
    await db.dbPut({
      data: {
        data: {
          _id: LOCAL_CONFIG_KEY,
          ...(localConfig?._rev ? { _rev: localConfig._rev } : {}),
          data: next,
        },
      },
    });
  },
  async getConfig(): Promise<any> {
    const data: any =
      (await db.dbGet({ data: { id: LOCAL_CONFIG_KEY } })) || {};
    return data.data;
  },

  async setConfig(data) {
    const localConfig: any =
      (await db.dbGet({ data: { id: LOCAL_CONFIG_KEY } })) || {};
    await db.dbPut({
      data: {
        data: {
          _id: LOCAL_CONFIG_KEY,
          _rev: localConfig._rev,
          data: {
            ...localConfig.data,
            ...data,
          },
        },
      },
    });
  },
};

export default localConfig;
