# DrawBoard 设计文档

DrawBoard 是一个「自然语言 → 结构化图片提示词 → 画布编辑 → 图片生成」的 Web 应用（Expo / React Native Web + expo-router）。
用户输入一句话描述，经 LLM 改写为 **Ideogram 4.0 JSON prompt**（含元素 bbox），在画布上拖动/缩放/编辑元素后，调用本地 Ideogram 兼容服务生成图片，并可保存设计、生成多张历史图片。

配色：蓝色（#007AFF）+ 白色。

## 文件结构

```
src/
  i18n/                  界面国际化（en-US / zh-CN，见「i18n」节）
    translations.ts      双语词表（enUS 基准 + zhCN 同 key 强制对齐）、Locale/LOCALES/默认 locale/存储 key/国旗 emoji/语言自称
    I18nContext.tsx      I18nProvider + useI18n() + t(key, vars)（{name} 占位替换）、loadLocale/persistLocale
    index.ts             统一导出
  app/
    _layout.tsx            根布局（expo-router Stack，外层包 I18nProvider）
    index.tsx              首页：输入描述、选比例/尺寸，最近设计列表
    design.tsx             设计页：薄编排层（状态声明 + 组合下列 hooks/组件，自身 <400 行）
    types.ts               RefinedPrompt / CanvasElement / isEmptyElement
    useStartDesign.ts      首页「开始设计」流程 hook（校验→refine 重试→handoff（含原始 prompt）→跳转；瞬态错误行）
    useImageUris.ts        图片 ref→可显示 uri 的异步解析 hook（IndexedDB id 查库、URL 透传，按索引对齐；首页卡片与设计页共用）
    design/                设计页逻辑（从 design.tsx 拆出，每文件 <400 行）
      constants.ts         常量：最小尺寸、缩放范围/档、对齐阈值、gridCellUnits 网格分档、撤销上限、字体预设
      canvas.ts            纯几何：snapToGridValue / clampBbox / bboxToGeometry / computeAlignGuides / withVisibleElementsOnly（生成前剔除隐藏元素）
      designStyles.ts      设计页全部 StyleSheet（不计入行数约束）
      useHistory.ts        快照式撤销/重做（begin/commit/cancel/recordAction/undo/redo/reset）
      useCanvasInteraction.ts  画布拖动/缩放（中心对齐辅助线）+ 拖拽创建元素
      useElementEditing.ts     右键菜单（复制/粘贴/编辑/删除）+ desc/text 编辑对话框（含字体选项）
      useGeneration.ts     生成（设置校验→空元素校验→按需改写 desc→规范化→请求）、保存、图片历史
    components/
      ElementBox.tsx       画布上的单个元素框（拖动、四角缩放、右键菜单载体）
      ColorPalette.tsx     调色板（色块 + 添加按钮 + 弹出编辑 popover，portal 到 body）
      ColorPicker.tsx      取色器（SV 平面 + 色相条 + RGB/Hex 输入 + 预设色）
      SettingsDialog.tsx   设置对话框（两个下拉 + 五个文本框，内联展开式下拉）
      LanguageSwitcher.tsx 界面语言切换器（国旗 SVG 按钮 + 下拉菜单，portal 到 body，见「i18n」节）
      design/              设计页展示组件（props 驱动，无自身状态）
        CanvasStage.tsx    画布区：网格/元素开关、滚动画布（图 + 网格 + 元素层 + 辅助线 + tooltip + 草稿矩形 + 标尺 + 图层列表）、历史条与保存/生成行
        CanvasRulers.tsx   画布上/左边缘标尺（0–1000 双轴，向外延伸、随画布缩放、与网格对齐，数字密度按档位）
        LayerList.tsx      图层列表（画布区右下角：眼睛显隐开关 + 类型图标 + 30 字截断标签，最多 8 行）
        Toolbar.tsx        左侧工具栏（添加文字/对象 + 撤销/重做）
        MetadataBar.tsx    元数据栏（Aesthetics/Lighting/Art Style/Photo/Medium/Palette 六部分）
        HistoryStrip.tsx   生成图缩略图横条
        GenerateRow.tsx    Save + Generate + Download Image + Show Prompt 按钮行（保存成功提示、错误行）
        ContextMenu.tsx    元素/画布右键菜单（元素菜单：复制/粘贴 + 编辑 + 删除；画布空白处：仅粘贴）
        HeaderBackButton.tsx  Stack 页头返回按钮（design 标题左侧，headerLeft 注入；刷新后仍可用，见「页面与导航」节）
        EditDialog.tsx     元素编辑对话框（desc/text + text 元素字体选项）
        PromptDialog.tsx   显示 Prompt 对话框（左：原始 prompt / 右：增强后结构化 JSON，只读双栏）
    services/
      PromptRefiner.ts     两个 LLM 调用：refine（生成 prompt）、resolveContradictionInBBox（改写 desc）
      IdeogramPrompt.ts    normalizePromptForIdeogram：发送/保存前规范化 JSON prompt
      imageDownload.ts     downloadImage：fetch 图片 → blob → 临时 `<a download>` 点击触发浏览器保存
      imageStore.ts        生成图持久化：生成后抓图转 base64 data URI 存 IndexedDB（随机 id 为键）+ 按 ref 解析（URL 透传），见「imageStore.ts」节
      settings.ts          设置项定义、localStorage 持久化、厂商端点映射、缺失校验
      designStore.ts       localStorage 设计持久化（{prompt, images, rawPrompt} 框架）+ 导航 handoff（未保存设计按 id 暂存，含原始 prompt）+ 返回首页导航标志 + newDesignId
      color.ts             hex/RGB/HSV 互转与 clamp 工具
    test/
      services/            jest 单测（PromptRefiner、IdeogramPrompt、settings、designStore、imageDownload、imageStore）
      i18n/                jest 单测（locale 加载/持久化、双语映射、占位替换、key 对齐）
public/
  system_prompt.txt                       生成 JSON prompt 的 LLM 系统提示词（完整契约）
  system_prompt_rewrite_adapt_bbox.txt    bbox 改写 LLM 的系统提示词（只修 desc 与 bbox 矛盾）
```

外部依赖（均可在设置界面配置，见「设置」节）：
- LLM：OpenAI 兼容 API，由设置项决定（预设厂商 base 或自建后端 vLLM/SGLang/Ollama 的用户 base），请求时由 `getLlmUrl` 在 base 后追加 `/chat/completions`；模型名与凭据同样来自设置。
- 图片生成：`{端点}/v1/ideogram-v4/generate`；Official 用 Ideogram 4 官方 API（`https://api.ideogram.ai`），Custom 用本地/私有化部署的兼容端点（默认 `http://127.0.0.1:8000`）；`Api-Key` 头仅在密钥非空时发送。

