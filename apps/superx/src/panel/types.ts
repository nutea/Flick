/** 与 flick 插件 package.json 中 features / cmds 结构一致（节选） */
export interface CmdItem {
  type: string;
  label?: string;
  match?: string;
}

export interface FeatureItem {
  code: string;
  cmds: CmdItem[];
  type?: string;
  payload?: unknown;
}

export interface OptionPlugin {
  name: string;
  logo: string;
  logoUrl?: string;
  features: FeatureItem[];
}

export interface TriggerSuperPanelPayload {
  requestId: number;
  text?: string;
  fileUrl?: string | null;
  optionPlugin?: OptionPlugin[];
  selectedFileIsDirectory?: boolean;
  selectedFileDataUrl?: string;
}

export type BuiltinPluginIcon = 'terminal' | 'create-file' | 'copy';

export interface MatchPluginItem {
  type: 'default' | 'ext';
  name: string;
  logo: string;
  icon?: BuiltinPluginIcon;
  click: (ev?: Event) => void;
}

export interface UserPluginItem {
  name?: string;
  pluginName: string;
  logo: string;
  cmd: CmdItem;
  ext: FeatureItem;
  plugin: OptionPlugin;
  click: (ev?: Event) => void;
}

export interface TranslateState {
  src: string;
  basic?: {
    phonetic?: string;
    explains?: string[];
  };
  translation?: string[];
}
