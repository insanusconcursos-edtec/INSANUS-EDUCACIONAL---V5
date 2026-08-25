import React, { useState, useRef, useEffect } from 'react';
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { 
  Save, Plus, Trash2, GripVertical, 
  Repeat, Sparkles, Layers, ChevronUp, ChevronDown, AlertTriangle, Play,
  Upload, FileText, X, Loader2, CheckCircle2
} from 'lucide-react';
import { Flashcard } from '../../../../services/metaService';
import FlashcardPlayer from './FlashcardPlayer';
import toast from 'react-hot-toast';

// Helper to convert a File to base64
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
};

// --- SUB-COMPONENTE: CARD ORDENÁVEL ---

interface SortableCardProps {
  card: Flashcard;
  index: number;
  total: number;
  accentColor: string; // NEW PROP
  onDeleteRequest: (id: string) => void;
  onUpdate: (id: string, field: 'front' | 'back', value: string) => void;
  onMoveManual: (index: number, direction: 'up' | 'down') => void;
}

const SortableCard: React.FC<SortableCardProps> = ({ 
  card, index, total, accentColor, onDeleteRequest, onUpdate, onMoveManual 
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 999 : 'auto',
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      // Stop propagation on the card itself to prevent bubbling to overlay
      onClick={(e) => e.stopPropagation()} 
      className={`group relative flex items-start gap-3 bg-zinc-900 border ${isDragging ? 'shadow-[0_0_20px_rgba(0,0,0,0.5)]' : 'border-zinc-800 hover:border-zinc-700'} rounded-xl p-4 transition-all`}
      // Dynamic Border Color on Drag
      onMouseEnter={(e) => { if(!isDragging) e.currentTarget.style.borderColor = `${accentColor}40`; }}
      onMouseLeave={(e) => { if(!isDragging) e.currentTarget.style.borderColor = '#27272a'; }}
    >
      {/* Controls Column (Index + Drag + Arrows) */}
      <div className="flex flex-col items-center gap-1 mt-0 mr-1 min-w-[30px]">
          
          {/* Index Number */}
          <span 
            className="font-mono text-xs font-bold mb-2 select-none"
            style={{ color: accentColor }}
          >
            #{index + 1}
          </span>

          {/* Arrow Up */}
          <button
              type="button"
              onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onMoveManual(index, 'up');
              }}
              disabled={index === 0}
              className="p-1 text-zinc-600 disabled:opacity-20 disabled:hover:text-zinc-600 transition-colors hover:text-white"
              title="Mover para cima"
          >
              <ChevronUp size={14} />
          </button>

          {/* Drag Handle */}
          <button 
            type="button"
            {...attributes} 
            {...listeners}
            className="text-zinc-600 hover:text-white cursor-grab active:cursor-grabbing p-1 rounded hover:bg-zinc-800 transition-colors"
            title="Arrastar para reordenar"
          >
            <GripVertical size={20} />
          </button>

          {/* Arrow Down */}
          <button
              type="button"
              onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onMoveManual(index, 'down');
              }}
              disabled={index === total - 1}
              className="p-1 text-zinc-600 disabled:opacity-20 disabled:hover:text-zinc-600 transition-colors hover:text-white"
              title="Mover para baixo"
          >
              <ChevronDown size={14} />
          </button>
      </div>

      {/* Inputs Container */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Lado A: Pergunta */}
        <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2" style={{ color: accentColor }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accentColor }}></span>
                Frente (Pergunta)
            </label>
            <textarea
                value={card.front}
                onChange={(e) => onUpdate(card.id, 'front', e.target.value)}
                onClick={(e) => e.stopPropagation()} 
                placeholder="Digite a pergunta ou conceito..."
                rows={3}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-sm text-white placeholder-zinc-700 focus:outline-none resize-y min-h-[80px] transition-colors"
                style={{ caretColor: accentColor }}
                onFocus={(e) => e.target.style.borderColor = accentColor}
                onBlur={(e) => e.target.style.borderColor = '#27272a'}
                onKeyDown={e => e.stopPropagation()} 
            />
        </div>

        {/* Lado B: Resposta */}
        <div className="space-y-2">
            <label className="text-[10px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Verso (Resposta)
            </label>
            <textarea
                value={card.back}
                onChange={(e) => onUpdate(card.id, 'back', e.target.value)}
                onClick={(e) => e.stopPropagation()} 
                placeholder="Digite a resposta ou explicação..."
                rows={3}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-sm text-zinc-300 placeholder-zinc-700 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 resize-y min-h-[80px]"
                onKeyDown={e => e.stopPropagation()}
            />
        </div>
      </div>

      {/* Delete Button */}
      <div className="flex flex-col justify-start">
        <button 
            type="button"
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDeleteRequest(card.id);
            }}
            className="p-2 text-zinc-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100"
            title="Excluir Card"
        >
            <Trash2 size={18} />
        </button>
      </div>
    </div>
  );
};

