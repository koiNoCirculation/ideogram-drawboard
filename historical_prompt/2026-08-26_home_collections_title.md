# 2026-08-26 首页默认照片墙加 "Collections" 标题

---Start of comprehensive description---
首页默认照片墙（Home 分区，示例集墙）上面加个标题 "Collections"，和点击 Recent Designs 后显示的墙标题类似（同一样式：22px 加粗、墙上方 16px 间距），这样也可以将照片墙和 prompt 输入框在视觉上分隔开。
1. 新增 i18n key `collections`：en "Collections" / zh "合集"。
2. index.tsx Home 分区的 `RecentDesignsWall` 由 `titleText=""` 改为 `titleText={t('collections')}`；组件本身不变（`titleText` 非空才渲染标题，空态时标题也显示）。
3. 同步更新单测（i18n 映射断言）与 e2e（e2e_home_wall / e2e_example_wall / e2e_regression / e2e_i18n 原"Home 无标题"断言改为断言 "Collections"/"合集" 标题出现、"Recent Designs"/"最近的设计" 仍只出现一次=侧边栏）。
---Start of test cases---
when 首页处于 Home 分区（默认）, it should 墙上方显示 "Collections" 标题（zh 语言下为 "合集"），"Recent Designs" 仅侧边栏出现一次
when 切到 Recent Designs 分区, it should 墙标题仍为 "Recent Designs"（行为不变）
when 示例集加载失败（空态）, it should 标题仍显示 + noExamples 空态文案
---Start of test logic---
e2e：
- e2e_home_wall S1：`getByText('Collections', {exact}).count() === 1`；"Recent Designs" exact 计数仍为 1（仅侧边栏）。
- e2e_example_wall S1：同上断言（读磁盘 example.json 驱动）。
- e2e_regression S2（home mode）：同上断言。
- e2e_i18n S1/S4：en 断言 "Collections" 出现、zh 断言 "合集" 出现；原 "no wall title" 标签改为 "wall title is Collections/合集"。
npm test 全绿（i18n 映射 + key 对齐）；tsc 干净；全部 e2e 回归。
