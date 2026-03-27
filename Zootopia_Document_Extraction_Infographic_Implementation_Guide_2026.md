# Zootopia Club — Document Extraction + Dual-Mode Infographic System Implementation Guide (2026)

## Purpose of This Guide

This document is a full implementation guide for upgrading the existing **Zootopia Club** platform with a production-grade, centralized **document extraction and reusable artifact system**, together with a fully separated **dual-mode Infographic architecture**.

This is **not** a greenfield build guide.
It is a safe extension guide for an **already-built, evolving production-style platform**.
The goal is to help developers and AI builders implement the new system in a way that:

- preserves the current foundation,
- avoids breaking existing tools,
- respects current route and feature ownership,
- keeps backward compatibility,
- isolates new logic cleanly,
- and follows 2026 best practices.

---

# 1. Current Platform Reality

Before implementation, the team must fully understand the current architecture.

## 1.1 Project status

Zootopia Club is already an active, modular AI education platform with:

- a React 19 frontend,
- an Express backend,
- Firebase Auth + Firestore,
- a centralized AI model registry and orchestration system,
- feature-owned route modules under `src/features/*`,
- shared preview/export infrastructure,
- global uploaded-document ownership via `DocumentProvider`,
- and multiple existing tools such as Assessment, File Analysis, Infographic, Image Generator, Chatbot, Study Tools, Live Voice, and Video Generator.

The current architecture documentation and canonical ownership rules are already captured in the project ledger and model guides. New work must extend that structure rather than replace it. Existing uploaded files are treated as shared app-level resources through `DocumentProvider`, and uploaded document continuity already spans tool routes such as `/generate` and `/analysis`. fileciteturn5file8 fileciteturn5file1

## 1.2 Important existing constraints

The current system already includes:

- a centralized result preview and export backbone,
- a centralized AI routing stack,
- feature-owned route pages,
- compatibility bridge files that still exist intentionally,
- global document state,
- admin-only governance areas,
- and backend-authoritative billing and entitlement systems.

This means the new document extraction and infographic work **must not** create a competing architecture.
It should plug into the current platform backbone.

---

# 2. Strategic Goal

The upgrade has **two connected objectives**.

## 2.1 Objective A — Central Document Extraction Platform

Create a **single professional extraction system** that:

- reads uploaded files once,
- extracts full usable text and document structure,
- performs OCR where needed,
- stores extracted results as reusable artifacts,
- scopes those artifacts by user/admin ownership,
- and allows all tools to inject the correct extracted content into prompts.

## 2.2 Objective B — Dual-Mode Infographic System

Refactor the Infographic tool into **two separate internal systems** behind one shared page shell:

1. **Infographic Image Mode**
   - image-capable models only
   - outputs infographic as an image asset
   - supports premium preview and download
   - should be the default mode now

2. **Structured Infographic Renderer Mode**
   - text/reasoning/structured-output models only
   - returns structured infographic content
   - renders real UI blocks, sections, charts, icons, and typography
   - must remain fully separated from Image Mode

The immediate product strategy is to prioritize **Infographic Image Mode first** because it is faster to ship, easier to align with preview/download workflows, and already matches the short-term product milestone. Structured Mode remains architecturally important for the future because it is stronger for academic correctness, printability, and editability. fileciteturn5file4 fileciteturn5file13

---

# 3. High-Level System Design

The new system should be designed as **four major architecture layers**.

## 3.1 Layer 1 — Upload and File Intake

This layer receives the user’s uploaded file and performs:

- file validation,
- file typing,
- upload lifecycle control,
- cancellation handling,
- replacement handling,
- and registration of the source document.

## 3.2 Layer 2 — Document Extraction Engine

This layer performs:

- native text extraction,
- OCR fallback,
- hybrid merge,
- metadata generation,
- page/block segmentation,
- and structured artifact output generation.

## 3.3 Layer 3 — Artifact and Context Layer

This layer stores and resolves:

