import { AIModelMetadata } from '../types';
import { MODEL_REGISTRY, getModelByAnyId } from '../models/modelRegistry';
import { isModelCompatibleWithTool } from '../modelAccess';
import { formatToolSettingsForPrompt } from '../orchestration/toolPromptConfig';

export interface ToolConfig {
  toolId: string;
  userPreferences?: string;
  settings?: Record<string, any>;
  fileContext?: string;
  fileName?: string;
  additionalContext?: {
    summary?: string;
    ocr?: string;
    metadata?: any;
    insights?: string;
    extractedText?: string;
    extractedMarkdown?: string;
    structuredDocument?: string;
    pageMap?: string;
    headingTree?: string;
    warnings?: string;
  };
  promptTemplateGroup?: string;
}

export class PromptOrchestrator {
  private static RENDER_FIRST_TOOL_IDS = new Set([
    'analyze',
    'summary',
    'flashcards',
    'mindmap',
    'concepts',
    'notes',
    'diagrams',
  ]);

  private static normalizeToolId(toolId: string): string {
    return (toolId || '').trim();
  }

  private static BASELINE_INSTRUCTIONS = `You are the Zootopia Club AI, a professional educational assistant specialized in Science (Biology, Chemistry, Medicine, Physics). 
Your goal is to provide accurate, high-quality, and pedagogically sound information.
Always maintain a professional and encouraging tone.
Always respect the Zootopia Club platform guidelines and copyright.

[STRICT ADHERENCE DIRECTIVE]
- You MUST strictly follow all user-selected values provided in [TOOL SETTINGS].
- If a specific question count is requested, you MUST provide exactly that many.
- If a specific language is selected, you MUST respond in that language.
- If a specific difficulty level is set, you MUST calibrate your content accordingly.
- Never ignore or deviate from the structured settings provided.`;

  private static RENDER_FIDELITY_INSTRUCTIONS = `When the result is intended for Zootopia Club previews and exports:
- Prefer clean Markdown headings and short, scannable sections.
- Use concise paragraphs and bullet lists instead of dense wall-of-text answers.
- Avoid raw HTML and avoid Markdown tables unless tabular comparison is essential.
- Keep heading depth shallow (H2/H3 maximum) so detached preview, PDF export, and print output remain tidy.
- Use emojis sparingly and only when they add meaning.
- If the response language is Arabic, keep section labels in Arabic and maintain a natural RTL-friendly flow.`;