## 数据模型

### RefinedPrompt（types.ts）
Ideogram 4.0 JSON prompt，三个顶层 key：
- `aspect_ratio`：`"W:H"`。
- `high_level_description`：1–2 句总述（兼作设计页标题初始值）。
- `style_description`（可选）：`aesthetics` / `lighting` / `medium` / `photo` / `art_style` / `color_palette`。按 Ideogram 4.0 契约，`photo` 与 `art_style` **互斥且有且仅出现其一**，key 顺序也有规定（见 IdeogramPrompt.ts）。
- `compositional_deconstruction`：`background`（场景外壳描述）+ `elements[]`。

### CanvasElement
- `type`：`'obj'` | `'text'`。
- `bbox`（可选）：`[y_min, x_min, y_max, x_max]`，归一化 0–1000，**原点在左上角**（y 在前）。
- `desc`：描述（obj 必填内容；text 也有）。
- `text`：仅 text 元素，要渲染进画面的文字（原样保留）。
- `extra_fontoption`（可选，仅 text 元素）：部分对象 `{ size?: number, font?: string, bold?: boolean, italic?: boolean }`，仅包含用户显式改过的非默认值，默认值不入库（见「元素框」节）。
- `visible`（可选，仅 DrawBoard UI 状态，不属于 Ideogram 契约）：`false` 时元素框隐藏、且该元素不参与生成（`withVisibleElementsOnly` 在发送前剔除，同时剥离 `visible` 键）；缺省/`true` = 可见。隐藏元素不触发空元素校验；保存的设计保留该键，重开时恢复显隐状态（见「图层列表」节）。
- 空元素判定 `isEmptyElement`：text 无 `text`、或 obj 无 `desc`。

### Design（designStore.ts）
保存的设计 = `{ id, prompt: RefinedPrompt, images: string[], size: {width, height}, updatedAt, rawPrompt? }`，存于 `localStorage['drawboard.designs']`，按 `updatedAt` 倒序。`size` 无法从 prompt 恢复所以单独存；`id` 用于重复保存时 upsert 同一条记录。`rawPrompt` = 用户输入的原始一句话 prompt（Show Prompt 对话框左栏展示用；旧设计无此字段，左栏显示为空）。
`images` 的每个元素是**图片 ref**：新设计存生成时的随机图片 id（`img-…`，对应 IndexedDB 里的 base64 data URI，见「imageStore.ts」节）；**旧设计或转换失败回退时存原始 URL**（显示时原样透传）。展示/下载前一律经 `resolveImageRef` 解析（id → IDB 查 data URI，URL → 原样返回，查不到 → null 渲染空占位）。

## 设置（Settings）

首页与设计页右上角各有一个齿轮按钮（28px，与工具栏图标同大小），点击打开 `SettingsDialog`（模态对话框，点遮罩/X/Cancel 关闭）。全部设置存于 `localStorage['drawboard.settings']`，Save 时整体写入，重新打开时恢复。

| 设置项 | 控件 | 规则 |
|---|---|---|
**每个 LLM provider 独立保存一份 profile（endpoint / secret key / model name）**，存于 `llmProfiles` 映射；切换 provider 只改变"当前激活"的 profile，其余 provider 的配置原样保留、绝不被覆盖。

| 设置项 | 控件 | 规则 |
|---|---|---|
| LLM provider | 下拉：OpenAI / Google / DeepSeek / GLM / Qwen / vLLM / SGLang / Ollama | 前 5 个为预设厂商（用其 OpenAI 兼容 base，`LLM_VENDOR_ENDPOINTS`）；后 3 个为自建后端（用用户填的 base）。选择器只切换激活的 profile |
| LLM endpoint | 文本框 | 当前 provider profile 的 base URL（Ollama 请求时追加 `/api/chat`，其余追加 `/chat/completions`）；仅自建后端可编辑——切换后为空时预填默认地址（vLLM `http://localhost:8000/v1`、SGLang `http://localhost:30000/v1`、Ollama `http://localhost:11434`，原生 API 无 /v1 前缀）；厂商时只读显示完整 URL |
| LLM secret key | 文本框 | 当前 provider 的认证凭据；仅自建后端允许为空（Google 用 `x-goog-api-key` 头，其余用 `Authorization: Bearer`） |
| LLM name | 文本框，占位符 `gpt-4o` | 当前 provider 的模型名，请求体 `model` 字段，必填 |
| Image generation provider | 下拉：Official / Custom | Official = Ideogram 4 官方 API（`https://api.ideogram.ai`）；Custom = 本地/私有化兼容端点（默认 `http://127.0.0.1:8000`） |
| Image generation endpoint | 文本框 | 仅 Custom 可编辑；否则只读显示官方 base |
| Image generation secret key | 文本框 | `Api-Key` 头；仅 Custom 允许为空 |

**缺失校验** `getMissingSettings`：LLM name 恒必填；自建后端时 endpoint 必填、厂商时 secret key 必填（image 同理：Custom 时 endpoint 必填、Official 时 secret key 必填）。
- 设计页点 **Generate**：任何一项缺失 → 拒绝生成，错误行显示 "Cannot generate — missing settings: …"，不发起任何请求。
- 首页点 **开始设计**：LLM 相关项缺失 → Alert 提示，不发起 LLM 请求。

## i18n（界面国际化 en-US / zh-CN）

除**数据与元素展示**外，全部界面文案走 i18n。数据（永不翻译）：元素 `desc`/`text`、生成图 caption、长宽比数值、字体名、LLM 厂商/模型名、设置端点，以及输入框占位示例 "a golden retriever on a skateboard"。

