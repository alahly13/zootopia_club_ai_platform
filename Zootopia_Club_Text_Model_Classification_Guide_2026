# Zootopia Club Text Model Classification Guide

This document defines the official classification rules for **text-capable models** used in the Zootopia Club platform.

It is designed for:
- AI coding agents,
- orchestration layers,
- model registries,
- tool routing systems,
- dropdown selectors,
- fallback logic,
- and project documentation.

This guide should be used together with the existing image model guide, not as a replacement for it.

---

# Core Rule

All text-capable models must be displayed and evaluated from **cheapest to most expensive** whenever cost ordering is known or can be conservatively inferred from official provider guidance.

If exact per-model pricing is not fully published for every listed variant, the system must:
1. preserve provider family ordering,
2. prefer officially documented low-cost families first,
3. keep premium / flagship / reasoning-heavy models later,
4. and avoid making aggressive pricing claims that are not explicitly verified.

---

# Scope of This Guide

This guide covers:

- Google Gemini text-capable models
- Qwen / DashScope text-capable models
- coder-focused text models
- translation-oriented text models
- reasoning-oriented text models
- VL models only when they are relevant to text-centric workflows with multimodal input

This guide does **not** replace:
- image model routing,
- OCR-specific routing,
- ASR-specific routing,
- or image-generation capability rules.

---

# Provider Notes

## Google
Google’s official Gemini documentation presents these models as multimodal Gemini models, but they are widely usable for text generation, reasoning, summarization, classification, coding, and agent workflows. Official docs currently highlight:
- Gemini 3.1 Pro
- Gemini 3.1 Flash-Lite
- Gemini 2.5 Pro
- Gemini 2.5 Flash
- Gemini 2.5 Flash-Lite

Google also documents Free, Paid, and Enterprise access tiers, with free access limited to certain models and higher-rate features available on paid plans.

## Qwen / DashScope
DashScope official documentation explicitly positions:
- Qwen3.5-Flash as fast and low-cost for simpler tasks,
- Qwen3.5-Plus as balanced across quality, speed, and cost,
- Qwen3-Max as the strongest model for complex tasks.

Qwen also provides:
- coder-specific models,
- reasoning / thinking variants,
- translation models,
- multimodal VL variants,
- ASR variants,
- and OpenAI-compatible integration via DashScope-compatible endpoints.

---

# Official Cost-Aware Interpretation Policy

When exact pricing is not known for every single model variant, the platform must use the following conservative ordering logic:

## Lowest cost
- Lite
- Flash
- small / 8b
- lightweight translation models

## Mid cost
- Plus
- standard instruct models
- general-purpose balanced models
- medium-size reasoning models

## Premium
- Pro
- Max
- large thinking models
- very large coder models
- frontier / latest reasoning-first models

This is a **routing heuristic**, not a legal pricing guarantee.

---

# Google Text Model Classification

## Officially Surfaced Google Text-Capable Models

The following Google models should be included in the platform’s text-capable registry:

- `gemini-3.1-flash-lite`
- `gemini-3.1-pro`
- `gemini-2.5-flash-lite`
- `gemini-2.5-flash`
- `gemini-2.5-pro`

---

## Google Cost-Based Classification

### Lowest-Cost Google Models

| Model ID | Role | Notes |
|---|---|---|
| `gemini-3.1-flash-lite` | Ultra-efficient text generation | Officially described as the most cost-efficient Google model for high-volume, low-latency traffic |
| `gemini-2.5-flash-lite` | Budget-friendly general text tasks | Officially described as the fastest and most budget-friendly in the 2.5 family |

### Mid-Cost Google Models

| Model ID | Role | Notes |
|---|---|---|
| `gemini-2.5-flash` | Balanced general-purpose text model | Fast, highly capable, and balanced for latency and intelligence |

### Premium Google Models

| Model ID | Role | Notes |
|---|---|---|
| `gemini-2.5-pro` | Advanced reasoning and coding | Officially described as high-capability for complex reasoning and coding |
| `gemini-3.1-pro` | Latest reasoning-first premium model | Officially described as optimized for complex agentic workflows and coding |

---

## Recommended Google Display Order
From cheapest to most expensive:

1. `gemini-3.1-flash-lite`
2. `gemini-2.5-flash-lite`
3. `gemini-2.5-flash`
4. `gemini-2.5-pro`
5. `gemini-3.1-pro`

---

## Recommended Google Tool Roles

### Chat / Assistant
- `gemini-3.1-flash-lite`
- `gemini-2.5-flash-lite`
- `gemini-2.5-flash`
- `gemini-2.5-pro`
- `gemini-3.1-pro`

### Advanced Reasoning
- `gemini-2.5-pro`
- `gemini-3.1-pro`