- full extracted text,
- normalized text,
- page-level and OCR-level metadata,
- ownership metadata,
- cleanup status,
- and prompt-injection references for all tools.

## 3.4 Layer 4 — Tool Consumers

All tools consume extracted document content through an authenticated, owner-aware resolver.
This includes:

- Assessment,
- File Analysis,
- Study Tools,
- Chat,
- and especially both Infographic modes.

The tools must not re-read raw files independently.

---

# 4. Mandatory Architectural Principles

## 4.1 Existing-platform rule

This platform already exists.
Nothing in this implementation should assume a fresh rebuild.

## 4.2 Safe incremental rule

The implementation must be:

- additive,
- incremental,
- compatibility-safe,
- and traceable in the ledger.

## 4.3 No cross-user leakage rule

No user may ever read another user’s extracted artifact unless an explicit, audited admin permission path allows it.

## 4.4 No shared anonymous extraction state rule

Never use a global anonymous variable like `currentExtractedText` as a source of truth.
The source of truth must be an **owner-scoped artifact reference**.

## 4.5 Separation rule for Infographic modes

The two infographic systems must not share one blended:

- prompt builder,
- execution contract,
- result schema,
- or renderer.

---

# 5. Recommended Folder and Module Structure

A dedicated folder for Infographic is strongly recommended.
A dedicated folder for document extraction is also recommended.

## 5.1 Frontend structure

```text
src/
  features/
    infographic-generator/
      index.ts
      pages/
        InfographicGeneratorPage.tsx
      shared/
        types.ts
        modeContracts.ts
        modeDefaults.ts
        infographicSettings.ts
      shell/
        InfographicWorkspaceShell.tsx
        InfographicModeSwitch.tsx
        InfographicSharedControls.tsx
      image/
        components/
          InfographicImageModePanel.tsx
        prompt/
          buildInfographicImagePrompt.ts
        execution/
          executeInfographicImage.ts
        rendering/
          renderInfographicImageResult.tsx
        types/
          imageModeTypes.ts
      structured/
        components/
          InfographicStructuredModePanel.tsx
        prompt/
          buildStructuredInfographicPrompt.ts
        execution/
          executeStructuredInfographic.ts
        rendering/
          renderStructuredInfographicResult.tsx
        types/
          structuredModeTypes.ts
      orchestration/
        resolveInfographicModeContext.ts
        routeInfographicExecution.ts

  documents/
    shared/
      documentArtifactTypes.ts
      documentContextTypes.ts
      documentOwnership.ts
    context/
      promptContextResolver.ts
      documentArtifactResolver.ts
    hooks/
      useActiveDocumentArtifact.ts
      useDocumentArtifactCleanup.ts
```

## 5.2 Backend structure

```text
server/
  documents/
    ingestion/
      fileIntakeService.ts
      fileTypeDetection.ts
    extraction/
      extractionCoordinator.ts
      extractionContracts.ts
      extractionVersioning.ts
      mergeExtractedSources.ts
    extractors/
      native/
        pdfNativeExtractor.py
        docxExtractor.py
        pptxExtractor.py
        xlsxExtractor.py
      ocr/
        paddleOcrExtractor.py
      advanced/
        doclingExtractor.py
    storage/
      documentArtifactStore.ts
      documentArtifactPaths.ts
    cleanup/
      artifactInvalidationService.ts
      artifactCleanupScheduler.ts
    context/
      ownerScopedArtifactResolver.ts
      promptContextAssembler.ts

  infographic/
    shared/
      infographicContracts.ts
    image/
      infographicImagePromptBuilder.ts
      infographicImageExecution.ts
      infographicImageResultNormalizer.ts
    structured/
      infographicStructuredPromptBuilder.ts
      infographicStructuredExecution.ts
      infographicStructuredResultNormalizer.ts
    orchestration/
      infographicModeRouter.ts
```

This structure keeps new logic isolated while preserving the current feature-first and shared/global ownership rules documented in the project architecture. fileciteturn5file8

