# Zootopia Club Image Model Classification Guide

This document provides a professional, AI-friendly classification of all currently listed image-related models for the Zootopia Club platform.

Its purpose is to help any AI agent, developer, or orchestration layer:
- understand each model’s likely role,
- display models in a cost-aware order,
- separate generation from editing and OCR tasks,
- and preserve a clean routing strategy across tools.

---

# Core Classification Rule

All model lists in the platform should be displayed from **cheapest to most expensive**.

This rule should be applied consistently in:
- model registries,
- dropdown menus,
- tool selectors,
- internal routing logic,
- fallback chains,
- and documentation.

The platform should prefer lower-cost models first unless the user explicitly requests a premium-quality result or a tool requires a stronger model.

---

# Full Model Inventory

The following models are included in the current image-related model set:

## Google
- `gemini-3-pro-image-preview`
- `gemini-3.1-flash-image-preview`
- `gemini-2.5-flash-image`

## Qwen
- `qwen-image-2.0-pro`
- `qwen-image-2.0-pro-2026-03-03`
- `qwen-image-2.0`
- `qwen-image-2.0-2026-03-03`
- `qwen-image-max`
- `qwen-image-max-2025-12-30`
- `qwen-image-plus`
- `qwen-image-plus-2026-01-09`
- `qwen-image`
- `qwen-image-edit-max-2026-01-16`
- `qwen-image-edit-plus-2025-12-15`

## Wan
- `wan2.6-t2i`
- `wan2.6-image`
- `wan2.5-i2i-preview`

## Other
- `z-image-turbo`

---

# Cost-Based Classification

## 1. Lowest-Cost Models

These models should be treated as the most budget-friendly options.  
They are best for fast routing, large-scale fallback usage, and low-cost default behavior.

| Model ID | Capability | Recommended Role |
|---|---|---|
| `z-image-turbo` | Generation | Ultra-low-cost image generation |
| `wan2.6-t2i` | Generation | Low-cost text-to-image generation |
| `wan2.6-image` | Both | Low-cost generation and editing |
| `wan2.5-i2i-preview` | Editing | Low-cost image-to-image editing |
| `qwen-image-plus` | Generation / General Image Family | Budget-friendly generation fallback |
| `qwen-image-plus-2026-01-09` | Generation / General Image Family | Budget-friendly generation fallback |
| `qwen-image-edit-plus-2025-12-15` | Editing | Low-cost image editing |

---

## 2. Mid-Cost Models

These models balance quality and cost.  
They are suitable for regular production use and standard user-facing workflows.

| Model ID | Capability | Recommended Role |
|---|---|---|
| `qwen-image-2.0` | Both | General-purpose generation and light editing |
| `qwen-image-2.0-2026-03-03` | Both | General-purpose generation and light editing |
| `qwen-image` | Generation / General Image Family | Standard fallback generation |
| `gemini-2.5-flash-image` | Both | Fast generation and editing |

---

## 3. Premium Models

These models should be treated as higher-cost, premium-quality options.  
They are suitable for advanced rendering, stronger quality output, and premium editing workflows.

| Model ID | Capability | Recommended Role |
|---|---|---|
| `qwen-image-2.0-pro` | Both | Premium generation and editing |
| `qwen-image-2.0-pro-2026-03-03` | Both | Premium generation and editing |
| `qwen-image-max` | Generation | High-end image generation |
| `qwen-image-max-2025-12-30` | Generation | High-end image generation |
| `qwen-image-edit-max-2026-01-16` | Editing | Premium image editing |
| `gemini-3.1-flash-image-preview` | Both | Premium fast generation and editing |
| `gemini-3-pro-image-preview` | Both | Highest-end Google image generation and editing |

---

# Capability-Based Classification

## Image Generation Models
Ordered from **cheapest to most expensive**:

