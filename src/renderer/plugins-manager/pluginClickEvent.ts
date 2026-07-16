import { PLUGIN_INSTALL_DIR as baseDir } from '@/common/constans/renderer';
import { toRaw } from 'vue';
import commonConst from '@/common/utils/commonConst';

const path = window.require('path');

export default function pluginClickEvent({
  plugin,
  fe,
  cmd,
  ext,
  openPlugin,
  option,
}) {
  const pluginPath = path.resolve(baseDir, 'node_modules', plugin.name);
  const pluginDist = {
    ...toRaw(plugin),
    indexPath: `file://${path.join(pluginPath, './', plugin.main || '')}`,
    cmd: cmd.label || cmd,
    feature: fe,
    ext,
  };
  // 模板文件
  if (!plugin.main) {
    pluginDist.tplPath = commonConst.dev()
      ? 'http://localhost:8083/'
      : `file://${__static}/tpl/index.html`;
  }
  // 插件市场
  if (plugin.name === 'flick-system-feature') {
    pluginDist.indexPath = commonConst.dev()
      ? 'http://localhost:8081/'
      : `file://${__static}/feature/index.html`;
  }
  if (plugin.name === 'flick-system-super-panel') {
    pluginDist.indexPath = commonConst.dev()
      ? 'http://localhost:8085/main.html'
      : `file://${path.join(__static, 'superx', 'main.html')}`;
  }
  openPlugin(pluginDist, option);
}
