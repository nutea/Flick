import net from 'net';
import { app } from 'electron';

/**
 * 未打包时一律探测子项目端口（失败则仍走 file://）。若再依赖 NODE_ENV / ELECTRON_RENDERER_URL，
 * 在部分主进程环境下会为 false，导致永远不替换 URL。
 */
function shouldProbeSubAppDevServers(): boolean {
  return !app.isPackaged;
}

/**
 * 与 loadURL 一致使用 localhost；避免仅监听 ::1 的 Vite 在 127.0.0.1 上探测失败却仍用 127.0.0.1 拼 URL 的不一致。
 */
export const DEV_APP_HOST = 'localhost';

export const DEV_APP_PORTS = {
  feature: 8081,
  detach: 8082,
  tpl: 8083,
  guide: 8084,
  superxWeb: 8085,
} as const;

const PROBE_MS = 450;

let servingByPort: Map<number, boolean> | null = null;

/** Vite 在 Windows 上可能只绑定 localhost/::1，仅连 127.0.0.1 会误判为未启动 */
const PROBE_HOSTS = ['127.0.0.1', 'localhost', '::1'] as const;

function probePortOnHost(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, PROBE_MS);
    const done = (ok: boolean) => {
      clearTimeout(timer);
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      resolve(ok);
    };
    socket.on('connect', () => done(true));
    socket.on('error', () => done(false));
  });
}

async function probePort(port: number): Promise<boolean> {
  for (const host of PROBE_HOSTS) {
    if (await probePortOnHost(port, host)) return true;
  }
  return false;
}

/**
 * development 下探测各子项目 Vite 端口；供主进程将 file:// 换为 http。
 * 各壳窗读对应 FLICK_*_DEV_URL；与 apps/superx panel-window 打开 DevTools 条件对齐。
 */
export async function warmupDevSubAppServers(): Promise<void> {
  if (!shouldProbeSubAppDevServers()) {
    servingByPort = null;
    delete process.env.FLICK_SUPERX_PANEL_DEV_URL;
    return;
  }
  const ports = Object.values(DEV_APP_PORTS);
  const results = await Promise.all(ports.map((p) => probePort(p)));
  servingByPort = new Map();
  ports.forEach((p, i) => servingByPort!.set(p, results[i]));

  // 仅 superx 的 node 包 panel-window 需读 process.env，无法用主进程模块；detach/guide 走 shouldOpenSubAppShellDevTools + devSubAppHttpUrl 即可
  if (servingByPort.get(DEV_APP_PORTS.superxWeb)) {
    process.env.FLICK_SUPERX_PANEL_DEV_URL = `http://${DEV_APP_HOST}:${DEV_APP_PORTS.superxWeb}/main.html`;
  } else {
    delete process.env.FLICK_SUPERX_PANEL_DEV_URL;
  }
}

/**
 * guide/detach 等主进程壳页：electron-vite 会话或端口探测到任一子项目 Vite 时打开 DevTools（不必再为各子项目单独设 FLICK_*_DEV_URL）。
 */
export function shouldOpenSubAppShellDevTools(): boolean {
  if (
    process.env.NODE_ENV === 'development' ||
    Boolean(process.env.VITE_DEV_SERVER_URL) ||
    Boolean(process.env.ELECTRON_RENDERER_URL)
  ) {
    return true;
  }
  if (Boolean(process.env.FLICK_SUPERX_PANEL_DEV_URL)) return true;
  return servingByPort != null && [...servingByPort.values()].some(Boolean);
}

export function isDevAppPortServing(port: number): boolean {
  return servingByPort?.get(port) === true;
}

/** path 为 '' 或 '/' 时得到 `http://host:port/` */
export function devSubAppHttpUrl(port: number, path: string): string | null {
  if (!isDevAppPortServing(port)) return null;
  const normalized =
    !path || path === '/' ? '/' : path.startsWith('/') ? path : `/${path}`;
  return `http://${DEV_APP_HOST}:${port}${normalized}`;
}