---

# 6. Recommended Libraries by Layer (2026)

This section lists the recommended libraries and the role each one should play.
All version numbers below are based on current official or primary-source documentation as of March 2026.

## 6.1 Frontend application layer

### Core runtime
- **React 19.2**
- **TypeScript**
- **Tailwind CSS v4**
- **react-router-dom 7.x** (already aligned with current project architecture)
- **motion / Framer Motion**

### Why
Use the current frontend foundation and extend it safely.
Do not replace the current app shell.
React’s official docs currently list **19.2** as the latest version. citeturn958864search0turn958864search12

## 6.2 Backend API layer

### Recommended stack
- **FastAPI 0.135.2** for the new extraction/API microservice or server-side extraction module boundary
- **Pydantic 2.12.5** for schema validation
- **SQLAlchemy 2.0.48** for relational persistence if a structured DB layer is introduced beside Firestore
- **Redis Open Source 8.6.x** for ephemeral jobs, cancellation signals, cleanup coordination, and cache/queue coordination

### Why
FastAPI remains an excellent typed Python API layer for extraction-oriented workloads, and the current release notes show **0.135.2** as the latest release. FastAPI also explicitly depends on the Pydantic v2 line. Pydantic docs currently show **v2.12.5**, and SQLAlchemy documentation lists **2.0.48** as the current 2.0 release. Redis Open Source release notes list **8.6.x** as the current OSS line. citeturn958864search1turn958864search13turn958864search2turn958864search19turn494987search3turn494987search19

## 6.3 Native document extraction layer

### Recommended stack
- **pypdf 6.9.2** for pure-Python PDF text extraction and PDF text retrieval
- **python-docx** or the equivalent DOCX parser layer if DOCX extraction moves server-side
- **openpyxl** for spreadsheet extraction if XLSX text/structure is moved server-side
- existing frontend-side libraries such as **mammoth**, **xlsx**, and **pdfjs-dist** can remain in the current app where they already serve existing flows

### Why
For a fully free-friendly extraction stack, prefer **pypdf** instead of AGPL-governed PDF libraries. The official pypdf docs describe it as a free and open source pure-Python PDF library that can retrieve text and metadata from PDFs, and PyPI currently lists **6.9.2**. citeturn494987search2turn494987search6

## 6.4 OCR layer

### Recommended stack
- **PaddleOCR 3.4.0** as the primary OCR engine

### Why
PaddleOCR supports **100+ languages**, making it strong for Arabic + English from phase one, and the official release feed lists **v3.4.0** as the January 2026 release. citeturn494987search4turn494987search16

## 6.5 Advanced document understanding layer

### Recommended stack
- **Docling 2.82.0** as the advanced parsing and structured document representation layer

### Why
Docling is well suited for parsing PDF, DOCX, HTML, and more into a unified representation that can power downstream GenAI workflows. PyPI currently lists **2.82.0**. citeturn494987search1turn494987search9

## 6.6 Preview and export layer for Infographic Image Mode

### Recommended stack
- current project preview/export backbone
- **html2canvas**
- **jsPDF**
- **pdf-lib**
- optional **html-to-image** for more explicit PNG/SVG DOM snapshot export
- optional **react-zoom-pan-pinch** for advanced image zoom/pan UX

### Why
Image Mode mainly needs premium preview UX, reliable PNG download, and image-based PDF export. The current infographic strategy documents already recommend this direction for Image Mode. fileciteturn5file11 fileciteturn5file15

## 6.7 Structured infographic renderer layer

### Recommended stack
- current React 19 + Tailwind 4 frontend
- **Recharts** for charts
- optional **Visx** for advanced chart control
- optional **Apache ECharts** for heavier chart cases
- **Lucide React** for icons
- optional **Iconify** or **Phosphor Icons** if needed later
- **react-pdf** for future structured document export
- **pdf-lib** for low-level PDF control
- optional **KaTeX** / **MathJax** for science/math notation later

