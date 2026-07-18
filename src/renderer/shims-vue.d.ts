/* eslint-disable */
import type { MainFlickBridge } from '@/common/types/mainBridge';

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

declare module 'main' {
  export function main(): any;
}

declare module 'lodash.throttle';

declare global {
  interface Window {
    flick: MainFlickBridge;
    setSubInput: (options: {
      placeholder: string;
      isFocus?: boolean;
      role?: 'search' | 'filter' | 'command';
    }) => void;
    setSubInputValue: ({ value }: { value: string }) => void;
    removeSubInput: () => void;
    loadPlugin: (plugin: any) => void;
    updatePlugin: (plugin: any) => void;
    initFlick: () => void;
    refreshLauncherHeight?: () => void;
    addLocalStartPlugin: (plugin: any) => void;
    removeLocalStartPlugin: (plugin: any) => void;
    setCurrentPlugin: (plugin: any) => void;
    pluginLoaded: () => void;
    getMainInputInfo: () => {
      value: string;
      placeholder: string;
      requested: boolean;
      focus: boolean;
      role: 'search' | 'filter' | 'command';
    };
    /** 打开插件前调用，保留启动时主搜索关键词供分离窗读取 */
    captureSearchSnapshotForNextDetach?: () => void;
    clearSearchSnapshotAfterDetach?: () => void;
    searchFocus: (args: any, strict?: boolean) => any;
  }
}