- **`src/i18n/`**：`translations.ts` 双语词表——`enUS` 为基准（~60 个 key），`zhCN` 类型是 `Record<keyof typeof enUS, string>`，编译期强制 key 对齐、不许缺值；另导出 `Locale`（`'en-US' | 'zh-CN'`）、`LOCALES`、`DEFAULT_LOCALE = 'en-US'`、`LOCALE_STORAGE_KEY = 'drawboard.locale'`、`LOCALE_FLAGS`（🇺🇸 / 🇨🇳）。`I18nContext.tsx`：`I18nProvider`（根布局 `_layout.tsx` 包裹 Stack）+ `useI18n()`（`locale` / `setLocale` / `t`）；`t(key, vars?)` 做 `{name}` 占位替换，未知 key 原样透传（不崩）。
- **locale 持久化**：选择写 `localStorage['drawboard.locale']`，刷新/重开保持；`loadLocale` 读非法值（或无存储）回退 `en-US`。
- **`LanguageSwitcher`**（components/LanguageSwitcher.tsx）：国旗按钮（flag-emoji 风格内联 SVG data-URI，按钮 testID `lang-switcher`、旗帜本体 `lang-flag-<locale>`；不用区域指示符 emoji——缺字体时渲染成 "US"/"CN" 字母，且 RN-web `<Image>` 对该 data-URI 不出图，故用带 CSS background 的普通 View，同画布网格机制），点击开下拉（两个选项各带小国旗 + 语言自称文案——`LOCALE_NAMES`：en-US → "English"、zh-CN → "中文"，自称不随当前 locale 变化；testID `lang-option-<locale>`，视口内钳制、贴底翻到上方；透明全屏遮罩点外关闭）。**遮罩与菜单 `createPortal` 到 `document.body`**（同 ColorPalette popover）——不 portal 的话 fixed 下拉会被同层屏幕内容盖住（stacking context）。两页各插一个：**首页**齿轮左侧（绝对定位 `right: 72`）、**设计页**页头齿轮左侧（流式 `marginLeft: 8`）。
- **覆盖**：首页（侧栏标题/占位、输入区标题、W/H/自定义、开始设计/处理中、Alert 与重试提示）、设计页（元数据六标签 + 背景标签、网格/元素开关、画布占位、工具提示、Save/Generate/Download/Show Prompt、已保存、历史条「Generated (N)」、右键菜单、编辑对话框含字体区、显示 Prompt 对话框两栏标签、调色盘 popover、设置对话框全部标签与按钮——设置对话框的保存按钮用独立 key `saveSettings`（en "Save Settings" / zh "保存设置"，不与设计页 Save 的 `save`（zh "保存设计"）混用）、生成/下载错误提示（缺设置、空元素、请求失败、无图可下、重写失败等）。

## 页面与导航

`index.tsx`（默认页）⇄ `design.tsx`。**导航只在 URL 里带设计 `id`**——LLM 改写后的 prompt 太大，放 query 参数会触发 HTTP 431（请求行过长），所以走 localStorage handoff（见下）。
- 首页「开始设计」→ 生成新设计 id（`newDesignId`）→ `setDesignHandoff(id, { promptData, size, rawPrompt })` 把 LLM 结果、画布尺寸与用户原始 prompt 暂存到 localStorage（key `drawboard.handoff`，按 id 的映射，上限 10 条、超了逐出最旧）→ `router.push('/design', { id })`。handoff 读时不消费，未保存设计的刷新/前进后退仍能解析；Save 成功时 `clearDesignHandoff(id)`（store 成为唯一事实来源，避免重开时读到编辑前的旧 payload）。
- 首页点最近设计卡片 → 只带 `id` 重开设计（prompt/尺寸/图片历史都在设计 store 里，按 id 读回，显示最新一张）。
- 设计页加载 effect 按 `params.id` 解析：**handoff 优先**（刚发起、未保存的设计），否则查设计 store；两者皆无（裸访问 /design）保留 "Canvas Area" 占位。
- 设计页的返回按钮在 **Stack 页头**（"design" 标题左侧），由 design.tsx 的 `Stack.Screen options.headerLeft` 渲染 `HeaderBackButton`（不是页面内标题栏）：默认的页头返回按钮只在 navigation state 有父 route 时显示，刷新后 state 只按当前 URL 重建（单 route）就会消失，自定义 headerLeft 保证始终显示。点击行为：本会话由首页进入设计页时（首页 push 前调 `markNavigationFromHome` 置 sessionStorage 标志 `drawboard.fromHome`，刷新后标志仍在）做**原生** `window.history.back()` 返回上一页——刷新后 `router.back()` 没有可弹的 route，原生后退触发 popstate 由路由处理并恢复首页；无标志时（裸 /design 访问、新标签、外部跳转而来）`router.replace('/')` 去首页。

## index.tsx（首页）

页面文件只做状态声明与组合；「开始设计」流程（设置校验 → refine 重试 → handoff → 跳转 + 瞬态错误行）在 `useStartDesign.ts`（同设计页 hooks 的拆分模式，index.tsx 因此保持 <400 行）。

左右两栏（1/3 + 2/3）：

**左栏「最近的设计」**：`loadDesigns()` 读 localStorage，每条卡片显示最新生成图缩略图（无图则不显示）+ `high_level_description`（最多 3 行）。为空时显示占位文案。

**右栏**（自上而下）：
1. 标题「Enter the description of your dreamed image」。
2. 长宽比横向列表：`4:3, 3:4, 16:9, 16:10, 9:16, 10:16, 1:1, custom`。
   - 选非 custom 比例时：以 1024 为基准算出默认 W/H；随后在 W 或 H 输入数字，另一边按比例自动联动（取整）。
   - 选 custom 后 W/H 互不联动，长宽比取 `${W}:${H}`。
3. 多行 prompt 输入框（占位符 "a golden retriever on a skateboard"），占满剩余空间。
4. 「开始设计」按钮：prompt 非空且 LLM 设置项齐全（缺失则 Alert 列出缺项并停止）→ `refine(system_prompt.txt, prompt, ratio)`（端点/密钥/模型名取自设置）得到 JSON prompt 字符串。**JSON 格式校验 + 重试**：LLM（temperature 1.0）可能返回无法 `JSON.parse` 的回答，每次尝试后立即解析，失败时在按钮上方显示临时错误条（**5 秒后自动消失**，新的失败重新计时）并重试，最多 `REFINE_MAX_ATTEMPTS = 3` 次，全部失败弹 Alert 不跳转。校验通过 → 生成新设计 id、把 prompt 与 W/H 写入 handoff（`setDesignHandoff`，见「页面与导航」节）→ URL 只带 `id` 跳 design 页。其他失败（网络等）弹 Alert。
5. 页面右上角齿轮按钮（绝对定位）：打开设置对话框；齿轮左侧紧邻 `LanguageSwitcher` 语言切换器（见「i18n」节）。

## design.tsx（设计页）

