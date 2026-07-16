import axios from 'axios';

let baseURL = 'https://gitee.com/monkeyWang/flickdatabase/raw/master';
let access_token = '';

try {
  const dbdata = window.flick.db.get('flick-localhost-config');
  if (dbdata && dbdata.data) {
    baseURL = dbdata.data.database || baseURL;
    access_token = dbdata.data.access_token || '';
  }
} catch (e) {
  // ignore
}

const instance = axios.create({
  timeout: 4000,
  baseURL: baseURL || 'https://gitee.com/monkeyWang/flickdatabase/raw/master',
});

const withAccessToken = (targetPath: string) => {
  if (!access_token) return targetPath;
  return `${targetPath}?access_token=${encodeURIComponent(access_token)}&ref=master`;
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
