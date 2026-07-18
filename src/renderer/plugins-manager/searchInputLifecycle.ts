export type SearchInputRole = 'search' | 'filter' | 'command';

export type SearchInputRuntimeState = {
  searchValue: unknown;
  placeholder: unknown;
  detachInputRequested: boolean;
  detachInputFocus: boolean;
  detachInputRole: SearchInputRole;
};

export type SearchLaunchSnapshot = {
  value: string;
};

export const captureSearchLaunchSnapshot = (
  value: unknown
): SearchLaunchSnapshot => ({
  value: String(value ?? ''),
});

/**
 * A launch snapshot carries user input only. Placeholder, visibility, focus and
 * role are owned by the currently active plugin and must never cross a plugin
 * boundary.
 */
export const resolveMainInputInfo = (
  state: SearchInputRuntimeState,
  snapshot: SearchLaunchSnapshot | null
) => ({
  value: String(state.searchValue || snapshot?.value || ''),
  placeholder: String(state.placeholder ?? ''),
  requested: state.detachInputRequested,
  focus: state.detachInputFocus,
  role: state.detachInputRole,
});
