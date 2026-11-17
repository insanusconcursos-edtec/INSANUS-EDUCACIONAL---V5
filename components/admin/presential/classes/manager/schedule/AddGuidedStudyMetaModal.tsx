import React, { useState, useEffect, useRef } from 'react';
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
  AlertCircle
} from 'lucide-react';
import {
  GuidedStudyMeta,
  GuidedStudyMetaType,
  GuidedStudyFlashcard,
  GuidedStudyInteractiveMapSummary
} from '../../../../../../types/guidedStudy';
import { InteractiveMapData } from '../../../../../../types/interactiveMap';
import { Subject } from '../../../../../../types/curriculum';
import { pandaService } from '../../../../../../services/pandaService';
import { guidedStudyService } from '../../../../../../services/guidedStudyService';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../../../../../services/firebase';

import { MetaColorSelector } from '../../../../metas/shared/MetaColorSelector';
import { PandaVideoSelector } from '../../../../ui/PandaVideoSelector';
import { extractPandaVideoId, getPandaEmbedUrl, PandaVideo } from '../../../../../../utils/pandaUtils';

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
}

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

export const AddGuidedStudyMetaModal: React.FC<AddGuidedStudyMetaModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  classId,
  selectedDate,
  metaToEdit,
  subjects = []
}) => {
  const [metaType, setMetaType] = useState<GuidedStudyMetaType>('aula');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [disciplineName, setDisciplineName] = useState('');
  const [duration, setDuration] = useState<number>(30);
  const [color, setColor] = useState<string>('#3b82f6');

  // Type specific state
  const [pandaVideoUrl, setPandaVideoUrl] = useState('');
  const [pandaVideoId, setPandaVideoId] = useState('');
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

  // Panda Explorer Modal
  const [isPandaSelectorOpen, setIsPandaSelectorOpen] = useState(false);

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

      if (metaToEdit) {
        const editType = metaToEdit.type || 'aula';
        setMetaType(editType);
        setTitle(metaToEdit.title || '');
        setDescription(metaToEdit.description || '');
        setDisciplineName(metaToEdit.disciplineName || '');
        setDuration(metaToEdit.duration || 30);
        setColor(metaToEdit.color || DEFAULT_META_COLORS[editType]);
        setPandaVideoUrl(metaToEdit.pandaVideoUrl || '');
        setPandaVideoId(metaToEdit.pandaVideoId || '');
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
        setPandaVideoUrl('');
        setPandaVideoId('');
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

  const handlePandaVideoSelect = async (videoData: PandaVideo) => {
    try {
      setFormError(null);
      const videoDetails = (await pandaService.getVideoDetails(videoData.id)) || videoData;
      const playbackId = extractPandaVideoId(videoDetails);
      const embedUrl =
        getPandaEmbedUrl(videoDetails, playbackId) ||
        videoDetails.video_player_url ||
        `https://player-vouto.pandavideo.com.br/embed/?v=${videoData.id}`;

      setPandaVideoId(videoData.id);
      setPandaVideoUrl(embedUrl);

      if (!title && (videoData.title || videoDetails.title)) {
        setTitle(videoData.title || videoDetails.title);
      }

      const rawSeconds = videoDetails.length
        ? Number(videoDetails.length)
        : videoDetails.duration
          ? Number(videoDetails.duration)
          : 0;
      if (rawSeconds > 0) {
        setDuration(Math.round(rawSeconds / 60));
      }

      setIsPandaSelectorOpen(false);
    } catch (err) {
      console.error('Erro ao selecionar vídeo do Panda:', err);
      setFormError('Erro ao carregar os detalhes do vídeo do Panda.');
    }
  };

  if (!isOpen) return null;

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploadingPdf(true);
      setFormError(null);
      const storageRef = ref(storage, `guided_study_pdfs/${classId}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setPdfUrl(url);
      setPdfName(file.name);
    } catch (err) {
      console.error('Erro ao fazer upload do PDF:', err);
      setFormError('Erro ao enviar o PDF. Tente novamente.');
    } finally {
      setIsUploadingPdf(false);
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
              const mapStorageRef = ref(
                storage,
                `guided_study_maps/${classId}/${Date.now()}_${safeFileName}`
              );
              await uploadBytes(mapStorageRef, jsonBlob);
              resolvedUrl = await getDownloadURL(mapStorageRef);
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

      const payload: GuidedStudyMeta = {
        id: metaToEdit?.id,
        classId,
        date: selectedDate,
        type: metaType,
        title: title.trim(),
        description: description.trim(),
        disciplineName: disciplineName.trim(),
        duration: Number(duration) || 30,
        color,
        pandaVideoUrl,
        pandaVideoId,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
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
              <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                Tempo Estimado (minutos)
              </label>
              <input
                type="number"
                min={5}
                max={300}
                value={duration}
                onChange={e => setDuration(Number(e.target.value))}
                className="w-full bg-zinc-800/60 border border-zinc-700/80 rounded-xl px-4 py-2.5 text-sm text-white tabular-nums focus:outline-none focus:border-amber-500"
              />
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

          {/* Configurações Específicas do Tipo Escolhido */}

          {/* AULA: Panda Video Integration */}
          {metaType === 'aula' && (
            <div className="bg-zinc-950/60 border border-zinc-800 p-4 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-2">
                  <Video className="w-4 h-4" /> Integração Panda Video
                </span>
                <button
                  type="button"
                  onClick={() => setIsPandaSelectorOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-bold hover:bg-blue-500/20 transition-colors flex items-center gap-1.5"
                >
                  <Video className="w-3.5 h-3.5" />
                  <span>Navegar Pastas no Panda</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Panda Video ID</label>
                  <input
                    type="text"
                    value={pandaVideoId}
                    onChange={e => setPandaVideoId(e.target.value)}
                    placeholder="Ex: v-12345-abc"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">URL Direta / Embed Panda</label>
                  <input
                    type="text"
                    value={pandaVideoUrl}
                    onChange={e => setPandaVideoUrl(e.target.value)}
                    placeholder="https://player-vouto.pandavideo.com.br/embed/..."
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>
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
          onSelect={handlePandaVideoSelect}
          onClose={() => setIsPandaSelectorOpen(false)}
        />
      )}
    </div>
  );
};

