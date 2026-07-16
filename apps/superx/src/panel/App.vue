<template>
  <div class="main" id="app" :class="{ pinned }">
    <div class="panel-caption" :class="{ draggable: pinned }">
      <span class="panel-caption-text">超级面板</span>
      <button
        type="button"
        class="pin-btn"
        :class="{ active: pinned }"
        :title="pinned ? '取消固定' : '固定窗口'"
        @click="togglePin"
      >
        <PushpinOutlined />
      </button>
    </div>

    <div v-if="selectedPreview" class="selected-content" :class="`kind-${selectedPreview.kind}`">
      <div class="selected-header">
        <span class="selected-title">当前选中</span>
        <span class="selected-type">{{ selectedPreview.typeLabel }}</span>
      </div>
      <div class="selected-main ellpise">{{ selectedPreview.title }}</div>
      <div class="selected-sub ellpise">{{ selectedPreview.subtitle }}</div>
    </div>

    <div v-if="translate || loading" class="translate-content">
      <div class="translate-header">
        <div class="section-caption">文本翻译</div>
        <a-button
          v-if="!loading && showFullTranslationEntry"
          class="full-translation-btn selected-type"
          type="link"
          size="small"
          @click="fullTranslationVisible = true"
        >
          查看全文
        </a-button>
      </div>
      <div v-if="loading" class="spinner">
        <div class="bounce1" />
        <div class="bounce2" />
        <div class="bounce3" />
      </div>
      <template v-else-if="translate">
        <div class="translate-target">
          <div class="ellpise">{{ translationPreviewText }}</div>
        </div>
      </template>
    </div>

    <a-modal
      v-model:visible="fullTranslationVisible"
      title="翻译全文"
      :footer="null"
      width="500px"
      wrap-class-name="translation-modal"
      :body-style="{ padding: '8px 10px 6px' }"
      centered
    >
      <div class="full-translation-body">
        <div
          v-for="(line, idx) in fullTranslationLines"
          :key="idx"
          class="full-translation-line"
        >
          {{ line }}
        </div>
      </div>
    </a-modal>

    <div v-if="matchPlugins.length" class="plugins-content">
      <div class="plugin-title">匹配插件</div>
      <div class="plugin-grid">
        <div
          v-for="(item, idx) in matchPlugins"
          :key="idx"
          class="plugin-item"
          @click="runPluginClick(item, $event)"
        >
          <component
            :is="iconFor(item)"
            v-if="item.type === 'default'"
            class="plugin-default-icon"
          />
          <img v-else width="30" :src="item.logo" alt="" />
          <div>{{ displayPluginLabel(item.name) }}</div>
        </div>
      </div>
    </div>

    <div v-if="userPlugins.length" class="plugins-content">
      <div class="plugin-title">固定插件</div>
      <div class="plugin-grid">
        <div
          v-for="(item, idx) in userPlugins"
          :key="idx"
          class="plugin-item"
          @click="runPluginClick(item, $event)"
        >
          <img width="30" :src="item.logo" alt="" />
          <div>{{ item.pluginName }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
  CodeOutlined,
  CopyOutlined,
  FileAddOutlined,
  PushpinOutlined,
} from '@ant-design/icons-vue';
import { useSuperPanel } from './use-super-panel';
import type { MatchPluginItem } from './types';

const {
  translate,
  loading,
  selectedText,
  selectedFileUrl,
  matchPlugins,
  userPlugins,
  pinned,
  togglePin,
  runPluginClick,
} = useSuperPanel();

const fullTranslationVisible = ref(false);

const defaultIconByName: Record<string, typeof CodeOutlined> = {
  终端打开: CodeOutlined,
  新建文件: FileAddOutlined,
  复制路径: CopyOutlined,
  复制当前路径: CopyOutlined,
};

function iconFor(item: MatchPluginItem) {
  return defaultIconByName[item.name] || CopyOutlined;
}

function displayPluginLabel(name: string) {
  return name === '复制当前路径' ? '复制路径' : name;
}

