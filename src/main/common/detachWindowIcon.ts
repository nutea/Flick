import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { nativeImage } from 'electron';
import { PLUGIN_INSTALL_DIR as baseDir } from '@/common/constans/main';

const MAX_ICON_BYTES = 5 * 1024 * 1024;

/** 插件包根目录下的相对 logo 解析为绝对路径；防目录穿越 */
function resolvePluginLogoFilePath(
  logo: string,
  pluginRootDir: string
): string | null {
  if (!logo || typeof logo !== 'string' || !pluginRootDir) return null;
  if (logo.startsWith('data:') || /^https?:\/\//i.test(logo)) return null;
  try {
    if (logo.startsWith('file:')) {
      const p = fileURLToPath(logo);
      return fs.existsSync(p) ? p : null;
    }
    const base = path.resolve(pluginRootDir);
    const candidate = path.resolve(base, logo);
    const rel = path.relative(base, candidate);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
    return fs.existsSync(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

/**
 * 解析插件 logo，供分离窗 BrowserWindow `icon` 使用（任务栏/停靠区等）。
 * 支持 data:、https?、file:、包内相对路径、绝对路径。
 */
export async function resolveDetachWindowIcon(
  logo: string | undefined | null,
  pluginName: string | undefined
): Promise<Electron.NativeImage | string | undefined> {
  if (!logo || typeof logo !== 'string' || !logo.trim()) return undefined;
  const s = logo.trim();
  const pluginRoot = pluginName
    ? path.join(baseDir, 'node_modules', ...pluginName.split('/'))
    : undefined;

  try {
    if (s.startsWith('data:image')) {
      const img = nativeImage.createFromDataURL(s);
      return img.isEmpty() ? undefined : img;
    }
    if (/^https?:\/\//i.test(s)) {
      const res = await axios.get<ArrayBuffer>(s, {
        responseType: 'arraybuffer',
        timeout: 20000,
        maxRedirects: 5,
        maxContentLength: MAX_ICON_BYTES,
        maxBodyLength: MAX_ICON_BYTES,
        validateStatus: (status) => status >= 200 && status < 300,
        headers: {
          Accept: 'image/*,*/*;q=0.8',
          'User-Agent':
            'Mozilla/5.0 (compatible; Flick/1.0; +https://github.com/flickCenter/flick)',
        },
      });
      const buf = Buffer.from(res.data);
      if (!buf.length || buf.length > MAX_ICON_BYTES) return undefined;
      const img = nativeImage.createFromBuffer(buf);
      return img.isEmpty() ? undefined : img;
    }
    if (s.startsWith('file:')) {
      const p = fileURLToPath(s);
      if (fs.existsSync(p)) return p;
      return undefined;
    }
    if (pluginRoot) {
      const abs = resolvePluginLogoFilePath(s, pluginRoot);
      if (abs) return abs;
    }
    const normalized = path.normalize(s);
    if (path.isAbsolute(normalized) && fs.existsSync(normalized)) {
      return normalized;
    }
  } catch {
    return undefined;
  }
  return undefined;
}
