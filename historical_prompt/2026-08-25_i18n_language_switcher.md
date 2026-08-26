# i18n（界面国际化：en-US / zh-CN）

---Start of comprehensive description---
所有的界面元素，除了除数据和元素展示外全部应用i18n。
在所有页面右上角的设置图标左边插入一个i18n的选择，默认显示美国国旗emoji(en-US), 可选中国(zh-CN)
映射:
最近的设计: Recent Designs
描述你想要的图片:Enter the description of your dreamed image
宽度: Width(W)
高度: Height(H)
开始设计: Start Design
美学关键字:Aesthetics
光照关键字: Lighting
照片关键字: Photo
载体关键字: Medium
艺术风格关键字: ArtStyle
调色盘: Palette
背景: Background
已生成: Generated
网格显示: Show grid
元素显示: Show elements
保存设计: Save
生成图片: Generate
下载图片: Download Image

实现：`src/i18n/`（translations.ts 词表 + I18nContext.tsx provider/hook，`t(key, vars)`
做 `{name}` 占位替换），根布局 `_layout.tsx` 包 `I18nProvider`；选择项持久化到
`localStorage['drawboard.locale']`（默认 en-US，非法值回退默认）。`LanguageSwitcher`
（国旗 emoji 按钮 + 下拉菜单，testID `lang-switcher` / `lang-option-<locale>`）插在
两页设置齿轮左侧（首页绝对定位 right:72；设计页 header 内流式）。除数据与元素展示
（desc/text/caption/比例/字体名/厂商名）外，全部界面文案（含错误提示、Alert、
设置对话框、调色盘、右键菜单、工具提示）走 `t()`。

两个 e2e 阶段发现的坑（已修复）：
1. 下拉菜单不 portal 时被屏幕内容盖住（fixed 元素困在屏幕的 stacking context 内）——
   遮罩 + 菜单 `createPortal` 到 `document.body`（同 ColorPalette popover 模式）。
2. Playwright `addInitScript` 在页面 JS 上下文执行：闭包引用 e2e 脚本的模块级变量
   （BASE_PROMPT）会 ReferenceError 且静默失败，且 addInitScript 只接受单个 arg——
   handoff 种子把 `{id, prompt}` 作为单一对象参数传入。
---Start of test cases---
- en-US（默认）：首页/设计页全部界面文案为英文，国旗显示 🇺🇸
- zh-CN：首页/设计页全部界面文案为中文，国旗显示 🇨🇳
- 选择持久化：刷新后保持所选语言；切换回 en-US 恢复英文
- 数据不翻译：元素 desc/text、生成图 caption 在两种语言下均保持原文
---Start of test logic---
1. 单测 `src/test/i18n/i18n.spec.ts`：默认 en-US、合法/非法存储值回退、persistLocale
   写回、题目要求的全部英中映射、占位变量替换、未知 key 透传、双语言表 key 对齐。
2. e2e `scripts/e2e_i18n.cjs`（Playwright 对 :8081）：
   - S1 首页默认 en-US：各英文文案计数、开关在齿轮左侧（几何断言）、下拉含两个选项；
   - S2 设计页默认 en-US：元数据栏七标签、网格/元素开关、Save/Generate/Download、
     标题占位、右键菜单四项英文、元素 desc 未翻译；
   - S3 切 zh-CN：国旗变 🇨🇳、七标签中文、开关/三按钮中文、右键菜单中文、desc/text
     未翻译，截图 temp/shot_i18n_zh_design.png；
   - S4 刷新后仍为 zh-CN（含 localStorage 断言），首页中文文案，截图 temp/shot_i18n_zh_home.png；
   - S5 切回 en-US：恢复英文 + localStorage 断言。
3. 回归：`scripts/e2e_regression.cjs` 更新默认英文文案（Start Design /
   No saved designs yet）后全量跑通；`npm test` 全部单测通过。
