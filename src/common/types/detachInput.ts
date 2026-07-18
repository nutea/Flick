export type DetachInputCapability = 'none' | 'optional' | 'required';

export type DetachInputUserPolicy = 'auto' | 'always';

export type DetachInputRole = 'search' | 'filter' | 'command';

export interface DetachInputRequest {
  requested: boolean;
  value: string;
  placeholder: string;
  focus: boolean;
  role: DetachInputRole;
}

export interface DetachInputState extends DetachInputRequest {
  capability: DetachInputCapability;
  policy: DetachInputUserPolicy;
  visible: boolean;
}

export interface PluginDetachSetting {
  input?: DetachInputCapability;
}
