# Agent Live2D 后续完整功能计划

## 角色分工

| 角色 | 负责人 | 职责范围 |
|------|--------|----------|
| 后端主程 + Agent 架构 | Codex | FastAPI、LangGraph、Provider、Memory、Skills/MCP 后端、数据库、Docker |
| 前端开发 | Claude | React/TypeScript 前端、Tauri 壳集成、UI/UX、前后端联调、E2E 测试 |

## 1. 总目标

在本地单机场景下，持续稳定提供可运行的桌面 Agent 体验，保证以下链路可用并可回归：
- Web 与 Desktop 启动链路稳定
- 聊天主链路稳定（stream、stop、regenerate、fallback）
- Skill、MCP、Persona、Model Config、Memory 可联调
- FastAPI + SQLite + Qdrant + LangGraph 可持续运行

## 2. 计划原则

- 优先级顺序：**稳定性 > 功能闭环 > 体验优化 > 扩展能力**
- 严格分层：router 只做入参与响应，业务逻辑在 service
- CONTRACT.md 优先于实现习惯
- Provider 走统一抽象，不散落厂商 if-else
- 专业术语保持英文：Skill、MCP、Persona、Model Config、requestId
- 不引入重型队列（Kafka/RabbitMQ/Celery/RocketMQ）到当前阶段

## 3. 里程碑总览与依赖关系

```
M1 稳定性收口
 ├──→ M2 聊天链路加固（依赖 M1 请求幂等闭环）
 │     └──→ M5 Live2D 与桌面体验（依赖 M2 消息状态稳定）
 ├──→ M3 Skill/MCP 闭环（可与 M2 并行）
 └──→ M4 Memory 闭环（可与 M2/M3 并行）
           ↓
      M6 v0.1.0-rc2 发布收口（依赖 M2~M5 全部完成）
           ↓
      M7 v0.1.0 正式版收口
           ↓
      M8 真实可调用能力收口（全域）
```

进度标记：`[ ]` 未开始　`[~]` 进行中　`[x]` 已完成

| 里程碑 | 状态 | 前端占比 |
|--------|------|----------|
| M1 稳定性收口 | `[x]` 已完成 | 30% |
| M2 聊天链路加固 | `[x]` 已完成 | 60% |
| M3 Skill/MCP 闭环 | `[x]` 已完成 | 40% |
| M4 Memory 闭环 | `[x]` 已完成 | 20% |
| M5 Live2D 与桌面体验 | `[x]` 已完成 | 80% |
| M6 rc2 发布收口 | `[x]` 已完成 | 50% |
| M7 正式版收口 | `[x]` 已完成 | 50% |
| M8 真实可调用能力收口（全域） | `[x]` 已完成 | 100% |

## 4. 分阶段执行内容

### M1 稳定性收口（启动链路 + 请求幂等）

**后端：**
- [x] 完成消息请求幂等闭环（`metadata.requestId`）在普通发送与 stream/fallback 场景的一致性
- [x] 完成 `messages/dedupe` 清理能力
- [x] 完成关键回归测试补齐（requestId、dedupe、stream fallback）

**前端：**
- [x] ChatPage 发送消息时携带 `requestId`
- [x] stream fallback 到普通发送时复用同一 `requestId`
- [x] 完成 dedupe 清理前端入口（会话设置或工具面板中可触发）
- [x] 完成 Desktop preflight 启动链路前端健康检查与提示
- [x] 完成 release smoke 默认覆盖 Desktop preflight + startup fallback

**验收标准：**
- `npm run smoke:release` 全绿
- 同一 `requestId` 不再生成重复轮次
- `request_in_progress` 行为与 CONTRACT 一致
- Desktop 启动时前端能正确检测后端状态并给出提示

---

### M2 聊天链路加固（异常语义 + 恢复体验）

**后端：**
- [x] 统一错误语义映射：validation_error、request_in_progress、provider_error
- [x] stop/regenerate 在异常链路下的状态一致性

**前端：**
- [x] 优化 `streamFailureHandler` 错误分级：用户可修复 vs 系统故障
- [x] 统一 toast 提示策略：错误类型 → 提示文案 → 可操作建议
- [x] 完成"可恢复重试"与"不可恢复中断"的 UI 策略统一
- [x] stop 按钮在各异常状态下的行为验证
- [x] regenerate 在 stream 中断后的状态恢复
- [x] 消息列表在异常中断后不出现空白/残留气泡

