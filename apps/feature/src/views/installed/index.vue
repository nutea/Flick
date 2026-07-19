<template>
  <div class="installed settings-page">
    <div class="view-container settings-card">
      <div v-if="!localPlugins.length" class="installed-empty-toolbar">
        <a-button :loading="importing" @click="importBundle">
          <template #icon><ImportOutlined /></template>
          {{ $t('feature.installed.import') }}
        </a-button>
      </div>
      <div v-if="!localPlugins.length">
        <a-result
          class="error-content"
          :sub-title="$t('feature.installed.tips1')"
        >
          <template #extra>
            <a-button @click="gotoFinder" key="console" type="primary">
              {{ $t('feature.installed.tips2') }}
            </a-button>
          </template>
        </a-result>
      </div>
      <div class="installed-layout" v-else>
        <div class="installed-toolbar">
          <div class="list-summary">
            <strong>{{ $t('feature.installed.pluginList') }}</strong>
            <span class="plugin-count">{{ localPlugins.length }}</span>
          </div>
          <a-input
            v-model:value="searchKeyword"
            allow-clear
            class="plugin-search"
            :placeholder="$t('feature.installed.searchPlaceholder')"
          >
            <template #prefix><SearchOutlined /></template>
          </a-input>
          <a-button :loading="importing" @click="importBundle">
            <template #icon><ImportOutlined /></template>
            {{ $t('feature.installed.import') }}
          </a-button>
        </div>
        <div
          class="plugin-accordion"
          :aria-label="$t('feature.installed.pluginList')"
        >
          <article
            v-for="plugin in filteredPlugins"
            :key="plugin.name"
            :class="[
              'plugin-panel',
              { expanded: selectedPluginName === plugin.name },
            ]"
          >
            <button
              type="button"
              class="plugin-trigger"
              :aria-expanded="selectedPluginName === plugin.name"
              :aria-controls="`plugin-detail-${plugin.name}`"
              @click="togglePlugin(plugin.name)"
            >
              <img :src="plugin.logoUrl" :alt="plugin.pluginName" />
              <div class="info">
                <div class="title-row">
                  <span class="title">{{ plugin.pluginName }}</span>
                  <span class="item-version">v{{ plugin.version || '-' }}</span>
                </div>
                <div class="desc">{{ plugin.description }}</div>
              </div>
              <RightOutlined class="expand-icon" />
            </button>
            <div
              v-if="selectedPluginName === plugin.name"
              :id="`plugin-detail-${plugin.name}`"
              class="plugin-detail"
            >
              <section class="plugin-overview">
                <div class="plugin-top">
                  <div>
                    <strong>
                      {{ $t('feature.installed.pluginOverview') }}
                    </strong>
                    <p>{{ pluginDetail.description }}</p>
                  </div>
                  <a-button :loading="exporting" @click="exportBundle">
                    <template #icon><ExportOutlined /></template>
                    {{ $t('feature.installed.export') }}
                  </a-button>
                </div>
                <dl class="plugin-meta">
                  <div>
                    <dt>{{ $t('feature.installed.version') }}</dt>
                    <dd>v{{ pluginDetail.version || '-' }}</dd>
                  </div>
                  <div>
                    <dt>{{ $t('feature.installed.developer') }}</dt>
                    <dd>
                      {{
                        pluginDetail.author || $t('feature.installed.unknown')
                      }}
                    </dd>
                  </div>
                  <div>
                    <dt>{{ $t('feature.installed.commandCount') }}</dt>
                    <dd>{{ runnableCommandCount }}</dd>
                  </div>
                </dl>
              </section>
              <section class="feature-container">
                <div class="section-heading">
                  <strong>
                    {{ $t('feature.installed.availableCommands') }}
                  </strong>
                  <p>{{ $t('feature.installed.commandHint') }}</p>
                </div>
                <template
                  v-for="(item, index) in pluginDetail.features"
                  :key="index"
                >
                  <div v-if="item.cmds?.length" class="command-group">
                    <div class="command-group-title">
                      {{ item.explain || item.code }}
                      <span>{{ item.cmds.length }}</span>
                    </div>
                    <div
                      v-for="(cmd, cmdIndex) in item.cmds"
                      :key="commandRowKey(item, cmd, cmdIndex)"
                      class="command-row"
                    >
                      <div class="command-info">
                        <div class="command-title-line">
                          <span class="command-name">
                            {{ commandDisplayName(item, cmd) }}
                          </span>
                          <span v-if="isMatchCommand(cmd)" class="match-badge">
                            {{ $t('feature.installed.matchRules.autoMatch') }}
                          </span>
                          <span
                            v-if="isRuleCustomized(item, cmd, cmdIndex)"
                            class="customized-badge"
                          >
                            {{ $t('feature.installed.matchRules.customized') }}
                          </span>
                        </div>
                        <span
                          v-if="isMatchCommand(cmd)"
                          class="command-rule-summary"
                        >
                          {{ matchRuleSummary(item, cmd, cmdIndex) }}
                        </span>
                      </div>
                      <div class="command-actions">
                        <template v-if="!isMatchCommand(cmd)">
                          <a-button
                            type="text"
                            @click="openPlugin({ feature: item, cmd })"
                          >
                            <template #icon><CaretRightOutlined /></template>
                            {{ $t('feature.installed.run') }}
                          </a-button>
                          <a-button
                            :type="hasAdded(item, cmd) ? 'primary' : 'default'"
                            @click="togglePanelPin(item, cmd)"
                          >
                            <template #icon>
                              <PushpinFilled v-if="hasAdded(item, cmd)" />
                              <PushpinOutlined v-else />
                            </template>
                            {{
                              hasAdded(item, cmd)
                                ? $t('feature.installed.unpin')
                                : $t('feature.installed.pin')
                            }}
                          </a-button>
                        </template>
                        <a-button
                          v-else
                          @click="openMatchRuleEditor(item, cmd, cmdIndex)"
                        >
                          <template #icon><SettingOutlined /></template>
                          {{ $t('feature.installed.matchRules.manage') }}
                        </a-button>
                      </div>
                    </div>
                  </div>
                </template>
                <a-empty
                  v-if="!runnableFeatureCount"
                  :description="$t('feature.installed.noCommands')"
                />
              </section>
              <section class="danger-zone">
                <div>
                  <strong>{{ $t('feature.installed.dangerZone') }}</strong>
                  <p>{{ $t('feature.installed.dangerHint') }}</p>
                </div>
                <a-button
                  danger
                  :loading="pluginDetail.isloading"
                  @click="confirmDeletePlugin(pluginDetail)"
                >
                  <template #icon><DeleteOutlined /></template>
                  {{ $t('feature.installed.remove') }}
                </a-button>
              </section>
            </div>
          </article>
          <a-empty
            v-if="!filteredPlugins.length"
            :image="simpleImage"
            :description="$t('feature.installed.noSearchResults')"
          />
        </div>
      </div>
    </div>
    <MatchRuleEditor
      :visible="matchRuleEditorVisible"
      :command="editingEffectiveCommand"
      :customized="editingRuleCustomized"
      @close="closeMatchRuleEditor"
      @save="saveMatchRule"
      @reset="resetMatchRule"
    />
  </div>
