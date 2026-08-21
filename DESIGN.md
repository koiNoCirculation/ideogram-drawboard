# DrawBoard 设计文档

DrawBoard 是一个「自然语言 → 结构化图片提示词 → 画布编辑 → 图片生成」的 Web 应用（Expo / React Native Web + expo-router）。
用户输入一句话描述，经 LLM 改写为 **Ideogram 4.0 JSON prompt**（含元素 bbox），在画布上拖动/缩放/编辑元素后，调用本地 Ideogram 兼容服务生成图片，并可保存设计、生成多张历史图片。

配色：蓝色（#007AFF）+ 白色。

## 文件结构

```
src/app/
  _layout.tsx            根布局（expo-router Stack）
  index.tsx              首页：输入描述、选比例/尺寸，最近设计列表
  design.tsx             设计页：元数据栏、画布、元素编辑、生成/保存
  types.ts               RefinedPrompt / CanvasElement / isEmptyElement
  components/
    ElementBox.tsx       画布上的单个元素框（拖动、四角缩放、右键菜单载体）
    ColorPalette.tsx     调色板（色块 + 添加按钮 + 弹出编辑 popover，portal 到 body）
    ColorPicker.tsx      取色器（SV 平面 + 色相条 + RGB/Hex 输入 + 预设色）
  services/
    PromptRefiner.ts     两个 LLM 调用：refine（生成 prompt）、resolveContradictionInBBox（改写 desc）
    IdeogramPrompt.ts    normalizePromptForIdeogram：发送/保存前规范化 JSON prompt
    designStore.ts       localStorage 设计持久化（{prompt, images} 框架）
    color.ts             hex/RGB/HSV 互转与 clamp 工具
  test/services/         jest 单测（PromptRefiner.spec.ts、IdeogramPrompt.spec.ts）
public/
  system_prompt.txt                       生成 JSON prompt 的 LLM 系统提示词（完整契约）
  system_prompt_rewrite_adapt_bbox.txt    bbox 改写 LLM 的系统提示词（只修 desc 与 bbox 矛盾）
```

外部依赖（硬编码）：
- LLM：`http://192.168.10.4:8000/v1/chat/completions`（OpenAI 兼容，模型 `nvidia/Gemma-4-26B-A4B-NVFP4`，temperature 1.0）。
- 图片生成：`http://127.0.0.1:8000/v1/ideogram-v4/generate`（本地 Ideogram 兼容服务；`Api-Key` 头留空时不发）。

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
- 空元素判定 `isEmptyElement`：text 无 `text`、或 obj 无 `desc`。

### Design（designStore.ts）
保存的设计 = `{ id, prompt: RefinedPrompt, images: string[], size: {width, height}, updatedAt }`，存于 `localStorage['drawboard.designs']`，按 `updatedAt` 倒序。`size` 无法从 prompt 恢复所以单独存；`id` 用于重复保存时 upsert 同一条记录。

## 页面与导航

`index.tsx`（默认页）⇄ `design.tsx`。
- 首页「开始设计」→ `router.push('/design', { promptData, size })`。
- 首页点最近设计卡片 → 带 `promptData / size / images / id` 四个参数重开设计（恢复画布尺寸、图片历史，显示最新一张）。
- 代码中无显式返回按钮，返回用浏览器/路由后退。

## index.tsx（首页）

左右两栏（1/3 + 2/3）：

**左栏「最近的设计」**：`loadDesigns()` 读 localStorage，每条卡片显示最新生成图缩略图（无图则不显示）+ `high_level_description`（最多 3 行）。为空时显示占位文案。

**右栏**（自上而下）：
1. 标题「Enter the description of your dreamed image」。
2. 长宽比横向列表：`4:3, 3:4, 16:9, 16:10, 9:16, 10:16, 1:1, custom`。
   - 选非 custom 比例时：以 1024 为基准算出默认 W/H；随后在 W 或 H 输入数字，另一边按比例自动联动（取整）。
   - 选 custom 后 W/H 互不联动，长宽比取 `${W}:${H}`。
3. 多行 prompt 输入框（占位符 "a golden retriever on a skateboard"），占满剩余空间。
4. 「开始设计」按钮：prompt 非空 → `refine(system_prompt.txt, prompt, ratio)` 得到 JSON prompt 字符串 → 跳 design 页。失败弹 Alert。

## design.tsx（设计页）

