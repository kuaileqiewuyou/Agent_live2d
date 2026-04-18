# Agent Live2D 当前执行计划（Superpower-plus 对齐版）

更新时间：2026-04-18

---

## 1. 当前基线

- 聊天主链路已可用（含 stream / stop / regenerate / fallback）
- Ops Assistant 基础链路可用（会话、命令预览执行、MCP 安装步骤）
- 后端测试、前端单测、E2E 具备可回归能力
- 文档治理流程已切换为 superpower-plus 全流程

说明：基线“可用”不等于“全部收口完成”，真实 MCP/Skill 仍在持续收口。

---

## 2. 执行原则（强制）

### 2.1 流程要求
- 任何任务都必须按以下流程执行：
  - brainstorming
  - writing-acceptance-criteria
  - writing-plans
  - executing-plans
- 未完成前序流程，不得直接改代码、配置、文档或测试

### 2.2 落地要求
- 每次实施前必须先给出：改动范围 / 验证命令 / 不改动文件清单
- 接口行为变更必须同步更新 `CONTRACT.md`
- 协作规则变更必须同步更新 `AGENTS.md`

---

## 3. 当前里程碑

状态标记：`[ ]` 未开始 `[/]` 进行中 `[x]` 已完成

### M9-A：真实 MCP 收口（优先）
- [ ] A1. 固化 GitHub URL 安装解析规则（失败分类完整）
- [ ] A2. 统一 `preview -> execute(create/check/smoke/enable)` 失败语义与前端提示
- [ ] A3. 增加真实 MCP 集成回归（成功、check 失败、smoke 失败、enable 回滚）
- [ ] A4. 契约收口：MCP 安装/执行字段与错误码与 `CONTRACT.md` 完整一致

验收标准：
- 至少 1 条真实 MCP 链路可稳定安装并被聊天链路调用
- 失败场景具备一致错误码与可执行提示

### M9-B：真实 Skill 收口
- [ ] B1. 接入至少 1 个真实 Skill 执行器（非占位）
- [ ] B2. Skill 参数 schema 与前端 typed 表单一致
- [ ] B3. Skill 结果结构化回填到消息 metadata（可追踪/可展示/可测试）
- [ ] B4. 完成 Skill E2E 回归（成功 / 参数错误 / 运行失败降级）

验收标准：
- 至少 1 个 Skill 在聊天主链路真实执行并影响最终回复

### M9-C：Ops Assistant 稳定性收口
- [ ] C1. 命令执行白名单与高危提示统一
- [ ] C2. 命令执行会话状态恢复（刷新后可继续查看）
- [ ] C3. Ops 错误恢复策略统一（network/provider/mcp/validation）
- [ ] C4. Ops 专项 E2E（聊天 + 命令 + MCP 安装串行场景）

验收标准：
- 异常场景可恢复，不出现“无法聊天/无法执行命令”硬阻断

### M10：核心文档治理与对齐（本轮）
- [x] D1. `AGENTS.md` 明确协作规则真源与文档联动规则
- [x] D2. `README.md` 收敛为接手入口并建立文档导航
- [x] D3. `CONTRACT.md` 明确接口契约真源边界
- [x] D4. `TASK.md` 重排为里程碑执行看板并显式要求契约联动

验收标准：
- 四份核心文档职责边界清晰且无冲突
- 同一信息只在唯一真源定义，其他文档仅引用/导航

---

## 4. 契约对齐要求（与 CONTRACT 联动）

以下能力必须在 `TASK.md` 与 `CONTRACT.md` 可一一对应：
- 聊天主链路：`messages`、`messages/stream`、`messages/stop`、`messages/regenerate`
- MCP：`/api/mcp/servers` 及 `check/capabilities/smoke`
- Memory：`/api/memory/*`
- Ops：`/api/ops/mcp/install/*`、`/api/ops/commands/*`

若 TASK 提到新能力而 CONTRACT 未定义，视为未完成。

---

## 5. 近期执行顺序（建议）

1. M9-A（真实 MCP 收口）
2. M9-B（真实 Skill 收口）
3. M9-C（Ops 稳定性与 E2E 收口）
4. 持续维护 M10（文档与契约同步）

---

## 6. 风险与缓解

- 风险：外部 MCP 依赖不稳定导致回归抖动
  - 缓解：fake server + 真实 server 双层回归
- 风险：Provider 差异导致 stream/tool_call 行为不一致
  - 缓解：抽象层统一输出模型，前端只消费 CONTRACT 字段
- 风险：跨模块改动导致回归成本高
  - 缓解：API / service / e2e 分层验收清单

---

## 7. 完成定义（DoD）

某项任务完成必须同时满足：
- 功能行为符合 `CONTRACT.md`
- 自动化测试通过（至少覆盖正向与关键失败分支）
- 不破坏聊天主链路稳定性
- 文档同步更新（至少覆盖 `TASK.md` + 相关真源文档）
