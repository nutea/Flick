<template>
  <div class="settings settings-page">
    <div class="view-container settings-card">
      <div class="settings-detail">
        <UserInfo v-if="props.section === 'userInfo'" />
        <div v-if="props.section === 'normal'">
          <div class="setting-item">
            <div class="title">
              {{ $t('feature.settings.basic.shortcutKey') }}
            </div>
            <div class="settings-item-li">
              <div class="label">
                {{ $t('feature.settings.basic.showOrHiddle') }}
              </div>
              <a-tooltip placement="top" trigger="click">
                <template #title>
                  <span>{{ tipText }}</span>
                  <template v-if="isWindows">
                    <br />
                    <span
                      style="cursor: pointer; text-decoration: underline"
                      @click="resetDefault('Alt')"
                    >
                      Alt+Space
                    </span>
                    <span
                      style="
                        cursor: pointer;
                        margin-left: 8px;
                        text-decoration: underline;
                      "
                      @click="resetDefault('Ctrl')"
                    >
                      Ctrl+Space
                    </span>
                  </template>
                </template>
                <button
                  type="button"
                  class="value shortcut-recorder"
                  @keydown.prevent="(e) => changeShortCut(e, 'showAndHidden')"
                >
                  {{ shortCut.showAndHidden }}
                </button>
              </a-tooltip>
            </div>
            <div class="settings-item-li">
              <div class="label">
                {{ $t('feature.settings.basic.screenCapture') }}
              </div>
              <a-tooltip placement="top" trigger="click">
                <template #title>
                  <span>{{ tipText }}</span>
                </template>
                <button
                  type="button"
                  class="value shortcut-recorder"
                  @keydown.prevent="(e) => changeShortCut(e, 'capture')"
                >
                  {{ shortCut.capture }}
                </button>
              </a-tooltip>
            </div>
          </div>
          <div class="setting-item">
            <div class="title">{{ $t('feature.settings.basic.common') }}</div>
            <div class="settings-item-li">
              <div class="label">
                {{ $t('feature.settings.basic.autoPaste') }}
              </div>
              <a-switch
                v-model:checked="common.autoPast"
                :checked-children="$t('feature.settings.basic.on')"
                :un-checked-children="$t('feature.settings.basic.off')"
              ></a-switch>
            </div>
            <div class="settings-item-li">
              <div class="label">
                {{ $t('feature.settings.basic.autoBoot') }}
              </div>
              <a-switch
                v-model:checked="common.start"
                :checked-children="$t('feature.settings.basic.on')"
                :un-checked-children="$t('feature.settings.basic.off')"
              ></a-switch>
            </div>
            <div class="settings-item-li">
              <div class="label">
                {{ $t('feature.settings.basic.history') }}
              </div>
              <a-switch
                v-model:checked="common.history"
                :checked-children="$t('feature.settings.basic.on')"
                :un-checked-children="$t('feature.settings.basic.off')"
              ></a-switch>
            </div>
          </div>
          <div class="setting-item">
            <div class="title">{{ $t('feature.settings.basic.theme') }}</div>
            <div class="settings-item-li">
              <div class="label">
                {{ $t('feature.settings.basic.darkMode') }}
              </div>
              <a-switch
                v-model:checked="common.darkMode"
                :checked-children="$t('feature.settings.basic.on')"
                :un-checked-children="$t('feature.settings.basic.off')"
              ></a-switch>
            </div>
          </div>
          <div class="setting-item">
            <div class="title">{{ $t('feature.settings.basic.language') }}</div>
            <div class="settings-item-li">
              <div class="label">
                {{ $t('feature.settings.basic.changeLang') }}
              </div>
              <a-select
                v-model:value="state.common.lang"
                style="width: 240px"
                :options="options"
                @change="changeLanguage"
              ></a-select>
            </div>
          </div>
        </div>
        <div v-if="props.section === 'global'">
          <a-collapse>
            <a-collapse-panel
              key="1"
              :header="$t('feature.settings.global.instructions')"
            >
              <div>
                {{ $t('feature.settings.global.tips') }}
              </div>
              <h3 style="margin-top: 10px">
                {{ $t('feature.settings.global.example') }}
              </h3>
              <a-divider style="margin: 5px 0" />
              <a-list item-layout="horizontal" :data-source="examples">
                <template #renderItem="{ item }">
                  <a-list-item>
                    <a-list-item-meta :description="item.desc">
                      <template #title>
                        <div>{{ item.title }}</div>
                      </template>
                    </a-list-item-meta>
                  </a-list-item>
                </template>
              </a-list>
            </a-collapse-panel>
          </a-collapse>
          <div class="shortcut-list" role="list">
            <div
              v-for="(item, index) in global"
              :key="index"
              class="shortcut-row"
              role="listitem"
            >
              <div class="shortcut-field">
                <label>{{ $t('feature.settings.global.shortcutKey') }}</label>
                <a-tooltip placement="top" trigger="click">
                  <template #title>
                    <span>{{ tipText }}</span>
                  </template>
                  <button
                    type="button"
                    class="value shortcut-recorder"
                    :class="{
                      'has-conflict': hasShortcutConflict(item.key, index),
                    }"
                    @keydown.prevent="(e) => changeGlobalKey(e, index)"
                  >
                    {{
                      item.key || $t('feature.superPanelShortcut.captureHint')
                    }}
                  </button>
                </a-tooltip>
                <span
                  v-if="hasShortcutConflict(item.key, index)"
                  class="field-error"
                >
                  {{ $t('feature.settings.global.conflict') }}
                </span>
              </div>
              <div class="shortcut-field shortcut-command">
                <label>{{ $t('feature.settings.global.funtionKey') }}</label>
                <a-input
                  :value="item.value"
                  allowClear
                  :disabled="!item.key"
                  @change="(e) => changeGlobalValue(index, e.target.value)"
                />
              </div>
              <a-button
                type="text"
                danger
                class="shortcut-delete"
                :aria-label="$t('feature.settings.global.removeShortcut')"
                @click="deleteGlobalKey(index)"
              >
                <template #icon><DeleteOutlined /></template>
              </a-button>
            </div>
          </div>
          <button type="button" @click="addConfig" class="add-global">
            <PlusCircleOutlined />
            {{ $t('feature.settings.global.addShortcutKey') }}
          </button>
        </div>
        <Localhost v-if="props.section === 'localhost'" />
        <LocalStart v-if="props.section === 'localstart'" />
        <DataBase v-if="props.section === 'database'" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { DeleteOutlined, PlusCircleOutlined } from '@ant-design/icons-vue';
