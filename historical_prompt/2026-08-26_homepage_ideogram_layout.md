# 2026-08-26 首页复刻 Ideogram 界面（侧边栏 + 居中输入条 + 图片墙）

---Start of comprehensive description---
按 Ideogram.com 截图复刻首页界面：
- 左侧只保留 **Home / Recent Designs** 两个导航项，去掉 Ideogram 图标（不替换任何 logo）。
- 去掉输入框上方截图里的 Edit image / Image Studio / AI Apps 按钮。
- 大标题用 "Enter the description of your dreamed image"（现有 `enterDescription` key，居中放大）。
- 输入框上方**保留现有功能**：长宽比 pill + W/H 宽高输入（联动逻辑不变）。
- 输入框占位符改为截图中的 "Generate new or upload & edit..."。
- 输入框做成截图样式：圆角胶囊单行输入条，右侧内嵌 40px 黑色圆形上箭头按钮作为「开始设计」触发器（用户确认）；处理中显示白色加载圈，按钮文案仅作无障碍标签（aria-label）。
- 下方**瓷砖拼贴（masonry）图片墙**：
  - Home 模式（默认）：墙留空、不显示标题（内容后续再补）；
  - Recent Designs 模式：墙上显示标题 "Recent Designs"；内容 = 所有已存设计的最新一张图（无图的设计不显示）；悬停图上叠加显示**原始提示词**（`rawPrompt`，旧设计回退 `high_level_description`，均为数据不翻译）；点击图进入对应设计页。

实现：
- i18n 新增 `homeNav`（'Home'/'首页'）、`promptPlaceholder`（'Generate new or upload & edit...'/'生成新图片，或上传并编辑…'）；复用 `recentDesigns`（侧栏项 + 墙标题同文案）、`noDesigns`（Recent 模式空态）、`startDesign`/`processing`（圆形按钮 aria-label）。
- `index.tsx` 重写：`Stack.Screen headerShown:false`（去掉默认页头）；左侧 200px 边栏两导航项（激活态浅灰底，testID `nav-home`/`nav-recent-designs`）；主列居中 hero（大标题 → 比例 pill → W/H → 胶囊输入条 + 圆形开始按钮，testID `prompt-input`/`start-design-button`/`width-input`/`height-input`）；refine 瞬态错误行移到输入条上方。
- 新组件 `components/RecentDesignsWall.tsx`：props 驱动；masonry 用 JS 贪心（每 tile 放最矮列，列数按容器宽 3–6，tile 高 = 列宽 × size.h/size.w）；tile 用 Pressable（RN 0.86 只有 Pressable 有 onHoverIn 类型）+ testID `wall-tile-<id>`；悬停叠加层 testID `wall-tile-overlay`（黑 65% 半透明 + 居中白字）。
- 旧侧边栏设计卡片列表移除；`useStartDesign`/handoff/导航逻辑不变。

---Start of test cases---
- Home 模式：无墙标题、无 tile；侧栏 "Recent Designs" 恰好 1 处。
- Recent 模式：标题出现；仅含有图设计显示 tile（各显示最新一张图）；无图设计无 tile；无任何设计显示空态文案。
- masonry：DOM 顺序最新在前；tile 宽高比跟随设计 size（4:3 / 3:4 用例）。
- 悬停：叠加显示 rawPrompt；无 rawPrompt 回退 HLD；移出消失。
- 点击 tile 进入对应设计（标题/尺寸/图片历史恢复）；返回后复位 Home 模式。
- i18n：新 key 双语映射；圆形按钮 aria-label 随语言；占位符随语言。
- 开始设计流程（空 prompt/缺设置拦截、mock LLM 跳转）经圆形按钮触发，行为不变。

---Start of test logic---
- 新增 `scripts/e2e_home_wall.cjs`（21 checks，截图存 ./temp）。
- `scripts/e2e_regression.cjs`：S1 改 testID 选择器 + 墙空/标题断言；S2 经圆形按钮开始设计；S14 改为墙 tile 进入设计（含悬停 rawPrompt 叠加、最新图断言）（156→164 checks）。
- `scripts/e2e_i18n.cjs`：S1/S4/S5 首页断言改侧栏/墙/aria-label/占位符（59→64 checks）。
- `scripts/e2e_show_prompt.cjs`：种子设计加图片，改经 `wall-tile-*` 进入设计（11 checks）。
- `scripts/e2e_image_store.cjs`：S6 首页卡片改为墙 tile 混合 ref 断言（17 checks）。
- jest `src/test/i18n/i18n.spec.ts` 补两个新 key 映射断言。
- 验证：npm test 51/51；e2e_home_wall 21/21；e2e_regression 164/164；e2e_i18n 64/64；e2e_show_prompt 11/11；e2e_image_store 17/17；tsc 干净（src 0 错误，example/ 既有错误除外）。
