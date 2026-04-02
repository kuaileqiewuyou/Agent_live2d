# Agent Live2D 后端

面向本地桌面 AI Agent 陪伴应用的后端工程，服务于当前仓库中的 `Tauri 2 + React + TypeScript` 前端。

项目以“本地运行优先、单用户优先、结构可扩展”为原则，提供：

- FastAPI API
- 多会话管理
- Persona 人设系统
- 模型配置管理
- Skills 框架
- MCP 接入层
- LangGraph 多 Agent 编排
- 三层记忆系统
- SSE 流式输出
- Docker 本地部署能力

## 项目简介

这个项目不是云端 SaaS 的裁剪版，而是为“本地桌面 AI 陪伴应用”设计的第一阶段后端底座。

当前重点是先把本地开发、前后端联调、桌面集成需要的核心能力打稳：

- 管理多会话、多 Persona、多模型配置
- 持久化消息、摘要记忆、长期记忆
- 通过统一 Provider 抽象接入不同模型厂商
- 通过 LangGraph 组织最小可用多 Agent 流程
- 提供统一 REST + SSE 接口
- 支持 SQLite + Qdrant 的本地运行

## 核心功能

- 会话系统：创建、查询、更新、删除、绑定 Persona / Model / Skills / MCP / 布局模式
- 消息系统：消息持久化、历史查询、同步回复、SSE 流式回复、重新生成、停止生成接口
- Persona 系统：完整 CRUD，人设参与 Prompt 组装，而不只是前端展示
- 模型配置系统：完整 CRUD，统一 Provider 适配层，支持连接测试
- Skills 系统：注册、查询、启用/禁用、会话绑定、执行入口抽象
- MCP 系统：Server CRUD、连接检查、能力概览、HTTP / stdio 两种传输结构
- 三层记忆：短期消息、中期摘要、Qdrant 长期记忆
- 多 Agent 编排：Planner / Tool / Companion / Memory 最小工作流

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

后端按分层方式组织，避免把逻辑塞进 `router` 或 `main.py`：

- API 层：`app/api`
  负责 REST / SSE 路由、请求响应结构、依赖注入
- Service 层：`app/services`
  负责业务编排，组合 repository、provider、memory、agent
- Repository 层：`app/repositories`
  负责统一数据访问
- Core / Config 层：`app/core`、`app/config`
  负责错误、日志、统一响应、配置等基础设施
- Persistence 层：`app/db`
  负责 SQLAlchemy model、session、数据库初始化
- Provider 层：`app/providers`
  负责大模型统一抽象和工厂
- Agent 层：`app/agents`
  负责 LangGraph state、节点、Prompt 组装
- Memory 层：`app/memory`
  负责嵌入、Qdrant、摘要与长期记忆
- Skills / MCP 层：`app/skills`、`app/mcp`
  负责技能注册与 MCP Server 接入

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

完整示例见 [`.env.example`](/D:/Develop/vscode%20Workspace/Agent_live2d/.env.example)。

常用变量如下：

- `APP_NAME`：应用名称
- `APP_ENV`：运行环境，例如 `development`
- `DEBUG`：是否开启调试
- `API_PREFIX`：API 前缀，默认 `/api`
- `DATABASE_URL`：SQLite 连接串
- `DATA_DIR`：本地数据目录
- `QDRANT_URL`：Qdrant 地址
- `QDRANT_API_KEY`：Qdrant 鉴权，可为空
- `QDRANT_COLLECTION`：长期记忆 collection 名称
- `EMBEDDING_BACKEND`：嵌入实现，当前默认 `simple`
- `EMBEDDING_DIMENSIONS`：向量维度

## 本地开发启动方式

## 一键体验（推荐）

如果你想最短路径体验“Docker 后端 + 前端/桌面端”，可以直接使用下面的命令。

### 1. 仅拉起后端依赖（Docker）

```bash
npm run local:up
```

脚本会自动执行：

- `docker compose up --build -d qdrant app`
- 后端健康检查：`http://127.0.0.1:8001/api/health`

停止服务：

```bash
npm run local:down
```

单独健康检查：

```bash
npm run local:check
```

### 2. 一键跑 Web 开发体验（推荐日常开发）

```bash
npm run local:web
```

这个命令会：

1. 自动拉起 `qdrant + app`
2. 自动等待后端健康检查通过
3. 自动注入 `VITE_USE_MOCK=false` 与 `VITE_API_BASE_URL=http://127.0.0.1:8001`
4. 启动前端开发服务器（Vite）
5. 退出时自动 `docker compose down`

### 3. 一键跑桌面端体验（Tauri）

```bash
npm run local:desktop
```

这个命令会：

