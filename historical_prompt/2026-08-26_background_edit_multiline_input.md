# 2026-08-26 支持编辑 background + 首页输入框多行自适应

---Start of comprehensive description---
支持编辑background, 点击background弹出编辑框，在编辑框中编辑完保存。
首页的输入框支持换行，以及输入超出输入框长度后自动扩展输入框的高度。

---Start of test cases---
1. 设计页点击 background 展示块 → 弹出编辑框，预填当前 background 文本。
2. 编辑框中修改后保存 → background 更新（页面标签显示新文本）、记一步撤销（Undo 恢复旧文本）、Save 设计后持久化进 localStorage。
3. 编辑框内容为空/纯空白 → Save 禁用；Cancel/点遮罩关闭 → 不改数据。
4. 首页 prompt 输入框支持换行（Enter 插入 \n，渲染为 textarea）。
5. 单行时输入条保持 56px；多行文本使输入条高度自动增长；超长文本封顶 200px 后在输入框内滚动；文本减少/清空后高度缩回 56px。

---Start of test logic---
1. 背景编辑：新增 `components/design/BackgroundEditor.tsx`——background 标签块改为 TouchableOpacity（testID `edit-background`），点击打开对话框（复用 designStyles 的 dialog 样式，标题 i18n key `editBackground`，多行输入预填+聚焦全选，空内容 Save 禁用）；保存回调在 design.tsx：`history.recordAction()` + 写回 `refinedData.compositional_deconstruction.background`。对话框 backdrop `createPortal` 到 body——组件在 canvas 区子树内，stacking context 会把 fixed 遮罩压在 Toolbar 下（e2e 点 (5,5) 遮罩实测被 Toolbar 吞掉才暴露，portal 后修复）。
2. 多行输入：index.tsx 的 prompt TextInput 加 `multiline`；输入条高度 state（[56, 200]）；测量踩坑：textarea 的 scrollHeight 在 flex:1 下随输入条盒子变高（反馈循环，空态测出 69px），`height:auto` 又受 rows=2 属性约束——最终在 `useLayoutEffect` 里把 textarea 临时压到 `height:1px` 读 scrollHeight（= 纯文本内容高度）再复原。超长时输入框 `overflow:scroll` 内部滚动；展开时文本顶部对齐 + 8px 上内边距。
3. 兼容性：multiline 后 prompt-input 渲染为 textarea，e2e 选择器 `input[data-testid="prompt-input"]` 全部改为元素无关的 `[data-testid="prompt-input"]`（i18n/start_design_error/regression/prompt_image 四套脚本）。
4. e2e：新增 `scripts/e2e_background_edit.cjs`（22 断言，seed 带 background 的设计直开 /design?id）与 `scripts/e2e_multiline_input.cjs`（11 断言）；`i18n.spec.ts` 增 `editBackground` 双语映射。
5. 回归：`npm test` 全绿 + `npx tsc --noEmit` 无错 + 全部 e2e 套件全绿。
