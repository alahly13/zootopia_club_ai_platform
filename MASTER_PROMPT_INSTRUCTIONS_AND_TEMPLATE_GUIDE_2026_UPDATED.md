# MASTER PROMPT INSTRUCTIONS AND TEMPLATE GUIDE
## For Zootopia Club and Other Production-Style Projects (2026)

Use this guide as a **fixed instruction source** before generating any development prompt for this project or any similar production-style codebase.

Its purpose is to make future prompts:
- precise
- architecture-safe
- environment-aware
- verification-driven
- backward-compatible
- resistant to unnecessary rewrites or confusion between local and deployed runtimes
- specialized by task type so UI, backend, full-stack, and new-feature prompts each follow the right discipline

---

# 1. HOW TO USE THIS GUIDE

This guide should be used in two layers:

## Layer A: Shared global instructions
These rules apply to **all serious project prompts**:
- architecture preservation
- environment separation
- ledger-first discipline
- dependency verification
- lint and verification rules
- no test/mock/debug leakage into production

## Layer B: Task-type-specific instructions
After the shared rules, you must choose the appropriate task profile:

1. **UI-only prompt**
2. **Backend-only prompt**
3. **Full-stack prompt (frontend + backend together)**
4. **New feature / new tool prompt**
5. **Hybrid or architecture-sensitive prompt** when the task crosses multiple subsystems or changes routing/runtime behavior

Do not use the same prompt style for every task.
Each task type must carry its own specific rules in addition to the shared rules.

---

# 2. SHARED MASTER INSTRUCTION BLOCK

Copy and include the following instruction block at the beginning of any serious implementation prompt:

```text
Spawn multiple subagents to explore this repo in parallel.

Use separate subagents for:
1. architecture and dependency tracing
2. frontend/UI flow tracing
3. backend/API/runtime tracing
4. auth/session/environment tracing
5. build/lint/test/deployment verification

Then consolidate findings before making changes.

Analyze the current codebase first before making any changes.

Important:
This is an existing production-style project. Do not rebuild from scratch. Do not redesign the architecture unless explicitly requested. Do not remove working features. Do not change unrelated areas. Make only minimal, surgical, backward-compatible changes required for this task.

Mandatory documentation rule:
Before making any change, read `ZOOTOPIA_PROJECT_LEDGER.txt` first and use it as the primary project memory and historical change log.
If the task also has a dedicated architecture/flow guide, read and use that guide before implementation as well.

Core preservation rules:
- Preserve the current architecture unless a narrow change is strictly required
- Preserve existing routes, contracts, component props, service interfaces, shared state shape, storage model, and runtime ownership unless explicitly required
- Do not remove compatibility layers, guards, normalization helpers, fallback logic, or defensive code unless verified unnecessary and directly relevant
- Do not introduce duplicate systems or parallel flows if the current architecture already has a valid place for the change
- Do not move backend authority into the frontend
- Do not expose secrets, API keys, provider credentials, or privileged logic to the browser
- Do not add unnecessary new packages
- Do not delete old systems if the request is to disable or replace them; keep them archived or inactive if needed
- Always preserve the project’s core behavior outside the requested scope
```

---

# 3. MANDATORY ENVIRONMENT-SPECIFIC REQUIREMENT

Always include this environment section in prompts that involve runtime behavior, API calls, auth, storage, uploads, deployment, or debugging.

```text
Environment-specific requirement:
You must explicitly separate your analysis and implementation notes by runtime/deployment path:

1. Local integrated development
2. Firebase Hosting + Cloud Run
3. Netlify frontend + Cloud Run backend
4. Any other active backend-capable deployment path already present in the repo

For each path, explain clearly:
- what part is frontend
- what part is backend
- what route/API path is used
- what auth/session behavior applies
- what environment variables matter
- what behavior is local-only vs production-only
- what is same-origin vs cross-origin
- what changes are path-specific vs shared

Do not mix these environments together.
Do not assume that a fix for local automatically applies to Cloud Run or Netlify.
Call out any environment-specific risks explicitly.
```

---

# 4. SHARED REPO-ANALYSIS RULES

```text
Mandatory repo-analysis rules:
Before editing:
1. Read all relevant files fully
2. Trace imports/exports and shared contracts
3. Identify sensitive or central files
4. Trace frontend/backend boundaries
5. Trace route ownership
6. Trace state flow and service flow end-to-end
7. Identify whether the issue is UI-only, backend-only, runtime-specific, auth-specific, deployment-specific, or shared
8. Write a short internal impact assessment before changing anything
9. Read `ZOOTOPIA_PROJECT_LEDGER.txt` before major changes
10. If the task has a dedicated guide file, treat it as an intended-flow reference and compare real code against it
```

