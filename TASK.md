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

## 5. 已知风险与缓解策略

| 风险项 | 影响 | 缓解策略 |
|--------|------|----------|
| Live2D SDK 集成复杂度 | M5 可能超时 | 先用 pixi-live2d-display 最小接入，复杂表情驱动留后续版本 |
| Qdrant 本地部署稳定性 | Memory 功能不可用 | 前端做好降级提示，后端异常不阻塞聊天 |
| Tauri 2 跨平台兼容性 | Desktop 构建/启动问题 | 优先保证 Windows，macOS/Linux 作为 rc2 后再验证 |
| Provider 厂商 API 差异 | stream/tool_call 行为不一致 | 统一抽象层兜底，前端只依赖 CONTRACT 约定的事件格式 |
| 前后端联调节奏不同步 | 前端等待后端接口 | 前端保持 mock 可用，CONTRACT 变更时两端同步更新 |

## 6. 版本边界（本阶段不做）

- 不做多用户账户体系
- 不做云同步
- 不做重型消息中间件改造（包括 RocketMQ）
- 不做复杂权限系统与企业级审计平台
- 不做过早微服务拆分

## 7. 当前立刻执行项（Next → 属于 M1）

- [x] N1：完成 requestId 幂等主链路最终闭环（服务端 + 前端 + 回归测试）
- [x] N2：完善 dedupe 接口前端入口与回归验证
- [x] N3：完成一次含 Desktop preflight 的全量 smoke 回归并更新发布文档
- [x] N4：推进 M2 错误语义统一与异常恢复体验
- [x] N5：完成 Qdrant warning 降噪闭环（冷却窗口 + 空异常文案兜底 + 回归验证）
- [x] N6：完成 v0.1.0 发版前最终全量 smoke 回归（含 E2E + Desktop preflight + Docker health）




