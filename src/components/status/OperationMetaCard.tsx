import * as React from 'react';
import { AppStatus } from '../../types/status';
import { ExecutionTrace } from '../../ai/types';

export interface OperationMetaRow {
  label: string;
  value: React.ReactNode;
}

interface OperationMetaCardProps {
  trace?: ExecutionTrace | null;
  status?: AppStatus;
  durationMs?: number;
  startTime?: number;
  endTime?: number;
  elapsedSeconds?: number;
  outputMetaRows?: OperationMetaRow[];
  className?: string;
  title?: string;
}

export const OperationMetaCard: React.FC<OperationMetaCardProps> = () => {
  /**
   * Compatibility shell:
   * The 2026 tracking refresh intentionally removes user-facing summary cards
   * from the default experience. Legacy call sites still mount this component,
   * but the real diagnostics surface now lives behind the hidden admin/dev
   * toggle inside ProgressTracker.
   */
  return null;
};
