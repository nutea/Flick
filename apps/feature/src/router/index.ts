import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router';

const routes: Array<RouteRecordRaw> = [
  {
    path: '/result',
    name: 'result',
    component: () => import('../views/market/components/result.vue'),
  },
  ...['/devPlugin', '/image', '/tools', '/worker', '/system'].map((path) => ({
    path,
    redirect: '/finder',
  })),
  {
    path: '/localPlugin',
    name: 'localPlugin',
    component: () => import('../views/market/components/local-plugin.vue'),
  },
  {
    path: '/superPanel',
    name: 'superPanel',
    component: () => import('../views/super-panel-market/index.vue'),
  },
  {
    path: '/finder',
    name: 'finder',
    component: () => import('../views/market/components/finder.vue'),
  },
  {
    path: '/installed',
    name: 'installed',
    component: () => import('../views/installed/index.vue'),
  },
  {
    path: '/account',
    name: 'account',
    component: () => import('../views/settings/index.vue'),
    props: { section: 'userInfo' },
  },
  {
    path: '/settings',
    redirect: '/general',
  },
  {
    path: '/general',
    name: 'general',
    component: () => import('../views/settings/index.vue'),
    props: { section: 'normal' },
  },
  {
    path: '/localStart',
    name: 'localStart',
    component: () => import('../views/settings/index.vue'),
    props: { section: 'localstart' },
  },
  {
    path: '/shortcuts',
    name: 'shortcuts',
    component: () => import('../views/settings/index.vue'),
    props: { section: 'global' },
  },
  {
    path: '/dataSync',
    name: 'dataSync',
    component: () => import('../views/settings/index.vue'),
    props: { section: 'database' },
  },
  {
    path: '/marketSource',
    name: 'marketSource',
    component: () => import('../views/settings/index.vue'),
    props: { section: 'localhost' },
  },
  {
    path: '/dev',
    name: 'dev',
    component: () => import('../views/dev/index.vue'),
  },

  {
    path: '/:catchAll(.*)',
    name: 'finder',
    component: () => import('../views/market/components/finder.vue'),
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;
