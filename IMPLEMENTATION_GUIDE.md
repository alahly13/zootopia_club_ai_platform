# Zootopia Club AI - Implementation Guide & Code Snippets
**Quick Reference for Applying Improvements**

---

## PHASE 1: CRITICAL FIXES (Do First!)

### Fix 1: Tailwind CSS Color Conflicts in Login.tsx

**Problem Areas Identified:**
- Line 251, 358, 373, 380, 489, 515, 538, 547, 568, 599, 666, 678, 716, 734, 750, 804, 829, 867, 879

**Quick Fix Script:**
```bash
# PowerShell to find and analyze duplicates
Get-Content "src/auth/Login.tsx" | 
  Select-String "dark:text-zinc-" | 
  ForEach-Object { $_.Line | Select-String "(dark:text-zinc-\d+).*\1" }
```

**Common Patterns to Fix:**

Pattern 1: Duplicate dark colors
```tsx
// ❌ BEFORE
className="... dark:text-zinc-400 dark:text-zinc-500 ..."

// ✅ AFTER
className="... dark:text-zinc-400 ..."
```

Pattern 2: Conflicting placeholder and text colors
```tsx
// ❌ BEFORE
className="... placeholder:text-zinc-400 dark:placeholder:text-zinc-500 ..."

// ✅ AFTER (consistent naming)
className="... placeholder:text-zinc-400 dark:placeholder:text-zinc-500 ..."
```

Pattern 3: Text with redundant dark variant
```tsx
// ❌ BEFORE (line 804, 867)
className="text-zinc-500 dark:text-zinc-400 dark:text-zinc-500"

// ✅ AFTER
className="text-zinc-500 dark:text-zinc-400"
```

---

## PHASE 2: HIGH-PRIORITY REFACTORING

### Refactor 1: AIRouter Method Signatures

**File:** `src/ai/services/aiRouter.ts`

**Step 1: Create Configuration Types**
```typescript
// Add to src/ai/types.ts

export interface AIExecutionConfig {
  modelId: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  providerSettings?: Record<string, any>;
  userPreferences?: string;
  responseMimeType?: string;
}

export interface DocumentAnalysisRequest extends AIExecutionConfig {
  content: string;
  fileName: string;
}

export interface QuizGenerationRequest extends AIExecutionConfig {
  content: string;
  count: number;
  types: string[];
  language: string;
  difficulty: string;
  mode: Mode;
}

export interface InfographicRequest extends AIExecutionConfig {
  content: string;
}

export interface ChatRequest extends AIExecutionConfig {
  message: string;
  context: string;
  history: any[];
  fileName?: string;
}

export interface ImagePromptRequest extends AIExecutionConfig {
  content: string;
}
```

