import { toRaw } from 'vue';

type LaunchPayloadArgs = {
  pluginDetail: Record<string, any>;
  feature: any;
  cmd: any;
};

function getCmdType(cmd: any): string {
  return cmd && typeof cmd === 'object' && cmd.type ? cmd.type : 'text';
}

export function buildPluginLaunchPayload({
  pluginDetail,
  feature,
  cmd,
}: LaunchPayloadArgs) {
  const code = feature?.code;
  if (!code) return null;

  return {
    ...toRaw(pluginDetail),
    feature,
    cmd,
    ext: {
      code,
      type: getCmdType(cmd),
      payload: null,
    },
  };
}

