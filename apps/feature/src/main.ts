import { createApp } from 'vue';
import {
  ConfigProvider,
  Button,
  Checkbox,
  Divider,
  Row,
  Col,
  Dropdown,
  Menu,
  Form,
  Input,
  InputNumber,
  Radio,
  Typography,
  Select,
  Switch,
  Avatar,
  Popconfirm,
  Collapse,
  List,
  Tooltip,
  Alert,
  Drawer,
  Modal,
  Upload,
  Result,
  Spin,
  Skeleton,
  Empty,
  Tag,
} from 'ant-design-vue';
import App from './App.vue';
import router from './router';
import store from './store';
import './assets/ant-reset.less';
import 'ant-design-vue/es/alert/style/css';
import 'ant-design-vue/es/avatar/style/css';
import 'ant-design-vue/es/button/style/css';
import 'ant-design-vue/es/checkbox/style/css';
import 'ant-design-vue/es/collapse/style/css';
import 'ant-design-vue/es/divider/style/css';
import 'ant-design-vue/es/drawer/style/css';
import 'ant-design-vue/es/dropdown/style/css';
import 'ant-design-vue/es/form/style/css';
import 'ant-design-vue/es/grid/style/css';
import 'ant-design-vue/es/input/style/css';
import 'ant-design-vue/es/input-number/style/css';
import 'ant-design-vue/es/list/style/css';
import 'ant-design-vue/es/menu/style/css';
import 'ant-design-vue/es/message/style/css';
import 'ant-design-vue/es/modal/style/css';
import 'ant-design-vue/es/popconfirm/style/css';
import 'ant-design-vue/es/radio/style/css';
import 'ant-design-vue/es/result/style/css';
import 'ant-design-vue/es/select/style/css';
import 'ant-design-vue/es/spin/style/css';
import 'ant-design-vue/es/skeleton/style/css';
import 'ant-design-vue/es/empty/style/css';
import 'ant-design-vue/es/switch/style/css';
import 'ant-design-vue/es/tag/style/css';
import 'ant-design-vue/es/tooltip/style/css';
import 'ant-design-vue/es/typography/style/css';
import 'ant-design-vue/es/upload/style/css';
import registerI18n from './languages/i18n';
import localConfig from './confOp';

const config: any = localConfig.getConfig();

const applyTheme = (next: any) => {
  document.body.classList.toggle('dark', Boolean(next?.perf?.common?.darkMode));
  ConfigProvider.config({
    theme: next?.perf?.custom || {},
  });
};

applyTheme(config);

window.flick.onThemeChange(() => {
  applyTheme(localConfig.getConfig());
});

createApp(App)
  .use(registerI18n)
  .use(store)
  .use(Button)
  .use(Checkbox)
  .use(Divider)
  .use(Row)
  .use(Col)
  .use(Dropdown)
  .use(Menu)
  .use(Form)
  .use(Input)
  .use(InputNumber)
  .use(Radio)
  .use(Select)
  .use(Switch)
  .use(Avatar)
  .use(Collapse)
  .use(List)
  .use(Tooltip)
  .use(Alert)
  .use(Drawer)
  .use(Modal)
  .use(Result)
  .use(Spin)
  .component('ASkeleton', Skeleton)
  .component('AEmpty', Empty)
  .use(Tag)
  .use(Upload)
  .use(Popconfirm)
  .use(Typography)
  .use(router)
  .mount('#app');