**Step 2: Update AIRouter**
```typescript
// src/ai/services/aiRouter.ts

import { AIExecutor } from './aiExecutor';
import { AIRequestOptions, AIResponse } from '../types';
import { 
  DocumentAnalysisRequest, 
  QuizGenerationRequest, 
  InfographicRequest,
  ChatRequest,
  ImagePromptRequest
} from '../types';
import { Mode } from '../../components/ModeSelector';

export class AIRouter {
  /**
   * Analyzes a document or image
   * @param request - Document analysis configuration and content
   * @returns Analysis result with model metadata
   */
  static async analyzeDocument(
    request: DocumentAnalysisRequest
  ): Promise<{ text: string; modelUsed?: string; fallbackHappened?: boolean }> {
    const { content, fileName, modelId, apiKey, providerSettings, userPreferences } = request;
    
    const isImage = content.startsWith('[IMAGE_DATA:');
    const { content: fileContext, isTruncated } = this.truncateContent(
      content,
      100000,
      'analyzeDocument'
    );

    const response = await AIExecutor.executeWithFallback(
      { 
        modelId, 
        toolId: 'analyze',
        apiKey, 
        temperature: request.temperature ?? 0.2, 
        maxTokens: request.maxTokens,
        providerSettings, 
        mode: 'analyze', 
        taskType: isImage ? 'image_analysis' : 'document_analysis',
        fileName,
        fileContext: isImage ? content : fileContext,
        userPreferences
      },
      `Please analyze the document "${fileName}".`
    );

    if (response.error) throw new Error(response.error);
    return { 
      text: response.text, 
      modelUsed: response.modelUsed, 
      fallbackHappened: response.fallbackHappened 
    };
  }

  /**
   * Generates quiz questions based on content
   * @param request - Quiz generation configuration and content
   * @returns Array of quiz questions
   */
  static async generateQuiz(request: QuizGenerationRequest): Promise<any[]> {
    const { 
      content, 
      count, 
      types, 
      language, 
      difficulty, 
      modelId, 
      mode,
      apiKey,
      providerSettings,
      userPreferences 
    } = request;

    const isImage = content.startsWith('[IMAGE_DATA:');
    const { content: fileContext, isTruncated } = this.truncateContent(
      content,
      80000,
      'generateQuiz'
    );

    const response = await AIExecutor.executeWithFallback(
      { 
        modelId, 
        toolId: 'quiz',
        apiKey,
        temperature: request.temperature ?? 0.3,
        maxTokens: request.maxTokens,
        responseMimeType: 'application/json',
        providerSettings,
        mode: mode,
        taskType: 'quiz',
        fileContext: isImage ? content : fileContext,
        settings: { count, types, language, difficulty, mode },
        userPreferences
      },
      "Please generate the quiz based on the provided content."
    );

    if (response.error) throw new Error(response.error);
    
    return this.parseJSONResponse<any[]>(
      response.text,
      'quiz',
      'Expected array of quiz questions'
    );
  }

  /**
   * Generates infographic data structure
   * @param request - Infographic generation configuration and content
   * @returns Structured infographic data
   */
  static async generateInfographicData(request: InfographicRequest): Promise<any> {
    const { content, modelId, apiKey, providerSettings, userPreferences } = request;

    const preferencesText = this.parseUserPreferences(userPreferences);
    const isImage = content.startsWith('[IMAGE_DATA:');
    const { content: fileContext } = this.truncateContent(
      content,
      60000,
      'generateInfographicData'
    );

    const response = await AIExecutor.executeWithFallback(
      { 
        modelId, 
        toolId: 'infographic',
        apiKey,
        temperature: request.temperature ?? 0.4,
        maxTokens: request.maxTokens,
        responseMimeType: 'application/json',
        providerSettings,
        mode: 'generate',
        taskType: 'text',
        fileContext: isImage ? content : fileContext,
        userPreferences: preferencesText
      },
      "Please generate the infographic data based on the provided content."
    );

    if (response.error) throw new Error(response.error);
    
    return this.parseJSONResponse<any>(
      response.text,
      'infographic',
      'Expected infographic data structure'
    );
  }

  /**
   * Chat with AI about provided context
   * @param request - Chat configuration and messages
   * @returns AI response message
   */
  static async chat(request: ChatRequest): Promise<string> {
    const { message, context, history, modelId, apiKey, providerSettings, fileName } = request;

    const response = await AIExecutor.executeWithFallback(
      { 
        modelId, 
        toolId: 'chat',
        apiKey,
        temperature: request.temperature ?? 0.7,
        maxTokens: request.maxTokens,
        providerSettings,
        mode: 'chat',
        taskType: 'text',
        fileContext: context,
        fileName
      },
      message
    );

    if (response.error) throw new Error(response.error);
    return response.text;
  }

  /**
   * Generates detailed image prompt from content
   * @param request - Image prompt generation configuration and content
   * @returns Detailed image prompt
   */
  static async generateTopicImagePrompt(request: ImagePromptRequest): Promise<string> {
    const { content, modelId, apiKey, providerSettings } = request;

    const isImage = content.startsWith('[IMAGE_DATA:');
    const { content: fileContext } = this.truncateContent(
      content,
      20000,
      'generateTopicImagePrompt'
    );

    const response = await AIExecutor.executeWithFallback(
      { 
        modelId, 
        toolId: 'image',
        apiKey, 
        temperature: request.temperature ?? 0.8,
        maxTokens: request.maxTokens,
        providerSettings, 
        mode: 'generate', 
        taskType: 'image',
        fileContext: isImage ? content : fileContext
      },
      "Based on this scientific content, generate a highly descriptive, professional prompt for a state-of-the-art AI image generator."
    );

    if (response.error) throw new Error(response.error);
    return response.text;
  }

  // ==================== HELPER METHODS ====================

  /**
   * Smartly truncates content at sentence boundaries
   * @param content - Content to truncate
   * @param maxLength - Maximum length in characters
   * @param context - Context for logging
   * @returns Object with truncated content and flag
   */
  private static truncateContent(
    content: string, 
    maxLength: number,
    context: string = ''
  ): { content: string; isTruncated: boolean } {
    if (!content || content.length <= maxLength) {
      return { content: content || '', isTruncated: false };
    }

    // Try to truncate at sentence boundary
    let truncated = content.substring(0, maxLength);
    const lastPeriod = truncated.lastIndexOf('.');
    const lastNewline = truncated.lastIndexOf('\n');
    
    // Use the last punctuation or newline if it's reasonably close
    const boundary = Math.max(lastPeriod, lastNewline);
    if (boundary > maxLength * 0.8) {
      truncated = truncated.substring(0, boundary + 1);
    }

    console.warn(
      `[AIRouter] Content truncated for ${context}: ` +
      `${content.length.toLocaleString()} → ${truncated.length.toLocaleString()} chars`
    );

    return { content: truncated, isTruncated: true };
  }

  /**
   * Parses user preferences from string or object
   * @param preferences - Raw preferences (JSON string or text)
   * @returns Formatted preferences text
   */
  private static parseUserPreferences(preferences?: string): string {
    if (!preferences) return '';

    try {
      if (preferences.startsWith('{')) {
        const options = JSON.parse(preferences);
        return `
          Style Template: ${options.template || 'Free'}
          Visual Density: ${options.density || 'Balanced'}
          Tone/Mood: ${options.tone || 'Professional'}
          Emphasis: ${options.emphasis || 'Balanced'}
          Custom Instructions: ${options.customInstructions || 'None'}
        `;
      }
    } catch (e) {
      // Not JSON, return as-is
    }

    return preferences;
  }

  /**
   * Safely parses JSON response with validation
   * @param text - JSON text to parse
   * @param expectedType - Type being parsed (for error messages)
   * @param context - Additional context for validation
   * @returns Parsed object
   * @throws Error if parsing or validation fails
   */
  private static parseJSONResponse<T>(
    text: string,
    expectedType: string,
    context?: string
  ): T {
    if (!text || text.trim().length === 0) {
      throw new Error(`Empty response for ${expectedType}`);
    }

    try {
      const parsed = JSON.parse(text);
      
      // Basic validation
      if (parsed === null || parsed === undefined) {
        throw new Error(`${expectedType} response is null or undefined`);
      }

      return parsed as T;
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      throw new Error(
        `Failed to parse ${expectedType}: ${error}. ${context || ''}`
      );
    }
  }
}
```