import debounce from 'lodash.debounce';
import { ref, reactive, watch, toRefs, computed } from 'vue';
import keycodes from './keycode';
import Localhost from './localhost.vue';
import UserInfo from './user-info.vue';
import LocalStart from './local-start.vue';
import DataBase from './database.vue';
import { useI18n } from 'vue-i18n';
import localConfig from '@/confOp';

const { locale, t } = useI18n();

const props = defineProps({
  section: {
    type: String,
    default: 'normal',
  },
});

const examples = [
  {
    title: t('feature.settings.global.example1'),
    desc: t('feature.settings.global.tips1'),
  },
  {
    title: t('feature.settings.global.example2'),
    desc: t('feature.settings.global.tips2'),
  },
];

const state = reactive({
  shortCut: {},
  common: {},
  local: {},
  global: [],
  custom: {},
});

// 添加lastKeyPressTime变量来跟踪按键时间
const lastKeyPressTime = ref(0);
const DOUBLE_CLICK_THRESHOLD = 300; // 双击时间阈值（毫秒）

const isWindows = window?.flick?.isWindows();
const tipText = computed(() => {
  const optionKeyName = isWindows ? 'Alt' : 'Option、Command';
  return (
    t('feature.settings.global.addShortcutKeyTips', {
      optionKeyName: optionKeyName,
    }) + `此外你也可以双击修饰键如（Ctrl+Ctrl）`
  );
});

const { perf, global: defaultGlobal } = localConfig.getConfig();

state.shortCut = perf.shortCut;
state.custom = perf.custom;
state.common = perf.common;
state.local = perf.local;
state.global = defaultGlobal;

const setConfig = debounce(() => {
  const { perf } = localConfig.getConfig();
  localConfig.setConfig(
    JSON.parse(
      JSON.stringify({
        perf: {
          ...perf,
          shortCut: state.shortCut,
          common: state.common,
          local: state.local,
        },
        global: state.global,
      })
    )
  );
  window.market.reregisterShortcuts();
}, 500);

watch(state, setConfig);

