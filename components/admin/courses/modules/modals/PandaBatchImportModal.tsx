import React, { useState, useEffect, useMemo } from 'react';
import { toast } from 'react-hot-toast';
import {
  X,
  Folder,
  FolderOpen,
  ChevronRight,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  CheckSquare,
  Square,
  PlayCircle,
  Loader2,
  Link2,
  Link2Off,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  Clock,
  Search
} from 'lucide-react';
import { CourseSubModule, CourseLesson, CourseGroup } from '../../../../../types/course';
import { pandaService } from '../../../../../services/pandaService';
import { courseService } from '../../../../../services/courseService';
import {
  PandaVideo,
  PandaExplorerFolder,
  PandaExplorerBreadcrumb,
  extractPandaVideoId,
  getPandaEmbedUrl
} from '../../../../../utils/pandaUtils';

type SortMode = 'natural_asc' | 'natural_desc' | 'created_asc' | 'created_desc';

interface OrderedVideoEntry {
  video: PandaVideo;
  customTitle: string;
  selected: boolean;
  alreadyExists: boolean;
}

interface LinkedFolderPayload {
  subModuleId: string;
  pandaFolderId: string | null;
  pandaFolderName: string | null;
  pandaFolderPath: string | null;
}

interface PandaBatchImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  moduleId: string;
  moduleTitle: string;
  targetFolder: CourseSubModule | null;
  groups?: CourseGroup[];
  startingOrder: number;
  onSuccess: (createdLessons: CourseLesson[], linkedFolderUpdate?: LinkedFolderPayload) => void;
}

