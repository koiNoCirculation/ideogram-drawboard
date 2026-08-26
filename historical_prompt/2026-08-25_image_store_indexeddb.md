# 2026-08-25 生成图片持久化（随机 id + IndexedDB 存 base64）

---Start of comprehensive description---
点击生成后，需要把生成的图片以 base64 形式暂存到本地（localStorage），因为 Ideogram 4 官方服务里生成的图片 URL 有过期时间。将原来的图片 URL 换成一个随机的图片 id，用这个 id 作为键存储 base64 编码的图片，显示时直接从本地存储取。

实现过程中与用户确认的决策：
1. 存储后端改用 **IndexedDB**（localStorage ~5MB 配额装不下多张全尺寸 base64；用户选择「查找其他方案」后确认 IndexedDB）。库 `drawboard-images` / store `images`（keyPath `id`），记录 `{ id, uri, createdAt }`，`uri` 为 `data:<mime>;base64,…`。
2. 生成成功但抓图/转 base64/写入失败（fetch/CORS/网络/IDB）→ 该图**回退存原始 URL**（能立即显示但会过期），`console.error` 记录，不阻塞生成流程。
3. 兼容：旧设计 `images` 里是 `http(s)` URL —— 解析时对 `http://`、`https://`、`data:` 开头值原样透传；其余按 id 查 IndexedDB，查不到渲染空占位。

---Start of test cases---
- 生成成功后：图片以 base64 data URI 显示；设计 `images` 里是 `img-…` 随机 id；IndexedDB 恰有一条对应记录。
- Save 后：设计记录 `images` 存 id（非 URL）；reload 重开设计图片仍从 IDB 正常显示。
- 生成图 URL 抓取失败（500）：生成流程成功，该图回退存原始 URL，Save 后设计里是原始 URL。
- 旧设计（images 存 URL）：画布/首页卡片按原 URL 显示（透传）。
- IDB 里缺失记录的图片 ref：渲染空占位（历史条灰块），不报错。
- 首页最近设计卡片：IDB 设计的缩略图为 data URI，URL 设计的缩略图为原 URL，无图设计无缩略图。
- 下载：下载的是解析后的 uri，文件名 `{designId}.png`。

---Start of test logic---
- 单测 `src/test/services/imageStore.spec.ts`：fake-indexeddb 内存 IDB（每测试新 factory + jest.resetModules 隔离模块单例），stub fetch 的 arrayBuffer（1×1 PNG，注意 Node Buffer 池须 new Uint8Array 拷出）；覆盖 id 格式、isDirectUri、成功存取、三种失败回退、透传、未命中。
- e2e `scripts/e2e_image_store.cjs`（7 组 17 checks，对 `expo start --web` :8081，page.route mock 生成端点与图片 URL；种子经 page.evaluate 单 payload 传入——页面函数引用模块级变量会 ReferenceError）：
  S1 打开 IDB 设计 → 画布/缩略图为 data URI；S2 生成 → 画布 data URI 且不含原 URL，IDB 恰一条 `img-…` 记录；S3 Save → 设计存 id，reload 后仍显示；S4 转换 fetch 返 500 → 画布/缩略图为原始 URL（回退）且 Save 后设计存原始 URL；S5 旧 URL 设计透传显示；S6 首页卡片混合 ref；S7 下载文件名。
- S4 细节：mock 图片 URL 只对**第一个**请求（saveGeneratedImage 的 fetch）返 500，之后的浏览器 `<img>` 加载必须成功——RN-web 的 `Image` 在 uri 加载失败且无 defaultSource 时进入 ERRORED 状态，会把自身（`<img>` 预加载元素 + background-image）从 DOM 里整体移除，全 500 时断言不到任何 img。
- e2e_regression 适配：S9 生成后画布/缩略图变为 data URI（mock 图片路由按索引交替返回两种 1×1 PNG，保证缩略图切换可观测）；check 数保持不变（153）。
- 验证：npm test 51/51；e2e_image_store 17/17；e2e_regression 153/153；tsc 干净（example/ 目录的既有错误与本改动无关）。
