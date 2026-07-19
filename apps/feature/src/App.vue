<template>
  <div class="main-container">
    <div class="left-menu">
      <div class="menu-scroll">
        <a-menu @select="onMenuSelect" :selectedKeys="active" mode="vertical">
          <a-menu-item-group>
            <template #title>{{ $t('feature.navigation.plugins') }}</template>
            <a-menu-item key="finder">
              <template #icon><ShopOutlined /></template>
              {{ $t('feature.market.title') }}
            </a-menu-item>
            <a-menu-item key="installed">
              <template #icon><InboxOutlined /></template>
              {{ $t('feature.installed.title') }}
            </a-menu-item>
            <a-menu-item key="localPlugin">
              <template #icon><ApiOutlined /></template>
              {{ $t('feature.market.localPlugin') }}
            </a-menu-item>
          </a-menu-item-group>

          <a-menu-item-group>
            <template #title>{{ $t('feature.navigation.features') }}</template>
            <a-menu-item key="superPanel">
              <template #icon><PushpinOutlined /></template>
              {{ $t('feature.market.superPanelSettings') }}
            </a-menu-item>
            <a-menu-item key="localStart">
              <template #icon><RocketOutlined /></template>
              {{ $t('feature.settings.localstart.title') }}
            </a-menu-item>
          </a-menu-item-group>

          <a-menu-item-group>
            <template #title>
              {{ $t('feature.navigation.preferences') }}
            </template>
            <a-menu-item key="general">
              <template #icon><SettingOutlined /></template>
              {{ $t('feature.settings.basic.title') }}
            </a-menu-item>
            <a-menu-item key="shortcuts">
              <template #icon><KeyOutlined /></template>
              {{ $t('feature.settings.global.title') }}
            </a-menu-item>
            <a-menu-item key="dataSync">
              <template #icon><CloudSyncOutlined /></template>
              {{ $t('feature.settings.database.title') }}
            </a-menu-item>
          </a-menu-item-group>

          <a-menu-item-group>
            <template #title>{{ $t('feature.navigation.advanced') }}</template>
            <a-menu-item key="marketSource">
              <template #icon><GlobalOutlined /></template>
              {{ $t('feature.settings.intranet.title') }}
            </a-menu-item>
            <a-menu-item key="dev">
              <template #icon><BugOutlined /></template>
              {{ $t('feature.dev.title') }}
            </a-menu-item>
          </a-menu-item-group>
        </a-menu>
      </div>

      <button
        type="button"
        class="account-entry"
        :class="{ active: active[0] === 'account' }"
        @click="changeMenu('account')"
      >
        <a-avatar :size="34" :src="perf.custom.logoUrl" />
        <span class="account-copy">
          <span class="account-name">{{ perf.custom.username }}</span>
          <span class="account-label">
            {{ $t('feature.settings.account.accountInfo') }}
          </span>
        </span>
        <RightOutlined class="account-arrow" />
      </button>
    </div>
    <div :class="active[0] === 'result' ? 'container' : 'more'">
      <router-view v-slot="{ Component }">
        <keep-alive>
          <component :is="Component" />
        </keep-alive>
      </router-view>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  ShopOutlined,
  InboxOutlined,
  BugOutlined,
  ApiOutlined,
  PushpinOutlined,
  RocketOutlined,
  SettingOutlined,
  KeyOutlined,
  CloudSyncOutlined,
  GlobalOutlined,
  RightOutlined,
} from '@ant-design/icons-vue';
import { useStore } from 'vuex';
import { useI18n } from 'vue-i18n';
import localConfig from '@/confOp';

const store = useStore();
const router = useRouter();
const { t } = useI18n();
const active = computed(() => store.state.active);
const { perf } = localConfig.getConfig();

const routeAliases: Record<string, string> = {
  设置中心: 'finder',
  插件市场: 'finder',
  探索: 'finder',
  worker: 'finder',
  tools: 'finder',
  image: 'finder',
  devPlugin: 'finder',
  system: 'finder',
  已安装插件: 'installed',
  超级面板: 'superPanel',
  超级面板设置: 'superPanel',
  超级面板快捷键: 'superPanel',
  settings: 'general',
  偏好设置: 'general',
  基本设置: 'general',
  本地启动: 'localStart',
  快捷启动: 'localStart',
  全局快捷键: 'shortcuts',
  多端数据同步: 'dataSync',
  内网部署配置: 'marketSource',
  插件市场源: 'marketSource',
  账户信息: 'account',
};

const changeMenu = (key: any) => {
  const normalizedKey = routeAliases[String(key)] || String(key);
  store.commit('commonUpdate', { active: [normalizedKey] });
  // Vue Router 4：无前导 / 的字符串会按相对路径解析，统一用绝对 path
  router.push({ path: `/${normalizedKey}` });
};

