<template>
  <div class="main" :class="{ pinned }">
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

    <div
      v-if="selectedPreview"
      class="selected-content"
      :class="`kind-${selectedPreview.kind}`"
    >
      <div class="selected-header">
        <span class="selected-title">当前选中</span>
        <span class="selected-type">{{ selectedPreview.typeLabel }}</span>
      </div>
      <div class="selected-main ellpise">{{ selectedPreview.title }}</div>
      <div class="selected-sub ellpise">{{ selectedPreview.subtitle }}</div>
    </div>
    <div v-else class="selected-content kind-none">
      <div class="selected-header">
        <span class="selected-title">当前选中</span>
        <span class="selected-type">无选中</span>
      </div>
      <div class="selected-main">未检测到选中内容</div>
      <div class="selected-sub">可直接使用下方固定插件</div>
    </div>

    <div v-if="translate || loading" class="translate-content">
      <div class="translate-header">
        <div class="section-caption">文本翻译</div>
        <a-button
          v-if="!loading && showFullTranslationEntry"
          class="full-translation-btn selected-type"
          type="link"
          size="small"
          @click="fullTranslationVisible = !fullTranslationVisible"
        >
          {{ fullTranslationVisible ? '收起' : '查看全文' }}
        </a-button>
      </div>
      <div v-if="loading" class="spinner">
        <div class="bounce1" />
        <div class="bounce2" />
        <div class="bounce3" />
      </div>
      <template v-else-if="translate">
        <div class="translate-target">
          <div v-if="!fullTranslationVisible" class="ellpise">
            {{ translationPreviewText }}
          </div>
          <div v-else class="full-translation-body">
            <div
              v-for="(line, idx) in fullTranslationLines"
              :key="idx"
              class="full-translation-line"
            >
              {{ line }}
            </div>
          </div>
        </div>
      </template>
    </div>

    <div v-if="matchPlugins.length" class="plugins-content">
      <div class="plugin-title">匹配插件</div>
      <div class="plugin-grid">
        <div
          v-for="(item, idx) in matchPlugins"
          :key="idx"
          class="plugin-item"
          @click="runPluginClick(item, $event)"
        >
          <PluginIcon :logo="item.logo" :builtin="item.icon" />
          <div>{{ item.name }}</div>
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
          <PluginIcon :logo="item.logo" />
          <div>{{ item.pluginName }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { PushpinOutlined } from '@ant-design/icons-vue';
import PluginIcon from './PluginIcon.vue';
import { useSuperPanel } from './use-super-panel';

const {
  translate,
  loading,
  selectedText,
  selectedFileUrl,
  selectedFiles,
  selectedFileIsDirectory,
  matchPlugins,
  userPlugins,
  pinned,
  togglePin,
  runPluginClick,
} = useSuperPanel();

const fullTranslationVisible = ref(false);

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

  if (selectedFiles.value.length > 1) {
    const directoryCount = selectedFiles.value.filter(
      (file) => file.isDirectory
    ).length;
    const fileCount = selectedFiles.value.length - directoryCount;
    const firstName = selectedFiles.value[0]?.name || '多个项目';
    const summary = [
      fileCount ? `${fileCount} 个文件` : '',
      directoryCount ? `${directoryCount} 个文件夹` : '',
    ]
      .filter(Boolean)
      .join('、');
    return {
      kind: 'file',
      typeLabel: `${selectedFiles.value.length} 个项目`,
      title: `${firstName} 等`,
      subtitle: summary,
    };
  }

  const rawPath = selectedFileUrl.value.trim();
  if (!rawPath) return null;

  const fullPath = normalizePath(rawPath);
  const seg = fullPath.split(/[/\\]/).filter(Boolean);
  const filename = seg[seg.length - 1] || fullPath;
  if (selectedFileIsDirectory.value) {
    return {
      kind: 'folder',
      typeLabel: '文件夹',
      title: filename,
      subtitle: fullPath,
    };
  }
  const ext = filename.includes('.')
    ? filename.split('.').pop()?.toLowerCase() || ''
    : '';
  const imageSet = new Set([
    'png',
    'jpg',
    'jpeg',
    'gif',
    'webp',
    'bmp',
    'svg',
    'ico',
  ]);
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
  const docSet = new Set([
    'pdf',
    'doc',
    'docx',
    'xls',
    'xlsx',
    'ppt',
    'pptx',
    'txt',
    'rtf',
  ]);

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
  const main = (translate.value.translation || []).filter((line) =>
    String(line || '').trim()
  );
  const notes = (translate.value.basic?.explains || []).filter((line) =>
    String(line || '').trim()
  );
  return [...main, ...notes];
});

