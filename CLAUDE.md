# CLAUDE.md

## 项目说明
这是一个本地桌面 AI Agent 陪伴应用。

当前仓库主要目标是实现：
- Tauri 2 桌面壳
- React + TypeScript 前端
- 中文界面
- 多会话聊天
- Persona 人设系统
- 模型配置管理
- Skills 管理
- MCP 服务管理
- Live2D 展示容器层
- 背景图片与外观设置
- 双聊天布局模式

后端将由独立代码代理负责，采用 Python + FastAPI + LangGraph。
当前仓库阶段不要伪造复杂后端逻辑。

---

## 当前阶段目标
当前阶段只做：

1. 前端页面
2. 前端组件
3. 状态管理
4. API 抽象层
5. mock 数据层
6. Tauri 前端接入层
7. README 中文文档

不要做：
- 真实多 Agent 编排逻辑
- 真实记忆写入逻辑
- 真实 MCP 协议通信逻辑
- 真实 Skills 执行逻辑
- 真实 Live2D 模型驱动逻辑

这些能力只需要预留接口和可扩展结构。

---

## 技术栈要求
必须优先使用：

- Tauri 2
- React 18
- TypeScript
- Vite
- Tailwind CSS
- React Router
- Zustand
- TanStack Query

UI 方案：
- 优先使用 shadcn/ui
- 如果不合适，使用 Radix UI + 自定义样式

可选：
- react-hook-form
- zod
- react-markdown
- lucide-react
- clsx
- cva

不要引入：
- Redux
- MobX
- Ant Design
- 典型后台管理模板式组件库

---

## 中文化要求
所有用户可见内容必须优先使用中文，包括但不限于：

- 页面标题
- 菜单名称
- 按钮文案
- 表单标签
- 占位文案
- 空状态提示
- 错误提示
- README
- 设置项名称
- 弹窗标题
- 提示说明

注意：
- 即使内部变量命名使用英文，界面文案也必须是中文
- 新增页面时不要混入英文占位文案
- 文案风格保持统一、简洁、桌面产品化

---

## 视觉风格要求
视觉风格应接近：

- 桌面聊天应用
- AI 陪伴工具
- 轻量工作台

避免：
- 后台管理系统风格
- 过度表格化
- 信息密度过高
- 花哨但无用的动画

要求：
- 清爽
- 现代
- 可读性强
- 适合长时间聊天使用

---

## 页面与功能范围
当前阶段至少应包含以下页面：

1. 聊天主界面
2. Persona 人设管理页
3. 模型配置页
4. Skills 管理页
5. MCP 管理页
6. 设置页

必须支持：
- 会话列表
- 新建/删除/重命名会话
- 双聊天模式切换
- 背景图设置
- 浅色/深色模式
- Live2D 展示容器
- 消息渲染
- 模型配置管理
- Skills 启用/禁用
- MCP 服务启用/禁用

---

## 双聊天模式要求
必须实现两种聊天布局：

### 模式 A：微信式聊天模式
- 聊天区为主
- 用户消息在右
- AI 消息在左
- Live2D 角色在旁边
- 输入框在底部

### 模式 B：陪伴气泡模式
- Live2D 角色是视觉中心
- AI 回复以角色旁边气泡形式展示
- 输入框在底部
- 聊天历史可折叠查看

要求：
- 两种模式共用一套消息数据结构
- 不允许复制两套完全重复的页面
- 应通过布局切换实现

---

## Live2D 约束
当前阶段只做 Live2D 抽象层，不强接真实模型。

必须有：
- 独立 Live2DStage 组件
- 模型占位容器
- 状态切换接口
- 模型切换接口
- 加载状态
- 空状态

状态枚举至少包括：
- idle
- talking
- thinking
- happy
- sad

不要：
- 在页面里直接写 Live2D 细节
- 把占位实现写得不可替换

---

## 工程架构要求
目录至少包括：

