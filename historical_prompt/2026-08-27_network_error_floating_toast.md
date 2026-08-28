# 2026-08-27 网络请求失败统一红浮窗（区分网络问题/配置错误）

---Start of comprehensive description---
所有的网络请求出错时都要用红色的浮窗提示，并且内容不能是类似于Failed to fetch，请使用对用户更友好的提示，能让用户感知到是网络问题还是配置错误。

覆盖的全部 fetch 站点：首页 LLM refine（含 system_prompt.txt 资产加载）、设计页 bbox 改写 LLM（含 system_prompt_rewrite_adapt_bbox.txt 资产加载）、图像生成 POST、生成图抓图持久化（saveGeneratedImage）、图片下载（downloadImage）、首页示例集 example.json 加载。

---Start of test cases---
1. LLM 端点连接拒绝（网络层）→ 红色浮窗显示 "Network problem: …"（含 "Settings" 指引），不出现 "Failed to fetch"，浮窗 5 秒自动消失，无内联红色错误行。
2. LLM 端点 HTTP 500 → 浮窗显示 "… temporarily unavailable (status 500) …"，不出现 "LLM API Error"/响应体原文。
3. LLM 端点 HTTP 401 → 浮窗显示 "Settings problem: … rejected the credentials (status 401) …"——配置问题措辞。
4. 图像生成请求 abort（网络层）→ 浮窗 "Network problem: can't reach the image generation service …"。
5. 生成图抓图非 2xx → 浮窗含 "status 500"，该图被丢弃（不进历史/IDB/已存设计），旧的 imageSaveFailed 内联文案不再出现（IDB 写入失败仍走内联 imageSaveFailed）。
6. 示例集 example.json 被阻断 → 浮窗 "示例集加载失败…"（examplesLoadFailed），墙显示 noExamples 空态，无 tile，无 pageerror。
7. 非请求失败保持原内联红行：首页缺设置（Missing settings: …）与全部 JSON 重试失败（… on every attempt）；设计页空元素、noImageUrl、rewriteNoJson 等（testID generate-error）。
8. 浮窗样式：#E53935 底、白字、视口顶部居中、pointer-events 关闭、testID error-float、5 秒自动消失（新消息重置计时）。
9. 原始浏览器/响应文字（Failed to fetch / LLM API Error (500): boom / 响应体）永不进 UI。

---Start of test logic---
1. 新增 `src/app/services/requestError.ts`：`HttpError`（非 2xx，保留 status）、`AssetLoadError`（打包资产加载失败，cause 保留原始错误）、`classifyRequestError`（401/403→auth、404→notFound、其他 4xx→rejected、5xx→server、其余→unexpected；TypeError/网络措辞消息→unreachable；SyntaxError→unexpected；非请求错误→null）、`requestErrorMessage(error, service, t)`（服务名 key + 类别 key + {service, status?} 变量）。PromptRefiner/imageDownload/saveGeneratedImage（非 2xx）/loadExampleCollection（非 2xx）抛 HttpError；两处 system prompt 资产加载捕获后抛 AssetLoadError（固定友好文案浮窗）。
2. 新增 `src/app/components/ErrorFloat.tsx`：`useErrorFloat()`（show + 5 秒自动消失）+ `ErrorFloat` 组件（portal 到 document.body、pointerEvents none、fixed top:76 居中、#E53935 底白字、testID error-float）。首页两个实例（开始设计流程 + 示例集加载，互斥流程），设计页一个实例（生成 + 下载，替换原 downloadError 内联 toast，`download-error` testID 移除、designStyles 三个 downloadError* 样式移除）。
3. `saveGeneratedImage` 返回结果 union `{ ok: true, id } | { ok: false, error }`（fetch 失败→红浮窗友好文案；IDB 失败→内联 imageSaveFailed）；`loadExampleCollection` 返回 `{ entries, error }`（集合级失败→浮窗 examplesLoadFailed + 空墙；单张图失败仍静默 imageId=null）。
4. i18n 新增 10 个 key（netServiceLlm/netServiceImage/netServiceDownload + netUnreachable/netAuth/netNotFound/netRejected/netServer/netUnexpected + examplesLoadFailed），移除 requestFailedStatus；i18n.spec.ts 增双语映射断言。GenerateRow 错误 Text 加 testID generate-error。
5. 测试：新增 requestError.spec.ts（11 用例）；imageStore.spec/exampleCollection.spec 适配新返回形状（注意 jest.resetModules 后 instanceof 须重新 require）；e2e_start_design_error 改 S1（浮窗+自动消失）/S2（500 浮窗）+ 新增 S5（401 配置措辞）；e2e_image_store 改 S4（500 浮窗、旧文案不出现）+ 新增 S8（abort→网络浮窗）；e2e_example_wall 新增 S4（block example.json→浮窗+空态）。
6. 回归：`npm test` 82/82 + `npx tsc --noEmit` src/ 无错（example/ 为 gitignored 无关目录）+ 全部 e2e 套件全绿。
