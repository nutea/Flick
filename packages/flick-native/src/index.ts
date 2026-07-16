import { clipboard } from './clipboard';
import { input } from './input';
import { system } from './system';
import type { NativeRuntimeApi } from './types';

export const nativeRuntime: NativeRuntimeApi = {
  system,
  input,
  clipboard,
};

export { system, input, clipboard };
export * from './types';
