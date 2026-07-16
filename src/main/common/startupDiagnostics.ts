import fs from 'fs';
import path from 'path';
import { app, dialog } from 'electron';

let installed = false;

function diagnosticsEnabled(): boolean {
  return !app.isPackaged || !!process.env.ELECTRON_RENDERER_URL;
}

function logFilePath(): string | null {
  try {
    return path.join(app.getPath('userData'), 'startup.log');
  } catch {
    return null;
  }
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}\n${error.stack || ''}`.trim();
  }
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

export function writeStartupLog(label: string, error?: unknown): void {
  if (!diagnosticsEnabled()) return;
  const target = logFilePath();
  if (!target) return;
  const lines = [
    `[${new Date().toISOString()}] ${label}`,
    error == null ? '' : stringifyError(error),
    '',
  ];
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.appendFileSync(target, lines.join('\n'), 'utf8');
  } catch {
    /* ignore logging failures */
  }
}

export function showStartupError(title: string, message: string, error?: unknown): void {
  writeStartupLog(`${title}: ${message}`, error);
  try {
    const detail = error == null ? message : `${message}\n\n${stringifyError(error)}`;
    dialog.showErrorBox(title, detail);
  } catch {
    /* ignore dialog failures */
  }
}

export function installProcessErrorHandlers(): void {
  if (!diagnosticsEnabled()) return;
  if (installed) return;
  installed = true;

  process.on('uncaughtException', (error) => {
    showStartupError('Flick Startup Error', 'Main process crashed during startup.', error);
  });

  process.on('unhandledRejection', (reason) => {
    showStartupError('Flick Startup Error', 'Unhandled promise rejection during startup.', reason);
  });
}