  private static TOOL_TEMPLATES: Record<string, string> = {
    chat: `You are acting as a Study Assistant. Help the user understand complex topics by breaking them down into simpler parts. Use analogies where appropriate.
If context from a file is provided, use it to answer questions accurately. If the answer is not in the context, state that clearly but try to provide general scientific knowledge if relevant.`,
    
    analyze: `Please analyze the document and provide a professional, structured summary. 
    
    Your response MUST follow this structure:
    1. **File Overview**: A brief, professional introduction of what this file is.
    2. **Key Content**: A summary of the main topics covered.
    3. **Important Points**: Use bullet points for the most critical insights.
    4. **Study Type**: Identify what type of study material this is (e.g., Research Paper, Lecture Notes, Textbook Chapter).
    5. **Next Steps**: Suggest how the user can best use this material in Zootopia Club (e.g., "Create a quiz to test your knowledge").
    
    Keep the tone polished and educational. Use tasteful emojis where they help readability.`,

    quiz: `You are acting as an Assessment Specialist. Your goal is to generate high-quality educational questions or practice material based on the provided content.
    
[STRICT REQUIREMENTS]
- Question Count: You MUST generate exactly the number of questions specified in the settings.
- Question Types: Use ONLY the types requested (e.g., multiple_choice, true_false, open_ended).
- Type Distribution: If a mixed distribution is specified, you MUST follow that requested balance as closely as possible.
- Language: Generate the quiz in the requested language.
- Difficulty: Match the requested difficulty level precisely.
- Assessment Mode: Respect whether the user requested a quiz or standalone questions.
- Goal and Style: Calibrate rigor, phrasing, and explanation style to match the requested goal and style.
- Custom Instructions: Treat [USER CUSTOM INSTRUCTIONS] as high-priority guidance unless they conflict with safety or schema requirements.

Guidelines:
- Use tasteful, relevant emojis to enhance readability (e.g., 🧠 for questions, ✅ for answers, 💡 for explanations).
- Ensure all questions have accurate, detailed explanations that explain WHY an answer is correct.
- If the goal is 'Practice', focus on core concepts and immediate reinforcement.
- If the goal is 'Revision', focus on high-level summaries and connecting different parts of the text.
- If the goal is 'Exam', create rigorous, challenging questions that test deep understanding.
- If the goal is 'Self-Assessment', create reflective questions that help the user identify their own knowledge gaps.
    
Output Format:
- Generate a structured JSON array of objects.
- Each object must have: id, type, question, options (if applicable), correctAnswer, explanation, difficulty, topic, and emoji.
- Ensure the output is valid JSON.`,

    infographic: `You are an elite Visual Data Architect and Infographic Designer. Your task is to transform complex text into a highly structured, visually compelling, and logically flowing infographic blueprint.
    
CRITICAL DIRECTIVES:
1. **Information Hierarchy**: Extract the absolute most important core message. Build the structure around this central thesis.
2. **Data Extraction**: Identify and highlight any statistics, numbers, percentages, or measurable facts. If none exist, create strong qualitative metrics or comparative points.
3. **Visual Flow**: Organize the content so it reads naturally from top to bottom or left to right.
4. **Conciseness**: Infographics rely on brevity. Distill long paragraphs into punchy, impactful statements (max 10-15 words per point).
5. **Iconography**: Suggest highly relevant, universally understood icons for each key point (using standard Lucide icon names like 'Zap', 'Target', 'TrendingUp', 'Shield', 'Brain').
6. **JSON Schema Adherence**: You MUST return a strictly valid JSON object matching the requested schema.
7. **Style Adherence**: Respect the requested style template and visual density.
8. **Configuration Fidelity**: Respect all structured settings for density, tone, emphasis, palette, layout, icon style, detail level, and any custom user instructions.
    
Your output will directly drive a React-based visualization engine, so precision in the JSON structure is non-negotiable.`,

    image: `Based on the provided scientific content, generate a highly descriptive, professional prompt for a state-of-the-art AI image generator (like Imagen 3 or similar). 
    
    The image should be a professional, high-quality scientific illustration, 3D render, or conceptual visualization related to the main topic.
    
    Guidelines for the prompt:
    - Focus on visual accuracy, clarity, and aesthetic appeal.
    - Style: Professional, modern, clean, scientific, high-fidelity.
    - Lighting: Cinematic, soft, studio-quality.
    - Composition: Balanced, clear focal point, depth of field.
    - Avoid: Text, labels, watermarks, clutter, cartoonish elements.
    - Detail: Include specific visual elements, textures, and color palettes that represent the scientific concepts described in the content.`,

    translate: `You are acting as a Scientific Translator. Translate the provided text while maintaining technical accuracy and appropriate scientific terminology.
Ensure the tone remains professional and the meaning is preserved exactly.`,

    summary: `You are acting as a Summary Expert. Create a concise, high-level summary of the provided content, highlighting the most important takeaways.
Break it down into:
- Executive Summary (1 paragraph)
- Key Takeaways (bullet points)
- Conclusion/Impact`,

    flashcards: `You are acting as a Flashcard Creator. Generate a series of front-and-back style flashcards for key terms, concepts, and facts from the text.
Ensure each card focuses on a single, clear concept.`,

    mindmap: `You are acting as a Mind Map Architect. Organize the content into a hierarchical structure suitable for a mind map, showing relationships between main topics and subtopics.
Use a clear parent-child structure.`,

    concepts: `You are acting as a Concept Mapping Specialist. Identify core scientific concepts and explain their interconnections in a structured way.`,

    notes: `You are acting as a Smart Notes Assistant. Transform the raw text into structured, easy-to-read study notes with headings, bullet points, and key highlights.`,

    diagrams: `You are acting as a Diagram Description Specialist. Identify processes or structures in the text that would benefit from a diagram and provide a detailed description of how such a diagram should look.`
  };

