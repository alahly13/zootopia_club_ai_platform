import * as React from 'react';
import { cn } from '../utils';
import { AIModel } from '../constants/aiModels';
import { Zap, Search, Image as ImageIcon, Video, Brain } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

export type Mode = 'standard' | 'thinking' | 'search' | 'image' | 'video';

interface ModeSelectorProps {
  selectedMode: Mode;
  onModeSelect: (mode: Mode) => void;
  model: AIModel;
}

export const ModeSelector: React.FC<ModeSelectorProps> = ({ selectedMode, onModeSelect, model }) => {
  if (!model) return null;
  
  const { notify } = useAuth();
  const modes: Mode[] = ['standard'];
  
  // Robust check for model properties
  if (model?.supportsThinking) modes.push('thinking');
  if (model?.supportsSearch) modes.push('search');
  if (model?.supportsImageGeneration) modes.push('image');
  if (model?.supportsVideoOrMediaTasks) modes.push('video');

  const modeIcons: Record<Mode, React.ReactNode> = {
    standard: <Zap size={16} />,
    thinking: <Brain size={16} />,
    search: <Search size={16} />,
    image: <ImageIcon size={16} />,
    video: <Video size={16} />,
  };

  return (
    <div className="flex gap-2">
      {modes.map((mode) => (
        <button
          key={mode}
          onClick={() => {
            onModeSelect(mode);
            notify.success(`Mode changed to ${mode.charAt(0).toUpperCase() + mode.slice(1)}`);
          }}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border",
            selectedMode === mode
              ? "bg-emerald-600 border-emerald-500 text-white"
              : "bg-zinc-800 border-transparent text-zinc-400 hover:bg-zinc-700"
          )}
        >
          {modeIcons[mode]}
          {mode.charAt(0).toUpperCase() + mode.slice(1)}
        </button>
      ))}
    </div>
  );
};