</template>

<script setup>
import { useStore } from 'vuex';
import { computed, ref, toRaw, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  PushpinOutlined,
  PushpinFilled,
  CaretRightOutlined,
  ExportOutlined,
  ImportOutlined,
  DeleteOutlined,
  SearchOutlined,
  RightOutlined,
  SettingOutlined,
} from '@ant-design/icons-vue';
import { Empty, message, Modal } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';

import { buildPluginLaunchPayload } from '@/utils/pluginLaunchPayload';
import { toMarketPayload } from '@/utils/marketPayload';
import MatchRuleEditor from './match-rule-editor.vue';
import {
  commandMatchKey,
  matchRuleOverrideId,
  normalizeMatchRulesDocument,
  SUPER_PANEL_MATCH_RULES_DB_ID,
} from '../../../../shared/super-panel-match-rules';

const { t } = useI18n();

const store = useStore();
const router = useRouter();

const localPlugins = computed(() =>
  store.state.localPlugins.filter(
    (plugin) =>
      plugin.name !== 'flick-system-feature' &&
      plugin.name !== 'flick-system-super-panel'
  )
);
const updateLocalPlugin = () => store.dispatch('updateLocalPlugin');

const exporting = ref(false);
const importing = ref(false);
const searchKeyword = ref('');
const simpleImage = Empty.PRESENTED_IMAGE_SIMPLE;

