# cf-worker 分支：Official 模式直接请求 /v1/ideogram-v4/generate（对齐独立 cf-worker 项目）

## 需求（综合描述）

ideogram 4 官方 API（api.ideogram.ai）在浏览器里调用有跨域问题。解决方案是独立的 **cf-worker 项目**（Cloudflare Worker，本地目录 IdeogramWorker，pywrangler）：代理 `/v1/ideogram-v4/generate`（转发 Api-Key/Content-Type/原始 body 到上游，响应里 `data[].url` 重写为 `/v1/ideogram-v4/image_proxy?url=…` 让生成图也走 worker 回传，解决图片跨域），并处理 CORS 预检。

本仓库（DrawBoard）开 `cf-worker` 分支做配套修改，使 app 侧与 cf-worker 对齐：

- 两种 provider 都直接请求 **`{base}/v1/ideogram-v4/generate`**；Official 直接请求
  **裸路径** `/v1/ideogram-v4/generate`，**无任何 host 前缀**（`getImageBase`：
  Official → 空串、Custom → `imageEndpoint` 去尾斜杠；`getImageUrl`：Official →
  裸路径、Custom → 端点 + 同一路径）——用户明确要求：官方请求直连 `/v1/ideogram-v4/generate`，
  设置里的 URL **不可编辑、写死**（Official 模式设置界面显示写死的
  `/v1/ideogram-v4/generate` 只读，无前缀）。
- 设置对话框的 **Image generation endpoint 文本框仅 Custom 可编辑**（保持原语义：
  Official 只读显示硬编码官方 base，存储的端点值不被覆盖）；cf-worker 的部署地址作为
  **Custom** 端点使用。该输入框新增 testID `settings-image-endpoint`。
- 缺失校验不变：Official 要求 secret key、Custom 要求 endpoint；`Api-Key` 头仅在密钥
  非空时发送（经 worker 透传给上游）。
- worker 项目在本仓库之外（用户明确说明），本分支不含 worker 代码。
- worker 把生成响应里 `data[].url` 重写为 **worker 自身的根相对路径**
  `/v1/ideogram-v4/image_proxy?url=…`；浏览器会把根相对路径解析到 app 自己的
  origin（静态托管源）→ 抓图 404。app 侧配套：`resolveGeneratedImageUrl(url,
  getImageBase(settings))`（imageStore.ts）——相对/根相对 url 拼图像服务端点
  base，绝对 http(s)/data: 透传；useGeneration 在 saveGeneratedImage 前调用。
  settings.ts 拆出 `getImageBase`（endpoint 去尾斜杠，Official 空端点回退官方 base）。

## 追加需求：官方 API 的 `{"error": "…"}` 错误体原样显示

ideogram 官方 API 失败时可能返回 `{"error": "Prompt provided failed safety check due to the inclusion of prohibited content."}` 这类错误体。要求：浮窗显示的文案**替换为返回体 `error` 字段的内容**（原样、不翻译）。

- `HttpError` 增加可选 `detail`（上游自带的人类可读错误文案）；`requestErrorMessage`
  遇到带 `detail` 的 `HttpError` 时**直接返回 `detail`**（跳过 i18n 通用文案、
  不带状态码）。
- `upstreamErrorMessage(body)`（requestError.ts）：仅当响应体是 JSON 且 `error`
  为**非空字符串**时返回（trim）；空串/纯空白/非字符串/对象形态
  （OpenAI 式 `{"error": {"message"}}`）/非 JSON → `null`（保留按状态码的通用文案）。
- 提取点仅在**生成请求**（useGeneration 的 POST 非 2xx 分支：`response.text()`
  → `upstreamErrorMessage` → `HttpError.detail`）；LLM/下载等其他路径行为不变。

## 测试用例

- Official → 请求发往**裸路径** `/v1/ideogram-v4/generate`（**无任何 host 前缀**，
  解析到应用自身源；存储的端点值被忽略）。
- Custom + worker 端点 → 请求发往 `<worker>/v1/ideogram-v4/generate`，`Api-Key` 头、
  multipart 体原样；返回 200 图片可持久化并渲染。
- Custom 端点带尾斜杠 → 规范化后拼接路径。
- worker 返回 401 → 红浮窗 "Settings problem" + `status 401`，不泄漏上游响应体。
- worker 返回 422 + `{"error": "Prompt provided failed safety check …"}`（字符串形态）
  → 红浮窗**原样显示该 error 内容**（无 "Settings problem"、无状态码字样、无画布图）；
  对象形态 `{"error": {"message"}}` 仍走通用文案（不提取）。
- worker 回根相对 `image_proxy` URL → 图片从 **worker origin** 抓取（不到 app
  origin），持久化并渲染。
- 设置对话框：Official 显示**裸路径** `/v1/ideogram-v4/generate`（无前缀）且**只读**
  （readonly）、Custom 可编辑、来回切换存储值不被覆盖；Custom 填 worker URL 保存后
  localStorage 持久化。

## 测试逻辑

- 单测：`settings.spec.ts` 的 `getImageUrl`/`getImageBase` 用例覆盖 Official
  硬编码（忽略存储端点）/Custom 尾斜杠；`imageStore.spec.ts` 新增
  `resolveGeneratedImageUrl`（绝对/data 透传、根相对 image_proxy 与相对路径拼
  端点 base）。
- e2e：`scripts/e2e_cf_worker.cjs` 对运行中的 `expo start --web`（:8081）——
  S1 设置对话框（Official 只读硬编码/Custom 可编辑/切换不覆盖/保存持久化）；
  S2 用 `page.route` 模拟 worker（`http://cf-worker.mock:8443`），handoff 种子
  设计页点 Generate，断言请求 URL/Api-Key/multipart/图片渲染；S3 Official 用
  `page.route` 拦应用源的 `/v1/ideogram-v4/generate` 路径断言无前缀直连
  （存储端点被忽略）；
  S4 mock worker 回 401 断言红浮窗文案；S5 worker 回根相对 image_proxy URL
  断言图片从 worker origin 抓取且不到 app origin；S6 worker 回 422 + 官方
  `{"error": "…"}` 体断言浮窗原样显示该文案（替换通用文案、无状态码字样）。
- 单测（追加需求）：`requestError.spec.ts` 的 `upstreamErrorMessage`（字符串提取
  + trim；空串/纯空白/非字符串/对象形态/非 JSON/空体 → `null`）、`HttpError.detail`
  保留、带 detail 的 `requestErrorMessage` 原样返回（零 i18n 查询）。
- 回归：`npm test` 89/89；`node scripts/e2e_cf_worker.cjs` 24/24；
  `node scripts/e2e_regression.cjs` 165/165；tsc 无 src 错误。

## 备注

- Playwright `page.route` 拦截会吞掉 CORS 预检 OPTIONS（对真实服务器会发），故 e2e 不
  断言预检；worker 的 OPTIONS/转发/图片代理行为在 cf-worker 项目自己的测试里覆盖。
- RN-web `editable={false}` 渲染为 `readonly`（回归脚本用 `el.readOnly || el.disabled` 判定）。