---

# 5. SHARED DEPENDENCY AND COMPATIBILITY RULES

```text
Dependency and compatibility rules:
Before implementation:
- inspect `package.json`
- inspect `package-lock.json`
- detect exact React version
- detect relevant package versions
- verify that any library used is already installed and compatible
- do not add or replace packages casually
- if a package change is required, explain why and keep it minimal
- keep package.json, lockfile, and imports aligned
- do not import or rely on undeclared packages
- verify React/runtime compatibility before introducing UI libraries
- verify server/runtime compatibility before introducing backend libraries
```

---

# 6. SHARED CHANGE-CONTROL RULES

```text
Change-control rules:
- Change only files that truly need changes
- Do not “clean up” unrelated code
- Do not rename files, functions, props, routes, collections, APIs, or shared contracts unless strictly required
- Do not replace existing systems with your preferred pattern unless explicitly requested
- Keep edits surgical and compatibility-safe
- If a file is central or risky, edit the smallest possible surface
- If a system already works, do not rebuild it to solve a narrow issue
```

---

# 7. SHARED TEST / MOCK / DEBUG ISOLATION RULES

```text
Tests and non-production isolation rules:
- Run full-project lint after implementation
- If lint/type/build issues remain, clearly separate:
  - issues introduced by the new change
  - pre-existing unrelated issues
- Test files must remain isolated
- Mock code must not be imported by production code
- Debug-only code must not remain in live runtime paths
- No hidden dependency from `tests/`, mock helpers, or temporary debug files into the real app flow
- Verify explicitly that test-only files are not wired into production runtime
```

---

# 8. SHARED LEDGER AND DOCUMENTATION RULES

```text
Documentation and ledger rules:
- Read `ZOOTOPIA_PROJECT_LEDGER.txt` before major changes
- Append a new dated entry after meaningful changes
- Do not overwrite history
- Each new ledger entry should include:
  - Area
  - Files
  - Summary
  - Reason
  - Technical details
  - Risks / dependencies
  - Notes
- If a task depends on a guide file, mention whether the implementation matched the guide or required compatible adaptation
```

---

# 9. SHARED VERIFICATION RULES

```text
Testing and verification rules:
After implementation:
1. Run full-project lint
2. If full-project lint cannot be completed, explain why clearly
3. Run targeted verification for the changed flow
4. Verify touched runtime/deployment flows across all relevant environments
5. Explain exactly what was verified and what could not be fully verified
6. Clearly separate:
   - new issues introduced by the change
   - pre-existing unrelated issues
```

---

# 10. SHARED OUTPUT REQUIREMENTS

```text
Output requirements:
After the work, report clearly:
1. Root cause
2. Exact files changed
3. What changed
4. What was preserved
5. Environment-specific impact
6. Verification results
7. Whether full-project lint passed
8. Whether remaining issues are pre-existing only
9. Why compatibility remains safe
10. What was intentionally left untouched
```

---

# 11. TASK-TYPE CLASSIFICATION SYSTEM

This is the most important update.

Every implementation prompt must explicitly declare which one of the following prompt types it is using.

## Type A — UI-Only Prompt
Use this when the task mainly affects:
- components
- pages
- layout
- spacing
- UX wording
- responsiveness
- dark/light mode
- status display
- tracking UI
- forms
- navigation surface
- design polish

### UI-specific mandatory rules
```text
UI-specific rules:
- Do not redesign the whole page unless explicitly requested
- Preserve the current design language
- Preserve responsiveness across all screen sizes
- Preserve dark mode behavior
- Remove clutter, not functionality
- Make the smallest visual change necessary
- Do not alter unrelated pages
- Do not break current interaction patterns unless the task explicitly requires it
- If UI state reflects backend/runtime state, ensure the displayed state remains truthful to the real underlying system
```

### Responsive-design rules for UI prompts
```text
Responsive-design requirement:
You must verify that the UI behaves correctly across:
- small mobile
- mobile
- tablet
- laptop
- desktop
- ultra-wide screens

Layout direction guidance:
- on large screens, layouts may lean more horizontal when that improves clarity and space usage
- on narrow/mobile screens, layouts must lean more vertical/stacked because the screen width requires it
- do not force desktop-horizontal layouts onto narrow screens
- ensure wrapping, stacking, spacing, overflow, truncation, scroll behavior, and touch usability remain correct
- buttons, cards, selectors, dialogs, sidebars, forms, and status panels must remain usable on small screens
```