const exportBundle = async () => {
  const name = pluginDetail.value?.name;
  if (!name) return;
  exporting.value = true;
  try {
    const res = await window.market.exportPluginsBundle({ pluginName: name });
    if (res?.canceled) return;
    if (!res?.ok) {
      const errKey = `feature.installed.exportErrors.${res.error || 'UNKNOWN'}`;
      const errTxt = t(errKey);
      message.error(
        errTxt !== errKey
          ? errTxt
          : res?.error || t('feature.installed.exportFail')
      );
      return;
    }
    message.success(
      t('feature.installed.exportSuccess', {
        name: pluginDetail.value.pluginName || name,
        version: pluginDetail.value.version || '-',
      })
    );
  } finally {
    exporting.value = false;
  }
};

const importBundle = async () => {
  importing.value = true;
  try {
    const res = await window.market.importPluginsBundle();
    if (res?.canceled) return;
    if (!res?.ok) {
      const errKey = `feature.installed.importErrors.${res.error || 'UNKNOWN'}`;
      const errTxt = t(errKey);
      message.error(
        errTxt !== errKey
          ? errTxt
          : res?.error || t('feature.installed.importFail')
      );
      return;
    }
    const n = res.imported?.length || 0;
    if (n > 0) {
      message.success(t('feature.installed.importSuccess', { count: n }));
    }
    if (res.skippedNotNewer?.length) {
      res.skippedNotNewer.forEach((row) => {
        message.warning(
          t('feature.installed.importSkippedNotNewer', {
            name: row.name,
            imported: row.importedVersion,
            installed: row.installedVersion,
          })
        );
      });
    }
    if (res.skipped?.length) {
      message.warning(
        t('feature.installed.importSkipped', { names: res.skipped.join(', ') })
      );
    }
    await updateLocalPlugin();
  } finally {
    importing.value = false;
  }
};
const startUnDownload = (name) => store.dispatch('startUnDownload', name);
const errorUnDownload = (name) => store.dispatch('errorUnDownload', name);

const selectedPluginName = ref('');

const filteredPlugins = computed(() => {
  const keyword = searchKeyword.value.trim().toLocaleLowerCase();
  if (!keyword) return localPlugins.value;
  return localPlugins.value.filter((plugin) =>
    [plugin.pluginName, plugin.description, plugin.author]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase().includes(keyword))
  );
});

const togglePlugin = (name) => {
  selectedPluginName.value = selectedPluginName.value === name ? '' : name;
};

watch(localPlugins, () => {
  const selectedStillExists = localPlugins.value.some(
    (plugin) => plugin.name === selectedPluginName.value
  );
  if (!selectedStillExists) {
    selectedPluginName.value = '';
  }
});

const pluginDetail = computed(() => {
  return (
    localPlugins.value.find((v) => v.name === selectedPluginName.value) || {}
  );
});

const runnableFeatureCount = computed(
  () =>
    (pluginDetail.value.features || []).filter(
      (feature) => feature.cmds?.length
    ).length
);
const runnableCommandCount = computed(() =>
  (pluginDetail.value.features || []).reduce(
    (total, feature) => total + (feature.cmds || []).length,
    0
  )
);