### Why
Structured Mode needs real layout composition, chart zones, real text surfaces, and strong print/export control. This matches the architecture described in the infographic mode guide. fileciteturn5file11 fileciteturn5file15

---

# 7. Free-Friendly Dependency Guidance

If the platform goal is to stay as free-friendly as possible:

- prefer **pypdf** over AGPL-restricted PDF extraction libraries,
- prefer **PaddleOCR** for open OCR,
- prefer **Docling** as the advanced parsing layer when needed,
- self-host **Redis OSS** instead of assuming a managed paid cloud tier,
- keep existing frontend preview/export packages already present in the project where safe.

This produces a more licensing-friendly and cost-aware foundation.

---

# 8. Execution Order — Hierarchical Implementation Plan

This section defines the recommended implementation order.
Each step should be completed before the next one.

## Phase 0 — Architecture and dependency audit

### Goals
- inspect current file relationships,
- inspect `package.json` and the current app dependencies,
- verify React compatibility before introducing frontend packages,
- verify backend integration boundaries,
- map the existing upload → extraction → document state → AI prompt flow,
- identify the smallest safe integration points.

### Output
- risk map
- file impact map
- dependency audit
- ledger entry

## Phase 1 — Scaffolding and isolated folders

### Goals
- create the dedicated `documents/` structure
- create the dedicated `src/features/infographic-generator/` internal substructure
- create shared mode types
- create artifact reference types
- create placeholders for extraction and context services

### Output
- architecture scaffolding only
- no broad behavioral change yet

## Phase 2 — Central document extraction engine

### Goals
- create a single extraction coordinator
- support file-type detection
- support native extraction first
- support OCR fallback
- support hybrid merge

### Rules
- preserve full text
- never silently summarize extracted text
- preserve page-level data
- preserve OCR block metadata

## Phase 3 — Artifact storage and ownership model

### Goals
- define the owner-scoped `DocumentArtifactRef`
- store extraction outputs in a stable artifact store
- preserve references to full text, normalized text, structured JSON, and OCR metadata
- make tools consume artifact references only

## Phase 4 — Cleanup and invalidation

### Goals
- invalidate extracted artifacts when upload is cancelled
- invalidate artifacts when file is removed
- invalidate artifacts when file is replaced
- ensure tools immediately lose access after invalidation

### Important rule
If a file is replaced, the old artifact chain must be purged before the new one becomes active.

## Phase 5 — Prompt context resolver

### Goals
- implement one shared owner-aware prompt context resolver
- resolve the active artifact safely
- inject relevant text/chunks/settings into tools
- respect artifact status and ownership

## Phase 6 — Infographic dual-mode shell

### Goals
- keep one Infographic page shell
- add a mode switch
- default active mode = Image Mode
- switch model list and settings by selected mode

## Phase 7 — Infographic Image Mode implementation

### Goals
- image-capable models only
- dedicated prompt builder
- dedicated execution path
- dedicated image result contract
- dedicated preview/download path

## Phase 8 — Structured Infographic Renderer Mode implementation

### Goals
- text/structured-output models only
- dedicated prompt builder
- dedicated execution path
- dedicated structured result schema
- dedicated structured renderer

## Phase 9 — Integration and verification

### Goals
- run end-to-end validation
- verify no cross-mode leakage
- verify no cross-user leakage
- verify preview/export integrity
- verify cancellation cleanup
- verify existing unrelated tools remain stable

---

# 9. Central Document Extraction Architecture

## 9.1 Required behavior

The extraction system must:

- accept uploaded files,
- detect file type,
- choose the correct extraction strategy,
- extract full text,
- perform OCR when needed,
- normalize and preserve outputs,
- store outputs as artifacts,
- and expose those artifacts to all tools.

## 9.2 Supported extraction paths

### Native-first extraction
Use native extraction for:

- embedded-text PDFs,
- DOCX,
- PPTX,
- XLSX,
- text-based documents.

