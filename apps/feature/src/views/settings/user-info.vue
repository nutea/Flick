<template>
  <div class="user-info">
    <div class="save-status" role="status" aria-live="polite">
      {{
        saved
          ? $t('feature.settings.account.saved')
          : $t('feature.settings.account.saving')
      }}
    </div>
    <div class="settings-container">
      <div class="setting-item">
        <div class="title">
          {{ $t('feature.settings.account.themeColor') }}
        </div>
        <div class="settings-item-li">
          <a-radio-group
            class="theme-selector"
            @change="changeTheme"
            v-model:value="theme"
            button-style="solid"
          >
            <a-radio-button value="SPRING">
              {{ $t('feature.settings.account.spring') }}
            </a-radio-button>
            <a-radio-button value="SUMMER">
              {{ $t('feature.settings.account.summer') }}
            </a-radio-button>
            <a-radio-button value="AUTUMN">
              {{ $t('feature.settings.account.autumn') }}
            </a-radio-button>
            <a-radio-button value="WINTER">
              {{ $t('feature.settings.account.winter') }}
            </a-radio-button>
          </a-radio-group>
        </div>
      </div>
      <div class="setting-item">
        <div class="title">
          {{ $t('feature.settings.account.personalized') }}
        </div>
        <div class="settings-item-li">
          <div class="label">
            {{ $t('feature.settings.account.greeting') }}
          </div>
          <a-input v-model:value="custom.placeholder" class="value"></a-input>
        </div>
        <div class="settings-item-li">
          <div class="label">
            {{ $t('feature.settings.account.name') }}
          </div>
          <a-input v-model:value="custom.username" class="value"></a-input>
        </div>
        <div class="settings-item-li">
          <div class="label">
            {{ $t('feature.settings.account.logo') }}
          </div>
          <div class="img-container">
            <img
              class="custom-img"
              :src="custom.logoUrl"
              :alt="$t('feature.settings.account.logo')"
            />
            <a-button
              class="btn"
              @click="changeLogo"
              shape="round"
              size="small"
              type="primary"
            >
              {{ $t('feature.settings.account.replace') }}
            </a-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, toRefs, watch, ref } from 'vue';
import debounce from 'lodash.debounce';
import localConfig from '@/confOp';
import * as Themes from '@/assets/constans';
const state = reactive({
  custom: {},
});

const { perf } = localConfig.getConfig();

const theme = ref(perf.custom.theme);
const saved = ref(true);

state.custom = perf.custom || {};

const setConfig = debounce(() => {
  const { perf } = localConfig.getConfig();

  localConfig.setConfig(
    JSON.parse(
      JSON.stringify({
        perf: {
          ...perf,
          custom: state.custom,
        },
      })
    )
  );
  window.market.reregisterShortcuts();
  saved.value = true;
}, 500);

watch(
  state,
  () => {
    saved.value = false;
    setConfig();
  },
  { deep: true }
);
const { custom } = toRefs(state);

const changeLogo = () => {
  const [logoPath] = window.flick.showOpenDialog({
    title: '请选择 logo 路径',
    filters: [{ name: 'images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    properties: ['openFile'],
  });
  if (!logoPath) return;
  state.custom.logo = `file://${logoPath}`;
  state.custom.logoUrl = window.flick.resolveConfiguredLogo(state.custom.logo);
};

const changeTheme = () => {
  state.custom = {
    ...state.custom,
    ...Themes[theme.value],
  };
};

// const reset = () => {
//   Modal.warning({
//     title: '确定恢复默认设置吗？',
//     content: '回复后之前的设置将会被清空',
//     onOk() {
//       const defaultcustom = remote.getGlobal('OP_CONFIG').getDefaultConfig()
//         .perf.custom;
//       state.custom = JSON.parse(JSON.stringify(defaultcustom));
//     },
//   });
// };
</script>

<style lang="less">
.ant-radio-button-wrapper {
  background: var(--color-body-bg);
  color: var(--color-text-content);
}
.theme-selector {
  overflow: hidden;
  border-radius: 2px;
}
.user-info-result {
  padding: 0;
  .theme-preview {
    width: 20px;
    height: 20px;
    border-radius: 100%;
  }
  &.ant-result {
    padding: 24px;
  }
  .icon {
    font-size: 48px;
  }
  .ant-result-icon {
    margin-bottom: 12px;
  }
  .ant-result-title {
    font-size: 18px;
  }
}
.img-container {
  width: min(300px, 100%);
  .btn {
    margin-left: 10px;
    font-size: 12px;
  }
}
.custom-img {
  width: 60px;
  height: 60px;
  object-fit: cover;
  border-radius: 14px;
  border: 1px solid var(--color-border-light);
}
.save-status {
  margin: -4px 0 12px;
  color: var(--color-text-desc);
  font-size: 12px;
  text-align: right;
}
.footer-btn {
  text-align: right;
  border-top: 1px dashed var(--color-border-strong);
  padding-top: 12px;
}
</style>