const matchRulesDocument = ref(
  normalizeMatchRulesDocument(
    window.flick.db.get(SUPER_PANEL_MATCH_RULES_DB_ID)
  )
);
if (!matchRulesDocument.value._id) {
  matchRulesDocument.value._id = SUPER_PANEL_MATCH_RULES_DB_ID;
}
const matchRuleEditorVisible = ref(false);
const editingRuleContext = ref(null);

const isMatchCommand = (cmd) => !!cmd && typeof cmd === 'object';
const commandDisplayName = (feature, cmd) =>
  isMatchCommand(cmd) ? cmd.label || feature.code : String(cmd);
const commandRowKey = (feature, cmd, index) =>
  `${feature.code}:${commandMatchKey(cmd, index)}`;

const commandOverrideId = (feature, cmd, index) => {
  const key = commandMatchKey(cmd, index);
  return matchRuleOverrideId(pluginDetail.value.name, feature.code, key);
};

const findRuleOverride = (feature, cmd, index) => {
  const id = commandOverrideId(feature, cmd, index);
  return matchRulesDocument.value.data.find((row) => row.id === id);
};

const effectiveRuleCommand = (feature, cmd, index) => {
  const override = findRuleOverride(feature, cmd, index);
  if (!override) return cmd;
  return {
    ...cmd,
    ...(Number.isFinite(override.priority)
      ? { priority: override.priority }
      : {}),
    matchRules: {
      ...(cmd.matchRules || {}),
      ...override.matchRules,
    },
  };
};

const isRuleCustomized = (feature, cmd, index) =>
  !!findRuleOverride(feature, cmd, index);

const matchRuleSummary = (feature, cmd, index) => {
  const effective = effectiveRuleCommand(feature, cmd, index);
  if (effective.matchRules?.enabled === false) {
    return t('feature.installed.matchRules.disabled');
  }
  const selection =
    effective.matchRules?.selection ||
    (['files', 'img'].includes(effective.type) ? 'files' : 'text');
  if (effective.type === 'img') {
    return t('feature.installed.matchRules.imageSummary');
  }
  if (selection === 'text') {
    return effective.matchRules?.pattern || effective.match
      ? t('feature.installed.matchRules.textPatternSummary')
      : t('feature.installed.matchRules.anyTextSummary');
  }
  const minCount = effective.matchRules?.minCount ?? effective.minLength ?? 1;
  const kinds = effective.matchRules?.kinds || ['file'];
  return t('feature.installed.matchRules.fileSummary', {
    count: minCount,
    kind: kinds.includes('directory')
      ? t('feature.installed.matchRules.fileAndDirectory')
      : t('feature.installed.matchRules.regularFile'),
  });
};

const editingEffectiveCommand = computed(() => {
  const context = editingRuleContext.value;
  return context
    ? effectiveRuleCommand(context.feature, context.cmd, context.index)
    : {};
});
const editingRuleCustomized = computed(() => {
  const context = editingRuleContext.value;
  return context
    ? isRuleCustomized(context.feature, context.cmd, context.index)
    : false;
});

const openMatchRuleEditor = (feature, cmd, index) => {
  editingRuleContext.value = { feature, cmd, index };
  matchRuleEditorVisible.value = true;
};
const closeMatchRuleEditor = () => {
  matchRuleEditorVisible.value = false;
};

const persistMatchRulesDocument = () => {
  const { rev } = window.flick.db.put(
    JSON.parse(JSON.stringify(matchRulesDocument.value))
  );
  matchRulesDocument.value._rev = rev;
};

const saveMatchRule = ({ priority, matchRules }) => {
  const context = editingRuleContext.value;
  if (!context) return;
  const commandKey = commandMatchKey(context.cmd, context.index);
  const id = matchRuleOverrideId(
    pluginDetail.value.name,
    context.feature.code,
    commandKey
  );
  const row = {
    id,
    pluginName: pluginDetail.value.name,
    featureCode: context.feature.code,
    commandKey,
    priority,
    matchRules,
  };
  matchRulesDocument.value.data = [
    ...matchRulesDocument.value.data.filter((item) => item.id !== id),
    row,
  ];
  persistMatchRulesDocument();
  closeMatchRuleEditor();
  message.success(t('feature.installed.matchRules.saved'));
};

