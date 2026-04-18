# AGENTS.md

## 项目定位
这是一个本地桌面 AI Agent 陪伴应用的后端（含前后端联调工程）。

当前目标：
- 优先打通本地主链路并保证可演示、可回归
- 支持多会话、多 Persona、模型配置、记忆、Skills、MCP、流式聊天
- 默认本地运行，支持 Docker Compose
- 基础设施以 SQLite + Qdrant 为主

后端技术栈：
- Python 3.11+
- FastAPI
- LangGraph
- SQLAlchemy 2.x
- SQLite
- Qdrant
- Docker Compose

---

## 当前阶段重点（按优先级）
1. 聊天主链路稳定（stream / stop / regenerate / fallback）
2. Ops Assistant 可聊天、可命令执行、可追踪状态
3. MCP 真实接入最小闭环（至少 1 条真实可调用链路）
4. Skill 真实执行最小闭环（非占位）
5. Memory 三层能力可用且降级不阻断聊天
6. 测试与 CI 可回归（unit / api / e2e / smoke）
7. 中文 README 与 CONTRACT 对齐维护

---

## 当前阶段不要做
- 复杂权限系统
- 多用户账户体系
- 云端同步
- 重型任务队列（Kafka / RabbitMQ / Celery）
- 企业级审计系统
- 复杂监控平台
- 过早性能优化
- 过度微服务拆分

---

## 架构原则
1. API 层只负责入参与响应，不承载复杂业务
2. 业务逻辑放在 service 层
3. 数据访问放在 repository 层
4. Provider 通过抽象层统一管理
5. Agent 图逻辑放在 agents 层
6. Memory 逻辑独立封装
7. Skills 与 MCP 独立封装
8. Prompt 构建逻辑集中管理，不要散落
9. 模块命名语义化
10. 优先可维护与可扩展

---

## 目录约定
建议至少包含：
- app/api
- app/core
- app/config
- app/models
- app/schemas
- app/services
- app/repositories
- app/agents
- app/memory
- app/providers
- app/skills
- app/mcp
- app/db
- app/utils
- tests

---

## 文档真源与同步规则（强制）
### 单一真源
- 协作规则与流程约束：只在 `AGENTS.md` 主定义
- 接口字段与行为契约：只在 `CONTRACT.md` 主定义
- 接手入口与运行指引：只在 `README.md` 主定义
- 执行状态与里程碑：只在 `TASK.md` 主定义

### 联动规则
- 变更接口行为时，必须同步更新 `CONTRACT.md`
- 调整流程约束时，必须同步更新 `AGENTS.md`
- 更新阶段状态时，只更新 `TASK.md`
- `README.md` 只保留入口级说明，不重复契约细节

### 契约优先级
- 接口字段、命名、响应结构以 `CONTRACT.md` 为准
- 若实现与通用约束冲突，接口行为优先遵循 `CONTRACT.md`
- 变更接口行为时必须同步更新契约文档

---

## Provider 设计要求
必须统一抽象 provider，不允许业务层散落厂商分支。

统一接口至少包含：
- `chat`
- `stream_chat`
- `embed_texts`
- `test_connection`

阶段优先级：
- OpenAI-compatible 可用
- Ollama 可用
- Anthropic / Gemini 先保证最小可用与结构完整

---

## Memory 设计要求
必须区分：
1. 短期记忆
2. 中期摘要记忆
3. 长期向量记忆（Qdrant）

要求：
- 记忆系统可独立测试
- Qdrant 异常时不阻断聊天主链路（要有降级）

---

## Agent 设计要求
最小可用多 Agent：
- CompanionAgent
- PlannerAgent
- ToolAgent
- MemoryAgent

要求：
- 简单对话不强制经过所有 agent
- 节点职责清晰、State 结构明确
- 最终回复由 CompanionAgent 汇总

---

## API 与契约要求
- REST + SSE
- schema 明确
- 错误处理统一
- 不直接返回 ORM 对象
- 响应结构一致

---

## Superpower-plus 执行约定（强制）
从现在开始，本仓库严格遵循 superpower-plus。

### 1) 流程要求（无例外）
- 任何任务都必须先走完整流程：`brainstorming -> writing-acceptance-criteria -> writing-plans -> executing-plans`
- 未走流程不得改代码、配置、文档或测试
- 不再区分“轻量任务直改”与“中大型任务走流程”
- 如需跳过任一步骤，必须由你在当前会话明确授权

### 2) Codex 环境偏好
- 默认优先 `executing-plans`
- 只有任务明确可并行且收益明显时，才使用 subagent 并行
- 非我明确要求时，不默认创建 worktree
- 非我明确要求时，不默认把 spec/plan 提交 git

### 3) 关键操作必须先确认
以下操作必须先得到明确确认：
- 删除文件
- 大规模重构
- 修改 git 历史
- 推送远程
- 修改环境配置
- 修改 CI
- 数据库变更

---

## 每次开始实现前（必须先给出）
1. 本次改动范围（涉及模块与文件）
2. 验证命令（本次将执行的构建/测试/导入检查）
3. 不改动文件清单（明确哪些文件本次不碰）

---

## 数据库要求
- 当前阶段主数据库使用 SQLite
- 如使用 Alembic，需保证基础迁移可用
- 建模不过度复杂，但保留扩展空间

---

## Docker 要求
必须支持本地 Docker Compose 启动，至少包含：
- app
- qdrant

并提供：
- Dockerfile
- docker-compose.yml
- .env.example

---

## README 要求
`README.md` 必须使用中文，并至少说明：
- 项目简介
- 功能
- 技术栈
- 目录结构
- 启动方式
- Docker 使用
- API 概览
- Provider 配置
- Memory 机制
- Skills / MCP 说明
- 与前端对接说明

---

## 禁止事项
1. 所有逻辑堆在 `main.py`
2. 所有业务堆在 router
3. 只搭空架子不实现
4. Provider if-else 到处散落
5. 不做分层
6. LangGraph 图写成不可维护的大杂烩
7. 过早引入复杂中间件
8. README 敷衍
9. 大量弱类型“any 风格”结构
10. 伪造复杂功能但无法运行

---

## 决策原则
多种实现方式并存时，优先选择：
1. 更利于前端对接
2. 更利于本地运行
3. 更利于未来扩展
4. 更利于维护
5. 更利于快速演示主链路
