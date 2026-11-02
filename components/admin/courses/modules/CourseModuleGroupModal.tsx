import React, { useState, useEffect, useRef } from 'react';
import { CourseModuleGroup, CourseSection } from '../../../../types/course';
import { courseService } from '../../../../services/courseService';

interface CourseModuleGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<CourseModuleGroup>) => Promise<void>;
  initialData?: CourseModuleGroup | null;
  sections?: CourseSection[];
  defaultSectionId?: string | null;
}

export function CourseModuleGroupModal({ 
  isOpen, 
  onClose, 
  onSave, 
  initialData, 
  sections = [], 
  defaultSectionId = null 
}: CourseModuleGroupModalProps) {
  const [title, setTitle] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [releaseDate, setReleaseDate] = useState('');
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setTitle(initialData.title);
        setCoverUrl(initialData.coverUrl);
        setPreviewUrl(initialData.coverUrl);
        setSectionId(initialData.sectionId || null);
        setIsLocked(!!initialData.isLocked);
        setReleaseDate(initialData.releaseDate || '');
      } else {
        // Reset
        setTitle('');
        setCoverUrl('');
        setPreviewUrl('');
        setSelectedFile(null);
        setSectionId(defaultSectionId || null);
        setIsLocked(false);
        setReleaseDate('');
      }
    }
  }, [isOpen, initialData, defaultSectionId]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      alert("Por favor, informe o nome do bloco/grupo.");
      return;
    }
    if (!selectedFile && !coverUrl) {
      alert("Por favor, selecione uma capa para o bloco/grupo.");
      return;
    }

    setLoading(true);
    try {
      let finalCoverUrl = coverUrl;
      
      // Upload da imagem se houver novo arquivo
      if (selectedFile) {
        finalCoverUrl = await courseService.uploadCover(selectedFile);
      }

      const finalReleaseDate = (isLocked && releaseDate) ? releaseDate : null;

      await onSave({
        title: title.trim(),
        coverUrl: finalCoverUrl,
        sectionId: sectionId || null,
        isLocked,
        releaseDate: finalReleaseDate
      });
      onClose();
    } catch (error) {
      console.error(error);
      alert("Erro ao salvar bloco de módulos.");
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
            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400">Organização de Disciplinas</span>
            <h2 className="text-xl font-black text-white">
              {initialData ? 'Editar Bloco / Grupo' : 'Novo Bloco / Grupo'}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Título */}
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">
              Nome do Bloco / Grupo *
            </label>
            <input 
              type="text" 
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Ex: Conhecimentos Básicos, Bloco I, etc."
              className="w-full bg-black border border-gray-800 rounded p-3 text-white focus:border-purple-500 outline-none text-sm"
              required
            />
          </div>

          {/* Sessão / Linha Temática */}
          {sections && sections.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-1">
                Sessão / Linha Temática (Opcional)
              </label>
              <select
                value={sectionId || ''}
                onChange={e => setSectionId(e.target.value ? e.target.value : null)}
                className="w-full bg-black border border-gray-800 rounded p-3 text-white focus:border-purple-500 outline-none text-xs"
              >
                <option value="">Sessão Principal (Padrão)</option>
                {sections.map(s => (
                  <option key={s.id} value={s.id}>
                    📑 {s.title}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-zinc-500 mt-1">
                Define em qual linha temática do curso este bloco será exibido.
              </p>
            </div>
          )}

          {/* Capa Vertical */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-gray-400 uppercase">Capa do Bloco (Estilo Netflix) *</label>
              <span className="text-[10px] text-zinc-500 font-mono">474 × 1000 px</span>
            </div>
            
            <div 
              onClick={() => fileInputRef.current?.click()}
              className={`
                relative w-full aspect-[474/220] rounded-lg border-2 border-dashed 
                flex flex-col items-center justify-center cursor-pointer overflow-hidden group transition-all
                ${previewUrl ? 'border-purple-500/50 bg-black' : 'border-gray-700 hover:border-purple-500/50 hover:bg-white/5'}
              `}
            >
              <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="image/*" className="hidden" />
              {previewUrl ? (
                <>
                  <img src={previewUrl} alt="Capa do Bloco" className="w-full h-full object-cover opacity-75 group-hover:opacity-40 transition-opacity" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/60">
                    <span className="text-white text-xs font-bold uppercase tracking-wider bg-purple-600 px-3 py-1.5 rounded shadow">Alterar Imagem</span>
                  </div>
                </>
              ) : (
                <div className="text-center p-4">
                  <div className="w-10 h-10 rounded-full bg-purple-600/20 text-purple-400 flex items-center justify-center mx-auto mb-2">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <span className="text-gray-300 text-xs font-bold block">CARREGAR CAPA VERTICAL</span>
                  <p className="text-gray-500 text-[10px] mt-0.5">Formato vertical idêntico aos módulos</p>
                </div>
              )}
            </div>
          </div>

          {/* Bloqueio do Bloco */}
          <div className="bg-black/40 border border-gray-800 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-bold text-gray-200 block">Bloquear este bloco?</span>
                <span className="text-[11px] text-gray-500">Impede o acesso aos módulos contidos até a liberação</span>
              </div>
              <button
                type="button"
                onClick={() => setIsLocked(!isLocked)}
                className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${isLocked ? 'bg-red-600' : 'bg-gray-700'}`}
              >
                <span className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform duration-300 ${isLocked ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
            </div>

            {isLocked && (
              <div className="mt-4 animate-in slide-in-from-top-2 pt-3 border-t border-gray-800">
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Data de Liberação (Opcional)</label>
                <input 
                  type="date" 
                  value={releaseDate}
                  onChange={(e) => setReleaseDate(e.target.value)}
                  className="w-full bg-[#121418] border border-gray-700 rounded p-2 text-white focus:border-red-600 outline-none text-xs"
                />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-800">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white font-bold uppercase text-xs">
              Cancelar
            </button>
            <button 
              type="submit" 
              disabled={loading} 
              className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold uppercase text-xs rounded transition-colors disabled:opacity-50 shadow-lg shadow-purple-900/30"
            >
              {loading ? 'Salvando...' : 'Salvar Bloco'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
