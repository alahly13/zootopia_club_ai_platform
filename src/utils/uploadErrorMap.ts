type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

const UPLOAD_ERROR_KEY_BY_MESSAGE: Record<string, string> = {
  'No file selected.': 'uploadUI.errorNoFileSelected',
  'File too large. Max size is 50MB.': 'uploadUI.errorFileTooLarge',
  'Unsupported file format.': 'uploadUI.errorUnsupportedFormat',
  'File is empty.': 'uploadUI.errorFileEmpty',
  'No extractable text found in file.': 'uploadUI.errorNoExtractableText',
  'Failed to read image file.': 'uploadUI.errorImageReadFailed',
  'Failed to process file.': 'uploadUI.errorFileProcessFailed',
  'File processing timed out. The file might be too complex.': 'uploadUI.errorProcessingTimedOut',
  'You do not have permission to upload files.': 'uploadUI.errorNoPermission',
  'You have reached your daily upload limit.': 'uploadUI.errorDailyLimitReached',
  'No active AI model selected.': 'uploadUI.errorNoActiveModel',
  'AI analysis timed out. This often happens with large documents. Please try a faster model or try again.': 'uploadUI.errorAnalysisTimedOut',
  'Document analysis timed out. The file might be too large or the model is busy.': 'uploadUI.errorAnalysisTimedOut',
};

const UPLOAD_ERROR_PATTERN_KEYS: Array<{ pattern: RegExp; key: string }> = [
  {
    pattern: /setting up fake worker failed|pdf\.worker|pdfjs|pdf\.js worker|failed to fetch dynamically imported module/i,
    key: 'uploadUI.errorPdfWorkerSetupFailed',
  },
  {
    pattern: /pdf parsing failed|invalid pdf structure|unexpected server response \(0\)|missing pdf/i,
    key: 'uploadUI.errorPdfParsingFailed',
  },
  {
    pattern: /timed out|timeout/i,
    key: 'uploadUI.errorProcessingTimedOut',
  },
  {
    pattern: /extract|parsing failed|failed to process file/i,
    key: 'uploadUI.errorExtractionFailed',
  },
];

export const mapUploadErrorMessage = (message: string | undefined, t: TranslateFn): string => {
  if (!message) {
    return t('uploadUI.errorUnknown');
  }

  const key = UPLOAD_ERROR_KEY_BY_MESSAGE[message];
  if (key) {
    return t(key);
  }

  for (const matcher of UPLOAD_ERROR_PATTERN_KEYS) {
    if (matcher.pattern.test(message)) {
      return t(matcher.key);
    }
  }

  return message;
};
