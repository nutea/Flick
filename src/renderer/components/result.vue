<template>
  <div v-show="!currentPlugin.name" class="options">
    <div
      class="history-plugins"
      v-if="
        !options.length &&
        !searchValue &&
        !clipboardFile.length &&
        config.perf.common.history
      "
    >
      <div class="section-heading">
        <span>{{ historyLabel }}</span>
        <span class="section-hint">{{ historyHint }}</span>
      </div>
      <a-row role="listbox" :aria-label="historyLabel">
        <a-col
          @click="() => openPlugin(item)"
          @contextmenu.prevent="openMenu($event, item)"
          @mouseenter="emit('selectIndex', index)"
          :class="
            currentSelect === index ? 'active history-item' : 'history-item'
          "
          :span="3"
          v-for="(item, index) in pluginHistory.slice(0, 8)"
          :key="itemKey(item, index)"
          role="option"
          :aria-selected="currentSelect === index"
        >
          <a-avatar class="history-icon" :src="item.icon" />
          <div class="name ellpise">
            {{ item.cmd || item.pluginName || item._name || item.name }}
          </div>
          <div class="badge" v-if="item.pin" :title="pinnedLabel"></div>
        </a-col>
      </a-row>
    </div>
    <div
      v-else-if="
        (searchValue || clipboardFile.length) && !displayOptions.length
      "
      class="empty-state"
      role="status"
      aria-live="polite"
    >
      <div class="empty-icon" aria-hidden="true">
        <SearchOutlined />
      </div>
      <div class="empty-title">{{ emptyTitle }}</div>
      <div class="empty-description">{{ emptyDescription }}</div>
    </div>
    <a-list
      v-else-if="displayOptions.length"
      item-layout="horizontal"
      :dataSource="displayOptions"
      role="listbox"
      :aria-label="resultsLabel"
    >
      <template #renderItem="{ item, index }">
        <a-list-item
          @click="() => item.click()"
          @mouseenter="emit('selectIndex', index)"
          :class="currentSelect === index ? 'active op-item' : 'op-item'"
          role="option"
          :aria-selected="currentSelect === index"
        >
          <a-list-item-meta :description="renderDesc(item.desc)">
            <template #title>
              <span>
                {{ titleParts(item.name, item.match).before }}
                <span class="matched-title">
                  {{ titleParts(item.name, item.match).matched }}
                </span>
                {{ titleParts(item.name, item.match).after }}
              </span>
            </template>
            <template #avatar>
              <a-avatar class="result-icon" :src="item.icon" />
            </template>
          </a-list-item-meta>
          <span v-if="currentSelect === index" class="open-hint">
            {{ openHint }}
          </span>
        </a-list-item>
      </template>
    </a-list>
    <div class="sr-only" aria-live="polite">
      {{ resultAnnouncement }}
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, reactive, ref, toRaw } from 'vue';
import { SearchOutlined } from '@ant-design/icons-vue';
import localConfig from '../confOp';

const path = window.require('path');
const remote = window.require('@electron/remote');

declare const __static: string;

const config: any = ref(localConfig.getConfig());

type PluginItem = Record<string, any>;

const props = withDefaults(
  defineProps<{
    searchValue?: string | number;
    options?: PluginItem[];
    currentSelect?: number;
    currentPlugin?: PluginItem;
    pluginHistory?: PluginItem[];
    clipboardFile?: PluginItem[];
  }>(),
  {
    searchValue: '',
    options: () => [],
    currentSelect: 0,
    currentPlugin: () => ({}),
    pluginHistory: () => [],
    clipboardFile: () => [],
  }
);

const emit = defineEmits(['choosePlugin', 'setPluginHistory', 'selectIndex']);

