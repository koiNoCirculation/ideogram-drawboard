# 2026-08-26 设计页底部四个按钮恒等宽

---Start of comprehensive description---
design.tsx 底部一行四个按钮（Save / Generate / Download Image / Show Prompt）之前是 `minWidth + paddingHorizontal` 的内容自适应宽度，标签长短不同（如英文 "Save" vs "Download Image"、中文「保存设计」vs「显示 Prompt」）以及 Save 独有的 1px 边框导致宽度不一致。要求调整显示方式，让四个按钮**无论什么情况（任意语言、任意标签长度、生成/下载中的 spinner 状态）宽度都相等**（高度也一致）。

实现（`src/app/design/designStyles.ts`，组件结构不变）：
- 行 `generateRow`：`width:100% + maxWidth:720`——宽屏时行宽固定 720 并由父容器 `canvasContainer` 的 `alignItems:center` 居中；窄屏时占满可用宽度，按钮等比收窄。
- 每个按钮：`flex:1`（剩余空间均分 → 恒等宽）+ `height:40`（固定高度，spinner 替换文字时高度不变）+ `boxSizing:'border-box'`。
- **四个按钮都带 1px 边框**：Chrome flexbox 对 `flex-basis:0%` 的尺寸计算会把 border 加回外层尺寸（即使 border-box，纯 CSS 可复现：带边框项 +2px），边框不一致就不等宽。蓝底按钮（Generate/Download/Show Prompt）用同色 `#007AFF` 边框不可见，禁用态边框随背景改 `#B0D4FF`；Save 保持原有可见蓝边框。12px 间距沿用原 margin。

---Start of test cases---
- en-US 设计页：四个按钮宽度相等（<1px 误差）、高度相等。
- zh-CN 设计页（标签长短差异最大）：四个按钮宽度相等。
- 其余行为不变：按钮文案、testID、禁用态、Saved ✓ 提示、错误行（Saved ✓ 出现时四按钮仍彼此等宽）。

---Start of test logic---
- e2e `scripts/e2e_regression.cjs` S9 开头：对四个 testID 取 boundingBox，断言全部可见、宽度互差 <1px、高度互差 <1px（153→156 checks）。
- e2e `scripts/e2e_i18n.cjs` S3（zh 设计页）：同法断言 zh 标签下四按钮等宽（58→59 checks）。
- 验证：npm test 51/51；e2e_i18n 59/59；e2e_regression 156/156；e2e_image_store 17/17；tsc 干净（src 0 错误）。
