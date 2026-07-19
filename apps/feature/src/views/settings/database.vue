<template>
  <div class="export-header">
    <a-button
      @click="exportData"
      :loading="syncing === 'backup'"
      :disabled="Boolean(syncing && syncing !== 'backup')"
      size="small"
      type="primary"
      style="margin-right: 10px"
    >
      备份到 WebDAV
      <template #icon>
        <ExportOutlined />
      </template>
    </a-button>
    <a-button
      @click="importData"
      :loading="syncing === 'restore'"
      :disabled="Boolean(syncing && syncing !== 'restore')"
      danger
      size="small"
      style="margin-right: 10px; background-color: var(--color-input-hover)"
    >
      从 WebDAV 恢复
      <template #icon>
        <ImportOutlined />
      </template>
    </a-button>
    <a-tooltip title="WebDAV 账户设置">
      <a-button
        type="text"
        size="small"
        aria-label="WebDAV 账户设置"
        @click="showSetting = true"
      >
        <template #icon><SettingOutlined /></template>
      </a-button>
    </a-tooltip>
  </div>
  <a-empty v-if="!dataPlugins.length" description="暂无可同步的插件数据" />
  <a-list item-layout="horizontal" :data-source="dataPlugins">
    <template #renderItem="{ item }">
      <a-list-item>
        <template #actions>
          <a
            v-if="item.canDownload && !item.plugin?.isloading"
            key="list-loadmore-edit"
            @click="() => downloadPlugin(item.plugin)"
          >
            <CloudDownloadOutlined style="font-size: 18px" />
          </a>
          <a v-if="item.plugin?.isloading" key="list-loadmore-edit">
            <LoadingOutlined style="font-size: 18px" />
          </a>
          <a key="list-loadmore-edit" @click="() => showKeys(item)">
            <DatabaseOutlined style="font-size: 18px" />
          </a>
        </template>
        <a-list-item-meta>
          <template #title>
            <div style="color: var(--color-text-content)">
              <span>{{ item.plugin?.pluginName }}</span>
            </div>
          </template>
          <template #avatar>
            <a-avatar
              v-if="item.plugin?.logoUrl"
              shape="square"
              :src="item.plugin.logoUrl"
            />
            <a-avatar v-else shape="square" class="fallback-avatar">
              <template #icon><AppstoreOutlined /></template>
            </a-avatar>
          </template>
          <template #description>
            <div style="color: var(--color-text-desc)">
              <span>{{ item.keys.length }} 项同步数据</span>
            </div>
          </template>
        </a-list-item-meta>
      </a-list-item>
    </template>
  </a-list>
  <a-drawer
    v-model:visible="open"
    width="400"
    :closable="true"
    :title="currentSelect.plugin?.pluginName || '同步数据'"
    placement="right"
    class="exportDrawer"
  >
    <p
      class="key-item"
      role="button"
      tabindex="0"
      :key="key"
      @click="() => showDetail(key)"
      @keydown.enter.prevent="() => showDetail(key)"
      @keydown.space.prevent="() => showDetail(key)"
      v-for="key in currentSelect.keys"
    >
      {{ key }}
    </p>
  </a-drawer>
  <a-modal
    centered
    :bodyStyle="{
      maxHeight: '500px',
      overflow: 'auto',
      backgroundColor: 'var(--color-body-bg)',
      color: 'var(--color-text-primary)',
    }"
    :footer="null"
    :closable="true"
    v-model:visible="show"
  >
    <pre>{{ JSON.stringify(detail, null, 2) }}</pre>
  </a-modal>
  <a-modal
    v-model:visible="showSetting"
    title="WebDAV 账户配置"
    :footer="null"
    class="webdavModel"
  >
    <a-alert
      v-if="formState.suport === 'jianguo'"
      style="margin-bottom: 20px"
      type="info"
      show-icon
    >
      <template #message>
        <div @click="openHelp" class="openHelp">
          点击查看如何获取坚果云账号密码
        </div>
      </template>
    </a-alert>
    <a-form
      :model="formState"
      name="basic"
      :label-col="{ span: 8 }"
      :wrapper-col="{ span: 16 }"
      autocomplete="off"
      @finish="handleOk"
    >
      <a-form-item label="webdav 提供商" name="suport">
        <a-select v-model:value="formState.suport">
          <a-select-option value="jianguo">坚果云</a-select-option>
          <a-select-option value="auto">自定义</a-select-option>
        </a-select>
      </a-form-item>
      <a-form-item
        label="服务器地址"
        name="url"
        v-show="formState.suport === 'auto'"
        :rules="[{ required: true, message: '请填写服务器地址!' }]"
      >
        <a-input v-model:value="formState.url" />
      </a-form-item>
      <a-form-item
        label="账户"
        name="username"
        :rules="[{ required: true, message: '请填写 username!' }]"
      >
        <a-input v-model:value="formState.username" />
      </a-form-item>
      <a-form-item
        label="密码"
        name="password"
        :rules="[{ required: true, message: '请填写 password!' }]"
      >
        <a-input-password v-model:value="formState.password" />
      </a-form-item>
      <a-form-item :wrapper-col="{ offset: 8, span: 16 }">
        <a-button type="primary" html-type="submit">保存设置</a-button>
      </a-form-item>
    </a-form>
  </a-modal>
