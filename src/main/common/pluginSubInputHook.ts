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

/** 将新的插件启动参数完整转发给已经存在的单例分离窗口。 */
export function executePluginEnterHook(
  wc: Electron.WebContents | undefined | null,
  ext: unknown
): void {
  if (!wc || wc.isDestroyed() || ext == null) return;
  const payload = JSON.stringify(ext);
  void wc.executeJavaScript(
    `if (window.flick && window.flick.hooks && typeof window.flick.hooks.onPluginEnter === 'function') {
      try { window.flick.hooks.onPluginEnter(${payload}); } catch (e) {}
    }`
  );
}