1. 自动拉起 `qdrant + app`
2. 自动等待后端健康检查通过
3. 自动注入真实后端环境变量（关闭 mock）
4. 启动 `tauri dev`
5. 退出时自动 `docker compose down`

> 说明：`local:desktop` 需要本机已安装 Tauri/Rust 开发环境。

### 4. 桌面端前置依赖检查（Tauri Doctor）

在运行 `tauri:dev` / `tauri:build` 前，建议先执行：

```bash
npm run desktop:doctor
```

当前会检查：

- `cargo`（Rust 工具链）
- `rustc`（Rust 编译器）
- 本地 `node_modules/.bin/tauri`（`@tauri-apps/cli`）

如果缺少 Rust，可按官方安装方式补齐：

- Rust 安装：[https://www.rust-lang.org/tools/install](https://www.rust-lang.org/tools/install)

---

### 1. 安装 Python 依赖

```bash
python -m pip install -e ".[dev]"
```

### 2. 准备环境变量

```bash
cp .env.example .env
```

Windows PowerShell 下可以手动复制 `.env.example` 为 `.env`。

### 3. 启动后端 API

```bash
npm run backend:dev
```

启动后可访问：

- 健康检查：[http://localhost:8001/api/health](http://localhost:8001/api/health)
- OpenAPI 文档：[http://localhost:8001/docs](http://localhost:8001/docs)

### 4. 桌面端联调（Tauri 2）

推荐使用双终端联调：

- 终端 A（后端）：

```bash
npm run backend:dev
```

- 终端 B（桌面端）：

```bash
npm run tauri:dev
```

说明：

- `tauri:dev` 会按 `src-tauri/tauri.conf.json` 的 `beforeDevCommand` 自动拉起 Vite（`http://localhost:1420`）
- 前端通过 `.env.development` 的 `VITE_API_BASE_URL=http://127.0.0.1:8001` 访问后端
- 如果仅调试 Web 页面，可直接运行 `npm run dev`

### 5. 运行测试

```bash
python -m pytest -q
```

前端单元测试与 E2E（Playwright）：

```bash
npm run test:unit
npm run test:e2e:install
npm run test:e2e
```

`test:e2e` 会自动复用已启动服务，或在本地拉起：
- FastAPI: `http://127.0.0.1:8001`
- Vite: `http://127.0.0.1:5173`

### 6. CI（PR 自动检查）

仓库已提供 GitHub Actions 工作流，在 PR 中自动执行：

```bash
python -m pytest -q
npm run test:unit
npm run build
npm run test:e2e
```

建议在仓库设置中将该工作流设为 Required status check，确保主分支只接收通过回归的改动。

另外新增了 `Desktop + Docker Smoke` 工作流：

- 触发条件：`pull_request`（当 Docker / Tauri / 构建相关文件变更时）和 `workflow_dispatch`
- 检查内容：
  - 前端构建（Tauri 前端资源）
  - `docker compose config` 配置校验
  - `app + qdrant` 容器拉起
  - 后端健康检查 `GET /api/health`

还提供了 `Release Smoke` 手动工作流（`workflow_dispatch`）：

- 默认执行完整发布前自检（含 E2E）
- 可选 `skip_e2e=true` 进行快速 smoke
- `Release Process Guard` 会在 PR 时校验：
  - 仅在目标分支为 `main` 的 PR 中触发
  - 是否关联了 Release Ticket（`#123` 或 issue 链接）
  - PR 清单中的关键项是否已勾选（`pytest`、`test:unit`、`smoke:release`、`docker up`、`/api/health`）

### 发布协作模板

仓库已提供发布协作模板：

- 发布工单模板：`.github/ISSUE_TEMPLATE/release-ticket.yml`
- PR 模板（含手动发布检查清单）：`.github/pull_request_template.md`

建议流程：

1. 先创建 Release Ticket，明确版本、范围、风险、回滚和 preflight 勾选项
2. 开 PR 时按模板完成手动检查清单
3. 清单全部通过后再进入合并/发布

### 7. 发布前一键自检

可以直接运行：

```bash
npm run smoke:release
```

该命令会按顺序执行：

1. `python -m pytest -q`
2. `npm run test:unit`
3. `npm run test:e2e`
4. `docker compose up --build -d app qdrant`
5. 健康检查 `http://127.0.0.1:8001/api/health`
6. `docker compose down`

如果你只想快速跳过 E2E，可用：

```bash
npm run smoke:release -- --skip-e2e
```

## Docker 启动方式

项目提供 `app + qdrant` 两个服务：

```bash
npm run docker:up
```

启动后：

- FastAPI：[http://localhost:8001](http://localhost:8001)（健康检查：`/api/health`）
- Qdrant：[http://localhost:6333](http://localhost:6333)

如果只想后台运行：

```bash
npm run docker:up:d
```

查看日志：

```bash
npm run docker:logs
```

停止并清理：

```bash
npm run docker:down
```

可选 smoke 命令：

```bash
npm run smoke:backend
```

## SQLite 说明

- 第一阶段主数据库使用 SQLite
- 默认文件路径：`./data/app.db`
- 当前使用 SQLAlchemy 2.x + `aiosqlite`
- 适合本地桌面单用户场景，后续可平滑替换到 PostgreSQL

主要表包括：

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

长期记忆使用 Qdrant 做向量检索，关系元数据仍保留在 SQLite 中。

- 默认 collection：`long_term_memories`
- 支持 `conversation_id`、`persona_id`、`memory_scope` 等过滤条件
- 当前默认嵌入实现为本地 `simple` hash embedding，保证无外部模型时也能启动
- 后续可以替换为 OpenAI-compatible、Ollama 或其他真实 embedding provider

## Provider 配置说明

统一接口位于 [app/providers/base.py](/D:/Develop/vscode%20Workspace/Agent_live2d/app/providers/base.py)，对外提供：

- `chat()`
- `stream_chat()`
- `embed_texts()`
- `test_connection()`

当前适配情况：

- `openai-compatible`
  - 优先走 `/chat/completions` 和 `/embeddings`
  - 无法连接时提供本地回退，保证链路可运行
- `ollama`
  - 优先走 `/api/chat` 和 `/api/embeddings`
  - 同样提供本地回退
- `anthropic`
  - 结构已预留，当前为占位适配器
- `gemini`
  - 结构已预留，当前为占位适配器

## API 概览

完整接口契约见 [CONTRACT.md](/D:/Develop/vscode%20Workspace/Agent_live2d/CONTRACT.md)。

主要接口包括：

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

前端当前通过 `src/services` 对接以下路径：

- `/api/conversations`
- `/api/conversations/{id}`
- `/api/conversations/{id}/messages`
- `/api/personas`
- `/api/models/configs`
- `/api/skills`
- `/api/mcp/servers`

后端返回字段使用 camelCase，便于直接对接 React + TypeScript 类型定义。

当前要特别注意：

- `POST /messages` 返回 `userMessage + assistantMessage` 双消息结构
- 前端接入时应同时更新消息 store，保留完整对话轮次
- SSE 事件包括 `message_created`、`thinking`、`tool_calling`、`token`、`final_answer`、`stopped`

## 记忆系统说明

### 短期记忆

- 取当前会话最近若干条消息
- 用于 Prompt 直接上下文

### 中期摘要记忆

- 消息达到阈值后生成摘要
- 存入 `memory_summaries`
- 用于降低上下文长度

### 长期记忆

- 同时写入 SQLite 元数据与 Qdrant 向量索引
- 支持 Persona / Conversation 维度组织
- 新会话可按 Persona 策略注入长期记忆，但短期上下文默认从空开始

## Skills / MCP 说明

### Skills

- 结构上支持 prompt skill、tool skill、workflow skill
- 当前已有示例技能执行器与注册表
- 会话可绑定启用的 skills 列表
- ToolAgent 可将技能执行结果纳入回复上下文

### MCP

- 当前支持 `http` 与 `stdio` 两种 transport
- 提供 server CRUD、连接检查、能力概览接口
- 设计上不把 MCP 耦合到单一 agent，后续可接入更完整的 MCP client

## 多 Agent 工作流

当前最小可用角色：

- `PlannerAgent`
  - 判断是否需要工具或额外编排
- `ToolAgent`
  - 汇总 Skills / MCP 结果
- `CompanionAgent`
  - 构建最终 Prompt 并生成回复
- `MemoryAgent`
  - 负责摘要与长期记忆同步

LangGraph state 的核心字段包括：

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

当前已经验证：

- FastAPI 可以启动
- 健康检查可用
- Persona / Conversation / Message 基础 CRUD 可用
- SSE 流式接口可用
- SQLite 可用
- Qdrant 接入结构可用，并带本地回退
- OpenAI-compatible Provider 最小链路可用

## 后续规划

- 引入 Alembic 管理数据库迁移
- 完成 Anthropic / Gemini 的真实适配
- 将 embedding provider 替换为可配置的真实实现
- 丰富 Skills 执行器和 Skill Marketplace 结构
- 升级 MCP client 到更完整的协议交互
- 将停止生成改造成更精细的取消控制
- 增加 agent run trace、日志追踪和观测能力
- 与前端 store 和 SSE 消费层做最终契约对齐