### 初始化
- `designId`：带 `id` 参数时复用（重开已保存设计），否则现场生成。
- 解析 `promptData` → `refinedData`；`high_level_description` 作为标题；`style_description` 各字段 → 独立 UI 状态（aesthetics/lighting/medium/artStyle/photo/palette）；`size` 参数 → 画布逻辑尺寸；`images` 参数 → 图片历史，`viewIndex` 指向最新一张。

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
- 画布区 `onLayout` 测得可用尺寸后，`scale = min(可用宽/逻辑宽, 可用高/逻辑高)`，画布显示尺寸 = 逻辑尺寸 × scale（保持长宽比）。
- 背景图 = 历史中当前选中的那张（默认最新），`resizeMode=cover` 铺满画布。
- `refinedData` 不存在时显示占位文字 "Canvas Area"。

### 元素框（ElementBox）
每个有 `bbox` 的元素渲染为蓝色虚线框，绝对定位于画布（归一化 bbox × 显示尺寸换算像素）：
- 左上角图标：text 元素橙色「T」，obj 元素蓝色图片图标；框内显示 `text`（text 元素）或 `desc`（obj 元素）。
- **拖动移动**：框内部（四边内缩 `moveInset = min(14, min(w,h)/4)`）为移动热区，PanResponder 位移 >3px 生效；手势开始时记录 base bbox，实时增量 = 像素位移 ÷ 显示尺寸 × 1000，clamp 到画布内并取整后写回 `refinedData`。
- **四角缩放**：四角 handle（14px，hitSlop 10）为子级手势，天然赢过移动热区；只拉伸被抓角落点/边，clamp 到画布与最小尺寸 `MIN_ELEMENT_SIZE = 20`（0–1000 单位），取整写回。
- 悬停：白底高亮；悬停 text 元素时显示黑色 tooltip（展示 `desc`，优先在框上方，空间不足翻到下方，水平钳制在画布内）。
- **右键菜单**（RN-web 映射 DOM contextmenu）：`Edit description`（所有元素）/ `Edit text`（仅 text）/ 分隔线 / `Delete`。菜单定位钳制在视口内；点任意处（透明全屏遮罩）关闭。
- 编辑对话框：多行输入，聚焦全选；内容为空时 Save 禁用；保存写回对应字段（空内容不覆盖）。
- 删除：从 `elements` 数组中移除。

### 创建工具（左侧工具栏）
两个可切换工具（再点一次取消）：
- **添加文字**（T 图标）、**添加对象**（图片图标）。
- 工具激活时：画布光标变十字，元素层 `pointerEvents='none'`（让拖拽落到画布）；在画布上按下拖动绘制虚线预览矩形（window 级 pointermove 跟踪，指针移出画布也跟随），松开时：
  - 拖动不足 `MIN_CREATE_DRAG_PX = 12`px 视为点击，不创建；
  - 像素矩形 → 归一化 0–1000 bbox（取整、clamp），宽或高不足 `MIN_ELEMENT_SIZE` 时扩展到最小尺寸；
  - 新元素 `desc`/`text` 为空，出现在画布上，需右键填写；创建后工具自动关闭。
- `Esc` 取消激活工具（并取消进行中的绘制）。

### 生成（Generate）
1. **空元素校验**：任一元素为空（text 无 text / obj 无 desc）→ 阻止生成，显示错误「Element N is empty — right-click it on the canvas to edit its text/description」，并对空元素红框闪烁（3 个亮灭周期后常亮，直到修复）。
2. **bbox 改写（按需）**：仅当用户移动/缩放过元素框时才执行（`bboxEditedRef` 标记：拖动/缩放后 clamp 结果与手势起点 bbox 不同才置位；加载 promptData 时复位；重写合并成功后复位，未再编辑则后续生成继续跳过；生成进行中若又拖了框会重新置位）。未编辑过画布时直接跳过这次 LLM 调用。执行时读 `system_prompt_rewrite_adapt_bbox.txt`，把当前 `refinedData` JSON 发给 `resolveContradictionInBBox`，LLM 只改写各元素 `desc` 中与用户移动/缩放后 bbox 矛盾的位置描述，其余字段保持不变。
   重置时机刻意放在**合并成功之后**：重写调用失败或返回非法 JSON 时保留标记，下次 Generate 自动重试；重写成功但生成 API 失败也不需重写（desc 已与当前 bbox 一致且已写回 `refinedData`）。
