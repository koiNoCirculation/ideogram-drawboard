# 2026-08-25 设置对话框保存按钮中文应为「保存设置」

---Start of comprehensive description---
设置对话框里的保存按钮之前复用了设计页 Save 的 i18n key `save`，zh-CN 下显示为「保存设计」，语义错误。要求该按钮中文显示「保存设置」。实现：新增独立 key `saveSettings`（en "Save Settings" / zh "保存设置"），`SettingsDialog` 的保存按钮改用该 key；设计页 Save 按钮的 `save`（zh "保存设计"）保持不变。

---Start of test cases---
- en-US 下打开设置对话框，保存按钮文本为 "Save Settings"。
- zh-CN 下打开设置对话框，保存按钮文本为 "保存设置"。
- 设计页 Save 按钮不受影响（en "Save" / zh "保存设计"）。
- 双语表 key 对齐且无空值（编译期 + 单测强制）。

---Start of test logic---
- 单测 `src/test/i18n/i18n.spec.ts`：en/zh 映射断言各加一条 `saveSettings`（"Save Settings" / "保存设置"）；key 对齐用例自动覆盖新 key。
- e2e `scripts/e2e_i18n.cjs`：S1（en 首页）点齿轮打开设置对话框断言 `[data-testid="settings-save"]` 文本为 "Save Settings" 后 Cancel 关闭；S4（zh 首页）同法断言「保存设置」后「取消」关闭（check 56→58）。
- 验证：npm test 51/51；e2e_i18n 58/58；e2e_regression 153/153（仅按 testID 点击 settings-save，不依赖文本）；tsc 干净。
