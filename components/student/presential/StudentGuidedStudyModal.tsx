import React, { useState, useEffect } from 'react';
import { X, Play, FileText, CheckCircle, Clock, RotateCcw, ExternalLink, HelpCircle, Scale, Zap, BookOpen, Download, Award, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { GuidedStudyMeta, GuidedStudyProgress } from '../../../types/guidedStudy';
import { guidedStudyService } from '../../../services/guidedStudyService';

interface StudentGuidedStudyModalProps {
  isOpen: boolean;
  onClose: () => void;
  meta: GuidedStudyMeta | null;
  classId: string;
  userId: string;
  progress?: GuidedStudyProgress;
  onProgressUpdated?: () => void;
}

export const StudentGuidedStudyModal: React.FC<StudentGuidedStudyModalProps> = ({
  isOpen,
  onClose,
  meta,
  classId,
  userId,
  progress,
  onProgressUpdated
}) => {
  const [isCompleted, setIsCompleted] = useState<boolean>(!!progress?.completed);
  const [isSaving, setIsSaving] = useState(false);

  // Stopwatch state
  const [secondsElapsed, setSecondsElapsed] = useState<number>(0);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(true);

  // Flashcards state
  const [currentCardIndex, setCurrentCardIndex] = useState<number>(0);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [cardsMastered, setCardsMastered] = useState<number>(0);

  useEffect(() => {
    if (isOpen && meta) {
      setIsCompleted(!!progress?.completed);
      setSecondsElapsed(0);
      setIsTimerRunning(true);
      setCurrentCardIndex(0);
      setIsFlipped(false);
      setCardsMastered(0);
    }
  }, [isOpen, meta, progress]);

  // Stopwatch effect
  useEffect(() => {
    let interval: any = null;
    if (isOpen && isTimerRunning && !isCompleted) {
      interval = setInterval(() => {
        setSecondsElapsed(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isOpen, isTimerRunning, isCompleted]);

  if (!isOpen || !meta) return null;

  const formatTimer = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleToggleCompletion = async () => {
    try {
      setIsSaving(true);
      const newStatus = !isCompleted;
      const recordedMinutes = Math.max(1, Math.round(secondsElapsed / 60));
      await guidedStudyService.toggleMetaProgress(userId, classId, meta.id!, newStatus, recordedMinutes);
      setIsCompleted(newStatus);
      if (onProgressUpdated) onProgressUpdated();
    } catch (err) {
      console.error('Erro ao salvar progresso da meta:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const META_BADGES: Record<string, { label: string; bg: string; text: string }> = {
    aula: { label: 'Videoaula', bg: 'bg-blue-500/10 border-blue-500/30', text: 'text-blue-400' },
    material: { label: 'Material (PDF)', bg: 'bg-amber-500/10 border-amber-500/30', text: 'text-amber-400' },
    questoes: { label: 'Questões', bg: 'bg-emerald-500/10 border-emerald-500/30', text: 'text-emerald-400' },
    lei_seca: { label: 'Lei Seca', bg: 'bg-purple-500/10 border-purple-500/30', text: 'text-purple-400' },
    flashcards: { label: 'Flashcards', bg: 'bg-pink-500/10 border-pink-500/30', text: 'text-pink-400' },
    resumo: { label: 'Resumo', bg: 'bg-cyan-500/10 border-cyan-500/30', text: 'text-cyan-400' }
  };

  const badge = META_BADGES[meta.type] || META_BADGES.material;

  const cards = meta.cards || [];
  const currentCard = cards[currentCardIndex];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${badge.bg} ${badge.text}`}>
              {badge.label}
            </span>
            <div>
              <h2 className="text-lg font-bold text-white truncate max-w-lg">{meta.title}</h2>
              <div className="flex items-center gap-3 text-xs text-zinc-400 mt-0.5">
                {meta.disciplineName && <span>{meta.disciplineName}</span>}
                <span>•</span>
                <span>Tempo previsto: {meta.duration || 30} min</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Stopwatch */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800/80 border border-zinc-700/80 rounded-xl text-xs text-zinc-300">
              <Clock className="w-4 h-4 text-amber-400" />
              <span className="font-mono font-bold text-white">{formatTimer(secondsElapsed)}</span>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-zinc-900">

          {/* Description */}
          {meta.description && (
            <div className="p-4 bg-zinc-950/50 border border-zinc-800 rounded-xl text-sm text-zinc-300 leading-relaxed">
              <strong className="text-amber-400 block mb-1 text-xs uppercase tracking-wider">Orientação do Administrador:</strong>
              {meta.description}
            </div>
          )}

          {/* 1. TYPE: AULA (Panda Player) */}
          {meta.type === 'aula' && (
            <div className="space-y-4">
              <div className="aspect-video w-full bg-black rounded-xl overflow-hidden border border-zinc-800 shadow-xl relative">
                {meta.pandaVideoId || meta.pandaVideoUrl ? (
                  <iframe
                    src={
                      meta.pandaVideoUrl 
                        ? meta.pandaVideoUrl 
                        : `https://player-vouto.pandavideo.com.br/embed/?v=${meta.pandaVideoId}`
                    }
                    className="w-full h-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500 gap-2">
                    <Play className="w-12 h-12 text-zinc-600" />
                    <span className="text-xs">Vídeo não vinculado ou em processamento.</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 2. TYPE: MATERIAL, QUESTÕES, LEI SECA, RESUMO */}
          {(meta.type === 'material' || meta.type === 'questoes' || meta.type === 'lei_seca' || meta.type === 'resumo') && (
            <div className="space-y-4">
              {meta.articles && (
                <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl text-xs text-purple-300 flex items-center gap-2">
                  <Scale className="w-4 h-4 text-purple-400 shrink-0" />
                  <span><strong>Artigos Recomendados:</strong> {meta.articles}</span>
                </div>
              )}

              {meta.questionCount && meta.questionCount > 0 ? (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span><strong>Meta de Exercícios:</strong> Resolver {meta.questionCount} questões propostas.</span>
                </div>
              ) : null}

              {/* PDF Viewer / Download */}
              {meta.pdfUrl ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-zinc-800/80 border border-zinc-700 rounded-xl">
                    <div className="flex items-center gap-2 text-xs text-amber-400 font-bold truncate">
                      <FileText className="w-4 h-4" />
                      <span className="truncate">{meta.pdfName || 'Material em PDF'}</span>
                    </div>
                    <a
                      href={meta.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Baixar PDF</span>
                    </a>
                  </div>

                  <div className="w-full h-96 bg-zinc-950 rounded-xl border border-zinc-800 overflow-hidden">
                    <iframe
                      src={`${meta.pdfUrl}#toolbar=1`}
                      className="w-full h-full border-0"
                      title={meta.pdfName || 'PDF'}
                    />
                  </div>
                </div>
              ) : null}

              {/* External Link */}
              {meta.externalLink && (
                <div className="pt-2">
                  <a
                    href={meta.externalLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full p-4 bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 rounded-xl text-xs text-white font-bold flex items-center justify-between transition-colors shadow-md"
                  >
                    <div className="flex items-center gap-2">
                      <ExternalLink className="w-4 h-4 text-amber-400" />
                      <span>Acessar Link do Caderno de Questões / Material Externo</span>
                    </div>
                    <span className="text-amber-400">Abrir &rarr;</span>
                  </a>
                </div>
              )}
            </div>
          )}

          {/* 3. TYPE: FLASHCARDS */}
          {meta.type === 'flashcards' && (
            <div className="space-y-6">
              {cards.length === 0 ? (
                <div className="p-8 text-center bg-zinc-950/40 rounded-xl border border-zinc-800 text-zinc-500 text-xs">
                  Nenhum flashcard cadastrado nesta meta.
                </div>
              ) : (
                <div className="space-y-4 max-w-xl mx-auto">
                  <div className="flex items-center justify-between text-xs font-bold text-zinc-400">
                    <span>Card {currentCardIndex + 1} de {cards.length}</span>
                    <span className="text-pink-400">{cardsMastered} Dominados</span>
                  </div>

                  {/* Card Flip Container */}
                  <div
                    onClick={() => setIsFlipped(!isFlipped)}
                    className="relative w-full h-64 bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-700/80 hover:border-pink-500/50 rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer shadow-2xl transition-all group"
                  >
                    <span className="absolute top-4 left-4 text-[10px] font-extrabold uppercase tracking-widest text-pink-500/80 bg-pink-500/10 px-2 py-0.5 rounded border border-pink-500/20">
                      {isFlipped ? 'VERSO (RESPOSTA)' : 'FRENTE (PERGUNTA)'}
                    </span>

                    <p className="text-base font-bold text-white leading-relaxed px-4">
                      {isFlipped ? currentCard?.back : currentCard?.front}
                    </p>

                    <span className="absolute bottom-4 text-[10px] text-zinc-500 group-hover:text-pink-400 transition-colors">
                      Clique para virar o card
                    </span>
                  </div>

                  {/* Controls */}
                  <div className="flex items-center justify-between gap-3 pt-2">
                    <button
                      onClick={() => {
                        setIsFlipped(false);
                        setCurrentCardIndex(prev => Math.max(0, prev - 1));
                      }}
                      disabled={currentCardIndex === 0}
                      className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-xs font-bold text-zinc-300 rounded-xl flex items-center gap-1 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" /> Anterior
                    </button>

                    <button
                      onClick={() => {
                        setCardsMastered(prev => prev + 1);
                        setIsFlipped(false);
                        if (currentCardIndex < cards.length - 1) {
                          setCurrentCardIndex(prev => prev + 1);
                        }
                      }}
                      className="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors"
                    >
                      <Check className="w-4 h-4" /> Sabia Esta!
                    </button>

                    <button
                      onClick={() => {
                        setIsFlipped(false);
                        if (currentCardIndex < cards.length - 1) {
                          setCurrentCardIndex(prev => prev + 1);
                        }
                      }}
                      disabled={currentCardIndex === cards.length - 1}
                      className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-xs font-bold text-zinc-300 rounded-xl flex items-center gap-1 transition-colors"
                    >
                      Próximo <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-between bg-zinc-950/60">
          <div className="text-xs text-zinc-400">
            {isCompleted ? (
              <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4" /> Meta Concluída com sucesso!
              </span>
            ) : (
              <span>Tempo de estudo registrado: <strong className="text-white">{Math.max(1, Math.round(secondsElapsed / 60))} min</strong></span>
            )}
          </div>

          <button
            onClick={handleToggleCompletion}
            disabled={isSaving}
            className={`
              px-6 py-2.5 rounded-xl text-xs font-extrabold uppercase tracking-wider shadow-lg transition-all flex items-center gap-2
              ${isCompleted 
                ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700' 
                : 'bg-gradient-to-r from-emerald-500 to-teal-600 text-black hover:brightness-110'}
            `}
          >
            <CheckCircle className="w-4 h-4" />
            <span>{isCompleted ? 'Desmarcar Conclusão' : 'Concluir Meta (Estudo Guiado)'}</span>
          </button>
        </div>

      </div>
    </div>
  );
};
