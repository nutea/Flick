<template>
  <div class="finder settings-page">
    <div class="market-content settings-card">
      <a-alert
        v-if="data.unavailable"
        type="warning"
        show-icon
        message="插件市场数据源暂不可用，已安装插件仍可在“已安装”中管理。"
        style="margin-bottom: 16px"
      />
      <a-skeleton v-if="loading" active :paragraph="{ rows: 8 }" />
      <Carousel
        v-else-if="data.banners?.length"
        :itemsToShow="2"
        :transition="500"
      >
        <Slide :key="index" v-for="(banner, index) in data.banners || []">
          <img
            class="carousel__item"
            @click="jumpTo(banner.link)"
            :src="banner.src"
          />
        </Slide>
      </Carousel>
      <a-empty
        v-if="!loading && !data.unavailable && !hasContent"
        description="插件市场暂无内容"
      />
      <a-divider />
      <PluginList
        v-if="must && !!must.length"
        :title="$t('feature.market.finder.must')"
        :list="must"
      />
      <PluginList
        v-if="recommend && !!recommend.length"
        :title="$t('feature.market.finder.recommended')"
        :list="recommend"
      />
      <PluginList
        v-if="newList && !!newList.length"
        :title="$t('feature.market.finder.lastUpdated')"
        :list="newList"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onBeforeMount } from 'vue';
import 'vue3-carousel/dist/carousel.css';
import { Carousel, Slide } from 'vue3-carousel';
import request from '../../../assets/request/index';
import PluginList from './plugin-list.vue';

import { useStore } from 'vuex';
const store = useStore();
const totalPlugins = computed(() => store.state.totalPlugins);

const data = ref({});
const loading = ref(true);

onBeforeMount(async () => {
  try {
    data.value = await request.getFinderDetail();
  } finally {
    loading.value = false;
  }
});

const hasContent = computed(
  () => must.value.length || recommend.value.length || newList.value.length
);

const must = computed(() => {
  const defaultData = data.value.must || [];
  if (!defaultData.length) return [];
  return defaultData.map((plugin) => {
    let searchInfo = null;
    totalPlugins.value.forEach((t) => {
      if (t.name === plugin) {
        searchInfo = t;
      }
    });
    return searchInfo;
  });
});

const jumpTo = (url) => {
  window.flick.shellOpenExternal(url);
};

const recommend = computed(() => {
  const defaultData = data.value.recommend || [];
  if (!defaultData.length) return [];
  return defaultData.map((plugin) => {
    let searchInfo = null;
    totalPlugins.value.forEach((t) => {
      if (t.name === plugin) {
        searchInfo = t;
      }
    });
    return searchInfo;
  });
});

const newList = computed(() => {
  const defaultData = data.value.new || [];
  if (!defaultData.length) return [];
  return defaultData.map((plugin) => {
    let searchInfo = null;
    totalPlugins.value.forEach((t) => {
      if (t.name === plugin) {
        searchInfo = t;
      }
    });
    return searchInfo;
  });
});
</script>

<style lang="less">
.finder {
  position: relative;
  width: 100%;
  overflow-x: hidden;
  box-sizing: border-box;
  &::-webkit-scrollbar {
    width: 0;
  }
  .ant-divider-horizontal {
    margin: 17px 0;
  }
  .market-content {
    padding: 20px;
  }
}

.carousel__item {
  cursor: pointer;
  min-height: 180px;
  aspect-ratio: 16 / 7;
  object-fit: cover;
  width: 100%;
  background-color: var(--vc-clr-primary);
  color: var(--vc-clr-white);
  font-size: 20px;
  border-radius: 8px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.carousel__track {
  margin-bottom: 0;
}

.carousel__slide {
  padding-right: 6px;
  &:last-child {
    padding-left: 6px;
  }
}

.carousel__prev,
.carousel__next {
  box-sizing: content-box;
  border: 5px solid var(--color-body-bg);
}

@media (max-width: 820px) {
  .carousel__item {
    min-height: 140px;
  }
}
</style>
