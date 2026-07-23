import fs from 'fs-extra';
import path from 'path';

function packagePath(nodeModulesRoot: string, packageName: string): string {
  return path.join(nodeModulesRoot, ...packageName.split('/'));
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

/** Resolve as Node does, retaining the concrete package directory/version. */
export async function resolveDependencyPackage(
  fromPackageDir: string,
  dependencyName: string,
  nodeModulesRoot: string
): Promise<string | null> {
  let current = path.resolve(fromPackageDir);
  const boundary = path.resolve(nodeModulesRoot);
  const searchBoundary = path.dirname(boundary);
  while (isInside(searchBoundary, current)) {
    const searchRoot =
      path.basename(current) === 'node_modules'
        ? current
        : path.join(current, 'node_modules');
    const candidate = packagePath(searchRoot, dependencyName);
    if (await fs.pathExists(path.join(candidate, 'package.json'))) {
      return candidate;
    }
    if (current === boundary || current === path.dirname(current)) break;
    current = path.dirname(current);
  }
  return null;
}

export type DependencyClosure = {
  packageDirs: string[];
  missing: string[];
};

/** Traverse actual package instances so nested versions retain their own graph. */
export async function collectResolvedDependencyClosure(
  nodeModulesRoot: string,
  entryName: string
): Promise<DependencyClosure> {
  const entry = packagePath(nodeModulesRoot, entryName);
  const queue = [entry];
  const seen = new Set<string>();
  const missing = new Set<string>();

  while (queue.length > 0) {
    const packageDir = path.resolve(queue.shift()!);
    if (seen.has(packageDir)) continue;
    const pkgJsonPath = path.join(packageDir, 'package.json');
    if (!(await fs.pathExists(pkgJsonPath))) {
      missing.add(path.relative(nodeModulesRoot, packageDir));
      continue;
    }
    seen.add(packageDir);
    let pkg: {
      name?: string;
      dependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    try {
      pkg = JSON.parse(await fs.readFile(pkgJsonPath, 'utf-8'));
    } catch {
      missing.add(path.relative(nodeModulesRoot, packageDir));
      continue;
    }

    const optional = new Set(Object.keys(pkg.optionalDependencies || {}));
    const dependencies = new Set([
      ...Object.keys(pkg.dependencies || {}),
      ...optional,
    ]);
    for (const dependency of dependencies) {
      const resolved = await resolveDependencyPackage(
        packageDir,
        dependency,
        nodeModulesRoot
      );
      if (resolved) queue.push(resolved);
      else if (!optional.has(dependency)) {
        missing.add(`${pkg.name || packageDir} -> ${dependency}`);
      }
    }
  }
  return { packageDirs: [...seen], missing: [...missing] };
}