function normalizePath(raw: string): string {
  return raw.replace(/^file:\/\//, '');
}

const selectedPreview = computed(() => {
  const text = selectedText.value.trim();
  if (text) {
    return {
      kind: 'text',
      typeLabel: '文本',
      title: text,
      subtitle: `长度 ${text.length}`,
    };
  }

  const rawPath = selectedFileUrl.value.trim();
  if (!rawPath) return null;

  const fullPath = normalizePath(rawPath);
  const seg = fullPath.split(/[/\\]/).filter(Boolean);
  const filename = seg[seg.length - 1] || fullPath;
  const ext = filename.includes('.') ? filename.split('.').pop()?.toLowerCase() || '' : '';
  const imageSet = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico']);
  const videoSet = new Set(['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv']);
  const audioSet = new Set(['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a']);
  const archiveSet = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz']);
  const codeSet = new Set([
    'ts',
    'tsx',
    'js',
    'jsx',
    'vue',
    'py',
    'java',
    'go',
    'rs',
    'c',
    'cpp',
    'h',
    'hpp',
    'json',
    'yml',
    'yaml',
    'md',
    'xml',
    'html',
    'css',
    'scss',
    'less',
  ]);
  const docSet = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf']);

  let kind = 'file';
  let typeLabel = ext ? `${ext.toUpperCase()} 文件` : '文件夹';
  if (!ext) {
    kind = 'folder';
    typeLabel = '文件夹';
  } else if (imageSet.has(ext)) {
    kind = 'image';
    typeLabel = '图片';
  } else if (videoSet.has(ext)) {
    kind = 'video';
    typeLabel = '视频';
  } else if (audioSet.has(ext)) {
    kind = 'audio';
    typeLabel = '音频';
  } else if (archiveSet.has(ext)) {
    kind = 'archive';
    typeLabel = '压缩包';
  } else if (codeSet.has(ext)) {
    kind = 'code';
    typeLabel = '代码/配置';
  } else if (docSet.has(ext)) {
    kind = 'doc';
    typeLabel = '文档';
  }

  return {
    kind,
    typeLabel,
    title: filename,
    subtitle: fullPath,
  };
});

const fullTranslationLines = computed(() => {
  if (!translate.value) return [] as string[];
  const main = (translate.value.translation || []).filter((line) => String(line || '').trim());
  const notes = (translate.value.basic?.explains || []).filter((line) => String(line || '').trim());
  return [...main, ...notes];
});

const translationFullText = computed(() => fullTranslationLines.value.join('；'));
const translationPreviewText = computed(() => fullTranslationLines.value.slice(0, 2).join('；'));
const showFullTranslationEntry = computed(
  () => fullTranslationLines.value.length > 2 || translationFullText.value.length > 56
);

function closeTranslationModal() {
  fullTranslationVisible.value = false;
}

onMounted(() => {
  window.addEventListener('blur', closeTranslationModal);
});

onUnmounted(() => {
  window.removeEventListener('blur', closeTranslationModal);
});
</script>

<style>
html,
body {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
}
::-webkit-scrollbar {
  display: none;
}
</style>

<style scoped>
.main {
  min-height: 100%;
  box-sizing: border-box;
  padding: 8px 0 10px;
}
.main.pinned .selected-content,
.main.pinned .translate-content {
  box-shadow: 0 10px 28px rgba(37, 99, 235, 0.12);
}
.panel-caption {
  padding: 0 10px 8px;
  font-size: 12px;
  color: #8b93a1;
  letter-spacing: 0.3px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  user-select: none;
  -webkit-user-select: none;
}
.panel-caption.draggable {
  -webkit-app-region: drag;
}
.panel-caption-text {
  min-width: 0;
}
.pin-btn {
  -webkit-app-region: no-drag;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #8b93a1;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    transform 0.15s ease;
}
.pin-btn:hover {
  background: #e2e8f0;
  color: #475569;
}
.pin-btn.active {
  background: #dbeafe;
  color: #2563eb;
  transform: rotate(18deg);
}
.translate-content {
  margin: 0 10px 10px;
  padding: 8px 10px;
  font-size: 12px;
  color: #ff4ea4;
  box-sizing: border-box;
  background: #f5f7fb;
  border-radius: 8px;
}
.selected-content {
  margin: 0 10px 10px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #f8fafc;
}
.selected-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.selected-title {
  color: #4b5563;
  font-size: 12px;
  font-weight: 500;
}
.selected-type {
  font-size: 11px;
  line-height: 18px;
  border-radius: 10px;
  padding: 0 8px;
  background: #e8f3ff;
  color: #2563eb;
}
.selected-main {
  font-size: 13px;
  color: #1f2937;
  font-weight: 500;
}
.selected-sub {
  margin-top: 2px;
  font-size: 11px;
  color: #6b7280;
}
.section-caption {
  margin-bottom: 6px;
  font-size: 11px;
  color: #8b93a1;
}
.translate-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.kind-text .selected-type {
  background: #ffedd5;
  color: #c2410c;
}
.kind-image .selected-type {
  background: #dbeafe;
  color: #1d4ed8;
}
.kind-video .selected-type,
.kind-audio .selected-type {
  background: #ede9fe;
  color: #6d28d9;
}
.kind-code .selected-type {
  background: #d1fae5;
  color: #047857;
}
.kind-doc .selected-type {
  background: #fef08a;
  color: #a16207;
}
.kind-archive .selected-type,
.kind-folder .selected-type,
.kind-file .selected-type {
  background: #e2e8f0;
  color: #334155;
}
.translate-target {
  color: #334155;
  font-size: 13px;
  font-weight: 500;
}
.full-translation-btn {
  margin-top: -2px;
  padding: 0 8px !important;
  height: 20px;
  line-height: 18px;
  font-size: 11px;
  border-radius: 10px;
  background: #e2e8f0;
  color: #334155;
}
.full-translation-body {
  max-height: 300px;
  overflow: auto;
  padding-right: 2px;
}
.full-translation-line {
  color: #334155;
  font-size: 12px;
  line-height: 1.6;
  margin-bottom: 5px;
}
.ellpise {
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  line-clamp: 2;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.plugin-item {
  height: 74px;
  margin: 4px 0;
  width: 72px;
  max-width: 72px;
  min-width: 72px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  font-size: 12px;
  cursor: pointer;
  border-radius: 8px;
  transition:
    background-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.15s ease;
}
.plugin-item:hover {
  background: #f5f7fb;
  box-shadow: 0 4px 10px rgba(15, 23, 42, 0.08);
  transform: translateY(-1px);
}
.plugin-item img,
.plugin-default-icon {
  padding-bottom: 6px;
}
.plugin-default-icon {
  font-size: 28px;
  color: #574778;
}
.plugin-item div {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  padding: 0 1px;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
  display: -webkit-box;
  line-clamp: 1;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
}
.plugin-title {
  font-size: 11px;
  width: 100%;
  padding: 6px 10px;
  background-color: transparent;
  color: #8b93a1;
  letter-spacing: 0.3px;
  box-sizing: border-box;
}
.plugin-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, 72px);
  justify-content: center;
  gap: 8px;
  padding: 0 4px;
}
.spinner > div {
  width: 10px;
  height: 10px;
  background-color: #ddd;
  border-radius: 100%;
  display: inline-block;
  animation: bouncedelay 1.4s ease-in-out infinite;
  animation-fill-mode: both;
}
.spinner .bounce1 {
  animation-delay: -0.32s;
}
.spinner .bounce2 {
  animation-delay: -0.16s;
}
@keyframes bouncedelay {
  0%,
  80%,
  100% {
    transform: scale(0);
  }
  40% {
    transform: scale(1);
  }
}
</style>

<style>
.translation-modal .ant-modal-header {
  min-height: 36px !important;
  padding: 8px !important;
}
.translation-modal .ant-modal-title {
  font-size: 12px !important;
  font-weight: 500 !important;
  line-height: 20px !important;
}
.translation-modal .ant-modal-close {
  width: 36px !important;
  height: 36px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  top: 0 !important;
  right: 0 !important;
}
</style>
