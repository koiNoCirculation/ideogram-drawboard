# 设计页返回按钮（2026-08-25）

---Start of comprehensive description---
在设计页面刷新页面后，返回按钮会消失，需要能返回到上一页，如果不知道返回到哪，去首页
---Start of test cases---
---Start of test logic---
from front page index.tsx, click any historical design or generate a new design, it should navigate to design.tsx, then, refresh page, the return button should appear and click return should go to index.tsx

## 实现记录

- 设计页页头左侧新增返回按钮（ChevronLeft，28px 蓝色，与齿轮按钮同尺寸，`testID="back-button"`）。
- 首页两个进入设计的入口（最近设计卡片 / 开始设计）在 `router.push` 前调用 `markNavigationFromHome()` 置 sessionStorage 标志 `drawboard.fromHome`（sessionStorage 刷新后仍在）。
- 返回按钮逻辑 `handleBack`：
  - 有标志 → 原生 `window.history.back()` 回上一页。刷新后 expo-router 的 navigation state 只按当前 URL 重建（单 route），`router.back()`（GO_BACK）无可弹 route 会静默失效（e2e 中观察到 dev warning "GO_BACK was not handled"）；原生后退触发 popstate，由路由的 linking 层处理并恢复首页。
  - 无标志（裸 /design、新标签、外部跳转）→ `router.replace('/')` 去首页。
- 新增 `src/test/services/designStore.spec.ts`（3 个用例：默认无标志 / 置位保持 / sessionStorage 缺失安全）；`npm test` 27 通过。
- e2e（Playwright 对运行中的 `expo start --web`，临时脚本 `temp/e2e_back_button.cjs`，不入库）：首页点历史设计 → design 页 → 刷新 → 返回按钮可见 → 点击回首页；裸 /design 新标签 → 点击返回去首页。4 项全过。

## 跟进（同日）：按钮位置

反馈：返回按钮不该在页面内标题栏（与 Stack 页头自带的返回键重复），应在 Stack 页头 "design" 标题左侧。

- 移除页面内标题栏的按钮；改为 `src/app/components/design/HeaderBackButton.tsx`（组件化，用 expo-router 命令式 `router`，无 hook），由 design.tsx `Stack.Screen options={{ headerLeft }}` 注入——默认页头返回键在刷新后（navigation state 重建为单 route）不渲染，自定义 headerLeft 保证刷新后仍显示。
- e2e 复跑 4 项全过；截图确认页面上仅 1 个返回按钮（导航后与刷新后均同）。
