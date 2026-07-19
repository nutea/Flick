<template>
  <div class="dev settings-page">
    <div class="view-container settings-card">
      <a-alert
        style="margin-bottom: 20px"
        :message="$t('feature.dev.tips')"
        type="warning"
      />
      <a-form
        ref="formRef"
        :model="formState"
        :rules="rules"
        layout="vertical"
        class="dev-form"
      >
        <a-form-item :label="$t('feature.dev.pluginName')" name="name">
          <a-input v-model:value="formState.name" />
        </a-form-item>

        <a-form-item>
          <a-button :loading="loading" type="primary" @click="onSubmit">
            {{ $t('feature.dev.install') }}
          </a-button>
          <a-button @click="refresh" style="margin-left: 10px">
            {{ $t('feature.dev.refreshPlugins') }}
          </a-button>
        </a-form-item>
      </a-form>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { message } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
const { t } = useI18n();

const formRef = ref();
const formState = reactive({
  name: undefined,
});
const rules = {
  name: {
    required: true,
    message: t('feature.dev.nameRequired'),
  },
};
const onSubmit = () => {
  formRef.value.validate().then(() => {
    downloadPlugin(formState.name);
  });
};

const loading = ref(false);
const downloadPlugin = async (pluginName) => {
  loading.value = true;
  try {
    await window.market.downloadPlugin({
      name: pluginName,
      isDev: true,
    });
    message.success(
      t('feature.dev.installSuccess', { pluginName: pluginName })
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error || '');
    message.error(reason ? `插件安装失败：${reason}` : '插件安装失败，请重试');
  } finally {
    loading.value = false;
  }
};

const refresh = () => {
  formRef.value.validate().then(() => {
    window.market.refreshPlugin({
      name: formState.name,
    });
    message.success(
      t('feature.dev.refreshSuccess', { pluginName: formState.name })
    );
  });
};
</script>

<style lang="less" scoped>
.dev {
  .view-container {
    min-height: 360px;
    padding: 24px 26px;
  }
  .dev-form {
    max-width: 620px;
  }
  :deep(label) {
    color: var(--color-text-content);
  }
  :deep(.ant-input) {
    background: var(--color-input-hover) !important;
    color: var(--color-text-content);
  }
}

@media (max-width: 900px) {
  .dev .view-container {
    padding: 18px 16px;
  }
}
</style>