### Low-Cost Bulk Processing
- `gemini-3.1-flash-lite`
- `gemini-2.5-flash-lite`

### Coding / Agentic Workflows
- `gemini-2.5-pro`
- `gemini-3.1-pro`

---

# Qwen Text Model Classification

## Raw Qwen/DashScope Model Families to Track

The following text-capable and text-relevant families should be tracked in the platform registry.

### Core General Text Models
- `qwen-flash`
- `qwen-flash-us`
- `qwen-flash-2025-07-28`
- `qwen-flash-2025-07-28-us`
- `qwen-plus`
- `qwen-plus-us`
- `qwen-plus-2025-12-01`
- `qwen-plus-2025-12-01-us`
- `qwen-plus-2025-09-11`
- `qwen-plus-2025-07-28`
- `qwen3-max`
- `qwen3-max-preview`
- `qwen3-max-2025-09-23`

### Qwen 3.5 Core Family
- `qwen3.5-flash`
- `qwen3.5-flash-2026-02-23`
- `qwen3.5-plus`
- `qwen3.5-27b`
- `qwen3.5-35b-a3b`
- `qwen3.5-122b-a10b`
- `qwen3.5-397b-a17b`

### Qwen 3 Core General Family
- `qwen3-8b`
- `qwen3-14b`
- `qwen3-32b`
- `qwen3-30b-a3b`
- `qwen3-30b-a3b-instruct-2507`
- `qwen3-30b-a3b-thinking-2507`
- `qwen3-235b-a22b`
- `qwen3-235b-a22b-instruct-2507`
- `qwen3-235b-a22b-thinking-2507`

### Coder Models
- `qwen3-coder-flash`
- `qwen3-coder-flash-2025-07-28`
- `qwen3-coder-plus`
- `qwen3-coder-plus-2025-07-22`
- `qwen3-coder-plus-2025-09-23`
- `qwen3-coder-30b-a3b-instruct`
- `qwen3-coder-480b-a35b-instruct`

### Translation Models
- `qwen-mt-flash`
- `qwen-mt-lite`
- `pre-qwen-mt-lite`
- `qwen-mt-plus`

### Reasoning / Next Family
- `qwen3-next-80b-a3b-instruct`
- `qwen3-next-80b-a3b-thinking`

### VL Models Relevant to Text-Centric Multimodal Flows
- `qwen3-vl-flash`
- `qwen3-vl-flash-2025-10-15`
- `qwen3-vl-flash-us`
- `qwen3-vl-flash-2025-10-15-us`
- `qwen3-vl-flash-2026-01-22-us`
- `qwen3-vl-plus`
- `qwen3-vl-plus-2025-09-23`
- `qwen3-vl-8b-instruct`
- `qwen3-vl-8b-thinking`
- `qwen3-vl-32b-instruct`
- `qwen3-vl-32b-thinking`
- `qwen3-vl-30b-a3b-instruct`
- `qwen3-vl-30b-a3b-thinking`
- `qwen3-vl-235b-a22b-instruct`
- `qwen3-vl-235b-a22b-thinking`

### Speech / ASR Models
- `qwen3-asr-flash-us`
- `qwen3-asr-flash-2025-09-08-us`

### OCR Models
- `qwen-vl-ocr`
- `qwen-vl-ocr-2025-11-20`

---

# Qwen Cost-Based Classification

## 1. Lowest-Cost Qwen Text Models

These should be treated as the cheapest or most budget-oriented entries, based on naming and official family guidance.

| Model ID | Primary Role | Notes |
|---|---|---|
| `pre-qwen-mt-lite` | Translation | Legacy/light translation variant |
| `qwen-mt-lite` | Translation | Lightweight translation |
| `qwen-mt-flash` | Translation | Fast translation |
| `qwen-flash` | General text | Low-cost general text family |
| `qwen-flash-us` | General text | Same family, US regional endpoint |
| `qwen-flash-2025-07-28` | General text | Version-pinned flash variant |
| `qwen-flash-2025-07-28-us` | General text | Version-pinned US flash variant |
| `qwen3.5-flash` | General text | Officially low-cost and fast |
| `qwen3.5-flash-2026-02-23` | General text | Version-pinned flash variant |
| `qwen3-8b` | Small general text | Small model tier |
| `qwen3-coder-flash` | Code generation | Fast budget coder model |
| `qwen3-coder-flash-2025-07-28` | Code generation | Version-pinned coder flash |

---

## 2. Mid-Cost Qwen Text Models

These should be treated as balanced models for mainstream production usage.

