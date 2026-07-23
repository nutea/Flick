import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import * as compressing from 'compressing';
import semver from 'semver';
import { app } from 'electron';
import { PLUGIN_INSTALL_DIR as baseDir } from '@/common/constans/main';
import {
  isolatedPluginRoot,
  isIsolatedPluginInstalled,
  pluginWorkspaceDir,
  removeLegacyPluginPackage,
  resolveInstalledPluginRoot,
} from '@/main/common/pluginStorage';
import { collectResolvedDependencyClosure } from './pluginDependencies';

const MANIFEST = 'flick-plugins-bundle.json';

type LocalPluginRecord = Record<string, unknown> & { name: string };

function configPath() {
  return path.join(baseDir, 'flick-local-plugin.json');
}

function readLocalPlugins(): LocalPluginRecord[] {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf-8'));
  } catch {
    return [];
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** 用于文件名：包名中的非法字符与 scope 处理 */
export function sanitizePluginNameForFile(name: string): string {
  return name
    .replace(/^@/, '')
    .replace(/\//g, '-')
    .replace(/[<>:"|?*\\]/g, '_');
}

function nmPackagePath(nmRoot: string, packageName: string): string {
  return path.join(nmRoot, ...packageName.split('/'));
}

function pluginRootDir(pluginName: string): string {
  return resolveInstalledPluginRoot(pluginName);
}

function isHttpUrl(v: unknown): v is string {
  return typeof v === 'string' && /^https?:\/\//i.test(v.trim());
}

function isFileUrl(v: unknown): v is string {
  return typeof v === 'string' && /^file:\/\//i.test(v.trim());
}

function normalizeSlashes(v: string): string {
  return v.replace(/\\/g, '/');
}

function fileUrlToPathSafe(v: string): string | null {
  try {
    return decodeURIComponent(v.replace(/^file:\/\//i, ''));
  } catch {
    return null;
  }
}

function toExportRelativeLogo(
  pluginName: string,
  logo: unknown
): string | undefined {
  if (typeof logo !== 'string' || !logo.trim()) return undefined;
  const s = logo.trim();
  if (isHttpUrl(s) || /^data:/i.test(s)) return s;
  const root = path.resolve(pluginRootDir(pluginName));
  let candidate: string = s;
  if (isFileUrl(s)) {
    const p = fileUrlToPathSafe(s);
    if (!p) return s;
    candidate = p;
  }
  const abs = path.isAbsolute(candidate)
    ? path.resolve(candidate)
    : path.resolve(path.join(root, candidate));
  const rel = path.relative(root, abs);
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
    return normalizeSlashes(rel);
  }
  return s;
}

function toImportAbsoluteLogo(
  pluginName: string,
  logo: unknown
): string | undefined {
  if (typeof logo !== 'string' || !logo.trim()) return undefined;
  const s = logo.trim();
  if (isHttpUrl(s) || /^data:/i.test(s) || path.isAbsolute(s) || isFileUrl(s)) {
    return s;
  }
  const root = path.resolve(pluginRootDir(pluginName));
  const abs = path.resolve(path.join(root, s));
  const rel = path.relative(root, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return s;
  }
  return abs;
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  );
}

function readVersionFromNodeModules(pluginName: string): string | undefined {
  try {
    const p = path.join(resolveInstalledPluginRoot(pluginName), 'package.json');
    const j = JSON.parse(fs.readFileSync(p, 'utf-8')) as { version?: string };
    return j.version;
  } catch {
    return undefined;
  }
}

/**
 * 保存对话框默认文件名：插件名-版本号.zip
 */
export function getExportDefaultFilename(pluginName: string): {
  ok: boolean;
  filename?: string;
  error?: string;
} {
  if (!pluginName || typeof pluginName !== 'string') {
    return { ok: false, error: 'NO_PLUGIN_NAME' };
  }
  const all = readLocalPlugins();
  const plugin = all.find((p) => p.name === pluginName);
  if (!plugin) {
    return { ok: false, error: 'PLUGIN_NOT_FOUND' };
  }
  if (
    plugin.name === 'flick-system-feature' ||
    plugin.name === 'flick-system-super-panel'
  ) {
    return { ok: false, error: 'NO_PLUGINS' };
  }
  const ver =
    (plugin.version as string) ||
    readVersionFromNodeModules(pluginName) ||
    '0.0.0';
  const stem = `${sanitizePluginNameForFile(pluginName)}-${ver}`;
  return { ok: true, filename: `${stem}.zip` };
}

/**
 * 导入版本是否严格大于已安装版本；从未安装（无记录且无目录）时允许安装。
 */
function shouldOverwriteOrInstall(
  pluginName: string,
  importedVersion: string,
  existing: LocalPluginRecord | undefined,
  existingFolderExists: boolean
): boolean {
  if (!existing && !existingFolderExists) {
    return true;
  }
  const installed =
    (existing?.version as string) ||
    (existingFolderExists
      ? readVersionFromNodeModules(pluginName)
      : undefined) ||
    '0.0.0';
  const i = semver.coerce(importedVersion);
  const e = semver.coerce(installed);
  if (i && e) {
    return semver.gt(i, e);
  }
  if (i && !e) {
    return true;
  }
  if (!i && e) {
    return false;
  }
  return importedVersion > installed;
}

export async function exportPluginBundle(
  destZip: string,
  pluginName: string
): Promise<{
  ok: boolean;
  error?: string;
  count?: number;
  /** 含插件本体在内的 node_modules 包数量 */
  bundledPackages?: number;
}> {
  if (!pluginName) {
    return { ok: false, error: 'NO_PLUGIN_NAME' };
  }
  const all = readLocalPlugins();
  const plugin = all.find((p) => p.name === pluginName);
  if (!plugin) {
    return { ok: false, error: 'PLUGIN_NOT_FOUND' };
  }
  if (
    plugin.name === 'flick-system-feature' ||
    plugin.name === 'flick-system-super-panel'
  ) {
    return { ok: false, error: 'NO_PLUGINS' };
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flick-export-'));
  try {
    const exportedWorkspace = path.join(tmpDir, 'workspace');
    const nm = path.join(exportedWorkspace, 'node_modules');
    await fs.mkdirp(nm);

    const srcRoot = resolveInstalledPluginRoot(plugin.name);
    if (!(await fs.pathExists(srcRoot))) {
      return { ok: false, error: 'NO_PLUGIN_FILES' };
    }

    let bundledPackagePaths: string[] = [];
    if (isIsolatedPluginInstalled(plugin.name)) {
      await fs.copy(pluginWorkspaceDir(plugin.name), exportedWorkspace, {
        overwrite: true,
        dereference: true,
      });
      const closure = await collectResolvedDependencyClosure(nm, plugin.name);
      if (closure.missing.length) {
        return { ok: false, error: 'INCOMPLETE_DEPENDENCIES' };
      }
      bundledPackagePaths = closure.packageDirs.map((packageDir) =>
        normalizeSlashes(path.relative(nm, packageDir))
      );
    } else {
      const legacyNm = path.join(baseDir, 'node_modules');
      const closure = await collectResolvedDependencyClosure(
        legacyNm,
        plugin.name
      );
      if (!closure.packageDirs.length) {
        return { ok: false, error: 'NO_PLUGIN_FILES' };
      }
      if (closure.missing.length) {
        return { ok: false, error: 'INCOMPLETE_DEPENDENCIES' };
      }
      for (const packageDir of closure.packageDirs) {
        const relative = path.relative(legacyNm, packageDir);
        const to = path.join(nm, relative);
        await fs.mkdirp(path.dirname(to));
        await fs.copy(packageDir, to, { overwrite: true, dereference: true });
      }
      bundledPackagePaths = closure.packageDirs.map((packageDir) =>
        normalizeSlashes(path.relative(legacyNm, packageDir))
      );
      await fs.writeFile(
        path.join(exportedWorkspace, 'package.json'),
        JSON.stringify(
          {
            private: true,
            dependencies: {
              [plugin.name]: plugin.version || '*',
            },
          },
          null,
          2
        ),
        'utf-8'
      );
    }

    let flickVersion = '';
    try {
      flickVersion = app.getVersion();
    } catch {
      flickVersion = '';
    }

    const pluginForManifest: LocalPluginRecord = {
      ...plugin,
      logo: toExportRelativeLogo(plugin.name, plugin.logo) ?? plugin.logo,
    };

    const manifest = {
      format: 'flick-plugins-bundle',
      version: 2,
      exportedAt: new Date().toISOString(),
      flickVersion,
      plugins: [pluginForManifest],
      workspace: 'workspace',
      bundledPackagePaths,
    };

    await fs.writeFile(
      path.join(tmpDir, MANIFEST),
      JSON.stringify(manifest, null, 2),
      'utf-8'
    );

    // 必须带 ignoreBase，否则 zip 内路径为「临时目录名/…」，解压后清单不在根目录，导入会判 INVALID_BUNDLE
    await compressing.zip.compressDir(tmpDir, destZip, { ignoreBase: true });
    return {
      ok: true,
      count: 1,
      bundledPackages: bundledPackagePaths.length,
    };
  } catch (e: unknown) {
    return { ok: false, error: errMsg(e) };
  } finally {
    await fs.remove(tmpDir).catch(() => undefined);
  }
}

function mergePluginMetadata(
  saved: LocalPluginRecord,
  pkgJson: Record<string, unknown>
): LocalPluginRecord {
  const name = (pkgJson.name as string) || saved.name;
  const mergedLogo = saved.logo ?? pkgJson.logo;
  return {
    ...saved,
    ...pkgJson,
    name,
    version: (pkgJson.version as string) || (saved.version as string),
    description: pkgJson.description ?? saved.description,
    author: pkgJson.author ?? saved.author,
    main: pkgJson.main ?? saved.main,
    pluginName: (pkgJson.pluginName as string) || (saved.pluginName as string),
    logo: toImportAbsoluteLogo(name, mergedLogo) ?? mergedLogo,
    features: saved.features ?? pkgJson.features,
    pluginType:
      (saved.pluginType as string) || (pkgJson.pluginType as string) || 'ui',
    isDev: false,
  };
}

export type ImportPluginBundleResult = {
  ok: boolean;
  imported?: string[];
  skipped?: string[];
  skippedNotNewer?: Array<{
    name: string;
    importedVersion: string;
    installedVersion: string;
  }>;
  error?: string;
};

/** 解压后清单可能在根目录，或在 compressing 旧行为产生的单级子目录下 */
async function resolveBundleRoot(extractDir: string): Promise<string | null> {
  const atRoot = path.join(extractDir, MANIFEST);
  if (await fs.pathExists(atRoot)) {
    return extractDir;
  }
  let names: string[];
  try {
    names = await fs.readdir(extractDir);
  } catch {
    return null;
  }
  for (const name of names) {
    const sub = path.join(extractDir, name);
    if (!(await fs.pathExists(sub)) || !(await fs.stat(sub)).isDirectory()) {
      continue;
    }
    const nested = path.join(sub, MANIFEST);
    if (await fs.pathExists(nested)) {
      return sub;
    }
  }
  return null;
}

export async function importPluginBundle(
  zipPath: string
): Promise<ImportPluginBundleResult> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flick-import-'));
  try {
    await compressing.zip.uncompress(zipPath, tmpDir);

    const bundleRoot = await resolveBundleRoot(tmpDir);
    if (!bundleRoot) {
      return { ok: false, error: 'INVALID_BUNDLE' };
    }

    const manifestPath = path.join(bundleRoot, MANIFEST);

    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8')) as {
      format?: string;
      version?: number;
      workspace?: string;
      plugins?: LocalPluginRecord[];
    };

    const manifestPlugins = manifest.plugins;
    if (
      manifest.format !== 'flick-plugins-bundle' ||
      !Array.isArray(manifestPlugins)
    ) {
      return { ok: false, error: 'INVALID_BUNDLE' };
    }

    const workspaceRelative =
      manifest.version === 2 && typeof manifest.workspace === 'string'
        ? manifest.workspace
        : '.';
    const sourceWorkspace = path.resolve(bundleRoot, workspaceRelative);
    if (!isInside(bundleRoot, sourceWorkspace)) {
      return { ok: false, error: 'INVALID_BUNDLE' };
    }
    const nmSrc = path.join(sourceWorkspace, 'node_modules');
    if (!(await fs.pathExists(nmSrc))) {
      return { ok: false, error: 'INVALID_BUNDLE' };
    }

    const list = readLocalPlugins();
    const imported: string[] = [];
    const skipped: string[] = [];
    const skippedNotNewer: ImportPluginBundleResult['skippedNotNewer'] = [];

    for (const plugin of manifestPlugins) {
      if (
        !plugin?.name ||
        plugin.name === 'flick-system-feature' ||
        plugin.name === 'flick-system-super-panel'
      ) {
        continue;
      }
      const src = nmPackagePath(nmSrc, plugin.name);
      if (!(await fs.pathExists(src))) {
        skipped.push(plugin.name);
        continue;
      }

      const pkgJsonPath = path.join(src, 'package.json');
      if (!(await fs.pathExists(pkgJsonPath))) {
        skipped.push(plugin.name);
        continue;
      }
      const pkgJson = JSON.parse(
        await fs.readFile(pkgJsonPath, 'utf-8')
      ) as Record<string, unknown>;
      const closure = await collectResolvedDependencyClosure(
        nmSrc,
        plugin.name
      );
      if (closure.missing.length) {
        return {
          ok: false,
          error: 'INCOMPLETE_DEPENDENCIES',
          skipped: [plugin.name],
        };
      }
      const importedVersion = (pkgJson.version as string) || '0.0.0';

      const existing = list.find((p) => p.name === plugin.name);
      const existingFolderExists = await fs.pathExists(
        resolveInstalledPluginRoot(plugin.name)
      );

      if (
        !shouldOverwriteOrInstall(
          plugin.name,
          importedVersion,
          existing,
          existingFolderExists
        )
      ) {
        const installedVersion =
          (existing?.version as string) ||
          (existingFolderExists
            ? readVersionFromNodeModules(plugin.name)
            : undefined) ||
          '0.0.0';
        skippedNotNewer.push({
          name: plugin.name,
          importedVersion,
          installedVersion,
        });
        continue;
      }

      imported.push(plugin.name);
    }

    if (!imported.length) {
      if (skippedNotNewer.length) {
        return { ok: true, imported: [], skipped, skippedNotNewer };
      }
      return { ok: false, error: 'NOTHING_IMPORTED', skipped };
    }

    const system = list.filter((p) =>
      ['flick-system-feature', 'flick-system-super-panel'].includes(p.name)
    );
    const rest = list.filter(
      (p) =>
        p.name !== 'flick-system-feature' &&
        p.name !== 'flick-system-super-panel'
    );

    for (const name of imported) {
      const destination = pluginWorkspaceDir(name);
      await fs.mkdirp(path.dirname(destination));
      const staging = fs.mkdtempSync(
        path.join(path.dirname(destination), `.${path.basename(destination)}-`)
      );
      try {
        await fs.copy(nmSrc, path.join(staging, 'node_modules'), {
          overwrite: true,
          dereference: true,
        });
        const sourceLock = path.join(sourceWorkspace, 'package-lock.json');
        if (await fs.pathExists(sourceLock)) {
          await fs.copy(sourceLock, path.join(staging, 'package-lock.json'));
        }
        const importedPackageJson = path.join(
          staging,
          'node_modules',
          ...name.split('/'),
          'package.json'
        );
        const installedManifest = JSON.parse(
          await fs.readFile(importedPackageJson, 'utf-8')
        ) as { version?: string };
        await fs.writeFile(
          path.join(staging, 'package.json'),
          JSON.stringify(
            {
              private: true,
              description: `Isolated Flick plugin workspace for ${name}`,
              dependencies: {
                [name]: installedManifest.version || '*',
              },
            },
            null,
            2
          ),
          'utf-8'
        );
        await fs.remove(destination);
        await fs.move(staging, destination, { overwrite: true });
        removeLegacyPluginPackage(name);
      } finally {
        await fs.remove(staging).catch(() => undefined);
      }

      const pkgJsonPath = path.join(isolatedPluginRoot(name), 'package.json');
      if (!(await fs.pathExists(pkgJsonPath))) {
        continue;
      }
      const pkgJson = JSON.parse(
        await fs.readFile(pkgJsonPath, 'utf-8')
      ) as Record<string, unknown>;
      const manifestPluginsArr = manifestPlugins || [];
      const saved =
        manifestPluginsArr.find((p) => p.name === name) ||
        ({ name } as LocalPluginRecord);
      const merged = mergePluginMetadata(saved, pkgJson);
      const idx = rest.findIndex((p) => p.name === merged.name);
      if (idx >= 0) {
        rest[idx] = merged;
      } else {
        rest.unshift(merged);
      }
    }

    const nextList = [...system, ...rest];
    await fs.writeFile(
      configPath(),
      JSON.stringify(nextList, null, 2),
      'utf-8'
    );

    return { ok: true, imported, skipped, skippedNotNewer };
  } catch (e: unknown) {
    return { ok: false, error: errMsg(e) };
  } finally {
    await fs.remove(tmpDir).catch(() => undefined);
  }
}
