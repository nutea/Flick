# Flick 0.0.3

- 新增集中式 Rubick 插件兼容层，统一管理旧插件协议与移除边界。
- 完整兼容 Rubick preload API、`window.rubick` 和旧版 Electron remote。
- 自动将旧 `file` 匹配命令转换为 Flick 的 `files` 协议。
- 兼容旧系统插件名称并统一插件清单、展示和运行时归一化。
- 修复旧插件读取深色模式时始终返回浅色的问题。
