# 下载图片按钮（2026-08-25）

---Start of comprehensive description---
Generate按钮右边增加一个Download Image按钮，点击后会下载当前生成的图片。
在design.tsx上面，如果已经生成了图片，则点击Download Image会弹出保存窗口，将图片存储。否则用一个5秒的红色的悬浮提示报错，告诉用户还没生成，无法下载。
补充 1：给下载按钮添加单元测试，确认点击按钮后真的下载了图片。
补充 2：首页不该有 Download Image 按钮，应该在 design.tsx，并且如果有多张图片生成，下载目前选中的。
---Start of test cases---
---Start of test logic---
从历史生成（如果有）进入design.tsx, 下载图片应该能成功弹出保存窗口，如果是直接首页填提示词进行重写，还没生成的情况下，点击保存应该报错。

## 实现记录

- `src/app/services/imageDownload.ts`：`downloadImage(url, filename)` — fetch → blob → 临时 `<a download>`（文件名 `{designId}.png`）点击触发浏览器保存窗口。
- `useGeneration.ts`：`handleDownload` + `isDownloading` + `downloadError`（5s 自动消失的红色悬浮提示，新失败重新计时）；无选中图时提示「No image has been generated yet — generate one first, then download.」。下载对象 = `shownImage`（历史条当前选中，默认最新）。
- `GenerateRow.tsx`：Generate 右侧 Download Image 按钮（`testID="download-image-button"`，下载中显示 ActivityIndicator）；`HistoryStrip.tsx` 缩略图加 `testID="history-thumb-{i}"`。
- 红色悬浮提示在 design.tsx 根层渲染（`position:fixed` 视口顶部居中、Stack 页头下方，`testID="download-error"`）。
- 单测 `src/test/services/imageDownload.spec.ts`（jest-expo 环境无 document，stub 最小 DOM）：成功路径断言 fetch URL / blob object-URL / 文件名 / 点击锚点；失败路径断言抛错且不动 DOM。`npm test` 29 通过。
- e2e（Playwright，临时脚本 `temp/e2e_download.cjs`，不入库）：6 项全过——有 2 张图时选中第 1 张（非默认最新）下载，字节流与选中图一致；切回最新再下载一致；无图时点按钮出红色悬浮提示、5 秒后消失、不触发下载。