**验收标准：**
- 聊天主链路 E2E 用例稳定通过
- 前端无明显误导性错误提示
- 无新增重复发送、重复轮次回归
- 所有错误场景用户都能理解发生了什么并知道下一步操作

---

### M3 Skill/MCP 闭环增强

**后端：**
- [x] Skill typed params 从 UI 到后端校验的错误信息对齐
- [x] MCP Server 健康检查与能力探测回填策略
- [x] 超时、失败重试、回退路径的统一行为

**前端：**
- [x] Skill 配置表单参数校验错误信息对齐后端返回
- [x] MCP Server 列表增加连接状态实时指示（connected / error / checking）
- [x] 会话级 Skill/MCP 选择记忆与恢复（切换会话后恢复上次选择）
- [x] Skill/MCP 失败时在 ChatToolPanel 给出可执行的修复提示

**验收标准：**
- Skill/MCP 常见失败场景均可给出可执行提示
- 配置后可在同一会话稳定复用
- 回归测试覆盖关键负向场景

---

### M4 Memory 闭环增强

**后端：**
- [x] 完成短期记忆、摘要记忆、长期向量记忆的最小可用协同
- [x] 完成长期记忆写入、检索、摘要触发的策略统一
- [x] 完成 Persona 维度 memory scope 行为与会话维度行为边界
- [x] 完成 Qdrant 异常场景的降级行为（不阻塞主聊天）

**前端：**
- [x] Memory 页面展示已存储记忆条目（列表 + 搜索）
- [x] Memory 手动写入入口（可选）
- [x] Qdrant 不可用时前端不阻塞聊天，降级提示到位

**验收标准：**
- Memory 可写、可查、可总结
- Qdrant 异常时聊天主链路不崩
- 关键 Memory API 与 CONTRACT 对齐

---

### M5 Live2D 与桌面体验接入收口

**后端：**
- [x] 提供消息状态事件供前端驱动 Live2D 动作（如 SSE 事件中携带状态标记）

**前端：**
- [x] 接入 Live2D 状态驱动最小闭环：idle → thinking → talking → error
- [x] 打通消息 SSE 事件到 Live2D 动作映射（token 事件 → talking，thinking 事件 → thinking）
- [x] Live2DStage 组件支持加载真实 Live2D 模型（pixi-live2d-display 或同类库）
- [x] 陪伴气泡模式（companion layout）下 Live2D 交互体验优化
- [x] Desktop 启动/重启/端口冲突回退体验优化
- [x] 完成桌面端关键人工验收清单

**验收标准：**
- Live2D 可跟随聊天状态切换
- Desktop 多次启动不出现阻塞性错误
- 体验问题可接受，无主链路中断
- 陪伴气泡模式可正常使用

---

### M6 v0.1.0-rc2 发布收口

**协作：**
- [x] 完成回归清单、发布 ticket、已知问题列表更新
- [x] 完成 smoke、unit、e2e、docker health 的发布前全套验证
- [x] 完成高优先问题清零（P0/P1）

**前端：**
- [x] 前端构建零警告零错误
- [x] E2E 覆盖主链路全部通过
- [x] 检查中文文案一致性

**验收标准：**
- 发布清单全勾选
- 发布 ticket 信息完整可追溯
- 无阻塞发布问题

---

### M7 v0.1.0 正式版收口

**协作：**
- [x] 完成文档统一（README、CONTRACT、TASK、发布文档）
- [x] 完成接口行为与前端调用一致性最终核对
- [x] 完成稳定性观察周期（至少连续多轮回归）

**前端：**
- [x] 确保所有页面中文文案统一、无英文残留
- [x] 确保双聊天模式（chat / companion）均可正常使用
- [x] README 前端部分更新到位

**验收标准：**
- v0.1.0 版本可稳定演示与本地部署
- 主链路无明显体验阻断问题

---

### M8 真实可调用能力收口（全域）

