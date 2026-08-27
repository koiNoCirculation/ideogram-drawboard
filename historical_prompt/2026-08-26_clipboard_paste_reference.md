# 2026-08-26 支持从剪贴板输入多模态内容（粘贴参考图）

---Start of comprehensive description---
支持从剪贴板输入多模态内容。
（承接上一条：prompt 框拖入参考图。本条把同一机制扩展到剪贴板——在 prompt 框 Ctrl+V 粘贴剪贴板里的图片（如截图）→ 与拖入相同，进参考图预览行并作为多模态 refine 输入。）

---Start of test cases---
1. 在 prompt 框粘贴含图片的剪贴板内容（Ctrl+V，如截图）→ 图片转 base64 data URI 进参考图预览行（与拖入同一行、同样可删除）。
2. 粘贴含图片的剪贴板时，粘贴事件被消费（preventDefault），文本框不重复插入内容。
3. 纯文本粘贴不被消费 → 输入框默认文本插入照常工作、不产生预览。
4. 粘贴的参考图与拖入的参考图同样进入 refine 请求（vLLM "image inputs" 多模态格式）。

---Start of test logic---
1. 实现：index.tsx 的 DnD effect 同一 `prompt-dropzone` 节点上加原生 `paste` 监听（事件从聚焦的 TextInput 冒泡上来）；`clipboardData.items` 中 `kind==='file'` 且 `type` 为 image/* 的项经 `getAsFile()` 取出，复用与 drop 相同的 `pushImageFiles`（fileToDataUri → 追加 refImages）；有图片项才 `preventDefault`，纯文本粘贴直接放行。
2. e2e（scripts/e2e_prompt_image.cjs 新增 S6，21→31 断言，对 :8081 的 expo web）：
   - S6a：`page.evaluate` 构造 `new ClipboardEvent('paste', { clipboardData })`（DataTransfer 塞 1×1 PNG File）派发到 `prompt-input`（验证冒泡到 dropzone 的监听）→ `dispatchEvent` 返回 false（被 preventDefault 消费）、出现 `image-preview-0` 且 src = 该 data URI。
   - S6b：合成纯文本粘贴（DataTransfer 仅 `setData('text/plain', …)`）→ 未被消费、预览数不变。
   - S6c：真实受信文本粘贴——`context.grantPermissions(['clipboard-read','clipboard-write'])` + `navigator.clipboard.writeText` + 聚焦输入框 + `keyboard.press('Control+V')` → 输入值含所贴文本、预览数不变。
   - S6d：真实受信图片粘贴——`navigator.clipboard.write([new ClipboardItem({'image/png': blob})])` + Ctrl+V → 追加第二个预览；断言**解码像素**与原始 PNG 相同（Chromium 异步剪贴板 API 会解码+重编码 PNG 容器，原始字节会变，故不比对字节）。
   各节均断言无 pageerror。
3. 回归：`npm test` 全绿 + `npx tsc --noEmit` 无错 + 全部 8 个 e2e 套件全绿。
