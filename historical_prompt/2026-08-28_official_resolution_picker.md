# 2026-08-28 首页官方分辨率选择器（cf-worker 分支）

---Start of comprehensive description---
修改 index.tsx 中关于长宽的逻辑，当选择官方 ideogram api（image provider = Official）时，分辨率只能从以下这些里面选：

```
2048x2048 1440x2880 2880x1440 1664x2496 1792x2240 2240x1792 1440x2560 2560x1440
1600x2560 2560x1600 1728x2304 2304x1728 1296x3168 3168x1296 1152x2944 2944x1152
1248x3328 3328x1248 1280x3072 3072x1280 1024x3072 3072x1024 1024x1024 896x1120
1120x896 1152x864 832x1248 1248x832 800x1280 1280x800 720x1280 1280x720
720x1440 1440x720 512x1536 1536x512
```

当选择官方 api 时，需要将这些分辨率按照长宽比分类，分两行显示。第一行是各个长宽比，选择好以后显示对应长宽比下面的分辨率。选择自定义 api 时保持现有的选择长宽比和输入自定义长宽的逻辑。

实现要点：
- 36 个分辨率按约分长宽比分成 23 组（`services/resolutions.ts`：`OFFICIAL_RESOLUTIONS` / `OFFICIAL_RATIO_GROUPS`，组按比值横→竖排序、组内大者在前）。
- 新组件 `components/ResolutionPicker.tsx`（props 驱动）：Official = 两行 pill（`official-ratio-<ratio>` / `official-resolution-<W>x<H>`），无 W/H 输入；Custom = 原有预设比例 pill（新增 testID `ratio-<ratio>` / `ratio-custom`）+ W/H 输入（联动逻辑移入组件）。
- index.tsx 状态 `imageProvider`（挂载读设置、设置对话框关闭后重读）；选官方比例默认选中该组最大分辨率；选分辨率直接定 W/H，`selectedRatio` 置为约分比例标签（LLM 目标长宽比 + handoff size 下游不变）。
- provider 切换适配：→Official 用 `pickOfficialSize` 吸附（精确 > 同比例最近面积 > 最近 1:1；首次挂载默认 4:3 1024×768 吸附为 1152×864）；→Custom 保留 W/H、比例置 'custom'（避免 1024 基准重置 effect 冲掉值）。
- 拆分后 index.tsx 代码行数 397（<400 约束）。
---Start of test cases---
when imageProvider=Official 且页面默认 4:3 1024x768, it should 显示 23 个比例 pill、无 W/H 输入、选中 4:3 组且 1152x864（最近的 4:3 官方分辨率）激活
when 点击 16:9 比例 pill, it should 第二行显示 [2560x1440, 1280x720] 且 2560x1440（最大）激活
when 点击 1280x720 分辨率 pill 并提交, it should LLM 请求带 "TARGET IMAGE ASPECT RATIO: 16:9"、handoff size = 1280x720
when Official 下经设置对话框切到 Custom 并保存, it should 预设 pill 行 + W/H 输入恢复、W/H 保留原值（1152x864）、比例落 'custom'、W/H 互不联动
when Custom 下 W=1280 H=720 再切回 Official, it should 无 W/H 输入、16:9 组激活且 1280x720 保留为激活分辨率
when 分辨率不在官方集合（如自定义 700x400）切到 Official, it should 吸附到最近 1:1（1024x1024）
---Start of test logic---
- 单测 `src/test/services/resolutions.spec.ts`：集合恰为 36 个（逐项与需求列表比对）、23 组覆盖全部 + 组内标签一致 + 比值严格递减（首 3:1 末 1:3）+ 组内大者在前；`ratioLabel` gcd 约分；`pickOfficialSize` 精确/同比例最近面积/回退 1:1/0 输入安全。
- e2e `scripts/e2e_official_resolution.cjs`（对 `expo start --web` :8081，seed localStorage 设置）：
  - S1 seed imageProvider=Official → 断言 23 个 `official-ratio-*`、无 `width-input`/`height-input`、`official-ratio-4:3` 与 `official-resolution-1152x864` 激活（激活 = 计算样式背景 rgb(0,122,255)）。
  - S2 点 `official-ratio-16:9` → 第二行两个 pill [2560x1440, 1280x720]，2560x1440 激活。
  - S3 点 `official-resolution-1280x720` → 激活；填 prompt 点 `start-design-button`（page.route mock vLLM chat/completions 返回合法 JSON）→ waitForURL /design；断言恰 1 次 LLM 调用、请求体含 16:9、`drawboard.handoff` 的 size = {width:1280, height:720}。
  - S4 新页（Official 默认）→ 设置对话框 image-provider 切 Custom → 保存 → 断言预设行/自定义 pill/W-H 输入回来、值 1152/864 保留、`ratio-custom` 激活、W=800 时 H 不变（无联动）。
  - S5 新页（Custom，先选 'custom' 比例避免预设联动）W=1280 H=720 → 切 Official 保存 → 输入消失、16:9 组 + 1280x720 激活。
  - 全程收集 pageerror，最终断言为 0。
- 回归：`npm test` 98/98（新增 resolutions.spec 9 例）；`e2e_regression` 165/165（S1 首页比例/W-H 断言走 Custom 默认模式，不受影响）；`e2e_cf_worker` 24/24；`e2e_prompt_image` 31/31；`e2e_multiline_input` 11/11；`e2e_start_design_error` 33/33；`e2e_home_wall` 22/22；`e2e_example_wall` 23/23；`e2e_i18n` 66/66；`e2e_show_prompt` 11/11；`e2e_image_store` 33/33；`e2e_background_edit` 22/22；`e2e_github_pages` 17/17（真实导出）。`npx tsc --noEmit` src 无错（example/ 既有错误除外）。
