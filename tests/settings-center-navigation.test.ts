import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

test('feature plugin presents itself as the settings center', () => {
  const manifest = JSON.parse(
    read('apps/feature/public/package.json')
  ) as Record<string, any>;
  assert.equal(manifest.pluginName, '设置中心');
  assert.equal(manifest.logo, './settings-center-logo.png');
  assert.equal(manifest.features[0].code, '设置中心');
  assert.deepEqual(manifest.features[0].cmds, ['设置中心', '插件市场']);

  const icon = read('apps/feature/public/settings-center-logo.svg');
  assert.ok(
    fs.existsSync(
      path.join(root, 'apps/feature/public/settings-center-logo.png')
    )
  );
  assert.match(icon, /viewBox="0 0 256 256"/);
  assert.match(icon, /linearGradient/);
  assert.match(icon, /id="gear-cutout"/);
  assert.equal(icon.match(/class="gear-tooth"/g)?.length, 8);
  assert.doesNotMatch(icon, /<rect x="16" y="16"/);
});

test('settings center keeps one market entry and promotes installed plugins', () => {
  const app = read('apps/feature/src/App.vue');

  assert.match(app, /<a-menu-item key="finder">/);
  assert.match(app, /feature\.market\.title/);
  assert.match(app, /<a-menu-item key="installed">/);
  for (const removed of ['worker', 'tools', 'image', 'devPlugin', 'system']) {
    assert.doesNotMatch(app, new RegExp(`key="${removed}"`));
  }
  assert.match(app, /ShopOutlined/);
  assert.match(app, /InboxOutlined/);
  assert.match(app, /SettingOutlined/);
});

test('settings navigation exposes clear groups and keeps account at the bottom', () => {
  const app = read('apps/feature/src/App.vue');
  const router = read('apps/feature/src/router/index.ts');
  const settings = read('apps/feature/src/views/settings/index.vue');

  assert.equal(app.match(/<a-menu-item-group>/g)?.length, 4);
  assert.match(app, /feature\.navigation\.preferences/);
  assert.match(app, /feature\.navigation\.advanced/);
  assert.match(app, /window\.flick\.detachInput\.setValue/);
  assert.doesNotMatch(app, /window\.flick\.setSubInputValue/);
  for (const key of [
    'superPanel',
    'localStart',
    'general',
    'shortcuts',
    'dataSync',
    'marketSource',
    'dev',
  ]) {
    assert.match(app, new RegExp(`<a-menu-item key="${key}">`));
  }
  assert.doesNotMatch(app, /<a-sub-menu/);
  assert.match(app, /class="account-entry"/);
  assert.match(app, /@click="changeMenu\('account'\)"/);
  assert.match(router, /props: \{ section: 'userInfo' \}/);
  assert.match(router, /props: \{ section: 'normal' \}/);
  assert.match(router, /props: \{ section: 'global' \}/);
  assert.match(router, /props: \{ section: 'database' \}/);
  assert.match(router, /props: \{ section: 'localhost' \}/);
  assert.doesNotMatch(settings, /mode="horizontal"/);
  assert.doesNotMatch(settings, /sectionMeta|settings-page__heading|<h1>/);
});

test('settings pages avoid outer layout class collisions and fragile form grids', () => {
  const installed = read('apps/feature/src/views/installed/index.vue');
  const marketSource = read('apps/feature/src/views/settings/localhost.vue');

  assert.match(installed, /class="installed-layout"/);
  assert.doesNotMatch(installed, /class="container"/);
  assert.match(installed, /class="plugin-accordion"/);
  assert.match(installed, /class="plugin-trigger"/);
  assert.match(installed, /selectedPluginName\.value === name \? '' : name/);
  assert.match(installed, /const selectedPluginName = ref\(''\)/);
  assert.doesNotMatch(installed, /localPlugins\?\.value\[0\]\?\.name/);
  assert.match(installed, /class="plugin-search"/);
  assert.match(installed, /class="plugin-overview"/);
  assert.match(installed, /class="danger-zone"/);
  assert.match(installed, /class="command-row"/);
  assert.match(installed, /MatchRuleEditor/);
  assert.match(installed, /openMatchRuleEditor/);
  assert.match(installed, /SUPER_PANEL_MATCH_RULES_DB_ID/);
  assert.match(installed, /persistMatchRulesDocument/);
  assert.match(installed, /feature\.installed\.matchRules\.manage/);
  assert.match(installed, /item\.name === pluginDetail\.value\.name/);
  assert.match(marketSource, /layout="vertical"/);
  assert.doesNotMatch(marketSource, /labelCol|wrapperCol/);
});

