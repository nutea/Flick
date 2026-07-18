<template>
  <img
    v-if="logoUrl && !loadFailed"
    class="plugin-logo"
    :src="logoUrl"
    alt=""
    @error="loadFailed = true"
  />
  <component :is="fallbackIcon" v-else class="plugin-fallback-icon" />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  AppstoreOutlined,
  CodeOutlined,
  CopyOutlined,
  FileAddOutlined,
} from '@ant-design/icons-vue';
import type { BuiltinPluginIcon } from './types';

const props = defineProps<{
  logo?: string;
  builtin?: BuiltinPluginIcon;
}>();

const loadFailed = ref(false);
const logoUrl = computed(() => String(props.logo || ''));
const builtinIcons = {
  terminal: CodeOutlined,
  'create-file': FileAddOutlined,
  copy: CopyOutlined,
} as const;
const fallbackIcon = computed(
  () => (props.builtin && builtinIcons[props.builtin]) || AppstoreOutlined
);

watch(logoUrl, () => {
  loadFailed.value = false;
});
</script>

<style scoped>
.plugin-logo {
  width: 30px;
  height: 30px;
  object-fit: contain;
}

.plugin-fallback-icon {
  font-size: 28px;
  color: #574778;
}
</style>
