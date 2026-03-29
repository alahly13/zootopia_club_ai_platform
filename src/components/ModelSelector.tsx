import React, { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AI_MODELS, AIModel } from '../constants/aiModels';
import { Sparkles, Zap, Brain, Activity, Check, ChevronDown, Lock, Unlock, Send, CreditCard } from 'lucide-react';
import { cn } from '../utils';
import { useAuth } from '../auth/AuthContext';
import { usePopupBlocker } from '../contexts/PopupOrchestratorContext';
import { collection, addDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { verifyAndRedeemCode } from '../services/accessControl/codeService';
import { MODEL_UNLOCK_PRICE_EGP, getDefaultAccessibleModelIdsForTool, resolveModelAccess } from '../ai/modelAccess';
import { sortModelsByRegistryOrder } from '../ai/models/modelRegistry';
import { MODEL_ACCESS_MODAL_FLOW_ID, POPUP_FLOW_PRIORITY } from '../constants/popupFlows';
import { buildAppUrl } from '../config/runtime';

interface ModelSelectorProps {
  selectedModelId: string;
  onModelSelect: (modelId: string) => void;
  toolId?: string;
  filter?: (model: AIModel) => boolean;
  className?: string;
  label?: string;
  models?: AIModel[];
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedModelId,
  onModelSelect,
  toolId,
  filter,
  className,
  label = "AI Model",
  models: propModels
}) => {
  const { user, notify, isAdmin } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const [selectedLockedModel, setSelectedLockedModel] = useState<AIModel | null>(null);
  const [unlockCode, setUnlockCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const normalizedToolId = React.useMemo(() => (toolId || '').trim().toLowerCase() || 'chat', [toolId]);

  usePopupBlocker({
    id: `${MODEL_ACCESS_MODAL_FLOW_ID}:${normalizedToolId}`,
    isActive: requestModalOpen,
    priority: POPUP_FLOW_PRIORITY.criticalBlocking,
  });
  
  const allModels = propModels || AI_MODELS;
  const models = React.useMemo(() => {
    const filtered = filter ? allModels.filter(filter) : allModels;
    return sortModelsByRegistryOrder(filtered);
  }, [allModels, filter]);
  const selectedModel = allModels.find(m => m.id === selectedModelId) || models[0];
  const defaultModelIds = React.useMemo(
    () => getDefaultAccessibleModelIdsForTool(normalizedToolId),
    [normalizedToolId]
  );

  const updateCoords = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width
      });
    }
  };

  useEffect(() => {
    if (isOpen) {
      updateCoords();
      window.addEventListener('resize', updateCoords);
      window.addEventListener('scroll', updateCoords, true);
    }
    return () => {
      window.removeEventListener('resize', updateCoords);
      window.removeEventListener('scroll', updateCoords, true);
    };
  }, [isOpen]);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Free-Friendly': return <Zap size={14} className="text-emerald-500" />;
      case 'Balanced': return <Activity size={14} className="text-blue-500" />;
      case 'Advanced': return <Brain size={14} className="text-purple-500" />;
      case 'Experimental': return <Sparkles size={14} className="text-amber-500" />;
      default: return <Sparkles size={14} />;
    }
  };

  const getModelAccess = React.useCallback((modelId: string) => {
    /**
     * MODEL ACCESS ALIGNMENT
     * ------------------------------------------------------------------
     * Keep selector locking on the same shared policy helper used by backend
     * authorization so the UI cannot drift away from the real execution rules.
     * This remains UX guidance only; `/api/ai/authorize-model` and `/api/ai/execute`
     * are still the authoritative enforcement layers.
     */
    return resolveModelAccess({
      modelId,
      toolId: normalizedToolId,
      unlockedModels: user?.unlockedModels,
      isAdmin,
      isTemporaryAccess: user?.isTemporaryAccess === true || user?.accountScope === 'faculty_science_fast_access',
    });
  }, [isAdmin, normalizedToolId, user?.accountScope, user?.isTemporaryAccess, user?.unlockedModels]);

  const isModelLocked = React.useCallback((modelId: string) => {
    if (!user) return true;
    return !getModelAccess(modelId).allowed;
  }, [getModelAccess, user]);

  React.useEffect(() => {
    if (!selectedModel || isAdmin) return;
    const access = getModelAccess(selectedModel.id);
    if (access.allowed) return;

    const fallbackModelId =
      access.fallbackModelId ||
      models.find((model) => !isModelLocked(model.id))?.id;
    if (!fallbackModelId || fallbackModelId === selectedModel.id) return;

    const fallbackModel = allModels.find((model) => model.id === fallbackModelId);
    onModelSelect(fallbackModelId);
    notify.warning(`Model access changed for ${label}. Switched to ${fallbackModel?.name || fallbackModelId}.`);
  }, [allModels, getModelAccess, isAdmin, isModelLocked, label, models, notify, onModelSelect, selectedModel]);

  const handleModelClick = (model: AIModel) => {
    if (isModelLocked(model.id)) {
      setSelectedLockedModel(model);
      setIsOpen(false);
      setRequestModalOpen(true);
    } else {
      onModelSelect(model.id);
      setIsOpen(false);
      notify.success(`Model changed to ${model.name}`);
    }
  };

  const getAuthHeaders = React.useCallback(async () => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) {
      throw new Error('Missing authentication token');
    }
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }, []);

  const handleRequestAccess = async () => {
    if (!user || !selectedLockedModel) return;
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'requests'), {
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        type: 'Model Access',
        message: `Requesting access to model: ${selectedLockedModel.name}`,
        targetModel: selectedLockedModel.id,
        status: 'Pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      
      try {
        const headers = await getAuthHeaders();
        await fetch('/api/notifications/admin', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            userId: user.id,
            subject: 'New Model Access Request',
            message: `User ${user.name} (${user.email}) has requested access to model: ${selectedLockedModel.name}. Unlocks must remain source-traceable through admin approval, an unlock code, or payment.`
          })
        });
      } catch (err) {
        console.error('Failed to notify admin:', err);
      }
      
      notify.success('Access request sent successfully');
      setRequestModalOpen(false);
    } catch (error) {
      console.error('Error sending request:', error);
      notify.error('Failed to send request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnlockCode = async () => {
    if (!user || !selectedLockedModel || !unlockCode.trim()) return;
    setIsSubmitting(true);
    try {
      const codeData = await verifyAndRedeemCode(unlockCode, user.id, 'Model Access', selectedLockedModel.id);

      if (codeData) {
        if (codeData.targetId === 'all' || codeData.targetId === selectedLockedModel.id) {
          notify.success(`${selectedLockedModel.name} unlocked successfully!`);
          setUnlockModalOpen(false);
          setRequestModalOpen(false);
          setUnlockCode('');
          onModelSelect(selectedLockedModel.id);
          return;
        } else {
          notify.error('This code is not valid for this model');
          return;
        }
      }
      notify.error('Invalid or expired unlock code');
    } catch (error: any) {
      console.error('Error unlocking model:', error);
      notify.error(error.message || 'Failed to unlock model');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePaidUnlock = async () => {
    if (!selectedLockedModel) return;
    setIsSubmitting(true);
    try {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams({
        unlockModel: selectedLockedModel.id,
      });

      const response = await fetch('/api/billing/create-model-unlock-checkout', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          modelId: selectedLockedModel.id,
          successUrl: buildAppUrl(`/billing?${params.toString()}`),
          cancelUrl: buildAppUrl(`/billing?${params.toString()}&cancelled=true`),
        }),
      });

      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.checkoutUrl) {
        throw new Error(json?.error || 'Failed to create payment checkout.');
      }

      window.location.assign(String(json.checkoutUrl));
    } catch (error: any) {
      console.error('Error creating model unlock checkout:', error);
      notify.error(error?.message || 'Failed to start model unlock payment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={cn("relative", className)}>
      {label && (
        <label className="block text-xs font-medium text-zinc-500 mb-1.5 uppercase tracking-wider">
          {label}
        </label>
      )}
      
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg shadow-sm hover:border-emerald-500/50 transition-all text-sm text-zinc-100 cursor-pointer"
      >
        <div className="flex items-center gap-2">
          {selectedModel && getCategoryIcon(selectedModel.category)}
          <span className="font-medium truncate">
            {selectedModel?.name || "Select Model"}
          </span>
          {selectedModel?.badge && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-emerald-900/30 text-emerald-400 rounded uppercase tracking-tighter">
              {selectedModel.badge}
            </span>
          )}
        </div>
        <ChevronDown size={16} className={cn("text-zinc-400 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && createPortal(
        <>
          <div 
            className="fixed inset-0 z-[9998]" 
            onClick={() => setIsOpen(false)}
          />
          <div 
            style={{ 
              position: 'fixed',
              top: coords.top - window.scrollY + 8,
              left: coords.left - window.scrollX,
              width: coords.width,
              zIndex: 9999
            }}
            className="py-1 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="max-h-64 overflow-y-auto custom-scrollbar">
              {models.length > 0 ? (
                models.map((model) => {
                  const locked = isModelLocked(model.id);
                  const access = getModelAccess(model.id);
                  return (
                  <button
                    key={model.id}
                    onClick={() => handleModelClick(model)}
                    className={cn(
                      "w-full flex flex-col items-start px-3 py-2.5 text-start hover:bg-zinc-800 transition-colors cursor-pointer relative",
                      selectedModelId === model.id && "bg-emerald-900/20",
                      locked && "opacity-75"
                    )}
                  >
                    <div className="flex items-center justify-between w-full mb-0.5">
                      <div className="flex items-center gap-2">
                        {getCategoryIcon(model.category)}
                        <span className={cn(
                          "text-sm font-semibold",
                          selectedModelId === model.id ? "text-emerald-400" : "text-zinc-100"
                        )}>
                          {model.name}
                        </span>
                        {!locked && access.reasonCode === 'default' && (
                          <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[8px] font-black uppercase tracking-widest">
                            Included
                          </span>
                        )}
                        {!locked && access.reasonCode === 'entitled' && (
                          <span className="px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-[8px] font-black uppercase tracking-widest">
                            Unlocked
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {locked && <Lock size={12} className="text-zinc-500" />}
                        {selectedModelId === model.id && (
                          <Check size={14} className="text-emerald-400" />
                        )}
                      </div>
                    </div>
                    <p className="text-[11px] text-zinc-400 line-clamp-1 leading-tight pr-6">
                      {model.description}
                    </p>
                  </button>
                )})
              ) : (
                <div className="px-4 py-3 text-xs text-zinc-500 italic text-center">
                  No compatible models found
                </div>
              )}
            </div>
          </div>
        </>,
        document.body
      )}

      {/* Request Access Modal */}
      {requestModalOpen && selectedLockedModel && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-zinc-800/50 mb-4 mx-auto">
              <Lock className="text-zinc-400" size={24} />
            </div>
            <h3 className="text-xl font-bold text-white text-center mb-2">
              Model Locked
            </h3>
            <p className="text-zinc-400 text-center text-sm mb-6">
              <strong className="text-white">{selectedLockedModel.name}</strong> is not included in your current access tier for {label}.
              Unlocks stay strictly controlled through admin approval, a valid code, or a secure payment of {MODEL_UNLOCK_PRICE_EGP} EGP.
            </p>
            <div className="mb-5 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
              <p className="text-[11px] font-black uppercase tracking-widest text-zinc-500 mb-2">Default Access</p>
              <div className="flex flex-wrap gap-2">
                {defaultModelIds.map((modelId) => {
                  const model = allModels.find((entry) => entry.id === modelId);
                  return (
                    <span key={modelId} className="px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase tracking-widest">
                      {model?.name || modelId}
                    </span>
                  );
                })}
              </div>
            </div>
            
            {!unlockModalOpen ? (
              <div className="space-y-3">
                <button
                  onClick={handleRequestAccess}
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
                >
                  <Send size={18} />
                  Request Access
                </button>
                <button
                  onClick={() => setUnlockModalOpen(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-medium transition-colors"
                >
                  <Unlock size={18} />
                  Enter Unlock Code
                </button>
                <button
                  onClick={handlePaidUnlock}
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-white text-zinc-900 hover:bg-zinc-100 rounded-xl font-medium transition-colors disabled:opacity-50"
                >
                  <CreditCard size={18} />
                  Pay {MODEL_UNLOCK_PRICE_EGP} EGP
                </button>
                <button
                  onClick={() => setRequestModalOpen(false)}
                  className="w-full py-3 px-4 text-zinc-400 hover:text-white transition-colors text-sm"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">
                    Unlock Code
                  </label>
                  <input
                    type="text"
                    value={unlockCode}
                    onChange={(e) => setUnlockCode(e.target.value)}
                    placeholder="Enter code here..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setUnlockModalOpen(false)}
                    className="flex-1 py-3 px-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-medium transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleUnlockCode}
                    disabled={isSubmitting || !unlockCode.trim()}
                    className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
                  >
                    Unlock
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default ModelSelector;