const onMenuSelect = ({ key }: { key: string | number }) => changeMenu(key);

window.flick.onPluginEnter(({ code }: { code: string }) => {
  changeMenu(code);
});

const onMarketSearch = (e: any) => {
  if (e.text) {
    store.commit('setSearchValue', e.text);
    router.push({ path: '/result' });
  } else {
    store.commit('commonUpdate', { active: ['finder'] });
    router.push({ path: '/finder' });
  }
};

watch(
  () => active.value[0],
  (key) => {
    if (['finder', 'result'].includes(key)) {
      window.flick.setSubInput(
        onMarketSearch,
        t('feature.market.search'),
        false
      );
      window.flick.detachInput.setValue(String(store.state.searchValue || ''));
      return;
    }
    window.flick.removeSubInput();
  },
  { immediate: true }
);

const init = () => store.dispatch('init');
init();
</script>
<style lang="less">
.ant-menu-submenu-popup {
  .ant-menu {
    background: var(--color-surface-raised) !important;
    height: 100%;
    border-right: none;
    .ant-menu-item,
    .ant-menu-submenu,
    .ant-menu-submenu-arrow {
      color: var(--color-text-content);
      &:active {
        background: none;
      }
    }
    .ant-menu-item-selected,
    .ant-menu-submenu-selected {
      background-color: var(--color-surface-selected);
      color: var(--color-accent-text);
      .ant-menu-submenu-arrow {
        color: var(--color-accent-text);
      }
      &:after {
        display: none;
      }
    }
  }
}
</style>
<style lang="less" scoped>
.main-container {
  -webkit-app-region: no-drag;
  display: flex;
  border-top: 1px solid var(--color-border-light);
  height: 100vh;
  box-sizing: border-box;
  align-items: flex-start;
  width: 100%;
  overflow: hidden;
  background: var(--color-sidebar-bg);
  .search {
    :deep(.ant-btn),
    :deep(.ant-input),
    :deep(.ant-input-group-addon) {
      color: var(--ant-primary-color) !important;
      background: var(--color-control-bg);
      border-color: var(--color-border-light);
    }
  }
  .container,
  .more {
    background: var(--color-canvas-bg);
    width: calc(~'100% - 208px');
    height: 100%;
    box-sizing: border-box;
    padding: 16px;
    position: relative;
    overflow: auto;
  }
  .left-menu {
    width: 208px;
    flex: 0 0 208px;
    padding: 10px 12px 12px;
    position: relative;
    height: 100vh;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-right: 1px solid var(--color-border-light);
    background: var(--color-sidebar-bg);
    .menu-scroll {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: var(--color-border-strong) transparent;
      &::-webkit-scrollbar {
        width: 5px;
      }
      &::-webkit-scrollbar-thumb {
        border-radius: 999px;
        background: transparent;
      }
      &:hover::-webkit-scrollbar-thumb {
        background: var(--color-border-strong);
      }
    }
    :deep(.ant-menu) {
      width: 100%;
      height: auto;
      border-right: 0;
      color: var(--color-text-content);
      background: transparent;
    }
    :deep(.ant-menu-item) {
      height: 38px;
      line-height: 38px;
      margin: 2px 0;
      padding-left: 12px !important;
      display: flex;
      align-items: center;
      border-radius: 8px;
      font-size: 14px;
      color: var(--color-text-content);
      .anticon {
        font-size: 16px;
      }
    }
    :deep(.ant-menu-item-group-title) {
      padding: 12px 12px 5px;
      color: var(--color-text-desc);
      font-size: 11px;
      line-height: 18px;
      letter-spacing: 0.08em;
    }
    :deep(.ant-menu-item-selected),
    :deep(.ant-menu-submenu-selected) {
      background-color: var(--color-surface-selected);
      border-radius: 6px;
      color: var(--color-accent-text);
    }
    :deep(.ant-menu-item:not(.ant-menu-item-selected):hover) {
      background: var(--color-surface-hover);
    }
    :deep(.ant-avatar) {
      background: transparent;
    }
    .account-entry {
      border: 1px solid transparent;
      background: transparent;
      color: var(--color-text-content);
      width: 100%;
      min-height: 58px;
      padding: 8px 9px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
      text-align: left;
      transition:
        background-color 0.16s ease,
        border-color 0.16s ease;
      &:hover {
        background: var(--color-surface-hover);
      }
      &.active {
        background: var(--color-surface-selected);
        border-color: var(--color-border-light);
        color: var(--color-accent-text);
      }
    }
    .account-copy {
      min-width: 0;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .account-name,
    .account-label {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .account-name {
      color: var(--color-text-primary);
      font-size: 13px;
      font-weight: 500;
    }
    .account-label {
      color: var(--color-text-desc);
      font-size: 11px;
    }
    .account-arrow {
      color: var(--color-text-desc);
      font-size: 11px;
    }
  }
}
</style>
