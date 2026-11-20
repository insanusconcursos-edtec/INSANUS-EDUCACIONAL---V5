import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Play,
  PlayCircle,
  FileText,
  CheckCircle,
  Clock,
  ExternalLink,
  HelpCircle,
  Scale,
  Download,
  ChevronLeft,
  ChevronRight,
  Check,
  Loader2,
  AlertCircle,
  Info
} from 'lucide-react';
import {
  GuidedStudyMeta,
  GuidedStudyProgress,
  getGuidedMetaVideos
} from '../../../types/guidedStudy';
import { CourseContent } from '../../../types/course';
import { guidedStudyService } from '../../../services/guidedStudyService';
import { InteractiveLessonPlayer } from '../courses/player/InteractiveLessonPlayer';
import { PandaVideoPlayer } from '../../ui/video/PandaVideoPlayer';

interface StudentGuidedStudyModalProps {
  isOpen: boolean;
  onClose: () => void;
  meta: GuidedStudyMeta | null;
  classId: string;
  userId: string;
  progress?: GuidedStudyProgress;
  onProgressUpdated?: () => void;
  isAdminPreview?: boolean;
  initialVideoIndex?: number;
}

export const StudentGuidedStudyModal: React.FC<StudentGuidedStudyModalProps> = ({
  isOpen,
  onClose,
  meta,
  classId,
  userId,
  progress,
  onProgressUpdated,
  isAdminPreview = false,
  initialVideoIndex = 0
}) => {
  const [isCompleted, setIsCompleted] = useState<boolean>(!!progress?.completed);
  const [isSaving, setIsSaving] = useState(false);
  const [showOrientationBanner, setShowOrientationBanner] = useState(true);

  // Stopwatch state
  const [secondsElapsed, setSecondsElapsed] = useState<number>(0);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(true);

  // Video Playlist state (multi-video support)
  const metaVideos = useMemo(() => getGuidedMetaVideos(meta), [meta]);
  const [activeVideoIndex, setActiveVideoIndex] = useState<number>(0);

  // Flashcards state
  const [currentCardIndex, setCurrentCardIndex] = useState<number>(0);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [cardsMastered, setCardsMastered] = useState<number>(0);

  // Interactive Map (.JSON) state
  const [resolvedMapJson, setResolvedMapJson] = useState<string | null>(null);
  const [isLoadingMap, setIsLoadingMap] = useState<boolean>(false);
  const [mapLoadError, setMapLoadError] = useState<string | null>(null);

  const loadRemoteInteractiveMap = useCallback(async (url: string) => {
    try {
      setIsLoadingMap(true);
      setMapLoadError(null);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Não foi possível baixar o conteúdo interativo desta meta.');
      }
      const text = await response.text();
      setResolvedMapJson(text);
    } catch (err: unknown) {
      console.error('Erro ao carregar arquivo .JSON da meta:', err);
      setMapLoadError(
        err instanceof Error
          ? err.message
          : 'Erro ao carregar o mapa interativo. Verifique sua conexão e tente novamente.'
      );
    } finally {
      setIsLoadingMap(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && meta) {
      setIsCompleted(!!progress?.completed);
      setSecondsElapsed(0);
      setIsTimerRunning(!isAdminPreview);
      setCurrentCardIndex(0);
      setIsFlipped(false);
      setCardsMastered(0);
      setMapLoadError(null);
      setShowOrientationBanner(true);

      const videosCount = getGuidedMetaVideos(meta).length;
      const safeIndex =
        videosCount > 0 ? Math.min(Math.max(0, initialVideoIndex), videosCount - 1) : 0;
      setActiveVideoIndex(safeIndex);

      if (meta.type === 'interactive_map') {
        if (meta.interactiveMapJson) {
          setResolvedMapJson(meta.interactiveMapJson);
          setIsLoadingMap(false);
        } else if (meta.interactiveMapUrl) {
          setResolvedMapJson(null);
          loadRemoteInteractiveMap(meta.interactiveMapUrl);
        } else {
          setResolvedMapJson(null);
          setIsLoadingMap(false);
        }
      } else {
        setResolvedMapJson(null);
        setIsLoadingMap(false);
      }
    }
  }, [isOpen, meta, progress, isAdminPreview, initialVideoIndex, loadRemoteInteractiveMap]);

  // Lock body scroll while modal is open so main page never scrolls behind it
  useEffect(() => {
    if (!isOpen || !meta) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, meta]);

  // Stopwatch effect
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isOpen && isTimerRunning && !isCompleted && !isAdminPreview) {
      interval = setInterval(() => {
        setSecondsElapsed(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isOpen, isTimerRunning, isCompleted, isAdminPreview]);

  if (!isOpen || !meta) return null;

  const formatTimer = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleToggleCompletion = async () => {
    if (isAdminPreview || !userId || !meta.id) return;
    try {
      setIsSaving(true);
      const newStatus = !isCompleted;
      const recordedMinutes = Math.max(1, Math.round(secondsElapsed / 60));
      await guidedStudyService.toggleMetaProgress(userId, classId, meta.id, newStatus, recordedMinutes);
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
    resumo: { label: 'Resumo', bg: 'bg-cyan-500/10 border-cyan-500/30', text: 'text-cyan-400' },
    interactive_map: {
      label: 'Mapa / Revisão (.JSON)',
      bg: 'bg-indigo-500/15 border-indigo-500/35',
      text: 'text-indigo-300'
    }
  };

  const badge = META_BADGES[meta.type] || META_BADGES.material;
  const isInteractiveMap = meta.type === 'interactive_map';

  const cards = meta.cards || [];
  const currentCard = cards[currentCardIndex];

  const summedVideosDuration = metaVideos.reduce((acc, v) => acc + (v.duration || 0), 0);
  const totalPlannedDuration =
    meta.type === 'aula' && summedVideosDuration > 0
      ? meta.duration || summedVideosDuration
      : meta.duration || 30;
  const activeVideo = metaVideos[activeVideoIndex] || metaVideos[0] || null;

  const lessonScopeId = `guided_${classId}`;
  const interactiveCourseContent: CourseContent = {
    id: meta.id || `guided_map_${meta.date}`,
    lessonId: lessonScopeId,
    title: meta.title,
    type: 'interactive_map',
    order: 0,
    interactiveMapJson: resolvedMapJson
  };

  const modalNode = (
    <div
      className={`fixed inset-0 z-[120] bg-black/90 backdrop-blur-md animate-in fade-in duration-150 ${
        isInteractiveMap
          ? 'w-screen h-screen p-0 flex flex-col overflow-hidden'
          : 'flex items-center justify-center p-3 sm:p-6'
      }`}
    >
      <div
        className={`bg-zinc-900 flex flex-col shadow-2xl overflow-hidden ${
          isInteractiveMap
            ? 'w-screen h-screen max-w-none max-h-none rounded-none border-0 bg-zinc-950'
            : 'w-full max-w-4xl max-h-[92vh] rounded-2xl border border-zinc-800'
        }`}
      >
        {/* Modal Header */}
        <div
          className={`px-4 sm:px-6 border-b border-zinc-800 flex items-center justify-between gap-3 bg-zinc-950 shrink-0 ${
            isInteractiveMap ? 'py-2.5' : 'py-4'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span
              className={`px-2.5 py-1 rounded-lg text-xs font-bold border whitespace-nowrap shrink-0 ${badge.bg} ${badge.text}`}
            >
              {badge.label}
            </span>
            <div className="min-w-0 flex-1">
              <h2
                className="text-sm sm:text-base md:text-lg font-bold text-white truncate"
                title={meta.title}
              >
                {meta.title}
              </h2>
              <div className="flex items-center gap-2 text-xs text-zinc-400 mt-0.5 tabular-nums flex-wrap">
                {meta.disciplineName && (
                  <>
                    <span className="truncate max-w-xs sm:max-w-md">{meta.disciplineName}</span>
                    <span aria-hidden="true">·</span>
                  </>
                )}
                <span>Tempo previsto: {totalPlannedDuration} min</span>
                {meta.type === 'aula' && metaVideos.length > 1 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-blue-400 font-semibold">
                      {metaVideos.length} videoaulas
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {isInteractiveMap && meta.description && !showOrientationBanner && (
              <button
                type="button"
                onClick={() => setShowOrientationBanner(true)}
                className="px-2.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
                title="Exibir orientação do administrador"
              >
                <Info className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden md:inline">Orientação</span>
              </button>
            )}

            {isInteractiveMap && isAdminPreview && (
              <span className="hidden md:inline-flex items-center px-2.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-[11px] font-semibold text-zinc-400 whitespace-nowrap">
                Prévia Admin
              </span>
            )}

            {!isAdminPreview && (
              <div
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-300 tabular-nums"
                title={`Tempo de estudo registrado: ${Math.max(1, Math.round(secondsElapsed / 60))} min`}
              >
                <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="font-mono font-bold text-white">{formatTimer(secondsElapsed)}</span>
              </div>
            )}

            {isInteractiveMap && !isAdminPreview && (
              <button
                type="button"
                onClick={handleToggleCompletion}
                disabled={isSaving}
                title={
                  isCompleted
                    ? 'Meta concluída! Clique caso deseje desmarcar a conclusão.'
                    : `Registrar ${Math.max(1, Math.round(secondsElapsed / 60))} min e concluir meta`
                }
                className={`px-3.5 sm:px-4 py-1.5 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-60 ${
                  isCompleted
                    ? 'bg-emerald-500/15 hover:bg-zinc-800 text-emerald-400 hover:text-zinc-200 border border-emerald-500/35 hover:border-zinc-700'
                    : 'bg-gradient-to-r from-emerald-500 to-teal-600 text-black hover:brightness-110 shadow-md shadow-emerald-950/50'
                }`}
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                ) : (
                  <CheckCircle className="w-4 h-4 shrink-0" />
                )}
                {isCompleted ? (
                  <span>Meta Concluída</span>
                ) : (
                  <>
                    <span className="hidden xl:inline">Concluir Meta (Estudo Guiado)</span>
                    <span className="xl:hidden">Concluir Meta</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-2.5 py-1.5 text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl transition-colors flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap"
              title="Fechar"
            >
              <X className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Fechar</span>
            </button>
          </div>
        </div>

        {/* Compact Full-Width Orientation Strip for Interactive Map */}
        {isInteractiveMap && meta.description && showOrientationBanner && (
          <div className="px-4 sm:px-6 py-2 bg-zinc-900/95 border-b border-zinc-800 flex items-center justify-between gap-3 shrink-0">
            <div className="text-xs text-zinc-300 leading-relaxed min-w-0 flex-1">
              <strong className="text-amber-400 uppercase tracking-wider text-[10px] mr-2">
                Orientação do Administrador:
              </strong>
              <span>{meta.description}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowOrientationBanner(false)}
              className="text-[11px] font-semibold text-zinc-400 hover:text-white shrink-0 whitespace-nowrap"
            >
              Ocultar
            </button>
          </div>
        )}

        {/* Modal Body */}
        {isInteractiveMap ? (
          <div className="flex-1 min-h-0 w-full flex flex-col overflow-hidden bg-zinc-950 p-0">
            {isLoadingMap ? (
              <div className="w-full flex-1 flex flex-col items-center justify-center gap-3 text-zinc-300">
                <Loader2 className="w-7 h-7 animate-spin text-indigo-400" />
                <span className="text-xs font-semibold">
                  Carregando Mapa Mental, Quadros, Questões e Flashcards...
                </span>
              </div>
            ) : mapLoadError ? (
              <div className="w-full flex-1 p-6 flex flex-col items-center justify-center text-center gap-3">
                <AlertCircle className="w-8 h-8 text-red-400" />
                <p className="text-sm font-semibold text-red-200 max-w-md">{mapLoadError}</p>
                {meta.interactiveMapUrl && (
                  <button
                    type="button"
                    onClick={() => loadRemoteInteractiveMap(meta.interactiveMapUrl!)}
                    className="px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-xs font-bold text-red-200 transition-colors"
                  >
                    Tentar Novamente
                  </button>
                )}
              </div>
            ) : (
              <InteractiveLessonPlayer
                content={interactiveCourseContent}
                lessonId={lessonScopeId}
                embeddedInModal
              />
            )}
          </div>
        ) : (
          <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-zinc-900">
            {/* Description for non-JSON metas */}
            {meta.description && (
              <div className="p-3.5 bg-zinc-950/50 border border-zinc-800 rounded-xl text-sm text-zinc-300 leading-relaxed">
                <strong className="text-amber-400 block mb-1 text-xs uppercase tracking-wider">
                  Orientação do Administrador:
                </strong>
                {meta.description}
              </div>
            )}

            {/* 1. TYPE: AULA (Panda Player - Single & Multi-Video Playlist) */}
            {meta.type === 'aula' && (
              <div className="space-y-4">
                {activeVideo ? (
                  <>
                    {metaVideos.length > 1 && (
                      <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-zinc-950/70 border border-zinc-800">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="px-2 py-0.5 rounded-md bg-blue-500/15 border border-blue-500/30 text-blue-300 text-[11px] font-mono font-bold shrink-0 tabular-nums">
                            Aula {activeVideoIndex + 1}/{metaVideos.length}
                          </span>
                          <span className="text-xs sm:text-sm font-bold text-white truncate">
                            {activeVideo.title}
                          </span>
                          {activeVideo.duration > 0 && (
                            <span className="hidden sm:inline text-[11px] font-mono text-zinc-400 shrink-0 tabular-nums">
                              ({activeVideo.duration} min)
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            disabled={activeVideoIndex === 0}
                            onClick={() => setActiveVideoIndex(prev => Math.max(0, prev - 1))}
                            className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-bold text-zinc-300 hover:text-white disabled:opacity-35 transition-colors flex items-center gap-1"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Anterior</span>
                          </button>
                          <button
                            type="button"
                            disabled={activeVideoIndex >= metaVideos.length - 1}
                            onClick={() =>
                              setActiveVideoIndex(prev => Math.min(metaVideos.length - 1, prev + 1))
                            }
                            className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-bold text-zinc-300 hover:text-white disabled:opacity-35 transition-colors flex items-center gap-1"
                          >
                            <span className="hidden sm:inline">Próxima</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}

                    <PandaVideoPlayer
                      key={`${activeVideo.id || activeVideoIndex}-${activeVideo.link}`}
                      url={activeVideo.link}
                      title={activeVideo.title || meta.title}
                      onComplete={() => {
                        if (activeVideoIndex < metaVideos.length - 1) {
                          setActiveVideoIndex(prev => prev + 1);
                        }
                      }}
                    />

                    {metaVideos.length > 1 && (
                      <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-bold uppercase tracking-wider text-zinc-400">
                            Playlist da Meta ({metaVideos.length} videoaulas)
                          </span>
                          <span className="font-mono font-bold text-blue-400 tabular-nums">
                            Total: {totalPlannedDuration} min
                          </span>
                        </div>

                        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                          {metaVideos.map((vid, idx) => {
                            const isCurrent = idx === activeVideoIndex;
                            return (
                              <button
                                key={vid.id || idx}
                                type="button"
                                onClick={() => setActiveVideoIndex(idx)}
                                className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                                  isCurrent
                                    ? 'bg-blue-500/15 border-blue-500/40 text-white shadow-sm'
                                    : 'bg-zinc-900/70 hover:bg-zinc-800/80 border-zinc-800/80 text-zinc-300 hover:text-white'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <span
                                    className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-mono font-bold shrink-0 tabular-nums ${
                                      isCurrent
                                        ? 'bg-blue-500 text-black'
                                        : 'bg-zinc-800 text-zinc-400'
                                    }`}
                                  >
                                    {isCurrent ? <Play className="w-3 h-3 fill-current" /> : idx + 1}
                                  </span>
                                  <div className="min-w-0">
                                    <span className="block text-xs font-bold truncate">
                                      {vid.title}
                                    </span>
                                    {isCurrent && (
                                      <span className="block text-[10px] font-semibold text-blue-300">
                                        Reproduzindo agora
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0 tabular-nums">
                                  {vid.duration > 0 && (
                                    <span className="text-[11px] font-mono text-zinc-400">
                                      {vid.duration} min
                                    </span>
                                  )}
                                  <PlayCircle
                                    className={`w-4 h-4 ${
                                      isCurrent ? 'text-blue-400' : 'text-zinc-500'
                                    }`}
                                  />
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="aspect-video w-full bg-black rounded-xl overflow-hidden border border-zinc-800 shadow-xl flex flex-col items-center justify-center text-zinc-500 gap-2">
                    <Play className="w-12 h-12 text-zinc-600" />
                    <span className="text-xs">Vídeo não vinculado ou em processamento.</span>
                  </div>
                )}
              </div>
            )}

            {/* 2. TYPE: MATERIAL, QUESTÕES, LEI SECA, RESUMO */}
            {(meta.type === 'material' ||
              meta.type === 'questoes' ||
              meta.type === 'lei_seca' ||
              meta.type === 'resumo') && (
              <div className="space-y-4">
                {meta.articles && (
                  <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl text-xs text-purple-300 flex items-center gap-2">
                    <Scale className="w-4 h-4 text-purple-400 shrink-0" />
                    <span>
                      <strong>Artigos Recomendados:</strong> {meta.articles}
                    </span>
                  </div>
                )}

                {meta.questionCount && meta.questionCount > 0 ? (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 flex items-center gap-2 tabular-nums">
                    <HelpCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      <strong>Meta de Exercícios:</strong> Resolver {meta.questionCount} questões propostas.
                    </span>
                  </div>
                ) : null}

                {/* PDF Viewer / Download */}
                {meta.pdfUrl ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-zinc-800/80 border border-zinc-700 rounded-xl">
                      <div className="flex items-center gap-2 text-xs text-amber-400 font-bold truncate">
                        <FileText className="w-4 h-4 shrink-0" />
                        <span className="truncate">{meta.pdfName || 'Material em PDF'}</span>
                      </div>
                      <a
                        href={meta.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
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
                    <div className="flex items-center justify-between text-xs font-bold text-zinc-400 tabular-nums">
                      <span>
                        Card {currentCardIndex + 1} de {cards.length}
                      </span>
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
                        type="button"
                        onClick={() => {
                          setIsFlipped(false);
                          setCurrentCardIndex(prev => Math.max(0, prev - 1));
                        }}
                        disabled={currentCardIndex === 0}
                        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-xs font-bold text-zinc-300 rounded-xl flex items-center gap-1 transition-colors whitespace-nowrap"
                      >
                        <ChevronLeft className="w-4 h-4" /> Anterior
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setCardsMastered(prev => prev + 1);
                          setIsFlipped(false);
                          if (currentCardIndex < cards.length - 1) {
                            setCurrentCardIndex(prev => prev + 1);
                          }
                        }}
                        className="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap"
                      >
                        <Check className="w-4 h-4" /> Sabia Esta!
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsFlipped(false);
                          if (currentCardIndex < cards.length - 1) {
                            setCurrentCardIndex(prev => prev + 1);
                          }
                        }}
                        disabled={currentCardIndex === cards.length - 1}
                        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-xs font-bold text-zinc-300 rounded-xl flex items-center gap-1 transition-colors whitespace-nowrap"
                      >
                        Próximo <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Modal Footer (apenas para metas convencionais; metas .JSON usam o topo para liberar 100% da área útil do player) */}
        {!isInteractiveMap && (
          <div className="px-4 sm:px-6 py-3.5 border-t border-zinc-800 flex items-center justify-between gap-3 bg-zinc-950 shrink-0">
            {isAdminPreview ? (
              <>
                <span className="text-xs text-zinc-400">
                  Pré-visualização do conteúdo da meta pelo Administrador
                </span>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-xs font-bold transition-colors whitespace-nowrap shrink-0"
                >
                  Fechar Visualização
                </button>
              </>
            ) : (
              <>
                <div className="text-xs text-zinc-400 tabular-nums">
                  {isCompleted ? (
                    <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                      <CheckCircle className="w-4 h-4 shrink-0" /> Meta Concluída com sucesso!
                    </span>
                  ) : (
                    <span>
                      Tempo de estudo registrado:{' '}
                      <strong className="text-white">
                        {Math.max(1, Math.round(secondsElapsed / 60))} min
                      </strong>
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleToggleCompletion}
                  disabled={isSaving}
                  className={`
                    px-5 sm:px-6 py-2.5 rounded-xl text-xs font-extrabold uppercase tracking-wider shadow-lg transition-all flex items-center gap-2 whitespace-nowrap shrink-0
                    ${
                      isCompleted
                        ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700'
                        : 'bg-gradient-to-r from-emerald-500 to-teal-600 text-black hover:brightness-110'
                    }
                  `}
                >
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>
                    {isCompleted ? 'Desmarcar Conclusão' : 'Concluir Meta (Estudo Guiado)'}
                  </span>
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalNode, document.body);
  }

  return modalNode;
};


