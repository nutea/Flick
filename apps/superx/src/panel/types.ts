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
  features: FeatureItem[];
}

export interface TriggerSuperPanelPayload {
  text?: string;
  fileUrl?: string | null;
  optionPlugin?: OptionPlugin[];
}

export interface MatchPluginItem {
  type: 'default' | 'ext';
  name: string;
  logo: string;
  click: (ev?: Event) => void;
}

export interface UserPluginItem {
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
