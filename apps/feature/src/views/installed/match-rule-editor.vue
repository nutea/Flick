<template>
  <a-modal
    :visible="visible"
    :title="$t('feature.installed.matchRules.title')"
    :ok-text="$t('feature.installed.matchRules.save')"
    :cancel-text="$t('feature.localPlugin.cancelText')"
    width="560px"
    @ok="submit"
    @cancel="close"
  >
    <div class="rule-editor">
      <div class="rule-command">
        <div>
          <strong>{{ commandLabel }}</strong>
          <p>{{ $t('feature.installed.matchRules.description') }}</p>
        </div>
        <a-switch v-model:checked="form.enabled" />
      </div>

      <a-form layout="vertical">
        <div class="rule-grid">
          <a-form-item :label="$t('feature.installed.matchRules.contentType')">
            <a-select v-model:value="form.selection" :disabled="fixedSelection">
              <a-select-option value="text">
                {{ $t('feature.installed.matchRules.text') }}
              </a-select-option>
              <a-select-option value="files">
                {{ $t('feature.installed.matchRules.files') }}
              </a-select-option>
            </a-select>
          </a-form-item>
          <a-form-item :label="$t('feature.installed.matchRules.priority')">
            <a-input-number
              v-model:value="form.priority"
              :min="-999"
              :max="999"
              style="width: 100%"
            />
          </a-form-item>
        </div>

        <template v-if="form.selection === 'text'">
          <a-form-item :label="$t('feature.installed.matchRules.pattern')">
            <a-input
              v-model:value="form.pattern"
              :placeholder="
                $t('feature.installed.matchRules.patternPlaceholder')
              "
            />
          </a-form-item>
          <div class="rule-grid">
            <a-form-item :label="$t('feature.installed.matchRules.minChars')">
              <a-input-number
                v-model:value="form.minLength"
                :min="0"
                :max="100000"
                style="width: 100%"
              />
            </a-form-item>
            <a-form-item :label="$t('feature.installed.matchRules.maxChars')">
              <a-input-number
                v-model:value="form.maxLength"
                :min="1"
                :max="100000"
                style="width: 100%"
                :placeholder="$t('feature.installed.matchRules.unlimited')"
              />
            </a-form-item>
          </div>
        </template>

        <template v-else-if="!isImageCommand">
          <a-form-item :label="$t('feature.installed.matchRules.fileKinds')">
            <a-checkbox-group v-model:value="form.kinds">
              <a-checkbox value="file">
                {{ $t('feature.installed.matchRules.regularFile') }}
              </a-checkbox>
              <a-checkbox value="directory">
                {{ $t('feature.installed.matchRules.directory') }}
              </a-checkbox>
            </a-checkbox-group>
          </a-form-item>
          <div class="rule-grid">
            <a-form-item :label="$t('feature.installed.matchRules.minCount')">
              <a-input-number
                v-model:value="form.minCount"
                :min="minimumFileCount"
                :max="100"
                style="width: 100%"
              />
            </a-form-item>
            <a-form-item :label="$t('feature.installed.matchRules.maxCount')">
              <a-input-number
                v-model:value="form.maxCount"
                :min="minimumFileCount"
                :max="100"
                style="width: 100%"
                :placeholder="$t('feature.installed.matchRules.unlimited')"
              />
            </a-form-item>
          </div>
          <div class="rule-grid">
            <a-form-item :label="$t('feature.installed.matchRules.target')">
              <a-select v-model:value="form.target">
                <a-select-option value="extension">
                  {{ $t('feature.installed.matchRules.extension') }}
                </a-select-option>
                <a-select-option value="name">
                  {{ $t('feature.installed.matchRules.fileName') }}
                </a-select-option>
                <a-select-option value="path">
                  {{ $t('feature.installed.matchRules.fullPath') }}
                </a-select-option>
              </a-select>
            </a-form-item>
            <a-form-item :label="$t('feature.installed.matchRules.mode')">
              <a-select v-model:value="form.mode">
                <a-select-option value="all">
                  {{ $t('feature.installed.matchRules.all') }}
                </a-select-option>
                <a-select-option value="any">
                  {{ $t('feature.installed.matchRules.any') }}
                </a-select-option>
              </a-select>
            </a-form-item>
          </div>
          <a-form-item :label="$t('feature.installed.matchRules.pattern')">
            <a-input
              v-model:value="form.pattern"
              :placeholder="$t('feature.installed.matchRules.optionalPattern')"
            />
          </a-form-item>
        </template>

        <a-alert
          v-else
          type="info"
          show-icon
          :message="$t('feature.installed.matchRules.imageFixedRule')"
        />
      </a-form>
    </div>

    <template #footer>
      <a-button v-if="customized" danger type="text" @click="$emit('reset')">
        {{ $t('feature.installed.matchRules.restore') }}
      </a-button>
      <span class="footer-spacer" />
      <a-button @click="close">
        {{ $t('feature.localPlugin.cancelText') }}
      </a-button>
      <a-button type="primary" @click="submit">
        {{ $t('feature.installed.matchRules.save') }}
      </a-button>
    </template>
  </a-modal>
