import React from 'react';
import { ZoomIn, ZoomOut, Check, LogOut, RotateCcw, Sparkles, Trash2 } from 'lucide-react';

interface BottomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onSave: () => void;
  onClose: () => void;
  onGenerateAI?: () => void;
  onRestart?: () => void;
  scale: number;
}

const BottomControls: React.FC<BottomControlsProps> = ({ 
  onZoomIn, onZoomOut, onReset, onSave, onClose, onGenerateAI, onRestart, scale 
}) => {
  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[60] flex flex-wrap items-center justify-center gap-3 p-2 bg-zinc-950/90 border border-zinc-800 rounded-2xl shadow-2xl backdrop-blur-md">
       
       <div className="flex items-center gap-1 bg-zinc-900 rounded-xl p-1 border border-zinc-800">
           <button onClick={onZoomOut} className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors">
               <ZoomOut size={16} />
           </button>
           <span className="w-12 text-center text-xs font-mono text-zinc-500 select-none">
               {Math.round(scale * 100)}%
           </span>
           <button onClick={onZoomIn} className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors">
               <ZoomIn size={16} />
           </button>
       </div>

       <div className="w-px h-6 bg-zinc-800"></div>

       <button 
            onClick={onReset}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-xl transition-colors tooltip"
            title="Centralizar"
       >
           <RotateCcw size={16} />
       </button>

       <div className="w-px h-6 bg-zinc-800"></div>

       {onGenerateAI && (
         <>
           <button 
                onClick={onGenerateAI}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white rounded-xl shadow-lg shadow-purple-900/30 transition-all text-xs font-black uppercase tracking-wider animate-pulse hover:animate-none"
           >
               <Sparkles size={14} /> Gerar com IA
           </button>
           <div className="w-px h-6 bg-zinc-800"></div>
         </>
       )}

       {onRestart && (
         <>
           <button 
                onClick={onRestart}
                className="flex items-center gap-2 px-4 py-2 bg-red-950/40 hover:bg-red-900/60 text-red-400 hover:text-red-200 rounded-xl border border-red-900/50 hover:border-red-700 transition-all text-xs font-bold uppercase tracking-wider cursor-pointer"
                title="Reiniciar Mapa do Zero"
           >
               <Trash2 size={14} className="shrink-0 text-red-500" />
               <span className="hidden sm:inline">Reiniciar</span>
           </button>
           <div className="w-px h-6 bg-zinc-800"></div>
         </>
       )}

       <button 
            onClick={onClose}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-xl border border-zinc-800 transition-all text-xs font-bold uppercase tracking-wider"
       >
           <LogOut size={14} /> Sair
       </button>
       
       <button 
            onClick={onSave}
            className="flex items-center gap-2 px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl shadow-lg shadow-purple-900/50 transition-all text-xs font-black uppercase tracking-wider"
       >
           <Check size={14} /> Salvar
       </button>

    </div>
  );
};

export default BottomControls;
