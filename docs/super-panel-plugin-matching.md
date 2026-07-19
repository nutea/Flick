# 超级面板插件匹配规则

超级面板从插件 `package.json` 的 `features[].cmds[]` 中读取匹配命令。插件可以
通过 `matchRules` 声明更精确的规则。

## 兼容规则

- `type: "regex"`：使用 `match` 匹配选中文本。
- `type: "over"`：匹配任意非空选中文本。
- `type: "files"`：匹配一个或多个普通文件，`match` 默认作用于扩展名。
- `fileType`：可设为 `file`、`directory`、`folder` 或 `any`。
- `minLength` / `maxLength`：文本长度或文件选择数量限制。

例如，批量重命名插件可以用以下声明匹配一个或多个普通文件：

```json
{
  "type": "files",
  "label": "重命名"
}
```

## 自定义文件规则

```json
{
  "type": "files",
  "label": "批量处理图片",
  "priority": 20,
  "matchRules": {
    "selection": "files",
    "minCount": 2,
    "maxCount": 100,
    "kinds": ["file"],
    "target": "name",
    "pattern": "/\\.(png|jpe?g|webp)$/i",
    "mode": "all"
  }
}
```

- `minCount` / `maxCount`：选择数量范围。
- `kinds`：允许 `file` 和/或 `directory`。
- `target`：正则作用字段，可选 `extension`、`name`、`path`。
- `pattern`：正则字符串，支持 `/pattern/flags` 格式。
- `mode`：`all` 要求所有项目匹配；`any` 要求至少一个项目匹配。
- `priority`：数值越大展示越靠前，默认 `0`。

`files` 默认不匹配文件夹、应用包或活动应用回退项。如果插件确实需要处理文件夹，
可以显式设置 `matchRules.kinds: ["directory"]`，或同时声明
`["file", "directory"]`。

旧的 `type: "file"` 不再兼容；插件应统一迁移为 `type: "files"`。

## 自定义文本规则

```json
{
  "type": "custom-url",
  "label": "处理链接",
  "matchRules": {
    "selection": "text",
    "minLength": 8,
    "maxLength": 2048,
    "pattern": "/^https?:\\/\\//i"
  }
}
```

命中命令后，文本以字符串传入 `ext.payload`；文件选择以数组传入，每项包含
`path`、`name`、`isFile` 和 `isDirectory`。
