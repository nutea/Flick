/** 与 runner.executeHooks 中 SubInputChange 一致，用于分离窗等场景 */
export function executePluginSubInputChangeHook(
  wc: Electron.WebContents | undefined | null,
  text: string
): void {
  if (!wc || wc.isDestroyed()) return;
  const payload = JSON.stringify({ text });
  void wc.executeJavaScript(
    `if (window.flick && window.flick.hooks && typeof window.flick.hooks.onSubInputChange === 'function') {
      try { window.flick.hooks.onSubInputChange(${payload}); } catch (e) {}
    }`
  );
}
