import { toRaw } from 'vue';

export default function pluginClickEvent({
  plugin,
  fe,
  cmd,
  ext,
  openPlugin,
  option,
}) {
  const pluginDist = {
    ...toRaw(plugin),
    cmd: cmd.label || cmd,
    feature: fe,
    ext,
  };
  openPlugin(pluginDist, option);
}
