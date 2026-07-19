<template>
  <a-alert
    :message="$t('feature.settings.intranet.tipsTitle')"
    :description="$t('feature.settings.intranet.tips')"
    type="info"
    show-icon
    class="source-alert"
  />
  <a-form
    name="custom-validation"
    ref="formRef"
    :model="formState"
    :rules="rules"
    layout="vertical"
    class="source-form"
  >
    <a-form-item
      has-feedback
      :label="$t('feature.settings.intranet.npmMirror')"
      name="register"
    >
      <a-input
        placeholder="https://registry.npmmirror.com"
        v-model:value="formState.register"
      />
    </a-form-item>
    <a-form-item
      has-feedback
      :label="$t('feature.settings.intranet.dbUrl')"
      name="database"
    >
      <a-input
        placeholder="https://gitee.com/monkeyWang/rubickdatabase/raw/master"
        v-model:value="formState.database"
      />
    </a-form-item>
    <a-form-item
      has-feedback
      :label="$t('feature.settings.intranet.accessToken')"
      name="access_token"
    >
      <a-input-password
        :placeholder="$t('feature.settings.intranet.placeholder')"
        v-model:value="formState.access_token"
      />
    </a-form-item>
    <div class="source-actions">
      <a-button :loading="saving" @click="submit" type="primary">保存</a-button>
      <a-button
        :loading="testing"
        style="margin-left: 10px"
        @click="testConnection"
      >
        测试连接
      </a-button>
      <a-button style="margin-left: 10px" @click="resetForm">恢复默认</a-button>
    </div>
  </a-form>
</template>
<script lang="ts" setup>
import { ref, toRaw } from 'vue';
import { message } from 'ant-design-vue';
import {
  DEFAULT_MARKET_SOURCE_CONFIG,
  resolveMarketSourceConfig,
} from '@/assets/marketConfig';

let _rev: any;

let defaultConfig = resolveMarketSourceConfig(undefined);

try {
  const dbdata = window.flick.db.get('flick-localhost-config');
  defaultConfig = resolveMarketSourceConfig(dbdata?.data);
  _rev = dbdata._rev;
} catch (e) {
  // ignore
}

const formState = ref(JSON.parse(JSON.stringify(defaultConfig)));
const formRef = ref();
const testing = ref(false);
const saving = ref(false);

const rules = {
  register: [{ required: true, type: 'url', trigger: 'change' }],
  database: [{ required: true, type: 'url', trigger: 'change' }],
};
const resetForm = () => {
  formState.value = { ...DEFAULT_MARKET_SOURCE_CONFIG };
};

const testConnection = async () => {
  testing.value = true;
  try {
    await formRef.value?.validate();
    const result = await window.market.testSourceConnection(
      JSON.parse(JSON.stringify(toRaw(formState.value)))
    );
    if (!result?.ok) throw new Error();
    message.success('连接测试成功');
    return true;
  } catch {
    message.error('连接失败，请检查地址、访问令牌和网络状态');
    return false;
  } finally {
    testing.value = false;
  }
};

const submit = async () => {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  saving.value = true;
  const changeData: any = {
    _id: 'flick-localhost-config',
    data: toRaw(formState.value),
  };

  if (_rev) {
    changeData._rev = _rev;
  }

  try {
    const result = window.flick.db.put(changeData);
    _rev = result?.rev || _rev;
    message.success('保存成功，重新打开设置中心后生效');
  } finally {
    saving.value = false;
  }
};
</script>

<style lang="less" scoped>
.source-alert {
  margin-bottom: 24px;
}
.source-form {
  width: 100%;
  max-width: 680px;
  :deep(.ant-form-item) {
    margin-bottom: 18px;
    label {
      color: var(--color-text-content);
      font-weight: 500;
    }
  }
}
.source-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding-top: 4px;
  .ant-btn {
    margin-left: 0 !important;
    min-width: 96px;
  }
}
:deep(.ant-input),
:deep(.ant-input-password) {
  background: var(--color-control-bg);
  color: var(--color-text-content);
}

@media (max-width: 700px) {
  .source-actions {
    .ant-btn {
      flex: 1;
    }
  }
}
</style>