**目标说明：**
- 将当前”可管理/可展示但非真实执行”的能力，统一升级为”真实可调用、可观测、可回归”。
- 本里程碑不仅包含 MCP，也包含 Skill 执行、Provider 工具调用链路、流式能力与配置层可用性。

**当前能力状态盘点：**

| 能力 | 当前状态 | 目标状态 |
|------|---------|---------|
| MCP initialize → tools/list → tools/call | 占位回填，未走真实协议 | http + stdio 真实调用闭环 |
| MCP 配置（auth/headers/timeout） | 仅 name/endpoint/enabled | 补齐真实接入所需全部字段 |
| Skill 执行 | SkillRegistry 返回固定文案 | 真实执行 + 结果参与回复 |
| Provider tool_call | toolCallSupported 字段存在但未打通 | 模型工具调用真实触发并回填 |
| Provider stream | 伪分片为主路径 | 真实上游 stream 优先，伪分片降级 |
| Anthropic/Gemini Provider | 占位适配器 | 最小可用接入 |

**N1 核对结果（CONTRACT 对齐检查，2026-04-06）：**

| 检查项 | CONTRACT 现状 | 实现现状 | 结论 |
|------|---------------|---------|------|
| MCP Server 管理接口 | 已定义 CRUD + `check` + `capabilities` | 已实现并可用 | 对齐 |
| MCP 协议级调用（initialize/tools/list/tools/call） | 未定义协议级保证 | 当前为探活/占位回填，未形成真实协议闭环 | 缺口（纳入 N2） |
| Model Config `toolCallSupported` | 已定义字段 | 字段已落库，但主链路未形成真实 tool_call 执行 | 缺口（纳入 N4） |
| SSE 主链路事件 + `live2dState` | 已定义 `tool_calling/tool_result/token/final_answer` 与 `live2dState` 约定 | 已实现并在 stream 中附带状态 | 对齐 |
| `manualToolRequests` 契约 | 未在 CONTRACT 明确请求体结构 | 前后端已实现并使用 | 缺口（需补 CONTRACT） |
| MCP 配置字段（auth/headers/timeout/args/env） | 仅定义 `transportType` + `endpointOrCommand` + `enabled` | 当前配置不足以覆盖真实生产接入 | 缺口（纳入 N2/N5） |

**后端：**
- [x] MCP 真实协议闭环：实现 `initialize -> tools/list -> tools/call`（覆盖 http + stdio）
- [x] MCP 调用执行器：ToolAgent 从”状态占位回填”升级为”真实调用 + 结果回填”
- [x] MCP 配置扩展：补齐 `command/args/env/headers/auth/timeout` 等真实接入所需字段
- [x] Skill 真实执行闭环：将 SkillRegistry 与消息主链路打通，返回真实执行结果而非占位文案
- [x] Provider 工具调用闭环：统一 `toolCallSupported` 行为，打通模型工具调用入口
- [x] Provider 流式闭环：优先走真实上游 stream，保留降级但不再以伪分片为主路径
- [x] 补齐可运行适配：将当前占位 Provider（Anthropic/Gemini）升级为最小可用接入
- [x] 集成测试补齐：新增 fake MCP server + Skill runner 的端到端测试（含失败重试与降级）

**前端：**
- [x] MCP 管理页支持真实配置项：高级参数、认证信息、连接测试详情（依赖后端 MCP 配置扩展完成）
- [x] ChatToolPanel 展示真实调用阶段（queued/running/success/error）与可读错误原因（依赖后端 MCP 执行器 + Skill 执行闭环）
- [x] 手动工具面板支持简单文本参数输入并与后端校验一致（已有基础，先收口）
- [x] 手动工具面板支持 schema 驱动类型化参数输入（JSON Schema → 动态表单，后续迭代）
- [x] 聊天区工具结果展示升级为”真实返回结构 + 关键字段摘要”（依赖后端真实调用链路）
- [x] 会话级工具选择与真实执行状态联动：切换会话后可恢复上下文

**验收标准：**
- 至少 1 个真实 MCP Server 可在聊天链路中被调用并返回结构化结果
- 至少 1 个 Skill 在主链路中真实执行并参与最终回复
- OpenAI-compatible / Ollama 在主链路可稳定真实 stream
- Provider 工具调用与手动工具调用均可回归，不出现主链路阻断
- 新增集成测试可稳定通过，且 `smoke:release` 保持全绿