const resetMatchRule = () => {
  const context = editingRuleContext.value;
  if (!context) return;
  const id = commandOverrideId(context.feature, context.cmd, context.index);
  matchRulesDocument.value.data = matchRulesDocument.value.data.filter(
    (item) => item.id !== id
  );
  persistMatchRulesDocument();
  closeMatchRuleEditor();
  message.success(t('feature.installed.matchRules.restored'));
};

const superPanelPlugins = ref(
  window.flick.db.get('super-panel-user-plugins') || {
    data: [],
    _id: 'super-panel-user-plugins',
  }
);

const addCmdToSuperPanel = ({ cmd, code }) => {
  const plugin = buildPluginLaunchPayload({
    pluginDetail: pluginDetail.value,
    feature: { code },
    cmd,
  });
  if (!plugin) return;
  superPanelPlugins.value.data.push(plugin);
  const { rev } = window.flick.db.put(
    JSON.parse(JSON.stringify(superPanelPlugins.value))
  );
  superPanelPlugins.value._rev = rev;
};

const removePluginToSuperPanel = ({ cmd, name }) => {
  superPanelPlugins.value.data = toRaw(superPanelPlugins.value).data.filter(
    (item) => {
      if (name) return item.name !== name;
      return item.cmd !== cmd;
    }
  );
  const { rev } = window.flick.db.put(toRaw(superPanelPlugins.value));
  superPanelPlugins.value._rev = rev;
};

const hasAdded = (feature, cmd) =>
  superPanelPlugins.value.data.some(
    (item) =>
      item.name === pluginDetail.value.name &&
      item.cmd === cmd &&
      (item.ext?.code || item.feature?.code) === feature.code
  );

const togglePanelPin = (feature, cmd) => {
  if (hasAdded(feature, cmd)) {
    superPanelPlugins.value.data = toRaw(superPanelPlugins.value).data.filter(
      (item) =>
        !(
          item.name === pluginDetail.value.name &&
          item.cmd === cmd &&
          (item.ext?.code || item.feature?.code) === feature.code
        )
    );
    const { rev } = window.flick.db.put(toRaw(superPanelPlugins.value));
    superPanelPlugins.value._rev = rev;
    return;
  }
  addCmdToSuperPanel({ cmd, code: feature.code });
};

const openPlugin = ({ cmd, feature }) => {
  const payload = buildPluginLaunchPayload({
    pluginDetail: pluginDetail.value,
    feature,
    cmd,
  });
  if (!payload) return;
  window.flick.openPlugin(JSON.parse(JSON.stringify(payload)));
};

const deletePlugin = async (plugin) => {
  startUnDownload(plugin.name);
  const timer = setTimeout(() => {
    errorUnDownload(plugin.name);
    message.error('卸载超时，请重试！');
  }, 60000);
  try {
    await window.market.deletePlugin(toMarketPayload(plugin));
    removePluginToSuperPanel({ name: plugin.name });
    const remainingRules = matchRulesDocument.value.data.filter(
      (item) => item.pluginName !== plugin.name
    );
    if (remainingRules.length !== matchRulesDocument.value.data.length) {
      matchRulesDocument.value.data = remainingRules;
      persistMatchRulesDocument();
    }
    await updateLocalPlugin();
  } catch (e) {
    errorUnDownload(plugin.name);
    message.error('卸载失败，请重试或手动删除插件目录');
  } finally {
    clearTimeout(timer);
  }
};

const confirmDeletePlugin = (plugin) => {
  Modal.confirm({
    title: t('feature.installed.removeConfirmTitle'),
    content: t('feature.installed.removeConfirmContent', {
      name: plugin.pluginName || plugin.name,
    }),
    okText: t('feature.installed.remove'),
    okType: 'danger',
    cancelText: t('feature.localPlugin.cancelText'),
    onOk: () => deletePlugin(plugin),
  });
};

