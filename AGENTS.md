# AGENTS.md

## 项目定位
这是一个本地桌面 AI Agent 陪伴应用的后端。

当前阶段目标：
- 为桌面前端提供可用后端服务
- 支持多会话、多 Persona、模型配置、记忆、Skills、MCP、流式聊天
- 本地运行优先
- Docker Compose 可启动
- SQLite + Qdrant 为第一阶段基础设施

后端技术栈：
- Python 3.11+
- FastAPI
- LangGraph
- SQLAlchemy 2.x
- SQLite
- Qdrant
- Docker Compose

---

## 当前阶段重点
当前阶段必须优先完成：

1. 基础工程结构
2. 配置层
3. 数据模型
4. CRUD API
5. Provider 抽象
6. Memory 基础
7. Skills 基础框架
8. MCP 基础框架
9. LangGraph 最小多 Agent 流程
10. SSE 聊天接口
11. Docker 本地运行
12. 中文 README

---

## 当前阶段不要做
不要优先做以下内容：

- 复杂权限系统
- 多用户账户体系
- 云端同步
- 重型任务队列
- Kafka / RabbitMQ / Celery
- 企业级审计系统
- 复杂监控平台
- 过早性能优化
- 过度微服务拆分

这是本地单用户优先项目，先把主链路做通。

---

## 架构原则
请遵守以下原则：

1. API 层只负责入参与响应，不承载复杂业务
2. 业务逻辑放在 service 层
3. 数据访问放在 repository 层
4. Provider 通过抽象层统一管理
5. Agent 图逻辑放在 agents 层
6. Memory 逻辑独立封装
7. Skills 与 MCP 独立封装
8. Prompt 构建逻辑集中管理，不要散落各处
9. 所有模块命名语义化
10. 优先可维护与可扩展

---

## 目录建议
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
- app/tests

---

## Provider 设计要求
必须统一抽象 provider，不允许业务层到处判断厂商分支。

至少提供统一接口：
- chat
- stream_chat
- embed_texts
- test_connection

优先保证：
- OpenAI-compatible 可用
- Ollama 可用

Anthropic / Gemini 可先保留结构完整的适配层。

---

## Memory 设计要求
必须区分：

1. 短期记忆
2. 中期摘要记忆
3. 长期向量记忆

长期记忆使用 Qdrant。
记忆系统必须可独立测试，不要和 router 强耦合。

---

## Agent 设计要求
多 Agent 架构优先最小可用版本：

- CompanionAgent
- PlannerAgent
- ToolAgent
- MemoryAgent

要求：
- 简单对话不强制经过所有 agent
- 节点职责清晰
- State 结构明确
- 最终回复由 CompanionAgent 汇总

不要为了展示“多 Agent”而过度复杂化。

---

## API 风格要求
要求：
- REST + SSE
- schema 明确
- 错误处理统一
- 不直接返回 ORM 对象
- 响应结构一致

---

## 契约优先级
接口字段、命名与响应结构以 `CONTRACT.md` 为准。

如果实现细节与 `AGENTS.md` 的通用约束出现冲突，接口层行为优先遵循 `CONTRACT.md`，并在变更时同步更新契约文档。

---

## 执行流程要求
每次开始实现前，先给出以下三项再动手：

1. 本次改动范围（涉及模块与文件）
2. 验证命令（本次将执行的构建/测试/导入检查）
3. 不改动文件清单（明确哪些文件本次不碰，避免脏树误改）

---

## 数据库要求
当前阶段主数据库使用 SQLite。
如使用 Alembic，请保证基础迁移可用。
不要过度复杂建模，但要留出扩展空间。

---

## Docker 要求
必须支持本地 Docker Compose 启动。
至少包含：
- app
- qdrant

并提供：
- Dockerfile
- docker-compose.yml
- .env.example

---

## README 要求
README.md 必须使用中文，并至少说明：
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
禁止：

1. 所有逻辑堆在 main.py
2. 所有业务堆在 router
3. 只搭空架子不实现
4. 到处散落 provider if-else
5. 不做分层
6. 把 LangGraph 图写成不可维护的大杂烩
7. 过早引入复杂中间件
8. README 敷衍
9. 大量 any 风格的弱类型数据结构
10. 伪造复杂功能但无法运行

---

## 决策原则
如有多种实现方式，优先选择：

1. 更利于前端对接
2. 更利于本地运行
3. 更利于未来扩展
4. 更利于维护
5. 更利于快速演示主链路
