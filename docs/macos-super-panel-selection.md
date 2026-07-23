# macOS 超级面板选取架构

macOS 的超级面板以触发时刻为边界，统一生成一次 `SelectionSnapshot`。面板展示、焦点切换和插件匹配只能消费该快照，不能重新猜测当前访达窗口。

## 文件选择

1. `captureSelection` 在进入异步线程池前记录前台应用身份。
2. 只有触发源确实是 Finder 时才查询 Finder。
3. 一次 Apple event 同时读取前台 Finder 目录和全部选中项，避免两次查询之间窗口或选区发生变化。
4. Finder 端最多返回前 100 项，同时返回 `truncated`。
5. Finder 的 `folder` 类型才标记为目录；应用包和其他 package 作为普通文件处理。
6. 原生快照不对每个路径执行 `stat`，避免网络卷、失效卷或云盘占位文件阻塞。

Finder 自动化不可用或超时时，主进程会退回模拟 `Command+C`，再通过 `NSPasteboard` 的文件 URL 列表读取多选结果。剪贴板读取不启动 `osascript`，不会阻塞 Electron 主线程。

## 文本选择

非 Finder 应用按触发时记录的进程创建 Accessibility 源元素。实际读取在异步线程执行，并设置 250ms provider 超时；文本最多保留 262,144 个字符。这样既不会在 Electron 主线程等待失去响应的应用，也不会因面板稍后获得焦点而读取到 Flick 自己。

## 鼠标触发

macOS event tap 优先以 active 模式注册。立即中键触发被配置为应用拥有的手势时，中键 down/up 会在系统分发前被消费，避免 Finder 先改变多选状态。若系统权限只允许 listen-only，触发仍可工作，但无法消费原始中键；日志会标记 `suppression=false`。

左键、右键和中键长按仍保留原生短点击行为。系统会在长按成立前收到 mouse-down，因此这类手势不能承诺冻结 Finder 的原始选区；稳定的多选入口是键盘快捷键或立即中键。

## 权限与降级

- Finder 文件读取依赖 macOS“自动化”权限。
- 文本选区依赖“辅助功能”权限。
- 全局鼠标监听依赖“输入监控”；消费中键还需要系统允许 active event tap。
- 任一直接读取失败时都会进入有界的剪贴板复制回退，不会无限等待。
