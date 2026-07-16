import path from 'path';
import fs from 'fs';

export default (): string => {
  let localDataFile: any = process.env.HOME;
  if (!localDataFile) {
    localDataFile = process.env.LOCALAPPDATA;
  }
  const flickPath = path.join(localDataFile, 'flick');
  if (!fs.existsSync(flickPath)) {
    fs.mkdirSync(flickPath);
  }
  return flickPath;
};