页面文件只做状态声明与组合：交互逻辑在 `src/app/design/` 的四个 hooks（useHistory / useCanvasInteraction / useElementEditing / useGeneration），展示在 `src/app/components/design/` 的组件（见「文件结构」节）；滚轮缩放、居中滚动、Esc 取消工具、promptData 加载等页面级 effect 仍在 design.tsx。以下各小节描述的行为与拆分前一致。

### 初始化
- `designId`：首页导航恒带 `id`（新设计由首页生成、重开设计复用原 id）；裸访问 /design 无 id 时现场生成（无数据，显示占位）。
- 按 `id` 取数据（见「页面与导航」节：handoff 优先、否则设计 store）→ 解析 `promptData` → `refinedData`；`high_level_description` 作为标题；`style_description` 各字段 → 独立 UI 状态（aesthetics/lighting/medium/artStyle/photo/palette）；数据中的 `size` → 画布逻辑尺寸；store 里的 `images` → 图片历史，`viewIndex` 指向最新一张。
- 页头：可编辑标题 + 右侧 `LanguageSwitcher`（见「i18n」节）+ 设置齿轮按钮（打开设置对话框，见「设置」节）。返回按钮在 Stack 页头"design" 标题左侧（见「页面与导航」节）。

### 元数据栏（六个部分，各 ≤20% 宽度，内部换行）
一行六个部分：Aesthetics / Lighting / Art Style / Photo / Medium / Palette。
- 每个部分 `flex:1 + maxWidth:'20%'`：六个都在时各约 16.7%，Art Style 或 Photo 为空被隐藏时其余各占 20%。
- 标签（Tag）放不下在部分内部自动换行，栏高随内容自适应，无横向滚动。
- Aesthetics/Lighting 按 `,` 拆标签，Art Style 按空格拆，Photo 按 `,` 拆，Medium 单标签；这些标签**只读展示**（来自 LLM 结果，无编辑入口）。
- Palette 可编辑（见下）；色块行在 20% 宽的列内自动换行。

### 调色板（ColorPalette + ColorPicker）
- 点已有色块 → 编辑模式 popover：`Set color` / `Remove` / `Cancel`；点末尾「+」→ 添加模式：`Add color` / `Cancel`（重复颜色不重复添加）。
- 取色器 = 可拖动的饱和度–明度平面 + 色相条 + R/G/B 数字输入 + hex 输入（失焦/回车提交）+ 18 个预设色。
- popover + 透明遮罩通过 `createPortal` 渲染到 `document.body`（`position:fixed` 必须在真实视口坐标系），并做水平/垂直视口钳制，保证不出屏；点外部关闭。
- `handlePaletteChange` 同时更新 UI 状态并**写回** `refinedData.style_description.color_palette`（保证生成/保存用的是用户改后的调色板）。

### 画布
- **Show grid / Show elements 复选框**：画布区右上角固定两个小复选框（默认都勾选）。"Show elements"：取消勾选时所有 prompt 元素框（及悬停 tooltip）隐藏，勾选恢复；隐藏只是 `display:none`，不改动数据，且不会显示 "Canvas Area" 占位（占位仅在没有任何元素时出现）；创建工具在隐藏状态下仍可正常拖出新元素（新建元素属于 prompt 元素，同样受开关控制显隐）。"Show grid"：取消勾选时网格线隐藏，**且网格吸附关闭**（拖动/缩放/创建不再吸附，按自由坐标移动）。
- 画布区 `onLayout` 测得可用尺寸后，`scale = min((可用宽 − 30)/逻辑宽, (可用高 − 20)/逻辑高)`（给向外延伸的标尺条留出空间，见下），画布显示尺寸 = 逻辑尺寸 × scale（保持长宽比）。
- **滚轮缩放（居中缩放）**：在画布区上滚轮缩放画布（每档 ×/÷1.1，范围 1–8），只放大画布及其内部元素/元素框/标尺（几何全部基于含缩放的 `displaySize` 计算，自动跟随）；画布外的组件（元数据栏、按钮、复选框等）不参与缩放。放大后画布区变为滚动容器（`overflow: scroll`，父容器改左上对齐、画布外框用 `margin: auto`——仍放得下的轴保持居中，溢出的轴完整可滚），**每次缩放后自动把滚动位置滚到中心**（滚动目标是含向外标尺的外框中心，再加半条标尺宽度的修正，使**画布中心**始终停在视口中心；放得下的轴表达式为负、钳到 0 即自动居中）（居中缩放）；之后可用滚动条拖动浏览。滚轮事件用非 passive 原生监听并 `preventDefault`，缩放时容器不跟着滚。缩小回 1 后恢复居中、无滚动条；重新加载/重开设计时缩放复位为 1。
- **网格系统（跟随缩放等级，0–1000 bbox 空间）**：画布上叠加一层细网格线（`repeating-linear-gradient`，pointer-events 关闭），单元格大小按滚轮档位数分档：基础档 100×100 格（10 单位/格）→ 放大 2 档 200×200（5）→ 再 2 档 500×500（2）→ 再 2 档及以上 1000×1000（1 单位/格）。像素间隔按画布宽/高分别换算，所以**单元格长宽比随画布长宽比变化**（归一化空间里是均格的）。
- **网格吸附**：仅在 **Show grid 勾选**时，当前缩放等级下的网格对编辑操作生效——拖动移动时吸附移动后的原点（尺寸不变）、四角缩放时吸附被抓取的边（对边不动，吸附越界时以约束为准）、创建元素时吸附原点。小于半格的移动会吸附回原位（不产生位移）。
- **标尺（上边缘 + 左边缘，0–1000 双轴，向外延伸）**：画布外套一层外框（canvas + 左 30px + 上 20px，`margin:auto` 居中于滚动容器），两条标尺条（顶条高 20px、左条宽 30px，白底 85% 透明 + 内侧 1px 蓝边）渲染在**画布外**（顶条在画布顶边之上、左条在画布左边之左，左上角 30×20 留空），半透明条不遮挡画布内容；横轴覆盖 0–1000 单位、纵轴同。标尺在外框内渲染，**随画布一起缩放**；刻度/数字位置与网格用同一套 0–1000→px 换算，**始终与网格线对齐**。长边数字密度按滚轮档位（`rulerLabelStep`，与 `gridCellUnits` 同档）：0–1 档每 100 单位、2–3 档每 50、4–5 档每 20、5 档以上每 10——每档都是该档网格单元的整数倍，数字恒落在网格线上。**长宽比不为 1:1 时短边标尺按长宽比变稀疏**（`rulerSteps`）：短边间隔 = 长边间隔 × 长/短，且保持 10 的倍数、除不尽时向更稀疏方向取整，使两边每像素的数字密度大致一致（1:1 时两边相同；末档数字可能不到 1000，如 4:3 下短边间隔 140 → 0…980）。数字间中点位置画无数字刻度（与网格同为 `repeating-linear-gradient`，不产生逐刻度节点）；数字盒固定尺寸并钳制在标尺条内（0/1000 不越界）。标尺 pointer-events 关闭，不阻挡画布/元素交互；不随 Show grid 开关显隐。
- **中心对齐辅助线**：拖动元素时，若其他元素的垂直中心线（x 中心）或水平中心线（y 中心）与拖动元素对应中心线距离 ≤ `ALIGN_GUIDE_THRESHOLD`（10 个 0–1000 单位），在画布上画出该元素中心线的全长红线（1px 红色），并**高亮对应元素**（红色 2px 边框）；最近的一条线各取一条（垂直/水平各一）。松手后辅助线和高亮消失。
- **右键空白处**：右键画布空白区域（非元素框）弹出仅含 `Paste` 的菜单，与元素菜单共用同一应用内剪贴板（同样的级联偏移、每步撤销、按需重写语义，见「元素框」节）；元素框的右键会 `stopPropagation` 吞掉事件，两者互不触发。
- 背景图 = 历史中当前选中的那张（默认最新），`resizeMode=cover` 铺满画布。
- `refinedData` 不存在时显示占位文字 "Canvas Area"。

