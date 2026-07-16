<template>
  <div class="super-panel-settings">
    <div class="view-title">{{ $t('feature.market.superPanelSettings') }}</div>
    <div class="view-container">
      <a-menu v-model:selectedKeys="activeTab" mode="horizontal">
        <a-menu-item key="shortcut">
          {{ $t('feature.superPanelShortcut.tabShortcut') }}
        </a-menu-item>
        <a-menu-item key="translate">
          {{ $t('feature.superPanelShortcut.tabTranslate') }}
        </a-menu-item>
      </a-menu>
      <div class="settings-detail">
        <template v-if="activeTab[0] === 'shortcut'">
          <div class="setting-item">
            <a-alert
              type="info"
              show-icon
              :message="$t('feature.superPanelShortcut.tipDesc')"
              class="tip-alert translate-tip"
            />
            <a-form
              layout="vertical"
              class="shortcut-form"
              :model="form"
              name="superPanelHotkey"
              autocomplete="off"
              @finish="onSave"
            >
            <a-form-item
              :label="$t('feature.superPanelShortcut.triggerType')"
              name="triggerType"
            >
              <a-select
                v-model:value="triggerSelect"
                class="trigger-select"
                @change="onTriggerTypeChange"
              >
                <a-select-option value="keyboard">
                  {{ $t('feature.superPanelShortcut.modeKeyboard') }}
                </a-select-option>
                <a-select-option :value="SP_MOUSE.MIDDLE">
                  {{ $t('feature.superPanelShortcut.modeMouseMiddle') }}
                </a-select-option>
                <a-select-option :value="SP_MOUSE.LONG_LEFT">
                  {{ $t('feature.superPanelShortcut.modeLongLeft') }}
                </a-select-option>
                <a-select-option :value="SP_MOUSE.LONG_RIGHT">
                  {{ $t('feature.superPanelShortcut.modeLongRight') }}
                </a-select-option>
                <a-select-option :value="SP_MOUSE.LONG_MIDDLE">
                  {{ $t('feature.superPanelShortcut.modeLongMiddle') }}
                </a-select-option>
              </a-select>
            </a-form-item>
            <a-form-item
              v-show="triggerSelect === 'keyboard'"
              :label="$t('feature.superPanelShortcut.hotkeyLabel')"
              name="superPanelHotKey"
              :rules="[
                {
                  required: true,
                  message: $t('feature.superPanelShortcut.required'),
                },
              ]"
            >
              <a-input
                :value="form.superPanelHotKey"
                read-only
                autocomplete="off"
                class="shortcut-input"
                :placeholder="$t('feature.superPanelShortcut.captureHint')"
                @focus="onShortcutFocus"
                @blur="onShortcutBlur"
                @keydown.capture="onShortcutInputBlock"
                @paste.prevent
                @drop.prevent
                @compositionstart.prevent
                @compositionupdate.prevent
                @compositionend.prevent
              />
            </a-form-item>
            <a-form-item>
              <a-button type="primary" html-type="submit">
                {{ $t('feature.superPanelShortcut.save') }}
              </a-button>
            </a-form-item>
          </a-form>
          </div>
        </template>

        <template v-else>
          <div class="setting-item translate-page">
            <a-alert
              type="info"
              show-icon
              :message="$t('feature.superPanelShortcut.translateConfigHint')"
              class="tip-alert translate-tip"
            />

            <div class="translate-section">
              <div class="translate-section-title">
                {{ $t('feature.superPanelShortcut.translateSectionProfiles') }}
              </div>
              <div class="translate-profile-card">
                <div class="translate-profile-row">
                  <span class="translate-profile-label">{{
                    $t('feature.superPanelShortcut.profileSelect')
                  }}</span>
                  <a-select
                    :value="selectedProfileId"
                    class="profile-select"
                    :disabled="translateProfiles.length === 0"
                    :placeholder="$t('feature.superPanelShortcut.translateProfilesEmpty')"
                    @change="onProfileSelectChange"
                  >
                    <a-select-option v-for="p in translateProfiles" :key="p.id" :value="p.id">
                      {{ p.name }}
                    </a-select-option>
                  </a-select>
                  <div class="translate-profile-actions">
                    <a-button @click="onAddProfile">{{ $t('feature.superPanelShortcut.addProfile') }}</a-button>
                    <a-popconfirm
                      :title="$t('feature.superPanelShortcut.deleteProfileConfirm')"
                      @confirm="onDeleteProfile"
                    >
                      <a-button danger :disabled="!selectedProfileId">
                        {{ $t('feature.superPanelShortcut.deleteProfile') }}
                      </a-button>
                    </a-popconfirm>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="translateProfiles.length === 0" class="translate-empty">
              {{ $t('feature.superPanelShortcut.translateProfilesEmpty') }}
            </div>

            <div v-else class="translate-layout">
              <a-form layout="vertical" class="translate-form">
                <div class="translate-section translate-section-api">
                  <div class="translate-section-title">
                    {{ $t('feature.superPanelShortcut.translateSectionApi') }}
                  </div>
                  <a-form-item :label="$t('feature.superPanelShortcut.translateProvider')">
                    <a-select
                      v-model:value="translateForm.translateProvider"
                      class="translate-provider-select"
                    >
                      <a-select-option value="openai_chat">
                        {{ $t('feature.superPanelShortcut.providerOpenaiChat') }}
                      </a-select-option>
                    </a-select>
                  </a-form-item>
                  <a-form-item :label="$t('feature.superPanelShortcut.profileName')">
                    <a-input v-model:value="translateForm.profileName" autocomplete="off" />
                  </a-form-item>
                  <a-form-item :label="$t('feature.superPanelShortcut.llmBaseUrl')">
                    <a-input
                      v-model:value="translateForm.llmBaseUrl"
                      :placeholder="$t('feature.superPanelShortcut.llmBaseUrlPh')"
                    />
                  </a-form-item>
                  <a-form-item :label="$t('feature.superPanelShortcut.llmApiKey')">
                    <a-input-password v-model:value="translateForm.llmApiKey" autocomplete="off" />
                  </a-form-item>
                  <a-form-item :label="$t('feature.superPanelShortcut.llmModel')">
                    <a-input v-model:value="translateForm.llmModel" />
                  </a-form-item>
                  <div class="translate-test-row">
                    <a-button :loading="testLoading" @click="onTestConnection">
                      {{ $t('feature.superPanelShortcut.testConnection') }}
                    </a-button>
                  </div>
                </div>

                <div class="translate-section translate-section-prompt">
                  <div class="translate-section-title">
                    {{ $t('feature.superPanelShortcut.translateSectionPrompt') }}
                  </div>
                  <a-form-item :label="$t('feature.superPanelShortcut.llmSystemPrompt')">
                    <a-collapse ghost class="system-prompt-builtin-collapse">
                      <a-collapse-panel
                        key="builtin"
                        :header="$t('feature.superPanelShortcut.systemPromptBuiltinCollapse')"
                      >
                        <pre class="system-prompt-builtin-pre">{{
                          DEFAULT_TRANSLATE_SYSTEM_PROMPT
                        }}</pre>
                      </a-collapse-panel>
                    </a-collapse>
                    <a-textarea
                      v-model:value="translateForm.llmSystemPrompt"
                      :rows="4"
                      class="system-prompt-textarea"
                      :placeholder="$t('feature.superPanelShortcut.llmSystemPromptPh')"
                    />
                    <a-button
                      type="default"
                      size="small"
                      class="system-prompt-fill-btn"
                      @click="applyBuiltinSystemPrompt"
                    >
                      {{ $t('feature.superPanelShortcut.systemPromptFillBuiltin') }}
                    </a-button>
                  </a-form-item>
                  <a-form-item :label="$t('feature.superPanelShortcut.llmExtraHeaders')">
                    <a-textarea
                      v-model:value="translateForm.llmExtraHeaders"
                      :rows="2"
                      :placeholder="$t('feature.superPanelShortcut.llmExtraHeadersPh')"
                    />
                  </a-form-item>
                </div>
              </a-form>

              <div class="translate-section translate-section-behavior">
                <div class="translate-section-title">
                  {{ $t('feature.superPanelShortcut.translateSectionBehavior') }}
                </div>
                <a-form layout="vertical" class="translate-form translate-form-behavior">
                  <a-form-item :label="$t('feature.superPanelShortcut.translateMaxCharsTitle')">
                    <a-input-number
                      v-model:value="translateMaxChars"
                      :min="1"
                      :max="100000"
                      class="translate-max-chars-input"
                    />
                    <div class="translate-max-chars-hint">
                      {{ $t('feature.superPanelShortcut.translateMaxCharsDesc') }}
                    </div>
                  </a-form-item>
                  <div class="translate-auto-row">
                    <div class="translate-auto-text">
                      <div class="translate-auto-label">
                        {{ $t('feature.superPanelShortcut.autoTranslateLabel') }}
                      </div>
                      <div class="translate-auto-desc">
                        {{ $t('feature.superPanelShortcut.autoTranslateDesc') }}
                      </div>
                    </div>
                    <a-tooltip
                      :title="translateSwitchDisabled ? $t('feature.superPanelShortcut.switchNeedConfig') : ''"
                    >
                      <span class="switch-wrap">
                        <a-switch
                          v-model:checked="translateForm.autoTranslate"
                          :disabled="translateSwitchDisabled"
                          :checked-children="$t('feature.superPanelShortcut.on')"
                          :un-checked-children="$t('feature.superPanelShortcut.off')"
                        />
                      </span>
                    </a-tooltip>
                  </div>
                </a-form>
              </div>

              <div class="translate-footer">
                <a-button type="primary" @click="onSaveTranslate">
                  {{ $t('feature.superPanelShortcut.save') }}
                </a-button>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch, onUnmounted } from 'vue';
