import { createApp } from 'vue';
import {
  Button,
  List,
  Spin,
  Input,
  Avatar,
  Tag,
  ConfigProvider,
  Row,
  Col,
  Divider,
} from 'ant-design-vue';
import App from './App.vue';
import localConfig from './confOp';

import 'ant-design-vue/es/avatar/style/css';
import 'ant-design-vue/es/button/style/css';
import 'ant-design-vue/es/divider/style/css';
import 'ant-design-vue/es/grid/style/css';
import 'ant-design-vue/es/input/style/css';
import 'ant-design-vue/es/list/style/css';
import 'ant-design-vue/es/spin/style/css';
import 'ant-design-vue/es/tag/style/css';

const config: any = localConfig.getConfig();

ConfigProvider.config({
  theme: config.perf.custom || {},
});

window.flick.onThemeChange(() => {
  const config: any = localConfig.getConfig();
  ConfigProvider.config({
    theme: config.perf.custom || {},
  });
});

createApp(App)
  .use(Button)
  .use(List)
  .use(Spin)
  .use(Input)
  .use(Avatar)
  .use(Tag)
  .use(Row)
  .use(Col)
  .use(Divider)
  .mount('#app');