**Step 3: Update Component Calls**

Before:
```typescript
// Old way - many parameters
const result = await AIRouter.generateQuiz(
  content, 
  count, 
  types, 
  language, 
  difficulty, 
  modelId, 
  mode, 
  apiKey, 
  providerSettings, 
  userPreferences
);
```

After:
```typescript
// New way - single config object
const result = await AIRouter.generateQuiz({
  content,
  count,
  types,
  language,
  difficulty,
  mode,
  modelId,
  apiKey,
  providerSettings,
  userPreferences,
  temperature: 0.3 // Optional override
});
```

---

### Refactor 2: Error Handler Implementation

**File:** `src/utils/errorHandler.ts` (NEW)

```typescript
export enum ErrorCategory {
  PARSE_ERROR = 'PARSE_ERROR',
  API_ERROR = 'API_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTH_ERROR = 'AUTH_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export enum ErrorSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

export interface AppError extends Error {
  code: ErrorCategory;
  message: string;
  severity: ErrorSeverity;
  context?: Record<string, any>;
  userMessage?: string;
  originalError?: Error;
}

class AppErrorImpl extends Error implements AppError {
  code: ErrorCategory;
  severity: ErrorSeverity;
  context?: Record<string, any>;
  userMessage?: string;
  originalError?: Error;

  constructor(
    code: ErrorCategory,
    message: string,
    severity: ErrorSeverity = ErrorSeverity.ERROR,
    context?: Record<string, any>,
    originalError?: Error
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.message = message;
    this.severity = severity;
    this.context = context;
    this.originalError = originalError;
    this.userMessage = this.generateUserMessage();
  }

  private generateUserMessage(): string {
    const messages: Record<ErrorCategory, string> = {
      [ErrorCategory.PARSE_ERROR]: 'Unable to process the response. Please try again.',
      [ErrorCategory.API_ERROR]: 'Service temporarily unavailable. Please try again.',
      [ErrorCategory.TIMEOUT_ERROR]: 'Request took too long. Please try again with a smaller file.',
      [ErrorCategory.VALIDATION_ERROR]: 'Invalid input. Please check your data and try again.',
      [ErrorCategory.AUTH_ERROR]: 'Authentication failed. Please log in again.',
      [ErrorCategory.NETWORK_ERROR]: 'Network error. Please check your connection.',
      [ErrorCategory.UNKNOWN_ERROR]: 'An unexpected error occurred. Please try again.'
    };
    return messages[this.code];
  }
}

export class ErrorHandler {
  static handle(
    error: unknown,
    context: string,
    severity: ErrorSeverity = ErrorSeverity.ERROR
  ): AppError {
    if (error instanceof AppErrorImpl) {
      return error;
    }

    const originalError = error instanceof Error ? error : new Error(String(error));
    const category = this.categorizeError(originalError);

    return new AppErrorImpl(
      category,
      originalError.message,
      severity,
      { where: context },
      originalError
    );
  }

  private static categorizeError(error: Error): ErrorCategory {
    const message = error.message.toLowerCase();

    if (message.includes('json') || message.includes('parse')) {
      return ErrorCategory.PARSE_ERROR;
    }
    if (message.includes('timeout') || message.includes('timed out')) {
      return ErrorCategory.TIMEOUT_ERROR;
    }
    if (message.includes('network') || message.includes('fetch')) {
      return ErrorCategory.NETWORK_ERROR;
    }
    if (message.includes('auth') || message.includes('unauthorized')) {
      return ErrorCategory.AUTH_ERROR;
    }
    if (message.includes('valid') || message.includes('invalid')) {
      return ErrorCategory.VALIDATION_ERROR;
    }
    if (message.includes('api') || message.includes('service')) {
      return ErrorCategory.API_ERROR;
    }

    return ErrorCategory.UNKNOWN_ERROR;
  }

  static isAppError(error: unknown): error is AppError {
    return error instanceof AppErrorImpl;
  }

  static getDisplayMessage(error: unknown): string {
    if (error instanceof AppErrorImpl) {
      return error.userMessage || error.message;
    }
    return 'An unexpected error occurred. Please try again.';
  }
}
```