### When to use Type A
Examples:
- improve upload page spacing
- fix mobile layout
- remove useless status labels like Idle
- improve visual hierarchy
- fix overflow in a results panel
- separate a landing page visually from another page without changing deep backend behavior

---

## Type B — Backend-Only Prompt
Use this when the task mainly affects:
- API routes
- server validation
- orchestration
- auth/session backend logic
- provider/runtime integrations
- database writes
- cron/cleanup/retention behavior
- internal services
- logging/monitoring/diagnostics
- secure integrations

### Backend-specific mandatory rules
```text
Backend-specific rules:
- Keep backend authority on the backend
- Preserve route compatibility unless explicitly requested
- Add validation where needed
- Add structured error handling
- Add comments for important logic
- Prefer centralized constants/helpers over duplicated raw strings
- Improve logging without unexpectedly changing external behavior
- Preserve API shape unless a coordinated contract change is required
- Keep admin-only and privileged logic hardened
- Do not move secure logic into the frontend
```

### When to use Type B
Examples:
- fix token reuse in `/api/ai/execute`
- change document-runtime storage behavior
- harden billing verification
- add backend timeout
- improve provider dispatch
- fix retry/idempotency issues

---

## Type C — Full-Stack Prompt
Use this when the task needs coordinated changes across:
- frontend UI
- frontend services
- backend APIs
- contracts between frontend and backend
- shared types/state
- result rendering + backend persistence
- upload/generation flows spanning multiple layers

### Full-stack-specific mandatory rules
```text
Full-stack rules:
- Explicitly trace the end-to-end flow from browser action to backend result and back to UI projection
- Keep frontend/backend responsibility boundaries clear
- Update shared contracts carefully and minimally
- If payload shape changes, update all dependent layers safely
- Do not fix the frontend symptom while leaving the backend root cause unresolved
- Do not fix the backend root cause while leaving the frontend contract broken
- Preserve backward compatibility where possible
```

### When to use Type C
Examples:
- upload succeeds but preview/export later breaks
- generation request fails due to auth header mismatch
- new result metadata must be saved and displayed
- progress tracking must reflect backend state truthfully
- shared document context must be consumed by a tool end-to-end

---

## Type D — New Feature / New Tool Prompt
Use this when adding:
- a brand-new tool
- a new page
- a new route
- a new admin workspace
- a new backend capability
- a new export mode
- a new model-selection workflow
- a new integration that did not exist before

### New-feature-specific mandatory rules
```text
New feature / new tool rules:
- Attach the new feature to the current architecture instead of replacing it
- Reuse existing providers, contexts, services, status systems, export systems, routing conventions, and layout patterns where appropriate
- Do not create a disconnected second architecture when the current project already has a valid place for the feature
- Define clear ownership: frontend, backend, shared contract, storage, and admin visibility
- Add the smallest set of new files necessary
- Document the new feature thoroughly in the ledger
- Add path-specific environment notes if the new feature behaves differently in local vs Cloud Run vs Netlify
```

### When to use Type D
Examples:
- add a new infographic tool
- add a new admin audit page
- add a new AI-powered study feature
- add a new export format
- add a new results library section

---

## Type E — Hybrid / Architecture-Sensitive Prompt
Use this when the task touches:
- route ownership
- feature migration
- runtime authority separation
- auth/session architecture
- shared document runtime
- provider orchestration
- deployment-aware behavior
- large but still incremental structural adjustments

### Architecture-sensitive mandatory rules
```text
Architecture-sensitive rules:
- Do not broad-refactor unless explicitly requested
- Extend and harden the existing architecture instead of fighting it
- Preserve compatibility layers and migration wrappers
- Document architectural intent in comments where helpful
- Call out exactly which parts are staying authoritative and which parts are only mirrors or projections
- Prefer incremental migration over clean-slate replacement
```

### When to use Type E
Examples:
- separating upload page from generation page while preserving shared state
- switching extraction engines while preserving document-runtime architecture
- moving execution authority fully backend-side while keeping frontend contracts stable
- hardening session flow across multiple deployment paths

---

# 12. WHAT TO INCLUDE IN EACH PROMPT BY TYPE

## UI-only prompt should include
- shared master rules
- environment separation if runtime-sensitive
- UI-specific rules
- responsive-design block
- lint + verification requirement
- no unrelated backend rewrites

## Backend-only prompt should include
- shared master rules
- environment separation
- backend-specific rules
- auth/session rules if relevant
- document/AI runtime rules if relevant
- lint + verification requirement
- no UI redesign