| Model ID | Primary Role | Notes |
|---|---|---|
| `qwen-plus` | General text | Balanced general-purpose family |
| `qwen-plus-us` | General text | US regional endpoint |
| `qwen-plus-2025-07-28` | General text | Version-pinned plus variant |
| `qwen-plus-2025-09-11` | General text | Version-pinned plus variant |
| `qwen-plus-2025-12-01` | General text | Version-pinned plus variant |
| `qwen-plus-2025-12-01-us` | General text | US regional endpoint |
| `qwen3.5-plus` | General text | Officially balanced across quality, speed, and cost |
| `qwen3.5-27b` | General text | Mid-size model |
| `qwen3.5-35b-a3b` | General text | Mid-size model |
| `qwen3-14b` | General text | Standard smaller model |
| `qwen3-32b` | General text | Standard stronger model |
| `qwen3-30b-a3b` | General text | Balanced 30B-class model |
| `qwen3-30b-a3b-instruct-2507` | Instruct text | Instruction-tuned variant |
| `qwen3-30b-a3b-thinking-2507` | Reasoning | Thinking-tuned variant |
| `qwen-mt-plus` | Translation | Stronger translation model |
| `qwen3-coder-plus` | Code generation | Recommended stronger coder family |
| `qwen3-coder-plus-2025-07-22` | Code generation | Version-pinned coder plus |
| `qwen3-coder-plus-2025-09-23` | Code generation | Version-pinned coder plus |
| `qwen3-coder-30b-a3b-instruct` | Code generation | Mid/high coder instruct model |
| `qwen3-next-80b-a3b-instruct` | Reasoning / instruct | Advanced but not top-flagship |
| `qwen3-next-80b-a3b-thinking` | Reasoning | Advanced thinking model |

---

## 3. Premium Qwen Text Models

These should be treated as high-cost, high-capability, or frontier models.

| Model ID | Primary Role | Notes |
|---|---|---|
| `qwen3-max` | General reasoning | Official flagship strongest family |
| `qwen3-max-preview` | General reasoning | Preview-stage flagship |
| `qwen3-max-2025-09-23` | General reasoning | Version-pinned flagship |
| `qwen3.5-122b-a10b` | Large general text | Larger premium model |
| `qwen3.5-397b-a17b` | Large general text | Very large premium model |
| `qwen3-235b-a22b` | Frontier text | Very large model |
| `qwen3-235b-a22b-instruct-2507` | Frontier instruct | Premium instruct |
| `qwen3-235b-a22b-thinking-2507` | Frontier reasoning | Premium thinking |
| `qwen3-coder-480b-a35b-instruct` | Frontier coding | Highest-end coder class in this list |

---

# Qwen Specialized Non-Standard Text-Adjacent Groups

## Translation Models
Ordered from cheapest to strongest:

1. `pre-qwen-mt-lite`
2. `qwen-mt-lite`
3. `qwen-mt-flash`
4. `qwen-mt-plus`

## Coding Models
Ordered from cheapest to strongest:

1. `qwen3-coder-flash`
2. `qwen3-coder-flash-2025-07-28`
3. `qwen3-coder-plus`
4. `qwen3-coder-plus-2025-07-22`
5. `qwen3-coder-plus-2025-09-23`
6. `qwen3-coder-30b-a3b-instruct`
7. `qwen3-coder-480b-a35b-instruct`

## Reasoning-Oriented Models
Ordered from cheaper to more premium:

1. `qwen3-30b-a3b-thinking-2507`
2. `qwen3-next-80b-a3b-thinking`
3. `qwen3-235b-a22b-thinking-2507`

---

# Qwen VL Models for Text-Centric Multimodal Use

These are not pure text models, but they are highly relevant when the platform supports:
- document understanding,
- screenshot explanation,
- visual Q&A,
- chart interpretation,
- mixed text+image tutoring.

## Lowest / budget-oriented
- `qwen3-vl-flash`
- `qwen3-vl-flash-2025-10-15`
- `qwen3-vl-flash-us`
- `qwen3-vl-flash-2025-10-15-us`
- `qwen3-vl-flash-2026-01-22-us`
- `qwen3-vl-8b-instruct`
- `qwen3-vl-8b-thinking`

## Mid tier
- `qwen3-vl-plus`
- `qwen3-vl-plus-2025-09-23`
- `qwen3-vl-30b-a3b-instruct`
- `qwen3-vl-30b-a3b-thinking`
- `qwen3-vl-32b-instruct`
- `qwen3-vl-32b-thinking`

## Premium tier
- `qwen3-vl-235b-a22b-instruct`
- `qwen3-vl-235b-a22b-thinking`

---

# Qwen ASR and OCR Groups

## ASR
- `qwen3-asr-flash-us`
- `qwen3-asr-flash-2025-09-08-us`

