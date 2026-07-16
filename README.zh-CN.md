[English](./README.md) | 简体中文

# Flick

基于 Electron、Vue 和 pnpm workspace 的插件化桌面效率工具。

这个仓库是一个桌面应用主程序与多个子应用组成的 monorepo，包含主搜索面板、插件市场、分离窗口、引导页和超级面板等模块，适合继续做桌面启动器、插件系统和效率工具方向的开发。

## 项目简介

项目当前包含这些核心部分：

- 主程序：Electron 主进程、主搜索面板、插件加载与窗口管理
- `apps/feature`：插件市场与设置页面
- `apps/superx`：超级面板
- `apps/detach`：分离窗口
- `apps/guide`：首次引导页
- `apps/tpl`：模板页面

## 技术栈

- Electron
- Vue 3
- TypeScript
- Vite / electron-vite
- pnpm workspace

## 开发

安装依赖：

```bash
pnpm install
```

启动主程序开发环境：

```bash
pnpm serve
```

同时启动子应用调试服务与主程序：

```bash
pnpm dev:all
```

只启动各子应用调试服务：

```bash
pnpm dev:apps
```

## 构建

构建桌面应用：

```bash
pnpm build
```

构建所有子应用：

```bash
pnpm apps:build
```

生成本地安装包：

```bash
pnpm electron:build:local
```

## 发版

现在支持通过 GitHub Actions 自动构建 Windows 安装包，并在推送版本 tag 后自动发布到 GitHub Release。

推荐发版流程：

```bash
git checkout main
git pull
git tag v5.0.0
git push origin main --tags
```

说明：

- tag 格式必须是 `v<package.json 版本号>`，例如 `v5.0.0`
- 工作流会校验 tag 是否与 `package.json` 中的版本一致
- Release 附件会包含安装包 `.exe`、`.blockmap` 和 `latest.yml`

## 目录结构

```text
.
├─ src/                  主程序源码
├─ apps/
│  ├─ feature/           插件市场
│  ├─ superx/            超级面板
│  ├─ detach/            分离窗口
│  ├─ guide/             引导页
│  └─ tpl/               模板页面
├─ public/               静态资源与构建产物
└─ electron-builder.yml  打包配置
```

## 开源说明

本项目基于开源项目 Rubick 继续开发，并保留必要的来源归属信息。

- 原项目：Rubick
- 原始仓库：https://github.com/rubickCenter/rubick
- 原始许可证：MIT

如果你继续分发或二次开发本项目，请一并遵守原项目许可证要求。

## License

[MIT](./LICENSE)
