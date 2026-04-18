# MD 对齐与接手文档治理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. It will decide whether each batch should run in parallel or serial subagent mode and will pass only task-local context to each subagent. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 `AGENTS.md`、`README.md`、`CONTRACT.md`、`TASK.md` 的结构化重排与职责对齐，建立单一真源并消除重复定义。

**Architecture:** 采用“真源文档 + 导航引用”架构：协作规则归 `AGENTS.md`、接口契约归 `CONTRACT.md`、接手入口归 `README.md`、执行状态归 `TASK.md`。执行时先固定规则边界，再对齐契约，再收敛 README，最后校正 TASK 与交叉一致性。

**Tech Stack:** Markdown、Git、PowerShell、npm（文本编码检查）

---

### Task 1: 建立四文档边界骨架

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `CONTRACT.md`
- Modify: `TASK.md`

- [ ] **Step 1: 备份当前文档快照（通过 git 查看基线）**

Run: `git show -- AGENTS.md README.md CONTRACT.md TASK.md > NUL`
Expected: 命令成功退出（用于确认四文件可读取且在版本控制中）

- [ ] **Step 2: 重写 `AGENTS.md` 的结构顺序并补齐文档真源规则**

```markdown
## 文档真源与同步规则
- 协作规则只在 AGENTS 主定义
- 接口行为只在 CONTRACT 主定义
- 接手入口只在 README 主定义
- 执行状态只在 TASK 主定义
```

- [ ] **Step 3: 重写 `README.md` 为接手入口，收敛契约细节为导航链接**

```markdown
## 文档导航
- AGENTS.md（协作约束）
- CONTRACT.md（接口契约）
- TASK.md（执行状态）
```

- [ ] **Step 4: 重排 `CONTRACT.md` 章节为“约定 -> 资源接口 -> SSE -> 错误 -> 幂等 -> Ops”**

Run: `Select-String -Path CONTRACT.md -Pattern "通用约定|Conversations|Messages|错误契约|请求幂等|Ops"`
Expected: 能匹配到关键章节关键词

### Task 2: 对齐 TASK 与跨文档一致性

**Files:**
- Modify: `TASK.md`
- Modify: `README.md`

- [ ] **Step 1: 重写 `TASK.md` 为里程碑视图并显式引用 CONTRACT**

```markdown
## 文档对齐里程碑
- [ ] 文档职责边界一致
- [ ] README 导航收敛
- [ ] CONTRACT 能力与 TASK 目标一致
```

- [ ] **Step 2: 在 `README.md` 增加“最小联调路径”并避免重复接口字段定义**

Run: `Select-String -Path README.md -Pattern "最小联调路径|文档导航"`
Expected: 匹配到新增章节

- [ ] **Step 3: 交叉检查 TASK 中能力项在 CONTRACT 中可定位**

Run: `Select-String -Path CONTRACT.md -Pattern "MCP|Memory|Ops|messages/stream|messages/stop|messages/regenerate"`
Expected: 各关键词至少命中一次

### Task 3: 验证与收尾

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `CONTRACT.md`
- Modify: `TASK.md`

- [ ] **Step 1: 执行占位词检查**

Run: `Select-String -Path AGENTS.md,README.md,CONTRACT.md,TASK.md -Pattern "未完成占位|PLACEHOLDER_MARKER"`
Expected: 无输出

- [ ] **Step 2: 执行编码检查**

Run: `npm run check:text-encoding`
Expected: 命令通过，四份文档无编码异常

- [ ] **Step 3: 检查改动范围**

Run: `git diff --name-only`
Expected: 仅出现 `AGENTS.md`、`README.md`、`CONTRACT.md`、`TASK.md`（以及本流程产生的 superpowers 文档）

- [ ] **Step 4: 提交文档对齐结果**

```bash
git add AGENTS.md README.md CONTRACT.md TASK.md
git commit -m "docs: align core markdown responsibilities and structure"
```
