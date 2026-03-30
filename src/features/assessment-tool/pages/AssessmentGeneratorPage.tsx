import * as React from 'react';
import { CircleAlert, Home, LoaderCircle, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useDocument } from '../../../contexts/DocumentContext';
import CompactDocumentInfoBar from '../../../upload/CompactDocumentInfoBar';
import AssessmentStudio from '../components/AssessmentStudio';

/**
 * The upload-first home page owns file intake and readiness promotion.
 * This page is the separate next-step workspace that consumes the shared
 * prepared document after the user intentionally continues into generation.
 */
export const AssessmentGeneratorPage: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const {
    hasDocument,
    documentStatus,
    isDocumentPreparing,
    documentPreparationError,
  } = useDocument();

  const isDocumentReady = hasDocument && documentStatus === 'ready' && !documentPreparationError;
  const statusTone = documentPreparationError
    ? 'error'
    : isDocumentPreparing
      ? 'warning'
      : isDocumentReady
        ? 'success'
        : 'neutral';
  const statusLabel = documentPreparationError
    ? t('uploadUI.documentPreparationFailed', {
        defaultValue: 'Document preparation failed',
      })
    : isDocumentPreparing
      ? t('uploadUI.filePreparing', { defaultValue: 'Preparing file' })
      : isDocumentReady
        ? t('uploadUI.documentReadyStage', {
            defaultValue: 'Ready for assessment and analysis',
          })
        : t('uploadUI.generatorNoDocumentStatus', {
            defaultValue: 'Upload required',
          });

  const handleReturnToUploadHome = React.useCallback(() => {
    navigate('/home');
  }, [navigate]);

  return (
    <div className="space-y-6 sm:space-y-7">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
              {t('uploadUI.questionWorkspaceEyebrow', {
                defaultValue: 'Question generation workspace',
              })}
            </p>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
                {t('uploadUI.questionWorkspaceTitle', {
                  defaultValue: 'Question generation workspace',
                })}
              </h1>
              <p className="mt-2 max-w-4xl text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                {isDocumentReady
                  ? t('uploadUI.questionWorkspaceHint', {
                      defaultValue:
                        'Your uploaded lecture is already prepared. Tune the settings below and generate quizzes or question sets from the same shared file.',
                    })
                  : documentPreparationError
                    ? t('uploadUI.generatorErrorHint', {
                        defaultValue:
                          'The shared document needs attention on the upload page before assessment generation can continue.',
                      })
                    : isDocumentPreparing
                      ? t('uploadUI.generatorPreparingHint', {
                          defaultValue:
                            'The shared document is still preparing on the upload page. Return there to monitor the real intake lifecycle.',
                        })
                      : t('uploadUI.generatorNoDocumentHint', {
                          defaultValue:
                            'Upload and prepare a lecture on the home page first, then use the existing next-step action to continue here.',
                        })}
              </p>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 self-start rounded-full border border-zinc-200 bg-zinc-100 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            <Sparkles size={14} />
            <span>
              {t('uploadUI.assessmentWorkspaceBadge', {
                defaultValue: 'Assessment workspace',
              })}
            </span>
          </div>
        </div>

        <CompactDocumentInfoBar
          statusLabel={statusLabel}
          statusTone={statusTone}
          actions={
            <button
              type="button"
              onClick={handleReturnToUploadHome}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-100 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-600 transition-all hover:bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <Home size={14} />
              <span>
                {t('uploadUI.generatorManageDocumentAction', {
                  defaultValue: 'Back to upload page',
                })}
              </span>
            </button>
          }
        />

        {isDocumentReady ? (
          <AssessmentStudio />
        ) : (
          <div className="rounded-[2rem] border border-zinc-200/80 bg-white/88 p-5 shadow-lg shadow-zinc-900/5 backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-950/60 sm:p-6">
            <div className="flex items-start gap-4">
              <div
                className={
                  documentPreparationError
                    ? 'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-500/12 text-red-500 ring-1 ring-red-500/20'
                    : isDocumentPreparing
                      ? 'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/12 text-amber-500 ring-1 ring-amber-500/20'
                      : 'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-zinc-200 text-zinc-500 ring-1 ring-zinc-300 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800'
                }
              >
                {documentPreparationError ? (
                  <CircleAlert size={22} />
                ) : isDocumentPreparing ? (
                  <LoaderCircle size={22} className="animate-spin" />
                ) : (
                  <Home size={22} />
                )}
              </div>

              <div className="space-y-3">
                <h2 className="text-xl font-black tracking-tight text-zinc-900 dark:text-white">
                  {documentPreparationError
                    ? t('uploadUI.documentPreparationFailed', {
                        defaultValue: 'Document preparation failed',
                      })
                    : isDocumentPreparing
                      ? t('uploadUI.uploadHeroUploadingTitle', {
                          defaultValue: 'Preparing your file',
                        })
                      : t('uploadUI.generatorNoDocumentTitle', {
                          defaultValue: 'Upload a lecture to start generation',
                        })}
                </h2>
                <p className="max-w-3xl text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                  {documentPreparationError
                    ? t('uploadUI.generatorErrorHint', {
                        defaultValue:
                          'The shared document needs attention on the upload page before assessment generation can continue.',
                      })
                    : isDocumentPreparing
                      ? t('uploadUI.generatorPreparingHint', {
                          defaultValue:
                            'The shared document is still preparing on the upload page. Return there to monitor the real intake lifecycle.',
                        })
                      : t('uploadUI.generatorNoDocumentHint', {
                          defaultValue:
                            'Upload and prepare a lecture on the home page first, then use the existing next-step action to continue here.',
                        })}
                </p>
                <button
                  type="button"
                  onClick={handleReturnToUploadHome}
                  className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-emerald-500/20 transition-all hover:bg-emerald-500"
                >
                  <Home size={15} />
                  <span>
                    {t('uploadUI.generatorReturnToUploadAction', {
                      defaultValue: 'Go to upload home',
                    })}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.section>
    </div>
  );
};

export default AssessmentGeneratorPage;