**Usage Example:**
```typescript
// In AIRouter methods
try {
  return JSON.parse(response.text);
} catch (e) {
  throw ErrorHandler.handle(
    e,
    'AIRouter.generateQuiz',
    ErrorSeverity.ERROR
  );
}

// In components
try {
  await AIRouter.generateQuiz(request);
} catch (error) {
  const message = ErrorHandler.getDisplayMessage(error);
  toast.error(message);
}
```

---

## PHASE 3: MEDIUM-PRIORITY IMPROVEMENTS

### Input Validation

**File:** `src/utils/validators.ts` (NEW)

```typescript
export class Validators {
  static readonly MAX_FILE_SIZE_MB = 50;
  static readonly MAX_QUIZ_COUNT = 50;
  static readonly MAX_PROMPT_LENGTH = 10000;
  static readonly MAX_CONTENT_LENGTH = 500000;

  static validateFileSize(sizeBytes: number, maxMB: number = this.MAX_FILE_SIZE_MB): void {
    const maxBytes = maxMB * 1024 * 1024;
    if (sizeBytes > maxBytes) {
      throw new Error(`File exceeds ${maxMB}MB limit (${(sizeBytes / 1024 / 1024).toFixed(2)}MB)`);
    }
  }

  static validateQuizRequest(request: any): void {
    if (!request.content?.trim()) {
      throw new Error('Content is required for quiz generation');
    }
    
    const count = parseInt(request.count);
    if (isNaN(count) || count < 1 || count > this.MAX_QUIZ_COUNT) {
      throw new Error(`Quiz count must be between 1 and ${this.MAX_QUIZ_COUNT}`);
    }
    
    if (!Array.isArray(request.types) || request.types.length === 0) {
      throw new Error('At least one question type is required');
    }
    
    const validTypes = ['multipleChoice', 'trueOrFalse', 'shortAnswer', 'essay'];
    const invalidTypes = request.types.filter((t: string) => !validTypes.includes(t));
    if (invalidTypes.length > 0) {
      throw new Error(`Invalid question types: ${invalidTypes.join(', ')}`);
    }
  }

  static validateDocumentAnalysisRequest(request: any): void {
    if (!request.content?.trim()) {
      throw new Error('Document content is required');
    }
    
    if (!request.fileName?.trim()) {
      throw new Error('File name is required');
    }

    if (request.content.length > this.MAX_CONTENT_LENGTH) {
      throw new Error(`Content exceeds maximum length (${this.MAX_CONTENT_LENGTH} characters)`);
    }
  }

  static validateUserPreferences(preferences?: string): boolean {
    if (!preferences) return true;
    
    try {
      if (preferences.startsWith('{')) {
        JSON.parse(preferences);
      }
      return true;
    } catch {
      throw new Error('Invalid user preferences format');
    }
  }

  static sanitizePrompt(prompt: string): string {
    let sanitized = prompt.trim();

    // Remove potential prompt injection patterns
    const injectionPatterns = [
      /\[SYSTEM\]/gi,
      /\[IGNORE\]/gi,
      /jailbreak/gi,
      /ignore previous/gi,
      /forget all/gi
    ];

    for (const pattern of injectionPatterns) {
      sanitized = sanitized.replace(pattern, '');
    }

    // Remove HTML/script tags
    sanitized = sanitized.replace(/<[^>]*>/g, '');

    // Limit length
    if (sanitized.length > this.MAX_PROMPT_LENGTH) {
      sanitized = sanitized.substring(0, this.MAX_PROMPT_LENGTH) + '...';
    }

    return sanitized;
  }

  static sanitizeFilename(filename: string): string {
    // Remove or replace dangerous characters
    return filename
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\.{2,}/g, '.')
      .substring(0, 255);
  }
}

// Export for easier usage
export const validateFileSize = Validators.validateFileSize;
export const validateQuizRequest = Validators.validateQuizRequest;
export const validateDocumentAnalysisRequest = Validators.validateDocumentAnalysisRequest;
export const sanitizePrompt = Validators.sanitizePrompt;
```

