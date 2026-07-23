# Windows 超级面板选取架构

Windows 侧以一次 `SelectionSnapshot` 作为超级面板触发的唯一事实来源。窗口
句柄和焦点句柄在 N-API 异步任务排队前同步捕获，后续即使 Flick 获得焦点，
原生任务也不会把 Flick 自己误认成来源应用。

## 数据流

1. 键盘快捷键或鼠标 Raw Input 产生触发事件。
2. `captureSelection` 立即捕获前台根窗口与焦点 HWND。
3. 原生工作线程读取：
   - Explorer：`IFolderView2::GetSelection(false)`；
   - 普通文本控件：UI Automation `TextPattern.GetSelection()`；
   - 来源应用：捕获 HWND 对应的进程、标题和窗口范围；
   - Explorer 当前目录：同一个触发时根窗口对应的 Shell 视图。
4. Shell 文件结果优先于 UI Automation 文本标签。原生层同时返回文件/目录
   类型，Electron 主线程不再对整批网络文件执行 `stat`。
5. 直接读取没有结果时才模拟一次复制，并通过剪贴板 generation token 等待
   新内容。文件列表优先使用原生 `CF_HDROP + DragQueryFileW`。
6. 仍无选区时，普通应用回退到来源可执行文件；Explorer 只回退到其当前目录，
   永远不把 `explorer.exe` 当作选中文件。

## 不变量与边界

- 单次最多传递 100 个文件；上限在 Shell 和剪贴板原生层执行，不在 JS 读取
  完全部内容后截断。
- 单次文本最多读取 262,144 个字符。
- 同一时刻只允许一个面板捕获任务，防止键盘重复和鼠标事件争用剪贴板。
- 直接读取有超时和 `AbortSignal`；超时任务不会在稍后覆盖当前请求。
- COM 初始化与当前线程严格配对；`RPC_E_CHANGED_MODE` 不会错误地反初始化
  调用者拥有的 apartment。
- 面板外点击以全局 DIP 坐标和窗口边界判断，不依赖焦点事件的到达时序。

## 鼠标输入职责

- Raw Input 是鼠标按钮通知的主通道，并使用 message-only window 集中注册。
- `WH_MOUSE_LL` 只负责应用自有手势的按键抑制和健康观测。
- Raw Input 事件携带 `hookObserved`。为 `false` 时说明低级钩子可能被 Windows
  静默移除，JS 会限频重建钩子；不再由 JS 按时间窗口猜测并去重两套事件。
- 即时中键手势会抑制原始中键消息，避免 Windows 10 Explorer 在原生选区读取
  前把多选折叠为一个文件。

长按左/右键仍保留系统原始点击/拖拽语义，因此无法承诺在按住期间冻结
Explorer 选区。需要稳定多选的场景应使用键盘快捷键或即时中键手势。

## 验证基线

- Rust 在 macOS 本机目标与 `x86_64-pc-windows-msvc` 上均须通过 `cargo check`。
- SuperX Node、renderer 与 `flick-native` TypeScript 必须通过类型检查。
- 自动测试覆盖统一快照、多文件顺序/上限、无选区复制回退、Raw Input
  健康恢复、中键抑制以及面板内外点击。
- 发布前仍需在 Windows 10 和 Windows 11 的真实 Explorer 上执行单选、多选、
  网络盘、桌面、键盘与中键场景的人工矩阵；Windows Server CI 不能替代
  Explorer 桌面会话。