import { message } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import { nanoid } from 'nanoid';
import {
  emptyProfile,
  formToProfile,
  isTranslateConfigured,
  LEGACY_TRANSLATE_FLAT_KEYS,
  loadProfilesFromDoc,
  type SuperPanelTranslateProvider,
  type TranslateProfile,
} from '@/utils/superPanelTranslatePrefs';
import { DEFAULT_TRANSLATE_SYSTEM_PROMPT } from '@/utils/superPanelTranslateBuiltinPrompt';
import { testTranslateConnection } from '@/utils/translateConnectionTest';

const { t } = useI18n();

const SUPER_PANEL_HOTKEY_DB_ID = 'flick-system-super-panel-store';
const SUPER_PANEL_PREF_DB_ID = 'flick-system-super-panel-preferences';

/** 与主进程 main.js / superx 约定一致 */
const SP_MOUSE = {
  MIDDLE: 'flick:sp:mouse-middle',
  LONG_LEFT: 'flick:sp:long-left',
  LONG_RIGHT: 'flick:sp:long-right',
  LONG_MIDDLE: 'flick:sp:long-middle',
} as const;

function getFlick() {
  return (window as unknown as { flick?: { dbStorage: { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void } } }).flick;
}

const initialRaw =
  getFlick()?.dbStorage.getItem(SUPER_PANEL_HOTKEY_DB_ID) || 'Ctrl+W';
