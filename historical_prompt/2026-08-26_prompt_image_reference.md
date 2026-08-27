# 2026-08-26 首页 prompt 框拖入参考图（多模态 LLM 输入）

---Start of comprehensive description---
允许用户往prompt框拖入图片，作为prompt的参考，使用的图片以小预览图的形式显示在宽高下面，输入框上面。输入的图片以base64编码作为对话prompt的一部分，参考: https://docs.vllm.ai/en/latest/features/multimodal_inputs/#image-inputs

---Start of test cases---
1. 往 prompt 输入条拖入一张图片 → 图片以 48×48 小预览图显示在 W/H 行下方、输入条上方（渲染该图片的 data URI）。
2. 再拖入第二张图 → 预览追加（两张并排）；点某张的 X → 删除该预览，其余重排。
3. 拖入非图片文件（如 .txt）→ 不产生预览。
4. 拖拽悬停（dragover）期间输入条边框变蓝提示可放，移出（dragleave）还原。
5. 带参考图点提交 → refine 请求体 `messages[1].content` 为数组：text 部分（原 user 消息）+ 每图一个 `{type:'image_url', image_url:{url: dataURI}}`（vLLM "image inputs" 格式），成功后跳转 /design。
6. 无参考图点提交 → `content` 保持纯字符串（非视觉后端兼容）。
7. Ollama provider → 用户消息 content 为字符串、图片以裸 base64（剥掉 data URI 前缀）放兄弟字段 `images`。

---Start of test logic---
1. 单元测试：`src/test/services/imageFile.spec.ts`（File → data URI，mime 回退 image/png、跨 0x8000 分块字节级 round-trip）；`PromptRefiner.spec.ts` 新增 3 例（多模态 content 数组、无图纯字符串、Ollama `images` 裸 base64）；`i18n.spec.ts` 增 `removeImage` 双语映射。
2. e2e（scripts/e2e_prompt_image.cjs，对 :8081 的 expo web，21 断言）：
   - S1：`page.evaluate` 构造 `new DragEvent('drop', { dataTransfer })` 派发到 `prompt-dropzone`（DataTransfer 塞 1×1 PNG）→ 断言出现 `image-preview-0` 且其 `<img>` src = 该 data URI、预览行位于 W/H 行与输入条之间；再 drop 一张 → 出现第二个预览；点 `image-preview-remove-0` → 少一个预览、剩余图重排到 index 0。
   - S2：drop 一个 text/plain 文件 → 预览数不变。
   - S3：dispatch `dragover` → 计算样式 borderTopColor = rgb(0,122,255)；dispatch `dragleave` → 还原 rgb(221,221,221)。
   - S4：带预览点提交（mock LLM 200 返回合法 JSON prompt）→ route 捕获请求体：`messages[1].content` 是数组，`content[0] = {type:'text', text 含 'User idea: ...'}`，`content[1] = {type:'image_url', image_url:{url: 该 data URI}}`；随后跳转 /design。
   - S5：无预览点提交 → `messages[1].content` 为字符串。
   各节均断言无 pageerror。
3. 回归：`npm test` 9 套件全绿 + `npx tsc --noEmit` 无错 + 全部 8 个 e2e 套件全绿。
