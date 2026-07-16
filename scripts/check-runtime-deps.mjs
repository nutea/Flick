import fs from 'fs';
import path from 'path';
import { builtinModules } from 'module';

const rootDir = process.cwd();
const pkg = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')
);

const runtimeDepNames = new Set([
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.optionalDependencies || {}),
]);

const builtinNames = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
  'electron',
  'original-fs',
]);

const sourceRoots = ['src/main', 'src/preload'];
const sourceExts = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);

const skipPrefixes = ['./', '../', '/', '@/'];

function shouldSkipSpecifier(specifier) {
  return (
    !specifier ||
    skipPrefixes.some((prefix) => specifier.startsWith(prefix)) ||
    builtinNames.has(specifier)
  );
}

function getPackageName(specifier) {
  if (specifier.startsWith('@')) {
    const [scope, name] = specifier.split('/');
    return scope && name ? `${scope}/${name}` : specifier;
  }
  return specifier.split('/')[0];
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(fullPath);
      continue;
    }
    if (sourceExts.has(path.extname(entry.name))) {
      yield fullPath;
    }
  }
}

function collectSpecifiers(source) {
  const specifiers = new Set();
  const patterns = [
    /\bimport\s+[^'"]*?from\s+['"]([^'"]+)['"]/g,
    /\bimport\s*?\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*?\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bexport\s+[^'"]*?from\s+['"]([^'"]+)['"]/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      specifiers.add(match[1]);
    }
  }

  return specifiers;
}

const usedPackages = new Map();
for (const relativeRoot of sourceRoots) {
  const absoluteRoot = path.join(rootDir, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) continue;

  for (const filePath of walk(absoluteRoot)) {
    const source = fs.readFileSync(filePath, 'utf8');
    for (const specifier of collectSpecifiers(source)) {
      if (shouldSkipSpecifier(specifier)) continue;
      const packageName = getPackageName(specifier);
      if (shouldSkipSpecifier(packageName)) continue;
      if (!usedPackages.has(packageName)) {
        usedPackages.set(packageName, []);
      }
      usedPackages.get(packageName).push({
        filePath: path.relative(rootDir, filePath),
        specifier,
      });
    }
  }
}

const missingDeps = [...usedPackages.entries()]
  .filter(([packageName]) => !runtimeDepNames.has(packageName))
  .sort(([a], [b]) => a.localeCompare(b));

if (missingDeps.length > 0) {
  console.error(
    'Runtime dependency check failed. Add these packages to the root package.json dependencies or optionalDependencies:\n'
  );
  for (const [packageName, references] of missingDeps) {
    console.error(`- ${packageName}`);
    for (const ref of references.slice(0, 3)) {
      console.error(`  ${ref.filePath} -> ${ref.specifier}`);
    }
    if (references.length > 3) {
      console.error(`  ...and ${references.length - 3} more reference(s)`);
    }
  }
  process.exit(1);
}

console.log(
  `Runtime dependency check passed for ${usedPackages.size} package(s) in src/main and src/preload.`
);
