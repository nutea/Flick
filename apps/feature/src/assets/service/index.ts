import axios from 'axios';

const apiBase =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VUE_APP_API_BASE ||
  '';

const instance = axios.create({
  baseURL: apiBase,
});

export default {
  async getScanCode({ scene }: { scene: string }) {
    const res = await instance.get('/users/getScanCode', {
      params: {
        scene,
      },
    });
    return res.data;
  },

  async checkLoginStatus({ scene }: { scene: string }) {
    const res = await instance.post('/users/checkLoginStatus', {
      scene,
    });
    return res.data;
  },

  async getUserInfo({ openId }: { openId: string }) {
    const res = await instance.post('/users/getUserInfo', {
      openId,
    });
    return res.data;
  },
};