---

### Enhanced Logger

**File:** `src/utils/logger.ts` (UPDATED)

```typescript
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  CRITICAL = 4
}

interface LogEntry {
  timestamp: string;
  level: string;
  context: string;
  message: string;
  data?: Record<string, any>;
}

export class Logger {
  private static minLevel = this.getMinLevelFromEnv();
  private static logs: LogEntry[] = [];
  private static maxLogs = 1000;

  private static getMinLevelFromEnv(): LogLevel {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
      return LogLevel.DEBUG;
    }
    return LogLevel.INFO;
  }

  static debug(context: string, message: string, data?: any): void {
    this.log(LogLevel.DEBUG, context, message, data);
  }

  static info(context: string, message: string, data?: any): void {
    this.log(LogLevel.INFO, context, message, data);
  }

  static warn(context: string, message: string, data?: any): void {
    this.log(LogLevel.WARN, context, message, data);
  }

  static error(context: string, message: string, error?: Error, data?: any): void {
    this.log(LogLevel.ERROR, context, message, {
      ...data,
      errorMessage: error?.message,
      errorStack: error?.stack
    });
  }

  static critical(context: string, message: string, error?: Error, data?: any): void {
    this.log(LogLevel.CRITICAL, context, message, {
      ...data,
      errorMessage: error?.message,
      errorStack: error?.stack
    });
  }

  private static log(
    level: LogLevel,
    context: string,
    message: string,
    data?: any
  ): void {
    if (level < this.minLevel) return;

    const timestamp = new Date().toISOString();
    const levelName = LogLevel[level];
    const output = `[${timestamp}] [${levelName}] [${context}] ${message}`;

    // Log to console
    const consoleMethod = level >= LogLevel.ERROR ? 'error' : 'log';
    if (data) {
      console[consoleMethod](output, data);
    } else {
      console[consoleMethod](output);
    }

    // Store in memory
    this.storeLog({
      timestamp,
      level: levelName,
      context,
      message,
      data
    });
  }

  private static storeLog(entry: LogEntry): void {
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
  }

  static getLogs(filter?: { context?: string; level?: LogLevel }): LogEntry[] {
    if (!filter) return this.logs;

    return this.logs.filter(log => {
      if (filter.context && !log.context.includes(filter.context)) return false;
      if (filter.level && LogLevel[log.level as any] < filter.level) return false;
      return true;
    });
  }

  static clearLogs(): void {
    this.logs = [];
  }

  static setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }
}

// Export singleton with bound methods for convenience
export const logger = Logger;
```

---

## FILE STRUCTURE ORGANIZATION

### Proposed Refactoring: `server.ts` → Modular Routes

**New Structure:**
```
server/
├── index.ts              (Entry point, 50 lines)
├── config/
│   ├── firebase.ts       (Firebase setup)
│   ├── email.ts          (Email transporter)
│   └── constants.ts      (Collections, etc.)
├── middleware/
│   ├── auth.ts           (adminMiddleware, etc.)
│   └── errorHandler.ts
├── routes/
│   ├── api.ts            (Main router)
│   ├── health.ts         (Health check)
│   ├── admin/
│   │   ├── users.ts
│   │   ├── communications.ts
│   │   ├── codes.ts
│   │   └── monitoring.ts
│   ├── billing/
│   │   ├── sessions.ts
│   │   ├── verify.ts
│   │   └── subscriptions.ts
│   └── ai/
│       └── execute.ts
├── types/
│   └── express.ts        (Extended Request interface)
└── utils/
    └── collections.ts    (Collection name constants)
```

