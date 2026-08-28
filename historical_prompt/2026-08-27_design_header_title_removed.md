# 2026-08-27 移除设计页 Stack 页头的 "design" 标题

---Start of comprehensive description---
design 界面（/design）的 Stack 页头里，自定义返回按钮（HeaderBackButton）右侧显示着路由默认标题 "design"。该标题与页面正文自带的可编辑标题（`title` 状态，占位符 "Untitled Design"）重复且不可用，移除掉。

实现：`src/app/design.tsx` 的 `Stack.Screen options` 增加 `title: ''`（`designScreenOptions = { title: '', headerLeft: () => <HeaderBackButton /> }`）。expo-router 的 Stack 页头标题取自 options.title，置空后页头只剩返回按钮，页头本身保留（headerShown 仍为 true，返回按钮依赖它）。页面正文的可编辑标题不受影响。

---Start of test cases---
- 打开 /design（任意 id 或裸访问），Stack 页头不应出现 "design" 标题文本
- 页头返回按钮（back-button）仍然存在且位置不变（返回行为不变：来自首页→原生后退；裸访问→replace 首页）
- 页面正文的可编辑标题（占位符 "Untitled Design" / 已存设计的 high_level_description）正常显示
- 现有 e2e 全量回归不受影响（无脚本断言页头 "design" 标题）

---Start of test logic---
1. 启动 `expo start --web`（8081），Playwright 打开 `http://localhost:8081/design?id=hdr-test`，等页面挂载。
2. 断言：`getByText('design', { exact: true })` 计数为 0（正文标题占位符是 "Untitled Design"，大小写精确匹配不会误命中）；back-button testID 仍存在。截图 temp/shot_header_no_title.png。
3. 回归：`node scripts/e2e_regression.cjs`（165 检查，覆盖设计页页头/返回/标题恢复）；停 dev server 释放 8081 后 `node scripts/e2e_github_pages.cjs`（17 检查，深链打开设计页断言正文标题=HLD）。
