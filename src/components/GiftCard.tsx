import * as React from 'react';
import { Gift } from 'lucide-react';

interface GiftCardProps {
  title: string;
  code: string;
  description?: string;
}

export const GiftCard: React.FC<GiftCardProps> = ({ title, code, description }) => {
  return (
    <div className="bg-gradient-to-br from-emerald-500 via-emerald-600 to-emerald-800 text-white p-8 rounded-3xl shadow-2xl shadow-emerald-500/20 space-y-4 border border-white/10">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-white/20 rounded-2xl">
          <Gift className="text-white" size={28} />
        </div>
        <h4 className="font-black text-xl uppercase tracking-widest">{title}</h4>
      </div>
      {description && <p className="text-sm text-emerald-100 leading-relaxed">{description}</p>}
      <div className="bg-black/20 p-4 rounded-2xl font-mono text-center text-2xl font-black tracking-[0.2em] border border-white/10">
        {code}
      </div>
    </div>
  );
};
