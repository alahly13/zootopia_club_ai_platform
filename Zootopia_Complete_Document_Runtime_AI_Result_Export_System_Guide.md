# Zootopia Club Document Runtime, Shared Extraction, AI Generation, and Export Flow Guide

## Purpose

This document is the canonical guide for the intended end-to-end production flow of the Zootopia Club platform.

It describes the desired architecture and execution path for:

- user entry into the platform
- shared document upload
- temporary original-file storage
- Datalab Convert API extraction
- temporary extracted Markdown storage
- shared tool access to the extracted content
- prompt assembly for AI tools
- model execution
- generated-result persistence
- preview and branded export

This guide is written to avoid rewriting the same system explanation repeatedly in future prompts, implementation tasks, and audits.

---

## Core Product Intention

The platform must behave like this:

1. The user signs in.
2. The user is routed directly to the main home page.
3. The main home page is a true standalone entry page, not a buried subsection inside the quiz page.
4. The user uploads one source document.
5. That uploaded document becomes the shared active document for all document-aware tools.
6. The backend stores the original uploaded file temporarily in a user-scoped runtime workspace.
7. The backend automatically sends the file to Datalab Convert API.
8. The backend receives the converted Markdown result.
9. The backend stores the extracted Markdown temporarily in a user-scoped extracted-artifact path.
10. All tools reuse that same extracted Markdown instead of re-extracting the file repeatedly.
11. When the user launches a tool such as quiz generation, the backend combines:
    - the stored extracted Markdown
    - developer-defined static instructions
    - tool-specific prompt templates
    - user-selected preferences
    - optional user free-text instructions
12. The final professional prompt is sent to the user-selected model.
13. The AI response is stored immediately in Firestore.
14. The generated result remains available for 3 days.
15. The existing preview system displays it.
16. The existing export system converts it into branded outputs such as PDF using the already implemented design layer.

---

# 1) Entry Page Behavior

## Required behavior

After login or session resolution, the user must always land on the main home/upload page.

This page must be:

- the main platform entry page
- visually independent
- not hidden inside a quiz-generation page
- the first place users interact with after entering the platform

## Why this matters

The upload-first workflow is the foundation of the shared document system. If users are routed into random remembered pages or buried subpages, the document-centric workflow becomes confusing and inconsistent.

## Intended rule

On initial entry:

- always route to the home/upload page

After entry:

- normal in-app navigation may continue as usual

---

# 2) Upload-First Shared Document Model

## Fundamental rule

The user uploads the source document once.

That uploaded document becomes the shared active document for all relevant tools, such as:

- quiz generation
- file analysis
- study tools
- chatbot flows
- any other document-aware tool

## Why this matters

The system should not force the user to upload the same document separately for each tool.

The platform must treat the uploaded document as a shared runtime resource, not as isolated tool-local state.

---

# 3) User Separation and Scoped Runtime Paths

Each user must have distinct document/runtime ownership so that:

- users do not collide with each other
- sessions do not overwrite each other improperly
- temporary artifacts remain traceable
- cleanup is safe and scoped

## Conceptual workspace model

Each uploaded document belongs to a user-scoped runtime workspace, for example:

```text
runtime/document-workspaces/users/{userId}/workflows/{workflowId}/documents/{documentId}/
```

Possible sub-artifacts inside that document workspace may include:

- original uploaded file
- extracted text
- normalized Markdown
- structured JSON
- page map
- OCR blocks
- auxiliary processing metadata

## Important principle

The backend-owned runtime workspace is the source of truth for active document artifacts.

The frontend must not be treated as the canonical storage location.

---

# 4) Upload Success State

After the user uploads a valid file successfully, the UI should show a clear success state such as:

- File uploaded successfully
- Document prepared successfully
- Ready for tool use

## Important UX rule

Success should not be shown too early.

The system should not show false success before:

- upload is valid
- intake is accepted
- backend storage is ready
- extraction lifecycle has either completed or has entered a real tracked processing stage

---

# 5) Temporary Original File Storage

## Required behavior

The original uploaded file must be stored temporarily in a backend-owned user-scoped workspace.

## Why temporary

The original upload is not intended to live forever in the active runtime layer. It exists only as long as needed for:

- extraction
- cross-tool reuse
- active user work
- later replacement/removal/cleanup

## Trigger conditions for ending its active lifecycle

The temporary original file may be replaced or invalidated when:

- the user uploads a new file
- the user explicitly removes the current file
- a new active session/workflow supersedes the old one
- cleanup rules invalidate the current runtime state

---

# 6) Datalab Convert API as the Extraction Engine

## Intended role

