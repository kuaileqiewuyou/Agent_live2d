# Changelog

本文档记录 Agent Live2D 的版本变更，遵循语义化版本管理（SemVer）。

## [0.1.1] - 2026-04-06

### 新增
- 打通 MCP 真实调用最小闭环（http + stdio），支持 `initialize / tools/list / tools/call`。
- 新增统一 SkillRuntimeEngine，支持 Skill 真实执行并回填到聊天主链路。
- 增加 Provider 工具调用抽象回归测试与端到端集成测试（含 fake MCP / fake Skill）。

### 改进
- ToolAgent 从占位执行升级为真实执行状态回填（queued / running / success / error）。
- 前端 MCP 管理页补齐高级配置项，聊天面板展示真实工具执行阶段与错误原因。
- OpenAI-compatible / Ollama 优先走真实上游 stream，保留降级路径兜底。

### 修复
- 修复 ChatInput / ChatPage 中文乱码与字符串闭合问题，恢复构建与测试稳定性。
- 修复 Desktop + Docker smoke 链路中的发布守卫描述缺失问题（PR release checklist 对齐）。

### 文档
- 更新 `TASK.md` 的 M8 执行项与进度回填。
- 新增发布说明模板：`docs/releases/release-notes-template-zh.md`。

## [0.1.0] - 2026-04-05

### 首个正式版本
- 完成本地单机可运行后端与前端主链路（FastAPI + SQLite + Qdrant + LangGraph）。
- 支持多会话、Persona、Model Config、Skill、MCP、Memory、流式聊天。
- 提供 Web 与 Desktop 本地启动脚本与发布 smoke 流程。
