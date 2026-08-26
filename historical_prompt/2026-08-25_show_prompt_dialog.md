# Show Prompt 对话框（2026-08-25）

---Start of comprehensive description---
需要在 Download Image 右面增加一个显示 Prompt 的按钮，点击以后弹出对话框，
对话框里面有 2 个文本框，左边是原始 prompt，如果没有原始 prompt 记录就显示
为空，右边是增强后的结构化 json prompt。
---Start of test cases---
- 已存设计有 rawPrompt：左栏原样显示原始 prompt，右栏为可解析的结构化 JSON
- 旧格式已存设计（无 rawPrompt）：左栏为空，右栏仍显示结构化 JSON
- 新设计（handoff，首页「开始设计」路径）：左栏显示发起时输入的原始 prompt
- 两栏均为只读；X/遮罩可关闭
- 无 refinedData（裸 /design）时按钮禁用
---Start of test logic---
从首页进入，点击任意历史设计，或者点击开始设计重新创建一个设计，之后点击
显示 Prompt，出现新的对话框，左边原样显示之前生成时用的完整的 prompt，
右边原样显示增强后的 prompt。

## 实现要点

- **原始 prompt 的持久化**（原先未记录）：
  - `DesignHandoff` / `Design` 各加 `rawPrompt?: string`（designStore.ts）；
  - 首页「开始设计」`useStartDesign` 把用户输入原文随 handoff 暂存；
  - 设计页加载按 handoff 优先 / 否则读 store 恢复；Save 时随 `upsertDesign`
    持久化（useGeneration 新增 rawPrompt 参数）；旧设计无该字段 → 左栏为空。
- **UI**：`GenerateRow` 在 Download Image 右侧新增 Show Prompt 按钮
  （`show-prompt-button`，12px 间距，dataMissing 时禁用）；新组件
  `components/design/PromptDialog.tsx`（模态：fixed 遮罩 + 920px 卡片，
  高度 72% 定高使两 flex 栏可解析高度；两栏 `editable={false}` 多行
  TextInput，testID `prompt-original` / `prompt-enhanced`；右栏 =
  `JSON.stringify(refinedData, null, 2)`，含画布编辑后的最新状态）。
- **i18n**：新增 `showPrompt`（Show Prompt / 显示 Prompt）、
  `originalPrompt`（Original Prompt / 原始 Prompt）、
  `enhancedPrompt`（Structured Prompt / 结构化 Prompt）。

## 踩坑

1. `maxHeight: '62vh'` 不是 RN 的合法 `DimensionValue`（仅 number | 'auto' |
   `${number}%`），且它会破坏整个 `StyleSheet.create` 的泛型推断——所有样式
   键退化为 `ViewStyle | TextStyle | ImageStyle` 联合，全文件 13 个 tsc
   报错。改为卡片定高 `height: '72%'` + 栏 `flex: 1` 解决。
2. RN-web 的（只读）`TextInput` 渲染成 `<textarea>`，内容在 `value` 属性而
   非 DOM 文本——e2e 断言要读 `el.value`，`innerText` 恒为空。
3. RN-web 禁用态 `TouchableOpacity` 渲染 `aria-disabled="true"`（无
   `disabled` 属性）——e2e 用 `getAttribute('aria-disabled')` 断言。

## 验证

`npm test` 41/41（designStore rawPrompt 2 例 + i18n 映射 6 断言）；
`scripts/e2e_show_prompt.cjs` 11/11（截图 temp/shot_show_prompt*.png）；
`scripts/e2e_i18n.cjs` 56/56；`scripts/e2e_regression.cjs` 153/153；tsc 干净；
design.tsx 402→400 行以内（对话框渲染压为单行 JSX）。