### 元素框（ElementBox）
每个有 `bbox` 的元素渲染为蓝色虚线框，绝对定位于画布（归一化 bbox × 显示尺寸换算像素）：
- 左上角图标：text 元素橙色「T」，obj 元素蓝色图片图标；框内显示 `text`（text 元素）或 `desc`（obj 元素）。框与文字设 `userSelect: 'none'`（UI 标签不可选中）：web 上拖动/缩放扫过文字会触发原生文本选择，`selectionchange` 事件让 RN-web 的 responder 系统**中途终止手势**，缩放会静默卡在第一步。
- **拖动移动**：框内部（四边内缩 `moveInset = min(14, min(w,h)/4)`）为移动热区，PanResponder 位移 >3px 生效；手势开始时记录 base bbox，实时增量 = 像素位移 ÷ 显示尺寸 × 1000，clamp 到画布内并取整后写回 `refinedData`。
- **四角缩放**：四角 handle（可见 14px）为子级手势；**web 上的命中区是显式的 21×21px 透明方块（1.5 倍可见 handle，中心对准角点）**——RN-web 用浏览器命中测试，对普通 View 忽略 `hitSlop`（只有 Touchable 会扩大按压区），`hitSlop: 10` 仅为原生保留。命中区**只认领从区内开始的手势**：pointerdown 时记录所按的角（框根上任意按下先清空），因为 RN-web 的 responder 按每个 move 事件的 DOM 目标重新协商，若不限定起点，向角部扫过的移动拖拽会中途被放大的命中区偷走手势。移动阈值保持 3px（不能降到 2px：PanResponder 在 grant 时把位移清零，grant 早一步会让所有拖拽的有效位移偏移 3px；贴角 10.5–14px 的死区按下仍为无效拖动，与本特性前一致）。只拉伸被抓角落点/边，clamp 到画布与最小尺寸 `MIN_ELEMENT_SIZE = 20`（0–1000 单位），取整写回。
- 悬停：白底高亮；悬停 text 元素时显示黑色 tooltip（展示 `desc`，优先在框上方，空间不足翻到下方，水平钳制在画布内）。
- **右键菜单**（RN-web 映射 DOM contextmenu）：`Copy` / `Paste` / 分隔线 / `Edit description`（所有元素）/ `Edit text`（仅 text）/ 分隔线 / `Delete`。菜单定位钳制在视口内；点任意处（透明全屏遮罩）关闭。右键画布空白处则弹出仅含 `Paste` 的菜单（见「画布」节）。
  - **复制/粘贴**：`Copy` 把右键元素存为**深拷贝快照**（含 bbox、desc/text、字体选项）进应用内剪贴板（不修改文档、不记撤销）；`Paste` 在 `elements` 末尾追加新元素（最前层、图层列表最后一行），位置 = 上一次粘贴落点 + 20 单位（0–1000）偏移再 clamp 进画布（`clampBbox`），**连续粘贴级联错开**；clamp 后位置实际变化才置位 `bboxEditedRef`（desc 是针对原 bbox 写的，生成时按需重写）。粘贴计撤销栈一步；剪贴板为空时 `Paste` 置灰不可点；重新加载/重开设计剪贴板清空。
- 编辑对话框：多行输入，聚焦全选；内容为空时 Save 禁用；保存写回对应字段（空内容不覆盖）。**text 元素额外提供字体选项区**（保存后即时反映在画布展示上）：
  - **字体大小 (px)**：下拉预设（12–64）+ 可直接手输任意整数；
  - **字体**：下拉选择常用字体（Arial/Helvetica/Times New Roman/Georgia/Verdana/Trebuchet MS/Courier New/Garamond/Palatino/Impact/Comic Sans MS/Brush Script MT/Noto Sans CJK SC/SimSun/KaiTi），默认 "Default"；
  - **加粗 / 斜体**：B / I 切换按钮（激活时蓝色底白字）。
  **只保存用户显式改过的（非默认）值**：`extra_fontoption` 是部分对象，仅包含非默认的键——size ≠ 13 才写 `size`，选了字体才写 `font`，开启才写 `bold`/`italic: true`；因为 prompt 的 desc 自带默认字体描述，存默认值会与之冲突，所以默认值一律不入库。一个键都没改 → 整个字段不写（已有时移除），元素保持原有默认外观。画布按字段中存在的键渲染 `fontSize/fontFamily/fontWeight/fontStyle`。字体选项发生实际变化（设值或恢复默认）会置位 `bboxEditedRef`，下次生成时触发 LLM 重写提示词（见「生成」节）。
- 删除：从 `elements` 数组中移除。

### 撤销 / 重做（左侧工具栏）
对文档（`refinedData` + `palette`）做快照式撤销/重做，左侧工具栏在两个创建工具下方有撤销（Undo2）/重做（Redo2）按钮，对应栈为空时灰色禁用。
- **记录粒度**：一次用户操作一步——拖动/缩放在手势结束时记一步（clamp 后 bbox 与起点不同才算，贴边无效拖动不记）；编辑 text/desc、新增元素、删除元素、调色板改动（改色/加色/删色）各记一步。
- **上限 50 步**（`UNDO_HISTORY_LIMIT`）；新操作会清空 redo 栈；重新加载/重开设计时历史清空。
- 快照在操作**之前**捕获（拖动/缩放在手势开始时捕获，原子操作在状态更新前即时捕获+提交，`recordAction`）。
- 恢复快照时若文档对象变了，会重新置位 `bboxEditedRef`（撤销可能让 desc 与 bbox 再次矛盾，生成时按需重写，见「生成」节）。