const translationFullText = computed(() =>
  fullTranslationLines.value.join('；')
);
const translationPreviewText = computed(() =>
  fullTranslationLines.value.slice(0, 2).join('；')
);
const showFullTranslationEntry = computed(
  () =>
    fullTranslationLines.value.length > 2 ||
    translationFullText.value.length > 56
);

function collapseFullTranslation() {
  fullTranslationVisible.value = false;
}

watch(loading, (isLoading) => {
  if (isLoading) collapseFullTranslation();
});

watch([selectedText, selectedFileUrl, selectedFiles], collapseFullTranslation);

onMounted(() => {
  window.addEventListener('blur', collapseFullTranslation);
});

onUnmounted(() => {
  window.removeEventListener('blur', collapseFullTranslation);
});
</script>

<style>
html,
body,
#app {
  width: 100%;
  height: 100%;
  min-width: 0;
  margin: 0;
  padding: 0;
  overflow: hidden;
  overscroll-behavior: none;
}
*,
*::before,
*::after {
  box-sizing: border-box;
}
::-webkit-scrollbar {
  display: none;
}
</style>

<style scoped>
.main {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: 50px;
  padding: 8px 0 12px;
  overflow: hidden;
  color: #1f2937;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.main.pinned .selected-content,
.main.pinned .translate-content {
  box-shadow: 0 10px 28px rgba(37, 99, 235, 0.12);
}
.panel-caption {
  min-width: 0;
  min-height: 26px;
  padding: 0 10px 6px 12px;
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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pin-btn {
  -webkit-app-region: no-drag;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  min-width: 24px;
  flex: 0 0 24px;
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
  min-width: 0;
  max-width: calc(100% - 20px);
  overflow: hidden;
  font-size: 12px;
  color: #ff4ea4;
  box-sizing: border-box;
  background: #f5f7fb;
  border: 1px solid #edf1f7;
  border-radius: 8px;
}
.selected-content {
  margin: 0 10px 10px;
  padding: 8px 10px;
  min-width: 0;
  max-width: calc(100% - 20px);
  overflow: hidden;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
}
.selected-header {
  display: flex;
  min-width: 0;
  gap: 8px;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.selected-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #4b5563;
  font-size: 12px;
  font-weight: 500;
}
.selected-type {
  flex: 0 0 auto;
  max-width: 50%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  line-height: 18px;
  border-radius: 10px;
  padding: 0 8px;
  background: #e8f3ff;
  color: #2563eb;
}
.selected-main {
  min-width: 0;
  font-size: 13px;
  color: #1f2937;
  font-weight: 500;
}
.selected-sub {
  min-width: 0;
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
  min-width: 0;
  gap: 8px;
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
.kind-none .selected-type {
  background: #f1f5f9;
  color: #64748b;
}
.translate-target {
  min-width: 0;
  overflow: hidden;
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
  min-width: 0;
  overflow: hidden;
}
.full-translation-line {
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
  color: #334155;
  font-size: 12px;
  line-height: 1.6;
  margin-bottom: 5px;
}
.ellpise {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  overflow-wrap: anywhere;
  word-break: break-word;
  display: -webkit-box;
  line-clamp: 2;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.plugin-item {
  height: 72px;
  min-width: 0;
  width: 100%;
  max-width: 72px;
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
.plugin-item :deep(.plugin-logo),
.plugin-item :deep(.plugin-fallback-icon) {
  padding-bottom: 6px;
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
  padding: 6px 12px;
  background-color: transparent;
  color: #8b93a1;
  letter-spacing: 0.3px;
  box-sizing: border-box;
}
.plugin-grid {
  display: grid;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  justify-content: center;
  justify-items: center;
  gap: 6px;
  padding: 0 10px;
  overflow: hidden;
}
.plugins-content {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
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
