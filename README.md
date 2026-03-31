# Agent Live2D 后端

一个面向本地桌面 AI Agent 陪伴应用的后端工程，服务于当前仓库中的 Tauri 2 + React + TypeScript 前端。项目以“本地运行优先、单用户优先、结构可扩展”为原则，提供 FastAPI API、多会话管理、Persona、人设记忆、模型适配、多 Agent 编排、Skills、MCP 接入、SSE 流式输出，以及 Docker 本地部署能力。

## 项目简介

这个后端用于支撑本地桌面 AI Agent 陪伴应用的核心运行时。它不是云端 SaaS 的裁剪版，而是针对本地开发、桌面集成和未来扩展做的第一阶段稳定底座。

目前重点解决的问题：

- 管理多会话、多 Persona、多模型配置
- 将消息、摘要记忆、长期记忆落地持久化
- 通过统一 Provider 抽象接入不同模型厂商
- 通过 LangGraph 组织 Companion / Planner / Tool / Memory 多 Agent 最小工作流
- 为前端提供统一 REST + SSE 接口
- 在本地 Docker 中同时拉起 FastAPI 与 Qdrant

## 核心功能

- 会话系统：创建、查询、更新、删除、绑定 Persona / Model / Skills / MCP / 布局模式
- 消息系统：消息持久化、历史查询、同步回复、SSE 流式回复、重新生成、停止生成接口
- Persona 系统：完整 CRUD，人设参与 Prompt 组装而不是只做展示
- 模型配置系统：完整 CRUD，统一 Provider 适配层，支持连接测试
- Skills 系统：注册、查询、开关、会话绑定、执行入口抽象
- MCP 系统：Server CRUD、连接检查、能力概览、HTTP / stdio 两种传输结构
- 三层记忆：短期消息、摘要记忆、Qdrant 长期记忆
- 多 Agent 编排：LangGraph 驱动的 Planner / Tool / Companion / Memory 流程
- 本地优先运行：SQLite、Qdrant、Docker Compose、离线回退模型响应

## 技术栈

- Python 3.11+
- FastAPI
- Uvicorn
- Pydantic v2
- SQLAlchemy 2.x
- SQLite
- LangGraph
- LangChain Core
- httpx
- orjson
- sse-starlette
- qdrant-client
- Docker Compose

## 架构说明

后端采用分层组织，避免把逻辑堆进 router 或 main 文件。

- API 层：`app/api`
  - 定义 REST / SSE 路由，做入参与出参转换
- Service 层：`app/services`
  - 承担业务编排，组合 repository、provider、memory、agent
- Repository 层：`app/repositories`
  - 统一 SQLAlchemy 数据访问
- Domain / Core 层：`app/core`、`app/config`
  - 配置、错误、统一响应、日志等基础设施
- 持久化层：`app/db`
  - SQLAlchemy Base、模型、session、初始化
- Provider 层：`app/providers`
  - 统一大模型抽象与工厂
- Agent 层：`app/agents`
  - LangGraph state、节点、Prompt 组装
- Memory 层：`app/memory`
  - 嵌入、Qdrant、摘要与长期记忆逻辑
- Skills / MCP 层：`app/skills`、`app/mcp`
  - 技能注册与 MCP server 基础接入

## 目录结构

```text
app/
  api/
    routes/
  agents/
  config/
  core/
  db/
  memory/
  mcp/
  providers/
  repositories/
  schemas/
  services/
  skills/
tests/
Dockerfile
docker-compose.yml
.env.example
CONTRACT.md
README.md
pyproject.toml
```

## 环境变量说明

核心变量如下，完整示例见 `.env.example`。

- `APP_NAME`：应用名称
- `APP_ENV`：运行环境，如 `development`
- `DEBUG`：是否开启调试
- `API_PREFIX`：API 前缀，默认 `/api`
- `DATABASE_URL`：SQLite 连接串
- `DATA_DIR`：本地数据目录
- `QDRANT_URL`：Qdrant 地址
- `QDRANT_API_KEY`：Qdrant 鉴权，默认可空
- `QDRANT_COLLECTION`：长期记忆 collection 名称
- `EMBEDDING_BACKEND`：嵌入实现，当前默认 `simple`
- `EMBEDDING_DIMENSIONS`：向量维度

## 本地开发启动方式

### 1. 安装 Python 依赖

```bash
python -m pip install -e ".[dev]"
```

### 2. 准备环境变量

```bash
cp .env.example .env
```

Windows PowerShell 可直接手动复制 `.env.example` 为 `.env`。

### 3. 启动 API

```bash
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

启动后访问：

- 健康检查：[http://localhost:8001/api/health](http://localhost:8001/api/health)
- OpenAPI 文档：[http://localhost:8001/docs](http://localhost:8001/docs)

### 4. 运行测试

```bash
python -m pytest -q
```

## Docker 启动方式

项目已提供 `app + qdrant` 两个服务。

```bash
docker compose up --build
```

启动后：

- FastAPI：`http://localhost:8001`
- Qdrant：`http://localhost:6333`

如果你只想后台运行：

```bash
docker compose up --build -d
```

## SQLite 说明

- 第一阶段主数据库使用 SQLite
- 默认文件位置：`./data/app.db`
- 当前使用 SQLAlchemy 2.x 异步模式 + `aiosqlite`
- 适合本地桌面单用户场景，后续可平滑替换到 PostgreSQL

主要表：

- `conversations`
- `messages`
- `personas`
- `model_configs`
- `skills`
- `mcp_servers`
- `conversation_skills`
- `conversation_mcp_servers`
- `memory_summaries`
- `long_term_memories`
- `agent_runs`