### 创建工具（左侧工具栏）
两个可切换工具（再点一次取消）：
- **添加文字**（T 图标）、**添加对象**（图片图标）。
- 工具激活时：画布光标变十字，元素层 `pointerEvents='none'`（让拖拽落到画布）；在画布上按下拖动绘制虚线预览矩形（window 级 pointermove 跟踪，指针移出画布也跟随），松开时：
  - 拖动不足 `MIN_CREATE_DRAG_PX = 12`px 视为点击，不创建；
  - 像素矩形 → 归一化 0–1000 bbox（取整、clamp），宽或高不足 `MIN_ELEMENT_SIZE` 时扩展到最小尺寸；
  - 新元素 `desc`/`text` 为空，出现在画布上，需右键填写；创建后工具自动关闭。
- `Esc` 取消激活工具（并取消进行中的绘制）。

### 图层列表（LayerList）
Photoshop 风格图层列表，绝对定位于画布区右下角（距边缘 12px，宽 280px，白底 + 浅阴影），每个 prompt 元素一行（行高 34px，行间浅分隔线），无元素时不显示：
- **眼睛开关**（CheckBox 风格，16px）：默认蓝底白字 Eye（可见）；点击给该元素置 `visible: false`——元素框（及悬停 tooltip）立即从画布消失，眼睛变白底灰 EyeOff；再点一次恢复（移除该键）。行始终保留在列表中；切换计撤销栈一步。与 "Show elements" 开关互不影响（后者隐藏全部元素框且不动数据）。
- **类型图标**：与画布元素框左上角图标一致（text 橙色「T」/ obj 蓝色图片图标，复用 ElementBox 导出的图标样式）。
- **标签**：obj 显示 `desc`、text 显示 `text`，超 30 字截断加省略号（单行）。
- 最多显示 **8 行**（maxHeight = 8 行 + 内边距），超出仅面板内**垂直滚动条**（无横向滚动条）。
- 与生成/保存的关系：发送 `json_prompt` 前先经 `withVisibleElementsOnly` 剔除 `visible: false` 元素（并从保留元素上剥掉 `visible` 键，它不属于 Ideogram 契约）；隐藏元素**不参与空元素校验**；Save 保留 `visible` 键，重开设计时显隐状态恢复（见「数据模型」节）。

### 生成（Generate）
0. **设置校验**：`getMissingSettings` 任一项缺失 → 拒绝生成，错误行显示 "Cannot generate — missing settings: …"，不发起 LLM/生成请求。
1. **空元素校验**：任一**可见**元素为空（text 无 text / obj 无 desc；图层列表眼睛关闭的隐藏元素不参与校验）→ 阻止生成，显示错误「Element N is empty — right-click it on the canvas to edit its text/description」（N 为元素在完整列表中的序号，即图层列表行号），并对空元素红框闪烁（3 个亮灭周期后常亮，直到修复）。
2. **bbox 改写（按需）**：仅当画布编辑可能使 caption 与展示不一致时才执行（`bboxEditedRef` 标记，以下情况置位）：拖动/缩放后 clamp 结果与手势起点 bbox 不同；**修改了文字元素的字体选项（`extra_fontoption` 实际变化，含设值和恢复默认）**；撤销/重做恢复了不同的文档。加载 promptData 时复位；重写合并成功后复位，未再编辑则后续生成继续跳过；生成进行中若又编辑会重新置位。未编辑过画布时直接跳过这次 LLM 调用。执行时读 `system_prompt_rewrite_adapt_bbox.txt`，把当前 `refinedData` JSON 发给 `resolveContradictionInBBox`，LLM 只改写各元素 `desc` 中与用户移动/缩放后 bbox 矛盾的位置描述，其余字段保持不变。
   重置时机刻意放在**合并成功之后**：重写调用失败或返回非法 JSON 时保留标记，下次 Generate 自动重试；重写成功但生成 API 失败也不需重写（desc 已与当前 bbox 一致且已写回 `refinedData`）。
3. **合并**：只把改写回来的 `desc` 逐个元素合并回本地 caption（要求 index 对应、type 相同、desc 为非空字符串，否则保留原元素）——画布 bbox 永远是唯一事实来源。
4. **规范化**：`withVisibleElementsOnly`（剔除隐藏元素，见「图层列表」节）+ `normalizePromptForIdeogram`（见 services）后 `JSON.stringify` 为 `json_prompt` 字符串字段，连同 `response_type=url`、`resolution=WxH` POST 到 `/v1/ideogram-v4/generate`。
5. **请求与结果**：POST 到设置中的图像生成端点（`getImageUrl`，Official = 官方 API、Custom = 本地/私有化端点）+ 路径 `/v1/ideogram-v4/generate`，密钥非空时带 `Api-Key` 头；取 `data[0].url` 后经 `saveGeneratedImage` 转 base64 持久化（见「imageStore.ts」节，**任何失败回退存原始 URL**、不阻塞生成），把返回的 ref 追加进 `images` 并把画布切到新图；失败显示错误文字；生成中按钮显示 ActivityIndicator 并禁用。

### 下载图片（Download Image）
Save/Generate 行中 Generate 右侧的按钮，下载**画布当前选中**的那张生成图（历史条选中的缩略图，默认最新一张）：
- 有选中图 → 先 `resolveImageRef` 把 ref 解析成可显示 uri（IDB data URI 或透传 URL；解析不到按「无图可下」处理）→ `downloadImage`（services/imageDownload.ts）fetch 该 uri（data URI 同样可 fetch）→ blob → 临时 `<a download>`（文件名 `{designId}.png`）点击触发浏览器保存窗口；下载中按钮显示 ActivityIndicator 并禁用；fetch 失败同样走红悬浮提示。
- 还没有任何生成图（首页重写后未生成、或历史设计无图）→ 按钮仍可用，点击弹**红色悬浮提示**（视口顶部居中、Stack 页头下方，`pointerEvents` 关闭）「No image has been generated yet — generate one first, then download.」，**5 秒后自动消失**（新的失败重新计时）。
- `refinedData` 缺失时与 Save/Generate 一样禁用。