const changeShortCut = (e, key) => {
  let compose = '';
  const currentTime = Date.now();
  const isDoubleClick =
    currentTime - lastKeyPressTime.value < DOUBLE_CLICK_THRESHOLD;
  lastKeyPressTime.value = currentTime;

  // 处理 F1-F12 功能键
  if (e.keyCode >= 112 && e.keyCode <= 123) {
    state.shortCut[key] = keycodes[e.keyCode].toUpperCase();
    return;
  }

  // 处理双击功能键的情况
  if (isDoubleClick) {
    if (e.keyCode === 17) {
      // Ctrl
      state.shortCut[key] = 'Ctrl+Ctrl';
      return;
    }
    if (e.keyCode === 18) {
      // Alt
      state.shortCut[key] = 'Option+Option';
      return;
    }
    if (e.keyCode === 16) {
      // Shift
      state.shortCut[key] = 'Shift+Shift';
      return;
    }
    if (e.keyCode === 93) {
      // Command
      state.shortCut[key] = 'Command+Command';
      return;
    }
  }

  // 处理功能键+普通键的组合
  let hasModifierKey = false;

  if (e.ctrlKey && e.keyCode !== 17) {
    compose += '+Ctrl';
    hasModifierKey = true;
  }
  if (e.shiftKey && e.keyCode !== 16) {
    compose += '+Shift';
    hasModifierKey = true;
  }
  if (e.altKey && e.keyCode !== 18) {
    compose += '+Option';
    hasModifierKey = true;
  }
  if (e.metaKey && e.keyCode !== 93) {
    compose += '+Command';
    hasModifierKey = true;
  }

  // 只有当有修饰键时才添加普通键
  if (hasModifierKey) {
    compose += '+' + keycodes[e.keyCode].toUpperCase();
    compose = compose.substring(1);
    state.shortCut[key] = compose;
  } else {
    // 不做处理
  }
};

const changeGlobalKey = (e, index) => {
  let compose = '';
  // 添加是否包含功能键的判断
  let incluFuncKeys = false;
  if (e.ctrlKey && e.keyCode !== 17) {
    compose += '+Ctrl';
    incluFuncKeys = true;
  }
  if (e.shiftKey && e.keyCode !== 16) {
    compose += '+Shift';
    incluFuncKeys = true;
  }
  if (e.altKey && e.keyCode !== 18) {
    compose += '+Option';
    incluFuncKeys = true;
  }
  if (e.metaKey && e.keyCode !== 93) {
    compose += '+Command';
    incluFuncKeys = true;
  }
  compose += '+' + keycodes[e.keyCode].toUpperCase();
  compose = compose.substring(1);
  if (
    incluFuncKeys &&
    e.keyCode !== 16 &&
    e.keyCode !== 17 &&
    e.keyCode !== 18 &&
    e.keyCode !== 93
  ) {
    state.global[index].key = compose;
  } else {
    // 不做处理
  }
  // f1 - f12
  if (!incluFuncKeys && e.keyCode >= 112 && e.keyCode <= 123) {
    compose = keycodes[e.keyCode].toUpperCase();
    state.global[index].key = compose;
  }
};

const resetDefault = (key) => {
  switch (key) {
    case 'Alt':
      state.shortCut['showAndHidden'] = 'Option+SPACE';
      // copyValue.value = "Option+SPACE";
      break;
    case 'Ctrl':
      state.shortCut['showAndHidden'] = 'Ctrl+SPACE';
      // copyValue.value = "Ctrl+SPACE";
      break;
    default:
      break;
  }
  setConfig();
};

const changeGlobalValue = (index, value) => {
  state.global[index].value = value;
};

const deleteGlobalKey = (index) => {
  state.global.splice(index, 1);
  // delete state.global[index];
};

const hasShortcutConflict = (key, currentIndex) =>
  Boolean(
    key &&
    state.global.some(
      (item, index) => index !== currentIndex && item.key === key
    )
  );

const addConfig = () => {
  state.global.push({
    key: '',
    value: '',
  });
};

const { shortCut, common, global } = toRefs(state);

const options = ref([
  {
    value: 'zh-CN',
    label: t('feature.settings.basic.cn'),
  },
  {
    value: 'en-US',
    label: t('feature.settings.basic.en'),
  },
]);

const changeLanguage = (value) => {
  state.common.lang = value;
  locale.value = value;
};
</script>

