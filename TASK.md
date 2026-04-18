# Agent Live2D 当前执行计划（Superpower-plus 对齐版）

更新时间：2026-04-16

## 1. 当前基线
- 聊天主链路（含 stream fallback）已恢复可用
- Ops Assistant 基础链路可用（会话、命令预览与执行、MCP 安装步骤卡）
- 后端全量测试通过（`python -m pytest -q`）
- 前端单测通过（`npm run test:unit`）
- E2E 全量通过（`npm run test:e2e`）

> 说明：以上通过结果表示“主链路稳定性已达标”，不代表真实 MCP / Skill 能力已全部完成深度收口。

---

## 2. 执行原则（默认遵循 superpower-plus）

### 流程要求（强制）
- 任何任务都必须按 superpower-plus 流程执行
  - brainstorming
  - writing-acceptance-criteria
  - writing-plans
  - executing-plans
- 未完成前序流程，不得直接修改代码、配置、文档或测试
- 不再保留“轻量任务直接实现”例外

### 本仓库执行偏好
- 默认优先 `executing-plans`
- 仅在明确并行收益时使用 subagent
- 每次实现前先给出：改动范围 / 验证命令 / 不改动文件清单

---

## 3. 当前里程碑（M9）
目标：把“可演示”提升为“真实可调用、可观测、可回归”。

状态标记：`[ ]` 未开始 `[\~]` 进行中 `[x]` 已完成

### M9-A：真实 MCP 收口（优先）
- [ ] A1. 固化 GitHub URL 安装解析规则（README 解析失败、命令缺失、非 MCP 仓库）
- [ ] A2. 完成 `preview -> execute_step(create/check/smoke/enable)` 失败分类与前端可读提示统一
- [ ] A3. 增加真实 MCP 集成回归（至少覆盖：成功、check 失败、smoke 失败、enable 回滚）
- [ ] A4. CONTRACT 补齐 MCP 安装/执行相关字段与错误码约束

验收标准：
- 至少 1 个真实 MCP Server 可稳定安装并在聊天链路成功调用
- 失败场景有一致错误码和前端可执行提示

### M9-B：真实 Skill 收口
- [ ] B1. 定义并接入至少 1 个真实 Skill 执行器（非占位字符串）
- [ ] B2. Skill 输入参数校验（schema）与前端 typed 表单完全对齐
- [ ] B3. Skill 执行结果结构化回填到消息 metadata（可追踪、可展示、可测试）
- [ ] B4. 增加 Skill 端到端回归（成功 / 参数错误 / 运行失败降级）

验收标准：
- 至少 1 个 Skill 在聊天主链路“真实执行并影响最终回复”

### M9-C：Ops Assistant 稳定性收口
- [ ] C1. 命令执行白名单与高危提示文案统一
- [ ] C2. 命令执行会话状态恢复（刷新后可继续查看/执行）
- [ ] C3. Ops 会话错误恢复策略（network/provider/mcp/validation）统一
- [ ] C4. 增加 Ops 专项 E2E（聊天 + 命令 + MCP 安装串行场景）

验收标准：
- Ops Assistant 在异常场景下可恢复，不出现“无法聊天 / 无法执行命令行”

### M9-D：文档与契约收口
- [x] D1. `AGENTS.md` 重写为 UTF-8，并对齐 superpower-plus（本次完成）
- [x] D2. `TASK.md` 重写为当前路线图（本次完成）
- [x] D3. README 增加“superpower-plus 协作约定”与强制流程说明（本次完成）
- [ ] D4. CONTRACT 对齐最近新增能力（Ops Command / Ops MCP Install / fallback 元数据）

---

## 4. 近期执行顺序（建议）
1. 先做 M9-A（真实 MCP 收口）
2. 并行推进 M9-B（真实 Skill）
3. 再做 M9-C（Ops 专项稳定性与 E2E）
4. 最后做 M9-D（README / CONTRACT 收口）

---

## 5. 风险与缓解
- 风险：MCP 外部依赖不稳定导致回归抖动  
  缓解：引入 fake MCP server + 最小真实 server 双层测试策略
- 风险：Provider 差异导致 stream/tool_call 行为不一致  
  缓解：抽象层统一结果模型，前端只消费 CONTRACT 字段
- 风险：Ops 链路跨模块，回归成本高  
  缓解：拆分 API / service / e2e 三层验收清单，按层定位

---

## 6. 完成定义（DoD）
某项任务只有同时满足以下条件才算完成：
- 功能行为符合 CONTRACT
- 对应自动化测试通过（至少覆盖正向 + 关键失败分支）
- 不破坏聊天主链路稳定性
- 文档同步更新（至少 TASK / CONTRACT / README 中相关部分）