### 显示 Prompt（Show Prompt）
Save/Generate 行中 Download Image 右侧的按钮（12px 间距），点击弹出 `PromptDialog`（模态，点遮罩/X 关闭），两个只读文本框并排：
- **左栏「Original Prompt」**：用户输入的原始 prompt（`rawPrompt`）原样显示；设计没有记录原始 prompt 时（旧设计、裸访问 /design）显示为空。
- **右栏「Structured Prompt」**：增强后的结构化 JSON prompt——当前 `refinedData` 的 `JSON.stringify(_, null, 2)`（含画布编辑后的最新状态）。
- `refinedData` 缺失时与 Save/Generate 一样禁用。
- `rawPrompt` 的来源：首页「开始设计」时随 handoff 暂存（`useStartDesign`），Save 时随设计一起 `upsertDesign` 持久化（见「数据模型」节）；设计页加载时按 handoff 优先、否则读 store 恢复。

**Save/Generate 行布局（四按钮恒等宽）**：一行四个按钮（Save / Generate / Download Image / Show Prompt，间距 12px）无论标签长短/语言都等宽等高——行容器 `width:100% + maxWidth:720`（宽屏时行宽固定 720 并由父容器 `alignItems:center` 居中，窄屏占满可用宽度）；每个按钮 `flex:1 + height:40 + boxSizing:border-box`（固定高度保证生成/下载中显示 ActivityIndicator 时高度也不变）。注意 Chrome flexbox 对 `flex-basis:0%` 的尺寸计算会把 border 加回外层尺寸（border-box 下也不均分，纯 CSS 可复现），所以**四个按钮都带 1px 边框**——蓝底按钮用同色 `#007AFF` 边框（不可见），禁用态边框随背景变 `#B0D4FF`，Save 保持其原有可见蓝边框。"Saved ✓" 提示出现时四个按钮整体略收窄但仍彼此等宽。

### 保存（Save）
`normalizePromptForIdeogram(refinedData)` + 当前 `images` + 画布尺寸 + `rawPrompt` + `Date.now()` → `upsertDesign` 写 localStorage；元素上的 `visible` 键原样保留（隐藏状态重开时恢复，见「图层列表」节）；按钮旁显示「Saved ✓」1.8s。Save/Generate 在 `refinedData` 缺失时禁用。

### 图片历史条
有生成图时画布下方显示「Generated (N)」缩略图横条：点击缩略图在画布查看该图，当前查看的缩略图蓝边高亮。

## services 逻辑

### PromptRefiner.ts
两个 OpenAI 兼容 chat/completions 调用（共用内部 `chatCompletion`；端点/凭据/模型名在调用时从**当前激活的 provider profile** 读取，失败时把状态码+响应体抛成错误）：
- `refine(system_prompt, prompt, aspectRatio)`：用户消息 = `TARGET IMAGE ASPECT RATIO: {ratio} (width:height).\nUser idea: {prompt}`。
- `resolveContradictionInBBox(system_prompt, prompt)`：用户消息就是 JSON caption 原文（不加包装）。
- 返回 `choices[0].message.content`（字符串），由调用方解析/防御。
- 请求体**不发送任何思考（reasoning）开关字段**——所有 LLM 后端都保持自身默认的思考模式启用。
- **Ollama 走原生 `/api/chat` 方言**（docs.ollama.com/api/chat，非 OpenAI 兼容）：请求体 `{ model, messages, stream: false, options: { temperature } }`（无顶层 temperature、无 `think` 字段）；响应取 `data.message.content`（而非 `choices[0].message.content`）。

### settings.ts
- `Settings` 结构：`llmProvider` + `llmProfiles`（8 个 provider 各自的 `{endpoint, secretKey, name}`，切换 provider 不互相覆盖）+ 3 个图像项；`loadSettings` / `saveSettings` 走 localStorage `drawboard.settings`，解析失败回退默认值（provider=OpenAI、imageProvider=Custom、imageEndpoint=本地 8000）。
- `getActiveLlmProfile` 取当前 provider 的 profile。**旧格式迁移**：无 `llmProfiles` 的旧存储（扁平 `llmEndpoint/llmSecretKey/llmName`，含已废弃的 "Custom"）加载时自动并入对应 provider 的 profile（Custom→vLLM）；profile 映射不完整时按 provider 回填空 profile。
- `LLM_VENDOR_ENDPOINTS`：五个预设厂商的 OpenAI 兼容 base URL；`LLM_SELF_HOSTED_PROVIDERS`（vLLM/SGLang/Ollama）+ `LLM_SELF_HOSTED_DEFAULTS`（各自的惯用本地地址）+ `isSelfHostedLlm` 类型守卫；加载时把旧的 `llmProvider: 'Custom'` 迁移为 `'vLLM'`。
- `getLlmUrl` 在 base（厂商或自建后端，去尾斜杠）后追加路径：Ollama 用原生 `LLM_OLLAMA_CHAT_PATH`（`/api/chat`），其余用 `LLM_CHAT_PATH`（`/chat/completions`）；`getImageUrl` 按 provider 拼接生成路径。
- `getMissingSettings`：返回缺失设置项名称列表（空 = 可生成），供 Generate / 开始设计 校验。

### system_prompt.txt（生成契约，摘要）
单行 minified JSON、三个顶层 key 固定顺序；HLD ≤50 词；`style_description` 各字段语义（photo 仅当 medium 为 photograph、art_style 仅当非 photograph）；元素规则（单一主体=单一元素、desc 30–60 词、禁阴影/镜头语言/比喻词）；background 只放场景外壳（天空/地面/远景恒归 background，可放行的双提及例外）；bbox 0–1000 左上原点、`[y1,x1,y2,x2]`；specificity（禁止 hedging、二选一措辞）；文本元素穷举（用户引号文字、场景内可读文字、数字、品牌文字）；pop-culture 实体必须点名；透明背景时 `background` 必须为字面量 `transparent background`。

### system_prompt_rewrite_adapt_bbox.txt
保持输入结构不变，只按用户改后的 bbox 修正各元素 `desc` 的位置性描述，其余字段原样保留。

### IdeogramPrompt.ts（normalizePromptForIdeogram）
发送/保存前对 `style_description` 做规范化（不修改入参，返回新对象）：
- `photo` / `art_style` **有且仅留其一**：
  - 两者都有 → 按 `medium` 裁决：medium 含 "photo" 留 `photo`，否则留 `art_style`；
  - 只有其一 → 原样保留；
  - 都没有 → 保留 medium 对应的那个键（置空字符串），不编造默认值（避免与 prompt 自带描述冲突）。