const initialPref =
  (window as unknown as {
    flick?: { db?: { get: (id: string) => { data?: Record<string, unknown> } | null } };
  }).flick?.db?.get(SUPER_PANEL_PREF_DB_ID) || { data: {} };

const lastKeyboardCombo = ref(
  initialRaw.startsWith('flick:sp:') ? 'Ctrl+W' : initialRaw
);

const form = reactive({
  superPanelHotKey: initialRaw,
});

const triggerSelect = ref<string>(
  initialRaw.startsWith('flick:sp:') ? initialRaw : 'keyboard'
);
const activeTab = ref<string[]>(['shortcut']);

type TranslateEditorForm = {
  profileId: string;
  profileName: string;
  translateProvider: SuperPanelTranslateProvider;
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  llmSystemPrompt: string;
  llmExtraHeaders: string;
  anthropicApiVersion: string;
  anthropicMaxTokens: number;
  autoTranslate: boolean;
};

function blankEditor(): Omit<TranslateEditorForm, 'autoTranslate'> {
  return {
    profileId: '',
    profileName: '',
    translateProvider: 'openai_chat',
    llmBaseUrl: '',
    llmApiKey: '',
    llmModel: '',
    llmSystemPrompt: '',
    llmExtraHeaders: '',
    anthropicApiVersion: '2023-06-01',
    anthropicMaxTokens: 1024,
  };
}

