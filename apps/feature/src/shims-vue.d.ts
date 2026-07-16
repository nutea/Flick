/* eslint-disable */
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module 'axios'

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VUE_APP_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  flick: any;
  market: any
}

namespace Market {
  interface Plugin {
    isdownload?: boolean;
    name?: string;
    isloading: boolean
  }
}