1. `z-image-turbo`
2. `wan2.6-t2i`
3. `wan2.6-image`
4. `qwen-image-plus`
5. `qwen-image-plus-2026-01-09`
6. `qwen-image-2.0`
7. `qwen-image-2.0-2026-03-03`
8. `qwen-image`
9. `gemini-2.5-flash-image`
10. `qwen-image-2.0-pro`
11. `qwen-image-2.0-pro-2026-03-03`
12. `qwen-image-max`
13. `qwen-image-max-2025-12-30`
14. `gemini-3.1-flash-image-preview`
15. `gemini-3-pro-image-preview`

---

## Image Editing Models
Ordered from **cheapest to most expensive**:

1. `wan2.5-i2i-preview`
2. `qwen-image-edit-plus-2025-12-15`
3. `wan2.6-image`
4. `qwen-image-2.0`
5. `qwen-image-2.0-2026-03-03`
6. `gemini-2.5-flash-image`
7. `qwen-image-2.0-pro`
8. `qwen-image-2.0-pro-2026-03-03`
9. `qwen-image-edit-max-2026-01-16`
10. `gemini-3.1-flash-image-preview`
11. `gemini-3-pro-image-preview`

---

## Models That Support Both Generation and Editing
Ordered from **cheapest to most expensive**:

1. `wan2.6-image`
2. `qwen-image-2.0`
3. `qwen-image-2.0-2026-03-03`
4. `gemini-2.5-flash-image`
5. `qwen-image-2.0-pro`
6. `qwen-image-2.0-pro-2026-03-03`
7. `gemini-3.1-flash-image-preview`
8. `gemini-3-pro-image-preview`

---

## Generation-Only Models
Ordered from **cheapest to most expensive**:

1. `z-image-turbo`
2. `wan2.6-t2i`
3. `qwen-image-plus`
4. `qwen-image-plus-2026-01-09`
5. `qwen-image`
6. `qwen-image-max`
7. `qwen-image-max-2025-12-30`

---

## Editing-Only Models
Ordered from **cheapest to most expensive**:

1. `wan2.5-i2i-preview`
2. `qwen-image-edit-plus-2025-12-15`
3. `qwen-image-edit-max-2026-01-16`

---

# OCR Models

These OCR-oriented models are not part of the original image list above, but they should be documented if OCR support exists in the platform.

Ordered from cheaper to more advanced naming tier:

1. `qwen-vl-ocr`
2. `qwen-vl-ocr-2025-11-20`

Recommended role:
- OCR text extraction
- image text recognition
- scanned document parsing
- screenshot text understanding

---

# Tool Mapping Guidance

## Image Generation Tool
Use this order from **cheapest to most expensive**:

1. `z-image-turbo`
2. `wan2.6-t2i`
3. `wan2.6-image`
4. `qwen-image-plus`
5. `qwen-image-plus-2026-01-09`
6. `qwen-image-2.0`
7. `qwen-image-2.0-2026-03-03`
8. `qwen-image`
9. `gemini-2.5-flash-image`
10. `qwen-image-2.0-pro`
11. `qwen-image-2.0-pro-2026-03-03`
12. `qwen-image-max`
13. `qwen-image-max-2025-12-30`
14. `gemini-3.1-flash-image-preview`
15. `gemini-3-pro-image-preview`

Recommended usage notes:
- Prefer cheaper models by default.
- Escalate to premium only when needed.
- Keep `z-image-turbo` and `wan2.6-t2i` available as inexpensive fast options.
- Use `qwen-image-max` and Gemini premium preview models for higher-end output requests.

---

## Image Editor Tool
Use this order from **cheapest to most expensive**:

1. `wan2.5-i2i-preview`
2. `qwen-image-edit-plus-2025-12-15`
3. `wan2.6-image`
4. `qwen-image-2.0`
5. `qwen-image-2.0-2026-03-03`
6. `gemini-2.5-flash-image`
7. `qwen-image-2.0-pro`
8. `qwen-image-2.0-pro-2026-03-03`
9. `qwen-image-edit-max-2026-01-16`
10. `gemini-3.1-flash-image-preview`
11. `gemini-3-pro-image-preview`

Recommended usage notes:
- Route simple editing tasks to the cheapest valid editor first.
- Use `wan2.6-image` and `qwen-image-2.0` as balanced general-purpose editors.
- Use premium edit-capable models for high-fidelity editing or demanding user requests.