function clampTranslateMaxChars(n: unknown): number {
  if (typeof n === 'number' && Number.isFinite(n) && n >= 1) {
    return Math.min(100000, Math.floor(n));
  }
  return 2000;
}

const loadedProfiles = loadProfilesFromDoc(initialPref?.data as Record<string, unknown> | undefined);
const translateProfiles = ref<TranslateProfile[]>(loadedProfiles.profiles);
const selectedProfileId = ref<string | null>(loadedProfiles.activeProfileId);

const translateMaxChars = ref(
  clampTranslateMaxChars((initialPref?.data as Record<string, unknown> | undefined)?.translateMaxChars)
);

const translateForm = reactive<TranslateEditorForm>({
  ...blankEditor(),
  autoTranslate: false,
});

const testLoading = ref(false);
const desiredAutoTranslate = ref(false);

function applyEditorFromProfile(p: TranslateProfile | null) {
  if (!p) {
    Object.assign(translateForm, blankEditor(), { autoTranslate: false });
    return;
  }
  Object.assign(translateForm, {
    profileId: p.id,
    profileName: p.name,
    translateProvider: p.translateProvider,
    llmBaseUrl: p.llmBaseUrl,
    llmApiKey: p.llmApiKey,
    llmModel: p.llmModel,
    llmSystemPrompt: p.llmSystemPrompt,
    llmExtraHeaders: p.llmExtraHeaders,
    anthropicApiVersion: p.anthropicApiVersion,
    anthropicMaxTokens: p.anthropicMaxTokens,
    autoTranslate: desiredAutoTranslate.value && isTranslateConfigured(p),
  });
}

function commitEditorToProfiles() {
  const id = translateForm.profileId?.trim();
  if (!id) return;
  const next = formToProfile(translateForm);
  const idx = translateProfiles.value.findIndex((x) => x.id === id);
  if (idx >= 0) {
    translateProfiles.value.splice(idx, 1, next);
  }
}

const initialWantOn = initialPref?.data?.autoTranslate !== false;
desiredAutoTranslate.value = initialWantOn;
if (selectedProfileId.value) {
  const p = translateProfiles.value.find((x) => x.id === selectedProfileId.value);
  applyEditorFromProfile(p ?? null);
}
translateForm.autoTranslate = initialWantOn && isTranslateConfigured(translateForm);

const translateSwitchDisabled = computed(
  () => !translateForm.profileId || !isTranslateConfigured(translateForm)
);

watch(translateSwitchDisabled, (off) => {
  if (off) {
    translateForm.autoTranslate = false;
    return;
  }
  translateForm.autoTranslate = desiredAutoTranslate.value;
});

watch(
  () => translateForm.autoTranslate,
  (on) => {
    if (!translateSwitchDisabled.value) {
      desiredAutoTranslate.value = on;
    }
  }
);