Datalab Convert API is the active primary extraction engine.

It converts the uploaded document into machine-usable text output, especially Markdown.

## Recommended backend request defaults

The backend should call Datalab Convert with defaults similar to:

- mode = balanced
- paginate = true
- output_format = markdown
- save_checkpoint = true

Optional defaults:

- disable_image_captions = true
- disable_image_extraction = false
- skip_cache = false

## Security rule

Datalab API credentials must remain backend-only.

Never expose the API key to the browser.

## Recommended backend lifecycle

1. Receive file in `/api/documents/intake`
2. Store original file temporarily
3. Submit file to Datalab Convert API
4. Receive `request_check_url`
5. Poll until:
   - complete
   - failed
6. Only after confirmed completion:
   - store extracted Markdown
   - store derived artifacts
   - register ready runtime state

---

# 7) Extracted Markdown as the Canonical Tool Input

## Core rule

The extracted Markdown returned by Datalab Convert becomes the canonical extracted document used by tools.

## Why Markdown

Markdown is ideal for the current platform direction because it:

- preserves readable structure
- works well with LLM prompting
- is easy to reuse across tools
- is easy to render, inspect, and debug

## Important architectural rule

Tools should not re-extract the source file each time.

Instead, they should resolve and reuse the stored extracted Markdown.

---

# 8) Temporary Storage of Extracted Artifacts

The extracted Markdown must be stored temporarily in a path separate from the original uploaded file, but still inside the same user-owned runtime system.

## Conceptual separation

Example structure:

```text
runtime/document-workspaces/users/{userId}/workflows/{workflowId}/documents/{documentId}/original/
runtime/document-workspaces/users/{userId}/workflows/{workflowId}/documents/{documentId}/artifacts/
```

Inside the artifact path, the system may store:

- normalized markdown
- structured json
- page metadata
- auxiliary text forms
- runtime processing metadata

## Why separate original and extracted data

This separation helps:

- debugging
- cleanup
- future engine upgrades
- prompt context resolution
- deterministic tool behavior

---

# 9) Shared Tool Access to the Stored Extracted Markdown

When the user opens a document-aware tool, the tool must not behave as if the file is tool-local.

Instead, the tool should resolve the currently active uploaded document from the shared backend runtime model.

The tool should be able to access:

- the active document identity
- the extracted markdown path
- the extracted markdown contents
- any relevant runtime metadata

This makes the uploaded file truly reusable across tools.

---

# 10) Quiz / Tool Generation Flow

When the user clicks Generate in a tool such as quiz generation, the backend or orchestration layer should perform the following sequence:

## Step 1: resolve the active document
Find the currently active shared uploaded document.

## Step 2: load the stored extracted Markdown
Load the full extracted Markdown from backend-owned temporary storage.

## Step 3: gather developer-defined instructions
These are the fixed instructions written by the platform developer, such as:

- quality rules
- answer format rules
- style rules
- educational rules
- output schema rules
- safety constraints
- branding or formatting expectations

## Step 4: gather tool-specific prompt rules
These come from the tool itself, such as:

- quiz generation instructions
- study summary instructions
- flashcard instructions
- chatbot tutoring rules
- infographic instructions

## Step 5: gather user-selected preferences
These are the tool settings selected in the UI, such as:

- number of questions
- question types
- language
- difficulty
- mode
- tone
- formatting preferences
- any other structured user choices

## Step 6: gather user optional free-text instructions
If the UI includes a user note or instruction field, its value must be included.

Examples:
- focus on definitions
- make the quiz difficult
- avoid true/false
- emphasize practical examples

## Step 7: assemble the final professional prompt
The system must merge all of the above into one final prompt.

That final prompt should include:

- extracted source content
- developer instructions
- tool template instructions
- user preferences
- user free-text note

## Step 8: send the prompt to the selected model
The actual model used must match the model selected by the user in the UI.

---

# 11) Prompt Assembly Principle

The prompt must not be assembled in an ad-hoc or fragmented way.

A professional prompt pipeline should:

- normalize the extracted text
- merge static and dynamic instructions cleanly
- preserve structure
- avoid losing user intent
- avoid ignoring developer guardrails
- keep tool-specific behavior deterministic

## Conceptual prompt structure

A strong prompt assembly design usually contains:

1. developer system rules
2. tool-specific structured instructions
3. user-selected configuration
4. optional user extra instructions
5. extracted source content

This should be deterministic and traceable.

---

# 12) AI Model Execution

After prompt assembly:

1. the prompt is sent to the selected model
2. the system waits for the model response
3. the response is normalized if needed
4. the response becomes the canonical generated result for that tool execution

