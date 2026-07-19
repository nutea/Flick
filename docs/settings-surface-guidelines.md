# 设置中心背景与表面规范

设置中心只使用四类背景层级，层级由页面结构决定，不由单个页面自行选择灰度。

| 层级 | Token | 用途 |
| --- | --- | --- |
| 工作区 | `--color-canvas-bg` | 右侧页面画布，只用于承载主内容表面 |
| 导航 | `--color-sidebar-bg` | 左侧常驻导航，与工作区通过边框分隔 |
| 主表面 | `--color-surface-base` / `--color-surface-raised` | 页面主卡片、插件卡片、弹层 |
| 弱表面 | `--color-surface-subtle` / `--color-control-bg` | 输入控件、说明块、局部分组 |

交互状态使用 `--color-surface-hover` 和 `--color-surface-selected`，不得作为整页或大面积容器背景。边界优先使用 `--color-border-light`，只有拖放区、强分隔或聚焦边界使用 `--color-border-strong`。

规则：

- 一个页面最多出现“画布 → 主表面 → 弱表面”三级，不在主表面内再次嵌套大面积白色卡片。
- 普通卡片依靠细边框区分；只有可交互卡片悬浮和展开状态使用 `--shadow-interactive`。
- `--shadow-surface` 只用于顶层主表面，禁止页面声明独立的阴影颜色。
- 暗色主题保持相同的物理关系：画布最深、侧栏次之、内容表面逐级变亮。
- 新页面必须复用 `.settings-page` 和 `.settings-card`，不得重新声明页面画布颜色。