watch(
  () => translateForm.profileName,
  (nm) => {
    const id = translateForm.profileId;
    if (!id) return;
    const ix = translateProfiles.value.findIndex((p) => p.id === id);
    if (ix < 0) return;
    const cur = translateProfiles.value[ix];
    const label = String(nm || '').trim() || '—';
    if (cur.name === label) return;
    translateProfiles.value.splice(ix, 1, { ...cur, name: label });
  }
);

function onProfileSelectChange(newId: string) {
  commitEditorToProfiles();
  selectedProfileId.value = newId;
  const p = translateProfiles.value.find((x) => x.id === newId);
  applyEditorFromProfile(p ?? null);
}

function onAddProfile() {
  commitEditorToProfiles();
  const id = nanoid();
  const p = emptyProfile(
    id,
    `${t('feature.superPanelShortcut.defaultProfileName')} ${translateProfiles.value.length + 1}`
  );
  translateProfiles.value = [...translateProfiles.value, p];
  selectedProfileId.value = id;
  applyEditorFromProfile(p);
}

function onDeleteProfile() {
  const id = selectedProfileId.value;
  if (!id) return;
  commitEditorToProfiles();
  translateProfiles.value = translateProfiles.value.filter((x) => x.id !== id);
  selectedProfileId.value = translateProfiles.value[0]?.id ?? null;
  applyEditorFromProfile(translateProfiles.value[0] ?? null);
  if (!translateProfiles.value.length) {
    desiredAutoTranslate.value = false;
    translateForm.autoTranslate = false;
  }
}

async function onTestConnection() {
  if (!isTranslateConfigured(translateForm)) {
    message.warning(t('feature.superPanelShortcut.switchNeedConfig'));
    return;
  }
  testLoading.value = true;
  try {
    const r = await testTranslateConnection({
      translateProvider: translateForm.translateProvider,
      llmBaseUrl: translateForm.llmBaseUrl,
      llmApiKey: translateForm.llmApiKey,
      llmModel: translateForm.llmModel,
      llmSystemPrompt: translateForm.llmSystemPrompt,
      llmExtraHeaders: translateForm.llmExtraHeaders,
      anthropicApiVersion: translateForm.anthropicApiVersion,
      anthropicMaxTokens: translateForm.anthropicMaxTokens,
    });
    if (r.message === 'missing_fields') {
      message.warning(t('feature.superPanelShortcut.switchNeedConfig'));
      return;
    }
    if (r.ok) {
      message.success(`${t('feature.superPanelShortcut.testConnectionOk')}: ${r.message}`);
    } else {
      message.error(`${t('feature.superPanelShortcut.testConnectionFail')}: ${r.message}`);
    }
  } finally {
    testLoading.value = false;
  }
}

function onTriggerTypeChange(v: string) {
  if (v === 'keyboard') {
    form.superPanelHotKey = lastKeyboardCombo.value;
  } else {
    if (!form.superPanelHotKey.startsWith('flick:sp:')) {
      lastKeyboardCombo.value = form.superPanelHotKey;
    }
    form.superPanelHotKey = v;
  }
}

const capturing = ref(false);

/** 禁止在框内直接键入；Tab 交给系统以移出焦点 */
function onShortcutInputBlock(e: KeyboardEvent) {
  if (e.key === 'Tab') return;
  e.preventDefault();
  e.stopPropagation();
}

function keyFromEvent(e: KeyboardEvent): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null;
  if (e.key === ' ') return 'Space';
  if (e.key.length === 1) return e.key.toUpperCase();
  const map: Record<string, string> = {
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Escape: 'Esc',
    Backspace: 'Backspace',
    Tab: 'Tab',
    Enter: 'Enter',
    Delete: 'Delete',
    Insert: 'Insert',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
  };
  if (map[e.key]) return map[e.key];
  if (/^F\d{1,2}$/.test(e.key)) return e.key;
  if (e.code.startsWith('Key')) return e.code.slice(3);
  if (e.code.startsWith('Digit')) return e.code.slice(5);
  if (e.code.startsWith('Numpad')) return e.code;
  return e.key.length ? e.key : null;
}

