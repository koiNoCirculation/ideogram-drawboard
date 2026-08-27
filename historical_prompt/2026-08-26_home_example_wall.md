# 2026-08-26 首页默认照片墙填充示例集（example_collection）

---Start of comprehensive description---
以 `public/example_collection/example.json` 的信息，填充首页**默认（Home 分区）**的照片墙（此前 Home 模式墙留空、内容"后续再补"，本次补上）。

`example.json` 为数组，每项 = 一条示例设计：
- `prompt`：用户原始一句话提示词；
- `jsonprompt`：完整的 Ideogram 4.0 结构化 JSON prompt（`RefinedPrompt`）；
- `url`：生成图（`/example_collection/*.png`，与 json 同目录、随 public 静态发布）。

需求与行为：
- **Home 分区（默认）**：照片墙改为渲染示例集——每条示例一个 masonry tile，显示其生成图；**不显示墙标题**（保持首页无标题的 Ideogram 观感）；悬停叠加显示**原始 prompt**（`prompt` 字段，数据不翻译）。
- **Recent Designs 分区**：不变（仍显示已存设计的最新图 + 标题）。
- **点击示例 tile**：以该示例**开一个全新的、可编辑的设计**——画布铺该示例参考图、按 `jsonprompt` 渲染元素框、标题取 HLD、图片历史种子为这 1 张图、Show Prompt 左栏=原始 prompt / 右栏=结构化 JSON。每次点击都 `newDesignId()` 生成新 id（示例不是"已存设计"，不落设计 store，直到用户 Save）。

实现：
- 新 service `src/app/services/exampleCollection.ts`：`ExampleEntry` 类型；`loadExampleCollection()`（fetch `/example_collection/example.json`，网络/非 2xx/非数组一律回退 `[]`，永不抛错）；`sizeFromRatio()`（长边 1024 基线换算画布尺寸，1:1→1024²、16:9→1024×576、3:4→768×1024，非法回退方形）；`exampleToDesign(entry, index)`（映射成 `Design` 形状复用墙组件：id 取自 url 文件名去掉扩展名、`images=[url]`、`rawPrompt=prompt`、`size` 由 `aspect_ratio` 换算；文件名不可用时回退 `example-<index>`）。
- `designStore.ts`：`DesignHandoff` 增 `images?: string[]`（种子图片历史，供"从示例开设计"携带参考图）。
- `design.tsx` 加载 effect：图片历史恢复改为 `handoff?.images ?? stored?.images`（handoff 有图则用 handoff，否则用已存设计）。
- `imageStore.ts`：`isDirectUri` 增**根相对路径**（`/...`）判定为直连——示例图是 `/example_collection/*.png`，须原样透传给 `<Image>`，否则会被当 IDB ref 查库返回 null 出空白占位。img-*/design-* id 不以 `/` 开头，不受影响。
- `components/RecentDesignsWall.tsx`：去掉 `active` prop（墙现在两个分区都渲染，数据由调用方按分区切换）；墙标题改为**条件渲染**（`titleText` 非空才渲染，Home 传空串即无标题）。
- `index.tsx`：新增 `examples` 状态 + 挂载时 `loadExampleCollection` 拉取映射；`exampleUris` 经 `useImageUris` 解析（根相对 url 直连透传）；`handleOpenExample` 生成新 id → `setDesignHandoff(id, {promptData, size, rawPrompt, images})` → `markNavigationFromHome` → 跳转；墙 JSX 按 `activeSection` 二选一渲染（recent=已存设计+标题，home=示例+无标题）。
- i18n 新增 `noExamples`（'No examples available'/'暂无示例'，Home 墙空态，即示例集加载失败时）。

---Start of test cases---
- Home（默认）分区：墙显示**每个示例一个 tile**（tile 数 = example.json 长度），各渲染其示例图；无墙标题（"Recent Designs" 仅侧栏 1 处）。
- 悬停示例 tile：叠加显示该示例**原始 prompt**（`prompt` 字段），65% 黑底；移出消失。
- 点击示例 tile：开新设计——标题=HLD、画布比例=示例 `aspect_ratio`、画布背景=示例参考图、"Generated (1)"、元素框数=`jsonprompt` 元素数；Show Prompt 左栏=原始 prompt、右栏含 HLD 的结构化 JSON；X 关闭；返回回首页（示例墙复位）。
- `loadExampleCollection`：正常返回数组；非 2xx / 非数组 / 网络失败均回退 `[]` 不抛错。
- `sizeFromRatio`：1:1/16:9/3:4 正确换算；缺失/非法/0 回退 1024×1024。
- `exampleToDesign`：id 取自 url 文件名、`images=[url]`、`rawPrompt=prompt`、size 随 `aspect_ratio`；无文件名回退 `example-<index>`。
- `isDirectUri`：http/https/data/根相对路径为直连，img-*/design-* id 非直连；`resolveImageRef` 对根相对路径原样透传、不碰 IDB。

---Start of test logic---
- 新增 `scripts/e2e_example_wall.cjs`（17 checks，读磁盘 example.json 驱动断言，截图存 ./temp）：
  - S1 Home 默认墙=示例集（tile 数=文件长度、img[src*=example_collection] 数=文件长度、无标题）；
  - S2 悬停叠加原始 prompt + 65% 黑底、移出消失；
  - S3 点击 tile 开新设计（标题/比例/参考图/Generated(1)/元素框数/Show Prompt 双栏/返回复位）。
- `scripts/e2e_home_wall.cjs`：S1 由"墙空"改为"墙=示例集（tile 数=文件长度）"（21 checks）。
- `scripts/e2e_regression.cjs`：两处 Home"墙空"断言改为"墙=示例集（tile 数=文件长度）"（164 checks，数量不变、断言内容更新）。
- jest `src/test/services/exampleCollection.spec.ts`（9 用例：load 4 + sizeFromRatio 2 + exampleToDesign 3）；`src/test/services/imageStore.spec.ts` 补根相对路径直连/透传断言。
- 验证：npm test 60/60；e2e_example_wall 17/17；e2e_home_wall 21/21；e2e_regression 164/164；e2e_i18n 64/64；e2e_show_prompt 11/11；e2e_image_store 17/17；tsc 干净（src 0 错误，example/ 既有错误除外）。