</template>

<script setup>
import { computed, reactive, watch } from 'vue';

const props = defineProps({
  visible: Boolean,
  command: { type: Object, default: () => ({}) },
  customized: Boolean,
});
const emit = defineEmits(['close', 'save', 'reset']);

const form = reactive({
  enabled: true,
  selection: 'text',
  priority: 0,
  pattern: '',
  minLength: 0,
  maxLength: null,
  kinds: ['file'],
  minCount: 1,
  maxCount: null,
  target: 'extension',
  mode: 'all',
});

const inferredSelection = computed(() =>
  ['files', 'img'].includes(props.command.type) ? 'files' : 'text'
);
const fixedSelection = computed(() =>
  ['regex', 'over', 'files', 'img'].includes(props.command.type)
);
const isImageCommand = computed(() => props.command.type === 'img');
const minimumFileCount = 1;
const commandLabel = computed(
  () => props.command.label || props.command.type || '-'
);

watch(
  () => [props.visible, props.command],
  () => {
    if (!props.visible) return;
    const cmd = props.command || {};
    const rules = cmd.matchRules || {};
    const selection = rules.selection || inferredSelection.value;
    const defaultMin = 1;
    const defaultMax = null;
    Object.assign(form, {
      enabled: rules.enabled !== false,
      selection,
      priority: Number.isFinite(cmd.priority) ? cmd.priority : 0,
      pattern: rules.pattern ?? cmd.match ?? '',
      minLength: rules.minLength ?? cmd.minLength ?? 0,
      maxLength: rules.maxLength ?? cmd.maxLength ?? null,
      kinds:
        Array.isArray(rules.kinds) && rules.kinds.length
          ? [...rules.kinds]
          : cmd.fileType === 'directory' || cmd.fileType === 'folder'
            ? ['directory']
            : ['file'],
      minCount: rules.minCount ?? cmd.minLength ?? defaultMin,
      maxCount: rules.maxCount ?? cmd.maxLength ?? defaultMax,
      target: rules.target || 'extension',
      mode: rules.mode || 'all',
    });
  },
  { deep: true, immediate: true }
);

function optionalLimit(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.floor(value)
    : undefined;
}

function submit() {
  const matchRules = {
    enabled: form.enabled,
    selection: form.selection,
  };
  if (form.selection === 'text') {
    matchRules.pattern = form.pattern.trim();
    matchRules.minLength = optionalLimit(form.minLength) ?? 0;
    const maxLength = optionalLimit(form.maxLength);
    if (maxLength !== undefined) matchRules.maxLength = maxLength;
  } else if (!isImageCommand.value) {
    const minCount = Math.max(
      minimumFileCount,
      optionalLimit(form.minCount) || 0
    );
    const rawMax = optionalLimit(form.maxCount);
    matchRules.kinds = form.kinds.length ? [...form.kinds] : ['file'];
    matchRules.minCount = minCount;
    if (rawMax !== undefined) matchRules.maxCount = Math.max(minCount, rawMax);
    matchRules.target = form.target;
    matchRules.mode = form.mode;
    matchRules.pattern = form.pattern.trim();
  }
  emit('save', {
    priority: Number.isFinite(form.priority) ? form.priority : 0,
    matchRules,
  });
}

function close() {
  emit('close');
}
</script>

<style lang="less" scoped>
.rule-editor {
  .rule-command {
    margin-bottom: 16px;
    padding-bottom: 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    border-bottom: 1px solid var(--color-border-light);
    strong {
      color: var(--color-text-primary);
      font-size: 14px;
    }
    p {
      margin: 2px 0 0;
      color: var(--color-text-desc);
      font-size: 12px;
    }
  }
  .rule-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  :deep(.ant-form-item) {
    margin-bottom: 14px;
  }
}
.footer-spacer {
  flex: 1;
}
:deep(.ant-modal-footer) {
  display: flex;
  align-items: center;
}
</style>