## Qdrant 说明

长期记忆使用 Qdrant 做向量检索，关系元数据仍落在 SQLite 中。

- collection 默认名：`long_term_memories`
- 支持按 `conversation_id`、`persona_id`、`memory_scope` 过滤
- 当前嵌入实现默认为本地 `simple` hash embedding，保证无外部模型时也能启动
- 未来可以替换为 OpenAI-compatible、Ollama 或其他真实 embedding provider

## Provider 配置说明

统一接口位于 `app/providers/base.py`，对外提供：

- `chat()`
- `stream_chat()`
- `embed_texts()`
- `test_connection()`

当前适配情况：

- `openai-compatible`
  - 优先走 `/chat/completions` 和 `/embeddings`
  - 无法连接时自动进入本地回退响应，保证链路可运行
- `ollama`
  - 优先走 `/api/chat` 与 `/api/embeddings`
  - 同样提供本地回退
- `anthropic`
  - 结构已预留，当前为占位适配器
- `gemini`
  - 结构已预留，当前为占位适配器

## API 概览

完整契约见 [CONTRACT.md](/D:/Develop/vscode%20Workspace/Agent_live2d/CONTRACT.md)。

主要接口：

- `GET /api/health`
- `GET/POST/PATCH/DELETE /api/conversations`
- `GET/POST /api/conversations/{conversation_id}/messages`
- `POST /api/conversations/{conversation_id}/messages/stream`
- `POST /api/conversations/{conversation_id}/messages/regenerate`
- `POST /api/conversations/{conversation_id}/messages/stop`
- `GET/POST/PATCH/DELETE /api/personas`
- `GET/POST/PATCH/DELETE /api/models/configs`
- `POST /api/models/configs/{config_id}/test`
- `GET/POST/PATCH/DELETE /api/skills`
- `POST /api/skills/{skill_id}/toggle`
- `GET/POST/PATCH/DELETE /api/mcp/servers`
- `POST /api/mcp/servers/{server_id}/check`
- `GET /api/mcp/servers/{server_id}/capabilities`
- `GET/POST /api/memory/long-term`
- `POST /api/memory/search`
- `POST /api/memory/summarize`
- `GET /api/meta/providers`
- `GET /api/meta/layout-modes`
- `GET /api/meta/live2d-states`

统一响应格式：

```json
{
  "success": true,
  "data": {},
  "message": null
}
```

## 与前端对接说明

前端当前在 `src/services` 中已使用如下路径：

- `/api/conversations`
- `/api/conversations/{id}`
- `/api/conversations/{id}/messages`
- `/api/personas`
- `/api/models/configs`
- `/api/skills`
- `/api/mcp/servers`

后端返回字段使用 camelCase，便于直接对接当前 React + TypeScript 类型定义。当前 `POST /messages` 返回 `userMessage + assistantMessage` 双消息结构，前端接入时建议同步更新消息 store，以便完整保留一次对话轮次。

SSE 流式接口事件包括：

- `message_created`
- `thinking`
- `tool_calling`
- `token`
- `final_answer`
- `stopped`

## 记忆系统说明

### 短期记忆

- 取当前会话最近若干条消息
- 用于 Prompt 主上下文

### 中期摘要记忆

- 当消息达到阈值后生成摘要
- 存入 `memory_summaries`
- 用于降低上下文长度

### 长期记忆

- 同时写入 SQLite 元数据与 Qdrant 向量索引
- 支持 Persona / Conversation 维度组织
- 新会话可按 Persona 策略继续注入长期记忆，但短期上下文默认从空开始

## Skills / MCP 说明

### Skills

- 结构上支持 prompt skill、tool skill、workflow skill
- 当前内置了示例技能执行器与注册表
- 会话可绑定启用的 skills 列表
- ToolAgent 可将技能执行结果纳入回答上下文

### MCP

- 当前支持 `http` 与 `stdio` 两种 transport
- 提供 server CRUD、连接检查、能力概览接口
- 不将 MCP 耦合到单一 agent，后续可接入更完整的 MCP client 实现

## 多 Agent 工作流

当前最小可用角色：

- `PlannerAgent`
  - 判断是否需要工具或额外编排
- `ToolAgent`
  - 汇总 Skills / MCP 结果
- `CompanionAgent`
  - 构建最终 Prompt，负责回复
- `MemoryAgent`
  - 标记记忆同步流程，配合 service 层落摘要和长期记忆

LangGraph state 核心字段包括：

- `conversation_id`
- `user_input`
- `persona`
- `model_config`
- `recent_messages`
- `summary_memory`
- `long_term_memories`
- `enabled_skills`
- `enabled_mcp_servers`
- `planner_output`
- `tool_results`
- `prompt_messages`
- `final_response`
- `stream_events`
- `stop_requested`

## 当前可运行性说明

已验证：

- FastAPI 可启动
- 健康检查可用
- Persona / Conversation / Message 基础 CRUD 可用
- SSE 流式接口可用
- SQLite 可用
- Qdrant 接入结构可用，并有本地回退
- OpenAI-compatible Provider 最小聊天链路可用

## 后续规划

- 用 Alembic 管理数据库迁移
- 为 Anthropic / Gemini 完成真实生产级适配
- 把 embedding provider 替换为真实可配置实现
- 丰富 Skills 执行器和 Skill Marketplace 结构
- 升级 MCP client 到更完整的协议交互
- 将停止生成改造成更精细的取消控制
- 增加 agent run trace、日志追踪和观测能力
- 与前端 store 和 SSE 消费层做最终契约对齐
