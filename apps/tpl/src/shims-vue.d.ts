/* eslint-disable */
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface Window {
  flick: any;
  require: (id: string) => any;
  exports: Record<string, any>;
}
