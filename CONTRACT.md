# Agent Live2D 前后端接口契约

本文档定义当前仓库前后端联调时使用的后端接口契约。
接口行为以本文档为准，统一前缀为 `/api`。

## 0. 通用约定

### 0.1 统一响应结构

```json
{
  "success": true,
  "data": {},
  "message": null
}
```

错误场景：

```json
{
  "success": false,
  "data": {
    "code": "not_found"
  },
  "message": "persona not found"
}
```

### 0.2 命名与时间格式
- 请求与响应字段统一使用 `camelCase`
- `id` 为字符串（UUID）
- 时间字段使用 ISO8601（UTC），例如 `2026-03-31T00:00:00Z`

### 0.3 List 响应约定

```json
{
  "success": true,
  "data": {
    "items": [],
    "total": 0
  },
  "message": null
}
```

## 1. 健康检查

### `GET /api/health`

响应示例：

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "appName": "Agent Live2D Backend",
    "environment": "development"
  },
  "message": null
}
```

## 2. Conversations

### 会话对象

```json
{
  "id": "uuid",
  "title": "新的会话",
  "personaId": "uuid",
  "modelConfigId": "uuid",
  "layoutMode": "chat",
  "enabledSkillIds": [],
  "enabledMcpServerIds": [],
  "pinned": false,
  "lastMessage": "最近一条消息",
  "persona": null,
  "modelConfigDetail": null,
  "skills": [],
  "mcpServers": [],
  "createdAt": "2026-03-31T00:00:00Z",
  "updatedAt": "2026-03-31T00:00:00Z"
}
```

### `GET /api/conversations`
- 返回 `ListData<Conversation>`

### `POST /api/conversations`

请求体：

```json
{
  "title": "新的会话",
  "personaId": "uuid",
  "modelConfigId": "uuid",
  "layoutMode": "chat",
  "enabledSkillIds": [],
  "enabledMcpServerIds": [],
  "pinned": false,
  "inheritPersonaLongTermMemory": true
}
```

说明：
- `inheritPersonaLongTermMemory` 当前作为兼容字段保留，不影响最小主链路创建。

### `GET /api/conversations/{conversationId}`
- 返回单个 `Conversation`

### `PATCH /api/conversations/{conversationId}`
- 支持部分更新：`title/personaId/modelConfigId/layoutMode/enabledSkillIds/enabledMcpServerIds/pinned`

### `DELETE /api/conversations/{conversationId}`

```json
{
  "success": true,
  "data": {
    "deleted": true,
    "id": "uuid"
  },
  "message": null
}
```

## 3. Messages

### 消息对象

```json
{
  "id": "uuid",
  "conversationId": "uuid",
  "role": "user",
  "senderType": "user",
  "senderName": "User",
  "agentName": null,
  "content": "你好",
  "reasoning": null,
  "toolName": null,
  "toolStatus": null,
  "metadata": {},
  "attachments": [],
  "createdAt": "2026-03-31T00:00:00Z"
}
```

### 附件对象（若传）

```json
{
  "id": "att-1",
  "name": "note.txt",
  "type": "text/plain",
  "url": "https://example.com/note.txt",
  "size": 123
}
```

### 手动工具请求对象 `manualToolRequests[]`

```json
{
  "id": "manual-1",
  "type": "skill",
  "targetId": "uuid",
  "label": "summary skill",
  "inputText": "goal: summarize",
  "inputParams": {
    "goal": "summary"
  },
  "autoExecute": false
}
```

说明：
- `type` 仅支持 `skill` 或 `mcp`
- API 层期望 `inputParams` 为键值对象（字符串键）
- 后端会做参数归一化与 Skill schema 校验，非法时返回 `validation_error`

### `GET /api/conversations/{conversationId}/messages`
- 返回 `ListData<Message>`

### `POST /api/conversations/{conversationId}/messages`

请求体：

```json
{
  "content": "你好，今天过得怎么样？",
  "attachments": [],
  "metadata": {
    "requestId": "req-001"
  },
  "manualToolRequests": [],
  "modelConfigId": "uuid"
}
```

说明：
- `modelConfigId` 为可选字段，仅覆盖“本次消息请求”使用的模型，不会改写 `Conversation.modelConfigId`
- 若未传 `modelConfigId`，后端使用会话默认模型配置

响应体：

```json
{
  "success": true,
  "data": {
    "userMessage": {},
    "assistantMessage": {}
  },
  "message": null
}
```

### `POST /api/conversations/{conversationId}/messages/stream`
- 请求体与 `POST /messages` 相同
- 返回类型：`text/event-stream`

SSE 事件（主链路）：
- `message_created`
- `thinking`
- `tool_calling`
- `tool_result`
- `memory_sync`
- `token`
- `final_answer`
- `stopped`

`live2dState` 约定：
- 取值：`idle` / `thinking` / `talking` / `error`
- 对以上主链路事件，后端默认会附带 `live2dState`
- 前端消费时若 payload 含 `live2dState` 应优先使用

关键事件字段：
- `message_created`: `{ "userMessageId": "..." }`
- `token`: `{ "content": "..." }`
- `tool_result`: 可能包含 `type/name/label/title/summary/result/manual/executionMode/error/toolName/inputParams`
- `final_answer`: `{ "messageId": "...", "content": "...", "toolUsage": {...}, "manualToolRequests": [...] }`
- `stopped`: `{ "conversationId": "..." }`

示例：

```text
event: token
data: {"content":"你好","live2dState":"talking"}