---

## Infographic Image Mode
Use the following order from **cheapest to most expensive**:

1. `z-image-turbo`
2. `wan2.6-t2i`
3. `wan2.6-image`
4. `qwen-image-plus`
5. `qwen-image-plus-2026-01-09`
6. `qwen-image-2.0`
7. `qwen-image-2.0-2026-03-03`
8. `qwen-image`
9. `gemini-2.5-flash-image`
10. `qwen-image-2.0-pro`
11. `qwen-image-2.0-pro-2026-03-03`
12. `qwen-image-max`
13. `qwen-image-max-2025-12-30`
14. `gemini-3.1-flash-image-preview`
15. `gemini-3-pro-image-preview`

Recommended usage notes:
- Infographic mode should prefer models that preserve layout clarity and visual structure.
- For premium infographic output, prefer:
  - `gemini-3.1-flash-image-preview`
  - `gemini-3-pro-image-preview`
  - `qwen-image-2.0-pro`
  - `qwen-image-max`

---

# Important Interpretation Notes

## Qwen General Image Family
The following models should be documented as part of the **general image generation family** rather than being treated as strongly confirmed full generation-plus-editing models:

- `qwen-image`
- `qwen-image-plus`
- `qwen-image-plus-2026-01-09`

These are better described as:
- image-family generation models,
- general image generation fallbacks,
- or standard image-capable models.

They should not be assumed to be equally strong in editing compared with:
- `qwen-image-2.0`
- `qwen-image-2.0-pro`
- `wan2.6-image`
- `gemini-2.5-flash-image`
- `gemini-3.1-flash-image-preview`
- `gemini-3-pro-image-preview`

---

## Preview-Suffixed Models
Models with names ending in `preview` should be treated carefully in orchestration logic.

Recommended guidance:
- allow them in production if the platform intentionally supports them,
- but document that they may represent preview-stage or pre-stable variants,
- and make fallback behavior explicit in case one preview model changes behavior later.

Examples:
- `gemini-3-pro-image-preview`
- `gemini-3.1-flash-image-preview`
- `wan2.5-i2i-preview`

---

## Date-Suffixed Variants
Models with explicit date suffixes should be treated as pinned versions.

Examples:
- `qwen-image-2.0-pro-2026-03-03`
- `qwen-image-2.0-2026-03-03`
- `qwen-image-max-2025-12-30`
- `qwen-image-plus-2026-01-09`
- `qwen-image-edit-max-2026-01-16`
- `qwen-image-edit-plus-2025-12-15`

Recommended rule:
- keep them separate in documentation,
- preserve them in registries as explicit versioned models,
- and do not silently merge them with their non-dated variants.

---

# AI Routing Guidance

Any AI agent working with this project should follow these rules:

## 1. Cost-Aware Ordering
Always display and evaluate models from cheapest to most expensive.

## 2. Capability Matching
Only route a task to a model that matches the needed capability:
- generation,
- editing,
- both,
- or OCR.

## 3. Safe Escalation
Start with the lowest-cost valid option, then escalate only if:
- quality is insufficient,
- the user requests premium output,
- the selected tool requires a stronger model,
- or the cheaper route fails.

## 4. Preserve Explicit Variants
Do not collapse dated and non-dated model IDs into one entry unless the registry intentionally aliases them.

## 5. Avoid False Capability Assumptions
Do not assume every image-family model supports advanced editing.  
Capability should remain conservative unless explicitly verified.

---

# Suggested Registry Metadata Shape

If the project stores these models in a model registry, each model should ideally include metadata similar to:

```ts
type ModelCapability = 'generation' | 'editing' | 'both' | 'ocr';

type CostTier = 'low' | 'mid' | 'premium';

interface ImageModelMeta {
  id: string;
  provider: 'google' | 'qwen' | 'wan' | 'other';
  capability: ModelCapability;
  costTier: CostTier;
  datedVariant: boolean;
  previewVariant: boolean;
  recommendedTools: string[];
  displayPriority: number;
}