3. **合并**：只把改写回来的 `desc` 逐个元素合并回本地 caption（要求 index 对应、type 相同、desc 为非空字符串，否则保留原元素）——画布 bbox 永远是唯一事实来源。
4. **规范化**：`normalizePromptForIdeogram`（见 services）后 `JSON.stringify` 为 `json_prompt` 字符串字段，连同 `response_type=url`、`resolution=WxH` POST 到 `/v1/ideogram-v4/generate`。
5. **结果**：取 `data[0].url` 追加进 `images` 并把画布切到新图；失败显示错误文字；生成中按钮显示 ActivityIndicator 并禁用。

### 保存（Save）
`normalizePromptForIdeogram(refinedData)` + 当前 `images` + 画布尺寸 + `Date.now()` → `upsertDesign` 写 localStorage；按钮旁显示「Saved ✓」1.8s。Save/Generate 在 `refinedData` 缺失时禁用。

### 图片历史条
有生成图时画布下方显示「Generated (N)」缩略图横条：点击缩略图在画布查看该图，当前查看的缩略图蓝边高亮。

## services 逻辑

### PromptRefiner.ts
两个 OpenAI 兼容 chat/completions 调用（同一 LLM 端点，失败时把状态码+响应体抛成错误）：
- `refine(system_prompt, prompt, aspectRatio)`：用户消息 = `TARGET IMAGE ASPECT RATIO: {ratio} (width:height).\nUser idea: {prompt}`。
- `resolveContradictionInBBox(system_prompt, prompt)`：用户消息就是 JSON caption 原文（不加包装）。
- 返回 `choices[0].message.content`（字符串），由调用方解析/防御。

### system_prompt.txt（生成契约，摘要）
单行 minified JSON、三个顶层 key 固定顺序；HLD ≤50 词；`style_description` 各字段语义（photo 仅当 medium 为 photograph、art_style 仅当非 photograph）；元素规则（单一主体=单一元素、desc 30–60 词、禁阴影/镜头语言/比喻词）；background 只放场景外壳（天空/地面/远景恒归 background，可放行的双提及例外）；bbox 0–1000 左上原点、`[y1,x1,y2,x2]`；specificity（禁止 hedging、二选一措辞）；文本元素穷举（用户引号文字、场景内可读文字、数字、品牌文字）；pop-culture 实体必须点名；透明背景时 `background` 必须为字面量 `transparent background`。

### system_prompt_rewrite_adapt_bbox.txt
保持输入结构不变，只按用户改后的 bbox 修正各元素 `desc` 的位置性描述，其余字段原样保留。

### IdeogramPrompt.ts（normalizePromptForIdeogram）
发送/保存前对 `style_description` 做规范化（不修改入参，返回新对象）：
- `photo` / `art_style` **有且仅留其一**：
  - 两者都有 → 按 `medium` 裁决：medium 含 "photo" 留 `photo`，否则留 `art_style`；
  - 只有其一 → 原样保留；
  - 都没有 → 按 medium 补中性默认值（photograph → `photo: "35mm, natural light"`；其他 → `art_style = medium` 或 `"digital illustration"`）。
- key 按文档顺序重建：photo 模式 `aesthetics, lighting, photo, medium, color_palette`；非 photo 模式 `aesthetics, lighting, medium, art_style, color_palette`；空字符串字段省略。
- `color_palette`：过滤非法 hex、转大写、截断到 16 个。

### designStore.ts
localStorage（key `drawboard.designs`）的 `loadDesigns`（倒序、解析失败返回空数组）/ `getDesign` / `upsertDesign`（按 id 插入或替换，倒序持久化并返回最新列表）。

### color.ts
无依赖的颜色工具：`hexToRgb`（#RGB/#RRGGBB，无 # 亦可）、`rgbToHex`（大写）、`rgbToHsv` / `hsvToRgb`、`clamp01` / `clamp255`、`rgbToCss`。

## 测试

- `npm test`（jest + jest-expo preset，`src/**` 下 `*.spec.ts`）。
- `PromptRefiner.spec.ts`：mock `fetch`，验证 refine / resolveContradictionInBBox 的请求体（system prompt、caption 原文）、透传返回、错误状态与非预期结构的抛错。
- `IdeogramPrompt.spec.ts`：纯函数单测——photo/art_style 互斥裁决、缺省补全、key 顺序、调色板大写/过滤/截断 16、入参不可变。
- UI 布局类改动用 Playwright 对着运行中的 `expo start --web`（默认 8081 端口）做 e2e 验证（截图 + 几何断言），验证脚本为一次性临时文件，不入库。
