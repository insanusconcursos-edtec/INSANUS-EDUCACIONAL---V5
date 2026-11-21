import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Video,
  FileText,
  HelpCircle,
  BookOpen,
  Sparkles,
  Plus,
  Trash2,
  Link as LinkIcon,
  Loader2,
  Check,
  Target,
  Scale,
  Zap,
  FileJson,
  Upload,
  Network,
  CheckCircle2,
  AlertCircle,
  Search,
  PlayCircle,
  Clock,
  ArrowUp,
  ArrowDown,
  Layers
} from 'lucide-react';
import {
  GuidedStudyMeta,
  GuidedStudyMetaType,
  GuidedStudyFlashcard,
  GuidedStudyInteractiveMapSummary,
  GuidedStudyVideo,
  GuidedStudyModuleLink,
  getGuidedMetaVideos,
  resolveGuidedStudyVideoUrl
} from '../../../../../../types/guidedStudy';
import { InteractiveMapData } from '../../../../../../types/interactiveMap';
import { Subject, Topic } from '../../../../../../types/curriculum';
import { pandaService } from '../../../../../../services/pandaService';
import { guidedStudyService } from '../../../../../../services/guidedStudyService';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../../../../../services/firebase';

import { MetaColorSelector } from '../../../../metas/shared/MetaColorSelector';
import { PandaVideoSelector } from '../../../../ui/PandaVideoSelector';
import { PandaVideoPlayer } from '../../../../../ui/video/PandaVideoPlayer';
import {
  buildPandaEmbedUrl,
  extractPandaIdFromEmbedUrl,
  extractPandaVideoId,
  getPandaEmbedUrl,
  PandaVideo
} from '../../../../../../utils/pandaUtils';

const DEFAULT_META_COLORS: Record<GuidedStudyMetaType, string> = {
  aula: '#3b82f6',
  material: '#f59e0b',
  questoes: '#10b981',
  lei_seca: '#a855f7',
  flashcards: '#ec4899',
  resumo: '#06b6d4',
  interactive_map: '#6366f1'
};

interface AddGuidedStudyMetaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  classId: string;
  selectedDate: string; // YYYY-MM-DD
  metaToEdit?: GuidedStudyMeta | null;
  subjects?: Subject[];
  topics?: Topic[];
  defaultOrder?: number;
}

const normalizeSearchText = (value: string): string =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const countMindmapNodes = (node: unknown): number => {
  if (!node || typeof node !== 'object') return 0;
  const record = node as { children?: unknown[] };
  let count = 1;
  if (Array.isArray(record.children)) {
    record.children.forEach(child => {
      count += countMindmapNodes(child);
    });
  }
  return count;
};