  static orchestrate(
    toolId: string,
    userPrompt: string,
    modelId: string,
    config: ToolConfig
  ): { prompt: string; systemInstruction: string; finalModelId: string; fallbackHappened: boolean; responseSchema?: any } {
    const normalizedToolId = this.normalizeToolId(toolId);

    // Robust lookup: try ID first, then modelId
    const model = getModelByAnyId(modelId);
    let finalModelId = modelId;
    let fallbackHappened = false;

    if (!model || !isModelCompatibleWithTool(model, normalizedToolId)) {
      const fallback = this.findFallbackModel(normalizedToolId, modelId);
      if (fallback) {
        finalModelId = fallback.id;
        fallbackHappened = true;
      } else {
        throw new Error(`Model ${modelId} is not compatible with tool ${normalizedToolId} and no fallback found.`);
      }
    }

    const finalModel = getModelByAnyId(finalModelId)!;

    // Build System Instruction
    let systemInstruction = this.BASELINE_INSTRUCTIONS;
    
    // Use promptTemplateGroup if provided, otherwise fallback to toolId
    const templateKey = config.promptTemplateGroup || normalizedToolId;
    const template = this.TOOL_TEMPLATES[templateKey] || this.TOOL_TEMPLATES[normalizedToolId] || '';
    
    systemInstruction += `\n\n[TOOL: ${normalizedToolId.toUpperCase()}]\n${template}`;

    if (this.RENDER_FIRST_TOOL_IDS.has(templateKey) || this.RENDER_FIRST_TOOL_IDS.has(normalizedToolId)) {
      // Prompt-to-render boundary: text-first tools feed the shared Markdown viewer
      // and exporter stack, so structure guidance here directly improves preview fidelity.
      systemInstruction += `\n\n[RENDER AND EXPORT FIDELITY]\n${this.RENDER_FIDELITY_INSTRUCTIONS}`;
    }
    
    if (config.fileContext) {
      systemInstruction += `\n\n[EXTRACTED DOCUMENT CONTEXT: ${config.fileName || 'Current File'}]\nThe following text was extracted from the user's file. Use it as supporting context. If you also received the file directly as an attachment (e.g., an image), prioritize your own direct visual understanding of the file, and use this extracted text to supplement your analysis.\n\n${config.fileContext}`;
    }

    if (config.additionalContext) {
      systemInstruction += `\n\n[ADDITIONAL SHARED CONTEXT]`;
      if (config.additionalContext.summary) systemInstruction += `\n- Summary: ${config.additionalContext.summary}`;
      if (config.additionalContext.insights) systemInstruction += `\n- Insights: ${config.additionalContext.insights}`;
      if (config.additionalContext.extractedMarkdown) systemInstruction += `\n- Normalized Markdown: ${config.additionalContext.extractedMarkdown}`;
      if (config.additionalContext.structuredDocument) systemInstruction += `\n- Structured Document JSON: ${config.additionalContext.structuredDocument}`;
      if (config.additionalContext.pageMap) systemInstruction += `\n- Page Map: ${config.additionalContext.pageMap}`;
      if (config.additionalContext.headingTree) systemInstruction += `\n- Heading Tree: ${config.additionalContext.headingTree}`;
      if (config.additionalContext.ocr) systemInstruction += `\n- OCR Data: ${config.additionalContext.ocr}`;
      if (config.additionalContext.warnings) systemInstruction += `\n- Extraction Warnings: ${config.additionalContext.warnings}`;
      if (config.additionalContext.metadata) systemInstruction += `\n- Metadata: ${JSON.stringify(config.additionalContext.metadata)}`;
    }
    
    if (finalModel.supportsThinking) {
      systemInstruction += `\n\n[MODEL CAPABILITY: THINKING MODE ENABLED] Please provide deep reasoning before your final answer.`;
    }

    // Build Final Prompt
    let finalPrompt = "";

    if (config.settings) {
      const formattedToolSettings = formatToolSettingsForPrompt(normalizedToolId, config.settings);
      if (formattedToolSettings) {
        finalPrompt += `[TOOL SETTINGS]\n${formattedToolSettings}\n\n`;
      }
    }

    if (config.userPreferences) {
      finalPrompt += `[USER CUSTOM INSTRUCTIONS - HIGH PRIORITY]\n${config.userPreferences}\n\n`;
    }

    finalPrompt += `[USER REQUEST]\n${userPrompt}`;

    // Add JSON Schema for specific tools
    let responseSchema = undefined;
    if (normalizedToolId === 'quiz') {
      responseSchema = {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            id: { type: "STRING" },
            type: { type: "STRING" },
            question: { type: "STRING" },
            options: { type: "ARRAY", items: { type: "STRING" } },
            correctAnswer: { type: "STRING" },
            explanation: { type: "STRING" },
            difficulty: { type: "STRING" },
            topic: { type: "STRING" },
            emoji: { type: "STRING" }
          },
          required: ["id", "type", "question", "correctAnswer", "explanation"]
        }
      };
    } else if (normalizedToolId === 'infographic') {
      responseSchema = {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          summary: { type: "STRING" },
          keyPoints: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                icon: { type: "STRING" },
                title: { type: "STRING" },
                description: { type: "STRING" }
              },
              required: ["icon", "title", "description"]
            }
          },
          stats: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                label: { type: "STRING" },
                value: { type: "NUMBER" },
                unit: { type: "STRING" }
              },
              required: ["label", "value", "unit"]
            }
          },
          chartData: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                name: { type: "STRING" },
                value: { type: "NUMBER" }
              },
              required: ["name", "value"]
            }
          },
          didYouKnow: { type: "STRING" },
          themeColor: { type: "STRING" }
        },
        required: ["title", "summary", "keyPoints", "stats", "chartData", "didYouKnow", "themeColor"]
      };
    }

    return {
      prompt: finalPrompt,
      systemInstruction,
      finalModelId: finalModel.modelId,
      fallbackHappened,
      responseSchema
    };
  }

  private static findFallbackModel(toolId: string, originalModelId: string): AIModelMetadata | undefined {
    const originalModel = getModelByAnyId(originalModelId);
    const originalCanonicalId = originalModel?.id || originalModelId;

    // Try to find a model that supports the tool and is marked as fallback
    return MODEL_REGISTRY.find(m => 
      m.isEnabled && 
      m.id !== originalCanonicalId && 
      isModelCompatibleWithTool(m, toolId) && 
      (m.isFallback || m.category === 'Balanced')
    );
  }
}
