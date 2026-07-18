import fs from 'fs';
import path from 'path';
import { app, shell } from 'electron';

const isZhRegex = /[\u4e00-\u9fa5]/;

async function fileDisplay(currentPath: string, target: any[]): Promise<void> {
  let files: string[];
  try {
    files = await fs.promises.readdir(currentPath);
  } catch {
    return;
  }

  for (const filename of files) {
    const filePath = path.join(currentPath, filename);
    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(filePath);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      await fileDisplay(filePath, target);
      continue;
    }
    if (!stat.isFile() || path.extname(filePath).toLowerCase() !== '.lnk') {
      continue;
    }

    let detail: Electron.ShortcutDetails;
    try {
      detail = shell.readShortcutLink(filePath);
    } catch {
      continue;
    }
    if (!detail.target || detail.target.toLowerCase().includes('unin'))
      continue;

    const appName = path.basename(filename, path.extname(filename));
    const targetName = path.basename(detail.target, '.exe');
    const keyWords = [appName];
    if (targetName) keyWords.push(targetName);
    if (!isZhRegex.test(appName)) {
      keyWords.push(
        appName
          .split(' ')
          .map((name) => name[0])
          .join('')
      );
    }
    let icon = '';
    try {
      icon = (
        await app.getFileIcon(detail.target, { size: 'normal' })
      ).toDataURL();
    } catch {
      // Entries without an icon remain searchable.
    }
    target.push({
      value: 'plugin',
      desc: detail.target,
      type: 'app',
      icon,
      pluginType: 'app',
      keyWords,
      name: appName,
      names: [...keyWords],
    });
  }
}

export default async function getWindowsApps(): Promise<any[]> {
  const result: any[] = [];
  const programData = process.env.ProgramData || 'C:\\ProgramData';
  await fileDisplay(
    path.join(programData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    result
  );
  await fileDisplay(
    path.join(
      app.getPath('appData'),
      'Microsoft',
      'Windows',
      'Start Menu',
      'Programs'
    ),
    result
  );
  return result;
}