### OCR fallback
Use OCR for:

- scanned PDFs,
- uploaded images,
- image-only pages,
- text inside images embedded in PDFs when feasible.

### Hybrid merge
Use hybrid merge when a file contains both:

- real embedded text,
- and image-based text.

## 9.3 Output formats that should be preserved

Each artifact should preserve at least:

- `fullText`
- `normalizedText`
- `structuredDocumentJson`
- `ocrBlocks`
- `pageSegments`
- `extractionMeta`
- `languageHints`
- `sourceAttribution`

---

# 10. Suggested Artifact Data Model

```ts
export type WorkspaceScope = 'user-private' | 'admin-private' | 'shared-admin-system';

export type ArtifactStatus =
  | 'pending'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'deleted';

export interface DocumentArtifactRef {
  artifactId: string;
  documentId: string;
  sourceFileId: string;

  ownerUserId: string;
  ownerRole: 'user' | 'admin';
  workspaceScope: WorkspaceScope;

  fullTextPath: string;
  normalizedTextPath: string;
  structuredJsonPath: string;
  ocrJsonPath?: string;
  pageMapPath?: string;

  extractionVersion: string;
  extractionStrategy: 'native' | 'ocr' | 'hybrid';
  languageHints: string[];
  hasNativeText: boolean;
  hasOCR: boolean;

  status: ArtifactStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}
```

## 10.1 Storage path recommendation

```text
/artifacts/users/{userId}/{documentId}/full-text.txt
/artifacts/users/{userId}/{documentId}/normalized.md
/artifacts/users/{userId}/{documentId}/structured.json
/artifacts/users/{userId}/{documentId}/ocr/page-001.json

/artifacts/admins/{adminId}/{documentId}/full-text.txt
/artifacts/admins/{adminId}/{documentId}/normalized.md
/artifacts/admins/{adminId}/{documentId}/structured.json
```

This ensures owner-scoped separation from the start.

---

# 11. Multi-User Isolation and Admin Separation

This system must be built for many simultaneous users.

## 11.1 Mandatory ownership enforcement

Every artifact must be bound to:

- `ownerUserId`
- `ownerRole`
- `workspaceScope`
- `documentId`
- `sourceFileId`

## 11.2 User rules

A normal user may:

- upload files,
- create extraction artifacts,
- access only their own artifacts,
- use those artifacts in their own tools.

## 11.3 Admin rules

An admin may:

- use admin-owned artifacts,
- inspect user-owned artifacts only when explicitly permitted,
- trigger cleanup and governance actions,
- and must remain auditable.

## 11.4 Critical anti-leak rules

Never allow:

- one user’s tool to read another user’s extracted text,
- admin-only system artifacts to leak into user sessions,
- a global anonymous extracted-text state shared across accounts.

---

# 12. Cleanup and Invalidation Lifecycle

This part is critical.

## 12.1 Events that must invalidate artifacts

The system must delete/invalidate extracted outputs immediately when:

- upload is cancelled,
- processing is cancelled,
- file is removed,
- file is replaced,
- session is invalidated,
- artifact is explicitly deleted,
- or the workflow aborts.

## 12.2 Required behavior

When invalidation happens:

- cancel the extraction job if still running,
- delete extracted text outputs,
- delete OCR outputs,
- delete any derived structured document outputs,
- mark artifact as `deleted`,
- and make all tools lose access immediately.

## 12.3 Why this matters

This prevents stale prompt injection, accidental reuse, and cross-step data confusion.

---

# 13. Cache and Ephemeral State Strategy

Caching should improve performance without becoming a hidden source of truth.

## 13.1 What may be cached

Safe cache candidates:

- extraction job status,
- OCR progress,
- artifact readiness state,
- chunk index lookup maps,
- derived prompt packaging,
- transient preview transforms,
- repeated extraction signatures for identical files if you later introduce deduplication.

## 13.2 What must not be the permanent source of truth

Do **not** treat cache as the final source of truth for:

