<template>
  <div
    class="file-container"
    @drop.prevent="dropFile"
    @dragenter="checkDrop"
    @dragover="checkDrop"
  >
    <div class="quick-launch-dropzone">
      <div>
        <strong>添加快捷启动项</strong>
        <p>将应用、文件或文件夹拖到这里，也可以手动选择。</p>
      </div>
      <a-button type="primary" @click="choosePaths">选择项目</a-button>
    </div>
    <a-empty
      v-if="!localStartList.length"
      description="暂无快捷启动项"
      class="quick-launch-empty"
    />
    <a-list
      v-if="localStartList.length"
      item-layout="horizontal"
      :data-source="localStartList"
    >
      <template #renderItem="{ item }">
        <a-list-item>
          <template #actions>
            <a-button type="link" danger @click="() => remove(item)">
              移除
            </a-button>
          </template>
          <a-list-item-meta :description="item.desc">
            <template #title>
              <div>
                <span :class="item.del ? 'del-title' : ''">
                  {{ item.name }}
                </span>
                <span v-if="item.del" class="has-del">文件不存在</span>
              </div>
            </template>
            <template #avatar>
              <a-avatar shape="square" :src="item.icon" />
            </template>
          </a-list-item-meta>
        </a-list-item>
      </template>
    </a-list>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const dbId = 'flick-local-start-app';

const localStartList = ref(window.flick.dbStorage.getItem(dbId) || []);

const checkFileExists = async () => {
  localStartList.value = await Promise.all(
    localStartList.value.map(async (plugin) => {
      if (!(await window.market.pathExists(plugin.desc))) {
        return {
          ...plugin,
          del: true,
        };
      }
      return {
        ...plugin,
        del: false,
      };
    })
  );
};

void checkFileExists();

const createLaunchItem = async (filePath, displayName) => {
  const action =
    window.market.platform === 'win32'
      ? `start "dummyclient" "${filePath}"`
      : `open ${filePath.replace(/ /g, '\\ ')}`;
  return {
    icon: await window.flick.getFileIcon(filePath),
    value: 'plugin',
    desc: filePath,
    pluginType: 'app',
    name: displayName || filePath.split(/[\\/]/).filter(Boolean).pop(),
    action,
    keyWords: [displayName || filePath],
    names: [displayName || filePath],
  };
};

const addPaths = async (entries) => {
  const existing = new Set(localStartList.value.map((item) => item.desc));
  const uniqueEntries = entries.filter(
    (entry) => entry.path && !existing.has(entry.path)
  );
  const files = await Promise.all(
    uniqueEntries.map(async (entry) => {
      const plugin = await createLaunchItem(entry.path, entry.name);
      window.market.addLocalStartPlugin(plugin);
      return plugin;
    })
  );
  localStartList.value = [...localStartList.value, ...files];
  window.flick.dbStorage.setItem(
    dbId,
    JSON.parse(JSON.stringify(localStartList.value))
  );
};

const dropFile = async (e) => {
  await addPaths(
    Array.from(e.dataTransfer.files).map((file) => ({
      path: window.market.getPathForFile(file),
      name: file.name,
    }))
  );
};

const choosePaths = async () => {
  const paths = window.flick.showOpenDialog({
    title: '选择要加入快捷启动的应用、文件或文件夹',
    properties: ['openFile', 'openDirectory', 'multiSelections'],
  });
  if (!paths?.length) return;
  await addPaths(paths.map((path) => ({ path })));
};

const remove = (item) => {
  localStartList.value = localStartList.value.filter(
    (app) => app.desc !== item.desc
  );
  window.flick.dbStorage.setItem(
    dbId,
    JSON.parse(JSON.stringify(localStartList.value))
  );
  window.market.removeLocalStartPlugin(JSON.parse(JSON.stringify(item)));
};

const checkDrop = (e) => {
  e.preventDefault();
};
</script>

<style lang="less">
.file-container {
  box-sizing: border-box;
  width: 100%;
  overflow-x: hidden;
  background: var(--color-body-bg);
  min-height: 320px;
  .quick-launch-dropzone {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 18px;
    margin-bottom: 12px;
    border: 1px dashed var(--color-border-strong);
    border-radius: 10px;
    background: var(--color-surface-subtle);
    color: var(--color-text-content);
    strong {
      color: var(--color-text-primary);
    }
    p {
      margin: 4px 0 0;
      color: var(--color-text-desc);
    }
  }
  .quick-launch-empty {
    padding: 36px 0;
  }
  .del-title {
    text-decoration-line: line-through;
    text-decoration-color: var(--ant-error-color);
  }
  .has-del {
    color: var(--ant-error-color);
    font-size: 12px;
    margin-left: 6px;
  }
}

@media (max-width: 700px) {
  .file-container .quick-launch-dropzone {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