</template>
<script setup>
import { useStore } from 'vuex';
import { computed, ref, reactive } from 'vue';
import {
  DatabaseOutlined,
  CloudDownloadOutlined,
  LoadingOutlined,
  ExportOutlined,
  ImportOutlined,
  SettingOutlined,
  AppstoreOutlined,
} from '@ant-design/icons-vue';
import { message, Modal } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import featureLogoUrl from '../../assets/logo.png';
import { toMarketPayload } from '@/utils/marketPayload';

const { t } = useI18n();

const open = ref(false);
const show = ref(false);
const showSetting = ref(false);
const syncing = ref('');
const currentSelect = ref({ plugin: {} });
const detail = ref({});

const defaultConfig = window.flick.dbStorage.getItem('flick-db-jg-webdav') || {
  url: 'https://dav.jianguoyun.com/dav/',
  username: '',
  password: '',
};

if (!defaultConfig.suport) {
  defaultConfig.suport = 'jianguo';
}

const formState = reactive(defaultConfig);

const showKeys = (item) => {
  open.value = true;
  currentSelect.value = item;
};

const handleOk = () => {
  window.flick.dbStorage.setItem(
    'flick-db-jg-webdav',
    JSON.parse(JSON.stringify(formState))
  );
  message.success('保存成功');
  showSetting.value = false;
};

const showDetail = (key) => {
  show.value = true;
  detail.value = window.flick.db.get(key);
};

const exportData = async () => {
  if (!formState.password || !formState.username) {
    return (showSetting.value = true);
  }
  syncing.value = 'backup';
  try {
    await window.market.dbDump(JSON.parse(JSON.stringify(formState)));
    message.success('备份任务已提交');
  } catch {
    message.error('备份失败，请检查 WebDAV 配置和网络状态');
  } finally {
    syncing.value = '';
  }
};

const importData = () => {
  if (!formState.password || !formState.username) {
    return (showSetting.value = true);
  }
  Modal.confirm({
    title: '确认从 WebDAV 恢复？',
    content: '恢复操作会覆盖本地数据，建议先完成一次备份。是否继续？',
    async onOk() {
      syncing.value = 'restore';
      try {
        await window.market.dbImport(JSON.parse(JSON.stringify(formState)));
        message.success('数据恢复任务已提交');
      } catch {
        message.error('恢复失败，请检查 WebDAV 配置和网络状态');
        throw new Error('RESTORE_FAILED');
      } finally {
        syncing.value = '';
      }
    },
  });
};

const openHelp = () => {
  window.flick.shellOpenExternal('https://help.jianguoyun.com/?p=2064');
};

const store = useStore();

const pluginsData = window.flick.db.get('FLICK_PLUGIN_INFO');

const totalPlugins = computed(() => store.state.totalPlugins);

const SYSTEM_FEATURE_ALIASES = new Set([
  'flick-system-feature',
  '设置中心',
  '偏好设置',
  '插件市场',
]);

