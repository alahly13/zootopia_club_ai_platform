export type AppStatus = 
  | 'idle'
  | 'selected'
  | 'queued'
  | 'acknowledged'
  | 'validating'
  | 'uploading'
  | 'uploaded'
  | 'processing'
  | 'retrying'
  | 'success'
  | 'partial_success'
  | 'warning'
  | 'recoverable_error'
  | 'blocking_error'
  | 'cancelled'
  | 'timeout';

export type ErrorCategory =
  | 'validation_error'
  | 'input_error'
  | 'upload_error'
  | 'parsing_error'
  | 'network_error'
  | 'auth_error'
  | 'permission_error'
  | 'model_error'
  | 'provider_error'
  | 'timeout_error'
  | 'sync_error'
  | 'unsupported_option_error'
  | 'backend_error'
  | 'recoverable_error'
  | 'blocking_error';

export interface Stage {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  progress?: number;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  message?: string;
  details?: Record<string, unknown>;
}

export interface StatusState {
  status: AppStatus;
  message?: string;
  progress?: number;
  stages?: Stage[];
  startTime?: number;
  endTime?: number;
  durationMs?: number;
  error?: {
    category: ErrorCategory;
    message: string;
    technicalDetails?: string;
    retryAction?: () => void;
  };
}
