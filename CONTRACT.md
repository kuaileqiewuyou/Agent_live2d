# Agent Live2D 前后端接口契约

本文档定义当前仓库前后端联调时使用的核心后端接口契约。

统一前缀为 `/api`，统一响应结构如下：

```json
{
  "success": true,
  "data": {},
  "message": null
}
```

## 1. 健康检查

### `GET /api/health`

返回：

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "appName": "Agent Live2D Backend",
    "environment": "development"
  }
}
```

## 2. Conversations

### `GET /api/conversations`

返回：

```json
{
  "success": true,
  "data": {
    "items": [
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
    ],
    "total": 1
  }
}
```

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

### `GET /api/conversations/{conversation_id}`

返回单个会话详情，结构同列表项。

### `PATCH /api/conversations/{conversation_id}`

支持局部更新：

```json
{
  "title": "重命名后的标题",
  "layoutMode": "companion",
  "enabledSkillIds": ["uuid"],
  "enabledMcpServerIds": ["uuid"],
  "pinned": true
}
```

### `DELETE /api/conversations/{conversation_id}`

返回：

```json
{
  "success": true,
  "data": {
    "deleted": true,
    "id": "uuid"
  }
}
```

## 3. Messages

### `GET /api/conversations/{conversation_id}/messages`

返回：

```json
{
  "success": true,
  "data": {
    "items": [
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
    ],
    "total": 1
  }
}
```

### `POST /api/conversations/{conversation_id}/messages`

请求体：

```json
{
  "content": "你好，今天过得怎么样？",
  "attachments": [],
  "metadata": {}
}
```

返回：

```json
{
  "success": true,
  "data": {
    "userMessage": {},
    "assistantMessage": {}
  }
}
```

### `POST /api/conversations/{conversation_id}/messages/stream`

请求体同上。

返回类型：`text/event-stream`

SSE 事件（当前主链路）：

- `message_created`
- `thinking`
- `tool_calling`
- `tool_result`
- `memory_sync`
- `token`
- `final_answer`
- `stopped`

核心事件 payload 字段约定：

- `live2dState`：可选，取值为 `idle` / `thinking` / `talking` / `error`
- 对于上述主链路事件，后端默认会附带 `live2dState`
- 前端消费时若 payload 中存在 `live2dState`，应优先使用；仅在缺失时按 `event` 推断状态

示例：

```text
event: token
data: {"content":"你好","live2dState":"talking"}

event: final_answer
data: {"messageId":"uuid","content":"你好，我在。","live2dState":"idle"}
```

### `POST /api/conversations/{conversation_id}/messages/regenerate`

基于最近一条用户消息重新生成回复。

### `POST /api/conversations/{conversation_id}/messages/stop`

返回：

```json
{
  "success": true,
  "data": {
    "stopped": true,
    "conversationId": "uuid"
  }
}
```

## 4. Personas

### Persona 字段

```json
{
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
  "systemPromptTemplate": "你是 {{persona_name}}，请始终以她的人设说话。"
}
```

接口：

- `GET /api/personas`
- `POST /api/personas`
- `GET /api/personas/{persona_id}`
- `PATCH /api/personas/{persona_id}`
- `DELETE /api/personas/{persona_id}`

## 5. Model Configs

### 字段

```json
{
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
  }
}
```

接口：

- `GET /api/models/configs`
- `POST /api/models/configs`
- `GET /api/models/configs/{config_id}`
- `PATCH /api/models/configs/{config_id}`
- `DELETE /api/models/configs/{config_id}`
- `POST /api/models/configs/{config_id}/test`

## 6. Skills

### 字段

```json
{
  "name": "总结助手",
  "description": "生成阶段性总结",
  "version": "0.1.0",
  "author": "backend",
  "tags": ["summary"],
  "enabled": true,
  "scope": ["conversation"],
  "configSchema": {"type":"object"},
  "runtimeType": "workflow"
}
```

接口：

- `GET /api/skills`
- `POST /api/skills`
- `GET /api/skills/{skill_id}`
- `PATCH /api/skills/{skill_id}`
- `DELETE /api/skills/{skill_id}`
- `POST /api/skills/{skill_id}/toggle`

## 7. MCP Servers

### 字段

```json
{
  "name": "Local MCP",
  "description": "本地 MCP 服务",
  "transportType": "http",
  "endpointOrCommand": "http://localhost:3001",
  "enabled": true
}
```

接口：

- `GET /api/mcp/servers`
- `POST /api/mcp/servers`
- `GET /api/mcp/servers/{server_id}`
- `PATCH /api/mcp/servers/{server_id}`
- `DELETE /api/mcp/servers/{server_id}`
- `POST /api/mcp/servers/{server_id}/check`
- `GET /api/mcp/servers/{server_id}/capabilities`

## 8. Memory

### `GET /api/memory/long-term`

列出长期记忆。

### `POST /api/memory/long-term`

请求体：

```json
{
  "conversationId": "uuid",
  "personaId": "uuid",
  "memoryScope": "persona",
  "content": "用户偏好：喜欢爵士乐",
  "tags": ["preference", "music"],
  "metadata": {"source":"chat"}
}
```

### `POST /api/memory/search`

请求体：

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

### `POST /api/memory/summarize`

请求体：

```json
{
  "conversationId": "uuid",
  "force": false
}
```

## 9. Meta

- `GET /api/meta/providers`
- `GET /api/meta/layout-modes`
- `GET /api/meta/live2d-states`

## 10. 错误约定

所有错误响应保持统一结构：

```json
{
  "success": false,
  "data": {},
  "message": "persona not found"
}
```

## 11. 消息去重清理

### `POST /api/conversations/{conversation_id}/messages/dedupe`

用于清理同一会话历史中的明显重复轮次。

返回示例：

```json
{
  "success": true,
  "data": {
    "conversationId": "uuid",
    "totalBefore": 24,
    "totalAfter": 20,
    "deletedCount": 4,
    "deletedTurnCount": 2,
    "deletedMessageIds": ["uuid-1", "uuid-2", "uuid-3", "uuid-4"]
  }
}
```

## 12. 请求幂等（`metadata.requestId`）

对于以下两个接口，客户端可以传入 `metadata.requestId`（字符串）：

- `POST /api/conversations/{conversation_id}/messages`
- `POST /api/conversations/{conversation_id}/messages/stream`

行为约定：

- 同一会话内重复提交相同 `requestId` 时，后端必须复用同一轮 user/assistant 结果，不再创建重复轮次。
- 若第一次请求仍在处理中，后端可返回 `409`，错误码为 `request_in_progress`。
- 推荐客户端行为：
  - 一次用户轮次固定使用一个 `requestId`
  - 当 stream 回退到非 stream 发送时，复用同一个 `requestId`
