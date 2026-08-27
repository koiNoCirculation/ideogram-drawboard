# 2026-08-26 首页提交：LLM 端点错误改用红色消息

---Start of comprehensive description---
当llm推理端点未设置正确时，点击提交按钮应该用红色的消息报错。

---Start of test cases---
当 LLM 推理端点未设置正确（端点不可达、端点返回 HTTP 错误、端点为空、端点回答的 JSON 全部非法）时，点击提交按钮，应在输入条上方出现红色错误消息，且不跳转到设计页。

---Start of test logic---
e2e（scripts/e2e_start_design_error.cjs，对 :8081 的 expo web）：
1. S1：seed 设置 vLLM 端点为未监听端口 127.0.0.1:59999 → 进首页填 prompt 点提交 → 等待红色错误行（testID refine-error）出现，文案含 "Failed to fetch"、边框色 #E53935；URL 不变（不跳转）；按钮恢复箭头（非 spinner）；等 6 秒错误行仍在（最终失败持久，超过 5s 瞬态窗口）；随后把 localStorage 端点改为 mock 的 localhost:8000/v1 并再点提交 → 旧错清除并跳转 /design。
2. S2：mock LLM 路由返回 500 "boom" → 点提交 → 红色错误行含 "LLM API Error (500)" 与 "boom"，恰 1 次 LLM 调用，不跳转。
3. S3：vLLM 端点为空字符串 → 点提交 → 红色错误行含 "Missing settings:" 与 "LLM endpoint"，0 次 LLM 请求，不跳转。
4. S4：mock LLM 恒返回非 JSON 内容 → 点提交 → 恰 3 次调用后红色错误行显示 "The LLM returned invalid JSON on every attempt."，不跳转。
各节均断言无 pageerror。