## 5. 已知风险与缓解策略

| 风险项 | 影响 | 缓解策略 |
|--------|------|----------|
| Live2D SDK 集成复杂度 | M5 可能超时 | 先用 pixi-live2d-display 最小接入，复杂表情驱动留后续版本 |
| Qdrant 本地部署稳定性 | Memory 功能不可用 | 前端做好降级提示，后端异常不阻塞聊天 |
| Tauri 2 跨平台兼容性 | Desktop 构建/启动问题 | 优先保证 Windows，macOS/Linux 作为 rc2 后再验证 |
| Provider 厂商 API 差异 | stream/tool_call 行为不一致 | 统一抽象层兜底，前端只依赖 CONTRACT 约定的事件格式 |
| 前后端联调节奏不同步 | 前端等待后端接口 | 前端保持 mock 可用，CONTRACT 变更时两端同步更新 |
| MCP stdio 进程管理受 Tauri sandbox 限制 | stdio 模式在 Desktop 中可能无法启动子进程 | 优先保证 http 模式可用，stdio 作为 web-only 路径或需 sidecar 方案 |
| 真实 Provider tool_call 格式各厂商不一致 | Anthropic/Gemini 工具调用与 OpenAI 格式差异大 | 抽象层统一转换，前端只消费 CONTRACT 标准化事件 |
| fake MCP server 测试环境搭建复杂度 | 集成测试可能不稳定 | 使用内存 HTTP server，不依赖外部进程，测试可独立运行 |

## 6. 版本边界（本阶段不做）

- 不做多用户账户体系
- 不做云同步
- 不做重型消息中间件改造（包括 RocketMQ）
- 不做复杂权限系统与企业级审计平台
- 不做过早微服务拆分

## 7. 当前立刻执行项（Next → 属于 M8）

- [x] N1：核对 M8 能力盘点表与 CONTRACT 一致性，确认每项”当前状态”无遗漏
- [x] N2：先打通 MCP 真实调用最小闭环（http，单工具，主链路可回填）
- [x] N3：打通 Skill 真实执行最小闭环（manualToolRequests + ToolAgent 真执行）
- [x] N4：完成 Provider 工具调用抽象层改造（不在业务层散落分支）
- [x] N5：补齐前端 MCP 高级配置与调用状态可视化
- [x] N6：补齐集成回归（fake MCP + fake Skill + stream 主链路），并更新发布文档
- [x] N7：修复 CONTRACT.md 编码乱码，并补齐 `manualToolRequests` 与 MCP `advancedConfig` 契约字段
- [x] N8：完成 MCP `stdio` 下 `initialize/tools/list/tools/call` 最小真实闭环，并补充回归测试
- [x] N9：完成 Anthropic/Gemini Provider 最小可用接入（chat/chat_with_tools/test_connection）并补工具调用抽象回归
- [x] N10：完成 OpenAI-compatible / Ollama 真实上游 stream 优先路径（含 tool_calls 流式回填）并补回归测试
- [x] N11：完成统一 SkillRuntimeEngine（registry + workflow runtime）接入 ToolAgent，移除 generic fallback 语义
- [x] N12：补齐失败重试与降级集成回归（MCP check 重试恢复 + stream 中 MCP not-ready 占位降级不阻塞 final_answer）
- [x] N13：修复 ChatInput/ChatPage 中文乱码与字符串闭合问题，恢复聊天页构建与测试通过

## 8. 历史已完成执行项（归档）

- [x] N1：完成 requestId 幂等主链路最终闭环（服务端 + 前端 + 回归测试）
- [x] N2：完善 dedupe 接口前端入口与回归验证
- [x] N3：完成一次含 Desktop preflight 的全量 smoke 回归并更新发布文档
- [x] N4：推进 M2 错误语义统一与异常恢复体验
- [x] N5：完成 Qdrant warning 降噪闭环（冷却窗口 + 空异常文案兜底 + 回归验证）
- [x] N6：完成 v0.1.0 发版前最终全量 smoke 回归（含 E2E + Desktop preflight + Docker health）
