import { clipboard } from './clipboard';
import { input } from './input';
import { system } from './system';
import { screen } from './screen';
import type { NativeRuntimeApi } from './types';

export const nativeRuntime: NativeRuntimeApi = {
  system,
  input,
  clipboard,
  screen,
};

export { system, input, clipboard, screen };
export * from './types';