- artifact ownership,
- artifact validity,
- full extracted text,
- or prompt authorization.

Those belong in the artifact store and owner-aware resolver.

## 13.3 Recommended cache layers

### Layer A — in-memory UI state
For:
- local progress bars,
- temporary selected file state,
- optimistic UI transitions.

### Layer B — Redis ephemeral job state
For:
- extraction jobs,
- cancellation tokens,
- timeout windows,
- retry-safe markers,
- background cleanup coordination.

### Layer C — optional content cache
For:
- repeated artifact resolution,
- repeated page/chunk lookups,
- repeated prompt-context assembly.

## 13.4 Required cache safety rules

- cache entries must be owner-scoped,
- cache keys must include artifact identity and owner identity,
- invalidation must purge relevant cache entries,
- tools must not bypass authorization by reading cache directly.

---

# 14. Prompt Context Resolver

A centralized prompt context resolver is mandatory.

## 14.1 Responsibilities

The resolver must:

- authenticate the requester,
- resolve the correct owner-scoped artifact,
- verify artifact status,
- select the correct extracted content shape,
- optionally choose chunks/pages,
- and package prompt context for the requesting tool.

## 14.2 Inputs

The resolver should receive inputs like:

- `requestingUserId`
- `requestingRole`
- `toolId`
- `documentId` or `artifactId`
- `mode` if the tool is mode-aware
- tool-specific settings
- content limits or chunking rules

## 14.3 Outputs

The resolver should output:

- artifact identity
- allowed extracted text
- page/chunk context
- metadata
- language hints
- prompt-ready injected content

---

# 15. Infographic System — Final Product Design

## 15.1 Shared user-facing shell

The Infographic page should remain a **single user-facing page**.

It should provide:

- common title/topic input,
- common language selection,
- common theme or style selectors,
- model selector that changes by mode,
- and a visible switch between the two modes.

## 15.2 Shared switch

The switch should offer:

- **Infographic Image Mode**
- **Structured Infographic Renderer Mode**

Default active mode must be **Image Mode**.

## 15.3 Why one shell is better

One shell keeps UX consistent while allowing total internal code separation.
This matches the current product reality better than creating two disconnected pages. The existing guidance already frames the two infographic approaches as different systems that should be treated separately rather than as one feature with only two visual skins. fileciteturn5file15

---

# 16. Infographic Image Mode

## 16.1 Purpose

This mode asks an image-capable model to generate a finished infographic image.

## 16.2 Inputs

- extracted document content from the centralized artifact system
- user topic / request
- language
- style
- palette
- composition hints
- aspect ratio
- density/detail preferences
- selected image model

## 16.3 Output

- image asset
- premium preview
- PNG download
- PDF export where stable

## 16.4 Internal separation requirements

This mode must have its own:

- prompt builder
- orchestration path
- execution path
- result contract
- renderer

## 16.5 Image model policy

Image Mode must use image-capable models only.
The image model guide and prior implementation notes already establish cost-aware ordering, capability separation, and explicit model preservation rules. fileciteturn5file10 fileciteturn5file12

### User-visible default shortlist
The current recommended user-visible shortlist for the Infographic page is:

1. `gemini-3.1-flash-image-preview` (default)
2. `gemini-2.5-flash-image`
3. `qwen-image-2.0`
4. `wan2.6-image`
5. `z-image-turbo`

### Internal image registry can still include
- Google image models
- Qwen image models
- Wan image models
- hidden/internal fallback variants

---

# 17. Structured Infographic Renderer Mode

## 17.1 Purpose

This mode asks AI for structured infographic content, then renders it with real app UI.

## 17.2 Inputs

- extracted document content from the centralized artifact system
- user topic / request
- language
- number of sections
- charts allowed
- icon/card allowances
- layout style
- selected text/reasoning/structured-output model

## 17.3 Output

- structured infographic schema
- structured preview renderer
- future print/PDF flow

## 17.4 Internal separation requirements

This mode must have its own:

