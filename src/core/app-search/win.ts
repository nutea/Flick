const nodeRequire =
  typeof window !== 'undefined' && (window as any).require
    ? (window as any).require
    : require;
const fs = nodeRequire('fs');
const path = nodeRequire('path');
const os = nodeRequire('os');
const { shell } = nodeRequire('electron');
const flickApi =
  typeof window !== 'undefined' ? (window as any).flick ?? null : null;

const filePath = path.resolve(
  'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs'
);

const appData = path.join(os.homedir(), './AppData/Roaming');

const startMenu = path.join(
  appData,
  'Microsoft\\Windows\\Start Menu\\Programs'
);

const fileLists: any = [];
const isZhRegex = /[\u4e00-\u9fa5]/;

const getico = async (targetPath: string) => {
  try {
    return (await flickApi?.getFileIcon?.(targetPath)) || '';
  } catch (e) {
    console.log(e, targetPath);
    return '';
  }
};

async function fileDisplay(currentPath: string) {
  // 根据文件路径读取文件，返回文件列表
  let files: string[] = [];
  try {
    files = await fs.promises.readdir(currentPath);
  } catch (err) {
    console.warn(err);
    return;
  }

  for (const filename of files) {
    const filedir = path.join(currentPath, filename);
    let stats;
    try {
      stats = await fs.promises.stat(filedir);
    } catch {
      console.warn('获取文件 stats 失败');
      continue;
    }

    const isFile = stats.isFile(); // 是文件?
    const isDir = stats.isDirectory(); // 是文件夹

    if (isFile) {
      const appName = filename.split('.')[0];
      const keyWords = [appName];
      let appDetail: any = {};
      try {
        appDetail = shell.readShortcutLink(filedir);
      } catch {
        //
      }

      if (
        !appDetail.target ||
        appDetail.target.toLowerCase().indexOf('unin') >= 0
      ) {
        continue;
      }

      // C:/program/cmd.exe => cmd
      keyWords.push(path.basename(appDetail.target, '.exe'));

      if (isZhRegex.test(appName)) {
        // const [, pinyinArr] = translate(appName);
        // const zh_firstLatter = pinyinArr.map((py) => py[0]);
        // // 拼音
        // keyWords.push(pinyinArr.join(''));
        // 缩写
        // keyWords.push(zh_firstLatter.join(''));
      } else {
        const firstLatter = appName
          .split(' ')
          .map((name) => name[0])
          .join('');
        keyWords.push(firstLatter);
      }

      const appInfo = {
        value: 'plugin',
        desc: appDetail.target,
        type: 'app',
        icon: await getico(appDetail.target),
        pluginType: 'app',
        action: `start "dummyclient" "${appDetail.target}"`,
        keyWords: keyWords,
        name: appName,
        names: JSON.parse(JSON.stringify(keyWords)),
      };
      fileLists.push(appInfo);
    }

    if (isDir) {
      await fileDisplay(filedir); // 递归，如果是文件夹，就继续遍历该文件夹下面的文件
    }
  }
}

export default async () => {
  fileLists.length = 0;
  await fileDisplay(filePath);
  await fileDisplay(startMenu);
  return fileLists;
};