- key 按文档顺序重建：photo 模式 `aesthetics, lighting, photo, medium, color_palette`；非 photo 模式 `aesthetics, lighting, medium, art_style, color_palette`；空字符串字段省略。
- `color_palette`：过滤非法 hex、转大写、截断到 16 个。

### imageStore.ts
生成图本地持久化（官方 Ideogram 返回的图 URL 有过期时间，所以生成后立即抓图存本地）：
- IndexedDB 库 `drawboard-images`（version 1，object store `images`，keyPath `id`），记录 `{ id, uri, createdAt }`，`uri` 为完整 `data:<mime>;base64,…` 字符串。
- `newImageId()`：`img-<时间戳36>-<随机6>`（同 `newDesignId` 格式）。
- `isDirectUri(ref)`：`http://` / `https://` / `data:` 开头 → true（旧设计/回退条目，解析时原样透传）。
- `saveGeneratedImage(url)`：fetch → `arrayBuffer` → 分块 `String.fromCharCode` + `btoa` 转 base64（mime 取 `content-type` 头，缺省 `image/png`）→ put 进 IDB → 返回新 id；**任何失败**（fetch/CORS/网络/非 2xx/IDB 不可用）`console.error` 后**返回原始 url**（图仍会显示但随服务过期），永不抛错。
- `resolveImageRef(ref)`：`isDirectUri` 直接返回；否则 IDB `get`，记录存在且 `uri` 非空返回之，否则 `null`（调用方渲染空占位），不抛错。
- IDB 打开用单例 promise，失败/关闭时清缓存（失败不毒化后续 open）；`typeof indexedDB === 'undefined'` 时全部走失败/透传路径。
- 配套 hook `useImageUris(refs)`（`src/app/useImageUris.ts`，首页卡片与设计页共用）：按 ref 缓存解析结果（first-write-wins，迟到的结果落在已移除的 ref 上无害，无需取消），返回与 `refs` 按索引对齐的 uri 数组（解析中/缺失 = `null`）。

### designStore.ts
localStorage（key `drawboard.designs`）的 `loadDesigns`（倒序、解析失败返回空数组）/ `getDesign` / `upsertDesign`（按 id 插入或替换，倒序持久化并返回最新列表）。
导航 handoff（key `drawboard.handoff`，按 id 的 `{ promptData, size }` 映射，上限 10 条、超了逐出最旧）：`setDesignHandoff`（首页发起设计时写入）/ `getDesignHandoff`（设计页按 id 读，不消费）/ `clearDesignHandoff`（Save 成功后清除）；`newDesignId` 生成 `design-<时间戳>-<随机>` id；`markNavigationFromHome` / `cameFromHome`（sessionStorage 标志 `drawboard.fromHome`，记录本会话由首页进入设计页，供设计页返回按钮判断回上一页还是去首页，见「页面与导航」节）。

### color.ts
无依赖的颜色工具：`hexToRgb`（#RGB/#RRGGBB，无 # 亦可）、`rgbToHex`（大写）、`rgbToHsv` / `hsvToRgb`、`clamp01` / `clamp255`、`rgbToCss`。

## 测试

- `npm test`（jest + jest-expo preset，`src/**` 下 `*.spec.ts`）。
- `PromptRefiner.spec.ts`：mock `fetch` 与 settings 模块，验证 refine / resolveContradictionInBBox 的请求体（system prompt、caption 原文）、透传返回、错误状态与非预期结构的抛错。
- `settings.spec.ts`：纯函数单测——厂商/自建后端端点解析、自建默认地址、官方/本地图像 URL、active profile 解析、各项缺失判定（LLM key 仅自建后端可空、图像 key 仅 Custom 可空）、per-provider profile 互不干扰、无 localStorage 时的默认值。
- `IdeogramPrompt.spec.ts`：纯函数单测——photo/art_style 互斥裁决、缺省补全、key 顺序、调色板大写/过滤/截断 16、入参不可变。
- `designStore.spec.ts`：纯函数单测——`markNavigationFromHome`/`cameFromHome` 的 sessionStorage 标志（默认无、置位后保持、sessionStorage 缺失时安全返回）；`rawPrompt` 在 handoff 与已存设计中的持久化（含旧格式缺省、upsert 保留）。
- `imageDownload.spec.ts`：纯函数单测（stub fetch/document/URL object-URL）——成功时以正确文件名经 `<a download>` 点击触发下载；fetch 失败时抛错且不动 DOM。
- `imageStore.spec.ts`：纯函数单测（`fake-indexeddb` 内存 IDB，每测试新 factory + `jest.resetModules` 隔离模块级单例；stub fetch 的 `arrayBuffer`，注意 Node Buffer 池——须 `new Uint8Array(Buffer)` 拷出）——`newImageId` 格式/唯一、`isDirectUri` 判定、成功存 data URI 后按 id 查回、fetch 失败/非 2xx/IDB 不可用三路径回退原 URL、URL 透传不碰 IDB、未命中 id → null。
- `i18n.spec.ts`：纯函数单测（内存 storage 挂到 `window.localStorage`）——默认 en-US、合法/非法存储值回退、`persistLocale` 写回、题目要求的全部英中映射、`{n}`/`{items}` 占位替换、未知 key 透传、双语表 key 对齐且无空值。
- UI 布局类改动用 Playwright 对着运行中的 `expo start --web`（默认 8081 端口）做 e2e 验证（截图 + 几何断言）；i18n 专项为 `scripts/e2e_i18n.cjs`（en-US 默认 → 切 zh-CN 全页中文 → 刷新持久化 → 切回 en-US，含元素 desc/text 不翻译断言）；显示 Prompt 专项为 `scripts/e2e_show_prompt.cjs`（按钮位于 Download 右侧；带/不带 rawPrompt 的已存设计、handoff 新设计的左右两栏内容、只读、X 关闭、无数据时禁用）；图片持久化专项为 `scripts/e2e_image_store.cjs`（IDB 设计打开显示、生成存 base64 随机 id、Save 存 id 后 reload 仍显示、转换失败回退 URL、旧 URL 透传、首页卡片混合 ref、下载文件名）。注意 `page.addInitScript` 在页面 JS 上下文执行：函数体引用 e2e 脚本模块级变量会 ReferenceError，且只接受**单个** arg——handoff 种子须把 payload 作为单一对象参数传入。
