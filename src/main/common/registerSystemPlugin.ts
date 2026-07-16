/* eslint-disable */
import path from 'path';
import fs from 'fs';
import { PLUGIN_INSTALL_DIR } from '@/common/constans/main';

declare const __static: string;

function systemPluginDiskRoot(plugin: { name: string }): string {
  if (plugin.name === 'flick-system-super-panel') {
    return path.join(__static, 'superx');
  }
  return path.resolve(PLUGIN_INSTALL_DIR, 'node_modules', plugin.name);
}

export default () => {
  // 读取所有插件
  const totalPlugins = global.LOCAL_PLUGINS.getLocalPlugins();
  let systemPlugins = totalPlugins.filter(
    (plugin) => plugin.pluginType === 'system'
  );
  systemPlugins = systemPlugins
    .map((plugin) => {
      try {
        const pluginPath = systemPluginDiskRoot(plugin);
        return {
          ...plugin,
          indexPath: path.join(pluginPath, './', plugin.entry),
        };
      } catch (e) {
        return false;
      }
    })
    .filter(Boolean);

  const hooks = {
    onReady: [],
  };

  systemPlugins.forEach((plugin) => {
    if (fs.existsSync(plugin.indexPath)) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pluginModule = (require(plugin.indexPath) as any)();
        // @ts-ignore
        hooks.onReady.push(async (ctx) => {
          try {
            await pluginModule.onReady(ctx);
          } catch (e) {
            console.error(`[flick] system plugin onReady failed [${plugin.name}]:`, e);
          }
        });
      } catch (e) {
        console.error(`[flick] failed to load system plugin [${plugin.name}]:`, e);
      }
    }
  });

  const triggerReadyHooks = (ctx) => {
    // @ts-ignore
    hooks.onReady.forEach((hook: any) => {
      try {
        hook && hook(ctx);
      } catch (e) {
        console.log(e);
      }
    });
  };

  return {
    triggerReadyHooks,
  };
};
