# Acceptance Criteria: MD 对齐与接手文档治理

**Spec:** `docs/superpowers/specs/2026-04-18-md-alignment-handoff-design.md`
**Date:** 2026-04-18
**Status:** Draft

---

## Criteria

| ID | Description | Test Type | Preconditions | Expected Result |
|----|-------------|-----------|---------------|-----------------|
| AC-001 | `AGENTS.md` 明确声明其为协作规则真源，并包含流程约束、关键操作确认、实施前必报三项。 | Logic | 工作区存在 `AGENTS.md`。 | 文档中可定位到“superpower-plus 强制流程”“关键操作必须先确认”“每次开始实现前（必须先给出）”等章节；且未把 API 字段细节作为主定义。 |
| AC-002 | `CONTRACT.md` 作为接口契约真源，覆盖通用约定、资源接口、SSE、错误契约、幂等约定、Ops 扩展。 | Logic | 工作区存在 `CONTRACT.md`。 | 文档存在上述六类章节内容，且接口行为描述完整到可被前端/测试直接消费。 |
| AC-003 | `README.md` 作为接手入口，保留启动与联调指引，不承载详细契约定义。 | Logic | 工作区存在 `README.md`。 | `README.md` 包含“快速开始/启动方式、联调路径、文档导航”；并以链接指向 `CONTRACT.md` 获取接口细节。 |
| AC-004 | `TASK.md` 仅维护阶段状态与里程碑，不承载接口字段定义和协作规则定义。 | Logic | 工作区存在 `TASK.md`。 | 文档包含“当前基线、里程碑、验收标准、风险、执行顺序、DoD”；不存在 API 字段示例表或流程规范主定义。 |
| AC-005 | 四份文档遵循单一真源原则：同一信息只在一个文档主定义，其他文档以引用/导航方式出现。 | Logic | 四份文档已更新。 | 抽检“接口契约”“协作流程”“执行状态”“接手入口”四类信息，各自仅存在一个权威定义位置，其余文档仅引用。 |
| AC-006 | 文档重排不引入代码、配置、测试、CI、数据库文件改动。 | Logic | 执行 `git status --short`。 | 输出仅包含 `AGENTS.md`、`README.md`、`CONTRACT.md`、`TASK.md`（以及本次 superpowers 文档产物）；不包含 `app/`、`src/`、`.github/workflows/`、`docker-compose.yml`、迁移文件等变更。 |
| AC-007 | `README.md` 的文档导航链接有效且可定位。 | Logic | `README.md` 已更新并包含导航。 | 导航中列出的核心文档路径在仓库中实际存在，且名称与路径一致。 |
| AC-008 | `TASK.md` 描述的近期目标与 `CONTRACT.md` 当前能力一致，不出现“任务提到但契约无定义”的能力项。 | Logic | `TASK.md`、`CONTRACT.md` 已更新。 | 以 MCP/Ops/Memory/聊天主链路为样本交叉检查，任务项与契约项能一一对应，不出现断裂。 |
| AC-009 | 文档对齐完成后，四份文档均为 UTF-8 可读中文内容，且不存在未完成占位标记。 | Logic | 四份文档已更新。 | 文档可正常中文读取，检索常见未完成占位词返回空。 |
| AC-010 | 对齐结果满足 spec 的完成定义：边界明确、结构清晰、无冲突、可维护。 | Logic | AC-001 至 AC-009 已通过。 | 评审结论为“通过”；并可明确回答四份文档各自职责，不出现职责重叠冲突。 |
