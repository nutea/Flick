import commonConst from './commonConst';
import plist from 'plist';

const nodeRequire =
  typeof window !== 'undefined' && (window as any).require
    ? (window as any).require
    : require;
const { clipboard } = nodeRequire('electron');
const fs = nodeRequire('fs');
const path = nodeRequire('path');
const ofs = nodeRequire('original-fs');

// 通过 require 加载，避免渲染进程的 Vite 处理出现解析问题；
// 该包在两个进程都可用，且其内部会按需懒加载平台原生模块。
const tryLoadNativeClipboard = (): { readFilePaths(): string[] } | null => {
  try {
    const mod = nodeRequire('flick-native');
    return mod?.clipboard ?? null;
  } catch {
    return null;
  }
};

export default function getCopyFiles(): Array<any> | null {
  let fileInfo;
  if (commonConst.macOS()) {
    if (!clipboard.has('NSFilenamesPboardType')) return null;
    const result = clipboard.read('NSFilenamesPboardType');
    if (!result) return null;
    try {
      fileInfo = plist.parse(result);
    } catch (e) {
      return null;
    }
  } else if (process.platform === 'win32') {
    const nativeClipboard = tryLoadNativeClipboard();
    if (nativeClipboard) {
      try {
        fileInfo = nativeClipboard.readFilePaths();
      } catch {
        // 原生模块不可用时返回空，下面的存在性校验会自然过滤掉。
      }
    }
  } else {
    if (!commonConst.linux()) return null;
    if (!clipboard.has('text/uri-list')) return null;
    const result = clipboard.read('text/uri-list').match(/^file:\/\/\/.*/gm);
    if (!result || !result.length) return null;
    fileInfo = result.map((e) =>
      decodeURIComponent(e).replace(/^file:\/\//, '')
    );
  }
  if (!Array.isArray(fileInfo)) return null;
  const target: any = fileInfo
    .map((p) => {
      if (!fs.existsSync(p)) return false;
      let info;
      try {
        info = ofs.lstatSync(p);
      } catch (e) {
        return false;
      }
      return {
        isFile: info.isFile(),
        isDirectory: info.isDirectory(),
        name: path.basename(p) || p,
        path: p,
      };
    })
    .filter(Boolean);
  return target.length ? target : null;
}
