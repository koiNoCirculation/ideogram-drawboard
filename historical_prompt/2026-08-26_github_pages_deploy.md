# 2026-08-26 部署到 GitHub Pages（project page，子路径 + 404 深链重定向）

---Start of comprehensive description---
需要将应用部署到 GitHub Pages，参考 `https://github.com/rafgraph/spa-github-pages` 的实现。
以 **project page**（`https://<user>.github.io/<repo>/`）部署，应用挂在 `/<repo>/` 子路径下。所有实现改动在**分支 `github-pages`**（自 master 新建）上进行，不动 master；Pages 发布目标分支用 `gh-pages`（避免 workflow 覆盖源分支）。

SPA 部署到 GH Pages（纯静态服务器）的两个缺口及方案：
1. **子路径 base**：官方 `experiments.baseUrl`——`app.config.js`（函数式动态配置）设为 `process.env.EXPO_BASE_URL || ''`，不设时本地开发逐字节不变。导出链路：Expo config → Metro baseUrl → babel-preset-expo 内联 `process.env.EXPO_BASE_URL` 进 bundle（`NODE_ENV=test` 跳过内联，jest 读真实环境）→ 导出 HTML 资产 link 加前缀 + 运行时 router `stripBaseUrl` 剥前缀（仅 `NODE_ENV !== 'development'` 生效）。
2. **深链 404**：直接加载/刷新 `/repo/design?id=…` 无对应文件 → 404。`public/404.html`（原样搬运 spa-github-pages MIT 重定向脚本，**`pathSegmentsToKeep = 1`** 保留 `/repo` 段）把 path+query 改写成纯 query 加载 index.html；导出后由 `scripts/inject_github_pages_bootstrap.cjs` 向 `dist/index.html` 的 `<head>` 注入配套 bootstrap（MARKER 幂等；body 的 app bundle 是 `<script defer>`，head 内联脚本先执行），`history.replaceState` 还原真实路径。
3. **Jekyll**：`public/.nojekyll`（导出产物含 `_expo/` 等 `_` 前缀文件）。
4. **SPA 输出**：`web.output` 须为 `"single"`（模板默认 `"static"` 会逐路由预渲染 HTML；404 深链链最终总伺服 index.html=预渲染首页，客户端 router 却渲染实际路由 → React #418 hydration mismatch 白屏）。

实现：
- `app.config.js`（新）：`experiments.baseUrl = process.env.EXPO_BASE_URL || ''`。
- `app.json`：`web.output` `"static"` → `"single"`（SPA 单 index.html、无预渲染，见缺口 4）。
- `public/404.html`（新）+ `public/.nojekyll`（新，空文件）。
- `scripts/inject_github_pages_bootstrap.cjs`（新）：`injectBootstrap(html)` 幂等注入 + CLI 入口（`node scripts/inject_github_pages_bootstrap.cjs dist`）。
- `src/app/services/publicAsset.ts`（新）：`getPublicAssetUrl(path)` = `process.env.EXPO_BASE_URL + path`（构建时内联，与 router 同源）。
- 应用内根相对 fetch 全部改经 `getPublicAssetUrl`：`system_prompt.txt`（useStartDesign）、`system_prompt_rewrite_adapt_bbox.txt`（useGeneration）、`example_collection/example.json`（exampleCollection 模块常量）+ 示例 png（根相对 url 加前缀、绝对 http(s) 透传）。
- `.gitignore` 增 `dist/`。
- `.github/workflows/deploy.yml`（新）：push 到 `master`/`github-pages` + workflow_dispatch；`EXPO_BASE_URL=/${{ github.repository_name }}` 导出 → 注入 → `peaceiris/actions-gh-pages` 发布 `dist/` 到 `gh-pages` 分支（clean、contents:write、concurrency 取消在途部署）。Pages 源需手动设为 branch `gh-pages` / (root)，需公开仓库。

---Start of test cases---
- `getPublicAssetUrl`：`EXPO_BASE_URL` 未设 → 路径原样；设 `/DrawBoard` → 加前缀。
- 导出（`EXPO_BASE_URL=/DrawBoard`）：产出 SPA 形态（`index.html` 在、无 per-route SSG 文件）；index.html 注入 bootstrap；dist 含 404.html（`pathSegmentsToKeep = 1`）与 .nojekyll。
- 模拟 GH Pages 静态服务器（dist 挂 `/DrawBoard/`、缺失路径 status 404 回 404.html）下：
  - 首页 `/DrawBoard/` 渲染，全部 script src 带 `/DrawBoard/` 前缀，示例墙 13 个 tile 全量出图（带前缀的 example.json/png fetch 生效，IDB data URI 渲染）；
  - 深链 `/DrawBoard/design?id=<seed>` → 404 重写链 → URL 还原、设计页打开（标题=HLD、元素渲染）、无 pageerror；
  - 未知路径 → status 404 → URL 还原、无 pageerror；
  - 注入脚本幂等（二次注入 changed=false）。
- 回归：本地开发（无 base）下既有 10 套 e2e + npm test 全绿。

---Start of test logic---
- 单测 `src/test/services/publicAsset.spec.ts`（2 用例）：未设/设置 `process.env.EXPO_BASE_URL` 的返回值，用例后恢复原值。
- `npm test` 71/71（原 69 + 新 2）；`npx tsc --noEmit` 干净（过滤 git-ignored example/）。
- 新增 `scripts/e2e_github_pages.cjs`（需先停 8081 dev server——in-process Metro 导出时绑定 8081）：
  - S0 `EXPO_BASE_URL=/DrawBoard npx expo export --platform web` + 注入 bootstrap（8081 被占则报错退出；先删旧 dist）；断言 SPA 输出（index.html 在、design.html 不存在）。
  - S4 静态文件：dist/404.html 含 `pathSegmentsToKeep = 1`、dist/.nojekyll 存在、注入幂等。
  - 进程内 GH-Pages 模拟服务器 :8082（目录 → index.html、缺失 → 404.html + status 404、`/DrawBoard` 301 → `/DrawBoard/`）。
  - S1 首页：script src 全部 `/DrawBoard/` 前缀；waitForFunction 等 13 个 wall-tile 出齐；首图 data URI；无 pageerror；截图。
  - S2 深链：addInitScript 种子 `drawboard.designs`（**数组**形态，1:1、1 个 obj 元素）→ goto `/DrawBoard/design?id=design-ghpages-e2e` → 最终 URL 还原、标题 input 值=HLD、元素 desc 渲染、无 pageerror；截图。
  - S3 未知路径：goto `/DrawBoard/no/such/route` → 响应 status 404 → URL 还原、无 pageerror；截图。
  - 截图存 ./temp（shot_github_pages_home/deeplink/notfound.png）。
- 回归：重启 `expo start --web`（8081）后跑既有 10 套 e2e + npm test。
