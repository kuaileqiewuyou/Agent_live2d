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
  "manualToolRequests": []
}
```

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

## 8. Memory

接口：
- `GET /api/memory/long-term`
- `POST /api/memory/long-term`
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
  "language": "zh-CN"
}
```

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
