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
  baseURL:
    baseURL || 'https://gitee.com/monkeyWang/flickdatabase/raw/master',
});

const withAccessToken = (targetPath: string) => {
  if (!access_token) return targetPath;
  return `${targetPath}?access_token=${encodeURIComponent(access_token)}&ref=master`;
};

export default {
  async getTotalPlugins() {
    const res = await instance.get(withAccessToken('plugins/total-plugins.json'));
    console.log('total plugsin', res);
    return res.data;
  },

  async getFinderDetail() {
    const res = await instance.get(withAccessToken('plugins/finder.json'));
    return res.data;
  },

  async getSystemDetail() {
    const res = await instance.get(withAccessToken('plugins/system.json'));
    return res.data;
  },
  async getWorkerDetail() {
    const res = await instance.get(withAccessToken('plugins/worker.json'));
    return res.data;
  },

  async getPluginDetail(url: string) {
    const res = await instance.get(url);
    return res.data;
  },

  async getSearchDetail() {
    const res = await instance.get(withAccessToken('plugins/search.json'));
    return res.data;
  },
  async getDevDetail() {
    const res = await instance.get(withAccessToken('plugins/dev.json'));
    return res.data;
  },
  async getImageDetail() {
    const res = await instance.get(withAccessToken('plugins/image.json'));
    return res.data;
  },
};