const gotoFinder = () => {
  router.push('/finder');
  store.commit('commonUpdate', { active: ['finder'] });
};
</script>

<style lang="less" scoped>
.installed {
  box-sizing: border-box;
  width: 100%;
  overflow: hidden;
  .installed-empty-toolbar {
    min-height: 56px;
    padding: 10px 16px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    border-bottom: 1px solid var(--color-border-light);
  }
  .view-container {
    background: var(--color-surface-base);
    overflow: hidden;
    min-height: 440px;
  }
  :deep(.ant-result-title) {
    color: var(--color-text-primary);
  }
  :deep(.ant-result-subtitle) {
    color: var(--color-text-desc);
  }
  .installed-layout {
    width: 100%;
    min-height: calc(100vh - 89px);
    padding: 18px;
    background: var(--color-surface-base);
  }
  .installed-toolbar {
    margin-bottom: 14px;
    display: flex;
    align-items: center;
    gap: 10px;
    white-space: nowrap;
  }
  .list-summary {
    min-width: max-content;
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 8px;
    color: var(--color-text-primary);
    font-size: 14px;
  }
  .plugin-count {
    min-width: 22px;
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--color-surface-base);
    color: var(--color-text-desc);
    font-size: 12px;
    text-align: center;
  }
  .plugin-search {
    width: auto;
    min-width: 180px;
    flex: 1 1 320px;
    border-radius: 8px;
  }
  .installed-toolbar > .ant-btn {
    flex: 0 0 auto;
  }
  .plugin-accordion {
    display: grid;
    gap: 10px;
  }
  .plugin-panel {
    overflow: hidden;
    border: 1px solid var(--color-border-light);
    border-radius: 11px;
    background: var(--color-surface-raised);
    transition:
      border-color 0.16s ease,
      box-shadow 0.16s ease;
    &.expanded {
      border-color: color-mix(
        in srgb,
        var(--ant-primary-color) 28%,
        var(--color-border-light)
      );
      box-shadow: var(--shadow-interactive);
      .expand-icon {
        color: var(--color-accent-text);
        transform: rotate(90deg);
      }
      .plugin-trigger {
        background: var(--color-surface-subtle);
      }
    }
  }
  .plugin-trigger {
    width: 100%;
    min-height: 72px;
    padding: 12px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    cursor: pointer;
    border: 0;
    background: var(--color-surface-raised);
    color: var(--color-text-content);
    font: inherit;
    text-align: left;
    transition: background-color 0.16s ease;
    &:hover {
      background: var(--color-surface-subtle);
    }
    img {
      width: 44px;
      height: 44px;
      flex: 0 0 44px;
      border-radius: 10px;
      object-fit: cover;
    }
    .info {
      min-width: 0;
      flex: 1;
    }
    .title-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .title {
      min-width: 0;
      overflow: hidden;
      color: var(--color-text-primary);
      font-size: 14px;
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .item-version {
      flex-shrink: 0;
      color: var(--color-text-desc);
      font-size: 11px;
    }
    .desc {
      margin-top: 2px;
      overflow: hidden;
      color: var(--color-text-desc);
      font-size: 12px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .expand-icon {
      flex: 0 0 auto;
      color: var(--color-text-desc);
      transition:
        color 0.16s ease,
        transform 0.16s ease;
    }
  }

  .plugin-detail {
    min-width: 0;
    padding: 0 16px;
    border-top: 1px solid var(--color-border-light);
    background: var(--color-surface-base);
  }
  .plugin-overview,
  .feature-container,
  .danger-zone {
    border: 0;
    border-radius: 0;
    background: transparent;
  }
  .plugin-overview {
    padding: 14px 0 12px;
    .plugin-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
    }
    .plugin-top strong {
      color: var(--color-text-primary);
      font-size: 14px;
    }
    .plugin-top p {
      max-width: 720px;
      margin: 3px 0 0;
      overflow: hidden;
      color: var(--color-text-desc);
      font-size: 12px;
      line-height: 1.55;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .plugin-top .ant-btn {
      width: auto;
      flex: 0 0 auto;
    }
  }
  .plugin-meta {
    margin: 10px 0 0;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 0;
    > div {
      min-width: 0;
      padding: 0 14px;
      display: flex;
      align-items: baseline;
      gap: 6px;
      border-left: 1px solid var(--color-border-light);
      &:first-child {
        padding-left: 0;
        border-left: 0;
      }
    }
    dt {
      color: var(--color-text-desc);
      font-size: 12px;
    }
    dd {
      margin: 0;
      color: var(--color-text-primary);
      font-size: 13px;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
  .feature-container {
    min-height: 0;
    padding: 12px 0;
    border-top: 1px solid var(--color-border-light);
    color: var(--color-text-content);
  }
  .section-heading {
    margin-bottom: 8px;
    display: flex;
    align-items: baseline;
    gap: 10px;
    strong {
      color: var(--color-text-primary);
      font-size: 13px;
      font-weight: 600;
    }
    p {
      margin: 0;
      color: var(--color-text-desc);
      font-size: 12px;
    }
  }
  .command-group {
    margin-bottom: 6px;
    border: 0;
    border-radius: 0;
    &:last-child {
      margin-bottom: 0;
    }
  }
  .command-group-title {
    padding: 5px 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border: 0;
    background: transparent;
    color: var(--color-text-desc);
    font-size: 12px;
    font-weight: 500;
    span {
      color: var(--color-text-desc);
      font-size: 11px;
      font-weight: 400;
    }
  }
  .command-row {
    min-height: 42px;
    padding: 5px 6px 5px 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    border-bottom: 1px solid var(--color-border-light);
    &:last-child {
      border-bottom: 0;
    }
  }
  .command-name {
    min-width: 0;
    overflow: hidden;
    color: var(--color-text-content);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .command-info {
    min-width: 0;
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
  }
  .command-title-line {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .match-badge,
  .customized-badge {
    flex: 0 0 auto;
    padding: 1px 6px;
    border-radius: 999px;
    font-size: 10px;
    line-height: 18px;
  }
  .match-badge {
    background: var(--color-surface-subtle);
    color: var(--color-text-desc);
  }
  .customized-badge {
    background: color-mix(in srgb, var(--ant-primary-color) 10%, transparent);
    color: var(--color-accent-text);
  }
  .command-rule-summary {
    overflow: hidden;
    color: var(--color-text-desc);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .command-actions {
    display: flex;
    flex-shrink: 0;
    gap: 6px;
  }
  .danger-zone {
    padding: 10px 0 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    border-top: 1px solid var(--color-border-light);
    strong {
      color: var(--color-text-primary);
      font-size: 13px;
    }
    p {
      margin: 2px 0 0;
      color: var(--color-text-desc);
      font-size: 12px;
    }
  }
}

@media (max-width: 680px) {
  .installed {
    .installed-layout {
      padding: 12px;
    }
    .installed-toolbar {
      align-items: stretch;
      flex-wrap: wrap;
      .list-summary {
        width: 100%;
      }
      .plugin-search {
        width: auto;
        min-width: 0;
        flex: 1;
      }
    }
    .plugin-detail {
      padding: 0 12px;
      .plugin-top {
        align-items: flex-start;
        gap: 12px;
        flex-direction: column;
      }
      .plugin-meta {
        align-items: flex-start;
        flex-direction: column;
        > div {
          padding: 0;
          border-left: 0;
        }
      }
      .command-row {
        align-items: flex-start;
        flex-direction: column;
      }
      .command-actions {
        width: 100%;
        .ant-btn {
          flex: 1;
        }
      }
      .danger-zone {
        align-items: flex-start;
        flex-direction: column;
      }
    }
  }
}
</style>
