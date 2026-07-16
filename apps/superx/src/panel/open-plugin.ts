import type { CmdItem, FeatureItem } from './types';
import { getElectron } from './electron';

/**
 * 与原打包逻辑一致：部分入口传 `cmd` 为字符串（如「已安装插件」），
 * 匹配插件传 `cmd` 为 CmdItem。
 */
export function openPlugin(args: {
  plugin: Record<string, unknown>;
  feature: FeatureItem | { code: string; type?: string; payload?: unknown; cmds?: CmdItem[] };
  cmd?: string | CmdItem;
  data?: unknown;
}): void {
  const { ipcRenderer } = getElectron();
  const { plugin, feature, cmd, data } = args;

  const extType =
    typeof cmd === 'string'
      ? ('type' in feature && feature.type) || 'text'
      : (typeof cmd === 'object' && cmd && cmd.type) ||
        ('type' in feature && feature.type) ||
        'text';

  const extPayload =
    data !== undefined && data !== null
      ? data
      : 'payload' in feature && feature.payload !== undefined
        ? feature.payload
        : undefined;

  ipcRenderer.send('msg-trigger', {
    type: 'openPlugin',
    data: {
      ...plugin,
      cmd: feature.code,
      ext: {
        code: feature.code,
        type: extType,
        payload: extPayload,
      },
    },
  });
}
