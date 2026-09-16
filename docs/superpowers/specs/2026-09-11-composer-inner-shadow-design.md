# Composer 内层阴影简化设计

## 目标

移除 Composer 白色输入区域在上、左、右三侧的明显阴影，同时保留整个 Composer 的底部悬浮层级。

## 样式行为

- 删除 `.composer-input` 的内层 `box-shadow`。
- 保留 `.composer-input` 的 `1px` 边框和圆角。
- 保留 `.composer` 外层现有阴影，使底部操作区仍有轻微悬浮感。
- 聚焦时继续只改变内部输入区域的边框颜色。
- 新对话与定时任务创建弹窗统一生效。

## 实现范围

仅修改 `src/styles.css` 中 `.composer-input` 的共享规则，不改动组件结构、弹窗容器阴影或其他页面卡片。

## 验证

- 样式测试确认 `.composer-input` 不再包含 `box-shadow`。
- 样式测试确认 `.composer` 仍保留外层阴影。
- 浏览器验证两个 Composer 的白色输入区域只显示边框，底部仍有悬浮层次。
- 运行完整测试和生产构建。
