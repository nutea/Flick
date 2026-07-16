/* eslint-disable */
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

declare module 'main' {
  export function main(): any;
}

declare const __static: string;

declare module 'lodash.throttle';

interface Window {
  flick: any;
  setSubInput: ({ placeholder }: { placeholder: string }) => void;
  setSubInputValue: ({ value }: { value: string }) => void;
  removeSubInput: () => void;
  loadPlugin: (plugin: any) => void;
  updatePlugin: (plugin: any) => void;
  initFlick: () => void;
  addLocalStartPlugin: (plugin: any) => void;
  removeLocalStartPlugin: (plugin: any) => void;
  setCurrentPlugin: (plugin: any) => void;
  pluginLoaded: () => void;
  getMainInputInfo: () => any;
  /** 打开插件前调用，保留启动时主搜索关键词供分离窗读取 */
  captureSearchSnapshotForNextDetach?: () => void;
  clearSearchSnapshotAfterDetach?: () => void;
  searchFocus: (args: any, strict?: boolean) => any;
}