event: final_answer
data: {"messageId":"uuid","content":"你好，我在。","toolUsage":{"totalCount":2},"manualToolRequests":[],"live2dState":"idle"}
```

### `POST /api/conversations/{conversationId}/messages/regenerate`
- 基于最近一条 user 消息重新生成 assistant 回复
- regenerate 会优先复用最近一条 user 消息 `metadata.runtimeModelConfigId` 对应的模型
- 若该模型已失效/不存在，自动回退到 `Conversation.modelConfigId`

### `POST /api/conversations/{conversationId}/messages/stop`

```json
{
  "success": true,
  "data": {
    "stopped": true,
    "conversationId": "uuid"
  },
  "message": null
}
```

### `POST /api/conversations/{conversationId}/messages/dedupe`

```json
{
  "success": true,
  "data": {
    "conversationId": "uuid",
    "totalBefore": 24,
    "totalAfter": 20,
    "deletedCount": 4,
    "deletedTurnCount": 2,
    "deletedMessageIds": ["uuid-1", "uuid-2"]
  },
  "message": null
}
```

## 4. Personas

### Persona 对象

```json
{
  "id": "uuid",
  "name": "晨曦",
  "avatar": "avatar.png",
  "description": "温柔陪伴型角色",
  "personalityTags": ["温柔", "陪伴"],
  "speakingStyle": "轻柔、自然",
  "backgroundStory": "来自晨光小镇",
  "openingMessage": "今天想聊点什么？",
  "longTermMemoryEnabled": true,
  "live2dModel": "haru.model3.json",
  "defaultLayoutMode": "companion",
  "systemPromptTemplate": "你是 {{persona_name}}，请始终以她的人设说话。",
  "createdAt": "2026-03-31T00:00:00Z",
  "updatedAt": "2026-03-31T00:00:00Z"
}
```

接口：
- `GET /api/personas`
- `POST /api/personas`
- `GET /api/personas/{personaId}`
- `PATCH /api/personas/{personaId}`
- `DELETE /api/personas/{personaId}`

## 5. Model Configs

### Model Config 对象

```json
{
  "id": "uuid",
  "name": "本地 OpenAI 兼容模型",
  "provider": "openai-compatible",
  "baseUrl": "http://localhost:11434/v1",
  "apiKey": "local-key",
  "model": "gpt-test",
  "streamEnabled": true,
  "toolCallSupported": true,
  "isDefault": true,
  "extraConfig": {
    "temperature": 0.7
  },
  "createdAt": "2026-03-31T00:00:00Z",
  "updatedAt": "2026-03-31T00:00:00Z"
}
```

接口：
- `GET /api/models/configs`
- `POST /api/models/configs`
- `GET /api/models/configs/{configId}`
- `PATCH /api/models/configs/{configId}`
- `DELETE /api/models/configs/{configId}`
- `POST /api/models/configs/{configId}/test`

`POST /test` 响应：

```json
{
  "success": true,
  "data": {
    "ok": true,
    "provider": "openai-compatible",
    "model": "gpt-test",
    "detail": "connection ok"
  },
  "message": null
}
```

## 6. Skills

### Skill 对象

```json
{
  "id": "uuid",
  "name": "summary-helper",
  "description": "生成阶段性总结",
  "version": "0.1.0",
  "author": "backend",
  "tags": ["summary"],
  "enabled": true,
  "scope": ["conversation"],
  "configSchema": {
    "type": "object"
  },
  "runtimeType": "workflow",
  "createdAt": "2026-03-31T00:00:00Z",
  "updatedAt": "2026-03-31T00:00:00Z"
}
```

接口：
- `GET /api/skills`
- `POST /api/skills`
- `GET /api/skills/{skillId}`
- `PATCH /api/skills/{skillId}`
- `DELETE /api/skills/{skillId}`
- `POST /api/skills/{skillId}/toggle`

## 7. MCP Servers

### MCP Server 对象

```json
{
  "id": "uuid",
  "name": "Local MCP",
  "description": "本地 MCP 服务",
  "transportType": "http",
  "endpointOrCommand": "http://localhost:3001/mcp",
  "enabled": true,
  "status": "connected",
  "toolCount": 1,
  "resourceCount": 0,
  "promptCount": 0,
  "lastCheckedAt": "2026-04-06T10:00:00Z",
  "capabilities": {
    "tools": [{"name": "echo", "description": "echo"}],
    "resources": [],
    "prompts": [],
    "config": {
      "timeoutMs": 1500,
      "headers": {"X-Trace-Id": "trace-1"},
      "auth": {"type": "bearer", "token": "***"}
    },
    "detail": "mcp rpc reachable",
    "source": "probe",
    "checkedAt": "2026-04-06T10:00:00Z",
    "lastSuccessAt": "2026-04-06T10:00:00Z",
    "lastError": null
  },
  "advancedConfig": {
    "timeoutMs": 1500,
    "headers": {"X-Trace-Id": "trace-1"},
    "auth": {"type": "bearer", "token": "***"}
  },
  "createdAt": "2026-03-31T00:00:00Z",
  "updatedAt": "2026-04-06T10:00:00Z"
}
```

### 创建/更新请求支持字段

```json
{
  "name": "Local MCP",
  "description": "本地 MCP 服务",
  "transportType": "http",
  "endpointOrCommand": "http://localhost:3001/mcp",
  "enabled": true,
  "advancedConfig": {
    "timeoutMs": 1500,
    "headers": {
      "X-Trace-Id": "trace-1"
    },
    "env": {
      "HTTP_PROXY": "http://127.0.0.1:7890"
    },
    "args": ["--mode", "dev"],
    "auth": {
      "type": "bearer",
      "token": "token-xxx"
    }
  }
}
```

`auth.type` 支持：
- `bearer`：`token`
- `basic`：`username` + `password`
- `apiKey`：`headerName` + `value`

`transportType=stdio` 约定：
- `endpointOrCommand` 为可执行命令（如 `python`、`node`、本地可执行文件）
- `advancedConfig.args` 会按顺序追加到命令参数
- `advancedConfig.env` 会合并进子进程环境变量
- `/check` 与聊天主链路中的手动 MCP 执行都会复用同一组 `advancedConfig`

接口：
- `GET /api/mcp/servers`
- `POST /api/mcp/servers`
- `GET /api/mcp/servers/{serverId}`
- `PATCH /api/mcp/servers/{serverId}`
- `DELETE /api/mcp/servers/{serverId}`
- `POST /api/mcp/servers/{serverId}/check`
- `POST /api/mcp/servers/{serverId}/smoke`
- `GET /api/mcp/servers/{serverId}/capabilities`

`POST /check` 响应：

```json
{
  "success": true,
  "data": {
    "ok": true,
    "status": "connected",
    "toolCount": 1,
    "resourceCount": 0,
    "promptCount": 0,
    "detail": "mcp rpc reachable (1 tools)",
    "usedCache": false
  },
  "message": null
}
```

### `POST /api/mcp/servers/{serverId}/smoke`

请求体（可选）：

```json
{
  "toolName": "echo",
  "toolArguments": {}
}
```

说明：
- 用于“一键验收”真实可调用链路，按 `initialize -> tools/list -> tools/call` 顺序执行。
- 未指定 `toolName` 时，默认选择首个可用工具并传空参数 `{}`。
- 若 `tools/list` 为空，返回失败并标记 `server has no tool`。
- `tools/call` 与聊天主链路共享 FileAccessGuard；命中本地路径门控会返回 `forbidden_path`。
- `steps[*].details` 可能附带 runtime 诊断字段：`sessionReuse`、`sessionRecreated`（用于排查连接抖动）。

响应示例：

```json
{
  "success": true,
  "data": {
    "ok": false,
    "status": "error",
    "usedToolName": "read_file",
    "summary": "forbidden_path: D:/secret.txt",
    "steps": [
      {
        "name": "initialize",
        "ok": true,
        "status": "passed",
        "detail": "mcp rpc reachable (1 tools)"
      },
      {
        "name": "tools/list",
        "ok": true,
        "status": "passed",
        "detail": "found 1 tool(s)"
      },
      {
        "name": "tools/call",
        "ok": false,
        "status": "failed",
        "detail": "forbidden_path: D:/secret.txt",
        "errorCategory": "permission",
        "details": {
          "path": "D:/secret.txt",
          "reason": "not_in_allowlist"
        }
      }
    ]
  },
  "message": null
}
```

`errorCategory` 取值：`config | auth | permission | server | runtime`

## 8. Memory

接口：
- `GET /api/memory/long-term`
- `POST /api/memory/long-term`
- `DELETE /api/memory/long-term/{memoryId}`
- `POST /api/memory/search`
- `POST /api/memory/summarize`

### `POST /api/memory/long-term` 请求体

```json
{
  "conversationId": "uuid",
  "personaId": "uuid",
  "memoryScope": "persona",
  "content": "用户偏好：喜欢爵士乐",
  "tags": ["preference", "music"],
  "metadata": {
    "source": "chat"
  }
}
```

### `POST /api/memory/search` 请求体

```json
{
  "query": "爵士乐",
  "conversationId": "uuid",
  "personaId": "uuid",
  "memoryScope": "persona",
  "tags": ["music"],
  "limit": 5
}
```

### `POST /api/memory/summarize` 请求体

```json
{
  "conversationId": "uuid",
  "force": false
}
```

### `DELETE /api/memory/long-term/{memoryId}` 响应

```json
{
  "success": true,
  "data": {
    "deleted": true,
    "id": "uuid"
  },
  "message": null
}
```

## 9. Settings

接口：
- `GET /api/settings`
- `PATCH /api/settings`

Settings 对象：

```json
{
  "theme": "system",
  "backgroundImage": null,
  "backgroundBlur": 0,
  "backgroundOverlayOpacity": 0.5,
  "defaultLayoutMode": "chat",
  "language": "zh-CN",
  "fileAccessMode": "compat",
  "fileAccessAllowAll": true,
  "fileAccessFolders": [],
  "fileAccessBlacklist": []
}
```

`fileAccessMode` 行为约定：
- 当前固定为 `compat`
- 本地路径访问优先级：`fileAccessBlacklist` > `fileAccessAllowAll` > `fileAccessFolders`
- `fileAccessAllowAll=true` 时，允许访问本地路径（但黑名单仍会拦截）
- `fileAccessAllowAll=false` 时，仅允许访问 `fileAccessFolders` 及其子目录
- 该白名单会同时用于 Live2D 本地文件校验与 MCP 本地路径调用门控
- `forbidden_path` 错误会返回结构化字段：`path`、`reason`、`context`、`suggestedFolder`

## 10. Meta

接口：
- `GET /api/meta/providers`
- `GET /api/meta/layout-modes`
- `GET /api/meta/live2d-states`

响应结构：

```json
{
  "success": true,
  "data": {
    "items": []
  },
  "message": null
}
```

## 11. 错误契约

### 统一结构

```json
{
  "success": false,
  "data": {
    "code": "validation_error"
  },
  "message": "manualToolRequests[0] invalid params: goal is required"
}
```

### 常见错误码
- `not_found`
- `conflict`
- `validation_error`
- `provider_error`
- `forbidden_path`
- `request_in_progress`
- `regenerate_not_available`
- `internal_error`

### 参数校验错误（示例）
当手动 Skill 参数不合法时，`data` 中会附带 `issues`：

```json
{
  "success": false,
  "data": {
    "code": "validation_error",
    "source": "manual_tool_requests",
    "issues": [
      {
        "path": "manualToolRequests[0].inputParams.goal",
        "field": "goal",
        "reason": "goal is required",
        "type": "required"
      }
    ]
  },
  "message": "manualToolRequests[0] invalid params: goal is required"
}
```

## 12. 请求幂等（`metadata.requestId`）

以下接口支持传入 `metadata.requestId`：
- `POST /api/conversations/{conversationId}/messages`
- `POST /api/conversations/{conversationId}/messages/stream`

行为约定：
- 同一会话内重复提交相同 `requestId` 时，后端复用同一轮 user/assistant 结果，不重复创建轮次
- 若首个请求仍在处理中，后端可返回 `409` + `code=request_in_progress`
- 推荐前端行为：
  - 同一轮用户发送固定使用同一个 `requestId`
  - `stream` 回退到非 `stream` 发送时复用该 `requestId`

## 13. Ops MCP Installer（项目内安装）

边界：
- 仅安装到当前项目内 MCP Servers（`/api/mcp/servers`），不写系统级 MCP 客户端配置
- 支持输入：URL、JSON 配置片段、GitHub 链接
- 执行模式：逐步确认（step-by-step）

GitHub 链接解析规则（`preview`）：
- 优先从 README 的 JSON/JSONC 代码块提取 MCP 配置（`mcpServers` 或单服务对象）
- 若未命中配置对象，则尝试提取命令行（支持 fenced code / inline code / shell 行），并拆分为：
  - `parsedConfig.endpointOrCommand`（命令本体，如 `npx`）
  - `parsedConfig.advancedConfig.args[]`（命令参数）
- 若命令行也未命中，再尝试提取 README 中的 HTTP endpoint
- 上述都失败时返回 `github_readme_parse_failed`

### `POST /api/ops/mcp/install/preview`

请求体：

```json
{
  "link": "https://github.com/modelcontextprotocol/servers",
  "conversationId": "optional-conversation-id"
}
```

响应体（`data.session`）核心字段：
- `id`
- `status`（`previewed/running/failed/completed`）
- `parsedConfig`（`sourceType/name/transportType/endpointOrCommand/advancedConfig`）
- `envReport[]`（`command/available/path/version/detail`）
- `steps[]`（`id/name/title/status/requiresConfirm/detail/result/errorCategory/startedAt/finishedAt`）

错误码约定：
- `validation_error`（缺少 `link`，HTTP 422）
- `invalid_snippet`（JSON 片段语法/结构非法，HTTP 422）
- `invalid_link`（链接格式不支持，HTTP 422）
- `github_readme_unavailable`（GitHub README 拉取失败，HTTP 502）
- `github_readme_parse_failed`（README 可读但未识别到可安装 MCP 配置，HTTP 422）

前端兼容映射（非后端原始错误码）：
- 当路由级 `404 not_found` 且不属于“session/step not found”语义时，前端可映射为 `endpoint_not_available`，提示“后端未加载 MCP 安装接口能力”

### `POST /api/ops/mcp/install/execute`

请求体：

```json
{
  "sessionId": "install-session-id",
  "stepId": "create_or_update_server"
}
```

`stepId`（当前版本）：
- `create_or_update_server`
- `check_server`
- `smoke_server`
- `enable_server`

说明：
- 会话中的完整步骤链为：`parse_link -> probe_env -> create_or_update_server -> check_server -> smoke_server -> enable_server`
- 其中 `parse_link` 与 `probe_env` 在 `preview` 阶段已自动完成（`requiresConfirm=false`），`execute` 仅接受后 4 个可执行步骤

响应体：

```json
{
  "success": true,
  "data": {
    "session": {},
    "step": {}
  },
  "message": null
}
```

说明：
- 未完成前置步骤时返回 `409 conflict`
- 步骤失败时返回统一错误结构，且对应步骤会写入 `step.errorCategory`

错误码约定：
- `validation_error`（参数缺失或 step 非法，HTTP 400/422）
- `not_found`（session 或 step 不存在，HTTP 404）
- `conflict`（前置步骤未完成 / 步骤正在运行 / 服务未创建，HTTP 409）
- `check_failed`（`check_server` 失败，HTTP 502）
- `smoke_failed`（`smoke_server` 失败，HTTP 502）
- `runtime_error`（非预期运行时错误，HTTP 502）

`step.errorCategory` 语义：
- 成功步骤：`null`
- 失败步骤：与该次失败对应的错误码一致（例如 `check_failed`、`smoke_failed`、`runtime_error`）

### `GET /api/ops/mcp/install/{sessionId}`

返回当前安装会话状态（用于前端断线恢复与刷新）。

### Stream 事件扩展（聊天 SSE）

在 `POST /api/conversations/{conversationId}/messages/stream` 中新增事件：
- `ops_install_preview`
- `ops_install_step_started`
- `ops_install_step_finished`
- `ops_install_finished`

这些事件仅用于 Ops Assistant 的安装流程展示，不改变 `final_answer/stopped` 终态语义。

## 14. Ops Commands（项目内命令执行）

边界：
- 仅允许项目作用域执行（`cwd` 必须在项目根目录内）
- 命令白名单执行（如 `npm/python/pytest/git/docker/...`）
- 高危关键词默认阻断（例如 `rm -rf`）
- 强制预执行确认：`preview -> execute`

### `POST /api/ops/commands/preview`

请求体：

```json
{
  "command": "python --version",
  "cwd": "optional-working-directory",
  "conversationId": "optional-conversation-id"
}
```

响应体（`data.session`）：
- `status = previewed`
- `preview.command`
- `preview.argv`
- `preview.cwd`
- `preview.riskLevel`（`low/medium/high`）
- `preview.requiresConfirm = true`

### `POST /api/ops/commands/execute`

请求体：

```json
{
  "sessionId": "command-session-id"
}
```

响应体（`data.session`）：
- `status`（`completed/failed`）
- `result.exitCode`
- `result.stdout`
- `result.stderr`
- `result.durationMs`

### `GET /api/ops/commands/{sessionId}`

查询命令会话当前状态（用于刷新与断线恢复）。

### Stream 事件扩展（聊天 SSE）

在 `POST /api/conversations/{conversationId}/messages/stream` 中新增事件：
- `ops_command_preview`
- `ops_command_finished`

这些事件用于 Ops Assistant 的命令执行预览卡片展示，不改变 `final_answer/stopped` 终态语义。