<style lang="less">
.settings {
  box-sizing: border-box;
  width: 100%;
  max-width: 1040px;
  min-height: 100%;
  margin: 0 auto;
  padding: 4px 8px 24px;
  overflow: visible;
  background: transparent;
  .view-container {
    border: 1px solid var(--color-border-light);
    border-radius: 12px;
    background: var(--color-body-bg);
    overflow: hidden;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04);
  }

  .settings-detail {
    min-height: 360px;
    padding: 24px 26px;
    box-sizing: border-box;
    background: var(--color-body-bg);

    .setting-item {
      margin-bottom: 22px;
      padding-bottom: 22px;
      border-bottom: 1px solid var(--color-border-light);
      &:last-child {
        margin-bottom: 0;
        padding-bottom: 0;
        border-bottom: 0;
      }

      .ant-form-item {
        margin-bottom: 0;
      }

      .title {
        color: var(--color-text-primary);
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 12px;
      }

      .settings-item-li {
        min-height: 42px;
        padding: 0 4px;
        display: flex;
        width: 100%;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 4px;

        .label {
          color: var(--color-text-content);
        }

        .value {
          width: 300px;
          cursor: pointer;
          text-align: center;
          border: 1px solid var(--color-border-light);
          color: var(--color-accent-text);
          font-size: 14px;
          min-height: 34px;
          line-height: 32px;
          border-radius: 8px;
          font-weight: lighter;
          background: var(--color-input-hover);
          .ant-input {
            text-align: center;
            color: var(--color-accent-text);
            font-size: 14px;
            font-weight: lighter;
            background: var(--color-input-hover);
          }
        }

        .shortcut-recorder {
          appearance: none;
          padding: 0 12px;
          font-family: inherit;
          &:hover,
          &:focus-visible {
            border-color: var(--ant-primary-color);
          }
        }

        .ant-switch {
          &:not(.ant-switch-checked) {
            background: var(--color-list-hover);
          }
        }
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
  }

  .shortcut-list {
    margin-top: 16px;
    display: grid;
    gap: 10px;
  }

  .shortcut-row {
    display: grid;
    grid-template-columns: minmax(180px, 0.8fr) minmax(220px, 1.2fr) 36px;
    align-items: end;
    gap: 12px;
    padding: 12px;
    border: 1px solid var(--color-border-light);
    border-radius: 10px;
    background: var(--color-surface-subtle);
  }

  .shortcut-field {
    display: grid;
    gap: 6px;
    min-width: 0;
    label {
      color: var(--color-text-desc);
      font-size: 12px;
    }
    .ant-input-affix-wrapper {
      min-height: 36px;
      background: var(--color-input-hover);
    }
  }

  .shortcut-recorder {
    appearance: none;
    width: 100%;
    min-height: 36px;
    padding: 0 12px;
    cursor: pointer;
    border: 1px solid var(--color-border-light);
    border-radius: 8px;
    background: var(--color-input-hover);
    color: var(--color-accent-text);
    font: inherit;
    text-align: center;
    &:hover,
    &:focus-visible {
      border-color: var(--ant-primary-color);
    }
    &.has-conflict {
      border-color: var(--ant-error-color);
    }
  }

  .field-error {
    color: var(--ant-error-color);
    font-size: 12px;
  }

  .shortcut-delete {
    width: 36px;
    height: 36px;
  }

  .add-global {
    color: var(--color-accent-text);
    margin-top: 20px;
    width: 100%;
    min-height: 40px;
    text-align: center;
    cursor: pointer;
    border: 1px dashed var(--color-border-strong);
    border-radius: 8px;
    background: transparent;
    &:hover {
      border-color: var(--ant-primary-color);
      background: var(--color-surface-subtle);
    }
  }

  .ant-collapse {
    background: var(--color-input-hover);
    .ant-collapse-content {
      background: var(--color-input-hover);
      color: var(--color-text-content);
    }

    h3,
    .ant-collapse-header,
    .ant-list-item-meta-title {
      color: var(--color-text-primary);
    }

    .ant-list-item-meta-description {
      color: var(--color-text-desc);
    }
  }
}

@media (max-width: 900px) {
  .settings {
    .settings-detail {
      padding: 18px 16px;
      .setting-item .settings-item-li {
        align-items: flex-start;
        flex-direction: column;
        gap: 8px;
        padding: 8px 0;
        .value,
        .ant-select {
          width: 100% !important;
        }
      }
    }
    .shortcut-row {
      grid-template-columns: 1fr 36px;
    }
    .shortcut-command {
      grid-column: 1;
    }
    .shortcut-delete {
      grid-column: 2;
      grid-row: 1 / span 2;
      align-self: center;
    }
  }
}
</style>
