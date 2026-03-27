export type ActorScope = 'user' | 'admin';

export type ActorRoleLabel = 'User' | 'Admin';

export type DocumentProcessingPathway = 'local_extraction' | 'direct_file_to_model';

export type DocumentRecordStatus =
  | 'pending'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'cancelled'
  | 'deleted';

export type DocumentFileType =
  | 'pdf'
  | 'docx'
  | 'xlsx'
  | 'xls'
  | 'csv'
  | 'pptx'
  | 'txt'
  | 'image'
  | 'unknown';

export type ExtractionExecutionMode = 'native' | 'ocr' | 'hybrid' | 'marker';

export type DocumentSegmentKind = 'native' | 'ocr' | 'hybrid' | 'image_payload';

export type StructuredBlockKind =
  | 'title'
  | 'heading'
  | 'subheading'
  | 'paragraph'
  | 'list_item'
  | 'table'
  | 'ocr_block'
  | 'caption'
  | 'metadata'
  | 'note';

export interface DocumentActorContext {
  actorId: string;
  actorRole: ActorRoleLabel;
  scope: ActorScope;
  adminLevel?: string | null;
  email?: string | null;
}

export interface StoredDocumentRecord {
  documentId: string;
  workflowId: string;
  sourceFileId: string;
  activeArtifactId: string | null;
  ownerActorId: string;
  ownerRole: ActorRoleLabel;
  workspaceScope: ActorScope;
  processingPathway: DocumentProcessingPathway;
  requestedPathway: DocumentProcessingPathway;
  status: DocumentRecordStatus;
  fileName: string;
  mimeType: string;
  extension: string;
  fileType: DocumentFileType;
  fileSizeBytes: number;
  sourceStoragePath: string;
  sourceStorageRelativePath: string;
  sourceSha256: string;
  extractionVersion: string;
  extractionStrategy: string;
  extractionMeta: Record<string, unknown> | null;
  latestError: {
    code: string;
    message: string;
    retryable: boolean;
  } | null;
  runtimeOperationId: string;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface DocumentLayoutBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DocumentStructuredBlock {
  blockId: string;
  type: StructuredBlockKind;
  source: 'native' | 'ocr' | 'hybrid' | 'image-marker' | 'text';
  text: string;
  pageNumber: number;
  order: number;
  level?: number | null;
  confidence?: number | null;
  bbox?: DocumentLayoutBoundingBox | null;
  rows?: string[][] | null;
  notes?: string[] | null;
}

export interface DocumentPageSegment {
  segmentId: string;
  pageNumber: number;
  text: string;
  kind: DocumentSegmentKind;
  headingCandidates: string[];
  blocks: DocumentStructuredBlock[];
  tableCount: number;
  listCount: number;
}

export interface DocumentHeadingTreeNode {
  id: string;
  title: string;
  level: number;
  pageNumber: number;
  parentId: string | null;
  blockId: string | null;
  contentPreview: string;
}

export interface DocumentPageMapEntry {
  pageNumber: number;
  segmentIds: string[];
  sectionTitles: string[];
  headingIds: string[];
  sourceKinds: DocumentSegmentKind[];
  charCount: number;
}

export interface DocumentTypeDetectionResult {
  fileType: DocumentFileType;
  extension: string;
  mimeType: string;
  confidence: 'high' | 'medium' | 'low';
  isImage: boolean;
  supportsNativeExtraction: boolean;
  supportsOcr: boolean;
  hints: string[];
}

export interface ExtractionStrategyResolution {
  strategyId: string;
  executionMode: ExtractionExecutionMode;
  reason: string;
  detection: DocumentTypeDetectionResult;
  nativePreferred: boolean;
  ocrPreferred: boolean;
  hybridPreferred: boolean;
  shouldUseDoclingNormalization: boolean;
}

export interface NativeExtractionResult {
  engine: string;
  pageSegments: DocumentPageSegment[];
  languageHints: string[];
  pageCount: number;
  fullText: string;
  notes: string[];
  tablesDetected: number;
  listsDetected: number;
  raw?: Record<string, unknown> | null;
}

export interface OcrExtractionResult {
  engine: string;
  pageSegments: DocumentPageSegment[];
  ocrBlocks: DocumentStructuredBlock[];
  languageHints: string[];
  pageCount: number;
  fullText: string;
  notes: string[];
  raw?: Record<string, unknown> | null;
}

export interface StructuredDocumentPayload {
  documentTitle: string;
  fileType: DocumentFileType;
  languageHints: string[];
  pages: Array<{
    pageNumber: number;
    headings: string[];
    text: string;
    blocks: DocumentStructuredBlock[];
  }>;
  sections: Array<{
    id: string;
    title: string;
    level: number;
    pageNumber: number;
    parentId?: string | null;
    blockId?: string | null;
    content: string;
  }>;
  headingTree: DocumentHeadingTreeNode[];
  tables: Array<{
    pageNumber: number;
    rows: string[][];
    source: 'native' | 'ocr' | 'hybrid';
  }>;
  lists: Array<{
    pageNumber: number;
    items: string[];
    source: 'native' | 'ocr' | 'hybrid';
  }>;
  metadata: Record<string, unknown>;
}

export interface CanonicalArtifactPaths {
  workspaceRootPath: string;
  workspaceRelativeRootPath: string;
  originalFilePath: string;
  finalExtractedTextPath: string;
  structuredJsonPath: string;
  normalizedMarkdownPath: string;
  pageMapPath: string;
  ocrBlocksPath: string | null;
  manifestPath: string;
}

export interface DocumentArtifactPayload {
  artifactId: string;
  documentId: string;
  workflowId: string;
  sourceFileId: string;
  actorId: string;
  actorRole: ActorRoleLabel;
  ownerActorId: string;
  ownerRole: ActorRoleLabel;
  workspaceScope: ActorScope;
  extractionVersion: string;
  extractionStrategy: string;
  processingPathway: DocumentProcessingPathway;
  status: Exclude<DocumentRecordStatus, 'pending' | 'processing'>;
  fileType: DocumentFileType;
  sourceFileName: string;
  sourceMimeType: string;
  paths: CanonicalArtifactPaths;
  fullText: string;
  normalizedText: string;
  normalizedMarkdown: string;
  structuredDocumentJson: StructuredDocumentPayload;
  pageMap: DocumentPageMapEntry[];
  ocrBlocks: DocumentStructuredBlock[];
  pageSegments: DocumentPageSegment[];
  headingTree: DocumentHeadingTreeNode[];
  extractionMeta: Record<string, unknown>;
  languageHints: string[];
  sourceAttribution: Array<{
    pageNumber?: number;
    source: 'native' | 'ocr' | 'hybrid' | 'image-marker' | 'text';
    label: string;
  }>;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string | null;
}

export interface StoredArtifactRecord {
  artifactId: string;
  documentId: string;
  workflowId: string;
  sourceFileId: string;
  ownerActorId: string;
  ownerRole: ActorRoleLabel;
  workspaceScope: ActorScope;
  processingPathway: DocumentProcessingPathway;
  extractionVersion: string;
  extractionStrategy: string;
  status: Exclude<DocumentRecordStatus, 'pending' | 'processing'>;
  artifactStoragePath: string;
  artifactStorageRelativePath: string;
  workspaceRootRelativePath: string;
  fileType: DocumentFileType;
  originalFilePath: string;
  finalExtractedTextPath: string;
  structuredJsonPath: string;
  normalizedMarkdownPath: string;
  pageMapPath: string;
  ocrBlocksPath: string | null;
  manifestPath: string;
  languageHints: string[];
  textLength: number;
  pageCount: number;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string | null;
  invalidatedAt?: string | null;
  invalidationReason?: string | null;
}

export interface ExtractedArtifactEnvelope {
  payload: DocumentArtifactPayload;
  textLength: number;
}

export interface DocumentOperationState {
  operationId: string;
  documentId: string;
  stage:
    | 'validating'
    | 'storing_source'
    | 'extracting'
    | 'persisting_artifact'
    | 'ready'
    | 'failed'
    | 'cancelled';
  status: 'running' | 'success' | 'failed' | 'cancelled';
  message: string;
  processingPathway: DocumentProcessingPathway;
  startedAt: string;
  updatedAt: string;
  errorCode?: string;
}

export interface RuntimeActiveDocumentRef {
  documentId: string;
  workflowId: string;
  artifactId: string | null;
  processingPathway: DocumentProcessingPathway;
  sourceFileId: string;
  fileName: string;
  mimeType: string;
  fileType?: DocumentFileType;
  updatedAt: string;
}

export interface DocumentContextResolutionInput {
  actor: DocumentActorContext;
  toolId: string;
  documentId?: string | null;
  artifactId?: string | null;
  mode?: string | null;
  toolSettings?: Record<string, unknown>;
  charLimit?: number;
}

export interface PromptContextResolutionResult {
  document: StoredDocumentRecord;
  artifact: StoredArtifactRecord;
  payload: DocumentArtifactPayload;
  fileContext: string;
  additionalContext: {
    metadata: Record<string, unknown>;
    summary?: string;
    insights?: string;
    extractedText?: string;
    extractedMarkdown?: string;
    structuredDocument?: string;
    pageMap?: string;
    headingTree?: string;
    ocr?: string;
  };
}

export interface DirectModelDispatchPreparationInput {
  actor: DocumentActorContext;
  toolId: string;
  modelId: string;
  documentId: string;
  providerSettings?: Record<string, unknown>;
  toolSettings?: Record<string, unknown>;
  userPreferences?: string;
  mode?: string | null;
}

export interface DirectModelDispatchPreparationResult {
  enabled: boolean;
  providerSupportsFiles: boolean;
  pathway: 'direct_file_to_model';
  providerModelId: string;
  toolId: string;
  documentId: string;
  sourceFileId: string;
  fileReference: {
    fileName: string;
    mimeType: string;
    storagePath: string;
    relativePath: string;
  };
  requestShape: {
    mode?: string | null;
    providerSettings?: Record<string, unknown>;
    toolSettings?: Record<string, unknown>;
    userPreferences?: string;
  };
}

export interface DocumentProcessingStrategyResolution {
  pathway: DocumentProcessingPathway;
  strategyId: DocumentProcessingPathway;
  directModeEnabled: boolean;
  toolSupportsLocalExtraction: boolean;
  toolSupportsDirectFileMode: boolean;
}

export interface DocumentIntakeResult {
  document: StoredDocumentRecord;
  artifact: StoredArtifactRecord;
  payload: DocumentArtifactPayload;
  runtime: RuntimeActiveDocumentRef;
  operation: DocumentOperationState;
}