- src/components
- src/features
- src/pages
- src/layouts
- src/stores
- src/services
- src/api
- src/types
- src/hooks
- src/utils
- src/constants
- src/mock
- src/assets

要求：
- 页面负责组装
- 组件负责复用
- service 负责业务接口抽象
- api 负责请求层
- mock 负责假数据
- store 负责全局/模块状态

禁止页面直接写请求。

---

## 类型设计要求
必须优先完善类型定义，避免 any。

至少包含以下核心类型：
- Conversation
- Message
- Persona
- ModelConfig
- Skill
- MCPServer
- AppSettings
- ChatLayoutMode
- Live2DState
- ProviderType
- MCPTransportType

新增业务字段时，优先更新 types，而不是在组件里临时拼对象。

---

## Service 分层要求
必须有以下 services：

- conversationService
- messageService
- personaService
- modelService
- skillService
- mcpService
- settingsService

要求：
- 页面不直接调用 fetch
- 页面不直接访问 mock 数据
- 所有数据访问统一通过 service
- mock 和真实接口模式可切换

---

## 状态管理要求
使用 Zustand，并合理拆分 store，例如：

- appStore
- conversationStore
- settingsStore
- uiStore

不要：
- 所有状态都放一个 store
- 让 store 承担 UI 与数据请求的全部细节
- 让页面自己保存大量重复状态

---

## 聊天消息要求
消息系统必须支持：
- 用户消息
- AI消息
- 系统消息
- 工具调用消息
- 错误消息
- 流式消息占位

消息结构必须预留：
- senderType
- senderName
- agentName
- toolName
- toolStatus
- reasoning
- attachments
- metadata

消息渲染至少支持：
- Markdown
- 代码块
- 复制
- 流式占位
- 推理区折叠占位

---

## README 要求
README.md 必须是中文，并至少包含：

- 项目简介
- 功能特性
- 技术栈
- 页面说明
- 目录结构
- 开发启动
- 打包方式
- 后端对接说明
- Live2D 接入说明
- Skills / MCP 预留说明
- 后续开发路线图

README 不能是空壳。

---

## 代码风格要求
请遵守以下规则：

1. 优先可维护性
2. 避免超长单文件
3. 组件拆分合理
4. 命名语义化
5. 类型尽量完整
6. 注释适量
7. 样式统一
8. 不要过度设计
9. 不要复制粘贴两套同类页面
10. 不要为了“看起来功能多”而伪造复杂逻辑

---

## 执行顺序建议
通常按以下顺序推进：

1. 整理工程与依赖
2. 搭建布局、路由、主题
3. 定义 types/constants
4. 搭建 service/api/mock 层
5. 实现聊天主界面
6. 实现双聊天模式
7. 实现 Persona 页
8. 实现模型配置页
9. 实现 Skills 页
10. 实现 MCP 页
11. 实现设置页
12. 完善 README
13. 自检和修复

---

## 修改代码时的行为要求
修改前：
- 先看现有结构
- 先理解依赖
- 先给出短计划

修改时：
- 每完成一个大模块可简要汇报
- 优先做结构正确、可扩展版本
- 如果现有模板质量差，可直接重构

修改后：
- 检查类型错误
- 检查构建错误
- 检查未使用代码
- 检查中文文案一致性
- 检查 README 是否同步更新

---

## 禁止事项
禁止：

1. 伪造复杂后端 agent 逻辑
2. 在页面里直接写 fetch
3. 把 mock 数据硬写在页面里
4. 所有状态塞一个 store
5. 大面积使用 any
6. 把项目做成后台管理模板
7. 不经思考大量引入依赖
8. 留大量空 TODO 壳子
9. README 敷衍
10. 复制两套聊天页面实现双模式

---

## 开发决策原则
如果存在多种实现方式，优先选择：

1. 更利于后端对接
2. 更利于未来扩展
3. 更利于组件复用
4. 更利于维护
5. 更符合桌面聊天产品形态
6. 更符合中文用户使用习惯