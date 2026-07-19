import { contextBridge, ipcRenderer } from 'electron';

type OverlayInitPayload = {
  token: string;
  display: { x: number; y: number; width: number; height: number };
};

contextBridge.exposeInMainWorld('screenCaptureOverlay', {
  onInit(callback: (payload: OverlayInitPayload) => void) {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: OverlayInitPayload
    ) => callback(payload);
    ipcRenderer.once('screen-capture:init', listener);
  },
  complete(payload: unknown) {
    ipcRenderer.send('screen-capture:complete', payload);
  },
  cancel(token: string) {
    ipcRenderer.send('screen-capture:cancel', { token });
  },
});
