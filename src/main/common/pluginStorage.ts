import fs from 'fs';
import path from 'path';

import { PLUGIN_INSTALL_DIR } from '@/common/constans/main';

const PACKAGE_NAME_RE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;

export const ISOLATED_PLUGIN_DIR = path.join(PLUGIN_INSTALL_DIR, 'plugins');

export function assertPluginPackageName(name: string): void {
  if (!PACKAGE_NAME_RE.test(name)) {
    throw new Error(`Invalid npm plugin package name: ${name}`);
  }
}
/** A reversible, Windows-safe directory name, including scoped packages. */
export function pluginWorkspaceName(name: string): string {
  assertPluginPackageName(name);
  return encodeURIComponent(name);
}

export function pluginWorkspaceDir(name: string): string {
  return path.join(ISOLATED_PLUGIN_DIR, pluginWorkspaceName(name));
}

export function isolatedPluginRoot(name: string): string {
  return path.join(
    pluginWorkspaceDir(name),
    'node_modules',
    ...name.split('/')
  );
}

export function legacyPluginRoot(name: string): string {
  assertPluginPackageName(name);
  return path.join(PLUGIN_INSTALL_DIR, 'node_modules', ...name.split('/'));
}

/** Remove only the legacy package entry; shared transitive packages may serve other legacy plugins. */
export function removeLegacyPluginPackage(name: string): void {
  assertPluginPackageName(name);
  const packageJson = path.join(PLUGIN_INSTALL_DIR, 'package.json');
  if (fs.existsSync(packageJson)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(packageJson, 'utf8')) as {
        dependencies?: Record<string, string>;
        optionalDependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      let changed = false;
      for (const key of [
        'dependencies',
        'optionalDependencies',
        'devDependencies',
      ] as const) {
        if (manifest[key] && Object.hasOwn(manifest[key], name)) {
          delete manifest[key][name];
          changed = true;
        }
      }
      if (changed) {
        fs.writeFileSync(packageJson, JSON.stringify(manifest, null, 2));
      }
    } catch {
      // A damaged legacy manifest must not prevent the isolated plugin from working.
    }
  }
  try {
    fs.rmSync(legacyPluginRoot(name), { recursive: true, force: true });
  } catch {
    // Windows can keep native modules locked until the old plugin process exits.
  }
}

export function isIsolatedPluginInstalled(name: string): boolean {
  return fs.existsSync(path.join(isolatedPluginRoot(name), 'package.json'));
}

/** New isolated installs win; existing flat installs remain readable. */
export function resolveInstalledPluginRoot(name: string): string {
  const isolated = isolatedPluginRoot(name);
  return fs.existsSync(path.join(isolated, 'package.json'))
    ? isolated
    : legacyPluginRoot(name);
}

export function ensurePluginWorkspace(name: string): string {
  const workspace = pluginWorkspaceDir(name);
  fs.mkdirSync(workspace, { recursive: true });
  const packageJson = path.join(workspace, 'package.json');
  if (!fs.existsSync(packageJson)) {
    fs.writeFileSync(
      packageJson,
      JSON.stringify(
        {
          private: true,
          description: `Isolated Flick plugin workspace for ${name}`,
          dependencies: {},
        },
        null,
        2
      )
    );
  }
  return workspace;
}
