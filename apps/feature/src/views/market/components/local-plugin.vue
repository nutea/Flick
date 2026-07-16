<template>
  <div class="local-plugin">
    <div class="local-plugin__header">
      <h3 class="local-plugin__title">
        {{ $t('feature.market.localPlugin') }}
      </h3>

      <div class="local-plugin__action">
        <a-button type="primary" @click="visible = true">
          <template #icon><UploadOutlined /></template>
          {{ $t('feature.localPlugin.title') }}
        </a-button>

        <a-popconfirm
          placement="leftBottom"
          :title="$t('feature.localPlugin.deleteLocalPluginConfirm')"
          :ok-text="$t('feature.localPlugin.deleteLocalPluginConfirmText')"
          :cancel-text="$t('feature.localPlugin.deleteLocalPluginCancelText')"
          @confirm="handleDeleteClick"
        >
          <a-button type="danger">
            <template #icon><DeleteOutlined /></template>
            {{ $t('feature.localPlugin.deleteLocalPluginButton') }}
          </a-button>
        </a-popconfirm>
      </div>
    </div>
    <div class="local-plugin__list">
      <PluginList
        v-if="pluginList && !!pluginList.length"
        @downloadSuccess="downloadSuccess"
        :list="pluginList"
      />
    </div>
    <a-modal
      v-model:visible="visible"
      destroy-on-close
      :title="$t('feature.localPlugin.title')"
      :ok-text="$t('feature.localPlugin.okText')"
      :cancel-text="$t('feature.localPlugin.cancelText')"
      @ok="handleOk"
      @cancel="handleCancel"
    >
      <a-form>
        <a-alert :message="$t('feature.localPlugin.tips')" type="success" />

        <a-form-item
          :label="$t('feature.localPlugin.importType')"
          name="importType"
        >
          <a-radio-group v-model:value="formState.importType">
            <a-radio :value="1">
              {{ $t('feature.localPlugin.localImport') }}
            </a-radio>
            <a-radio :value="2">
              {{ $t('feature.localPlugin.remoteImport') }}
            </a-radio>
          </a-radio-group>
        </a-form-item>

        <a-form-item
          :label="$t('feature.localPlugin.localImport')"
          v-if="formState.importType == '1'"
          name="importFile"
        >
          <a-upload
            :maxCount="1"
            accept=".json"
            v-model:file-list="formState.importFile"
            :beforeUpload="() => false"
            name="file"
          >
            <a-button type="primary">
              <template #icon><UploadOutlined /></template>
              {{ $t('feature.localPlugin.importFile') }}
            </a-button>
          </a-upload>
        </a-form-item>

        <a-form-item
          :label="$t('feature.localPlugin.remoteImport')"
          v-if="formState.importType == '2'"
          name="importUrl"
        >
          <a-input
            v-model:value="formState.importUrl"
            :placeholder="$t('feature.localPlugin.importUrlPlaceholder')"
          />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup>
import { UploadOutlined, DeleteOutlined } from '@ant-design/icons-vue';
import { ref, reactive, getCurrentInstance, computed } from 'vue';
import { message } from 'ant-design-vue';
import PluginList from './plugin-list.vue';
import { useStore } from 'vuex';

const visible = ref(false);
const store = useStore();
const { proxy } = getCurrentInstance();
const pluginList = computed(() => {
  return store.state.totalPlugins.filter((i) => i['#type'] == 'localPlugin');
});
const formState = reactive({
  importType: 1,
  importFile: [],
  importUrl: '',
});
const handleOk = () => {
  if (formState.importType == 1 && !formState.importFile.length) {
    message.error(proxy.$t('feature.localPlugin.importFileErrorMsg'));
    return;
  }
  if (formState.importType == 2 && !formState.importUrl) {
    message.error(proxy.$t('feature.localPlugin.importUrlErrorMsg'));
    return;
  }
  if (formState.importType == 1) {
    readPlguinJsonByFile();
  } else {
    readPlguinJsonByUrl();
  }
};
const readPlguinJsonByFile = () => {
  const file = formState.importFile[0];
  const reader = new FileReader();
  reader.readAsText(file.originFileObj);
  reader.onload = () => {
    const json = JSON.parse(reader.result);
    configFetchSuccess(json);
  };
};
const readPlguinJsonByUrl = () => {
  fetch(formState.importUrl)
    .then((response) => response.json())
    .then((json) => {
      configFetchSuccess(json);
    });
};

// onMounted(() => {
//   const json = window.flick.db.get(LOCAL_PLUGIN_JSON);
//   pluginList.value = JSON.parse(json.data);
// });
const configFetchSuccess = (json) => {
  // 打上标记，表示本地插件
  const plugins = json.map((i) => ({ ...i, '#type': 'localPlugin' }));
  message.success(proxy.$t('feature.localPlugin.configFetchSuccess'));
  visible.value = false;
  formState.importFile = [];
  formState.importUrl = '';
  formState.importType = 1;
  store.dispatch('saveLocalPlugins', plugins);
};
const handleCancel = () => {
  visible.value = false;
  formState.importFile = [];
  formState.importUrl = '';
  formState.importType = 1;
};
const handleDeleteClick = async () => {
  await store.dispatch('deleteLocalPlugins');
  message.success(proxy.$t('feature.localPlugin.deleteLocalPluginSuccess'));
};
</script>

<style lang="less" scoped>
.local-plugin {
  &__header {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--color-border-light);
    padding-bottom: 16px;
    margin-bottom: 16px;
  }
  &__list {
    background-color: #fff;
  }
  &__title {
    font-weight: 500;
    color: var(--color-text-primary);
  }
  &__action {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 16px;
  }
}
</style>