const isChinese = computed(() => config.value.perf.common.lang === 'zh-CN');
const historyLabel = computed(() => (isChinese.value ? '最近使用' : 'Recent'));
const historyHint = computed(() =>
  isChinese.value ? '右键可固定或移除' : 'Right-click to pin or remove'
);
const pinnedLabel = computed(() => (isChinese.value ? '已固定' : 'Pinned'));
const resultsLabel = computed(() =>
  isChinese.value ? '搜索结果' : 'Search results'
);
const emptyTitle = computed(() =>
  isChinese.value ? '没有找到匹配项' : 'No matches found'
);
const emptyDescription = computed(() =>
  props.clipboardFile.length
    ? isChinese.value
      ? '当前剪贴板内容没有可用操作'
      : 'No actions are available for this clipboard content'
    : isChinese.value
      ? '试试更短的关键词，或搜索其他应用和命令'
      : 'Try a shorter keyword or search for another app or command'
);
const openHint = computed(() => (isChinese.value ? '回车打开' : 'Enter'));

const titleParts = (title, match) => {
  const value = typeof title === 'string' ? title : '';
  if (!props.searchValue || !Array.isArray(match)) {
    return { before: value, matched: '', after: '' };
  }
  const start = Math.max(0, Number(match[0]) || 0);
  const end = Math.min(value.length - 1, Number(match[1]) || 0);
  if (end < start) return { before: value, matched: '', after: '' };
  return {
    before: value.substring(0, start),
    matched: value.substring(start, end + 1),
    after: value.substring(end + 1),
  };
};

const renderDesc = (desc = '') => {
  if (desc.length > 80) {
    return `${desc.substr(0, 63)}...${desc.substr(
      desc.length - 14,
      desc.length
    )}`;
  }
  return desc;
};

const displayOptions = computed(() => props.options.slice(0, 20));

const resultAnnouncement = computed(() => {
  if (!props.searchValue && !props.clipboardFile.length) return '';
  const count = displayOptions.value.length;
  return isChinese.value ? `${count} 个搜索结果` : `${count} search results`;
});

const itemKey = (item: PluginItem, index: number) =>
  item.id ||
  item._id ||
  `${item.originName || item.name || 'item'}-${item.cmd || index}`;

const openPlugin = (item) => {
  emit('choosePlugin', item);
};

const menuState: any = reactive({
  plugin: null,
});
let mainMenus;

const openMenu = (e, item) => {
  const pinToMain = mainMenus.getMenuItemById('pinToMain');
  const unpinFromMain = mainMenus.getMenuItemById('unpinFromMain');
  pinToMain.visible = !item.pin;
  unpinFromMain.visible = item.pin;
  mainMenus.popup({
    x: e.pageX,
    y: e.pageY,
  });
  menuState.plugin = item;
};

const initMainCmdMenus = () => {
  const menu = [
    {
      id: 'removeRecentCmd',
      label: '从"使用记录"中删除',
      icon: path.join(__static, 'icons', 'delete@2x.png'),
      click: () => {
        const history = props.pluginHistory.filter(
          (item) => item.name !== menuState.plugin.name
        );
        emit('setPluginHistory', toRaw(history));
      },
    },
    {
      id: 'pinToMain',
      label: '固定到"搜索面板"',
      icon: path.join(__static, 'icons', 'pin@2x.png'),
      click: () => {
        const history = props.pluginHistory.map((item) => {
          if (item.name === menuState.plugin.name) {
            item.pin = true;
          }
          return item;
        });
        emit('setPluginHistory', toRaw(history));
      },
    },
    {
      id: 'unpinFromMain',
      label: '从"搜索面板"取消固定',
      icon: path.join(__static, 'icons', 'unpin@2x.png'),
      click: () => {
        const history = props.pluginHistory.map((item) => {
          if (item.name === menuState.plugin.name) {
            item.pin = false;
          }
          return item;
        });
        emit('setPluginHistory', toRaw(history));
      },
    },
  ];
  mainMenus = remote.Menu.buildFromTemplate(menu);
};

initMainCmdMenus();
</script>

<style lang="less">
.ellpise {
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
}

.matched-title {
  color: var(--ant-primary-color);
  font-weight: 650;
}

