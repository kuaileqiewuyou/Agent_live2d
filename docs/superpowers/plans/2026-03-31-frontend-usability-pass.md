# Frontend Usability Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the current web client so core flows are understandable and debuggable during ongoing front-end/back-end integration.

**Architecture:** Keep the existing React + Zustand + service-layer structure, and concentrate the work in three places: a shared API error normalization helper, high-frequency page copy cleanup, and interaction fixes in the persona/chat/settings flows. Avoid widening scope into new backend features so this pass stays safe and immediately testable.

**Tech Stack:** React 19, TypeScript, Vite, Zustand, react-hook-form, Zod

---

### Task 1: Add Shared API Error Normalization

**Files:**
- Create: `D:/Develop/vscode Workspace/Agent_live2d/src/api/errors.ts`
- Modify: `D:/Develop/vscode Workspace/Agent_live2d/src/api/client.ts`
- Test: `D:/Develop/vscode Workspace/Agent_live2d/src/api/errors.ts` via build-time type checking

- [ ] **Step 1: Define the target error behaviors**

Document these cases in code comments and implementation:
- network failure should become a readable Chinese message
- API error responses should prefer backend `message`
- malformed JSON or unknown errors should fall back to a generic message

- [ ] **Step 2: Implement a focused error parser helper**

Create a helper that accepts fetch/unknown errors plus optional response context and returns a normalized `Error` with user-facing text.

- [ ] **Step 3: Wire the helper into `apiRequest`**

Make `apiRequest` surface readable errors instead of raw `Failed to fetch` / `API Error: 500 Internal Server Error`.

- [ ] **Step 4: Verify behavior with a production build**

Run: `npm run build`
Expected: PASS

### Task 2: Clean Up High-Frequency Chinese Copy

**Files:**
- Modify: `D:/Develop/vscode Workspace/Agent_live2d/src/pages/PersonaPage.tsx`
- Modify: `D:/Develop/vscode Workspace/Agent_live2d/src/features/persona/PersonaDialog.tsx`
- Modify: `D:/Develop/vscode Workspace/Agent_live2d/src/pages/ChatPage.tsx`
- Modify: `D:/Develop/vscode Workspace/Agent_live2d/src/pages/SettingsPage.tsx`

- [ ] **Step 1: Replace malformed Chinese strings on the persona list page**

Fix empty state, loading state, delete confirmation, and notification titles/descriptions.

- [ ] **Step 2: Replace malformed Chinese strings in the persona dialog**

Fix field labels, validation messages, placeholders, button labels, and dialog titles/descriptions.

- [ ] **Step 3: Replace malformed Chinese strings in the chat page**

Fix empty state, loading title, and console log messages that are currently unreadable.

- [ ] **Step 4: Replace malformed Chinese strings in the settings page**

Fix section titles, labels, preview text, and placeholder alerts while keeping current behavior.

- [ ] **Step 5: Verify the touched files compile**

Run: `npm run build`
Expected: PASS

### Task 3: Tighten Key Interaction Details

**Files:**
- Modify: `D:/Develop/vscode Workspace/Agent_live2d/src/features/persona/PersonaDialog.tsx`
- Modify: `D:/Develop/vscode Workspace/Agent_live2d/src/pages/PersonaPage.tsx`
- Modify: `D:/Develop/vscode Workspace/Agent_live2d/src/pages/ChatPage.tsx`

- [ ] **Step 1: Preserve persona form input on failed submit**

Only close/reset the dialog after a successful submit so retries do not lose user input.

- [ ] **Step 2: Surface clearer persona-page load failures**

Show an error notification when list loading fails instead of silently leaving the page empty.

- [ ] **Step 3: Improve chat send failure handling**

Replace unreadable console messages and ensure the fallback request path leaves the user with a coherent final message state.

- [ ] **Step 4: Verify behavior with a final build**

Run: `npm run build`
Expected: PASS

### Task 4: Refresh Project Docs Where User-Facing Chinese Is Already Broken

**Files:**
- Modify: `D:/Develop/vscode Workspace/Agent_live2d/README.md`
- Modify: `D:/Develop/vscode Workspace/Agent_live2d/CONTRACT.md`

- [ ] **Step 1: Restore readable Chinese content in the README**

Preserve structure but replace broken mojibake text with readable Chinese.

- [ ] **Step 2: Restore readable Chinese content in the API contract**

Preserve endpoint definitions and example payloads while replacing broken text.

- [ ] **Step 3: Re-run build to ensure front-end changes still pass**

Run: `npm run build`
Expected: PASS
