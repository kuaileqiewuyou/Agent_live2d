# Phase 2 Tool Panel Validation Checklist

> **For agentic workers:** REQUIRED PROCESS: Follow the mandatory superpower-plus flow in order: `brainstorming -> writing-acceptance-criteria -> writing-plans -> executing-plans`. Do not implement changes before the flow is completed.

## Goal
Validate the tool-panel flow end-to-end before stage closure, with emphasis on manual tool triggering, fallback behavior, and per-conversation draft recovery.

## Environment
- Frontend: `npm run dev`
- Backend: `uvicorn app.main:app --reload --port 8000`
- Test account scope: local single-user mode

## Scenario 1: Send With Manual Tools Selected
- [x] Open a conversation with at least 1 enabled Skill and 1 enabled MCP server.
- [x] Open Tool Panel, select one Skill, send with normal user message.
- [x] Verify assistant bubble shows "本轮按你的指定调用了工具".
- [x] Verify tool usage summary displays manual count and tool labels.
- [x] Verify backend response metadata contains `manualToolRequests`.

## Scenario 2: Send With Tools Only (No Text Input)
- [x] Open Tool Panel and select one tool.
- [x] Leave input empty and click send.
- [x] Verify request is still sent successfully (fallback instruction auto-generated).
- [x] Verify resulting user message includes fallback intent text.
- [x] Verify selected tools are cleared after successful send.

## Scenario 3: Background Restore After Refresh
- [x] In settings, choose preset/custom background and save.
- [x] Refresh page (hard refresh once).
- [x] Verify background is restored automatically without re-entering settings.

## Scenario 4: Tool Draft Recovery Per Conversation (A/B Isolation)
- [x] In conversation A, select tool set A1 and keep unsent.
- [x] Switch to conversation B, select tool set B1 and keep unsent.
- [x] Switch back to A, verify A1 restored.
- [x] Switch back to B, verify B1 restored.
- [x] Clear tool selection in A and confirm B is unaffected.

## Scenario 5: Stream Failure Fallback To Normal Send
- [x] Trigger a stream failure (temporary backend stream interruption).
- [x] Verify UI enters fallback path and completes message send once.
- [x] Verify no duplicate user/assistant turns are inserted.
- [x] Verify notification reflects fallback mode instead of generic error.

## Automated Gate
- [x] `npm run test:unit`
- [x] `npm run build`
- [x] `pytest -q`

## Current Status
- 2026-04-02: `npm run smoke:release` passed (includes `pytest -q`, `npm run test:unit`, `npm run test:e2e`, Docker `app + qdrant`, `/api/health`).
- 2026-04-02: `npm run build` passed.
- Phase 2 tool-panel validation checklist is closed for this stage.