const createEmptyVideoRow = (): GuidedStudyVideo => ({
  id: `vid_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  title: '',
  link: '',
  pandaVideoId: '',
  duration: 0
});

export const AddGuidedStudyMetaModal: React.FC<AddGuidedStudyMetaModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  classId,
  selectedDate,
  metaToEdit,
  subjects = [],
  topics = [],
  defaultOrder
}) => {
  const [metaType, setMetaType] = useState<GuidedStudyMetaType>('aula');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [disciplineName, setDisciplineName] = useState('');
  const [duration, setDuration] = useState<number>(30);
  const [color, setColor] = useState<string>('#3b82f6');

  // Vínculo com módulos do Planejamento (Estudo Guiado e Presencial)
  const [linkedModules, setLinkedModules] = useState<GuidedStudyModuleLink[]>([]);
  const [moduleSearch, setModuleSearch] = useState('');
  const [showAllDisciplineModules, setShowAllDisciplineModules] = useState(false);

  // Type specific state
  const [videos, setVideos] = useState<GuidedStudyVideo[]>([createEmptyVideoRow()]);
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfName, setPdfName] = useState('');
  const [externalLink, setExternalLink] = useState('');
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [articles, setArticles] = useState('');
  const [cards, setCards] = useState<GuidedStudyFlashcard[]>([]);

  // Interactive Map (.JSON) state
  const jsonFileInputRef = useRef<HTMLInputElement>(null);
  const [isManualJson, setIsManualJson] = useState(false);
  const [isDraggingJson, setIsDraggingJson] = useState(false);
  const [jsonFileName, setJsonFileName] = useState<string>('');
  const [jsonRawText, setJsonRawText] = useState<string>('');
  const [parsedMapData, setParsedMapData] = useState<InteractiveMapData | null>(null);
  const [jsonSummary, setJsonSummary] = useState<GuidedStudyInteractiveMapSummary | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [interactiveMapUrl, setInteractiveMapUrl] = useState<string>('');
  const [hasModifiedJson, setHasModifiedJson] = useState<boolean>(false);
  const [isLoadingRemoteJson, setIsLoadingRemoteJson] = useState<boolean>(false);

  // Helpers & Feedback
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Panda Explorer & Video Preview Modal
  const [isPandaSelectorOpen, setIsPandaSelectorOpen] = useState(false);
  const [pandaTargetRowIndex, setPandaTargetRowIndex] = useState<number | null>(null);
  const [lastPandaFolderId, setLastPandaFolderId] = useState<string | null>(null);
  const [isLoadingPandaVideo, setIsLoadingPandaVideo] = useState(false);
  const [previewVideo, setPreviewVideo] = useState<{ title: string; url: string } | null>(null);

  const validateAndParseJson = (
    rawText: string,
    options: { autoFillFields?: boolean; currentTitle?: string; currentDiscipline?: string } = {}
  ): boolean => {
    const { autoFillFields = true, currentTitle = title, currentDiscipline = disciplineName } = options;

    if (!rawText || !rawText.trim()) {
      setParsedMapData(null);
      setJsonError(null);
      setJsonSummary(null);
      return false;
    }

    try {
      const parsed = JSON.parse(rawText);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('O conteúdo deve ser um objeto JSON válido.');
      }
      if (!parsed.meta || typeof parsed.meta !== 'object') {
        throw new Error("O arquivo JSON deve conter a chave obrigatória 'meta' (objeto).");
      }
      if (!parsed.mindmap || typeof parsed.mindmap !== 'object') {
        throw new Error("O arquivo JSON deve conter a chave obrigatória 'mindmap' (objeto).");
      }
      if (!parsed.mindmap.id || !parsed.mindmap.title) {
        throw new Error("A chave 'mindmap' deve conter pelo menos 'id' e 'title'.");
      }

      setParsedMapData(parsed as InteractiveMapData);
      setJsonError(null);
      setFormError(null);

      const summary: GuidedStudyInteractiveMapSummary = {
        disciplina: parsed.meta.disciplina || 'Geral',
        assunto: parsed.meta.assunto || parsed.meta.titulo || parsed.mindmap.title,
        nodeCount: countMindmapNodes(parsed.mindmap),
        matrixCount: Array.isArray(parsed.matrices) ? parsed.matrices.length : 0,
        questionCount: Array.isArray(parsed.questoes) ? parsed.questoes.length : 0,
        flashcardCount: Array.isArray(parsed.flashcards) ? parsed.flashcards.length : 0
      };
      setJsonSummary(summary);

      if (autoFillFields) {
        const suggestedTitle = parsed.meta.titulo || parsed.meta.assunto || parsed.mindmap.title;
        if (!currentTitle.trim() && suggestedTitle) {
          setTitle(String(suggestedTitle));
        }
        if (
          (!currentDiscipline.trim() || currentDiscipline === subjects[0]?.name) &&
          parsed.meta.disciplina
        ) {
          setDisciplineName(String(parsed.meta.disciplina));
        }
      }

      return true;
    } catch (err: unknown) {
      setParsedMapData(null);
      setJsonSummary(null);
      const message = err instanceof Error ? err.message : 'Formato JSON inválido.';
      setJsonError(message);
      return false;
    }
  };

  useEffect(() => {
    let cancelled = false;

    if (isOpen) {
      setFormError(null);
      setJsonError(null);
      setIsManualJson(false);
      setIsDraggingJson(false);
      setHasModifiedJson(false);
      setIsLoadingRemoteJson(false);
      setPreviewVideo(null);
      setIsPandaSelectorOpen(false);
      setPandaTargetRowIndex(null);
      setModuleSearch('');
      setShowAllDisciplineModules(false);

      if (metaToEdit) {
        const editType = metaToEdit.type || 'aula';
        setMetaType(editType);
        setTitle(metaToEdit.title || '');
        setDescription(metaToEdit.description || '');
        setDisciplineName(metaToEdit.disciplineName || '');
        setDuration(metaToEdit.duration || 30);
        setColor(metaToEdit.color || DEFAULT_META_COLORS[editType]);
        setLinkedModules(Array.isArray(metaToEdit.linkedModules) ? metaToEdit.linkedModules : []);
        const existingVideos = getGuidedMetaVideos(metaToEdit);
        setVideos(existingVideos.length > 0 ? existingVideos : [createEmptyVideoRow()]);
        setPdfUrl(metaToEdit.pdfUrl || '');
        setPdfName(metaToEdit.pdfName || '');
        setExternalLink(metaToEdit.externalLink || '');
        setQuestionCount(metaToEdit.questionCount || 10);
        setArticles(metaToEdit.articles || '');
        setCards(metaToEdit.cards || []);

        setJsonFileName(metaToEdit.interactiveMapFileName || '');
        setInteractiveMapUrl(metaToEdit.interactiveMapUrl || '');
        setJsonSummary(metaToEdit.interactiveMapSummary || null);

        if (metaToEdit.interactiveMapJson) {
          setJsonRawText(metaToEdit.interactiveMapJson);
          validateAndParseJson(metaToEdit.interactiveMapJson, {
            autoFillFields: false,
            currentTitle: metaToEdit.title || '',
            currentDiscipline: metaToEdit.disciplineName || ''
          });
        } else if (metaToEdit.interactiveMapUrl) {
          setJsonRawText('');
          setParsedMapData(null);
          setIsLoadingRemoteJson(true);
          fetch(metaToEdit.interactiveMapUrl)
            .then(res => {
              if (!res.ok) throw new Error('Falha ao baixar arquivo JSON salvo.');
              return res.text();
            })
            .then(remoteText => {
              if (cancelled) return;
              setJsonRawText(remoteText);
              validateAndParseJson(remoteText, {
                autoFillFields: false,
                currentTitle: metaToEdit.title || '',
                currentDiscipline: metaToEdit.disciplineName || ''
              });
            })
            .catch(err => {
              console.warn('Não foi possível pré-carregar o JSON remoto na edição:', err);
            })
            .finally(() => {
              if (!cancelled) setIsLoadingRemoteJson(false);
            });
        } else {
          setJsonRawText('');
          setParsedMapData(null);
        }
      } else {
        setMetaType('aula');
        setTitle('');
        setDescription('');
        setDisciplineName(subjects[0]?.name || '');
        setDuration(30);
        setColor(DEFAULT_META_COLORS['aula']);
        setLinkedModules([]);
        setVideos([createEmptyVideoRow()]);
        setPdfUrl('');
        setPdfName('');
        setExternalLink('');
        setQuestionCount(10);
        setArticles('');
        setCards([]);
        setJsonFileName('');
        setJsonRawText('');
        setParsedMapData(null);
        setJsonSummary(null);
        setInteractiveMapUrl('');
      }
    }

    return () => {
      cancelled = true;
    };
  }, [isOpen, metaToEdit, subjects]);

  const linkableModules = useMemo(() => {
    const subjectById = new Map(subjects.map(s => [s.id, s]));
    const items: Array<{
      subjectId: string;
      subjectName: string;
      topicId: string;
      topicName: string;
      topicOrder: number;
      moduleId: string;
      moduleName: string;
      isGuidedStudy: boolean;
      isOnline: boolean;
    }> = [];

    topics.forEach(topic => {
      if (topic.isSelected === false) return;
      const subject = subjectById.get(topic.subjectId);
      const subjectName = subject?.name || 'Disciplina';
      (topic.modules || []).forEach(mod => {
        if (mod.isSelected === false) return;
        // Permite vincular em módulos de Estudo Guiado e módulos Presenciais
        if (mod.isOnline) return;
        items.push({
          subjectId: topic.subjectId,
          subjectName,
          topicId: topic.id,
          topicName: topic.name || 'Assunto',
          topicOrder: topic.order || 0,
          moduleId: mod.id,
          moduleName: mod.name || 'Módulo',
          isGuidedStudy: Boolean(mod.isGuidedStudy),
          isOnline: Boolean(mod.isOnline)
        });
      });
    });

    items.sort((a, b) => {
      if (a.isGuidedStudy !== b.isGuidedStudy) return a.isGuidedStudy ? -1 : 1;
      const subjCmp = a.subjectName.localeCompare(b.subjectName);
      if (subjCmp !== 0) return subjCmp;
      if (a.topicOrder !== b.topicOrder) return a.topicOrder - b.topicOrder;
      return a.moduleName.localeCompare(b.moduleName);
    });

    return items;
  }, [subjects, topics]);

  const normalizedDisciplineFilter = useMemo(
    () => normalizeSearchText(disciplineName),
    [disciplineName]
  );

  const hasDisciplineMatch = useMemo(() => {
    if (!normalizedDisciplineFilter) return false;
    return linkableModules.some(
      item => normalizeSearchText(item.subjectName) === normalizedDisciplineFilter
    );
  }, [linkableModules, normalizedDisciplineFilter]);

  const filteredLinkableModules = useMemo(() => {
    const query = normalizeSearchText(moduleSearch);
    return linkableModules.filter(item => {
      if (!showAllDisciplineModules && hasDisciplineMatch && !query) {
        if (normalizeSearchText(item.subjectName) !== normalizedDisciplineFilter) {
          return false;
        }
      }
      if (!query) return true;
      return (
        normalizeSearchText(item.moduleName).includes(query) ||
        normalizeSearchText(item.topicName).includes(query) ||
        normalizeSearchText(item.subjectName).includes(query)
      );
    });
  }, [
    linkableModules,
    moduleSearch,
    showAllDisciplineModules,
    hasDisciplineMatch,
    normalizedDisciplineFilter
  ]);

  const linkedModuleIdSet = useMemo(
    () => new Set(linkedModules.map(link => link.moduleId)),
    [linkedModules]
  );

  const handleToggleLinkedModule = (item: {
    subjectId: string;
    subjectName: string;
    topicId: string;
    topicName: string;
    moduleId: string;
    moduleName: string;
  }) => {
    setLinkedModules(prev => {
      const exists = prev.some(link => link.moduleId === item.moduleId);
      if (exists) {
        return prev.filter(link => link.moduleId !== item.moduleId);
      }
      return [
        ...prev,
        {
          subjectId: item.subjectId,
          topicId: item.topicId,
          moduleId: item.moduleId,
          subjectName: item.subjectName,
          topicName: item.topicName,
          moduleName: item.moduleName
        }
      ];
    });
  };

  const totalVideosDuration = videos.reduce(
    (acc, v) => acc + Math.max(0, Math.round(Number(v.duration) || 0)),
    0
  );
  const linkedVideosCount = videos.filter(
    v => Boolean(v.link.trim() || v.pandaVideoId?.trim())
  ).length;
  const isDurationAutoCalculated = metaType === 'aula' && totalVideosDuration > 0;

  useEffect(() => {
    if (metaType === 'aula' && totalVideosDuration > 0) {
      setDuration(totalVideosDuration);
    }
  }, [metaType, totalVideosDuration]);

  const handleMetaTypeChange = (newType: GuidedStudyMetaType) => {
    setMetaType(newType);
    setFormError(null);
    if (!metaToEdit?.color) {
      setColor(DEFAULT_META_COLORS[newType]);
    }
  };

  const processJsonFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.json') && file.type !== 'application/json') {
      setJsonError('Selecione um arquivo válido com extensão .JSON.');
      return;
    }

    setJsonFileName(file.name);
    setHasModifiedJson(true);

    const reader = new FileReader();
    reader.onload = event => {
      const contentText = String(event.target?.result || '');
      setJsonRawText(contentText);
      validateAndParseJson(contentText, {
        autoFillFields: true,
        currentTitle: title,
        currentDiscipline: disciplineName
      });
    };
    reader.onerror = () => {
      setJsonError('Não foi possível ler o arquivo .JSON selecionado.');
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleJsonFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processJsonFile(file);
    }
    if (e.target) {
      e.target.value = '';
    }
  };

  const handleClearJson = () => {
    setJsonFileName('');
    setJsonRawText('');
    setParsedMapData(null);
    setJsonSummary(null);
    setJsonError(null);
    setInteractiveMapUrl('');
    setHasModifiedJson(true);
  };

  const handleAddVideoRow = () => {
    setVideos(prev => [...prev, createEmptyVideoRow()]);
  };

  const handleRemoveVideoRow = (indexToRemove: number) => {
    setVideos(prev => {
      if (prev.length <= 1) {
        return [createEmptyVideoRow()];
      }
      return prev.filter((_, idx) => idx !== indexToRemove);
    });
  };

  const handleUpdateVideoField = (
    index: number,
    field: 'title' | 'link' | 'pandaVideoId' | 'duration',
    value: string | number
  ) => {
    setVideos(prev =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        if (field === 'duration') {
          const parsed = Math.max(0, Math.round(Number(value) || 0));
          return { ...item, duration: parsed };
        }
        if (field === 'link') {
          const strVal = String(value);
          const extractedId = extractPandaIdFromEmbedUrl(strVal);
          return {
            ...item,
            link: strVal,
            pandaVideoId: extractedId || item.pandaVideoId || ''
          };
        }
        return { ...item, [field]: String(value) };
      })
    );
  };

  const handleMoveVideoRow = (index: number, direction: -1 | 1) => {
    setVideos(prev => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      const temp = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = temp;
      return next;
    });
  };

  const openPandaSelectorForRow = (rowIndex: number | null) => {
    setPandaTargetRowIndex(rowIndex);
    setIsPandaSelectorOpen(true);
  };

  const handlePandaVideoSelect = async (videoData: PandaVideo) => {
    try {
      setIsLoadingPandaVideo(true);
      setFormError(null);

      let videoDetails: PandaVideo = videoData;
      try {
        const fetched = await pandaService.getVideoDetails(videoData.id);
        if (fetched) videoDetails = fetched;
      } catch (detailErr) {
        console.warn('Falha ao buscar detalhes do vídeo no Panda, usando dados básicos:', detailErr);
      }

      const playbackId = extractPandaVideoId(videoDetails);
      const embedUrl = playbackId
        ? getPandaEmbedUrl(videoDetails, playbackId)
        : (videoDetails.video_player as string) ||
          (videoDetails.video_player_url as string) ||
          buildPandaEmbedUrl(videoData.id);

      const rawSeconds = Number(
        videoDetails.length || videoDetails.duration || videoData.length || videoData.duration || 0
      );
      const durationMinutes = rawSeconds > 0 ? Math.max(1, Math.round(rawSeconds / 60)) : 0;

      const folderId = videoDetails.folder_id || videoData.folder_id;
      if (folderId && typeof folderId === 'string') {
        setLastPandaFolderId(folderId);
      }

      const resolvedTitle = String(videoData.title || videoDetails.title || '').trim();
      const resolvedPandaId = String(playbackId || videoData.id || '').trim();

      setVideos(prev => {
        const next = [...prev];

        if (pandaTargetRowIndex !== null && pandaTargetRowIndex >= 0 && pandaTargetRowIndex < next.length) {
          next[pandaTargetRowIndex] = {
            ...next[pandaTargetRowIndex],
            title: resolvedTitle || next[pandaTargetRowIndex].title || `Aula ${pandaTargetRowIndex + 1}`,
            link: embedUrl,
            pandaVideoId: resolvedPandaId,
            duration: durationMinutes
          };
          return next;
        }

        const firstEmptyIdx = next.findIndex(
          row => !row.link.trim() && !row.pandaVideoId?.trim() && !row.title.trim()
        );
        if (firstEmptyIdx !== -1) {
          next[firstEmptyIdx] = {
            ...next[firstEmptyIdx],
            title: resolvedTitle || `Aula ${firstEmptyIdx + 1}`,
            link: embedUrl,
            pandaVideoId: resolvedPandaId,
            duration: durationMinutes
          };
          return next;
        }

        next.push({
          id: createEmptyVideoRow().id,
          title: resolvedTitle || `Aula ${next.length + 1}`,
          link: embedUrl,
          pandaVideoId: resolvedPandaId,
          duration: durationMinutes
        });
        return next;
      });

      if (!title.trim() && resolvedTitle) {
        setTitle(resolvedTitle);
      }

      setIsPandaSelectorOpen(false);
      setPandaTargetRowIndex(null);
    } catch (err) {
      console.error('Erro ao selecionar vídeo do Panda:', err);
      setFormError('Erro ao carregar os detalhes do vídeo do Panda.');
    } finally {
      setIsLoadingPandaVideo(false);
    }
  };

  if (!isOpen) return null;

  const uploadFileToAuthorizedStorage = async (
    blobOrFile: Blob | File,
    candidatePaths: string[],
    contentType?: string
  ): Promise<string> => {
    let lastError: unknown = null;
    for (const path of candidatePaths) {
      try {
        const storageRef = ref(storage, path);
        await uploadBytes(
          storageRef,
          blobOrFile,
          contentType ? { contentType } : undefined
        );
        return await getDownloadURL(storageRef);
      } catch (err: unknown) {
        lastError = err;
        const code = (err as { code?: string })?.code || '';
        if (code !== 'storage/unauthorized' && code !== 'storage/permission-denied') {
          throw err;
        }
      }
    }
    throw lastError;
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploadingPdf(true);
      setFormError(null);
      const timestamp = Date.now();
      const safeFileName = file.name.replace(/[/\\#?]/g, '_');
      // Prioriza caminhos já autorizados nas regras do Firebase Storage (padrão course_pdfs / class-materials / plans)
      const url = await uploadFileToAuthorizedStorage(
        file,
        [
          `course_pdfs/guided_${classId}_${timestamp}_${safeFileName}`,
          `class-materials/modules/guided_${classId}_${timestamp}_${safeFileName}`,
          `plans/${classId}/materials/${timestamp}_${safeFileName}`
        ],
        file.type || 'application/pdf'
      );
      setPdfUrl(url);
      setPdfName(file.name);
    } catch (err) {
      console.error('Erro ao fazer upload do PDF:', err);
      setFormError('Erro ao enviar o PDF. Tente novamente.');
    } finally {
      setIsUploadingPdf(false);
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const handleAddFlashcard = () => {
    setCards(prev => [...prev, { id: 'card_' + Date.now(), front: '', back: '' }]);
  };

  const handleRemoveFlashcard = (id: string) => {
    setCards(prev => prev.filter(c => c.id !== id));
  };

  const handleUpdateFlashcard = (id: string, field: 'front' | 'back', value: string) => {
    setCards(prev => prev.map(c => (c.id === id ? { ...c, [field]: value } : c)));
  };

  const handleGenerateFlashcardsAi = async () => {
    if (!title && !disciplineName) {
      setFormError('Informe o título da meta ou a disciplina para gerar os flashcards com IA.');
      return;
    }

    try {
      setIsGeneratingAi(true);
      setFormError(null);
      const promptText = `Gere 5 pares de flashcards de estudo sobre o tópico: "${title || disciplineName}". Descrição: ${description || 'Sem descrição'}. Responda estritamente em JSON no formato: [{"front": "Pergunta ou conceito", "back": "Resposta ou explicação curta"}]`;

      const response = await fetch('/api/generate-mindmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptText })
      }).catch(() => null);

      let generatedList: GuidedStudyFlashcard[] = [];
      if (response && response.ok) {
        const data = await response.json();
        if (Array.isArray(data.nodes)) {
          generatedList = data.nodes.slice(0, 5).map((n: { label?: string; notes?: { text?: string }[]; description?: string }, idx: number) => ({
            id: 'ai_' + Date.now() + '_' + idx,
            front: n.label || `Conceito ${idx + 1}`,
            back: n.notes?.[0]?.text || n.description || 'Explicação do conceito.'
          }));
        }
      }

      if (generatedList.length === 0) {
        generatedList = [
          {
            id: 'ai_1_' + Date.now(),
            front: `O que é fundamental revisar sobre ${title || 'este tema'}?`,
            back: 'Pontos-chave e conceitos fundamentais cobrados em bancas de concursos.'
          },
          {
            id: 'ai_2_' + Date.now(),
            front: `Qual a principal regra aplicável a ${title || 'este assunto'}?`,
            back: 'Consulte os requisitos legais e doutrinários inerentes ao tema.'
          },
          {
            id: 'ai_3_' + Date.now(),
            front: 'Qual exceção costuma ser cobrada pelas bancas?',
            back: 'Exceções expressas e prazos específicos descritos no material de apoio.'
          }
        ];
      }

      setCards(prev => [...prev, ...generatedList]);
    } catch (err) {
      console.error('Erro na IA de Flashcards:', err);
      setFormError('Não foi possível gerar via IA no momento. Adicione os flashcards manualmente.');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const hasValidExistingRemoteMap =
    metaType === 'interactive_map' && !hasModifiedJson && Boolean(interactiveMapUrl) && !jsonError;

  const isJsonMetaInvalid =
    metaType === 'interactive_map' &&
    (Boolean(jsonError) || isLoadingRemoteJson || (!parsedMapData && !hasValidExistingRemoteMap));

  const handleSave = async () => {
    setFormError(null);

    if (!title.trim()) {
      setFormError('Por favor, informe o título da meta.');
      return;
    }

    if (metaType === 'interactive_map') {
      if (jsonError) {
        setFormError('Corrija os erros do arquivo .JSON antes de salvar a meta.');
        return;
      }
      if (!parsedMapData && !hasValidExistingRemoteMap) {
        setFormError('Envie ou cole um arquivo .JSON válido contendo o mapa mental e conteúdos.');
        return;
      }
    }

    try {
      setIsSaving(true);

      let finalInteractiveMapJson: string | null = null;
      let finalInteractiveMapUrl: string | null = null;
      let finalInteractiveMapFileName: string | null = null;
      let finalInteractiveMapSummary: GuidedStudyInteractiveMapSummary | null = null;

      if (metaType === 'interactive_map') {
        if (parsedMapData) {
          const serializedJson = JSON.stringify(parsedMapData);
          const byteSize = new Blob([serializedJson]).size;
          const safeFileName = (jsonFileName || `${title.trim()}.json`).replace(/[^a-zA-Z0-9._-]/g, '_');

          finalInteractiveMapFileName = jsonFileName || `${title.trim()}.json`;
          finalInteractiveMapSummary = jsonSummary;

          let resolvedUrl = !hasModifiedJson && interactiveMapUrl ? interactiveMapUrl : '';

          if (!resolvedUrl || hasModifiedJson) {
            try {
              const jsonBlob = new Blob([serializedJson], { type: 'application/json' });
              const timestamp = Date.now();
              resolvedUrl = await uploadFileToAuthorizedStorage(
                jsonBlob,
                [
                  `course_pdfs/guided_map_${classId}_${timestamp}_${safeFileName}`,
                  `class-materials/modules/guided_map_${classId}_${timestamp}_${safeFileName}`,
                  `plans/${classId}/materials/${timestamp}_${safeFileName}`
                ],
                'application/json'
              );
            } catch (storageErr) {
              console.warn('Falha no upload do JSON para o Storage, utilizando persistência direta:', storageErr);
              if (byteSize > 900_000) {
                throw new Error(
                  'O arquivo .JSON excede 900 KB e não pôde ser enviado ao armazenamento em nuvem. Verifique sua conexão e tente novamente.'
                );
              }
            }
          }

          finalInteractiveMapUrl = resolvedUrl || null;
          // Armazena inline no Firestore até 750 KB para abertura instantânea (ou até 900 KB se não houver URL)
          finalInteractiveMapJson =
            byteSize <= 750_000 || !finalInteractiveMapUrl ? serializedJson : null;
        } else if (hasValidExistingRemoteMap) {
          finalInteractiveMapJson = metaToEdit?.interactiveMapJson || null;
          finalInteractiveMapUrl = interactiveMapUrl;
          finalInteractiveMapFileName = jsonFileName || metaToEdit?.interactiveMapFileName || null;
          finalInteractiveMapSummary = jsonSummary || metaToEdit?.interactiveMapSummary || null;
        }
      }

      const sanitizedVideos: GuidedStudyVideo[] =
        metaType === 'aula'
          ? videos
              .map((v, idx) => {
                const rawLink = (v.link || '').trim();
                const rawPandaId = (v.pandaVideoId || '').trim();
                if (!rawLink && !rawPandaId) return null;

                const resolvedLink = resolveGuidedStudyVideoUrl(rawLink, rawPandaId);
                const extractedId =
                  rawPandaId ||
                  extractPandaIdFromEmbedUrl(resolvedLink) ||
                  (!/^https?:\/\//i.test(rawLink) && !rawLink.startsWith('//') ? rawLink : '');

                return {
                  id: v.id || `vid_${Date.now()}_${idx}`,
                  title: (v.title || '').trim() || `Aula ${idx + 1}`,
                  link: resolvedLink,
                  pandaVideoId: extractedId,
                  duration: Math.max(0, Math.round(Number(v.duration) || 0))
                } as GuidedStudyVideo;
              })
              .filter((v): v is GuidedStudyVideo => v !== null)
          : [];

      const summedVideoMinutes = sanitizedVideos.reduce((acc, v) => acc + v.duration, 0);
      const finalDuration =
        metaType === 'aula' && summedVideoMinutes > 0
          ? summedVideoMinutes
          : Math.max(1, Math.round(Number(duration) || 30));

      const resolvedOrder =
        typeof metaToEdit?.order === 'number' && Number.isFinite(metaToEdit.order)
          ? metaToEdit.order
          : typeof defaultOrder === 'number' && Number.isFinite(defaultOrder)
            ? defaultOrder
            : undefined;

      const sanitizedLinkedModules: GuidedStudyModuleLink[] = linkedModules
        .filter(link => Boolean(link.moduleId && link.topicId && link.subjectId))
        .map(link => ({
          subjectId: String(link.subjectId),
          topicId: String(link.topicId),
          moduleId: String(link.moduleId),
          subjectName: String(link.subjectName || ''),
          topicName: String(link.topicName || ''),
          moduleName: String(link.moduleName || '')
        }));

      const payload: GuidedStudyMeta = {
        id: metaToEdit?.id,
        classId,
        date: selectedDate,
        type: metaType,
        title: title.trim(),
        description: description.trim(),
        disciplineName: disciplineName.trim(),
        duration: finalDuration,
        order: resolvedOrder,
        color,
        linkedModules: sanitizedLinkedModules,
        videos: sanitizedVideos,
        pandaVideoUrl: sanitizedVideos[0]?.link || '',
        pandaVideoId: sanitizedVideos[0]?.pandaVideoId || '',
        pdfUrl,
        pdfName,
        externalLink,
        questionCount:
          metaType === 'interactive_map' && finalInteractiveMapSummary
            ? finalInteractiveMapSummary.questionCount
            : Number(questionCount) || 0,
        articles,
        cards,
        interactiveMapJson: finalInteractiveMapJson,
        interactiveMapUrl: finalInteractiveMapUrl,
        interactiveMapFileName: finalInteractiveMapFileName,
        interactiveMapSummary: finalInteractiveMapSummary
      };

      await guidedStudyService.saveMeta(payload);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      console.error('Erro ao salvar meta de estudo guiado:', err);
      const errMsg = err instanceof Error ? err.message : 'Erro ao salvar meta. Tente novamente.';
      setFormError(errMsg);
    } finally {
      setIsSaving(false);
    }
  };

  const META_TYPES: {
    id: GuidedStudyMetaType;
    label: string;
    subtitle?: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    fullWidth?: boolean;
  }[] = [
    { id: 'aula', label: 'Meta de Aula', icon: Video, color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
    { id: 'material', label: 'Material (PDF)', icon: FileText, color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
    { id: 'questoes', label: 'Questões', icon: HelpCircle, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
    { id: 'lei_seca', label: 'Lei Seca', icon: Scale, color: 'text-purple-400 bg-purple-500/10 border-purple-500/30' },
    { id: 'flashcards', label: 'Flashcards (IA)', icon: Zap, color: 'text-pink-400 bg-pink-500/10 border-pink-500/30' },
    { id: 'resumo', label: 'Resumo', icon: BookOpen, color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30' },
    {
      id: 'interactive_map',
      label: 'Mapa / Revisão (.JSON)',
      subtitle: 'Mapas Mentais, Quadros & Lousa, Questões e Flashcards interativos',
      icon: FileJson,
      color: 'text-indigo-300 bg-indigo-500/15 border-indigo-500/40',
      fullWidth: true
    }
  ];

  const modalNode = (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {metaToEdit ? 'Editar Meta do Estudo Guiado' : 'Nova Meta do Estudo Guiado'}
              </h2>
              <p className="text-xs text-zinc-400 tabular-nums">
                Data programada: <strong className="text-amber-400">{selectedDate}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          
          {formError && (
            <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs flex items-start gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* Seletor de Tipo de Meta */}
          <div>
            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">
              Tipo de Meta
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {META_TYPES.map(t => {
                const Icon = t.icon;
                const isSelected = metaType === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleMetaTypeChange(t.id)}
                    className={`
                      flex items-center justify-between gap-3 p-3 rounded-xl border text-left transition-all
                      ${t.fullWidth ? 'col-span-2 sm:col-span-3' : ''}
                      ${isSelected 
                        ? `${t.color} font-bold ring-1 ring-amber-500/50` 
                        : 'bg-zinc-800/40 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-white'}
                    `}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon className="w-4 h-4 shrink-0" />
                      <div className="min-w-0">
                        <span className="text-xs block truncate">{t.label}</span>
                        {t.subtitle && (
                          <span className="text-[11px] font-normal text-zinc-400 block truncate mt-0.5">
                            {t.subtitle}
                          </span>
                        )}
                      </div>
                    </div>
                    {t.fullWidth && (
                      <span className="text-[10px] font-semibold text-indigo-300/90 hidden sm:inline shrink-0">
                        Upload .JSON
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Color Selector */}
          <div className="bg-zinc-950/40 p-4 rounded-xl border border-zinc-800/60">
            <MetaColorSelector color={color} onChange={setColor} />
          </div>

          {/* MAPA / REVISÃO (.JSON): Upload, Validação e Resumo Estruturado (posicionado logo acima ou junto aos dados para auto-preencher título/disciplina!) */}
          {metaType === 'interactive_map' && (
            <div className="bg-zinc-950/60 border border-zinc-800 p-5 rounded-xl space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-indigo-400">
                  <Network className="w-4 h-4 shrink-0" />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Arquivo Estruturado da Meta (.JSON)
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {(parsedMapData || jsonRawText || interactiveMapUrl) && (
                    <button
                      type="button"
                      onClick={handleClearJson}
                      className="text-[11px] font-semibold text-zinc-400 hover:text-red-400 transition-colors"
                    >
                      Limpar arquivo
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsManualJson(prev => !prev)}
                    className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 underline transition-colors"
                  >
                    {isManualJson ? 'Carregar via Arquivo .JSON' : 'Ou colar JSON manualmente'}
                  </button>
                </div>
              </div>

              {isLoadingRemoteJson ? (
                <div className="border border-zinc-800 rounded-xl p-6 flex items-center justify-center gap-2.5 bg-zinc-900/50 text-xs text-zinc-300">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                  <span>Carregando estrutura .JSON vinculada...</span>
                </div>
              ) : !isManualJson ? (
                <div
                  onDragOver={e => {
                    e.preventDefault();
                    setIsDraggingJson(true);
                  }}
                  onDragLeave={e => {
                    e.preventDefault();
                    setIsDraggingJson(false);
                  }}
                  onDrop={e => {
                    e.preventDefault();
                    setIsDraggingJson(false);
                    const droppedFile = e.dataTransfer.files?.[0];
                    if (droppedFile) {
                      processJsonFile(droppedFile);
                    }
                  }}
                  className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center transition-colors ${
                    isDraggingJson
                      ? 'border-indigo-400 bg-indigo-950/30'
                      : 'border-zinc-700 hover:border-indigo-500/50 bg-zinc-900/50'
                  }`}
                >
                  <input
                    type="file"
                    ref={jsonFileInputRef}
                    accept=".json,application/json"
                    onChange={handleJsonFileSelect}
                    className="hidden"
                  />
                  <FileJson className="w-9 h-9 text-indigo-400/70 mb-2.5" />
                  <button
                    type="button"
                    onClick={() => jsonFileInputRef.current?.click()}
                    className="px-4 py-2 bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-200 border border-indigo-500/40 rounded-lg text-xs font-bold uppercase mb-2 flex items-center gap-2 transition-all whitespace-nowrap"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{parsedMapData || interactiveMapUrl ? 'Trocar Arquivo .JSON' : 'Selecionar Arquivo .JSON'}</span>
                  </button>

                  {jsonFileName ? (
                    <span className="text-emerald-400 text-xs font-bold flex items-center gap-1.5 mt-0.5">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate max-w-md">{jsonFileName}</span>
                    </span>
                  ) : parsedMapData || interactiveMapUrl ? (
                    <span className="text-indigo-300 text-xs font-bold flex items-center gap-1.5 mt-0.5">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Mapa estruturado carregado</span>
                    </span>
                  ) : (
                    <span className="text-zinc-500 text-xs">
                      Arraste e solte ou selecione o arquivo .json com mapas mentais, quadros, questões e flashcards
                    </span>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase">
                    Cole o código JSON completo:
                  </label>
                  <textarea
                    value={jsonRawText}
                    onChange={e => {
                      const val = e.target.value;
                      setJsonRawText(val);
                      setHasModifiedJson(true);
                      validateAndParseJson(val, {
                        autoFillFields: true,
                        currentTitle: title,
                        currentDiscipline: disciplineName
                      });
                    }}
                    className="w-full h-44 bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-indigo-200 focus:border-indigo-500 focus:outline-none font-mono text-xs"
                    placeholder='{ "meta": { "disciplina": "Direito Constitucional", "assunto": "..." }, "mindmap": { "id": "raiz", "title": "..." } }'
                  />
                </div>
              )}

              {jsonError && (
                <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-800/60 text-red-300 text-xs flex items-start gap-2.5 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block font-bold text-red-200 uppercase text-[10px] tracking-wider mb-0.5">
                      JSON Inválido (Bloqueado para Salvar)
                    </strong>
                    <p className="leading-relaxed">{jsonError}</p>
                  </div>
                </div>
              )}

              {jsonSummary && !jsonError && (
                <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-800/40 space-y-3 animate-in fade-in">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span className="text-[11px] font-bold uppercase tracking-wider">
                      Resumo da Estrutura Carregada
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs tabular-nums">
                    <div className="p-2.5 rounded-lg bg-zinc-900/80 border border-emerald-900/40">
                      <span className="text-[10px] text-zinc-400 block font-semibold uppercase">Disciplina</span>
                      <strong className="text-emerald-300 font-bold truncate block" title={jsonSummary.disciplina}>
                        {jsonSummary.disciplina}
                      </strong>
                    </div>
                    <div className="p-2.5 rounded-lg bg-zinc-900/80 border border-emerald-900/40">
                      <span className="text-[10px] text-zinc-400 block font-semibold uppercase">Assunto / Tema</span>
                      <strong className="text-emerald-300 font-bold truncate block" title={jsonSummary.assunto}>
                        {jsonSummary.assunto}
                      </strong>
                    </div>
                    <div className="p-2.5 rounded-lg bg-zinc-900/80 border border-emerald-900/40">
                      <span className="text-[10px] text-zinc-400 block font-semibold uppercase">Nós do Mapa</span>
                      <strong className="text-emerald-300 font-bold block">{jsonSummary.nodeCount} nós</strong>
                    </div>
                    <div className="p-2.5 rounded-lg bg-zinc-900/80 border border-emerald-900/40">
                      <span className="text-[10px] text-zinc-400 block font-semibold uppercase">Quadros & Lousa</span>
                      <strong className="text-emerald-300 font-bold block">{jsonSummary.matrixCount} quadros</strong>
                    </div>
                    <div className="p-2.5 rounded-lg bg-zinc-900/80 border border-emerald-900/40">
                      <span className="text-[10px] text-zinc-400 block font-semibold uppercase">Questões</span>
                      <strong className="text-emerald-300 font-bold block">{jsonSummary.questionCount} questões</strong>
                    </div>
                    <div className="p-2.5 rounded-lg bg-zinc-900/80 border border-emerald-900/40">
                      <span className="text-[10px] text-zinc-400 block font-semibold uppercase">Flashcards</span>
                      <strong className="text-emerald-300 font-bold block">{jsonSummary.flashcardCount} cards</strong>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Dados Principais */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                Título da Meta *
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={
                  metaType === 'interactive_map'
                    ? 'Ex: Revisão Interativa - Direitos e Garantias Fundamentais'
                    : 'Ex: Videoaula - Crimes Contra a Pessoa'
                }
                className="w-full bg-zinc-800/60 border border-zinc-700/80 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                Disciplina
              </label>
              <input
                type="text"
                value={disciplineName}
                onChange={e => setDisciplineName(e.target.value)}
                placeholder="Ex: Direito Penal"
                list="subjects-list"
                className="w-full bg-zinc-800/60 border border-zinc-700/80 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
              />
              <datalist id="subjects-list">
                {subjects.map(s => (
                  <option key={s.id} value={s.name} />
                ))}
              </datalist>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider">
                  Tempo Estimado (minutos)
                </label>
                {isDurationAutoCalculated && (
                  <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Soma automática
                  </span>
                )}
              </div>
              <input
                type="number"
                min={1}
                value={isDurationAutoCalculated ? totalVideosDuration : duration}
                readOnly={isDurationAutoCalculated}
                onChange={e => {
                  if (!isDurationAutoCalculated) {
                    setDuration(Number(e.target.value));
                  }
                }}
                className={`w-full border rounded-xl px-4 py-2.5 text-sm tabular-nums focus:outline-none ${
                  isDurationAutoCalculated
                    ? 'bg-blue-950/20 border-blue-500/30 text-blue-200 font-bold cursor-default'
                    : 'bg-zinc-800/60 border-zinc-700/80 text-white focus:border-amber-500'
                }`}
              />
              {isDurationAutoCalculated && (
                <p className="text-[11px] text-zinc-400 mt-1 tabular-nums">
                  Calculado automaticamente pela soma das videoaulas ({totalVideosDuration} min).
                </p>
              )}
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                Descrição / Orientação de Estudo
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Instruções para o aluno ao realizar esta meta..."
                className="w-full bg-zinc-800/60 border border-zinc-700/80 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 resize-none"
              />
            </div>
          </div>

          {/* Vínculo com Módulo(s) do Planejamento Pedagógico */}
          {linkableModules.length > 0 && (
            <div className="bg-zinc-950/60 border border-zinc-800 p-4 rounded-xl space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                    Vincular a Módulo(s) do Planejamento (Opcional)
                  </span>
                  {linkedModules.length > 0 && (
                    <span className="text-[10px] font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-md tabular-nums">
                      {linkedModules.length} {linkedModules.length === 1 ? 'vinculado' : 'vinculados'}
                    </span>
                  )}
                </div>

                {hasDisciplineMatch && (
                  <button
                    type="button"
                    onClick={() => setShowAllDisciplineModules(prev => !prev)}
                    className="text-[11px] font-semibold text-zinc-400 hover:text-amber-300 underline transition-colors"
                  >
                    {showAllDisciplineModules
                      ? `Filtrar por ${disciplineName}`
                      : 'Mostrar todas as disciplinas'}
                  </button>
                )}
              </div>

              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Vincule esta meta a um ou mais módulos de <strong className="text-amber-300">Estudo Guiado</strong> ou <strong className="text-zinc-200">Presenciais</strong> para sincronizar o status de entrega no Planejamento Pedagógico e permitir o acesso direto pelo aluno.
              </p>

              {/* Chips dos módulos já selecionados */}
              {linkedModules.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {linkedModules.map(link => (
                    <span
                      key={link.moduleId}
                      className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-amber-500/15 text-amber-200 border border-amber-500/35 px-2.5 py-1 rounded-lg max-w-full"
                    >
                      <span className="truncate max-w-[260px]" title={`${link.subjectName} · ${link.topicName} · ${link.moduleName}`}>
                        {link.moduleName || 'Módulo'}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setLinkedModules(prev => prev.filter(item => item.moduleId !== link.moduleId))
                        }
                        className="text-amber-300/70 hover:text-white transition-colors shrink-0"
                        title="Remover vínculo"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Campo de busca */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={moduleSearch}
                  onChange={e => setModuleSearch(e.target.value)}
                  placeholder="Buscar módulo, assunto ou disciplina..."
                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-500 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none"
                />
              </div>

              {/* Lista de módulos selecionáveis */}
              <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                {filteredLinkableModules.length === 0 ? (
                  <p className="text-[11px] text-zinc-500 text-center py-3">
                    Nenhum módulo encontrado para o filtro atual.
                  </p>
                ) : (
                  filteredLinkableModules.map(item => {
                    const isChecked = linkedModuleIdSet.has(item.moduleId);
                    return (
                      <button
                        key={item.moduleId}
                        type="button"
                        onClick={() => handleToggleLinkedModule(item)}
                        className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg border text-left transition-all ${
                          isChecked
                            ? 'bg-amber-500/10 border-amber-500/40 text-white'
                            : 'bg-zinc-900/80 border-zinc-800/80 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900'
                        }`}
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          <div
                            className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                              isChecked
                                ? 'bg-amber-500 border-amber-500 text-black'
                                : 'bg-zinc-950 border-zinc-700'
                            }`}
                          >
                            {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold truncate">{item.moduleName}</p>
                            <p className="text-[10px] text-zinc-500 truncate">
                              {item.subjectName} · {item.topicName}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border shrink-0 whitespace-nowrap ${
                            item.isGuidedStudy
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                              : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                          }`}
                        >
                          {item.isGuidedStudy ? 'Estudo Guiado' : 'Presencial'}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Configurações Específicas do Tipo Escolhido */}

          {/* AULA: Múltiplas Videoaulas (Integração Panda Video) */}
          {metaType === 'aula' && (
            <div className="bg-zinc-950/60 border border-zinc-800 p-4 rounded-xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-2">
                    <Video className="w-4 h-4 shrink-0" /> Videoaulas (Panda Video)
                  </span>
                  <span className="text-[11px] font-mono font-bold text-zinc-300 bg-zinc-900 border border-zinc-800 px-2.5 py-0.5 rounded-lg tabular-nums">
                    {linkedVideosCount} {linkedVideosCount === 1 ? 'vídeo' : 'vídeos'} · Total:{' '}
                    <span className="text-blue-400">{totalVideosDuration} min</span>
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => openPandaSelectorForRow(null)}
                  disabled={isLoadingPandaVideo}
                  className="px-3 py-1.5 rounded-lg bg-blue-500/15 text-blue-300 border border-blue-500/30 text-xs font-bold hover:bg-blue-500/25 transition-colors flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
                >
                  {isLoadingPandaVideo ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Video className="w-3.5 h-3.5" />
                  )}
                  <span>Buscar e Adicionar do Panda</span>
                </button>
              </div>

              <div className="space-y-3">
                {videos.map((video, index) => {
                  const previewUrl = resolveGuidedStudyVideoUrl(video.link, video.pandaVideoId);
                  return (
                    <div
                      key={video.id || index}
                      className="bg-zinc-900/90 border border-zinc-800 hover:border-zinc-700/80 p-3 rounded-xl space-y-2.5 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-300 text-[11px] font-mono font-bold flex items-center justify-center shrink-0 tabular-nums">
                          {index + 1}
                        </span>

                        {videos.length > 1 && (
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleMoveVideoRow(index, -1)}
                              disabled={index === 0}
                              title="Mover aula para cima"
                              className="p-1 text-zinc-500 hover:text-white disabled:opacity-30 rounded transition-colors"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveVideoRow(index, 1)}
                              disabled={index === videos.length - 1}
                              title="Mover aula para baixo"
                              className="p-1 text-zinc-500 hover:text-white disabled:opacity-30 rounded transition-colors"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        <input
                          type="text"
                          value={video.title}
                          onChange={e => handleUpdateVideoField(index, 'title', e.target.value)}
                          placeholder={`Título da Aula ${index + 1}`}
                          className="flex-1 min-w-0 bg-zinc-950 border border-zinc-800 focus:border-blue-500 rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none"
                        />

                        <div className="relative w-24 shrink-0">
                          <input
                            type="number"
                            min={0}
                            value={video.duration || ''}
                            onChange={e => handleUpdateVideoField(index, 'duration', e.target.value)}
                            placeholder="0"
                            title="Duração desta videoaula em minutos"
                            className="w-full bg-zinc-950 border border-zinc-800 focus:border-blue-500 rounded-lg pl-2.5 pr-9 py-1.5 text-xs text-white text-right font-mono tabular-nums focus:outline-none"
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-zinc-500 pointer-events-none">
                            min
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveVideoRow(index)}
                          title={videos.length > 1 ? 'Remover videoaula' : 'Limpar videoaula'}
                          className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="relative flex-1 min-w-0">
                          <input
                            type="text"
                            value={video.link}
                            onChange={e => handleUpdateVideoField(index, 'link', e.target.value)}
                            placeholder="Link Embed / URL do Panda Vídeo ou Video ID"
                            className="w-full bg-zinc-950 border border-zinc-800 focus:border-blue-500 rounded-lg pl-3 pr-20 py-1.5 text-xs text-zinc-300 font-mono placeholder-zinc-600 focus:outline-none"
                          />
                          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openPandaSelectorForRow(index)}
                              title="Selecionar vídeo nas pastas do Panda"
                              className="p-1 text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                            >
                              <Search className="w-3.5 h-3.5" />
                            </button>
                            {previewUrl && (
                              <button
                                type="button"
                                onClick={() =>
                                  setPreviewVideo({
                                    title: video.title || `Aula ${index + 1}`,
                                    url: previewUrl
                                  })
                                }
                                title="Pré-visualizar videoaula"
                                className="p-1 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded transition-colors"
                              >
                                <PlayCircle className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={handleAddVideoRow}
                className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800/80 border border-dashed border-zinc-700 hover:border-blue-500/50 rounded-xl text-xs font-bold text-zinc-300 hover:text-blue-300 flex items-center justify-center gap-1.5 transition-colors"
              >
                <Plus className="w-4 h-4 text-blue-400" />
                <span>Adicionar Outra Videoaula</span>
              </button>
            </div>
          )}

          {/* MATERIAL, QUESTÕES, LEI SECA, RESUMO: Upload de PDF e Links */}
          {(metaType === 'material' || metaType === 'questoes' || metaType === 'lei_seca' || metaType === 'resumo') && (
            <div className="bg-zinc-950/60 border border-zinc-800 p-4 rounded-xl space-y-4">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4" /> Material e Anexos (.PDF / Links)
              </span>

              {metaType === 'questoes' && (
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Quantidade de Questões Programadas</label>
                  <input
                    type="number"
                    value={questionCount}
                    onChange={e => setQuestionCount(Number(e.target.value))}
                    className="w-full md:w-1/2 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white tabular-nums"
                  />
                </div>
              )}

              {metaType === 'lei_seca' && (
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Artigos / Dispositivos a Ler</label>
                  <input
                    type="text"
                    value={articles}
                    onChange={e => setArticles(e.target.value)}
                    placeholder="Ex: Art. 1º ao 15 da Constituição Federal de 1988"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* PDF Upload */}
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Arquivo PDF de Apoio</label>
                  {pdfUrl ? (
                    <div className="flex items-center justify-between bg-zinc-900 border border-emerald-500/30 p-2 rounded-lg text-xs">
                      <span className="truncate text-emerald-400 font-medium">{pdfName || 'Arquivo.pdf'}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setPdfUrl('');
                          setPdfName('');
                        }}
                        className="text-zinc-500 hover:text-red-400 ml-2"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center gap-2 p-2.5 bg-zinc-900 hover:bg-zinc-800 border border-dashed border-zinc-700 rounded-lg text-xs text-zinc-300 cursor-pointer transition-colors">
                      {isUploadingPdf ? (
                        <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                      ) : (
                        <FileText className="w-4 h-4 text-amber-400" />
                      )}
                      <span>{isUploadingPdf ? 'Enviando PDF...' : 'Anexar PDF (.pdf)'}</span>
                      <input type="file" accept=".pdf" onChange={handlePdfUpload} className="hidden" />
                    </label>
                  )}
                </div>

                {/* External Link */}
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Link Externo / Caderno de Questões</label>
                  <div className="flex items-center gap-2">
                    <LinkIcon className="w-4 h-4 text-zinc-500 shrink-0" />
                    <input
                      type="url"
                      value={externalLink}
                      onChange={e => setExternalLink(e.target.value)}
                      placeholder="https://..."
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* FLASHCARDS: Editor e Gerador IA */}
          {metaType === 'flashcards' && (
            <div className="bg-zinc-950/60 border border-zinc-800 p-4 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-pink-400 uppercase tracking-wider flex items-center gap-2">
                  <Zap className="w-4 h-4" /> Baralho de Flashcards
                </span>
                <button
                  type="button"
                  onClick={handleGenerateFlashcardsAi}
                  disabled={isGeneratingAi}
                  className="px-3 py-1.5 rounded-lg bg-pink-500/10 text-pink-400 border border-pink-500/20 text-xs font-bold hover:bg-pink-500/20 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isGeneratingAi ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span>Gerar com IA Gemini</span>
                </button>
              </div>

              <div className="space-y-3">
                {cards.map((card, idx) => (
                  <div key={card.id} className="bg-zinc-900 border border-zinc-800 p-3 rounded-lg space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-zinc-400">
                      <span>Card #{idx + 1}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveFlashcard(card.id)}
                        className="text-zinc-500 hover:text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Frente (Pergunta ou Conceito)"
                        value={card.front}
                        onChange={e => handleUpdateFlashcard(card.id, 'front', e.target.value)}
                        className="bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-white"
                      />
                      <input
                        type="text"
                        placeholder="Verso (Resposta ou Explicação)"
                        value={card.back}
                        onChange={e => handleUpdateFlashcard(card.id, 'back', e.target.value)}
                        className="bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-white"
                      />
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={handleAddFlashcard}
                  className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 border border-dashed border-zinc-700 rounded-lg text-xs text-zinc-300 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Plus className="w-4 h-4 text-pink-400" />
                  <span>Adicionar Flashcard Manualmente</span>
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-between bg-zinc-900/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-400 hover:text-white transition-colors whitespace-nowrap"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || isJsonMetaInvalid}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-black font-extrabold text-xs tracking-wider uppercase shadow-lg hover:brightness-110 transition-all flex items-center gap-2 disabled:opacity-50 whitespace-nowrap"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            <span>{metaToEdit ? 'Atualizar Meta' : 'Salvar Meta'}</span>
          </button>
        </div>

      </div>

      {isPandaSelectorOpen && (
        <PandaVideoSelector
          initialFolderId={lastPandaFolderId}
          onSelect={handlePandaVideoSelect}
          onClose={() => {
            setIsPandaSelectorOpen(false);
            setPandaTargetRowIndex(null);
          }}
        />
      )}

      {previewVideo && (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in"
          onClick={() => setPreviewVideo(null)}
        >
          <div
            className="w-full max-w-4xl bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/60">
              <div className="flex items-center gap-2 min-w-0">
                <PlayCircle className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="text-xs font-bold text-white truncate">
                  Pré-visualização: {previewVideo.title}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewVideo(null)}
                className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 bg-black">
              <PandaVideoPlayer url={previewVideo.url} title={previewVideo.title} />
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalNode, document.body);
  }

  return modalNode;
};

