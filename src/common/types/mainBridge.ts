export type BridgeCallback<T = unknown> = (payload: T) => void;

export interface PluginViewModel extends Record<string, unknown> {
  name?: string;
  logo?: string;
  logoUrl: string;
  indexUrl?: string;
  features?: any[];
  pluginType?: string;
  main?: string;
}

export interface ContextMenuItem {
  id?: string;
  label?: string;
  type?: 'normal' | 'checkbox' | 'separator';
  checked?: boolean;
  enabled?: boolean;
  accelerator?: string;
  submenu?: ContextMenuItem[];
}

export interface MainFlickBridge {
  db: {
    put(data: unknown): any;
    get(id: string): any;
    remove(doc: unknown): any;
    bulkDocs(docs: unknown[]): any;
    allDocs(key?: string): any;
  };
  clipboard: {
    availableFormats(): string[];
    clear(): void;
    readText(): string;
    readImageDataUrl(): string;
    writeText(text: unknown): void;
    imageFileDataUrl(filePath: unknown): string;
  };
  pathExtension(filePath: unknown): string;
  setExpendHeight(height: unknown): any;
  hideMainWindow(): any;
  showMainWindow(): any;
  removePlugin(): Promise<void>;
  detachPlugin(): void;
  openPluginDevTools(): void;
  openPlugin(plugin: unknown): Promise<unknown>;
  launchApp(filePath: unknown): Promise<unknown>;
  getFileIcon(filePath: unknown): Promise<string>;
  getCopyedFiles(): any;
  getPluginInfo(
    pluginName: unknown,
    pluginPath: unknown
  ): Promise<PluginViewModel>;
  getBuiltinPlugin(name: unknown): Promise<PluginViewModel>;
  getLocalPlugins(): PluginViewModel[];
  getInstalledApps(): Promise<any[]>;
  updateLocalPlugin(plugin: unknown): PluginViewModel;
  upgradePlugin(name: unknown): Promise<unknown>;
  resolveConfiguredLogo(logo: unknown): string;
  sendPluginKeyDown(keyCode: unknown, modifiers: unknown): void;
  sendSubInputChange(text: unknown): any;
  tryRedirectSingletonDetach(plugin: unknown): Promise<boolean>;
  getPluginFlickConfig(name: unknown): Promise<{
    autoDetach: boolean;
    detachInputPolicy: 'auto' | 'always';
  }>;
  flipPluginAutoDetach(name: unknown): Promise<unknown>;
  flipPluginDetachInputPolicy(name: unknown): Promise<{
    detachInputPolicy: 'auto' | 'always';
  }>;
  showContextMenu(
    items: ContextMenuItem[],
    point?: { x?: number; y?: number }
  ): Promise<string | null>;
  showMessageBox(options: {
    title?: string;
    message?: string;
    detail?: string;
  }): Promise<unknown>;
  onShow(callback: BridgeCallback<void>): void;
  onHide(callback: BridgeCallback<void>): void;
  onThemeChange(callback: BridgeCallback<void>): void;
  changeTheme(): void;
  onOpenMenu(callback: BridgeCallback<any>): void;
  onGlobalShortcut(callback: BridgeCallback<any>): () => void;
}
