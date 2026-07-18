exports.default = async function () {
  const fs = require('fs');
  const compressing = require('compressing');

  const src = './build/mac-arm64/Flick.app/Contents/Resources/app.asar';
  if (fs.existsSync(src)) {
    await compressing.gzip.compressFile(src, 'build/app.asar.gz');
  }
};
