export type SelectionFileKind = 'file' | 'directory';

/**
 * 超级面板的可选扩展匹配规则。旧插件仍可继续使用顶层的
 * match / fileType / minLength / maxLength 字段。
 */
export interface SelectionMatchRules {
  enabled?: boolean;
  selection?: 'text' | 'files';
  minCount?: number;
  maxCount?: number;
  kinds?: SelectionFileKind[];
  target?: 'extension' | 'name' | 'path';
  pattern?: string;
  mode?: 'all' | 'any';
  minLength?: number;
  maxLength?: number;
}

/** 与 flick 插件 package.json 中 features / cmds 结构一致（节选） */
export interface CmdItem {
  type: string;
  label?: string;
  match?: string;
  fileType?: 'file' | 'directory' | 'folder' | 'any';
  minLength?: number;
  maxLength?: number;
  priority?: number;
  matchRules?: SelectionMatchRules;
}

export interface FeatureItem {
  code: string;
  cmds: Array<string | CmdItem>;
  type?: string;
  payload?: unknown;
}

export interface OptionPlugin {
  name: string;
  logo: string;
  logoUrl?: string;
  features: FeatureItem[];
}

export interface SelectedFileItem {
  path: string;
  name: string;
  extension: string;
  isFile: boolean;
  isDirectory: boolean;
}

export interface TriggerSuperPanelPayload {
  requestId: number;
  text?: string;
  fileUrl?: string | null;
  fileUrls?: string[];
  selectedFiles?: SelectedFileItem[];
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
  cmd: string | CmdItem;
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