const normalizePluginDataIndex = (items) => {
  const grouped = new Map();
  items.forEach((item) => {
    if (!item?.name) return;
    const name = SYSTEM_FEATURE_ALIASES.has(item.name)
      ? 'flick-system-feature'
      : item.name;
    const current = grouped.get(name) || { name, keys: [] };
    current.keys = Array.from(
      new Set([
        ...current.keys,
        ...(Array.isArray(item.keys) ? item.keys.filter(Boolean) : []),
      ])
    );
    grouped.set(name, current);
  });
  return Array.from(grouped.values());
};

const dataPlugins = computed(() => {
  if (!pluginsData) return [];
  return normalizePluginDataIndex(pluginsData.data || []).map((item) => {
    let plugin = null;
    let canDownload = false;
    if (item.name === 'flick-system-feature') {
      plugin = {
        name: item.name,
        pluginName: '主程序',
        description: 'Flick 设置、历史记录与功能配置',
        isdownload: true,
        logoUrl: featureLogoUrl,
      };
    } else if (item.name === 'flick-system-super-panel') {
      plugin = {
        name: item.name,
        pluginName: '超级面板',
        isdownload: true,
        logoUrl: featureLogoUrl,
      };
    } else {
      const installedPlugin = (store.state.localPlugins || []).find(
        (p) => p.name === item.name
      );
      const catalogPlugin = (totalPlugins.value || []).find(
        (p) => p.name === item.name
      );
      plugin = installedPlugin || catalogPlugin;
      canDownload = Boolean(catalogPlugin && !installedPlugin);
    }
    if (!plugin) {
      plugin = {
        name: item.name,
        pluginName: `${item.name}（插件未安装）`,
        description: '保留的历史同步数据',
        isdownload: true,
        logoUrl: '',
      };
    }
    const data = item.keys.map((key) => window.flick.db.get(key));
    return {
      ...item,
      plugin,
      canDownload,
      data,
    };
  });
});

const startDownload = (name) => store.dispatch('startDownload', name);
const successDownload = (name) => store.dispatch('successDownload', name);
const errorDownload = (name) => store.dispatch('errorDownload', name);

const downloadPlugin = async (plugin) => {
  await startDownload(plugin.name);
  try {
    await window.market.downloadPlugin(toMarketPayload(plugin));
    await successDownload(plugin.name);
    message.success(
      t('feature.dev.installSuccess', { pluginName: plugin.name })
    );
  } catch (error) {
    await errorDownload(plugin.name);
    const reason = error instanceof Error ? error.message : String(error || '');
    message.error(reason ? `插件安装失败：${reason}` : '插件安装失败，请重试');
  }
};
</script>
<style lang="less">
.openHelp {
  cursor: pointer;
  text-decoration: underline;
}
.export-header {
  width: 100%;
  min-height: 48px;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  border-bottom: 1px solid var(--color-border-light);
  margin-bottom: 8px;
  .ant-btn {
    margin-right: 0 !important;
  }
}
.key-item {
  cursor: pointer;

  &:hover {
    color: var(--ant-primary-color);
  }
}
.fallback-avatar {
  background: var(--color-surface-subtle);
  color: var(--color-text-desc);
}
.exportDrawer {
  .ant-drawer-header {
    background-color: var(--color-body-bg);
    border-bottom: 1px solid var(--color-border-light);
    .ant-drawer-title {
      color: var(--color-text-primary);
    }
  }
  .ant-drawer-body {
    background-color: var(--color-body-bg);
    color: var(--color-text-content);
  }
}
.webdavModel {
  .ant-modal-close-x {
    color: var(--color-text-content);
  }
  .ant-modal-header {
    background-color: var(--color-body-bg);
    border-bottom: 1px solid var(--color-border-light);
    .ant-modal-title {
      color: var(--color-text-primary);
    }
  }
  .ant-form-item-label > label {
    color: var(--color-text-content);
  }
  .ant-modal-body {
    background-color: var(--color-body-bg);
    .ant-input,
    .ant-input-password,
    .ant-select-selector {
      background: var(--color-input-hover) !important;
      color: var(--color-text-content);
    }
    .ant-input-password-icon,
    .ant-select-arrow {
      color: var(--color-action-color);
    }
  }
}
</style>