## OCR
- `qwen-vl-ocr`
- `qwen-vl-ocr-2025-11-20`

These should remain outside the normal text-generation dropdown unless the active tool explicitly needs speech recognition or OCR.

---

# Unified Cross-Provider Text Routing

## Lowest-Cost Default Options
These are the first candidates for cost-sensitive generic text tasks:

- `gemini-3.1-flash-lite`
- `gemini-2.5-flash-lite`
- `qwen3.5-flash`
- `qwen3.5-flash-2026-02-23`
- `qwen-flash`
- `qwen-flash-us`
- `qwen-flash-2025-07-28`
- `qwen-flash-2025-07-28-us`
- `qwen3-8b`

## Balanced General Production Options
- `gemini-2.5-flash`
- `qwen3.5-plus`
- `qwen-plus`
- `qwen-plus-us`
- `qwen-plus-2025-07-28`
- `qwen-plus-2025-09-11`
- `qwen-plus-2025-12-01`
- `qwen-plus-2025-12-01-us`
- `qwen3-14b`
- `qwen3-32b`
- `qwen3-30b-a3b`
- `qwen3-30b-a3b-instruct-2507`

## Premium / Heavy Reasoning Options
- `gemini-2.5-pro`
- `gemini-3.1-pro`
- `qwen3-max`
- `qwen3-max-preview`
- `qwen3-max-2025-09-23`
- `qwen3.5-122b-a10b`
- `qwen3.5-397b-a17b`
- `qwen3-235b-a22b`
- `qwen3-235b-a22b-instruct-2507`
- `qwen3-235b-a22b-thinking-2507`

---

# Recommended Tool Mapping

## Main Chat Tool
Preferred order:
1. `gemini-3.1-flash-lite`
2. `gemini-2.5-flash-lite`
3. `qwen3.5-flash`
4. `qwen-flash`
5. `gemini-2.5-flash`
6. `qwen3.5-plus`
7. `qwen-plus`
8. `gemini-2.5-pro`
9. `qwen3-max`
10. `gemini-3.1-pro`

## Quiz / Assessment / Study Explanation Tool
Preferred order:
1. `gemini-2.5-flash`
2. `qwen3.5-plus`
3. `qwen-plus`
4. `gemini-2.5-pro`
5. `qwen3-max`
6. `gemini-3.1-pro`

## Coding / Builder Tool
Preferred order:
1. `qwen3-coder-flash`
2. `qwen3-coder-plus`
3. `gemini-2.5-pro`
4. `gemini-3.1-pro`
5. `qwen3-coder-30b-a3b-instruct`
6. `qwen3-coder-480b-a35b-instruct`

## Translation Tool
Preferred order:
1. `qwen-mt-lite`
2. `qwen-mt-flash`
3. `qwen-mt-plus`
4. `gemini-2.5-flash`
5. `gemini-2.5-pro`

## Vision-Aware Text Understanding Tool
Preferred order:
1. `qwen3-vl-flash`
2. `qwen3-vl-plus`
3. `gemini-2.5-flash`
4. `gemini-2.5-pro`
5. `gemini-3.1-pro`
6. `qwen3-vl-235b-a22b-thinking`

---

# Variant Handling Rules

## Regional Variants
Model IDs ending in `-us` must be preserved as separate entries.
They may use different regional endpoints and should not be silently merged.

Examples:
- `qwen-flash` vs `qwen-flash-us`
- `qwen-plus` vs `qwen-plus-us`
- `qwen3-vl-flash` vs `qwen3-vl-flash-us`

## Date-Suffixed Variants
Date-pinned models must remain explicit in the registry.

Examples:
- `qwen3.5-flash-2026-02-23`
- `qwen-plus-2025-12-01`
- `qwen3-max-2025-09-23`

Do not automatically collapse them into the non-dated family unless aliasing is intentional and documented.

## Preview Variants
Preview models are valid but should be marked carefully.

Examples:
- `qwen3-max-preview`

Preview variants must:
- remain selectable,
- be tagged as preview,
- and have a fallback to a stable sibling when possible.

---

# Recommended Registry Metadata Shape

```ts
type TextCapability =
  | 'chat'
  | 'reasoning'
  | 'coding'
  | 'translation'
  | 'multimodal-text'
  | 'ocr'
  | 'asr';

type CostTier = 'low' | 'mid' | 'premium';

interface TextModelMeta {
  id: string;
  provider: 'google' | 'qwen';
  family: string;
  capability: TextCapability[];
  costTier: CostTier;
  previewVariant: boolean;
  datedVariant: boolean;
  regionalVariant: boolean;
  recommendedTools: string[];
  displayPriority: number;
  notes?: string;
}