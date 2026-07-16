interface DetachApi {
  platform: string;
  sendInput(text: string): void;
  windowAction(type: string): void;
  setPinned(pinned: boolean): Promise<boolean>;
  toggleDevTools(): Promise<boolean>;
  getDevToolsState(): Promise<boolean>;
  onDevToolsState(callback: (opened: boolean) => void): () => void;
  openPluginMenu(pluginInfo: unknown): Promise<boolean>;
  onAlwaysShowSearch(callback: (enabled: boolean) => void): () => void;
}

interface Window {
  detach: DetachApi;
  initDetach(pluginInfo: Record<string, any>): void;
  enterFullScreenTrigger(): void;
  leaveFullScreenTrigger(): void;
  maximizeTrigger(): void;
  unmaximizeTrigger(): void;
}
