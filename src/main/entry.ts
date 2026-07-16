import path from 'path';
import { app } from 'electron';
import { installProcessErrorHandlers, writeStartupLog } from './common/startupDiagnostics';

function swallowBrokenPipe(stream?: NodeJS.WriteStream): void {
  stream?.on?.('error', (err: NodeJS.ErrnoException) => {
    if (err?.code === 'EPIPE') {
      return;
    }
    throw err;
  });
}

swallowBrokenPipe(process.stdout);
swallowBrokenPipe(process.stderr);
installProcessErrorHandlers();

const staticDir = app.isPackaged
  ? path.join(app.getAppPath(), 'public')
  : path.join(process.cwd(), 'public');

globalThis.__static = staticDir;
writeStartupLog('main entry initialized', { isPackaged: app.isPackaged, staticDir });

void import('./index');