**Example: `server/index.ts`**
```typescript
import express from 'express';
import dotenv from 'dotenv';
import { initializeFirebase, getDb } from './config/firebase';
import { initializeEmail } from './config/email';
import { errorHandler } from './middleware/errorHandler';
import apiRoutes from './routes/api';

dotenv.config();

const PORT = 3000;

async function startServer() {
  console.log('Starting server...');
  
  const app = express();

  // Middleware
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Initialize services
  const db = await initializeFirebase();
  const transporter = await initializeEmail();

  // Routes
  app.use('/api', apiRoutes(db, transporter));

  // Error handler (last)
  app.use(errorHandler);

  // Start
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch(console.error);
```

---

## QUICK IMPLEMENTATION CHECKLIST

### Day 1: Critical Fixes
- [ ] Fix Tailwind CSS conflicts in Login.tsx
- [ ] Run linter to verify all fixes
- [ ] Test Login page styling

### Day 2: Configuration Refactoring
- [ ] Create `src/ai/types.ts` with configuration interfaces
- [ ] Update `AIRouter` with new method signatures
- [ ] Update all component calls to new pattern
- [ ] Add unit tests for refactored methods

### Day 3: Error Handling
- [ ] Create `src/utils/errorHandler.ts`
- [ ] Create `src/utils/validators.ts`
- [ ] Update AIRouter/AIExecutor to use new error handler
- [ ] Test error handling paths

### Day 4: Code Organization
- [ ] Create modular route structure in server/
- [ ] Move routes from server.ts to individual files
- [ ] Update import paths
- [ ] Test all API endpoints

### Day 5: Polish & Testing
- [ ] Enhanced logger implementation
- [ ] Add unit tests for critical paths
- [ ] Performance testing
- [ ] Documentation updates

---

## TESTING EXAMPLES

### Unit Test for Error Handler
```typescript
// src/utils/__tests__/errorHandler.test.ts
import { ErrorHandler, ErrorCategory, ErrorSeverity } from '../errorHandler';

describe('ErrorHandler', () => {
  describe('handle', () => {
    it('should categorize JSON parse errors', () => {
      const error = new Error('Unexpected token } in JSON');
      const handled = ErrorHandler.handle(error, 'test');
      
      expect(handled.code).toBe(ErrorCategory.PARSE_ERROR);
    });

    it('should categorize network errors', () => {
      const error = new Error('Failed to fetch');
      const handled = ErrorHandler.handle(error, 'test');
      
      expect(handled.code).toBe(ErrorCategory.NETWORK_ERROR);
    });

    it('should preserve original error', () => {
      const original = new Error('Original message');
      const handled = ErrorHandler.handle(original, 'test');
      
      expect(handled.originalError).toBe(original);
    });
  });

  describe('getDisplayMessage', () => {
    it('should return user-friendly message', () => {
      const error = new Error('JSON parse failed');
      const message = ErrorHandler.getDisplayMessage(error);
      
      expect(message).not.toContain('JSON');
      expect(message).toBeTruthy();
    });
  });
});
```

---

## VALIDATION EXAMPLES

```typescript
// In AIRouter.generateQuiz
static async generateQuiz(request: QuizGenerationRequest): Promise<any[]> {
  // Validate input
  validateQuizRequest(request);
  
  const sanitized = sanitizePrompt(request.content);
  
  // ... rest of implementation
}

// In component
try {
  const quiz = await AIRouter.generateQuiz({
    content: userInput,
    count: 10,
    types: ['multipleChoice'],
    language: 'en',
    difficulty: 'medium',
    modelId: 'gemini-3-flash-preview',
    mode: 'create'
  });
} catch (error) {
  const message = ErrorHandler.getDisplayMessage(error);
  showToast.error(message);
}
```

---

**Next Steps:**
1. Print or bookmark this document
2. Start with Phase 1 (Critical Fixes)
3. Follow the 5-day implementation schedule
4. Reference code snippets as you refactor

---

*This guide is a companion to CODE_ANALYSIS_REPORT.md*
*Questions? Review the specific section in the main report*