.contextmenu {
  margin: 0;
  background: #fff;
  z-index: 3000;
  position: absolute;
  list-style-type: none;
  padding: 5px 0;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 400;
  color: #333;
  box-shadow: 2px 2px 3px 0 rgba(0, 0, 0, 0.3);
}

.options {
  position: absolute;
  top: 60px;
  left: 0;
  width: 100%;
  z-index: 99;
  max-height: calc(~'100vh - 60px');
  overflow: auto;
  background: var(--color-body-bg);
  border-top: 1px solid var(--color-border-subtle);

  .section-heading {
    height: 28px;
    padding: 8px 12px 0;
    box-sizing: border-box;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    color: var(--color-text-desc);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
    .section-hint {
      font-weight: 400;
      color: var(--color-text-muted);
    }
  }

  /* 无结果时空状态插图不被裁切、居中 */
  .ant-list-empty-text {
    padding: 20px 16px 28px;
  }
  .ant-empty {
    margin: 0 auto;
  }
  .ant-empty-image {
    height: auto;
    img {
      max-height: 140px;
      width: auto;
      object-fit: contain;
    }
  }
  .history-plugins {
    width: 100%;
    box-sizing: border-box;
    .history-item {
      cursor: pointer;
      box-sizing: border-box;
      height: 70px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      color: var(--color-text-content);
      position: relative;
      border-radius: var(--radius-md);
      transition:
        background-color var(--motion-fast) ease,
        transform var(--motion-fast) ease;
      &:hover {
        background: var(--color-fill-subtle);
      }
      .badge {
        position: absolute;
        top: 8px;
        right: 10px;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--ant-primary-color);
        box-shadow: 0 0 0 2px var(--color-body-bg);
      }
      &.active {
        background: var(--color-list-hover);
        box-shadow: inset 0 0 0 1px var(--color-border-subtle);
      }
    }
    .ant-row {
      padding: 4px 6px 6px;
    }
    .history-icon {
      width: 30px;
      height: 30px;
      border-radius: 9px;
      background: var(--color-fill-subtle);
    }
    .name {
      font-size: 12px;
      margin-top: 5px;
      width: 100%;
      text-align: center;
    }
  }
  .op-item {
    padding: 0 14px;
    height: 70px;
    line-height: 50px;
    max-height: 500px;
    overflow: auto;
    background: var(--color-body-bg);
    color: var(--color-text-content);
    border-color: transparent;
    border-bottom: 1px solid var(--color-border-subtle) !important;
    cursor: pointer;
    transition: background-color var(--motion-fast) ease;
    &:last-child {
      border-bottom: 0 !important;
    }
    &:hover {
      background: var(--color-fill-subtle);
    }
    &.active {
      background: var(--color-list-hover);
      box-shadow: var(--shadow-selection);
    }
    .ant-list-item-meta-title {
      color: var(--color-text-content);
    }
    .ant-list-item-meta-description {
      color: var(--color-text-desc);
      font-size: 12px;
      line-height: 18px;
    }
    .result-icon {
      width: 38px;
      height: 38px;
      border-radius: 10px;
      background: var(--color-fill-subtle);
    }
    .open-hint {
      flex: 0 0 auto;
      margin-left: 12px;
      padding: 3px 7px;
      color: var(--color-text-desc);
      background: var(--color-fill-hover);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-sm);
      font-size: 11px;
      line-height: 16px;
    }
  }
  .empty-state {
    height: 154px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 16px;
    box-sizing: border-box;
    text-align: center;
    .empty-icon {
      width: 38px;
      height: 38px;
      margin-bottom: 10px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-desc);
      background: var(--color-fill-subtle);
      font-size: 18px;
    }
    .empty-title {
      color: var(--color-text-primary);
      font-size: 14px;
      font-weight: 600;
    }
    .empty-description {
      margin-top: 4px;
      color: var(--color-text-desc);
      font-size: 12px;
    }
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
}
</style>
