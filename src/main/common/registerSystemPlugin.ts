/* eslint-disable */
import path from 'path';
import fs from 'fs';
import { resolveInstalledPluginRoot } from '@/main/common/pluginStorage';

declare const __static: string;

function bundledSuperPanel() {
  const manifestPath = path.join(__static, 'superx', 'package.json');
  try {
    if (!fs.existsSync(manifestPath)) return null;
    const plugin = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return plugin?.name === 'flick-system-super-panel' ? plugin : null;
  } catch (error) {
    console.error(
      '[flick] failed to read bundled super panel manifest:',
      error
    );
    return null;
  }
}

function systemPluginDiskRoot(plugin: { name: string }): string {
  if (plugin.name === 'flick-system-super-panel') {
    return path.join(__static, 'superx');
  }
  return resolveInstalledPluginRoot(plugin.name);
}

export default () => {
  // The Super Panel is application runtime, not an optional downloaded
  // package. Always register the bundled copy even when a clean installation
  // has not created its mutable plugin catalog yet.
  const catalogPlugins = global.LOCAL_PLUGINS.getLocalPlugins();
  const bundled = bundledSuperPanel();
  const totalPlugins = bundled
    ? [
        bundled,
        ...catalogPlugins.filter(
          (plugin) => plugin.name !== 'flick-system-super-panel'
        ),
      ]
    : catalogPlugins;
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
        const pluginModule = (require(plugin.indexPath) as any)();
        // @ts-ignore
        hooks.onReady.push(async (ctx) => {
          try {
            await pluginModule.onReady(ctx);
          } catch (e) {
            console.error(
              `[flick] system plugin onReady failed [${plugin.name}]:`,
              e
            );
          }
        });
      } catch (e) {
        console.error(
          `[flick] failed to load system plugin [${plugin.name}]:`,
          e
        );
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
