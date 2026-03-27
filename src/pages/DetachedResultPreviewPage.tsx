import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { ResultPreviewShell } from '../components/status/ResultPreview';
import { readDetachedResultPreviewSnapshot } from '../components/status/resultPreviewStorage';

const DetachedResultPreviewPage: React.FC = () => {
  const navigate = useNavigate();
  const { previewId } = useParams();
  const snapshot = React.useMemo(
    () => readDetachedResultPreviewSnapshot(previewId),
    [previewId]
  );

  const handleClose = React.useCallback(() => {
    if (window.opener && !window.opener.closed) {
      window.close();
      return;
    }

    navigate('/history');
  }, [navigate]);

  if (!snapshot) {
    return (
      <div className="min-h-screen bg-zinc-950 p-6 text-white">
        <div className="mx-auto max-w-3xl rounded-[2rem] border border-zinc-800 bg-zinc-900/90 p-8 shadow-2xl shadow-black/30">
          <div className="flex items-center gap-3 text-amber-400">
            <ExternalLink size={20} />
            <p className="text-sm font-black uppercase tracking-[0.22em]">Detached Preview Unavailable</p>
          </div>
          <h1 className="mt-5 text-3xl font-black tracking-tight">This preview is no longer available.</h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-300">
            Detached previews are stored as short-lived snapshots so they can open in a dedicated page without being tied to the live tool component tree. Generate or reopen the result from the main workspace to create a fresh detached preview.
          </p>
          <button
            onClick={() => navigate('/history')}
            className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-white transition-all hover:bg-emerald-500"
          >
            <ArrowLeft size={16} />
            <span>Back to Workspace</span>
          </button>
        </div>
      </div>
    );
  }

  const isDarkPreview = snapshot.previewThemeMode === 'dark';

  return (
    <div className={isDarkPreview
      ? 'min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.18),_transparent_35%),linear-gradient(180deg,_#0a0a0a,_#111827_48%,_#0a0a0a)] p-3 sm:p-5 lg:p-6'
      : 'min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.1),_transparent_35%),linear-gradient(180deg,_#f8fafc,_#f0fdf4_48%,_#ecfeff)] p-3 sm:p-5 lg:p-6'}>
      <div className="mx-auto max-w-[1520px]">
        <ResultPreviewShell
          title={snapshot.title}
          data={snapshot.data}
          type={snapshot.type}
          topicImage={snapshot.topicImage}
          sourceTool={snapshot.sourceTool}
          createdAt={snapshot.createdAt}
          previewThemeMode={snapshot.previewThemeMode}
          onClose={handleClose}
          mode="page"
        />
      </div>
    </div>
  );
};

export default DetachedResultPreviewPage;