- prompt builder
- orchestration path
- execution path
- structured schema contract
- structured renderer

## 17.5 Reason for separation

Structured Mode is architecturally different from Image Mode because the app itself becomes the renderer.
It is better for academic correctness, print stability, and future editability. fileciteturn5file19 fileciteturn5file13

---

# 18. Model Registry and Routing Guidance

## 18.1 Core rules

- preserve exact callable IDs
- preserve dated variants as explicit entries
- preserve preview variants as tagged preview entries
- preserve regional variants as explicit entries
- keep tool compatibility explicit
- keep frontend mapping aligned with the canonical registry

The current model guides already define these rules clearly for both text and image families. fileciteturn5file3 fileciteturn5file10

## 18.2 Infographic mode-specific routing

### Image Mode
- only image-capable models
- no text-only leakage

### Structured Mode
- only text / reasoning / structured-output capable models
- no image-generation-only leakage

## 18.3 Cost-aware ordering

All selectors and fallback chains should remain cost-aware where official pricing or family ordering is known.
The text and image model guides already define the conservative cost-tier approach for Zootopia Club. fileciteturn5file3 fileciteturn5file10

---

# 19. Rendering and Preview Rules

## 19.1 Image Mode rendering

Use:
- image asset preview
- zoom/pan/open-full interactions
- PNG download
- PDF export from image or preview snapshot where stable

## 19.2 Structured Mode rendering

Use:
- cards
- grids
- section dividers
- theme-aware surfaces
- icons
- charts
- future high-fidelity print/export surfaces

## 19.3 Shared preview backbone

Do not build two unrelated preview systems.
Use the current shared preview/export backbone where possible, but keep result contracts mode-aware.
The platform already has a centralized preview/export system integrated across major tools, so the new infographic work should extend that backbone rather than replace it. fileciteturn5file0

---

# 20. File Upload and Extraction Flow Integration

The current product already stores uploaded files through shared document state and keeps uploaded document continuity across routes. Any new extraction system must preserve that behavior. The current upload flow stores uploaded files in shared `DocumentContext`, extracts and stores document text, and keeps the workflow manual rather than automatically triggering analysis. fileciteturn5file1

## 20.1 Recommended future flow

```text
User uploads file
  -> file is registered in shared document state
  -> extraction job starts or is scheduled
  -> extraction service chooses strategy
  -> native extraction and/or OCR runs
  -> extracted outputs are stored as owner-scoped artifacts
  -> artifact ref becomes the source of truth
  -> all tools resolve prompt context from artifact ref
```

## 20.2 Tool injection rule

If extracted text exists, it must be included in the final model input for the selected tool/mode and must not be silently dropped.

---

# 21. Suggested APIs and Services

## 21.1 Suggested backend endpoints

```text
POST   /api/documents/intake
POST   /api/documents/:documentId/extract
GET    /api/documents/:documentId/artifact
DELETE /api/documents/:documentId/artifact
POST   /api/documents/:documentId/cancel
POST   /api/documents/:documentId/replace
GET    /api/documents/:documentId/context?toolId=...&mode=...
```

## 21.2 Suggested service responsibilities

### `fileIntakeService`
- validate file
- create document record
- register ownership

### `extractionCoordinator`
- choose extractor path
- run native extraction / OCR / merge
- emit artifact outputs

### `documentArtifactStore`
- write artifact outputs
- version artifacts
- resolve artifact paths

### `artifactInvalidationService`
- cancel
- purge
- delete
- invalidate

### `promptContextResolver`
- resolve artifact
- authorize owner
- package tool context

### `infographicModeRouter`
- dispatch image mode vs structured mode

---

# 22. Verification Checklist

Before considering the implementation complete, verify all of the following.

## 22.1 Document extraction checks

- native PDF text extraction works
- OCR works on images
- OCR works on scanned PDFs
- hybrid merge works
- Arabic and English are both supported
- full text is preserved
- extracted artifacts are stored correctly