const formatDuration = (seconds?: number): string | null => {
  if (!seconds || seconds <= 0) return null;
  const totalSec = Math.round(seconds);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const VIDEO_EXT_REGEX = /\.(mp4|mov|mkv|avi|webm|m4v)$/i;

export const PandaBatchImportModal: React.FC<PandaBatchImportModalProps> = ({
  isOpen,
  onClose,
  moduleId,
  moduleTitle,
  targetFolder,
  groups = [],
  startingOrder,
  onSuccess
}) => {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [pandaFolders, setPandaFolders] = useState<PandaExplorerFolder[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<PandaExplorerBreadcrumb[]>([]);
  const [entries, setEntries] = useState<OrderedVideoEntry[]>([]);
  const [loadingExplorer, setLoadingExplorer] = useState(false);

  const [existingVideoIds, setExistingVideoIds] = useState<Set<string>>(new Set());
  const [existingPlaybackIds, setExistingPlaybackIds] = useState<Set<string>>(new Set());
  const [loadingExisting, setLoadingExisting] = useState(false);

  const [sortMode, setSortMode] = useState<SortMode>('natural_asc');
  const [keepFolderLinked, setKeepFolderLinked] = useState(true);
  const [selectedRootGroupId, setSelectedRootGroupId] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [progressStep, setProgressStep] = useState<string>('');
  const [unlinking, setUnlinking] = useState(false);
  const [folderFilter, setFolderFilter] = useState<string>('');

  const sortRawVideos = (videos: PandaVideo[], mode: SortMode): PandaVideo[] => {
    const copy = [...videos];
    copy.sort((a, b) => {
      const titleA = (a.title || a.name || '').trim();
      const titleB = (b.title || b.name || '').trim();

      if (mode === 'created_asc' || mode === 'created_desc') {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        if (timeA !== timeB) {
          return mode === 'created_asc' ? timeA - timeB : timeB - timeA;
        }
      }

      const cmp = titleA.localeCompare(titleB, 'pt-BR', { numeric: true, sensitivity: 'base' });
      return mode === 'natural_desc' ? -cmp : cmp;
    });
    return copy;
  };

  const buildEntries = (
    videos: PandaVideo[],
    mode: SortMode,
    knownVideoIds: Set<string>,
    knownPlaybackIds: Set<string>
  ): OrderedVideoEntry[] => {
    const sorted = sortRawVideos(videos, mode);
    return sorted.map((video) => {
      const pId = extractPandaVideoId(video);
      const vId = String(video.video_id || video.id || '');
      const alreadyExists =
        (Boolean(vId) && knownVideoIds.has(vId)) ||
        (Boolean(video.id) && knownVideoIds.has(String(video.id))) ||
        (Boolean(pId) && knownPlaybackIds.has(pId));

      return {
        video,
        customTitle: (video.title || video.name || 'Sem título').trim(),
        selected: !alreadyExists,
        alreadyExists
      };
    });
  };

  // Inicializa contexto e carrega chaves já cadastradas na pasta destino
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    const initialPandaFolderId = targetFolder?.pandaFolderId || null;
    setCurrentFolderId(initialPandaFolderId);
    setKeepFolderLinked(true);
    setSortMode('natural_asc');
    setSelectedRootGroupId(targetFolder?.groupId || null);
    setProgressStep('');
    setFolderFilter('');

    const init = async () => {
      setLoadingExisting(true);
      setLoadingExplorer(true);
      try {
        const [existingKeys, explorerData] = await Promise.all([
          courseService.getExistingPandaVideoKeys(moduleId, targetFolder?.id || null),
          pandaService.explorer(initialPandaFolderId)
        ]);

        if (cancelled) return;

        const vSet = new Set(existingKeys.videoIds);
        const pSet = new Set(existingKeys.playbackIds);
        setExistingVideoIds(vSet);
        setExistingPlaybackIds(pSet);

        if (explorerData.folderNotFound && initialPandaFolderId) {
          toast('A pasta vinculada anteriormente não foi localizada no Panda. Exibindo a raiz.', {
            icon: '⚠️'
          });
          setCurrentFolderId(null);
          const rootData = await pandaService.explorer(null);
          if (cancelled) return;
          setPandaFolders(rootData.folders);
          setBreadcrumbs(rootData.breadcrumbs);
          setEntries(buildEntries(rootData.videos, 'natural_asc', vSet, pSet));
        } else {
          setPandaFolders(explorerData.folders);
          setBreadcrumbs(explorerData.breadcrumbs);
          setEntries(buildEntries(explorerData.videos, 'natural_asc', vSet, pSet));
        }
      } catch (error) {
        console.error('Erro ao inicializar importação em lote do Panda:', error);
        if (!cancelled) {
          toast.error('Erro ao conectar com o Panda Vídeo.');
        }
      } finally {
        if (!cancelled) {
          setLoadingExisting(false);
          setLoadingExplorer(false);
        }
      }
    };

    init();
    return () => {
      cancelled = true;
    };
  }, [isOpen, moduleId, targetFolder?.id, targetFolder?.pandaFolderId]);

  const navigateToFolder = async (folderId: string | null) => {
    setCurrentFolderId(folderId);
    setFolderFilter('');
    setLoadingExplorer(true);
    try {
      const data = await pandaService.explorer(folderId);
      setPandaFolders(data.folders);
      setBreadcrumbs(data.breadcrumbs);
      setEntries(buildEntries(data.videos, sortMode, existingVideoIds, existingPlaybackIds));
    } catch (error) {
      console.error('Erro ao navegar para pasta no Panda:', error);
      toast.error('Falha ao abrir pasta do Panda Vídeo.');
    } finally {
      setLoadingExplorer(false);
    }
  };

  const handleSortModeChange = (newMode: SortMode) => {
    setSortMode(newMode);
    setEntries((prev) => {
      const titleById = new Map(prev.map((e) => [e.video.id, e.customTitle]));
      const selectedById = new Map(prev.map((e) => [e.video.id, e.selected]));
      const existsById = new Map(prev.map((e) => [e.video.id, e.alreadyExists]));
      const sortedVideos = sortRawVideos(
        prev.map((e) => e.video),
        newMode
      );
      return sortedVideos.map((v) => ({
        video: v,
        customTitle: titleById.get(v.id) ?? (v.title || v.name || 'Sem título').trim(),
        selected: selectedById.get(v.id) ?? true,
        alreadyExists: existsById.get(v.id) ?? false
      }));
    });
  };

  const handleMoveEntry = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= entries.length) return;
    setEntries((prev) => {
      const next = [...prev];
      [next[index], next[targetIdx]] = [next[targetIdx], next[index]];
      return next;
    });
  };

  const handleToggleEntry = (index: number) => {
    setEntries((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, selected: !item.selected } : item))
    );
  };

  const handleTitleChange = (index: number, newTitle: string) => {
    setEntries((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, customTitle: newTitle } : item))
    );
  };

  const handleSelectOnlyNew = () => {
    setEntries((prev) => prev.map((item) => ({ ...item, selected: !item.alreadyExists })));
  };

  const handleSelectAll = () => {
    setEntries((prev) => prev.map((item) => ({ ...item, selected: true })));
  };

  const handleDeselectAll = () => {
    setEntries((prev) => prev.map((item) => ({ ...item, selected: false })));
  };

  const hasFileExtensionsInTitles = useMemo(
    () => entries.some((e) => VIDEO_EXT_REGEX.test(e.customTitle.trim())),
    [entries]
  );

  const handleCleanExtensions = () => {
    setEntries((prev) =>
      prev.map((e) => ({
        ...e,
        customTitle: e.customTitle.trim().replace(VIDEO_EXT_REGEX, '').trim()
      }))
    );
    toast.success('Extensões de vídeo removidas dos títulos.');
  };

  const handleUnlinkFolder = async () => {
    if (!targetFolder) return;
    setUnlinking(true);
    try {
      await courseService.updateSubModule(targetFolder.id, {
        pandaFolderId: null,
        pandaFolderName: null,
        pandaFolderPath: null
      });
      onSuccess([], {
        subModuleId: targetFolder.id,
        pandaFolderId: null,
        pandaFolderName: null,
        pandaFolderPath: null
      });
      toast.success('Vínculo com pasta do Panda removido.');
    } catch (error) {
      console.error('Erro ao desvincular pasta do Panda:', error);
      toast.error('Não foi possível remover o vínculo.');
    } finally {
      setUnlinking(false);
    }
  };

  const selectedEntries = useMemo(() => entries.filter((e) => e.selected), [entries]);
  const newEntriesCount = useMemo(() => entries.filter((e) => !e.alreadyExists).length, [entries]);
  const alreadyRegisteredCount = useMemo(
    () => entries.filter((e) => e.alreadyExists).length,
    [entries]
  );

  const currentFolderPath = useMemo(() => {
    if (breadcrumbs.length === 0) return 'Raiz do Panda Vídeo';
    return breadcrumbs.map((b) => b.name).join(' / ');
  }, [breadcrumbs]);

  const currentFolderName = useMemo(() => {
    if (breadcrumbs.length === 0) return null;
    return breadcrumbs[breadcrumbs.length - 1].name;
  }, [breadcrumbs]);

  const filteredPandaFolders = useMemo(() => {
    const term = folderFilter.trim().toLowerCase();
    if (!term) return pandaFolders;
    return pandaFolders.filter((f) => f.name.toLowerCase().includes(term));
  }, [pandaFolders, folderFilter]);

  const handleConfirmBatch = async () => {
    if (selectedEntries.length === 0 || submitting) return;

    const emptyTitle = selectedEntries.find((e) => !e.customTitle.trim());
    if (emptyTitle) {
      toast.error('Todas as aulas selecionadas precisam ter um título válido.');
      return;
    }

    setSubmitting(true);
    try {
      const resolvedItems: Array<{ title: string; videoUrl: string; pandaVideoId: string }> = [];
      const failedTitles: string[] = [];

      // Resolver Playback IDs / URLs de Embed com concorrência controlada (4 por vez)
      const total = selectedEntries.length;
      let processed = 0;
      const CONCURRENCY = 4;

      const results: Array<{
        index: number;
        item?: { title: string; videoUrl: string; pandaVideoId: string };
        failedTitle?: string;
      }> = [];

      for (let i = 0; i < total; i += CONCURRENCY) {
        const slice = selectedEntries.slice(i, i + CONCURRENCY);
        setProgressStep(`Validando vídeos no Panda (${Math.min(i + 1, total)} de ${total})...`);

        const chunkResults = await Promise.all(
          slice.map(async (entry, offset) => {
            const absoluteIdx = i + offset;
            let videoObj: PandaVideo = entry.video;
            let playbackId = extractPandaVideoId(videoObj);

            if (!playbackId) {
              try {
                const detailed = await pandaService.getVideoDetails(entry.video.id);
                if (detailed) {
                  videoObj = detailed;
                  playbackId = extractPandaVideoId(detailed);
                }
              } catch (err) {
                console.error(`Falha ao buscar detalhes do vídeo ${entry.video.id}:`, err);
              }
            }

            processed++;
            setProgressStep(`Validando vídeos no Panda (${processed} de ${total})...`);

            if (!playbackId) {
              return { index: absoluteIdx, failedTitle: entry.customTitle.trim() };
            }

            const embedUrl = getPandaEmbedUrl(videoObj, playbackId);
            return {
              index: absoluteIdx,
              item: {
                title: entry.customTitle.trim(),
                videoUrl: embedUrl,
                pandaVideoId: String(videoObj.video_id || videoObj.id || playbackId)
              }
            };
          })
        );

        results.push(...chunkResults);
      }

      results.sort((a, b) => a.index - b.index);
      for (const r of results) {
        if (r.item) resolvedItems.push(r.item);
        if (r.failedTitle) failedTitles.push(r.failedTitle);
      }

      if (resolvedItems.length === 0) {
        toast.error(
          'Nenhum dos vídeos selecionados possui embed liberado/processado no Panda Vídeo.'
        );
        return;
      }

      setProgressStep(`Cadastrando ${resolvedItems.length} aula(s) e conteúdos em lote...`);

      const linkPandaFolder: LinkedFolderPayload | null =
        targetFolder && keepFolderLinked && currentFolderId && currentFolderName
          ? {
              subModuleId: targetFolder.id,
              pandaFolderId: currentFolderId,
              pandaFolderName: currentFolderName,
              pandaFolderPath: currentFolderPath
            }
          : null;

      const effectiveGroupId = targetFolder
        ? targetFolder.groupId || null
        : selectedRootGroupId || null;

      const createdLessons = await courseService.createPandaLessonsBatch({
        moduleId,
        subModuleId: targetFolder ? targetFolder.id : null,
        groupId: effectiveGroupId,
        startingOrder,
        items: resolvedItems,
        linkPandaFolder
      });

      if (failedTitles.length > 0) {
        toast(
          `${createdLessons.length} aula(s) criada(s). ${failedTitles.length} vídeo(s) ignorado(s) por ainda estarem em processamento no Panda.`,
          { icon: '⚠️', duration: 6000 }
        );
      } else {
        toast.success(
          `${createdLessons.length} ${createdLessons.length === 1 ? 'aula cadastrada' : 'aulas cadastradas'} com sucesso!`
        );
      }

      onSuccess(createdLessons, linkPandaFolder || undefined);
      onClose();
    } catch (error) {
      console.error('Erro ao cadastrar aulas em lote do Panda:', error);
      toast.error('Erro ao gravar o lote de aulas. Tente novamente.');
    } finally {
      setSubmitting(false);
      setProgressStep('');
    }
  };

  if (!isOpen) return null;

  const handleStepBack = () => {
    if (breadcrumbs.length <= 1) {
      navigateToFolder(null);
    } else {
      const parentCrumb = breadcrumbs[breadcrumbs.length - 2];
      navigateToFolder(parentCrumb.id);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-[#121418] border border-zinc-800 rounded-xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/60 flex items-center justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-black uppercase tracking-wider whitespace-nowrap shrink-0">
                Cadastramento em Lote • Panda Vídeo
              </span>
              <span className="text-[11px] text-zinc-500 font-semibold truncate">
                Módulo: {moduleTitle}
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-black text-white uppercase truncate flex items-center gap-2">
              {targetFolder ? (
                <>
                  <Folder size={18} className="text-yellow-500 shrink-0" fill="currentColor" />
                  <span className="truncate" title={`Destino: ${targetFolder.title}`}>
                    Destino: {targetFolder.title}
                  </span>
                </>
              ) : (
                <span className="truncate" title={`Destino: Raiz do Módulo (${moduleTitle})`}>
                  Destino: Raiz do Módulo ({moduleTitle})
                </span>
              )}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-40 shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        {/* Barra de Pasta Vinculada / Seletor de Grupo (se Raiz) */}
        {targetFolder?.pandaFolderId && (
          <div className="px-6 py-2.5 bg-emerald-950/25 border-b border-emerald-900/40 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 text-xs text-emerald-300 min-w-0">
              <Link2 size={14} className="text-emerald-400 shrink-0" />
              <span className="font-bold uppercase text-[10px] text-emerald-400 shrink-0">
                Pasta Panda Vinculada:
              </span>
              <span
                className="truncate font-semibold"
                title={
                  targetFolder.pandaFolderPath ||
                  targetFolder.pandaFolderName ||
                  targetFolder.pandaFolderId
                }
              >
                {targetFolder.pandaFolderPath || targetFolder.pandaFolderName || targetFolder.pandaFolderId}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {currentFolderId !== targetFolder.pandaFolderId && (
                <button
                  type="button"
                  onClick={() => navigateToFolder(targetFolder.pandaFolderId || null)}
                  className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 rounded text-[10px] font-bold uppercase text-emerald-300 transition-colors whitespace-nowrap shrink-0"
                >
                  Ir para pasta vinculada
                </button>
              )}
              <button
                type="button"
                onClick={handleUnlinkFolder}
                disabled={unlinking || submitting}
                className="px-2.5 py-1 bg-zinc-900 hover:bg-red-950/40 border border-zinc-700 hover:border-red-800/60 rounded text-[10px] font-bold uppercase text-zinc-400 hover:text-red-300 flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
              >
                <Link2Off size={12} />
                {unlinking ? 'Removendo...' : 'Desvincular'}
              </button>
            </div>
          </div>
        )}

        {!targetFolder && groups.length > 0 && (
          <div className="px-6 py-2.5 bg-zinc-900/40 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <span className="text-[11px] font-bold uppercase text-zinc-400">
              Vincular aulas importadas a um Grupo do Módulo (opcional):
            </span>
            <select
              value={selectedRootGroupId || ''}
              onChange={(e) => setSelectedRootGroupId(e.target.value || null)}
              className="bg-black border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-white focus:border-red-600 outline-none"
            >
              <option value="">Sem grupo (Raiz do Módulo)</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Barra de Navegação (Breadcrumbs do Panda) */}
        <div className="px-6 py-3 bg-black/50 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            {currentFolderId && (
              <button
                type="button"
                onClick={handleStepBack}
                disabled={loadingExplorer || submitting}
                className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-md text-xs font-bold flex items-center gap-1 mr-1 transition-colors whitespace-nowrap shrink-0 disabled:opacity-40"
              >
                <ArrowLeft size={13} />
                Voltar
              </button>
            )}

            <button
              type="button"
              onClick={() => navigateToFolder(null)}
              disabled={loadingExplorer || submitting}
              className={`px-2 py-1 rounded text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                !currentFolderId
                  ? 'bg-red-600/20 text-red-400 border border-red-500/30'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              Raiz Panda
            </button>

            {breadcrumbs.map((crumb, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <React.Fragment key={crumb.id}>
                  <ChevronRight size={14} className="text-zinc-600 shrink-0" />
                  <button
                    type="button"
                    onClick={() => !isLast && navigateToFolder(crumb.id)}
                    disabled={isLast || loadingExplorer || submitting}
                    className={`px-2 py-1 rounded text-xs font-bold truncate max-w-[220px] hover:max-w-none transition-colors ${
                      isLast
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 cursor-default'
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                    }`}
                    title={crumb.name}
                  >
                    {crumb.name}
                  </button>
                </React.Fragment>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => navigateToFolder(currentFolderId)}
            disabled={loadingExplorer || submitting}
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors shrink-0"
            title="Atualizar listagem do Panda Vídeo"
          >
            <RefreshCw size={15} className={loadingExplorer ? 'animate-spin text-emerald-400' : ''} />
          </button>
        </div>

        {/* Corpo Principal Rolável */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
          {loadingExplorer || loadingExisting ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Consultando pastas e vídeos no Panda Vídeo...
              </p>
            </div>
          ) : (
            <>
              {/* Seção 1: Subpastas da pasta atual */}
              {pandaFolders.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                      <FolderOpen size={14} className="text-yellow-500" />
                      {currentFolderId ? 'Subpastas dentro desta pasta' : 'Pastas na Raiz do Panda'}{' '}
                      <span className="tabular-nums text-zinc-500">
                        ({filteredPandaFolders.length}
                        {folderFilter.trim() ? ` de ${pandaFolders.length}` : ''})
                      </span>
                    </span>

                    <div className="flex flex-wrap items-center gap-2">
                      {currentFolderId && entries.length > 0 && (
                        <span className="text-[10px] text-amber-400/90 bg-amber-950/30 border border-amber-800/40 px-2.5 py-0.5 rounded font-semibold flex items-center gap-1">
                          <AlertTriangle size={11} className="shrink-0" />
                          Vídeos de subpastas não entram neste lote (clique na subpasta para abri-la)
                        </span>
                      )}

                      {pandaFolders.length > 9 && (
                        <div className="relative">
                          <Search
                            size={12}
                            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
                          />
                          <input
                            type="text"
                            value={folderFilter}
                            onChange={(e) => setFolderFilter(e.target.value)}
                            placeholder="Filtrar pastas..."
                            className="bg-black border border-zinc-800 focus:border-yellow-500/60 rounded-md pl-7 pr-2.5 py-1 text-[11px] text-white placeholder:text-zinc-600 outline-none w-44 sm:w-56 transition-colors"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {filteredPandaFolders.length === 0 ? (
                    <div className="text-center py-6 border border-dashed border-zinc-800 rounded-lg bg-black/20">
                      <p className="text-zinc-500 text-xs font-semibold">
                        Nenhuma pasta encontrada para &ldquo;{folderFilter}&rdquo;.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {filteredPandaFolders.map((folder) => (
                        <div key={folder.id} className="relative h-11">
                          <button
                            type="button"
                            onClick={() => navigateToFolder(folder.id)}
                            title={folder.name}
                            className="w-full h-11 hover:h-auto hover:min-h-11 hover:absolute hover:inset-x-0 hover:top-0 hover:z-40 flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-lg bg-zinc-900/70 hover:bg-zinc-900 border border-zinc-800 hover:border-yellow-500/70 hover:shadow-[0_12px_28px_rgba(0,0,0,0.92)] text-left transition-colors group"
                          >
                            <div className="flex items-start gap-2.5 min-w-0 flex-1">
                              <Folder
                                size={17}
                                className="text-yellow-500 shrink-0 mt-0.5 group-hover:scale-105 transition-transform"
                                fill="currentColor"
                              />
                              <span className="text-xs font-bold text-zinc-200 group-hover:text-white overflow-hidden text-ellipsis whitespace-nowrap group-hover:overflow-visible group-hover:whitespace-normal group-hover:break-words leading-snug">
                                {folder.name}
                              </span>
                            </div>
                            <ChevronRight
                              size={15}
                              className="text-zinc-600 group-hover:text-yellow-400 shrink-0"
                            />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Seção 2: Vídeos diretos da pasta selecionada */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-zinc-800/80">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
                      <PlayCircle size={15} className="text-red-500" />
                      Vídeos diretos nesta pasta
                      <span className="px-2 py-0.5 bg-zinc-800 text-zinc-300 rounded text-[10px] font-bold tabular-nums">
                        {entries.length}
                      </span>
                    </h3>

                    {alreadyRegisteredCount > 0 && (
                      <span className="px-2 py-0.5 bg-emerald-950/40 border border-emerald-800/50 text-emerald-300 rounded text-[10px] font-bold tabular-nums">
                        {alreadyRegisteredCount} já cadastrado(s)
                      </span>
                    )}
                  </div>

                  {entries.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold uppercase text-zinc-500">Sequência:</span>
                        <select
                          value={sortMode}
                          onChange={(e) => handleSortModeChange(e.target.value as SortMode)}
                          className="bg-black border border-zinc-700 rounded px-2.5 py-1 text-[11px] font-semibold text-zinc-200 focus:border-red-600 outline-none"
                        >
                          <option value="natural_asc">Nome (01, 02... 10)</option>
                          <option value="created_asc">Criação no Panda (Antigos → Novos)</option>
                          <option value="created_desc">Criação no Panda (Novos → Antigos)</option>
                          <option value="natural_desc">Nome (Z → A)</option>
                        </select>
                      </div>

                      {hasFileExtensionsInTitles && (
                        <button
                          type="button"
                          onClick={handleCleanExtensions}
                          className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded text-[10px] font-bold uppercase flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
                          title="Remove .mp4, .mov, etc. do final do nome das aulas"
                        >
                          <Sparkles size={11} className="text-amber-400" />
                          Limpar .mp4
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {entries.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-zinc-800 rounded-xl bg-black/30 px-4">
                    <PlayCircle size={32} className="text-zinc-600 mx-auto mb-2" />
                    <p className="text-zinc-300 font-bold text-xs uppercase">
                      Nenhum vídeo solto encontrado diretamente nesta pasta
                    </p>
                    <p className="text-zinc-500 text-[11px] mt-1">
                      {pandaFolders.length > 0
                        ? 'Clique em uma das pastas acima para visualizar e importar os vídeos contidos nela.'
                        : 'Selecione outra pasta no caminho acima para buscar vídeos.'}
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Barra de seleção rápida */}
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-zinc-900/50 border border-zinc-800/80 px-3.5 py-2 rounded-lg">
                      <div className="flex flex-wrap items-center gap-2">
                        {alreadyRegisteredCount > 0 && (
                          <button
                            type="button"
                            onClick={handleSelectOnlyNew}
                            className="px-2.5 py-1 bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/30 text-emerald-300 rounded text-[10px] font-bold uppercase transition-colors whitespace-nowrap shrink-0"
                          >
                            Marcar apenas novos ({newEntriesCount})
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleSelectAll}
                          className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[10px] font-bold uppercase transition-colors whitespace-nowrap shrink-0"
                        >
                          Marcar todos ({entries.length})
                        </button>
                        <button
                          type="button"
                          onClick={handleDeselectAll}
                          className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded text-[10px] font-bold uppercase transition-colors whitespace-nowrap shrink-0"
                        >
                          Desmarcar todos
                        </button>
                      </div>

                      <span className="text-[11px] font-bold text-zinc-400 tabular-nums">
                        Selecionados para criar:{' '}
                        <strong className="text-white">{selectedEntries.length}</strong> de {entries.length}
                      </span>
                    </div>

                    {/* Lista de vídeos com pré-visualização, edição de título e ajuste fino de ordem */}
                    <div className="space-y-1.5">
                      {entries.map((entry, idx) => {
                        const durationLabel = formatDuration(entry.video.length);
                        const orderPreview = entry.selected
                          ? startingOrder +
                            entries.slice(0, idx).filter((prevItem) => prevItem.selected).length
                          : null;

                        return (
                          <div
                            key={entry.video.id}
                            className={`flex items-center gap-2.5 p-2.5 rounded-lg border transition-colors ${
                              entry.selected
                                ? 'bg-zinc-900/80 border-zinc-700'
                                : 'bg-black/30 border-zinc-800/60 opacity-60'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => handleToggleEntry(idx)}
                              className="text-zinc-300 hover:text-white shrink-0"
                              title={entry.selected ? 'Desmarcar vídeo' : 'Marcar vídeo'}
                            >
                              {entry.selected ? (
                                <CheckSquare size={18} className="text-red-500" />
                              ) : (
                                <Square size={18} className="text-zinc-600" />
                              )}
                            </button>

                            <span className="w-8 text-center text-[11px] font-black tabular-nums text-zinc-500 shrink-0">
                              {orderPreview ? `#${orderPreview}` : '—'}
                            </span>

                            <div className="flex-1 min-w-0">
                              <input
                                type="text"
                                value={entry.customTitle}
                                title={entry.customTitle}
                                onChange={(e) => handleTitleChange(idx, e.target.value)}
                                className="w-full bg-black/60 border border-zinc-800 focus:border-red-600 rounded px-2.5 py-1.5 text-xs font-semibold text-white outline-none transition-colors"
                                placeholder="Título da aula..."
                              />
                            </div>

                            {durationLabel && (
                              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 bg-black/50 border border-zinc-800 rounded text-[10px] font-bold text-zinc-400 tabular-nums shrink-0">
                                <Clock size={11} />
                                {durationLabel}
                              </span>
                            )}

                            {entry.alreadyExists && (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-950/50 border border-emerald-700/40 text-emerald-300 rounded text-[10px] font-black uppercase whitespace-nowrap shrink-0"
                                title="Este vídeo do Panda já possui aula cadastrada nesta pasta"
                              >
                                <CheckCircle2 size={11} />
                                Já na pasta
                              </span>
                            )}

                            <div className="flex items-center bg-black/50 border border-zinc-800 rounded shrink-0">
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => handleMoveEntry(idx, 'up')}
                                className="p-1 text-zinc-400 hover:text-white disabled:opacity-25 transition-colors"
                                title="Subir posição no lote"
                              >
                                <ArrowUp size={13} />
                              </button>
                              <div className="w-px h-3.5 bg-zinc-800" />
                              <button
                                type="button"
                                disabled={idx === entries.length - 1}
                                onClick={() => handleMoveEntry(idx, 'down')}
                                className="p-1 text-zinc-400 hover:text-white disabled:opacity-25 transition-colors"
                                title="Descer posição no lote"
                              >
                                <ArrowDown size={13} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer com Opção de Vínculo + Progresso + Botão de Confirmação */}
        <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-900/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
          <div className="flex flex-col gap-1 min-w-0">
            {targetFolder && currentFolderId ? (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={keepFolderLinked}
                  onChange={(e) => setKeepFolderLinked(e.target.checked)}
                  disabled={submitting}
                  className="w-4 h-4 rounded border-zinc-700 bg-black text-emerald-500 focus:ring-emerald-500"
                />
                <span className="text-xs font-semibold text-zinc-300 truncate">
                  Vincular pasta <strong className="text-emerald-400">{currentFolderName}</strong> para futuras sincronizações
                </span>
              </label>
            ) : (
              <span className="text-[11px] text-zinc-500">
                Para cada vídeo marcado, será criada 1 aula com o respectivo conteúdo Panda Vídeo inserido.
              </span>
            )}

            {progressStep && (
              <span className="text-[11px] font-bold text-amber-400 flex items-center gap-1.5">
                <Loader2 size={12} className="animate-spin shrink-0" />
                {progressStep}
              </span>
            )}
          </div>

          <div className="flex items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold uppercase text-xs rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-40"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleConfirmBatch}
              disabled={submitting || selectedEntries.length === 0}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white font-black uppercase text-xs rounded-lg shadow-lg shadow-red-900/25 flex items-center gap-2 transition-all whitespace-nowrap shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Cadastrando...
                </>
              ) : (
                <>
                  <PlayCircle size={15} />
                  Cadastrar {selectedEntries.length}{' '}
                  {selectedEntries.length === 1 ? 'Aula em Lote' : 'Aulas em Lote'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