test('top-level settings pages fill the content area without page headings', () => {
  const pageFiles = [
    'apps/feature/src/views/settings/index.vue',
    'apps/feature/src/views/installed/index.vue',
    'apps/feature/src/views/market/components/finder.vue',
    'apps/feature/src/views/market/components/local-plugin.vue',
    'apps/feature/src/views/super-panel-market/index.vue',
    'apps/feature/src/views/dev/index.vue',
  ];

  for (const file of pageFiles) {
    const source = read(file);
    assert.doesNotMatch(source, /settings-page__heading|<h1>/, file);
    assert.match(source, /settings-card/, file);
  }
});

test('settings empty states and market cards keep a stable visual rhythm', () => {
  const shortcuts = read('apps/feature/src/views/settings/index.vue');
  const quickLaunch = read('apps/feature/src/views/settings/local-start.vue');
  const pluginList = read(
    'apps/feature/src/views/market/components/plugin-list.vue'
  );

  assert.doesNotMatch(shortcuts, /page-save-status|已自动保存/);
  assert.match(quickLaunch, /<a-list\s+v-if="localStartList\.length"/);
  assert.match(quickLaunch, /v-if="!localStartList\.length"/);
  assert.match(pluginList, /margin-bottom:\s*12px !important/);
  assert.match(pluginList, /class="plugin-card-avatar"/);
  assert.match(pluginList, /shape="square"/);
  assert.match(
    pluginList,
    /\.plugin-card-avatar\s*\{[^}]*border-radius:\s*8px/s
  );
  assert.match(
    pluginList,
    /\.ant-list-grid \.ant-col > \.ant-list-item\s*\{[^}]*border-bottom:\s*1px solid var\(--color-border-light\)/s
  );
  assert.doesNotMatch(pluginList, /margin-bottom:\s*0 !important/);
  assert.doesNotMatch(pluginList, /:deep\(\.ant-list-grid/);
});

test('data sync merges legacy settings aliases and always labels its rows', () => {
  const database = read('apps/feature/src/views/settings/database.vue');

  assert.match(database, /SYSTEM_FEATURE_ALIASES/);
  assert.match(database, /'偏好设置'/);
  assert.match(database, /'插件市场'/);
  assert.match(database, /new Set\(/);
  assert.match(database, /logoUrl: featureLogoUrl/);
  assert.match(database, /pluginName: `\$\{item\.name\}（插件未安装）`/);
  assert.match(database, /项同步数据/);
});

test('legacy market categories and commands resolve to the plugin market', () => {
  const app = read('apps/feature/src/App.vue');
  const router = read('apps/feature/src/router/index.ts');
  const launcher = read('src/renderer/App.vue');

  assert.match(app, /设置中心:\s*'finder'/);
  assert.match(app, /插件市场:\s*'finder'/);
  assert.match(
    router,
    /'\/devPlugin', '\/image', '\/tools', '\/worker', '\/system'/
  );
  assert.match(router, /redirect:\s*'\/finder'/);
  assert.match(launcher, /cmd:\s*'设置中心'/);
});

test('legacy settings-center sessions display the new title', () => {
  const search = read('src/renderer/components/search.vue');
  assert.match(search, /currentPluginDisplayLabel/);
  assert.match(search, /pluginName === 'flick-system-feature'/);
  assert.match(search, /text\('设置中心', 'Settings'\)/);
});