function onKeyDownCapture(e: KeyboardEvent) {
  if (triggerSelect.value !== 'keyboard' || !capturing.value) return;

  if (e.key === 'Tab') {
    capturing.value = false;
    window.removeEventListener('keydown', onKeyDownCapture, true);
    return;
  }

  e.preventDefault();
  e.stopPropagation();

  if (e.key === 'Escape') {
    form.superPanelHotKey = lastKeyboardCombo.value;
    return;
  }

  const mods: string[] = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.shiftKey) mods.push('Shift');
  if (e.altKey) mods.push('Alt');
  if (e.metaKey) mods.push('Command');

  const k = keyFromEvent(e);
  if (!k) return;

  const combo = [...mods, k].join('+');
  form.superPanelHotKey = combo;
  lastKeyboardCombo.value = combo;
}

function onShortcutFocus() {
  if (triggerSelect.value !== 'keyboard') return;
  capturing.value = true;
  window.addEventListener('keydown', onKeyDownCapture, true);
}

function onShortcutBlur() {
  capturing.value = false;
  window.removeEventListener('keydown', onKeyDownCapture, true);
}

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDownCapture, true);
});

function onSave() {
  const flick = getFlick();
  if (!flick) {
    message.warning(t('feature.superPanelShortcut.saveDevHint'));
    return;
  }
  flick.dbStorage.setItem(SUPER_PANEL_HOTKEY_DB_ID, form.superPanelHotKey);
  message.success(t('feature.superPanelShortcut.saveOk'));
}

function applyBuiltinSystemPrompt() {
  translateForm.llmSystemPrompt = DEFAULT_TRANSLATE_SYSTEM_PROMPT;
}

function onSaveTranslate() {
  const flick = getFlick() as unknown as {
    db?: { get: (id: string) => { _id?: string; _rev?: string; data?: unknown } | null; put: (doc: unknown) => unknown };
  };
  if (!flick?.db) {
    message.warning(t('feature.superPanelShortcut.saveDevHint'));
    return;
  }
  commitEditorToProfiles();
  if (translateForm.autoTranslate && !isTranslateConfigured(translateForm)) {
    message.warning(t('feature.superPanelShortcut.switchNeedConfig'));
    return;
  }
  const oldDoc = flick.db.get(SUPER_PANEL_PREF_DB_ID) || {};
  const oldData = { ...(oldDoc.data as Record<string, unknown> | undefined) };
  for (const k of LEGACY_TRANSLATE_FLAT_KEYS) {
    delete oldData[k];
  }

  let autoTranslate = false;
  let activeId: string | null = null;
  let profilesOut: TranslateProfile[] = [];

  if (!translateProfiles.value.length) {
    autoTranslate = false;
    activeId = null;
    profilesOut = [];
  } else {
    profilesOut = translateProfiles.value.map((x) => ({ ...x }));
    activeId = selectedProfileId.value;
    if (activeId && !profilesOut.some((p) => p.id === activeId)) {
      activeId = profilesOut[0]?.id ?? null;
    }
    if (!activeId) {
      activeId = profilesOut[0].id;
    }
    selectedProfileId.value = activeId;
    const active = profilesOut.find((p) => p.id === activeId);
    autoTranslate = !!desiredAutoTranslate.value && !!active && isTranslateConfigured(active);
  }

  oldData.translateProfiles = profilesOut;
  oldData.activeTranslateProfileId = activeId;
  oldData.autoTranslate = autoTranslate;
  oldData.translateMaxChars = clampTranslateMaxChars(translateMaxChars.value);

  flick.db.put({
    ...oldDoc,
    _id: SUPER_PANEL_PREF_DB_ID,
    data: oldData,
  });
  desiredAutoTranslate.value = autoTranslate;
  translateForm.autoTranslate = autoTranslate;
  message.success(t('feature.superPanelShortcut.saveOk'));
}
</script>

