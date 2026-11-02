import React, { useState, useEffect } from 'react';
import { CourseSection } from '../../../../types/course';
import { Layers } from 'lucide-react';

interface CourseSectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<CourseSection>) => Promise<void>;
  initialData?: CourseSection | null;
}

export function CourseSectionModal({ isOpen, onClose, onSave, initialData }: CourseSectionModalProps) {
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setTitle(initialData.title);
      } else {
        setTitle('');
      }
    }
  }, [isOpen, initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      alert("Por favor, digite o nome da sessão/linha temática.");
      return;
    }

    setLoading(true);
    try {
      await onSave({
        title: title.trim()
      });
      onClose();
    } catch (error) {
      console.error(error);
      alert("Erro ao salvar sessão.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-[#121418] border border-gray-800 rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-zinc-900/60">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1">
              <Layers size={11} /> Linha Temática
            </span>
            <h2 className="text-xl font-black text-white">
              {initialData ? 'Editar Sessão' : 'Nova Sessão / Linha'}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">
              Nome da Sessão (Linha Temática) *
            </label>
            <input 
              type="text" 
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Ex: TAF, MENTORIA, CONHECIMENTOS ESPECÍFICOS..."
              className="w-full bg-black border border-gray-800 rounded p-3 text-white focus:border-amber-500 outline-none text-sm font-semibold uppercase tracking-wide"
              required
              autoFocus
            />
            <p className="text-[11px] text-zinc-500 mt-2">
              As sessões dividem o curso em linhas verticais com acordeão retrátil. Dentro de cada sessão, você pode organizar Blocos e Módulos lado a lado.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-800">
            <button 
              type="button" 
              onClick={onClose} 
              className="px-4 py-2 text-gray-400 hover:text-white font-bold uppercase text-xs"
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              disabled={loading} 
              className="px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold uppercase text-xs rounded transition-colors disabled:opacity-50 shadow-lg shadow-amber-900/30"
            >
              {loading ? 'Salvando...' : 'Salvar Sessão'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
