import { clipboard } from 'electron';
import path from 'path';
import { clipboard as nativeClipboard } from 'flick-native';

// 仅在 Windows 平台辅助操作剪贴板多文件格式。

const DROPFILES_HEADER_SIZE = 20;

/**
 * 把一组文件路径变成 Windows 规定的文本格式。
 * 要求：每个路径之间用单个空字符分隔，最后再额外放两个空字符，表示列表结束。
 * Windows 资源管理器会按这个格式解析我们复制到剪贴板的文件。
 */
const buildWindowsFileListPayload = (files: string[]): Buffer =>
  Buffer.from(`${files.join('\0')}\0\0`, 'utf16le');

/**
 * 构造 CF_HDROP 专用的二进制数据。
 * 这是 Windows 复制文件时的底层格式，前 20 字节是固定的结构头，
 * 后面紧跟着具体的文件路径（由 buildWindowsFileListPayload 生成）。
 * 只要把这个内容写入剪贴板，任何支持粘贴文件的程序都能理解。
 */
const buildWindowsFileDropBuffer = (files: string[]): Buffer => {
  const payload = buildWindowsFileListPayload(files);
  const header = Buffer.alloc(DROPFILES_HEADER_SIZE);
  header.writeUInt32LE(DROPFILES_HEADER_SIZE, 0);
  header.writeInt32LE(0, 4);
  header.writeInt32LE(0, 8);
  header.writeUInt32LE(0, 12);
  header.writeUInt32LE(1, 16);

  const result = Buffer.alloc(header.length + payload.length);
  for (let i = 0; i < header.length; i += 1) {
    result[i] = header[i];
  }
  for (let i = 0; i < payload.length; i += 1) {
    result[header.length + i] = payload[i];
  }
  return result;
};

/**
 * 复制/移动/创建快捷方式 等不同操作在 Windows 中对应不同的“意图”值。
 * Preferred DropEffect 告诉系统：当前剪贴板数据应该以何种方式处理。
 * 我们默认写入“copy”，相当于普通的复制粘贴。
 */
const buildDropEffectBuffer = (effect: 'copy' | 'move' | 'link' = 'copy') => {
  const effectMap = {
    copy: 1,
    move: 2,
    link: 4,
  } as const;
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(effectMap[effect], 0);
  return buffer;
};

/**
 * 兜底通道：直接通过 Electron 的 `clipboard.writeBuffer` 写入多种格式。
 * 仅当原生通道（`flick-native`）不可用或调用失败时才会用到，
 * 例如未编译 N-API 插件的开发环境。
 */
const writeWindowsBuffers = (files: string[]): boolean => {
  try {
    clipboard.writeBuffer('CF_HDROP', buildWindowsFileDropBuffer(files));
    clipboard.writeBuffer('FileNameW', buildWindowsFileListPayload(files));
    clipboard.writeBuffer('Preferred DropEffect', buildDropEffectBuffer('copy'));
    return clipboard.readBuffer('CF_HDROP').length > 0;
  } catch {
    return false;
  }
};

/**
 * 对外暴露的唯一入口。
 * 1. 先把所有路径换成 Windows 可识别的标准形式（path.normalize）。
 * 2. 走 `flick-native` 的原生 Win32 通道写入。
 * 3. 若原生通道不可用（例如未编译 N-API 附加件），再退回 Electron buffer 写入流程。
 */
export const copyFilesToWindowsClipboard = (files: string[]): boolean => {
  const normalizedFiles = files
    .map((filePath) => path.normalize(filePath))
    .filter(Boolean);
  if (!normalizedFiles.length) return false;
  if (nativeClipboard.writeFilePaths(normalizedFiles)) {
    return true;
  }
  return writeWindowsBuffers(normalizedFiles);
};
