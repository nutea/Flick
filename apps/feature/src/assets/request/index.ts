import axios from 'axios';
import { resolveMarketSourceConfig } from '@/assets/marketConfig';

let marketConfig = resolveMarketSourceConfig(undefined);

try {
  const dbdata = window.flick.db.get('flick-localhost-config');
  marketConfig = resolveMarketSourceConfig(dbdata?.data);
} catch (e) {
  // ignore
}

const instance = axios.create({
  timeout: 4000,
  baseURL: marketConfig.database,
});

const withAccessToken = (targetPath: string) => {
  if (!marketConfig.access_token) return targetPath;
  return `${targetPath}?access_token=${encodeURIComponent(marketConfig.access_token)}&ref=master`;
};

const getJson = async <T>(targetPath: string, fallback: T): Promise<T> => {
  try {
    const response = await instance.get(withAccessToken(targetPath));
    return response.data as T;
  } catch {
    return fallback;
  }
};

export default {
  async getTotalPlugins() {
    return getJson('plugins/total-plugins.json', []);
  },

  async getFinderDetail() {
    return getJson('plugins/finder.json', {
      banners: [],
      must: [],
      recommend: [],
      new: [],
      unavailable: true,
    });
  },

  async getSystemDetail() {
    return getJson('plugins/system.json', []);
  },
  async getWorkerDetail() {
    return getJson('plugins/worker.json', []);
  },

  async getPluginDetail(url: string) {
    const res = await instance.get(url);
    return res.data;
  },

  async getSearchDetail() {
    return getJson('plugins/search.json', []);
  },
  async getDevDetail() {
    return getJson('plugins/dev.json', []);
  },
  async getImageDetail() {
    return getJson('plugins/image.json', []);
  },
};
