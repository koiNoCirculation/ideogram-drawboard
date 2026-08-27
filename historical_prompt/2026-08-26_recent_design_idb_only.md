# 2026-08-26 移除 recent design 图片的向前兼容逻辑（只保留 IndexedDB）

---Start of comprehensive description---
移除 recent design（及全局图片 ref）里关于图片的向前兼容逻辑，只保留 indexDB 部分：
1. 图片 ref 恒为 IndexedDB 图片库（drawboard-images）的 id（`img-…`）——唯一 ref 种类；
2. `resolveImageRef` / `useImageUris` 移除 URL 透传（原 `isDirectUri`：http(s)/data/根相对路径原样返回）——旧设计遗留的 URL ref 查不到库 → null，渲染空占位（tile/历史缩略图保留、可点，画布无图）；
3. `saveGeneratedImage(url, id?)` 移除"转换失败回退存原始 URL"——任何失败返回 null，生成流程丢弃该图（不进 images/历史条），错误行显示 `imageSaveFailed`；
4. 打包示例集（public/example_collection）的图同样持久化进 IDB（稳定 id `img-<url 文件名>`，check-then-store 每浏览器只转一次），示例墙与"从示例开设计"的 handoff `images` 携带 IDB id 而非 URL；
5. 同步更新 e2e（e2e_image_store S4/S5/S6 改为 IDB-only 断言、e2e_home_wall/e2e_regression 种子改 IDB 记录、e2e_example_wall 断言 data URI、e2e_show_prompt 去掉无用 URL route）与 DESIGN.md 各节。

核心代码改动（imageStore.ts / useImageUris.ts / useGeneration.ts / exampleCollection.ts / index.tsx / design.tsx / translations.ts / imageStore.spec.ts / e2e_regression / e2e_home_wall）随首页示例墙特性一并完成于本次工作树；本任务补齐其余测试/注释/文档一致性并全量回归。
---Start of test cases---
when 生成图的转换 fetch 失败, it should 丢弃该图（不进历史条、无新增 IDB 记录、画布无图）并显示 imageSaveFailed 错误行，保存的设计 images 为空
when 打开旧设计（images 为原始 URL）, it should 画布无图、历史缩略图为空占位，且该 URL 永不被浏览器 fetch
when 首页 Recent 墙存在旧 URL 设计, it should tile 保留（可点开）但显示灰色占位、不显示 URL 图
when 首页示例墙/从示例开设计, it should 图片显示为 IDB 解析出的 data URI（而非 /example_collection/*.png 文件 URL）
when 正常生成/保存/重开, it should 行为不变（IDB id 存 base64、reload 后仍显示、下载文件名 {designId}.png）
---Start of test logic---
e2e（scripts/e2e_image_store.cjs，对 :8081）：
- S4：mock generate 端点返回的图 URL 恒 500 → 点 Generate → 断言画布无 img、错误行 "Image generated, but saving it locally failed — try again."、无 Generated (1)、IDB 记录数与生成前一致、URL 只被 fetch 一次（转换）、Save 后设计 images=[]。
- S5：种子设计 images=[LEGACY_URL]（不种 IDB）→ 打开设计页 → 断言画布无 img、URL 命中次数 0、Generated (1) 存在但 history-thumb-0 无 img。
- S6：首页切 Recent 墙 → IDB tile 的 img src = data URI；旧 URL tile 存在但无 img、URL 命中 0；无图设计无 tile。
- S2：生成存 IDB 后按"uri === 生成的 1x1 data URI"过滤断言（首页加载已把示例图持久化进同一 IDB，不能裸数记录数）。
e2e_example_wall：S1 断言 tile 数=example.json 长度且 img src 以 data:image/ 开头；S3 画布参考图 src 为 data URI。
e2e_home_wall S2 / e2e_regression S14：种子设计改 IDB 记录，tile 断言最新图 = 第二条记录的 data URI。
e2e_show_prompt：种子设计保留 URL ref（legacy 场景，tile 空占位仍可点开），移除无用 URL route。
npm test 51→ 全绿；全部 e2e 套件回归。
