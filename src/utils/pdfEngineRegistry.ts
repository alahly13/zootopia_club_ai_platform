export type PdfRenderEngineId = 'html2canvas-jspdf' | 'pdf-lib' | 'react-pdf';

export interface PdfRenderEngineDescriptor {
  id: PdfRenderEngineId;
  label: string;
  packageName: string;
  status: 'active' | 'planned';
  strengths: string[];
  notes: string;
}

// Future-ready expansion point:
// the current production export path remains html2canvas + jsPDF. These planned
// engine descriptors make later adoption of pdf-lib or a react-pdf-based
// renderer explicit without forcing a migration in this background-only pass.
export const PDF_RENDER_ENGINES: PdfRenderEngineDescriptor[] = [
  {
    id: 'html2canvas-jspdf',
    label: 'HTML Snapshot + jsPDF',
    packageName: 'html2canvas / jspdf',
    status: 'active',
    strengths: [
      'Preserves current preview fidelity',
      'Works with existing detached preview/export flow',
      'Requires no migration for this pass',
    ],
    notes: 'Current production-safe export path for preview-backed documents.',
  },
  {
    id: 'pdf-lib',
    label: 'pdf-lib',
    packageName: 'pdf-lib',
    status: 'planned',
    strengths: [
      'Precise PDF page composition',
      'Rich image/document manipulation',
      'Safer low-level PDF editing and merging',
    ],
    notes: 'Planned optional engine for future advanced PDF assembly workflows.',
  },
  {
    id: 'react-pdf',
    label: 'React PDF Family',
    packageName: 'react-pdf',
    status: 'planned',
    strengths: [
      'Component-driven document layouts',
      'Clear path for richer academic templates',
      'Potential future support for more structured rendering features',
    ],
    notes: 'Reserved as a future optional engine family without changing the current export contract.',
  },
];

export const DEFAULT_PDF_RENDER_ENGINE_ID: PdfRenderEngineId = 'html2canvas-jspdf';

export const getPdfRenderEngineDescriptor = (engineId: PdfRenderEngineId) =>
  PDF_RENDER_ENGINES.find((engine) => engine.id === engineId) ?? PDF_RENDER_ENGINES[0];