// --- COMPONENTE PRINCIPAL ---

interface FlashcardFullscreenEditorProps {
  cards: Flashcard[];
  onClose: () => void;
  onChange: (cards: Flashcard[]) => void;
  accentColor?: string; // NEW PROP
  manualOnly?: boolean; // <--- ADICIONE ESTA LINHA
}

const FlashcardFullscreenEditor: React.FC<FlashcardFullscreenEditorProps> = ({ 
  cards, onClose, onChange, accentColor = '#a855f7', manualOnly // Default Purple
}) => {
  // Estado local
  const [localCards, setLocalCards] = useState<Flashcard[]>(cards);
  
  // Estado para Modal de Exclusão
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Estado para Preview Player
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);

  // Estado para Gerador de IA
  const [isAIGeneratorOpen, setIsAIGeneratorOpen] = useState(false);
  const [aiFiles, setAiFiles] = useState<File[]>([]);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiQuantity, setAiQuantity] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [aiMergeMode, setAiMergeMode] = useState<'append' | 'replace'>('append');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(true);
  };

  const handleDragLeave = () => {
    setIsDraggingFile(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    if (e.dataTransfer.files) {
      const filesArray = Array.from(e.dataTransfer.files).filter(file => file.type === 'application/pdf');
      if (filesArray.length === 0) {
        toast.error("Por favor, envie apenas arquivos em formato PDF.");
        return;
      }
      setAiFiles(prev => [...prev, ...filesArray]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files).filter(file => file.type === 'application/pdf');
      if (filesArray.length === 0) {
        toast.error("Por favor, envie apenas arquivos em formato PDF.");
        return;
      }
      setAiFiles(prev => [...prev, ...filesArray]);
    }
  };

  const removeAiFile = (index: number) => {
    setAiFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleGenerateAI = async () => {
    if (aiFiles.length === 0) {
      toast.error("Por favor, adicione pelo menos um arquivo PDF.");
      return;
    }

    setIsGenerating(true);
    try {
      const filesBase64 = await Promise.all(
        aiFiles.map(async (file) => {
          const base64 = await fileToBase64(file);
          return {
            name: file.name,
            type: file.type || "application/pdf",
            base64: base64
          };
        })
      );

      const response = await fetch('/api/generate-flashcards', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          files: filesBase64,
          prompt: aiPrompt,
          quantity: aiQuantity ? parseInt(aiQuantity) : undefined
        })
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Erro ao gerar flashcards via IA");
      }

      const generatedCards: Flashcard[] = result.cards.map((card: any, idx: number) => ({
        id: `ai-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 9)}`,
        front: card.front || '',
        back: card.back || ''
      }));

      if (aiMergeMode === 'replace') {
        setLocalCards(generatedCards);
      } else {
        setLocalCards(prev => [...prev, ...generatedCards]);
      }

      toast.success(`${generatedCards.length} flashcards gerados com sucesso!`);
      setIsAIGeneratorOpen(false);
      // Resetar campos
      setAiFiles([]);
      setAiPrompt('');
      setAiQuantity('');
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Falha ao gerar flashcards via IA");
    } finally {
      setIsGenerating(false);
    }
  };

  // Refs para Scroll
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(cards.length);

  // Sensores DnD
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // --- EFEITOS ---

  // Auto-scroll quando adicionar novo card
  useEffect(() => {
    if (localCards.length > prevCountRef.current) {
        // Pequeno timeout para garantir renderização
        setTimeout(() => {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    }
    prevCountRef.current = localCards.length;
  }, [localCards.length]);

  // --- HANDLERS ---

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setLocalCards((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleManualMove = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= localCards.length) return;

    setLocalCards(prev => {
        const newCards = [...prev];
        [newCards[index], newCards[newIndex]] = [newCards[newIndex], newCards[index]];
        return newCards;
    });
  };

  const handleUpdateCard = (id: string, field: 'front' | 'back', value: string) => {
    setLocalCards(prev => prev.map(card => 
        card.id === id ? { ...card, [field]: value } : card
    ));
  };

  // Abre Modal
  const handleDeleteRequest = (id: string) => {
    setDeleteId(id);
  };

  // Confirma Exclusão
  const confirmDelete = () => {
    if (deleteId) {
        setLocalCards(prev => prev.filter(c => c.id !== deleteId));
        setDeleteId(null);
    }
  };

  // Adiciona ao FINAL
  const handleAddCard = () => {
    const newCard: Flashcard = {
        id: `manual-${Date.now()}`,
        front: '',
        back: ''
    };
    setLocalCards(prev => [...prev, newCard]);
  };

  const handleSave = () => {
    onChange(localCards);
    onClose();
  };

  return (
    // LAYER 1: Overlay
    <div 
        className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-300"
        onMouseDown={onClose} 
    >
      
      {/* LAYER 2: Editor Principal */}
      <div 
        className="relative w-full h-full bg-zinc-950 flex flex-col shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Background Effect */}
        <div className="absolute inset-0 pointer-events-none opacity-10 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-zinc-800 via-zinc-950 to-zinc-950"></div>

        {/* HEADER */}
        <div className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
            <div className="flex items-center gap-4">
                <div 
                    className="w-10 h-10 rounded-xl border flex items-center justify-center shadow-lg"
                    style={{ 
                        backgroundColor: `${accentColor}1A`, // 10% opacity
                        borderColor: `${accentColor}33`,     // 20% opacity
                        color: accentColor 
                    }}
                >
                    <Repeat size={20} />
                </div>
                <div>
                    <h2 className="text-lg font-black text-white uppercase tracking-tighter flex items-center gap-2">
                        Editor de Flashcard
                        <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-[10px] text-zinc-400 font-mono">
                            {localCards.length} Cards
                        </span>
                    </h2>
                    {!manualOnly && (
                      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                          <Sparkles size={10} /> IA & Manual
                      </p>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-3">
                {/* BOTÃO TESTAR / PREVIEW */}
                <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setIsPlayerOpen(true); }}
                    disabled={localCards.length === 0}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all text-xs font-bold uppercase tracking-widest mr-2 disabled:opacity-50 disabled:cursor-not-allowed border"
                    style={{ 
                        backgroundColor: `${accentColor}1A`, 
                        borderColor: `${accentColor}40`,
                        color: accentColor 
                    }}
                >
                    <Play size={14} fill="currentColor" /> Testar Player
                </button>

                <div className="w-px h-6 bg-zinc-800 mx-2"></div>

                <button 
                    type="button"
                    onClick={(e) => { e.preventDefault(); onClose(); }}
                    className="px-4 py-2 text-zinc-400 hover:text-white text-xs font-bold uppercase tracking-wider transition-colors"
                >
                    Cancelar
                </button>
                <button 
                    type="button"
                    onClick={(e) => { e.preventDefault(); handleSave(); }}
                    className="flex items-center gap-2 px-6 py-2.5 bg-white hover:bg-zinc-200 text-black rounded-lg shadow-[0_0_15px_rgba(255,255,255,0.1)] transition-all text-xs font-black uppercase tracking-widest hover:scale-105 active:scale-95"
                >
                    <Save size={14} /> Salvar & Fechar
                </button>
            </div>
        </div>

        {/* CONTENT AREA */}
        <div className="relative z-10 flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
            <div className="max-w-4xl mx-auto space-y-6 pb-24">
                
                {localCards.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
                        <Layers size={48} strokeWidth={1} className="mb-4 opacity-50" />
                        <p className="text-sm font-bold uppercase">Nenhum card criado</p>
                        <p className="text-xs">Clique em &quot;Adicionar Card&quot; para começar.</p>
                    </div>
                )}

                <DndContext 
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext 
                        items={localCards}
                        strategy={verticalListSortingStrategy}
                    >
                        <div className="space-y-3">
                            {localCards.map((card, index) => (
                                <SortableCard 
                                    key={card.id} 
                                    card={card}
                                    index={index}
                                    total={localCards.length}
                                    accentColor={accentColor}
                                    onDeleteRequest={handleDeleteRequest}
                                    onUpdate={handleUpdateCard}
                                    onMoveManual={handleManualMove}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
                
                {/* Elemento invisível para scroll */}
                <div ref={bottomRef} className="h-1" />

            </div>
        </div>

        {/* FLOATING ACTION BUTTONS */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex items-center gap-4">
            <button 
                type="button"
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation(); 
                    handleAddCard();
                }}
                className="flex items-center gap-2 px-6 py-3 text-white rounded-full transition-all text-xs font-black uppercase tracking-widest hover:scale-110 active:scale-95 border border-white/10"
                style={{ 
                    backgroundColor: '#18181b', 
                    borderColor: `${accentColor}40`,
                    boxShadow: '0 4px 15px rgba(0,0,0,0.5)'
                }}
            >
                <Plus size={16} style={{ color: accentColor }} /> Adicionar Card Manual
            </button>

            {!manualOnly && (
              <button 
                  type="button"
                  onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation(); 
                      setIsAIGeneratorOpen(true);
                  }}
                  className="flex items-center gap-2 px-6 py-3 text-white rounded-full transition-all text-xs font-black uppercase tracking-widest hover:scale-110 active:scale-95 border border-white/20"
                  style={{ 
                      backgroundColor: accentColor,
                      boxShadow: `0 0 20px ${accentColor}66` 
                  }}
              >
                  <Sparkles size={16} /> Gerar com IA
              </button>
            )}
        </div>

        {/* MODAL DE GERAÇÃO COM IA (Z-[160]) */}
        {isAIGeneratorOpen && (
            <div 
                className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={() => { if (!isGenerating) setIsAIGeneratorOpen(false); }}
            >
                <div 
                    className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl p-6 flex flex-col gap-5 max-h-[90vh] overflow-y-auto custom-scrollbar animate-in zoom-in-95 duration-200"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                        <div className="flex items-center gap-2">
                            <Sparkles className="text-pink-500 animate-pulse" size={20} />
                            <h3 className="text-lg font-black text-white uppercase tracking-tighter">Gerar Flashcards com IA</h3>
                        </div>
                        <button 
                            onClick={() => { if (!isGenerating) setIsAIGeneratorOpen(false); }}
                            className="p-1 hover:bg-zinc-900 rounded-lg text-zinc-500 hover:text-white transition-colors"
                            disabled={isGenerating}
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* DRAG AND DROP ZONE */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
                            <Upload size={12} />
                            Base Teórica de Referência (.PDF)
                        </label>
                        <div 
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={() => { if (!isGenerating) fileInputRef.current?.click(); }}
                            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
                                isDraggingFile 
                                    ? 'border-pink-500 bg-pink-500/5' 
                                    : 'border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/40 bg-zinc-900/10'
                            } ${isGenerating ? 'pointer-events-none opacity-50' : ''}`}
                        >
                            <input 
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf"
                                multiple
                                onChange={handleFileSelect}
                                className="hidden"
                            />
                            <div className="p-3 rounded-full bg-zinc-900 text-zinc-400">
                                <Upload size={24} />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-white uppercase tracking-tight">Arraste e solte seus PDFs aqui</p>
                                <p className="text-[10px] text-zinc-500 uppercase font-medium mt-1">ou clique para selecionar do computador</p>
                            </div>
                        </div>

                        {/* LIST OF SELECTED FILES */}
                        {aiFiles.length > 0 && (
                            <div className="space-y-1.5 max-h-[120px] overflow-y-auto custom-scrollbar mt-3">
                                {aiFiles.map((file, idx) => (
                                    <div key={idx} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs">
                                        <div className="flex items-center gap-2 text-zinc-300 truncate">
                                            <FileText size={14} className="text-pink-500 shrink-0" />
                                            <span className="font-bold truncate max-w-[280px]">{file.name}</span>
                                            <span className="text-[10px] text-zinc-600 font-medium shrink-0">({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                                        </div>
                                        <button 
                                            onClick={() => removeAiFile(idx)}
                                            className="p-1 hover:bg-zinc-800 text-zinc-500 hover:text-red-500 rounded transition-colors shrink-0"
                                            disabled={isGenerating}
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* PROMPT DE ORIENTAÇÃO */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
                            Instruções / Prompt de Orientação
                        </label>
                        <textarea 
                            value={aiPrompt}
                            onChange={e => setAiPrompt(e.target.value)}
                            placeholder="Ex: Foco apenas nas definições de crimes e nas penas do art. 50 ao 80. Evite criar cards sobre a parte introdutória."
                            rows={3}
                            disabled={isGenerating}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs text-white placeholder-zinc-700 focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500/20 resize-none"
                        />
                    </div>

                    {/* QUANTITY & MERGE MODE IN SIDE-BY-SIDE GRID */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                                Quantidade de Flashcards
                            </label>
                            <input 
                                type="number"
                                min={1}
                                max={50}
                                value={aiQuantity}
                                onChange={e => setAiQuantity(e.target.value)}
                                placeholder="Automático (IA decide)"
                                disabled={isGenerating}
                                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white placeholder-zinc-700 focus:outline-none focus:border-pink-500"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                                Integração com os Atuais
                            </label>
                            <div className="grid grid-cols-2 gap-2 bg-zinc-900 p-1 border border-zinc-800 rounded-xl">
                                <button 
                                    type="button"
                                    onClick={() => setAiMergeMode('append')}
                                    disabled={isGenerating}
                                    className={`py-1.5 rounded-lg text-[10px] font-black uppercase tracking-tight transition-all ${
                                        aiMergeMode === 'append' 
                                            ? 'bg-pink-500 text-white shadow-lg' 
                                            : 'text-zinc-500 hover:text-white'
                                    }`}
                                >
                                    Adicionar
                                </button>
                                <button 
                                    type="button"
                                    onClick={() => setAiMergeMode('replace')}
                                    disabled={isGenerating}
                                    className={`py-1.5 rounded-lg text-[10px] font-black uppercase tracking-tight transition-all ${
                                        aiMergeMode === 'replace' 
                                            ? 'bg-pink-500 text-white shadow-lg' 
                                            : 'text-zinc-500 hover:text-white'
                                    }`}
                                >
                                    Substituir
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* ACTION BUTTONS */}
                    <div className="flex gap-3 border-t border-zinc-800 pt-4 mt-2">
                        <button 
                            type="button" 
                            onClick={() => { if (!isGenerating) setIsAIGeneratorOpen(false); }}
                            className="flex-1 py-3 text-xs font-bold uppercase tracking-widest text-zinc-500 hover:text-white transition-colors"
                            disabled={isGenerating}
                        >
                            Cancelar
                        </button>
                        <button 
                            type="button"
                            onClick={handleGenerateAI}
                            disabled={isGenerating || aiFiles.length === 0}
                            className="flex-1 py-3 bg-pink-600 hover:bg-pink-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-pink-900/20 flex items-center justify-center gap-2"
                        >
                            {isGenerating ? (
                                <>
                                    <Loader2 size={14} className="animate-spin" />
                                    Gerando Flashcards...
                                </>
                            ) : (
                                <>
                                    <Sparkles size={14} />
                                    Gerar com IA
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* MODAL DE CONFIRMAÇÃO INTERNO (Z-150) */}
        {deleteId && (
            <div 
                className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div 
                    className="w-[400px] bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-6 animate-in zoom-in-95 duration-200"
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <div className="flex flex-col items-center text-center gap-4">
                        <div className="p-3 rounded-full bg-red-500/10 text-red-500 border border-red-500/20">
                            <AlertTriangle size={32} />
                        </div>
                        <h3 className="text-xl font-black text-white uppercase tracking-tighter">Excluir Card?</h3>
                        <p className="text-zinc-400 text-sm leading-relaxed">
                            Tem certeza que deseja remover este flashcard? Esta ação não pode ser desfeita após salvar.
                        </p>
                        <div className="flex gap-3 w-full mt-2">
                            <button 
                                onClick={() => setDeleteId(null)} 
                                className="flex-1 py-3 rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 font-bold uppercase text-xs tracking-widest transition-colors"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={confirmDelete} 
                                className="flex-1 py-3 rounded-lg bg-red-600 text-white font-black uppercase text-xs tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-900/40"
                            >
                                Excluir
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* PREVIEW PLAYER MODAL (Z-200) */}
        {isPlayerOpen && (
            <FlashcardPlayer 
                cards={localCards} 
                onClose={() => setIsPlayerOpen(false)} 
                title="Modo de Teste"
            />
        )}
      
      </div>
    </div>
  );
};

export default FlashcardFullscreenEditor;