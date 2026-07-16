interface SuperPanelTranslationRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

interface SuperPanelTranslationResponse {
  ok: boolean;
  status: number;
  text: string;
}

interface SuperPanelBridge {
  platform: string;
  getDocument(id: string): unknown;
  getDesktopPath(): string;
  copyText(text: string): unknown;
  openPlugin(payload: unknown): void;
  showMainWindow(): void;
  hide(): void;
  contentApplied(): void;
  setHeight(height: number): void;
  setPinned(pinned: boolean): void;
  getPinState(): Promise<boolean>;
  createFile(directory: string): Promise<boolean>;
  openTerminal(directory: string): Promise<boolean>;
  getCurrentFolder(): Promise<{ stdout?: string }>;
  requestTranslation(
    request: SuperPanelTranslationRequest
  ): Promise<SuperPanelTranslationResponse>;
  onTrigger(callback: (payload: unknown) => void): () => void;
  onPinState(callback: (pinned: boolean) => void): () => void;
  onDismissed(callback: () => void): () => void;
}

interface Window {
  superPanel: SuperPanelBridge;
}