## Full-stack prompt should include
- shared master rules
- environment separation
- full-stack rules
- UI rules if UX surface changes
- backend rules if API/runtime changes
- auth/session rules if applicable
- document/AI runtime rules if applicable
- lint + verification requirement

## New feature / new tool prompt should include
- shared master rules
- environment separation
- new-feature rules
- appropriate UI/backend/full-stack add-ons depending on the feature
- lint + verification requirement
- explicit instruction not to create a disconnected subsystem unnecessarily

---

# 13. MASTER TEMPLATE FOR FUTURE PROMPTS

Use this structure whenever you want the AI to generate or execute a task safely.

```text
Spawn multiple subagents to explore this repo in parallel.

Use separate subagents for:
1. architecture and dependency tracing
2. frontend/UI flow tracing
3. backend/API/runtime tracing
4. auth/session/environment tracing
5. build/lint/test/deployment verification

Then consolidate findings before making changes.

Analyze the current codebase first before making any changes.

Important:
This is an existing production-style project. Do not rebuild from scratch. Do not redesign the architecture unless explicitly requested. Do not remove working features. Do not change unrelated areas. Make only minimal, surgical, backward-compatible changes required for this task.

Mandatory documentation rule:
Before making any change, read `ZOOTOPIA_PROJECT_LEDGER.txt` first and use it as the primary project memory and historical change log.
If this task also has a dedicated architecture/flow guide, read and use that guide before implementation.

Environment-specific requirement:
You must explicitly separate your analysis and implementation notes by runtime/deployment path:

1. Local integrated development
2. Firebase Hosting + Cloud Run
3. Netlify frontend + Cloud Run backend
4. Any other active backend-capable deployment path already present in the repo

For each path, explain clearly:
- what part is frontend
- what part is backend
- what route/API path is used
- what auth/session behavior applies
- what environment variables matter
- what behavior is local-only vs production-only
- what is same-origin vs cross-origin
- what changes are path-specific vs shared

Do not mix these environments together.
Do not assume that a fix for local automatically applies to Cloud Run or Netlify.
Call out any environment-specific risks explicitly.

Task type:
[Choose one explicitly:
- UI-only
- Backend-only
- Full-stack
- New feature / new tool
- Hybrid / architecture-sensitive]

Task:
[write the exact task here]

User-visible problem:
[write the visible problem here]

Expected result:
[write the desired end state here]

Suggested files to inspect first:
- [list the likely files here]

Add-on blocks to include:
- [UI-specific rules if needed]
- [Responsive-design requirement if UI is involved]
- [Backend-specific rules if needed]
- [Full-stack rules if needed]
- [New feature rules if needed]
- [Auth/session rules if needed]
- [Document/AI runtime rules if needed]
- [Legacy preservation rule if needed]

Do not:
- [list explicit prohibited changes here]
```

---

# 14. RECOMMENDED PROMPT-WRITING METHOD

When writing any future prompt:

1. Start with the shared master instruction block
2. Add the environment-specific requirement block
3. Identify the prompt type
4. Add the task-type-specific rules
5. Add the task itself
6. Add explicit files to inspect
7. Add prohibited changes
8. End with:
   - full-project lint requirement
   - ledger update requirement
   - verification/reporting requirement

---

# 15. SHORT MASTER VERSION

Use this when you want a shorter version but still want strong safety.

```text
Spawn multiple subagents to explore this repo in parallel.

Analyze the current codebase first before making any changes.

Important:
This is an existing production-style project. Do not rebuild from scratch. Make only minimal, surgical, backward-compatible changes.

Mandatory rules:
- Read `ZOOTOPIA_PROJECT_LEDGER.txt` before changes
- Separate analysis by:
  - local integrated development
  - Firebase Hosting + Cloud Run
  - Netlify frontend + Cloud Run backend
  - any other active backend-capable deployment path
- Do not mix environments
- Inspect `package.json` and `package-lock.json`
- Preserve architecture, routes, contracts, and working behavior
- Do not add unnecessary packages
- Do not wire test/mock/debug code into production runtime
- Run full-project lint after implementation
- Update `ZOOTOPIA_PROJECT_LEDGER.txt`

Task type:
[UI-only / Backend-only / Full-stack / New feature / Hybrid]

Task:
[write the exact task here]
```

---

# 16. FINAL RULE

When in doubt:
- preserve the architecture
- separate environments clearly
- read the ledger first
- classify the prompt type correctly
- change only what is necessary
- run lint after the change
- keep test code isolated
- document what changed and why