## 22.2 Cleanup checks

- cancel upload deletes artifacts
- remove file deletes artifacts
- replace file purges old artifact chain
- invalidated artifacts cannot be resolved by tools

## 22.3 Isolation checks

- user A cannot access user B artifacts
- admin access is explicit and auditable
- storage paths remain owner-scoped
- cache keys remain owner-scoped

## 22.4 Infographic checks

- mode switch appears and works
- default mode is Image Mode
- image model list changes correctly in Image Mode
- text/structured model list changes correctly in Structured Mode
- no cross-mode selector leakage exists
- each mode uses its own prompt builder
- each mode uses its own execution path
- each mode uses its own renderer

## 22.5 Platform safety checks

- Assessment still works
- File Analysis still works
- existing preview/export still works
- admin workflows are unaffected
- billing and entitlements are unaffected
- route ownership remains intact

---

# 23. Implementation Discipline for Developers and AI Builders

Every implementation step should follow this operational discipline:

1. analyze current files first
2. trace dependencies before editing
3. prefer new isolated files/modules over risky edits to central files
4. preserve public contracts
5. do not rebuild from scratch
6. keep backend authority on sensitive flows
7. preserve feature ownership boundaries
8. keep comments for future agents
9. update `ZOOTOPIA_PROJECT_LEDGER.txt` after every meaningful change
10. verify compatibility after each phase

---

# 24. Recommended First Delivery Sequence

If the team wants the safest practical rollout, use this exact sequence:

1. **Audit and scaffold only**
2. **Build centralized artifact types and owner model**
3. **Build extraction coordinator**
4. **Add OCR integration**
5. **Add invalidation and cleanup**
6. **Add prompt context resolver**
7. **Add infographic shared shell + mode switch**
8. **Implement Infographic Image Mode fully**
9. **Implement Structured Mode fully**
10. **Integrate verification + cleanup + observability**

This sequence minimizes risk and preserves the current production-style foundation.

---

# 25. Final Recommendation

For Zootopia Club, the best immediate architecture is:

- a **centralized reusable document extraction system**,
- a **strict owner-scoped artifact model**,
- a **cleanup-first invalidation policy**,
- a **shared prompt context resolver**,
- and a **fully separated dual-mode Infographic architecture** behind one shared page shell.

The short-term delivery priority should remain:

- **Infographic Image Mode first**,
- then **Structured Infographic Renderer Mode**,
- both powered by the same centralized extracted-document artifact layer.

That gives the platform:

- cleaner architecture,
- better prompt quality,
- better multi-tool reuse,
- safer user isolation,
- better long-term scalability,
- and a much stronger professional foundation.

---

# 26. Source Notes

This guide was aligned with:

- the current Zootopia platform architecture and ledger,
- the current feature ownership and shared document continuity rules,
- the project’s text and image model classification guides,
- the infographic mode strategy notes,
- and current official/primary-source library documentation for React, FastAPI, Pydantic, SQLAlchemy, Redis OSS, PaddleOCR, Docling, and pypdf.

Primary references used in preparing this guide include the project architecture ledger and current feature ownership notes fileciteturn5file8, the recent upload/document continuity notes fileciteturn5file1, the infographic mode guidance fileciteturn5file4, and the text/image model classification guides fileciteturn5file3 fileciteturn5file10. Current library/version references were checked against official docs and primary release pages: React 19.2 citeturn958864search0turn958864search12, FastAPI 0.135.2 and its Pydantic v2 alignment citeturn958864search1turn958864search13, Pydantic 2.12.5 citeturn958864search2turn958864search18, SQLAlchemy 2.0.48 citeturn958864search19turn958864search3, Redis OSS 8.6.x citeturn494987search3turn494987search19, PaddleOCR 3.4.0 with 100+ language support citeturn494987search4turn494987search16, Docling 2.82.0 citeturn494987search1turn494987search9, and pypdf 6.9.2 citeturn494987search2turn494987search6.
