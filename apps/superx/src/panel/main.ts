import { createApp } from 'vue';
import { Button, Modal } from 'ant-design-vue';
import 'ant-design-vue/es/button/style/css';
import 'ant-design-vue/es/modal/style/css';
import App from './App.vue';

createApp(App).use(Button).use(Modal).mount('#app');
