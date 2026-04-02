# Chat Manual Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a chat-side tool panel so users can manually trigger enabled skills and MCP servers, with assistant-composed final replies and expandable raw tool results.

**Architecture:** Extend the existing chat request contract with `manualToolRequests`, thread that intent through the FastAPI message schemas and LangGraph state, and then build a frontend tool panel that feeds the same streaming message pipeline already used for normal chat. The UI will expose both quick actions and “attach to this turn” selection, but both paths resolve to the same request payload and response rendering flow.

**Tech Stack:** React, TypeScript, Zustand, FastAPI, Pydantic v2, LangGraph, SSE

---

### Task 1: Add Manual Tool Request Contract

**Files:**
- Modify: `src/types/message.ts`
- Modify: `src/services/message.service.ts`
- Modify: `app/schemas/message.py`
- Modify: `app/agents/state.py`
- Modify: `app/services/message.py`
- Modify: `app/agents/nodes.py`

- [ ] **Step 1: Define shared frontend types**
- [ ] **Step 2: Extend frontend message service to accept `manualToolRequests`**
- [ ] **Step 3: Extend backend message schemas with `manual_tool_requests`**
- [ ] **Step 4: Thread `manual_tool_requests` into agent state preparation**
- [ ] **Step 5: Update planner/tool nodes to prioritize manual tool requests**
- [ ] **Step 6: Run `npm run build` and a Python import smoke test**

### Task 2: Build Chat Tool Panel UI

**Files:**
- Modify: `src/components/chat/ChatInput.tsx`
- Create: `src/components/chat/ChatToolPanel.tsx`
- Create: `src/components/chat/ChatToolQuickActions.tsx`
- Modify: `src/pages/ChatPage.tsx`

- [ ] **Step 1: Add a compact tool entry button near the chat input**
- [ ] **Step 2: Create the tool panel shell with two sections: quick actions and per-turn selections**
- [ ] **Step 3: Populate the panel from current conversation enabled skills and MCP servers**
- [ ] **Step 4: Support lightweight optional text input per selected tool**
- [ ] **Step 5: Feed selected tool requests into the existing send/stream flow**
- [ ] **Step 6: Keep panel state local to the current turn and clear it after successful send**

### Task 3: Improve Chat Result Visibility

**Files:**
- Modify: `src/pages/ChatPage.tsx`
- Modify: `src/components/chat/MessageBubble.tsx`
- Modify: `src/services/message.service.ts`

- [ ] **Step 1: Mark manually-triggered tool results in transient tool messages**
- [ ] **Step 2: Show a clearer user-facing source label such as “用户主动触发”**
- [ ] **Step 3: Preserve assistant natural-language answer as default**
- [ ] **Step 4: Keep raw tool result cards expandable for inspection**
- [ ] **Step 5: Verify stop/regenerate flows still behave correctly with manual tool requests**

### Task 4: Final Validation

**Files:**
- Modify: `README.md` (if behavior needs a user-facing note)

- [ ] **Step 1: Run `npm run build`**
- [ ] **Step 2: Run `python -c "import app.services.message; import app.agents.nodes"`**
- [ ] **Step 3: Manually verify one chat turn with selected skill and one with selected MCP**
- [ ] **Step 4: Add a short README note only if the new chat tool panel changes usage expectations**
