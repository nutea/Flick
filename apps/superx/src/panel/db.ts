import { getElectron } from './electron';

function sendSync<T>(type: string, data: unknown): T {
  const { ipcRenderer } = getElectron();
  const res = ipcRenderer.sendSync('msg-trigger', { type, data });
  if (res instanceof Error) throw res;
  return res as T;
}

/** 与原面板内嵌 db 封装一致（走 Flick 主进程） */
export const flickDb = {
  put: (data: unknown) => sendSync('dbPut', { data }),
  get: (id: string) => sendSync<{ data?: unknown }>('dbGet', { id }),
  remove: (doc: unknown) => sendSync('dbRemove', { doc }),
  bulkDocs: (docs: unknown[]) => sendSync('dbBulkDocs', { docs }),
  allDocs: (key: string) => sendSync('dbAllDocs', { key }),
};