<style lang="less" scoped>
@import '@/assets/common.less';

/* 与 views/settings/index.vue 中 .settings 对齐 */
.super-panel-settings {
  box-sizing: border-box;
  width: 100%;
  overflow-x: hidden;
  background: var(--color-body-bg2);
  height: calc(~'100vh - 34px');

  .view-title {
    font-size: 16px;
    font-weight: 500;
    margin-bottom: 16px;
    color: var(--color-text-primary);
  }

  .view-container {
    border-radius: 8px;
    background: var(--color-body-bg);
    overflow: auto;
    height: calc(~'100vh - 84px');
  }

  .ant-menu-horizontal {
    border-bottom: 1px solid var(--color-border-light);
  }

  .ant-menu {
    background: var(--color-body-bg) !important;
    color: var(--color-text-content) !important;
  }

  .settings-detail {
    padding: 20px;
    box-sizing: border-box;
    flex: 1;
    overflow: auto;
    background: var(--color-body-bg);
    color: var(--color-text-content);
  }

  .tip-alert {
    margin-bottom: 16px;
  }

  .tip-alert :deep(.ant-alert) {
    background: var(--color-input-hover);
    border-color: var(--color-border-light);
  }

  .tip-alert :deep(.ant-alert-message) {
    color: var(--color-text-primary);
  }

  .tip-alert :deep(.ant-alert-description) {
    color: var(--color-text-desc);
  }

  .shortcut-form {
    max-width: 560px;
  }

  .translate-tip {
    margin-bottom: 20px;
  }

  .translate-page {
    max-width: 640px;
  }

  .translate-layout {
    margin-top: 4px;
  }

  .translate-section {
    margin-bottom: 28px;

    &:last-of-type {
      margin-bottom: 0;
    }
  }

  .translate-section-title {
    color: var(--ant-primary-color);
    font-size: 14px;
    font-weight: 500;
    margin-bottom: 12px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--color-border-light);
  }

  .translate-profile-card {
    padding: 14px 16px;
    border-radius: 8px;
    background: var(--color-input-hover);
    border: 1px solid var(--color-border-light);
  }

  .translate-profile-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 12px;
  }

  .translate-profile-label {
    color: var(--color-text-content);
    flex-shrink: 0;
    min-width: 4em;
  }

  .translate-profile-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .translate-provider-select {
    max-width: 420px;
    width: 100%;
  }

  .translate-provider-select :deep(.ant-select-selector) {
    background: var(--color-input-hover) !important;
    color: var(--color-text-content);
  }

  .translate-provider-select :deep(.ant-select-arrow) {
    color: var(--color-action-color);
  }

  .translate-test-row {
    margin-top: 4px;
    margin-bottom: 0;
  }

  .translate-section-behavior {
    padding-top: 8px;
    margin-top: 8px;
    border-top: 1px dashed var(--color-border-light);
  }

  .translate-auto-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 4px 0 8px;
  }

  .translate-auto-text {
    flex: 1;
    min-width: 0;
  }

  .translate-auto-label {
    color: var(--color-text-content);
    font-size: 14px;
    line-height: 1.5;
  }

  .translate-auto-desc {
    margin-top: 4px;
    font-size: 12px;
    color: var(--color-text-desc);
    line-height: 1.5;
  }

  .translate-footer {
    margin-top: 24px;
    padding-top: 20px;
    border-top: 1px solid var(--color-border-light);
    display: flex;
    justify-content: flex-end;
  }

  .translate-form {
    max-width: 100%;
    margin-bottom: 0;
  }

  .translate-form-behavior {
    :deep(.ant-form-item) {
      margin-bottom: 14px;
    }
  }

  .system-prompt-builtin-collapse {
    margin-bottom: 8px;

    :deep(.ant-collapse-header) {
      color: var(--color-text-desc);
      font-size: 13px;
      font-weight: 400;
      padding: 6px 0 !important;
      line-height: 1.5;
    }

    :deep(.ant-collapse-arrow) {
      color: var(--color-text-desc) !important;
    }

    :deep(.ant-collapse-content-box) {
      padding: 0 0 8px !important;
    }
  }

  .system-prompt-builtin-pre {
    margin: 0;
    padding: 10px 12px;
    max-height: 200px;
    overflow: auto;
    font-size: 12px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    color: var(--color-text-content);
    background: var(--color-input-hover);
    border: 1px solid var(--color-border-light);
    border-radius: 6px;
  }

  .system-prompt-textarea {
    margin-bottom: 4px;
  }

  .system-prompt-fill-btn {
    margin-top: 6px;
    height: auto;
    color: var(--color-text-desc);
    border-color: var(--color-border-light);
    background: var(--color-body-bg);
    font-size: 12px;

    &:hover,
    &:focus {
      color: var(--color-text-content);
      border-color: var(--color-action-color);
      background: var(--color-input-hover);
    }
  }

  .translate-max-chars-input {
    width: 100%;
    max-width: 200px;
  }

  .translate-max-chars-hint {
    margin-top: 6px;
    font-size: 12px;
    color: var(--color-text-desc);
    line-height: 1.5;
  }

  .switch-wrap {
    display: inline-block;
  }

  .switch-wrap :deep(.ant-switch:not(.ant-switch-checked)) {
    background: var(--color-list-hover);
  }

  .profile-select {
    min-width: 200px;
    max-width: 320px;
    flex: 1 1 220px;
  }

  .profile-select :deep(.ant-select-selector) {
    background: var(--color-input-hover) !important;
    color: var(--color-text-content);
  }

  .profile-select :deep(.ant-select-arrow) {
    color: var(--color-action-color);
  }

  .translate-empty {
    color: var(--color-text-desc);
    padding: 8px 0 16px;
    max-width: 560px;
  }

  .trigger-select,
  .shortcut-input {
    max-width: 280px;
    width: 100%;
  }

  .trigger-select :deep(.ant-select-selector) {
    background: var(--color-input-hover) !important;
    color: var(--color-text-content);
  }

  .shortcut-input :deep(.ant-input) {
    cursor: pointer;
    font-family: ui-monospace, monospace;
    user-select: none;
    caret-color: transparent;
    text-align: center;
    color: var(--ant-primary-color);
    font-weight: lighter;
    background: var(--color-input-hover);
    border-color: var(--color-border-light);
  }

  .setting-item {
    margin-bottom: 20px;

    :deep(.ant-form-item) {
      margin-bottom: 16px;
    }

    :deep(.ant-form-item-label > label) {
      color: var(--color-text-content);
    }

    :deep(.ant-input),
    :deep(.ant-input-password input),
    :deep(.ant-input-number-input) {
      background: var(--color-input-hover);
      color: var(--color-text-content);
      border-color: var(--color-border-light);
    }

    :deep(.ant-input-password-icon) {
      color: var(--color-action-color);
    }

    :deep(.ant-input-textarea) {
      background: var(--color-input-hover);
      color: var(--color-text-content);
    }

    :deep(.ant-input-textarea textarea) {
      background: var(--color-input-hover);
      color: var(--color-text-content);
    }
  }

  .title {
    color: var(--ant-primary-color);
    font-size: 14px;
    margin-bottom: 10px;
  }

  .settings-item-li {
    padding-left: 20px;
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  .settings-item-li .label {
    color: var(--color-text-content);
  }

  .settings-item-li.desc {
    color: var(--color-text-desc);
    justify-content: flex-start;
    line-height: 1.6;
  }

  .settings-item-li.action {
    justify-content: flex-end;
  }
}
</style>
