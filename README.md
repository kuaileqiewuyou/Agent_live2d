# Agent Live2D 后端

面向本地桌面 AI Agent 陪伴应用的后端工程，服务于当前仓库中的 `Tauri 2 + React + TypeScript` 前端。

本项目遵循“本地运行优先、单用户优先、结构可扩展”，优先保证主链路可演示、可回归、可迭代。

---

## 项目简介

这是“本地桌面 AI 陪伴应用”第一阶段后端底座，不是云端 SaaS 裁剪版。

当前核心目标：
- 稳定聊天主链路（含 stream/stop/regenerate/fallback）
- 支持多会话、多 Persona、多模型配置
- 支持 Skills / MCP / Memory 的最小可用闭环
- 支持前后端联调与桌面端（Tauri）集成

---

## 功能概览

- 会话系统：会话 CRUD、绑定 Persona / Model / Skills / MCP / 布局模式
- 消息系统：消息持久化、SSE 流式回复、停止生成、重新生成
- Persona 系统：人设管理与 Prompt 注入
- 模型配置系统：多 Provider 配置与连接测试
- Skills 系统：技能注册、启停、会话绑定与执行入口
- MCP 系统：Server CRUD、连通性检查、能力概览、smoke 验收
- 记忆系统：短期消息 + 中期摘要 + 长期向量（Qdrant）
- 多 Agent 编排：Planner / Tool / Companion / Memory 最小工作流

---

## 技术栈

- Python 3.11+
- FastAPI
- SQLAlchemy 2.x
- SQLite
- Qdrant
- LangGraph
- Docker Compose

---

## 目录结构

```text
app/
  api/
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
AGENTS.md
TASK.md
README.md
```

---

## 快速开始

### 1) 准备环境变量

```bash
cp .env.example .env
```

Windows PowerShell 可手动复制 `.env.example` 为 `.env`。

### 2) 安装 Python 依赖

```bash
python -m pip install -e ".[dev]"
```

### 3) 启动后端（本地开发）

```bash
npm run backend:dev
```

可访问：
- 健康检查：`http://127.0.0.1:8001/api/health`
- OpenAPI：`http://127.0.0.1:8001/docs`

---

## Docker 使用

### 启动（前台）

```bash
npm run docker:up
```

### 启动（后台）

```bash
npm run docker:up:d
```

### 查看日志

```bash
npm run docker:logs
```

### 停止并清理

```bash
npm run docker:down
```

默认服务：
- FastAPI：`http://localhost:8001`
- Qdrant：`http://localhost:6333`

---

## 本地联调（推荐）

### 一键 Web 联调

```bash
npm run local:web
```

该命令会自动拉起 `app + qdrant`、注入前端环境变量并启动 Vite。

### 一键桌面端联调（Tauri）

```bash
npm run local:desktop
```

> 需要本机已安装 Rust / Tauri 开发环境。

### 最稳双终端模式

终端 A：

```bash
npm run backend:dev
```

终端 B：

```bash
npm run local:web:only
```

---

## 最小联调路径

建议按以下顺序快速验证主链路：

1. `GET /api/health` 返回 `success=true`
2. 创建会话：`POST /api/conversations`
3. 发送消息：`POST /api/conversations/{conversationId}/messages`
4. 流式链路：`POST /api/conversations/{conversationId}/messages/stream`
5. 控制链路：`POST /api/conversations/{conversationId}/messages/stop` 与 `.../regenerate`

---

## API 概览

接口主前缀：`/api`

能力分组：
- Health
- Conversations / Messages（含 stream、stop、regenerate、dedupe）
- Personas
- Model Configs
- Skills
- MCP Servers（含 check/capabilities/smoke）
- Memory
- Settings
- Meta
- Ops（MCP 安装与命令执行）

详细请求/响应字段、错误码、SSE 事件，以 [CONTRACT.md](./CONTRACT.md) 为唯一契约真源。

---

## Provider 配置

Provider 统一抽象位于 `app/providers/base.py`，统一接口：
- `chat()`
- `stream_chat()`
- `embed_texts()`
- `test_connection()`

当前阶段：
- `openai-compatible`：可用
- `ollama`：可用
- `anthropic` / `gemini`：最小结构占位

---

## Memory 机制

- 短期记忆：最近消息上下文
- 中期记忆：阈值触发摘要（`memory_summaries`）
- 长期记忆：SQLite 元数据 + Qdrant 向量索引

降级原则：Qdrant 异常不阻断聊天主链路。

---

## Skills / MCP 说明

### Skills
- 支持 prompt / tool / workflow 类型扩展
- 会话可绑定启用技能
- ToolAgent 可将技能结果并入回复上下文

### MCP
- 支持 `http` 与 `stdio` transport
- 支持服务配置、连通性检查、能力发现和 smoke 验收
- 支持在聊天链路中执行 MCP 工具调用

---

## 与前端对接说明

前端通过 `src/services` 对接后端 API。

对接原则：
- 字段命名采用 `camelCase`
- 接口行为以 `CONTRACT.md` 为准
- SSE 事件以契约定义为准，前端按事件类型与 `live2dState` 消费

---

## 测试与回归

### 后端

```bash
python -m pytest -q
```

### 前端与 E2E

```bash
npm run check:text-encoding
npm run test:unit
npm run test:e2e
```

---

## 文档导航

- [AGENTS.md](./AGENTS.md)：协作规则、流程约束、实施边界
- [CONTRACT.md](./CONTRACT.md)：接口契约与错误语义（唯一真源）
- [TASK.md](./TASK.md)：当前执行状态、里程碑与验收标准

---

## 当前阶段不要做

- 复杂权限系统、多用户体系、云端同步
- 重型任务队列（Kafka/RabbitMQ/Celery）
- 复杂监控平台、企业级审计系统
- 过早性能优化与过度微服务拆分