## Important rule

The selected model in the UI must be the model actually used in execution.

There should be no silent mismatch unless an explicit fallback policy exists and is clearly tracked.

---

# 13) Result Persistence in Firestore

## Required behavior

The generated AI result must be stored immediately after generation.

This stored result becomes the canonical source for:

- preview
- history
- download/export
- later recall during the retention window

## Retention policy

Generated results are kept for 3 days.

After that, cleanup policies remove them automatically according to the configured retention system.

## Why Firestore is used here

Firestore is suitable for:

- result records
- metadata
- ownership
- history
- expiration timestamps
- user-scoped access

The active temporary document runtime itself should remain backend-owned, while result persistence can be metadata/result-oriented.

---

# 14) Preview / Result Display Layer

After generation, the platform displays the result in the existing preview system.

This preview layer should remain intact.

The preview should read from the canonical generated result source and should not require a second disconnected rendering architecture.

The current design and result layout should remain stable unless a narrow fix is needed.

---

# 15) Export / Download Flow

## Intended behavior

When the user clicks an export button, such as Export as PDF:

1. the system resolves the canonical generated result
2. the system passes that result into the existing export layer
3. the export layer renders the output using the already designed branded layout
4. the file is produced in the requested format

## Important rule

The existing branded export system must not be casually redesigned or replaced.

Only broken plumbing should be fixed if required.

## Example export targets

- PDF
- DOCX
- Markdown
- other already-supported formats

## PDF export expectation

The existing PDF design system should continue to apply:

- custom structure
- your branding
- your visual style
- your layout rules
- your existing export formatting choices

---

# 16) Storage Responsibility Summary

## Original uploaded file
Stored temporarily in backend-owned user-scoped runtime storage.

## Extracted Markdown
Stored temporarily in backend-owned user-scoped artifact storage.

## Shared active document state
Tracked through backend runtime metadata and resolution logic.

## Generated AI result
Stored in Firestore for 3 days.

## Preview layer
Reads from the canonical generated result flow.

## Export layer
Reads from the generated result / preview-compatible source and applies the existing branded export design.

---

# 17) What Must Not Happen

The system must avoid these problems:

- routing users into buried pages on entry
- forcing repeated uploads for each tool
- re-extracting the same file unnecessarily for each tool
- storing the frontend mirror as the source of truth
- showing fake success before real backend readiness
- keeping duplicate extraction engines active at once
- creating conflicting storage paths
- mismatching selected model vs actual execution model
- storing results without expiration governance
- redesigning the export system unnecessarily
- breaking the existing branded PDF pipeline

---

# 18) Recommended End-to-End Mental Model

The simplest way to think about the platform is this:

## Phase A: Entry
User signs in and always lands on the main upload page.

## Phase B: Shared document preparation
User uploads one document.
The backend stores it temporarily and extracts canonical Markdown using Datalab Convert API.

## Phase C: Shared tool usage
All tools reuse the same extracted Markdown through the shared document runtime.

## Phase D: AI generation
The system builds a professional prompt using:
- extracted Markdown
- developer rules
- tool template rules
- user preferences
- optional user free-text note

Then it sends the final prompt to the selected model.

## Phase E: Result persistence
The AI result is stored immediately in Firestore for 3 days.

## Phase F: Preview and export
The existing result view displays it.
The existing export system converts it into branded downloadable files such as PDF.

---

# 19) Implementation Philosophy

This flow should be completed through surgical fixes only.

The project should preserve:

- current architecture
- backend authority
- shared document runtime model
- existing preview layer
- existing export design
- existing branded PDF pipeline

Only the exact missing or broken links in the flow should be fixed.

---

# 20) Final Canonical Flow Summary

```text
User signs in
-> user lands on standalone home/upload page
-> user uploads one source document
-> backend stores original file temporarily in user-scoped runtime workspace
-> backend sends file to Datalab Convert API
-> backend polls until conversion completes
-> backend stores extracted Markdown temporarily in user-scoped artifact path
-> shared active document becomes available to all tools
-> user opens a tool such as quiz generation
-> system loads stored extracted Markdown
-> system merges developer rules + tool rules + user settings + user extra instructions
-> final professional prompt is sent to the selected model
-> AI response is received
-> AI result is stored immediately in Firestore
-> result remains available for 3 days
-> preview system displays the result
-> export system converts the result to branded formats such as PDF
```

---

## Suggested Use of This Guide

Use this file whenever you need to:

- explain the system to an AI coding agent
- explain the architecture to a human developer
- verify whether the implemented flow matches the intended product behavior
- avoid rewriting the same long explanation again in prompts
