import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Network, Table, HelpCircle, Layers, Maximize2, Minimize2, ZoomIn, ZoomOut, 
  RotateCcw, ChevronRight, CheckCircle2, Circle, AlertTriangle, Lightbulb, 
  BookOpen, CheckSquare, Sparkles, Filter, ChevronDown, ChevronUp, Eye, EyeOff,
  Volume2, X, ArrowLeft, ArrowRight, Shuffle, CornerDownRight, ExternalLink, Scissors,
  History, Flag, BarChart3, Sun, Moon
} from 'lucide-react';
import { 
  InteractiveMapData, MindmapNode, MindmapNodeColor, InteractiveMatrix, 
  InteractiveQuestao, InteractiveFlashcard, InteractiveMapStudentProgress,
  QuestionAttempt, QuestionAnswerData, BatteryTestHistoryItem
} from '../../../../types/interactiveMap';
import { CourseContent } from '../../../../types/course';
import { sanitizeInteractiveHtml } from '../../../../utils/sanitizeInteractiveHtml';
import { interactiveMapProgressService } from '../../../../services/interactiveMapProgressService';
import { useAuth } from '../../../../contexts/AuthContext';

interface InteractiveLessonPlayerProps {
  content: CourseContent;
  lessonId: string;
}

// Cores temáticas para os nós e colunas
const COLOR_THEMES: Record<MindmapNodeColor, { border: string; bg: string; text: string; glow: string; badge: string }> = {
  navy: {
    border: 'border-blue-900',
    bg: 'bg-blue-950/40',
    text: 'text-blue-300',
    glow: 'rgba(30, 58, 138, 0.4)',
    badge: 'bg-blue-900/40 text-blue-300 border-blue-700/50'
  },
  royal: {
    border: 'border-sky-500',
    bg: 'bg-sky-950/40',
    text: 'text-sky-300',
    glow: 'rgba(14, 165, 233, 0.4)',
    badge: 'bg-sky-900/40 text-sky-200 border-sky-600/50'
  },
  green: {
    border: 'border-emerald-500',
    bg: 'bg-emerald-950/40',
    text: 'text-emerald-300',
    glow: 'rgba(16, 185, 129, 0.4)',
    badge: 'bg-emerald-900/40 text-emerald-200 border-emerald-600/50'
  },
  red: {
    border: 'border-red-600',
    bg: 'bg-red-950/40',
    text: 'text-red-300',
    glow: 'rgba(239, 68, 68, 0.4)',
    badge: 'bg-red-900/40 text-red-200 border-red-600/50'
  },
  amber: {
    border: 'border-amber-500',
    bg: 'bg-amber-950/40',
    text: 'text-amber-300',
    glow: 'rgba(245, 158, 11, 0.4)',
    badge: 'bg-amber-900/40 text-amber-200 border-amber-600/50'
  }
};

// Cores temáticas para o Tema Claro (Borda esquerda dos nós e curvas)
const LIGHT_NODE_BORDER_COLORS: Record<MindmapNodeColor, string> = {
  navy: '#002060',
  royal: '#0070c0',
  green: '#1e6b38',
  red: '#c00000',
  amber: '#b45309'
};

const LIGHT_CURVE_COLORS: Record<MindmapNodeColor, string> = {
  navy: '#002060',
  royal: '#0070c0',
  green: '#1e6b38',
  red: '#c00000',
  amber: '#b45309'
};

const MATRIX_COLUMN_SOLID_COLORS: Record<string, string> = {
  navy: '#002060',
  royal: '#0070c0',
  green: '#1e6b38',
  red: '#c00000',
  amber: '#b45309',
};

export function InteractiveLessonPlayer({ content, lessonId }: InteractiveLessonPlayerProps) {
  const { currentUser } = useAuth();
  const userId = currentUser?.uid || 'guest';

  // Extrai os dados do mapa com segurança (aceita objeto ou string JSON)
  const mapData: InteractiveMapData | null = useMemo(() => {
    const raw = (content as any).interactiveMapJson || content.interactiveMapData;
    if (raw) {
      if (typeof raw === 'object' && raw.mindmap) {
        return raw as InteractiveMapData;
      }
      if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object' && parsed.mindmap) {
            return parsed as InteractiveMapData;
          }
        } catch (e) {
          console.error('[InteractiveLessonPlayer] Erro ao parsear JSON do mapa:', e);
        }
      }
    }
    // Fallback: se estiver salvo como string ou texto no textContent
    if (content.textContent && content.textContent.includes('"mindmap"')) {
      try {
        const parsed = JSON.parse(content.textContent);
        if (parsed && typeof parsed === 'object' && parsed.mindmap) {
          return parsed as InteractiveMapData;
        }
      } catch (e) {
        return null;
      }
    }
    return null;
  }, [content]);

  // Se não houver mapa válido
  if (!mapData || !mapData.mindmap) {
    return (
      <div className="w-full max-w-6xl mx-auto p-8 rounded-2xl bg-[#0e1117] border border-gray-800 text-center my-6">
        <Network className="w-12 h-12 text-gray-600 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-gray-200 mb-1">Mapa Interativo não configurado</h3>
        <p className="text-xs text-gray-500">Este conteúdo ainda não possui os dados estruturados do mapa.</p>
      </div>
    );
  }

  return (
    <InteractivePlayerCore 
      mapData={mapData} 
      lessonId={lessonId} 
      contentId={content.id} 
      userId={userId} 
    />
  );
}

interface CoreProps {
  mapData: InteractiveMapData;
  lessonId: string;
  contentId: string;
  userId: string;
}

function InteractivePlayerCore({ mapData, lessonId, contentId, userId }: CoreProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Tema Claro como padrão (isDark = false)
  const [isDark, setIsDark] = useState(false);

  // Abas disponíveis
  const availableTabs = useMemo(() => {
    const tabs: { id: 'mindmap' | 'matrices' | 'questoes' | 'flashcards'; label: string; icon: any; count?: number }[] = [];
    if (mapData.mindmap) {
      tabs.push({ id: 'mindmap', label: 'Mapa Mental', icon: Network });
    }
    if (mapData.matrices && mapData.matrices.length > 0) {
      tabs.push({ id: 'matrices', label: 'Quadros & Lousa', icon: Table, count: mapData.matrices.length });
    }
    if (mapData.questoes && mapData.questoes.length > 0) {
      tabs.push({ id: 'questoes', label: 'Questões', icon: HelpCircle, count: mapData.questoes.length });
    }
    if (mapData.flashcards && mapData.flashcards.length > 0) {
      tabs.push({ id: 'flashcards', label: 'Flashcards', icon: Layers, count: mapData.flashcards.length });
    }
    return tabs;
  }, [mapData]);

  const [activeTab, setActiveTab] = useState<'mindmap' | 'matrices' | 'questoes' | 'flashcards'>(availableTabs[0]?.id || 'mindmap');
  const [selectedBateriaFilter, setSelectedBateriaFilter] = useState<string | number>('all');
  const [isMobileTabMenuOpen, setIsMobileTabMenuOpen] = useState(false);

  // Progresso do aluno
  const [progress, setProgress] = useState<InteractiveMapStudentProgress>({
    completedNodeIds: [],
    questionAnswers: {},
    flashcardStatus: {}
  });

  useEffect(() => {
    interactiveMapProgressService.getProgress(userId, lessonId, contentId).then(data => {
      setProgress(data);
    });
  }, [userId, lessonId, contentId]);

  const saveProgressDebounced = useCallback((newProgress: Partial<InteractiveMapStudentProgress>) => {
    setProgress(prev => {
      const merged = { ...prev, ...newProgress };
      interactiveMapProgressService.saveProgress(userId, lessonId, contentId, merged);
      return merged;
    });
  }, [userId, lessonId, contentId]);

  // Fullscreen do Player .JSON (expande o player cobrindo a tela e a sidebar somente quando acionado neste botão)
  const toggleFullscreen = () => {
    if (isFullscreen) {
      setIsFullscreen(false);
      if (document.fullscreenElement === containerRef.current) {
        document.exitFullscreen?.().catch(() => {});
      }
    } else {
      setIsFullscreen(true);
      // Se a plataforma não estiver já em tela cheia nativa, solicita tela cheia no container
      if (containerRef.current && !document.fullscreenElement) {
        containerRef.current.requestFullscreen?.().catch(() => {});
      }
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      // Só ativa isFullscreen do player se o elemento nativo em tela cheia for o container DESTE player
      if (document.fullscreenElement === containerRef.current) {
        setIsFullscreen(true);
      } else if (!document.fullscreenElement) {
        // Se saiu de qualquer tela cheia nativa, restaura o player para o layout padrão
        setIsFullscreen(false);
      }
      // Se document.fullscreenElement for document.documentElement (botão TELA CHEIA da plataforma),
      // NÃO ativamos isFullscreen do player, mantendo a sidebar de ensino visível!
    };

    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
        if (document.fullscreenElement === containerRef.current) {
          document.exitFullscreen?.().catch(() => {});
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // Atalho do nó para a bateria de questões
  const handleNavigateToBateria = (bateriaId: string | number) => {
    setSelectedBateriaFilter(bateriaId);
    setActiveTab('questoes');
  };

  // Mapeamento e contagem total de nós
  const allNodesList = useMemo(() => {
    const list: MindmapNode[] = [];
    const traverse = (node: MindmapNode) => {
      list.push(node);
      if (node.children) {
        node.children.forEach(traverse);
      }
    };
    if (mapData.mindmap) traverse(mapData.mindmap);
    return list;
  }, [mapData.mindmap]);

  // Mapeamento de hierarquia (pai e descendentes)
  const hierarchyMap = useMemo(() => {
    const parentOf: Record<string, string | null> = {};
    const descendantsOf: Record<string, string[]> = {};

    const traverse = (node: MindmapNode, parentId: string | null) => {
      parentOf[node.id] = parentId;
      const descendants: string[] = [];

      if (node.children) {
        node.children.forEach(child => {
          descendants.push(child.id);
          traverse(child, node.id);
          if (descendantsOf[child.id]) {
            descendants.push(...descendantsOf[child.id]);
          }
        });
      }
      descendantsOf[node.id] = descendants;
    };

    if (mapData.mindmap) traverse(mapData.mindmap, null);
    return { parentOf, descendantsOf };
  }, [mapData.mindmap]);

  // Regra de Cascata de Conclusão:
  // - Marcar um nó marca todos os seus descendentes
  // - Desmarcar um nó desmarca seus pais
  const toggleNodeCompletion = (nodeId: string) => {
    const isCompleted = progress.completedNodeIds.includes(nodeId);
    const newSet = new Set(progress.completedNodeIds);

    if (!isCompleted) {
      // Marcar nó e toda sua cadeia de descendentes
      newSet.add(nodeId);
      const descendants = hierarchyMap.descendantsOf[nodeId] || [];
      descendants.forEach(d => newSet.add(d));
    } else {
      // Desmarcar nó
      newSet.delete(nodeId);
      // Desmarcar recursivamente todos os nós ancestrais
      let currParent = hierarchyMap.parentOf[nodeId];
      while (currParent) {
        newSet.delete(currParent);
        currParent = hierarchyMap.parentOf[currParent];
      }
    }

    const updated = Array.from(newSet);
    saveProgressDebounced({ completedNodeIds: updated });
  };

  const totalNodesCount = allNodesList.length;
  const completedNodesCount = progress.completedNodeIds.filter(id => allNodesList.some(n => n.id === id)).length;
  const progressPercentage = totalNodesCount > 0 ? Math.round((completedNodesCount / totalNodesCount) * 100) : 0;

  return (
    <div 
      ref={containerRef}
      className={`w-full flex flex-col transition-all ${
        isDark 
          ? 'interactive-player-dark bg-[#0b0d12] text-gray-100' 
          : 'interactive-player-light bg-[#f8fafc] text-slate-800'
      } ${
        isFullscreen 
          ? 'fixed inset-0 z-50 w-screen h-screen flex flex-col overflow-hidden' 
          : 'w-full h-full flex flex-col overflow-hidden'
      }`}
    >
      {/* Header do Player */}
      <header className={`px-3 sm:px-6 py-2.5 sm:py-3.5 border-b shrink-0 transition-colors ${
        isDark ? 'bg-[#12151c] border-gray-800 text-white' : 'bg-[#111827] border-[#1f2937] text-white'
      }`}>
        {/* LAYOUT MOBILE (< sm): Linha 1 = Ícone + Badges + Botões Tech Dark / Fullscreen | Linha 2 = Título Completo sem sobreposição */}
        <div className="flex flex-col sm:hidden w-full gap-2">
          <div className="flex items-center justify-between gap-2 w-full">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-md ${
                isDark 
                  ? 'bg-red-600/10 border border-red-600/30 text-red-500' 
                  : 'bg-white/10 border border-white/20 text-white'
              }`}>
                <Network size={16} />
              </div>
              <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
                <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border truncate shrink min-w-0 ${
                  isDark 
                    ? 'text-red-500 bg-red-500/10 border-red-500/20' 
                    : 'text-white bg-white/10 border-white/20'
                }`}>
                  {mapData.meta?.disciplina || 'MAPA / REVISÃO'}
                </span>
                {mapData.meta?.banca && (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                    isDark ? 'text-gray-400 bg-gray-800/60' : 'text-gray-300 bg-white/10'
                  }`}>
                    {mapData.meta.banca}
                  </span>
                )}
              </div>
            </div>

            {/* Botões de Ação Mobile (Tech Dark + Tela Cheia) */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Botão Tech Dark de Alternar Modo Claro / Noturno */}
              <button
                type="button"
                onClick={() => setIsDark(d => !d)}
                className={`p-2 rounded-xl transition-all flex items-center justify-center border active:scale-95 ${
                  isDark 
                    ? 'bg-zinc-900 border-zinc-800 hover:border-cyan-500/50 text-cyan-400 shadow-sm shadow-cyan-950/30' 
                    : 'bg-zinc-900 border-zinc-700 hover:border-amber-500/50 text-amber-400 shadow-sm'
                }`}
                title={isDark ? 'Modo Noturno Ativo • Alternar para Modo Claro' : 'Modo Claro Ativo • Alternar para Modo Noturno'}
                aria-label={isDark ? 'Modo Noturno Ativo • Alternar para Modo Claro' : 'Modo Claro Ativo • Alternar para Modo Noturno'}
              >
                {isDark ? <Moon size={16} className="text-cyan-400" /> : <Sun size={16} className="text-amber-400" />}
              </button>

              {/* Botão Tela Cheia */}
              <button
                type="button"
                onClick={toggleFullscreen}
                className="p-2 rounded-xl transition-all flex items-center justify-center border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white hover:border-zinc-700 active:scale-95 shadow-sm"
                title={isFullscreen ? 'Sair da Tela Cheia' : 'Tela Cheia'}
                aria-label={isFullscreen ? 'Sair da Tela Cheia' : 'Tela Cheia'}
              >
                {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
            </div>
          </div>

          {/* Título com largura total no Mobile (sem ser coberto ou espremido por botões) */}
          <h2 className="text-xs font-black text-white uppercase tracking-tight truncate w-full pl-0.5">
            {mapData.meta?.titulo || mapData.meta?.assunto || mapData.mindmap?.title}
          </h2>
        </div>

        {/* LAYOUT DESKTOP / TABLET (>= sm): Linha Única Integrada */}
        <div className="hidden sm:flex items-center justify-between gap-3 w-full">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-lg ${
              isDark 
                ? 'bg-red-600/10 border border-red-600/30 text-red-500 shadow-red-950/50' 
                : 'bg-white/10 border border-white/20 text-white shadow-black/40'
            }`}>
              <Network size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border shrink-0 ${
                  isDark 
                    ? 'text-red-500 bg-red-500/10 border-red-500/20' 
                    : 'text-white bg-white/10 border-white/20'
                }`}>
                  {mapData.meta?.disciplina || 'MAPA / REVISÃO'}
                </span>
                {mapData.meta?.banca && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${
                    isDark ? 'text-gray-400 bg-gray-800/60' : 'text-gray-300 bg-white/10'
                  }`}>
                    {mapData.meta.banca}
                  </span>
                )}
              </div>
              <h2 className="text-base md:text-lg font-black text-white uppercase tracking-tight mt-0.5 truncate">
                {mapData.meta?.titulo || mapData.meta?.assunto || mapData.mindmap?.title}
              </h2>
            </div>
          </div>

          {/* Abas e Ações no Desktop */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Progresso Geral */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${
              isDark ? 'bg-black/40 border-gray-800 text-gray-300' : 'bg-white/10 border-white/15 text-white'
            }`}>
              <CheckCircle2 size={14} className={isDark ? 'text-emerald-500' : 'text-emerald-400'} />
              <span className="text-[11px] font-bold">
                {completedNodesCount}/{totalNodesCount} nós
              </span>
              <div className={`w-16 h-1.5 rounded-full overflow-hidden ml-1 ${isDark ? 'bg-gray-800' : 'bg-white/20'}`}>
                <div 
                  className={`h-full transition-all duration-300 ${isDark ? 'bg-emerald-500' : 'bg-emerald-400'}`}
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
              <span className={`text-[10px] font-black ${isDark ? 'text-emerald-400' : 'text-emerald-400'}`}>{progressPercentage}%</span>
            </div>

            {/* Botão Alternar Tema Tech Dark no Desktop */}
            <button
              type="button"
              onClick={() => setIsDark(d => !d)}
              className={`p-2.5 rounded-xl transition-all flex items-center justify-center border active:scale-95 ${
                isDark 
                  ? 'bg-zinc-900 border-zinc-800 hover:border-cyan-500/50 text-cyan-400 shadow-sm shadow-cyan-950/30' 
                  : 'bg-zinc-900 border-zinc-700 hover:border-amber-500/50 text-amber-400 shadow-sm'
              }`}
              title={isDark ? 'Modo Noturno Ativo • Alternar para Modo Claro' : 'Modo Claro Ativo • Alternar para Modo Noturno'}
              aria-label={isDark ? 'Modo Noturno Ativo • Alternar para Modo Claro' : 'Modo Claro Ativo • Alternar para Modo Noturno'}
            >
              {isDark ? <Moon size={18} className="text-cyan-400" /> : <Sun size={18} className="text-amber-400" />}
            </button>

            {/* Botão Tela Cheia */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-2.5 rounded-xl transition-all flex items-center justify-center border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white hover:border-zinc-700 active:scale-95 shadow-sm"
              title={isFullscreen ? 'Sair da Tela Cheia' : 'Tela Cheia'}
              aria-label={isFullscreen ? 'Sair da Tela Cheia' : 'Tela Cheia'}
            >
              {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
          </div>
        </div>
      </header>

      {/* Barra de Abas (Mobile: <select> w-full | Desktop: pílulas horizontais) */}
      <nav className={`px-4 md:px-6 py-2 md:py-2.5 border-b shrink-0 transition-colors ${
        isDark ? 'bg-[#0e1118] border-gray-800/80' : 'bg-[#111827] border-[#1f2937]'
      }`}>
        {/* Desktop: Pílulas das Abas */}
        <div className="hidden md:flex items-center gap-1.5 overflow-x-auto hide-scrollbar">
          {availableTabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                  isDark 
                    ? (isActive ? 'bg-red-600 text-white shadow-lg shadow-red-950/40' : 'text-gray-400 hover:text-white hover:bg-white/5')
                    : (isActive ? 'bg-white text-[#111827] shadow-md font-black' : 'text-gray-300 hover:text-white hover:bg-white/10')
                }`}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    isDark
                      ? (isActive ? 'bg-red-800 text-white' : 'bg-gray-800 text-gray-400')
                      : (isActive ? 'bg-[#111827]/10 text-[#111827]' : 'bg-white/20 text-white')
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Mobile: Menu Dropdown Customizado com Design Moderno Tech Dark da Plataforma */}
        <div className="flex md:hidden w-full relative">
          {(() => {
            const currentTabObj = availableTabs.find(t => t.id === activeTab) || availableTabs[0];
            const CurrentIcon = currentTabObj?.icon || Network;

            return (
              <div className="relative w-full">
                <button
                  type="button"
                  onClick={() => setIsMobileTabMenuOpen(prev => !prev)}
                  className={`w-full flex items-center justify-between rounded-xl py-2.5 px-4 outline-none transition-all active:scale-[0.98] border shadow-md ${
                    isDark
                      ? 'bg-zinc-900 border-zinc-800 hover:border-zinc-700 text-white'
                      : 'bg-[#0f172a] border-zinc-700 hover:border-zinc-600 text-white'
                  }`}
                >
                  <div className="flex items-center gap-3 truncate min-w-0">
                    <div className="w-6 h-6 rounded-lg bg-red-600/15 border border-red-500/30 text-red-500 flex items-center justify-center shrink-0">
                      <CurrentIcon size={14} />
                    </div>
                    <span className="text-[11px] font-black uppercase tracking-widest truncate">
                      {currentTabObj?.label}
                    </span>
                    {currentTabObj?.count !== undefined && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-black bg-red-500/20 text-red-400 border border-red-500/30 shrink-0">
                        {currentTabObj.count}
                      </span>
                    )}
                  </div>
                  <ChevronDown className={`w-4 h-4 text-zinc-400 shrink-0 transition-transform duration-300 ${isMobileTabMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Popover Flutuante Tech Dark com Animação e Backdrop */}
                {isMobileTabMenuOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setIsMobileTabMenuOpen(false)}
                    />
                    <div className="absolute top-full left-0 w-full mt-2 bg-[#12141a] border border-zinc-800/90 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="p-2 flex flex-col gap-1.5">
                        {availableTabs.map(tab => {
                          const Icon = tab.icon;
                          const isActive = activeTab === tab.id;
                          return (
                            <button
                              key={tab.id}
                              type="button"
                              onClick={() => {
                                setActiveTab(tab.id);
                                setIsMobileTabMenuOpen(false);
                              }}
                              className={`
                                flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all
                                ${isActive 
                                  ? 'bg-red-600 text-white shadow-lg shadow-red-950/40 border border-red-500/40' 
                                  : 'text-zinc-400 hover:bg-zinc-900/80 hover:text-white'}
                              `}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                                  isActive 
                                    ? 'bg-white/20 text-white' 
                                    : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                                }`}>
                                  <Icon size={14} />
                                </div>
                                <span>{tab.label}</span>
                              </div>
                              {tab.count !== undefined && (
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
                                  isActive 
                                    ? 'bg-red-800 text-white' 
                                    : 'bg-zinc-800/90 text-zinc-400 border border-zinc-700/50'
                                }`}>
                                  {tab.count}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })()}
        </div>
      </nav>

      {/* Área Central de Conteúdo */}
      <main className={`flex-1 min-h-0 relative overflow-hidden flex flex-col ${
        isDark ? 'bg-[#0a0c10]' : 'bg-[#f8fafc]'
      }`}>
        {activeTab === 'mindmap' && (
          <MindmapTab 
            mindmap={mapData.mindmap} 
            completedNodeIds={progress.completedNodeIds}
            onToggleComplete={toggleNodeCompletion}
            onNavigateToBateria={handleNavigateToBateria}
            isDark={isDark}
          />
        )}

        {activeTab === 'matrices' && mapData.matrices && (
          <MatricesTab matrices={mapData.matrices} isDark={isDark} />
        )}

        {activeTab === 'questoes' && mapData.questoes && (
          <QuestoesTab 
            questoes={mapData.questoes}
            baterias={mapData.baterias || []}
            selectedBateria={selectedBateriaFilter}
            onSelectBateria={setSelectedBateriaFilter}
            questionAnswers={progress.questionAnswers}
            testHistory={progress.testHistory || []}
            onSaveAnswer={(numero, answer) => {
              saveProgressDebounced({
                questionAnswers: {
                  ...progress.questionAnswers,
                  [numero]: answer
                }
              });
            }}
            onSaveTestHistory={(historyItem, updatedAnswers) => {
              saveProgressDebounced({
                testHistory: [historyItem, ...(progress.testHistory || [])],
                ...(updatedAnswers ? { questionAnswers: updatedAnswers } : {})
              });
            }}
            onResetBattery={(updatedAnswers) => {
              saveProgressDebounced({
                questionAnswers: updatedAnswers
              });
            }}
            isDark={isDark}
          />
        )}

        {activeTab === 'flashcards' && mapData.flashcards && (
          <FlashcardsTab 
            flashcards={mapData.flashcards}
            baterias={mapData.baterias || []}
            flashcardStatus={progress.flashcardStatus}
            onSaveStatus={(id, status) => {
              saveProgressDebounced({
                flashcardStatus: {
                  ...progress.flashcardStatus,
                  [id]: status
                }
              });
            }}
            isDark={isDark}
          />
        )}
      </main>
    </div>
  );
}

// =========================================================================
// ABA 1 — MAPA MENTAL (ÁRVORE HORIZONTAL COM SVG, PAN/ZOOM E PAINEL LATERAL)
// =========================================================================

interface LayoutNode {
  node: MindmapNode;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  isExpanded: boolean;
  children: LayoutNode[];
}

function MindmapTab({ 
  mindmap, 
  completedNodeIds, 
  onToggleComplete,
  onNavigateToBateria,
  isDark = false
}: { 
  mindmap: MindmapNode; 
  completedNodeIds: string[];
  onToggleComplete: (id: string) => void;
  onNavigateToBateria: (bateriaId: string | number) => void;
  isDark?: boolean;
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 80, y: 160 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Refs de estado síncronos para cálculos matemáticos precisos em listeners
  const panRef = useRef(pan);
  panRef.current = pan;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // Refs para container do canvas e aside lateral
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLElement>(null);

  // Controle de nós expandidos
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  // Painel Lateral de Detalhes e largura arrastável
  const [selectedNode, setSelectedNode] = useState<MindmapNode | null>(null);
  const [panelWidth, setPanelWidth] = useState<'default' | 'wide' | 'focus'>('default');
  const [customWidth, setCustomWidth] = useState<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [panelFontScale, setPanelFontScale] = useState(1); // Zoom A-, 100%, A+

  // 1. Zoom no ponto exato do mouse (Wheel) com e.preventDefault()
  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      // Se o scroll ocorrer dentro do painel lateral de detalhes, não intercepta (permite o scroll nativo do painel)
      if ((e.target as HTMLElement)?.closest('aside')) {
        return;
      }
      e.preventDefault();

      const rect = el.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;

      const step = 0.08;
      const prevZoom = zoomRef.current;
      const prevPan = panRef.current;
      const delta = e.deltaY < 0 ? step : -step;
      let nextZoom = Number((prevZoom + delta).toFixed(2));
      const isMobileWheel = el.clientWidth < 768;
      const minZoomLimit = isMobileWheel ? 0.25 : 0.4;
      if (nextZoom < minZoomLimit) nextZoom = minZoomLimit;
      if (nextZoom > 1.6) nextZoom = 1.6;

      if (nextZoom === prevZoom) return;

      const ratio = nextZoom / prevZoom;
      const nextPanX = Math.round(localX - (localX - prevPan.x) * ratio);
      const nextPanY = Math.round(localY - (localY - prevPan.y) * ratio);

      setZoom(nextZoom);
      setPan({ x: nextPanX, y: nextPanY });
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // 2. Linha divisória arrastável no Painel Lateral Direito (100% fluida, sem travar)
  const handleResizePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    const startX = e.clientX;
    const currentContainer = canvasContainerRef.current;
    const containerWidth = currentContainer ? currentContainer.getBoundingClientRect().width : window.innerWidth;

    const asideElem = asideRef.current;
    const initialWidth = asideElem 
      ? asideElem.getBoundingClientRect().width 
      : (customWidth ?? (panelWidth === 'focus' ? 750 : panelWidth === 'wide' ? 580 : 420));

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      let newWidth = Math.round(initialWidth - deltaX);

      const minW = 340;
      const maxW = Math.floor(containerWidth * 0.82);

      if (newWidth < minW) newWidth = minW;
      if (newWidth > maxW) newWidth = maxW;

      setCustomWidth(newWidth);
    };

    const handlePointerUp = () => {
      setIsResizing(false);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  // Alterna expansão de um nó
  const toggleCollapse = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedIds(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  // Expandir tudo
  const expandAll = () => setCollapsedIds(new Set());

  // Só Pilares: recolhe todos os nós que tenham profundidade >= 1
  const collapseToPillars = () => {
    const toCollapse = new Set<string>();
    const markChildren = (node: MindmapNode, depth: number) => {
      if (depth >= 1 && node.children && node.children.length > 0) {
        toCollapse.add(node.id);
      }
      if (node.children) {
        node.children.forEach(c => markChildren(c, depth + 1));
      }
    };
    markChildren(mindmap, 0);
    setCollapsedIds(toCollapse);
  };


  // Handlers de Pan (Mouse e Touch)
  const handleMouseDown = (e: React.MouseEvent) => {
    // Apenas botão esquerdo
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({ x: dragStartRef.current.panX + dx, y: dragStartRef.current.panY + dy });
  };

  const handleMouseUp = () => setIsDragging(false);

  // Touch
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      dragStartRef.current = { 
        x: e.touches[0].clientX, 
        y: e.touches[0].clientY, 
        panX: pan.x, 
        panY: pan.y 
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - dragStartRef.current.x;
    const dy = e.touches[0].clientY - dragStartRef.current.y;
    setPan({ x: dragStartRef.current.panX + dx, y: dragStartRef.current.panY + dy });
  };

  // Cálculo da Árvore Horizontal
  const layout = useMemo(() => {
    const NODE_WIDTH = 260;
    const NODE_HEIGHT = 80;
    const H_GAP = 90;
    const V_GAP = 24;

    let currentLeafY = 0;

    const buildLayout = (node: MindmapNode, depth: number): LayoutNode => {
      const isExpanded = !collapsedIds.has(node.id);
      const childLayouts: LayoutNode[] = [];

      if (isExpanded && node.children && node.children.length > 0) {
        node.children.forEach(child => {
          childLayouts.push(buildLayout(child, depth + 1));
        });
      }

      let y = 0;
      if (childLayouts.length === 0) {
        y = currentLeafY;
        currentLeafY += NODE_HEIGHT + V_GAP;
      } else {
        const firstY = childLayouts[0].y;
        const lastY = childLayouts[childLayouts.length - 1].y;
        y = (firstY + lastY) / 2;
      }

      const x = depth * (NODE_WIDTH + H_GAP);

      return {
        node,
        x,
        y,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        depth,
        isExpanded,
        children: childLayouts
      };
    };

    return buildLayout(mindmap, 0);
  }, [mindmap, collapsedIds]);

  // Coleta conexões SVG
  const connections = useMemo(() => {
    const paths: { from: { x: number; y: number }; to: { x: number; y: number }; color: MindmapNodeColor }[] = [];

    const traverse = (ln: LayoutNode) => {
      const startX = ln.x + ln.width;
      const startY = ln.y + ln.height / 2;

      ln.children.forEach(child => {
        const endX = child.x;
        const endY = child.y + child.height / 2;
        paths.push({
          from: { x: startX, y: startY },
          to: { x: endX, y: endY },
          color: child.node.color || 'royal'
        });
        traverse(child);
      });
    };

    traverse(layout);
    return paths;
  }, [layout]);

  // Lista plana de nós para renderização
  const flatNodes = useMemo(() => {
    const list: LayoutNode[] = [];
    const traverse = (ln: LayoutNode) => {
      list.push(ln);
      ln.children.forEach(traverse);
    };
    traverse(layout);
    return list;
  }, [layout]);

  // Limites da árvore (bounding box) para auto-enquadramento
  const treeBounds = useMemo(() => {
    if (flatNodes.length === 0) {
      return { minX: 0, maxX: 600, minY: 0, maxY: 400, width: 600, height: 400 };
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    flatNodes.forEach(ln => {
      if (ln.x < minX) minX = ln.x;
      if (ln.x + ln.width > maxX) maxX = ln.x + ln.width;
      if (ln.y < minY) minY = ln.y;
      if (ln.y + ln.height > maxY) maxY = ln.y + ln.height;
    });

    return {
      minX,
      maxX,
      minY,
      maxY,
      width: Math.max(100, maxX - minX),
      height: Math.max(80, maxY - minY)
    };
  }, [flatNodes]);

  // Função para enquadrar a árvore visível no container (auto-centralizar no mobile)
  const fitToView = useCallback(() => {
    const el = canvasContainerRef.current;
    if (!el) return;

    const containerW = el.clientWidth;
    const containerH = el.clientHeight;
    if (containerW <= 0 || containerH <= 0) return;

    const isMobile = containerW < 768;
    const minZoomAllowed = isMobile ? 0.25 : 0.4;

    // Descontar a barra de controles e margens de respiração
    const paddingX = isMobile ? 16 : 60;
    const paddingTop = isMobile ? 65 : 75;
    const paddingBottom = isMobile ? 24 : 60;

    const availableW = Math.max(100, containerW - paddingX * 2);
    const availableH = Math.max(100, containerH - paddingTop - paddingBottom);

    const scaleX = availableW / (treeBounds.width || 1);
    const scaleY = availableH / (treeBounds.height || 1);

    let targetZoom = Math.min(scaleX, scaleY);
    if (isMobile) {
      targetZoom = Math.min(targetZoom, 0.85);
    } else {
      targetZoom = Math.min(targetZoom, 1);
    }
    targetZoom = Math.max(minZoomAllowed, Math.min(1.4, targetZoom));
    targetZoom = Number(targetZoom.toFixed(2));

    // Pan centralizado
    let targetPanX = Math.round((containerW - treeBounds.width * targetZoom) / 2 - treeBounds.minX * targetZoom);
    const targetPanY = Math.round(paddingTop + (availableH - treeBounds.height * targetZoom) / 2 - treeBounds.minY * targetZoom);

    if (isMobile && targetPanX < paddingX) {
      targetPanX = paddingX - treeBounds.minX * targetZoom;
    }

    setZoom(targetZoom);
    setPan({ x: targetPanX, y: targetPanY });
  }, [treeBounds]);

  // Centralizar mapa (fitToView no mobile e reset padrão no desktop)
  const handleCenter = useCallback(() => {
    const el = canvasContainerRef.current;
    if (el && el.clientWidth < 768) {
      fitToView();
    } else {
      setZoom(1);
      setPan({ x: 80, y: 160 });
    }
  }, [fitToView]);

  // Auto-enquadrar no mobile na montagem da aba
  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) return;

    const timer = setTimeout(() => {
      if (el.clientWidth < 768) {
        fitToView();
      }
    }, 120);

    return () => clearTimeout(timer);
  }, [fitToView]);

  // ResizeObserver para re-enquadrar se a largura do container mudar no mobile
  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) return;

    let prevWidth = el.clientWidth;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const currentWidth = entry.contentRect.width;
        if (currentWidth < 768 && Math.abs(currentWidth - prevWidth) > 30) {
          prevWidth = currentWidth;
          fitToView();
        }
      }
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [fitToView]);

  // Clique no nó: abre painel lateral se possuir details, SEM alterar zoom ou pan
  const handleNodeClick = (node: MindmapNode) => {
    if (node.detail && Object.keys(node.detail).length > 0) {
      setSelectedNode(node);
    } else {
      setSelectedNode(null);
    }
  };

  // Largura do painel lateral em pixels/tailwind
  const panelWidthClass = panelWidth === 'focus' 
    ? 'w-full md:w-[750px] lg:w-[850px]' 
    : panelWidth === 'wide' 
      ? 'w-full md:w-[580px]' 
      : 'w-full md:w-[420px]';

  return (
    <div 
      ref={canvasContainerRef}
      className={`relative w-full h-full min-h-0 flex-1 overflow-hidden select-none transition-colors touch-none ${
        isDark 
          ? 'bg-[#0a0c10] bg-[radial-gradient(#1e2230_1px,transparent_1px)] [background-size:20px_20px]' 
          : 'bg-[#f8fafc] bg-[radial-gradient(#cbd5e1_1.5px,transparent_1.5px)] [background-size:20px_20px]'
      }`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleMouseUp}
      style={{ cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
    >
      {/* Barra de Ferramentas Flutuante (Zoom e Visualização) */}
      <div className={`absolute top-2 sm:top-4 left-2 sm:left-4 z-20 flex items-center gap-1 sm:gap-1.5 p-1 sm:p-1.5 rounded-xl backdrop-blur-md border shadow-xl max-w-[calc(100%-16px)] overflow-x-auto hide-scrollbar ${
        isDark ? 'bg-[#12151c]/90 border-gray-800 text-gray-300' : 'bg-white/95 border-slate-200 text-slate-700 shadow-slate-300/40'
      }`}>
        <button
          onClick={() => setZoom(z => Math.max(window.innerWidth < 768 ? 0.25 : 0.4, Number((z - 0.1).toFixed(1))))}
          className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-gray-300 hover:text-white hover:bg-gray-800' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
          title="Diminuir Zoom"
        >
          <ZoomOut size={16} />
        </button>
        <span className={`text-[11px] font-black px-2 min-w-[46px] text-center ${isDark ? 'text-gray-300' : 'text-slate-700'}`}>
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom(z => Math.min(1.6, Number((z + 0.1).toFixed(1))))}
          className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-gray-300 hover:text-white hover:bg-gray-800' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
          title="Aumentar Zoom"
        >
          <ZoomIn size={16} />
        </button>
        <div className={`w-[1px] h-4 mx-1 ${isDark ? 'bg-gray-800' : 'bg-slate-200'}`} />
        <button
          onClick={handleCenter}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition-colors ${
            isDark ? 'text-gray-300 hover:text-white hover:bg-gray-800' : 'text-slate-700 hover:text-[#002060] hover:bg-slate-100'
          }`}
          title="Centralizar Visualização"
        >
          <RotateCcw size={12} />
          <span>Centralizar</span>
        </button>
        <div className={`w-[1px] h-4 mx-1 ${isDark ? 'bg-gray-800' : 'bg-slate-200'}`} />
        <button
          onClick={expandAll}
          className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition-colors ${
            isDark ? 'text-gray-300 hover:text-white hover:bg-gray-800' : 'text-slate-700 hover:text-[#002060] hover:bg-slate-100'
          }`}
        >
          Expandir Tudo
        </button>
        <button
          onClick={collapseToPillars}
          className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition-colors ${
            isDark ? 'text-gray-300 hover:text-white hover:bg-gray-800' : 'text-slate-700 hover:text-[#002060] hover:bg-slate-100'
          }`}
        >
          Só Pilares
        </button>
      </div>

      {/* Canvas do Mapa */}
      <div 
        className="absolute top-0 left-0 w-full h-full transform-gpu origin-top-left pointer-events-none"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`
        }}
      >
        {/* Curvas SVG */}
        <svg 
          className="absolute top-0 left-0 w-[5000px] h-[5000px] overflow-visible pointer-events-none"
          style={{ zIndex: 1 }}
        >
          {connections.map((conn, idx) => {
            const dx = (conn.to.x - conn.from.x) / 2;
            const pathData = `M ${conn.from.x} ${conn.from.y} C ${conn.from.x + dx} ${conn.from.y}, ${conn.to.x - dx} ${conn.to.y}, ${conn.to.x} ${conn.to.y}`;
            const theme = COLOR_THEMES[conn.color] || COLOR_THEMES.royal;
            const strokeColor = isDark ? undefined : (LIGHT_CURVE_COLORS[conn.color] || '#0070c0');
            return (
              <path
                key={idx}
                d={pathData}
                fill="none"
                stroke={strokeColor || "currentColor"}
                strokeWidth={2.5}
                className={isDark ? `${theme.text} opacity-60` : 'opacity-75'}
                strokeLinecap="round"
              />
            );
          })}
        </svg>

        {/* Nós do Mapa */}
        {flatNodes.map(ln => {
          const node = ln.node;
          const isSelected = selectedNode?.id === node.id;
          const isCompleted = completedNodeIds.includes(node.id);
          const hasChildren = node.children && node.children.length > 0;
          const theme = COLOR_THEMES[node.color || 'royal'] || COLOR_THEMES.royal;
          const isRoot = ln.depth === 0;
          const nodeColorKey = (node.color || 'royal') as MindmapNodeColor;
          const lightBorderColor = LIGHT_NODE_BORDER_COLORS[nodeColorKey] || '#0070c0';

          let nodeClasses = '';
          const nodeInlineStyle: React.CSSProperties = {
            left: ln.x,
            top: ln.y,
            width: ln.width,
            height: ln.height,
            zIndex: isSelected ? 10 : 2
          };

          if (isDark) {
            nodeClasses = `p-3 border transition-all duration-150 flex flex-col justify-between group shadow-lg ${
              theme.bg
            } ${
              isSelected 
                ? 'ring-2 ring-white border-white scale-[1.02] shadow-[0_0_25px_rgba(255,255,255,0.2)]' 
                : `${theme.border} hover:border-gray-400`
            }`;
          } else {
            // TEMA CLARO
            if (isRoot) {
              nodeClasses = `p-3 border transition-all duration-150 flex flex-col justify-between group shadow-md bg-[#002060] border-[#002060] text-white ${
                isSelected ? 'ring-2 ring-blue-300 scale-[1.02] shadow-[0_4px_20px_rgba(0,32,96,0.35)]' : 'hover:brightness-110'
              }`;
            } else if (isCompleted) {
              nodeClasses = `p-3 border-2 border-[#10b981] bg-[#ecfdf5] transition-all duration-150 flex flex-col justify-between group shadow-sm ${
                isSelected ? 'ring-2 ring-emerald-500 scale-[1.02]' : 'hover:border-emerald-600'
              }`;
            } else {
              nodeClasses = `p-3 border border-slate-200 border-l-[5px] bg-white transition-all duration-150 flex flex-col justify-between group shadow-sm hover:shadow-md ${
                isSelected ? 'ring-2 ring-[#002060] scale-[1.02] shadow-[0_4px_16px_rgba(0,32,96,0.18)]' : 'hover:border-slate-300'
              }`;
              nodeInlineStyle.borderLeftColor = lightBorderColor;
            }
          }

          return (
            <div
              key={node.id}
              onClick={() => handleNodeClick(node)}
              className={`absolute pointer-events-auto rounded-xl ${nodeClasses}`}
              style={nodeInlineStyle}
            >
              {/* Topo do Nó: Badges e Check */}
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 overflow-hidden">
                  {node.badge && (
                    <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border truncate ${
                      isDark 
                        ? theme.badge 
                        : (isRoot 
                            ? 'bg-white/20 text-white border-white/30' 
                            : 'bg-slate-100 text-slate-700 border-slate-200')
                    }`}>
                      {node.badge}
                    </span>
                  )}
                  {node.bateria_id && (
                    <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded border shrink-0 ${
                      isDark
                        ? 'bg-red-950/60 text-red-400 border-red-800/60'
                        : 'bg-red-50 text-red-700 border-red-200'
                    }`}>
                      Bat. {node.bateria_id}
                    </span>
                  )}
                </div>

                {/* Checkbox de Conclusão (Com efeito cascata) */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleComplete(node.id);
                  }}
                  className={`p-1 rounded transition-colors ${
                    isCompleted 
                      ? 'text-emerald-500 hover:text-emerald-600' 
                      : (isDark 
                          ? 'text-gray-500 hover:text-gray-300' 
                          : (isRoot ? 'text-blue-200 hover:text-white' : 'text-slate-400 hover:text-slate-600'))
                  }`}
                  title={isCompleted ? 'Marcar como não concluído' : 'Marcar como concluído'}
                >
                  {isCompleted ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                </button>
              </div>

              {/* Título e Subtítulo */}
              <div className="min-w-0 my-0.5">
                <h4 className={`text-xs font-black truncate leading-tight ${
                  isDark
                    ? (isCompleted ? 'line-through text-gray-400' : 'text-white')
                    : (isRoot 
                        ? 'text-white' 
                        : (isCompleted ? 'line-through text-emerald-900' : 'text-[#0f172a]'))
                }`}>
                  {node.title}
                </h4>
                {node.subtitle && (
                  <p className={`text-[10px] truncate font-medium ${
                    isDark 
                      ? 'text-gray-400' 
                      : (isRoot ? 'text-blue-100' : (isCompleted ? 'text-emerald-700' : 'text-[#475569]'))
                  }`}>
                    {node.subtitle}
                  </p>
                )}
              </div>

              {/* Botão de Expandir/Recolher Filhos */}
              {hasChildren && (
                <button
                  onClick={(e) => toggleCollapse(node.id, e)}
                  className={`absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-black transition-transform ${
                    isDark 
                      ? 'bg-[#161a24] border-gray-700 text-gray-300 hover:text-white hover:border-gray-500' 
                      : 'bg-white border-slate-300 text-slate-700 hover:text-[#002060] hover:border-slate-400 shadow-sm'
                  } ${ln.isExpanded ? 'rotate-90' : ''}`}
                  title={ln.isExpanded ? 'Recolher ramos' : 'Expandir ramos'}
                >
                  <ChevronRight size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* PAINEL LATERAL DIREITO DE DETALHES (Mobile: Tela Cheia inset-0 | Desktop: Lateral) */}
      {selectedNode && (
        <aside 
          ref={asideRef}
          className={`absolute inset-0 md:inset-auto md:top-0 md:right-0 md:h-full ${customWidth ? '' : panelWidthClass} z-30 shadow-2xl flex flex-col ${
            isResizing 
              ? 'transition-none select-none' 
              : 'transition-[width] duration-150 animate-in slide-in-from-right'
          } ${
            isResizing ? 'border-l-2 !border-l-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.3)]' : ''
          } ${
            isDark 
              ? 'bg-[#0f121a]/95 backdrop-blur-xl md:border-l border-gray-800 text-gray-100' 
              : 'bg-white md:border-l border-slate-200 text-slate-800 shadow-slate-400/20'
          }`}
          style={{ ...(customWidth && typeof window !== 'undefined' && window.innerWidth >= 768 ? { width: `${customWidth}px`, maxWidth: '82%', minWidth: '340px' } : {}) }}
        >
          {/* Alça arrastável na borda esquerda do painel (apenas no desktop) */}
          <div
            onPointerDown={handleResizePointerDown}
            className={`hidden md:flex absolute top-0 -left-1.5 bottom-0 w-3 z-40 cursor-col-resize select-none touch-none items-center justify-center transition-colors group ${
              isResizing ? 'bg-blue-500/20' : 'hover:bg-blue-500/10'
            }`}
            style={{ touchAction: 'none' }}
            title="Arrastar para redimensionar largura do painel"
          >
            <div className={`w-[3px] h-12 rounded-full transition-colors ${
              isResizing ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]' : 'bg-gray-400/50 group-hover:bg-blue-400'
            }`} />
          </div>

          {/* Header do Painel */}
          <div className={`p-3.5 md:p-4 border-b flex items-center justify-between gap-2 shrink-0 ${
            isDark ? 'border-gray-800 bg-[#141822] text-white' : 'border-slate-200 bg-[#f8fafc] text-slate-900'
          }`}>
            <div className="flex items-center gap-2 min-w-0">
              {/* Botão Voltar ao Mapa no Mobile bem visível */}
              <button
                onClick={() => setSelectedNode(null)}
                className="flex md:hidden items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase transition-colors shrink-0 shadow-sm"
              >
                <X size={14} />
                <span>Voltar ao Mapa</span>
              </button>

              <button
                onClick={() => onToggleComplete(selectedNode.id)}
                className={`p-1 rounded shrink-0 ${
                  completedNodeIds.includes(selectedNode.id) 
                    ? 'text-emerald-500' 
                    : (isDark ? 'text-gray-500 hover:text-gray-300' : 'text-slate-400 hover:text-slate-600')
                }`}
                title="Concluir este ponto de estudo"
              >
                {completedNodeIds.includes(selectedNode.id) ? <CheckCircle2 size={18} /> : <Circle size={18} />}
              </button>
              <div className="min-w-0">
                <span className={`text-[9px] font-black uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>
                  Detalhes do Tópico
                </span>
                <h3 className={`text-sm font-black uppercase truncate ${isDark ? 'text-white' : 'text-[#0f172a]'}`}>
                  {selectedNode.title}
                </h3>
              </div>
            </div>

            {/* Controles de Largura, Zoom da Fonte e Fechar */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Zoom da Fonte A- / 100% / A+ */}
              <div className={`flex items-center rounded-lg p-0.5 border ${
                isDark ? 'bg-black/40 border-gray-800' : 'bg-slate-100 border-slate-200'
              }`}>
                <button
                  onClick={() => setPanelFontScale(s => Math.max(0.85, Number((s - 0.1).toFixed(2))))}
                  className={`px-1.5 py-0.5 text-[10px] font-bold ${isDark ? 'text-gray-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'}`}
                  title="Diminuir texto"
                >
                  A-
                </button>
                <span className={`text-[9px] font-mono px-1 ${isDark ? 'text-gray-500' : 'text-slate-500'}`}>
                  {Math.round(panelFontScale * 100)}%
                </span>
                <button
                  onClick={() => setPanelFontScale(s => Math.min(1.4, Number((s + 0.1).toFixed(2))))}
                  className={`px-1.5 py-0.5 text-[10px] font-bold ${isDark ? 'text-gray-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'}`}
                  title="Aumentar texto"
                >
                  A+
                </button>
              </div>

              {/* Botões de Largura (Padrão, Amplo, Foco) */}
              <div className={`hidden sm:flex items-center rounded-lg p-0.5 border text-[10px] font-bold ${
                isDark ? 'bg-black/40 border-gray-800' : 'bg-slate-100 border-slate-200'
              }`}>
                <button
                  onClick={() => { setPanelWidth('default'); setCustomWidth(null); }}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    panelWidth === 'default' && customWidth === null
                      ? (isDark ? 'bg-gray-800 text-white' : 'bg-white text-slate-900 shadow-sm') 
                      : (isDark ? 'text-gray-400 hover:text-white' : 'text-slate-600 hover:text-slate-900')
                  }`}
                >
                  Padrão
                </button>
                <button
                  onClick={() => { setPanelWidth('wide'); setCustomWidth(null); }}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    panelWidth === 'wide' && customWidth === null
                      ? (isDark ? 'bg-gray-800 text-white' : 'bg-white text-slate-900 shadow-sm') 
                      : (isDark ? 'text-gray-400 hover:text-white' : 'text-slate-600 hover:text-slate-900')
                  }`}
                >
                  Amplo
                </button>
                <button
                  onClick={() => { setPanelWidth('focus'); setCustomWidth(null); }}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    panelWidth === 'focus' && customWidth === null
                      ? (isDark ? 'bg-gray-800 text-white' : 'bg-white text-slate-900 shadow-sm') 
                      : (isDark ? 'text-gray-400 hover:text-white' : 'text-slate-600 hover:text-slate-900')
                  }`}
                >
                  Foco
                </button>
              </div>

              <button
                onClick={() => setSelectedNode(null)}
                className={`p-1 rounded-lg transition-colors ml-1 ${
                  isDark ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                }`}
                title="Fechar Painel"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Atalho para Questões da Bateria (Se o nó tiver bateria_id) */}
          {selectedNode.bateria_id && (
            <div className={`px-5 py-2.5 border-b flex items-center justify-between shrink-0 ${
              isDark ? 'bg-red-950/30 border-red-900/30 text-red-300' : 'bg-red-50 border-red-100 text-red-900'
            }`}>
              <span className={`text-xs font-bold ${isDark ? 'text-red-300' : 'text-red-800'}`}>
                Questões específicas deste assunto:
              </span>
              <button
                onClick={() => onNavigateToBateria(selectedNode.bateria_id!)}
                className="flex items-center gap-1.5 px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-[10px] font-black uppercase rounded-lg shadow-md transition-all active:scale-95"
              >
                <span>🎯 Questões Bateria {selectedNode.bateria_id}</span>
                <ExternalLink size={12} />
              </button>
            </div>
          )}

          {/* Conteúdo com Scroll e Escala de Fonte Proporcional */}
          <div 
            className="flex-1 p-5 overflow-y-auto overflow-x-auto space-y-4 custom-scrollbar"
            style={{ fontSize: `${panelFontScale * 0.875}rem` }}
          >
            {/* 1. Pega a Visão (Resumo) */}
            {selectedNode.detail?.resumo && (
              <div className={`p-4 rounded-xl border ${
                isDark 
                  ? 'bg-gradient-to-br from-blue-950/40 to-indigo-950/20 border-blue-900/40 text-gray-200' 
                  : 'bg-white border-slate-200 shadow-sm text-slate-700'
              }`}>
                <div className={`flex items-center gap-2 mb-2 ${isDark ? 'text-blue-400' : 'text-[#002060]'}`}>
                  <Lightbulb size={16} />
                  <span className="text-[10px] font-black uppercase tracking-wider">Pega a Visão</span>
                </div>
                <p className={`leading-relaxed font-medium ${isDark ? 'text-gray-200' : 'text-slate-700'}`}>
                  {selectedNode.detail.resumo}
                </p>
              </div>
            )}

            {/* 2. Texto da Lei (Lei Seca com Sanitização e incisos verticais) */}
            {selectedNode.detail?.lei_seca && selectedNode.detail.lei_seca.length > 0 && (
              <div 
                className={`p-4 rounded-xl italic ${isDark ? 'bg-[#0b0e14] border border-gray-800' : ''}`}
                style={!isDark ? { backgroundColor: 'transparent', border: '2px dashed #7f7f7f' } : undefined}
              >
                <div className={`flex items-center gap-2 mb-3 not-italic ${isDark ? 'text-sky-400' : 'text-[#002060]'}`}>
                  <BookOpen size={16} />
                  <span className="text-[10px] font-black uppercase tracking-wider not-italic">Texto da Lei</span>
                </div>
                <div className={`space-y-2 leading-relaxed italic ${isDark ? 'text-gray-200' : 'text-slate-800'}`}>
                  {selectedNode.detail.lei_seca.map((line, idx) => (
                    <div 
                      key={idx}
                      className={`border-l-2 pl-3 py-0.5 text-xs font-normal italic ${
                        isDark ? 'border-sky-900/60' : 'border-slate-400'
                      }`}
                      dangerouslySetInnerHTML={{ __html: sanitizeInteractiveHtml(line) }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 3. Números-Chave (Key Numbers) */}
            {selectedNode.detail?.key_numbers && selectedNode.detail.key_numbers.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {selectedNode.detail.key_numbers.map((kn, idx) => (
                  <div key={idx} className={`p-3 rounded-xl border text-center ${
                    isDark ? 'bg-[#141822] border-gray-800' : 'bg-white border-slate-200 shadow-sm'
                  }`}>
                    <span className={`text-lg font-black block ${isDark ? 'text-amber-400' : 'text-[#b45309]'}`}>{kn.value}</span>
                    <span className={`text-[10px] font-bold uppercase tracking-tight ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>{kn.label}</span>
                  </div>
                ))}
              </div>
            )}

            {/* 4. Pontos Críticos (Checklist) */}
            {selectedNode.detail?.checklist && selectedNode.detail.checklist.length > 0 && (
              <div className={`p-4 rounded-xl border ${
                isDark ? 'bg-[#121620] border-gray-800 text-gray-300' : 'bg-white border-slate-200 shadow-sm text-slate-800'
              }`}>
                <div className={`flex items-center gap-2 mb-2 ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                  <CheckSquare size={16} />
                  <span className="text-[10px] font-black uppercase tracking-wider">Pontos Críticos</span>
                </div>
                <ul className="space-y-1.5">
                  {selectedNode.detail.checklist.map((item, idx) => (
                    <li key={idx} className={`flex items-start gap-2 text-xs ${isDark ? 'text-gray-300' : 'text-slate-700'}`}>
                      <CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 5. Exemplo Prático */}
            {selectedNode.detail?.exemplo && (
              <div 
                className={`p-4 rounded-xl ${isDark ? 'bg-[#12151c] border border-purple-900/40' : ''}`}
                style={!isDark ? { backgroundColor: '#f0f9ff', border: '2px dashed #0070c0' } : undefined}
              >
                <div className={`flex items-center gap-2 mb-2 ${isDark ? 'text-purple-400' : 'text-[#0070c0]'}`}>
                  <Sparkles size={16} />
                  <span className="text-[10px] font-black uppercase tracking-wider">Exemplo Prático</span>
                </div>
                <p className={`text-xs leading-relaxed italic ${isDark ? 'text-gray-300' : 'text-slate-800'}`}>
                  &ldquo;{selectedNode.detail.exemplo}&rdquo;
                </p>
              </div>
            )}

            {/* 6. Atenção / Pegadinha */}
            {selectedNode.detail?.pegadinha && (
              <div 
                className={`p-4 rounded-xl ${isDark ? 'bg-amber-950/20 border border-amber-800/40' : ''}`}
                style={!isDark ? { backgroundColor: '#fef2f2', border: '2px solid #c00000' } : undefined}
              >
                <div className={`flex items-center gap-2 mb-2 ${isDark ? 'text-amber-400' : 'text-[#c00000]'}`}>
                  <AlertTriangle size={16} />
                  <span className="text-[10px] font-black uppercase tracking-wider">Atenção / Pegadinha</span>
                </div>
                <p className={`text-xs leading-relaxed ${isDark ? 'text-amber-200 font-medium' : 'text-red-950 font-semibold'}`}>
                  {selectedNode.detail.pegadinha}
                </p>
              </div>
            )}

            {/* 7. Blocos Customizados (Blocks) */}
            {selectedNode.detail?.blocks && selectedNode.detail.blocks.map((blk, idx) => (
              <div key={idx} className={`p-4 rounded-xl border space-y-1.5 ${
                isDark ? 'bg-[#131620] border-gray-800 text-gray-300' : 'bg-white border-slate-200 shadow-sm text-slate-800'
              }`}>
                {blk.title && (
                  <h5 className={`text-[11px] font-black uppercase tracking-wider ${isDark ? 'text-gray-300' : 'text-[#002060]'}`}>
                    {blk.title}
                  </h5>
                )}
                <div 
                  className="text-xs leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: sanitizeInteractiveHtml(blk.html) }}
                />
              </div>
            ))}
          </div>
        </aside>
      )}
    </div>
  );
}

// =========================================================================
// ABA 2 — QUADROS & LOUSA (MATRIZES COMPARATIVAS E REVISÃO ATIVA)
// =========================================================================

function MatricesTab({ matrices, isDark = false }: { matrices: InteractiveMatrix[]; isDark?: boolean }) {
  const [activeMatrixId, setActiveMatrixId] = useState<string>(matrices[0]?.id || '');
  const [revealAll, setRevealAll] = useState(true);
  const [revealedRows, setRevealedRows] = useState<Record<string, number>>({});

  const currentMatrix = useMemo(() => {
    return matrices.find(m => m.id === activeMatrixId) || matrices[0];
  }, [matrices, activeMatrixId]);

  const maxRows = currentMatrix?.rows?.length || 0;
  const currentRevealed = revealedRows[currentMatrix?.id || ''] ?? maxRows;

  const handleRevealNext = () => {
    if (!currentMatrix) return;
    setRevealedRows(prev => ({
      ...prev,
      [currentMatrix.id]: Math.min(maxRows, (prev[currentMatrix.id] ?? 0) + 1)
    }));
  };

  const handleToggleMode = () => {
    if (revealAll) {
      setRevealAll(false);
      setRevealedRows(prev => ({ ...prev, [currentMatrix.id]: 0 }));
    } else {
      setRevealAll(true);
      setRevealedRows(prev => ({ ...prev, [currentMatrix.id]: maxRows }));
    }
  };

  if (!currentMatrix) return null;

  return (
    <div className="p-3.5 sm:p-6 max-w-6xl mx-auto space-y-5 sm:space-y-6 w-full h-full min-h-0 overflow-y-auto custom-scrollbar">
      {/* Seletor de Quadros */}
      <div className={`flex flex-wrap items-center justify-between gap-3 border-b pb-4 ${isDark ? 'border-gray-800' : 'border-slate-200'}`}>
        <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar w-full sm:w-auto py-1">
          {matrices.map(m => (
            <button
              key={m.id}
              onClick={() => setActiveMatrixId(m.id)}
              className={`px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all border shrink-0 ${
                activeMatrixId === m.id
                  ? (isDark ? 'bg-red-600 border-red-600 text-white shadow-lg shadow-red-950/40' : 'bg-[#002060] border-[#002060] text-white shadow-md')
                  : (isDark ? 'bg-[#12151c] border-gray-800 text-gray-400 hover:text-white' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50')
              }`}
            >
              {m.title}
            </button>
          ))}
        </div>

        {/* Modo Revisão Ativa / Revelação */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleMode}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              isDark ? 'bg-gray-800 hover:bg-gray-700 text-gray-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
            }`}
          >
            {revealAll ? <EyeOff size={14} /> : <Eye size={14} />}
            <span>{revealAll ? 'Ativar Modo Treino' : 'Revelar Todas as Linhas'}</span>
          </button>
          {!revealAll && currentRevealed < maxRows && (
            <button
              onClick={handleRevealNext}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider shadow-md transition-all shrink-0"
            >
              Revelar Próxima Linha ({currentRevealed}/{maxRows})
            </button>
          )}
        </div>
      </div>

      {/* Cartão do Quadro Atual */}
      <div className="space-y-4">
        <div>
          <h3 className={`text-lg font-black uppercase tracking-tight ${isDark ? 'text-white' : 'text-[#0f172a]'}`}>
            {currentMatrix.title}
          </h3>
          {currentMatrix.subtitle && (
            <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>{currentMatrix.subtitle}</p>
          )}
        </div>

        {/* Tabela Comparativa (envolvida em overflow-x-auto w-full para mobile) */}
        <div className={`w-full rounded-xl border overflow-x-auto shadow-xl ${
          isDark ? 'border-gray-800 bg-[#0f121a]' : 'border-slate-200 bg-white shadow-slate-200/50'
        }`}>
          <table className={`w-full min-w-[540px] sm:min-w-full border-collapse text-left text-xs ${isDark ? 'border-gray-800' : 'border border-slate-200'}`}>
            <thead>
              <tr className={isDark ? 'border-b border-gray-800' : 'border-b border-slate-300'}>
                {currentMatrix.columns.map((col, idx) => {
                  const toneKey = (col.tone || 'navy').toLowerCase();
                  const solidHeaderBg = MATRIX_COLUMN_SOLID_COLORS[toneKey] || '#002060';
                  const theme = COLOR_THEMES[toneKey] || COLOR_THEMES.navy;
                  return (
                    <th
                      key={idx}
                      style={isDark ? undefined : { backgroundColor: solidHeaderBg, color: '#ffffff' }}
                      className={`p-3.5 font-bold uppercase tracking-wider text-xs border ${
                        isDark 
                          ? `border-gray-800/80 ${theme.bg} ${theme.text}` 
                          : 'border-slate-300 text-white font-bold'
                      }`}
                    >
                      {col.label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {currentMatrix.rows.map((row, rIdx) => {
                const isVisible = revealAll || rIdx < currentRevealed;
                if (!isVisible) return null;

                return (
                  <tr 
                    key={rIdx}
                    className={`transition-colors ${
                      isDark 
                        ? 'border-b border-gray-800/60 even:bg-white/[0.02] hover:bg-white/[0.04]' 
                        : 'border-b border-slate-200 even:bg-slate-50 hover:bg-blue-50/40'
                    }`}
                  >
                    {row.map((cell, cIdx) => (
                      <td
                        key={cIdx}
                        className={`p-3.5 font-medium leading-relaxed border ${
                          isDark 
                            ? 'text-gray-300 border-gray-800/60' 
                            : 'text-slate-800 border-slate-200'
                        }`}
                        dangerouslySetInnerHTML={{ __html: sanitizeInteractiveHtml(cell) }}
                      />
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Callout de Síntese ("Síntese de Ouro") em destaque abaixo da tabela */}
        {currentMatrix.callout && (
          <div className={`p-4 rounded-xl border flex items-start gap-3 mt-4 ${
            isDark 
              ? 'bg-red-950/20 border-red-800/60 text-red-200' 
              : 'bg-red-50/50 border-2 border-red-600 text-slate-900 shadow-sm'
          }`}>
            <div className={`p-1.5 rounded-lg shrink-0 ${isDark ? 'bg-red-900/40 text-red-400' : 'bg-red-600 text-white'}`}>
              <Lightbulb size={18} />
            </div>
            <div>
              <span className={`text-[10px] font-black uppercase tracking-wider block mb-0.5 ${
                isDark ? 'text-red-400' : 'text-red-700'
              }`}>
                Síntese de Ouro
              </span>
              <p className={`text-xs font-semibold leading-relaxed ${isDark ? 'text-red-200' : 'text-slate-800'}`}>
                {currentMatrix.callout}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// =========================================================================
// ABA 3 — QUESTÕES (FILTRAGEM POR BATERIA, ELIMINAÇÃO E COMENTÁRIO)
// =========================================================================

function QuestoesTab({
  questoes,
  baterias,
  selectedBateria,
  onSelectBateria,
  questionAnswers,
  testHistory = [],
  onSaveAnswer,
  onSaveTestHistory,
  onResetBattery,
  isDark = false
}: {
  questoes: InteractiveQuestao[];
  baterias: { id: string | number; titulo: string }[];
  selectedBateria: string | number;
  onSelectBateria: (bat: string | number) => void;
  questionAnswers: Record<number, QuestionAnswerData>;
  testHistory?: BatteryTestHistoryItem[];
  onSaveAnswer: (num: number, ans: QuestionAnswerData) => void;
  onSaveTestHistory?: (historyItem: BatteryTestHistoryItem, updatedAnswers?: Record<number, QuestionAnswerData>) => void;
  onResetBattery?: (updatedAnswers: Record<number, QuestionAnswerData>) => void;
  isDark?: boolean;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showSidePanel, setShowSidePanel] = useState(true);
  const [studyFilter, setStudyFilter] = useState<'all' | 'unresolved' | 'wrong'>('all');
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showQuestionHistory, setShowQuestionHistory] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // 1. Questões pertencentes à bateria atual (ou todas)
  const currentBatteryQuestions = useMemo(() => {
    if (selectedBateria === 'all') return questoes;
    return questoes.filter(q => String(q.bateria_id) === String(selectedBateria));
  }, [questoes, selectedBateria]);

  // Contadores para os filtros rápidos de estudo
  const filterCounts = useMemo(() => {
    let unresolved = 0;
    let wrong = 0;

    currentBatteryQuestions.forEach(q => {
      const ans = questionAnswers[q.numero];
      const isAnswered = Boolean(ans?.revealed && ans?.selected);
      if (!isAnswered) {
        unresolved++;
      } else {
        const isWrong = ans.lastIsCorrect === false || (ans.selected !== q.gabarito && ans.lastIsCorrect !== true);
        if (isWrong) {
          wrong++;
        }
      }
    });

    return {
      all: currentBatteryQuestions.length,
      unresolved,
      wrong
    };
  }, [currentBatteryQuestions, questionAnswers]);

  // Questões filtradas para exibição conforme o filtro de estudo (Todas | Não Resolvidas | Erradas)
  const filteredQuestoes = useMemo(() => {
    return currentBatteryQuestions.filter(q => {
      const ans = questionAnswers[q.numero];
      const isAnswered = Boolean(ans?.revealed && ans?.selected);

      if (studyFilter === 'unresolved') {
        return !isAnswered;
      }
      if (studyFilter === 'wrong') {
        return ans?.lastIsCorrect === false || (isAnswered && ans.selected !== q.gabarito && ans.lastIsCorrect !== true);
      }
      return true;
    });
  }, [currentBatteryQuestions, studyFilter, questionAnswers]);

  // Ajusta o índice ativo ao mudar bateria ou filtro de estudo
  useEffect(() => {
    setCurrentIndex(0);
  }, [selectedBateria, studyFilter]);

  // Garante que o currentIndex não aponte para fora dos limites se a lista diminuir (ex.: ao acertar uma errada)
  useEffect(() => {
    if (currentIndex >= filteredQuestoes.length && filteredQuestoes.length > 0) {
      setCurrentIndex(filteredQuestoes.length - 1);
    }
  }, [filteredQuestoes.length, currentIndex]);

  // 1. Estatísticas Gerais e da Bateria para as barras de progresso e desempenho
  const stats = useMemo(() => {
    // Progresso Geral
    const totalGeral = questoes.length;
    const respondidasGeral = questoes.filter(q => questionAnswers[q.numero]?.revealed && questionAnswers[q.numero]?.selected).length;
    const progressoGeralPct = totalGeral > 0 ? Math.round((respondidasGeral / totalGeral) * 100) : 0;

    // Desempenho da Bateria Atual
    const totalBateria = currentBatteryQuestions.length;
    const respondidasBateriaList = currentBatteryQuestions.filter(q => questionAnswers[q.numero]?.revealed && questionAnswers[q.numero]?.selected);
    const respondidasBateria = respondidasBateriaList.length;
    
    let acertosBateria = 0;
    let errosBateria = 0;
    respondidasBateriaList.forEach(q => {
      const ans = questionAnswers[q.numero];
      if (ans.selected === q.gabarito) {
        acertosBateria++;
      } else {
        errosBateria++;
      }
    });

    const aproveitamentoBateriaPct = respondidasBateria > 0 ? Math.round((acertosBateria / respondidasBateria) * 100) : 0;

    return {
      totalGeral,
      respondidasGeral,
      progressoGeralPct,
      totalBateria,
      respondidasBateria,
      acertosBateria,
      errosBateria,
      aproveitamentoBateriaPct
    };
  }, [questoes, currentBatteryQuestions, questionAnswers]);

  const currentQ = filteredQuestoes[currentIndex];

  const enunciado = currentQ?.enunciado ?? currentQ?.enunciation ?? '';
  const alternativas = currentQ?.alternativas ?? currentQ?.options ?? {};

  const currentAns: QuestionAnswerData = (currentQ && questionAnswers[currentQ.numero]) || { 
    selected: '', 
    revealed: false, 
    eliminated: [],
    attempts: [] 
  };
  const eliminatedList = currentAns.eliminated || [];
  const questionAttempts = currentAns.attempts || [];

  // Alterna eliminação / riscado de uma alternativa (com botão ✂)
  const toggleEliminate = (letter: string) => {
    if (!currentQ) return;
    const nextEliminated = eliminatedList.includes(letter)
      ? eliminatedList.filter(l => l !== letter)
      : [...eliminatedList, letter];

    onSaveAnswer(currentQ.numero, {
      ...currentAns,
      eliminated: nextEliminated
    });
  };

  const handleSelectAlternative = (letter: string) => {
    if (!currentQ || currentAns.revealed) return;
    onSaveAnswer(currentQ.numero, {
      ...currentAns,
      selected: letter
    });
  };

  // 1 & 3. Revelar Gabarito e Registrar Tentativa no Histórico da Questão
  const handleCheckAnswer = () => {
    if (!currentQ || !currentAns.selected) return;

    const isCurrentCorrect = currentAns.selected === currentQ.gabarito;
    const newAttempt: QuestionAttempt = {
      selected: currentAns.selected,
      isCorrect: isCurrentCorrect,
      timestamp: Date.now()
    };

    const updatedAttempts = [...(currentAns.attempts || []), newAttempt];

    onSaveAnswer(currentQ.numero, {
      ...currentAns,
      revealed: true,
      lastIsCorrect: isCurrentCorrect,
      attempts: updatedAttempts
    });
  };

  // 3. Permitir Refazer na hora: limpa a seleção da tentativa atual, mantendo o histórico de tentativas
  const handleResetAnswer = () => {
    if (!currentQ) return;
    onSaveAnswer(currentQ.numero, {
      ...currentAns,
      selected: '',
      revealed: false,
      eliminated: currentAns.eliminated || []
    });
  };

  // 3. Finalizar / Salvar Tentativa no Histórico Geral
  const handleFinishAttempt = () => {
    if (stats.respondidasBateria === 0) {
      alert('Responda pelo menos 1 questão desta bateria antes de finalizar.');
      return;
    }

    const bateriaTitulo = selectedBateria === 'all' 
      ? 'Todas as Baterias' 
      : (baterias.find(b => String(b.id) === String(selectedBateria))?.titulo || `Bateria ${selectedBateria}`);

    const historyItem: BatteryTestHistoryItem = {
      id: `test_${Date.now()}`,
      bateriaId: selectedBateria,
      bateriaTitulo,
      date: new Date().toLocaleDateString('pt-BR', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      }),
      timestamp: Date.now(),
      answered: stats.respondidasBateria,
      total: stats.totalBateria,
      correct: stats.acertosBateria,
      wrong: stats.errosBateria,
      accuracy: stats.aproveitamentoBateriaPct
    };

    if (onSaveTestHistory) {
      onSaveTestHistory(historyItem);
    }

    setSaveSuccessMsg('Tentativa registrada com sucesso no seu histórico!');
    setTimeout(() => setSaveSuccessMsg(null), 4000);
    setShowHistoryModal(true);
  };

  // 3. Iniciar Novo Teste (reseta as respostas da rodada atual na bateria, mantendo todos os históricos)
  const handleStartNewTest = () => {
    if (!confirm('Deseja iniciar um Novo Teste nesta bateria? As respostas da rodada atual serão limpas para novo treino, e o seu histórico de tentativas permanecerá gravado.')) {
      return;
    }

    const updated: Record<number, QuestionAnswerData> = { ...questionAnswers };
    currentBatteryQuestions.forEach(q => {
      const prev = updated[q.numero];
      if (prev) {
        updated[q.numero] = {
          ...prev,
          selected: '',
          revealed: false
        };
      }
    });

    if (onResetBattery) {
      onResetBattery(updated);
    }
    setCurrentIndex(0);
  };

  const isCorrect = currentAns.revealed && currentAns.selected === currentQ?.gabarito;
  const questionNumberFormatted = currentQ ? String(currentQ.numero || currentIndex + 1).padStart(2, '0') : '00';
  const bancaFormatted = currentQ?.banca ? currentQ.banca.toUpperCase() : 'GERAL';
  const artigoVinculado = currentQ ? ((currentQ as any).artigo || (currentQ as any).artigos || (currentQ as any).lei) : null;

  return (
    <div className={`p-3 sm:p-4 md:p-6 w-full h-full min-h-0 flex flex-col space-y-4 max-w-7xl mx-auto overflow-y-auto md:overflow-hidden custom-scrollbar ${
      isDark ? 'text-gray-100' : 'text-slate-800'
    }`}>
      {/* 1. BARRAS DE PROGRESSO GERAL E DESEMPENHO DA BATERIA */}
      <div className={`p-3.5 md:p-4 rounded-2xl border flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 shrink-0 transition-colors ${
        isDark ? 'bg-[#0f121a] border-gray-800' : 'bg-white border-slate-200 shadow-sm'
      }`}>
        {/* Progresso Geral */}
        <div className="flex-1 min-w-[220px] space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className={`font-black uppercase tracking-wider text-[11px] ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>
              Progresso Geral
            </span>
            <span className={`font-bold ${isDark ? 'text-gray-200' : 'text-slate-700'}`}>
              Respondidas: <strong className={isDark ? 'text-white' : 'text-slate-900'}>{stats.respondidasGeral}</strong> / {stats.totalGeral} ({stats.progressoGeralPct}%)
            </span>
          </div>
          <div className={`w-full h-2 rounded-full overflow-hidden ${isDark ? 'bg-gray-800' : 'bg-slate-100'}`}>
            <div 
              className="h-full bg-blue-600 transition-all duration-300 rounded-full"
              style={{ width: `${stats.progressoGeralPct}%` }}
            />
          </div>
        </div>

        {/* Divisor vertical */}
        <div className={`hidden md:block w-px h-8 ${isDark ? 'bg-gray-800' : 'bg-slate-200'}`} />

        {/* Desempenho da Bateria Atual */}
        <div className="flex-1 min-w-[260px] space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className={`font-black uppercase tracking-wider text-[11px] ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>
              Desempenho da Bateria
            </span>
            <div className="flex items-center gap-2 font-bold text-[11px]">
              <span className="text-emerald-500 font-black flex items-center gap-0.5">
                ✓ {stats.acertosBateria} {stats.acertosBateria === 1 ? 'acerto' : 'acertos'}
              </span>
              <span className="text-red-500 font-black flex items-center gap-0.5">
                ✗ {stats.errosBateria} {stats.errosBateria === 1 ? 'erro' : 'erros'}
              </span>
              <span className={`px-1.5 py-0.5 rounded font-black ${
                stats.aproveitamentoBateriaPct >= 80 
                  ? 'bg-emerald-500/10 text-emerald-500' 
                  : stats.aproveitamentoBateriaPct >= 60 
                    ? 'bg-amber-500/10 text-amber-500' 
                    : 'bg-red-500/10 text-red-500'
              }`}>
                {stats.aproveitamentoBateriaPct}%
              </span>
            </div>
          </div>
          {/* Barra segmentada acertos / erros */}
          <div className={`w-full h-2 rounded-full overflow-hidden flex ${isDark ? 'bg-gray-800' : 'bg-slate-100'}`}>
            <div 
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: stats.totalBateria > 0 ? `${(stats.acertosBateria / stats.totalBateria) * 100}%` : '0%' }}
              title={`Acertos: ${stats.acertosBateria}`}
            />
            <div 
              className="h-full bg-red-500 transition-all duration-300"
              style={{ width: stats.totalBateria > 0 ? `${(stats.errosBateria / stats.totalBateria) * 100}%` : '0%' }}
              title={`Erros: ${stats.errosBateria}`}
            />
          </div>
        </div>

        {/* Ações da Bateria: Finalizar Tentativa, Novo Teste, Histórico */}
        <div className="flex items-center gap-1.5 shrink-0 self-end md:self-center">
          <button
            onClick={handleFinishAttempt}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition-all active:scale-95"
            title="Salvar e finalizar esta tentativa no histórico"
          >
            <Flag size={13} />
            <span>Finalizar</span>
          </button>
          <button
            onClick={handleStartNewTest}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
              isDark 
                ? 'bg-gray-800 hover:bg-gray-700 text-gray-200 border-gray-700' 
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
            }`}
            title="Iniciar nova rodada de teste nesta bateria"
          >
            <RotateCcw size={13} />
            <span>Novo Teste</span>
          </button>
          <button
            onClick={() => setShowHistoryModal(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
              isDark 
                ? 'bg-[#141822] hover:bg-[#1b2232] text-sky-400 border-gray-800' 
                : 'bg-white hover:bg-slate-50 text-[#002060] border-slate-200 shadow-sm'
            }`}
            title="Ver histórico de tentativas e desempenho anterior"
          >
            <BarChart3 size={13} />
            <span>Histórico ({testHistory.length})</span>
          </button>
        </div>
      </div>

      {/* 2. BARRA DE FILTROS: SELETOR DE BATERIA + FILTROS RÁPIDOS (Todas | Não Resolvidas | Erradas) */}
      <div className={`flex flex-wrap items-center justify-between gap-3 pb-3 border-b shrink-0 ${
        isDark ? 'border-gray-800' : 'border-slate-200'
      }`}>
        <div className="flex flex-wrap items-center gap-2">
          {/* Seletor de Bateria */}
          <div className="flex items-center gap-1.5 text-xs font-bold">
            <Filter size={14} className={isDark ? 'text-gray-400' : 'text-slate-500'} />
            <select
              value={selectedBateria}
              onChange={e => onSelectBateria(e.target.value)}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold outline-none transition-colors border ${
                isDark 
                  ? 'bg-[#12151c] border-gray-800 text-white focus:border-red-600' 
                  : 'bg-white border-slate-200 text-slate-800 focus:border-[#002060] shadow-sm'
              }`}
            >
              <option value="all">Todas as Baterias ({questoes.length})</option>
              {baterias.map(b => (
                <option key={b.id} value={b.id}>
                  Bateria {b.id} — {b.titulo}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Botões de Filtro Rápido de Estudo (Todas | Não Resolvidas | Erradas) */}
          <div className={`flex items-center rounded-xl p-0.5 border text-xs font-bold ${
            isDark ? 'bg-black/40 border-gray-800' : 'bg-slate-100 border-slate-200'
          }`}>
            <button
              onClick={() => setStudyFilter('all')}
              className={`px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 ${
                studyFilter === 'all'
                  ? (isDark ? 'bg-gray-800 text-white shadow-sm' : 'bg-white text-slate-900 shadow-sm')
                  : (isDark ? 'text-gray-400 hover:text-white' : 'text-slate-600 hover:text-slate-900')
              }`}
            >
              <span>Todas</span>
              <span className={`text-[10px] px-1 py-0.2 rounded-full ${
                studyFilter === 'all' 
                  ? (isDark ? 'bg-gray-700 text-white' : 'bg-slate-100 text-slate-700') 
                  : 'opacity-70'
              }`}>
                {filterCounts.all}
              </span>
            </button>

            <button
              onClick={() => setStudyFilter('unresolved')}
              className={`px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 ${
                studyFilter === 'unresolved'
                  ? (isDark ? 'bg-gray-800 text-white shadow-sm' : 'bg-white text-slate-900 shadow-sm')
                  : (isDark ? 'text-gray-400 hover:text-white' : 'text-slate-600 hover:text-slate-900')
              }`}
            >
              <span>Não Resolvidas</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                filterCounts.unresolved > 0 
                  ? (isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-700') 
                  : 'opacity-70'
              }`}>
                {filterCounts.unresolved}
              </span>
            </button>

            <button
              onClick={() => setStudyFilter('wrong')}
              className={`px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 ${
                studyFilter === 'wrong'
                  ? (isDark ? 'bg-red-950/60 text-red-200 border border-red-800 shadow-sm' : 'bg-red-50 text-red-700 border border-red-200 shadow-sm font-black')
                  : (filterCounts.wrong > 0 ? 'text-red-500 hover:text-red-600 font-bold' : (isDark ? 'text-gray-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'))
              }`}
            >
              <span>Erradas</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                filterCounts.wrong > 0 ? 'bg-red-500 text-white' : 'opacity-70'
              }`}>
                {filterCounts.wrong}
              </span>
            </button>
          </div>

          <span className={`text-xs font-bold ml-2 ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>
            {filteredQuestoes.length > 0 
              ? `Questão ${String(currentIndex + 1).padStart(2, '0')} de ${String(filteredQuestoes.length).padStart(2, '0')}`
              : 'Nenhuma questão encontrada'}
          </span>
        </div>

        {/* Botão Expandir / Ocultar Sessão Direita */}
        <button
          onClick={() => setShowSidePanel(prev => !prev)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
            isDark 
              ? 'bg-[#141822] hover:bg-[#1a2030] text-gray-200 border-gray-800' 
              : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-sm'
          }`}
          title={showSidePanel ? "Ocultar Gabarito e Comentário (Foco na Resolução)" : "Mostrar Gabarito e Comentário"}
        >
          {showSidePanel ? (
            <>
              <EyeOff size={14} className={isDark ? 'text-amber-400' : 'text-slate-500'} />
              <span>Ocultar Gabarito</span>
            </>
          ) : (
            <>
              <BookOpen size={14} className={isDark ? 'text-emerald-400' : 'text-[#002060]'} />
              <span>Mostrar Gabarito</span>
            </>
          )}
        </button>
      </div>

      {/* Pílulas de Navegação Rápida (01, 02, 03...) */}
      {filteredQuestoes.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar shrink-0 py-1">
          {filteredQuestoes.map((q, idx) => {
            const ans = questionAnswers[q.numero];
            const isAnswered = ans?.revealed && ans?.selected;
            const isRight = isAnswered && ans.selected === q.gabarito;
            const isWrong = isAnswered && ans.selected !== q.gabarito;
            const isCurrent = idx === currentIndex;
            const numLabel = String(idx + 1).padStart(2, '0');

            return (
              <button
                key={q.numero}
                onClick={() => setCurrentIndex(idx)}
                className={`h-7 px-2 rounded-lg text-xs font-black flex items-center justify-center shrink-0 border transition-all ${
                  isCurrent 
                    ? (isDark 
                        ? 'border-white text-white bg-white/20 scale-105 shadow-md' 
                        : 'border-[#002060] bg-[#002060] text-white scale-105 shadow-md')
                    : isRight 
                      ? (isDark ? 'bg-emerald-950/60 border-emerald-600 text-emerald-300' : 'bg-emerald-100 border-emerald-400 text-emerald-800')
                      : isWrong 
                        ? (isDark ? 'bg-red-950/60 border-red-600 text-red-300' : 'bg-red-100 border-red-400 text-red-800')
                        : (isDark ? 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100 shadow-sm')
                }`}
                title={`Questão ${numLabel}${isAnswered ? (isRight ? ' (Correta)' : ' (Incorreta)') : ''}`}
              >
                {numLabel}
              </button>
            );
          })}
        </div>
      )}

      {/* Se não houver questões no filtro atual */}
      {filteredQuestoes.length === 0 ? (
        <div className={`flex-1 min-h-0 flex flex-col items-center justify-center p-8 rounded-2xl border text-center space-y-3 ${
          isDark ? 'bg-[#0f121a] border-gray-800' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <CheckCircle2 size={40} className="text-emerald-500 mx-auto" />
          <h3 className="text-sm font-black uppercase">
            {studyFilter === 'wrong' 
              ? 'Nenhuma questão errada no momento!' 
              : studyFilter === 'unresolved' 
                ? 'Todas as questões desta bateria já foram resolvidas!' 
                : 'Nenhuma questão encontrada para este filtro.'}
          </h3>
          <p className={`text-xs max-w-md ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>
            {studyFilter === 'wrong' 
              ? 'Parabéns! Todas as questões registradas foram respondidas com acerto na última tentativa.' 
              : 'Você pode alternar para "Todas as Questões" ou iniciar um Novo Teste para treinar novamente.'}
          </p>
          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={() => setStudyFilter('all')}
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors ${
                isDark ? 'bg-gray-800 hover:bg-gray-700 text-white border-gray-700' : 'bg-[#002060] text-white hover:bg-blue-900'
              }`}
            >
              Ver Todas as Questões ({filterCounts.all})
            </button>
            <button
              onClick={handleStartNewTest}
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors ${
                isDark ? 'bg-gray-800 hover:bg-gray-700 text-white border-gray-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
              }`}
            >
              Iniciar Novo Teste
            </button>
          </div>
        </div>
      ) : (
        /* LAYOUT EM 2 COLUNAS (Mobile: empilhado flex-col | Desktop: lado a lado md:flex-row) */
        <div className={`flex flex-col ${showSidePanel ? 'md:flex-row' : 'flex-col'} gap-5 flex-1 min-h-0 overflow-visible md:overflow-hidden`}>
          {/* COLUNA ESQUERDA (Questão) */}
          <div className={`${showSidePanel ? 'w-full md:flex-1' : 'w-full'} flex flex-col min-h-0 md:h-full md:overflow-hidden shrink-0 md:shrink`}>
            <div className={`flex-1 min-h-0 flex flex-col rounded-2xl border p-4 sm:p-5 md:p-6 shadow-sm overflow-hidden ${
              isDark 
                ? 'bg-[#0f121a] border-gray-800 text-gray-100 shadow-xl' 
                : 'bg-white border-slate-200 text-slate-800'
            }`}>
              {/* Metadados do Topo da Questão */}
              <div className={`flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b shrink-0 ${
                isDark ? 'border-gray-800' : 'border-slate-100'
              }`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-lg ${
                    isDark ? 'bg-red-600/20 text-red-400 border border-red-500/30' : 'bg-slate-100 text-[#002060] font-bold border border-slate-200'
                  }`}>
                    QUESTÃO {questionNumberFormatted} • {bancaFormatted}
                  </span>
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                    isDark ? 'text-gray-400 bg-gray-800 border-gray-700' : 'text-slate-600 bg-slate-50 border-slate-200'
                  }`}>
                    Bateria {currentQ.bateria_id}
                  </span>
                  {artigoVinculado && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                      isDark ? 'text-amber-400 bg-amber-950/40 border-amber-800/60' : 'text-amber-700 bg-amber-50 border-amber-200'
                    }`}>
                      {artigoVinculado}
                    </span>
                  )}
                </div>

                {/* Botão Refazer na Coluna Esquerda quando o painel lateral estiver oculto */}
                {!showSidePanel && currentAns.revealed && (
                  <button
                    onClick={handleResetAnswer}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold border transition-colors ${
                      isDark ? 'bg-gray-800 hover:bg-gray-700 text-gray-200 border-gray-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                    }`}
                    title="Limpar e refazer esta questão"
                  >
                    <RotateCcw size={13} />
                    <span>Refazer</span>
                  </button>
                )}
              </div>

              {/* Corpo Rolável da Questão: Enunciado e Alternativas */}
              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 space-y-5">
                {/* Enunciado */}
                <p className={`text-sm md:text-base font-medium leading-relaxed whitespace-pre-line ${
                  isDark ? 'text-gray-100' : 'text-slate-800'
                }`}>
                  {enunciado}
                </p>

                {/* Alternativas A-E */}
                <div className="space-y-3 pt-2">
                  {Object.entries(alternativas || {}).map(([letter, text]) => {
                    const isSelected = currentAns.selected === letter;
                    const isEliminated = eliminatedList.includes(letter);
                    const isCorrectOption = currentAns.revealed && letter === currentQ.gabarito;
                    const isWrongSelection = currentAns.revealed && isSelected && !isCorrectOption;

                    return (
                      <div
                        key={letter}
                        onClick={() => !isEliminated && handleSelectAlternative(letter)}
                        className={`relative flex items-start gap-3 p-3.5 md:p-4 rounded-xl border transition-all cursor-pointer ${
                          isEliminated 
                            ? (isDark ? 'opacity-35 bg-black/20 border-dashed border-gray-800' : 'opacity-40 bg-slate-100/60 border-dashed border-slate-300')
                            : isCorrectOption 
                              ? (isDark ? 'bg-emerald-950/40 border-emerald-500 text-emerald-200 shadow-md shadow-emerald-950/30' : 'bg-emerald-50 border-2 border-emerald-500 text-emerald-900 shadow-sm')
                              : isWrongSelection 
                                ? (isDark ? 'bg-red-950/40 border-red-600 text-red-200 shadow-md shadow-red-950/30' : 'bg-red-50 border-2 border-red-500 text-red-900 shadow-sm')
                                : isSelected 
                                  ? (isDark ? 'bg-red-600/10 border-red-600 text-white shadow-md shadow-red-950/20' : 'bg-blue-50/70 border-2 border-[#002060] text-slate-900 shadow-sm')
                                  : (isDark ? 'bg-[#141822] border-gray-800/80 hover:border-gray-700 text-gray-300' : 'bg-slate-50/50 border-slate-200 hover:border-slate-300 text-slate-800')
                        }`}
                      >
                        {/* Letra da Alternativa */}
                        <span className={`w-7 h-7 rounded-lg text-xs font-black flex items-center justify-center shrink-0 border transition-colors ${
                          isSelected 
                            ? (isDark ? 'bg-red-600 text-white border-red-500' : 'bg-[#002060] text-white border-[#002060]')
                            : isCorrectOption
                              ? 'bg-emerald-600 text-white border-emerald-500'
                              : (isDark ? 'bg-gray-800/80 text-gray-300 border-gray-700' : 'bg-white text-slate-700 border-slate-300 shadow-sm')
                        }`}>
                          {letter}
                        </span>

                        {/* Texto da Alternativa */}
                        <p className={`flex-1 text-xs md:text-sm leading-relaxed font-medium ${
                          isEliminated ? 'line-through text-gray-400' : ''
                        }`}>
                          {text}
                        </p>

                        {/* Botão de Riscar / Eliminar Alternativa (✂) */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleEliminate(letter);
                          }}
                          className={`p-1.5 rounded-lg border transition-colors shrink-0 flex items-center gap-1 ${
                            isEliminated 
                              ? (isDark ? 'bg-amber-950/50 border-amber-800 text-amber-400' : 'bg-amber-100 border-amber-300 text-amber-800')
                              : (isDark ? 'border-gray-800 text-gray-500 hover:text-gray-300 hover:border-gray-700' : 'border-slate-200 text-slate-400 hover:text-slate-700 hover:border-slate-300')
                          }`}
                          title={isEliminated ? 'Restaurar alternativa' : 'Riscar alternativa (distrator)'}
                        >
                          <Scissors size={12} className={isEliminated ? 'rotate-90' : ''} />
                          <span className="text-[10px] font-bold">
                            {isEliminated ? 'Desfazer' : 'Riscar'}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* 3. BLOCO COLAPSÁVEL DISCRETO: HISTÓRICO DESTA QUESTÃO (X TENTATIVAS) */}
                {questionAttempts.length > 0 && (
                  <div className={`mt-4 pt-3 border-t rounded-xl ${isDark ? 'border-gray-800' : 'border-slate-100'}`}>
                    <button
                      type="button"
                      onClick={() => setShowQuestionHistory(h => !h)}
                      className={`flex items-center justify-between w-full text-xs font-bold px-2 py-1.5 rounded-lg transition-colors ${
                        isDark ? 'hover:bg-white/5 text-gray-400' : 'hover:bg-slate-50 text-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <History size={13} className="text-sky-500" />
                        <span>
                          Histórico desta questão ({questionAttempts.length} tentativa{questionAttempts.length === 1 ? '' : 's'})
                        </span>
                      </div>
                      {showQuestionHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>

                    {showQuestionHistory && (
                      <div className="mt-2 space-y-1.5 pl-2 animate-in fade-in">
                        {questionAttempts.slice().reverse().map((att, aIdx) => (
                          <div 
                            key={aIdx} 
                            className={`flex items-center justify-between text-xs py-1 px-2.5 rounded-lg border ${
                              att.isCorrect 
                                ? (isDark ? 'bg-emerald-950/30 border-emerald-900/40 text-emerald-300' : 'bg-emerald-50/60 border-emerald-200 text-emerald-800')
                                : (isDark ? 'bg-red-950/30 border-red-900/40 text-red-300' : 'bg-red-50/60 border-red-200 text-red-800')
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-bold">
                                Tentativa #{questionAttempts.length - aIdx}:
                              </span>
                              <span>Marcou <strong>{att.selected}</strong></span>
                              <span className="font-black text-[11px]">
                                {att.isCorrect ? '✓ Acertou' : '✗ Errou'}
                              </span>
                            </div>
                            <span className={`text-[10px] ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>
                              {new Date(att.timestamp).toLocaleString('pt-BR', { 
                                day: '2-digit', 
                                month: '2-digit', 
                                hour: '2-digit', 
                                minute: '2-digit' 
                              })}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Rodapé quando painel lateral está oculto */}
              {!showSidePanel && (
                <div className={`pt-4 mt-3 border-t flex flex-wrap items-center justify-between gap-3 shrink-0 ${
                  isDark ? 'border-gray-800' : 'border-slate-200'
                }`}>
                  <div className="flex items-center gap-2">
                    {!currentAns.revealed ? (
                      <button
                        onClick={handleCheckAnswer}
                        disabled={!currentAns.selected}
                        className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-black uppercase tracking-wider shadow-md transition-all active:scale-95"
                      >
                        ✓ Revelar Gabarito
                      </button>
                    ) : (
                      <span className="text-xs font-bold">
                        Gabarito Oficial: <strong className={isDark ? 'text-white' : 'text-[#002060]'}>{currentQ.gabarito}</strong>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
                      disabled={currentIndex === 0}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                        isDark ? 'bg-gray-800 hover:bg-gray-700 text-white border-gray-700' : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 shadow-sm'
                      }`}
                    >
                      <ArrowLeft size={14} /> Anterior
                    </button>
                    <button
                      onClick={() => setCurrentIndex(i => Math.min(filteredQuestoes.length - 1, i + 1))}
                      disabled={currentIndex === filteredQuestoes.length - 1}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                        isDark ? 'bg-gray-800 hover:bg-gray-700 text-white border-gray-700' : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 shadow-sm'
                      }`}
                    >
                      Próxima <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* COLUNA DIREITA (Gabarito & Comentário) */}
          {showSidePanel && (
            <div className="w-full md:w-[380px] lg:w-[440px] shrink-0 flex flex-col min-h-0 md:h-full md:overflow-hidden">
              <div className={`flex-1 min-h-0 flex flex-col rounded-2xl border p-4 sm:p-5 shadow-sm overflow-hidden ${
                isDark 
                  ? 'bg-[#0f121a] border-gray-800 text-gray-100 shadow-xl' 
                  : 'bg-white border-slate-200 text-slate-800'
              }`}>
                {/* Topo da Coluna Direita: Botões Revelar Gabarito e Refazer */}
                <div className="space-y-3 pb-3 border-b shrink-0 border-inherit">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <BookOpen size={16} className={isDark ? 'text-sky-400' : 'text-[#002060]'} />
                      <span className="text-xs font-black uppercase tracking-wider">
                        Gabarito & Comentário
                      </span>
                    </div>

                    {/* 3. Permitir Refazer na hora */}
                    {currentAns.revealed && (
                      <button
                        onClick={handleResetAnswer}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${
                          isDark 
                            ? 'bg-gray-800 hover:bg-gray-700 text-gray-200 border-gray-700' 
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300 shadow-sm'
                        }`}
                        title="Limpar seleção e responder novamente"
                      >
                        <RotateCcw size={12} />
                        <span>Refazer</span>
                      </button>
                    )}
                  </div>

                  {!currentAns.revealed ? (
                    <button
                      onClick={handleCheckAnswer}
                      disabled={!currentAns.selected}
                      className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-black uppercase tracking-wider shadow-md transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                      <CheckSquare size={16} />
                      <span>✓ Revelar Gabarito</span>
                    </button>
                  ) : (
                    /* Banner de Resultado e Gabarito Oficial */
                    <div className={`p-3.5 rounded-xl border space-y-1.5 ${
                      isCorrect 
                        ? (isDark ? 'bg-emerald-950/40 border-emerald-600 text-emerald-200' : 'bg-emerald-50 border-2 border-emerald-500 text-emerald-900')
                        : (isDark ? 'bg-red-950/40 border-red-600 text-red-200' : 'bg-red-50 border-2 border-red-500 text-red-900')
                    }`}>
                      <div className="flex items-center gap-2 font-black text-xs">
                        {isCorrect ? <CheckCircle2 size={16} className="text-emerald-500" /> : <AlertTriangle size={16} className="text-red-500" />}
                        <span>{isCorrect ? 'Resposta Correta! Parabéns!' : 'Resposta Incorreta!'}</span>
                      </div>
                      <div className="text-xs font-bold flex items-center justify-between pt-1 border-t border-inherit/40">
                        <span>Sua seleção: <strong>{currentAns.selected || '-'}</strong></span>
                        <span>Gabarito Oficial: <strong className="text-sm underline">{currentQ.gabarito}</strong></span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Comentário do Professor com rolagem própria */}
                <div className="flex-1 min-h-0 flex flex-col pt-3 overflow-hidden">
                  <span className={`text-[11px] font-black uppercase tracking-wider block mb-2 ${
                    isDark ? 'text-gray-400' : 'text-slate-500'
                  }`}>
                    💡 Comentário do Professor
                  </span>

                  <div className={`flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 rounded-xl border ${
                    isDark ? 'bg-[#141822] border-gray-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                    {currentAns.revealed ? (
                      currentQ.comentario ? (
                        <div className="space-y-2">
                          <p className={`text-xs md:text-sm leading-relaxed whitespace-pre-line font-medium ${
                            isDark ? 'text-gray-200' : 'text-slate-800'
                          }`}>
                            {currentQ.comentario}
                          </p>
                        </div>
                      ) : (
                        <p className={`text-xs italic ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>
                          Nenhum comentário cadastrado para esta questão. Gabarito oficial confirmado: {currentQ.gabarito}.
                        </p>
                      )
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center p-4 space-y-2">
                        <BookOpen size={24} className={isDark ? 'text-gray-600' : 'text-slate-400'} />
                        <p className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>
                          Selecione uma alternativa e clique em <strong>Revelar Gabarito</strong> para conferir sua resposta e desbloquear a fundamentação do professor.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Rodapé com Navegação: Anterior / Próxima */}
                <div className={`pt-4 mt-3 border-t flex items-center justify-between gap-2 shrink-0 ${
                  isDark ? 'border-gray-800' : 'border-slate-100'
                }`}>
                  <button
                    onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
                    disabled={currentIndex === 0}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-bold border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                      isDark 
                        ? 'bg-gray-800 hover:bg-gray-700 text-white border-gray-700' 
                        : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 shadow-sm'
                    }`}
                  >
                    <ArrowLeft size={14} />
                    <span>◀ Anterior</span>
                  </button>
                  <button
                    onClick={() => setCurrentIndex(i => Math.min(filteredQuestoes.length - 1, i + 1))}
                    disabled={currentIndex === filteredQuestoes.length - 1}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-bold border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                      isDark 
                        ? 'bg-gray-800 hover:bg-gray-700 text-white border-gray-700' 
                        : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 shadow-sm'
                    }`}
                  >
                    <span>Próxima ▶</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. MODAL: MEU HISTÓRICO DE DESEMPENHO */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className={`w-full max-w-2xl max-h-[85vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden ${
            isDark ? 'bg-[#0f121a] border-gray-800 text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            {/* Header do Modal */}
            <div className={`p-4 border-b flex items-center justify-between shrink-0 ${
              isDark ? 'border-gray-800 bg-[#141822]' : 'border-slate-200 bg-slate-50'
            }`}>
              <div className="flex items-center gap-2">
                <BarChart3 className="text-emerald-500" size={18} />
                <h3 className="text-sm font-black uppercase tracking-wider">
                  Meu Histórico de Desempenho
                </h3>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className={`p-1.5 rounded-lg transition-colors ${
                  isDark ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-slate-200 text-slate-500'
                }`}
              >
                <X size={18} />
              </button>
            </div>

            {/* Conteúdo do Modal */}
            <div className="p-5 flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-4">
              {saveSuccessMsg && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 size={16} />
                  <span>{saveSuccessMsg}</span>
                </div>
              )}

              {testHistory.length === 0 ? (
                <div className="text-center py-10 space-y-2">
                  <BarChart3 size={36} className={`mx-auto ${isDark ? 'text-gray-700' : 'text-slate-300'}`} />
                  <p className={`text-sm font-bold ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>
                    Nenhuma tentativa finalizada ainda.
                  </p>
                  <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-slate-400'}`}>
                    Resolva questões de uma bateria e clique em <strong>&ldquo;Finalizar&rdquo;</strong> para salvar seu resultado e acompanhar sua evolução.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {testHistory.map((item, idx) => {
                    const isGreat = item.accuracy >= 80;
                    const isGood = item.accuracy >= 60 && item.accuracy < 80;
                    return (
                      <div 
                        key={item.id || idx}
                        className={`p-4 rounded-xl border transition-all ${
                          isDark 
                            ? 'bg-[#141822] border-gray-800 hover:border-gray-700' 
                            : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <div>
                            <span className={`text-[10px] font-black uppercase tracking-wider block ${
                              isDark ? 'text-gray-400' : 'text-slate-500'
                            }`}>
                              Tentativa #{testHistory.length - idx} • {item.date}
                            </span>
                            <h4 className="text-xs font-black uppercase tracking-tight">
                              {item.bateriaTitulo || `Bateria ${item.bateriaId}`}
                            </h4>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-black px-2.5 py-1 rounded-lg border ${
                              isGreat 
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' 
                                : isGood 
                                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' 
                                  : 'bg-red-500/10 border-red-500/30 text-red-500'
                            }`}>
                              {item.accuracy}% de Acertos
                            </span>
                          </div>
                        </div>

                        {/* Barra de Aproveitamento */}
                        <div className={`w-full h-2 rounded-full overflow-hidden flex mb-2.5 ${isDark ? 'bg-gray-800' : 'bg-slate-200'}`}>
                          <div 
                            className="h-full bg-emerald-500 transition-all duration-300"
                            style={{ width: `${(item.correct / item.total) * 100}%` }}
                          />
                          <div 
                            className="h-full bg-red-500 transition-all duration-300"
                            style={{ width: `${(item.wrong / item.total) * 100}%` }}
                          />
                        </div>

                        {/* Detalhes de Acertos / Erros / Total */}
                        <div className={`flex items-center justify-between text-[11px] font-bold ${
                          isDark ? 'text-gray-400' : 'text-slate-500'
                        }`}>
                          <span>Respondidas: <strong>{item.answered}</strong> de {item.total}</span>
                          <span className="text-emerald-500">✓ {item.correct} corretas</span>
                          <span className="text-red-500">✗ {item.wrong} incorretas</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Rodapé do Modal */}
            <div className={`p-4 border-t flex items-center justify-end shrink-0 ${
              isDark ? 'border-gray-800 bg-[#141822]' : 'border-slate-200 bg-slate-50'
            }`}>
              <button
                onClick={() => setShowHistoryModal(false)}
                className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors ${
                  isDark ? 'bg-gray-800 hover:bg-gray-700 text-white border-gray-700' : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                }`}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =========================================================================
// ABA 4 — FLASHCARDS (3D FLIP, REVISAR VS DOMINEI E FILTRAGEM)
// =========================================================================

function FlashcardsTab({
  flashcards,
  baterias,
  flashcardStatus,
  onSaveStatus,
  isDark = false
}: {
  flashcards: InteractiveFlashcard[];
  baterias: { id: string | number; titulo: string }[];
  flashcardStatus: Record<string, 'mastered' | 'review'>;
  onSaveStatus: (id: string, status: 'mastered' | 'review') => void;
  isDark?: boolean;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [selectedBateria, setSelectedBateria] = useState<string | number>('all');

  // Lista unificada e ordenada de baterias
  const bateriasList = useMemo(() => {
    if (baterias && baterias.length > 0) {
      return baterias.map(b => {
        const num = typeof b.id === 'number' || /^\d+$/.test(String(b.id)) ? String(b.id).padStart(2, '0') : b.id;
        return {
          id: b.id,
          label: `Bateria ${num}`
        };
      });
    }
    const ids = Array.from(new Set(flashcards.map(f => f.bateria_id).filter(Boolean)));
    ids.sort((a, b) => Number(a) - Number(b));
    return ids.map(id => {
      const num = typeof id === 'number' || /^\d+$/.test(String(id)) ? String(id).padStart(2, '0') : id;
      return {
        id: id!,
        label: `Bateria ${num}`
      };
    });
  }, [baterias, flashcards]);

  // Filtra por bateria
  const filtered = useMemo(() => {
    if (selectedBateria === 'all') return flashcards;
    return flashcards.filter(f => String(f.bateria_id) === String(selectedBateria));
  }, [flashcards, selectedBateria]);

  // Reset ao mudar filtro
  useEffect(() => {
    setCurrentIndex(0);
    setIsFlipped(false);
  }, [selectedBateria]);

  const currentCard = filtered[currentIndex];

  const handleNext = useCallback(() => {
    setIsFlipped(false);
    setCurrentIndex(i => (i + 1) % filtered.length);
  }, [filtered.length]);

  const handlePrev = useCallback(() => {
    setIsFlipped(false);
    setCurrentIndex(i => (i - 1 + filtered.length) % filtered.length);
  }, [filtered.length]);

  const handleShuffle = () => {
    setIsFlipped(false);
    const rand = Math.floor(Math.random() * filtered.length);
    setCurrentIndex(rand);
  };

  // Atalho de teclado: Espaço vira o card, Setas navegam
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        setIsFlipped(f => !f);
      } else if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handlePrev]);

  if (!currentCard) {
    return (
      <div className={`p-8 text-center text-sm font-medium ${isDark ? 'text-gray-400' : 'text-[#64748b]'}`}>
        Nenhum flashcard disponível para este filtro.
      </div>
    );
  }

  const masteredCount = filtered.filter(f => flashcardStatus[f.id] === 'mastered').length;

  const bateriaNum = typeof currentCard.bateria_id === 'number' || /^\d+$/.test(String(currentCard.bateria_id))
    ? String(currentCard.bateria_id).padStart(2, '0')
    : currentCard.bateria_id;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6 w-full h-full min-h-0 overflow-y-auto custom-scrollbar flex flex-col justify-start">
      {/* 1. Barra superior dos Flashcards (ocupando a largura total com justify-between) */}
      <div className={`w-full max-w-[780px] mx-auto flex flex-wrap items-center justify-between gap-3 pb-4 border-b ${
        isDark ? 'border-gray-800' : 'border-slate-200'
      }`}>
        {/* Pílulas / Botões horizontais de filtro */}
        <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar py-0.5">
          <button
            type="button"
            onClick={() => setSelectedBateria('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 ${
              selectedBateria === 'all'
                ? isDark 
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'bg-[#002060] text-white shadow-sm'
                : isDark
                  ? 'bg-[#12151c] text-gray-300 border border-gray-800 hover:bg-gray-800'
                  : 'bg-[#ffffff] text-[#334155] border border-[#cbd5e1] hover:bg-slate-50'
            }`}
          >
            Todos ({flashcards.length})
          </button>

          {bateriasList.map(b => (
            <button
              key={String(b.id)}
              type="button"
              onClick={() => setSelectedBateria(b.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 ${
                String(selectedBateria) === String(b.id)
                  ? isDark 
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'bg-[#002060] text-white shadow-sm'
                  : isDark
                    ? 'bg-[#12151c] text-gray-300 border border-gray-800 hover:bg-gray-800'
                    : 'bg-[#ffffff] text-[#334155] border border-[#cbd5e1] hover:bg-slate-50'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>

        {/* Contador em pílula verde-clara à direita */}
        <div className="flex items-center shrink-0">
          <span className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors ${
            isDark 
              ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
              : 'bg-[#d1fae5] border-[#6ee7b7] text-[#065f46]'
          }`}>
            ✓ Dominei: {masteredCount} / {filtered.length}
          </span>
        </div>
      </div>

      {/* 2. Cartão do Flashcard (max-w-[780px] w-full) */}
      <div 
        onClick={() => setIsFlipped(!isFlipped)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.code === 'Space') {
            e.preventDefault();
            setIsFlipped(!isFlipped);
          }
        }}
        className={`w-full max-w-[780px] mx-auto min-h-[320px] md:min-h-[360px] rounded-2xl p-7 md:p-8 flex flex-col justify-between cursor-pointer transition-all duration-200 select-none shadow-lg ${
          isDark
            ? isFlipped
              ? 'bg-[#0d1527] border-2 border-sky-600 shadow-2xl'
              : 'bg-[#0f121a] border-2 border-gray-800 hover:border-gray-700 shadow-2xl'
            : isFlipped
              ? 'bg-[#f0f7ff] border-2 border-[#0070c0] shadow-blue-900/10'
              : 'bg-[#ffffff] border-2 border-[#e2e8f0] hover:border-[#cbd5e1]'
        }`}
      >
        {!isFlipped ? (
          /* Frente do Cartão */
          <>
            {/* Topo da Frente */}
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className={`px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider ${
                isDark ? 'bg-red-600 text-white' : 'bg-[#002060] text-white'
              }`}>
                {currentCard.bateria_id ? `BATERIA ${bateriaNum}` : 'FLASHCARD'}
              </span>

              {currentCard.topic && (
                <span className={`text-xs font-semibold ${
                  isDark ? 'text-gray-400' : 'text-[#64748b]'
                }`}>
                  {currentCard.topic}
                </span>
              )}
            </div>

            {/* Centro da Frente */}
            <div className="my-auto py-6 text-center max-w-xl mx-auto w-full">
              <span className={`text-[11px] font-black tracking-widest uppercase mb-2 block ${
                isDark ? 'text-sky-400' : 'text-[#0070c0]'
              }`}>
                PERGUNTA / GATILHO DE PROVA
              </span>
              <p className={`text-lg md:text-xl font-bold leading-relaxed ${
                isDark ? 'text-white' : 'text-[#0f172a]'
              }`}>
                {currentCard.front}
              </p>
            </div>

            {/* Rodapé da Frente */}
            <div className={`pt-3 border-t text-center text-xs font-medium ${
              isDark ? 'border-gray-800 text-gray-400' : 'border-slate-100 text-[#64748b]'
            }`}>
              Clique no cartão ou pressione Espaço para ver a resposta ↺
            </div>
          </>
        ) : (
          /* Verso do Cartão */
          <>
            {/* Topo do Verso */}
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className={`px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider ${
                isDark ? 'bg-sky-600 text-white' : 'bg-[#0070c0] text-white'
              }`}>
                RESPOSTA &amp; REGRA
              </span>

              {currentCard.article && (
                <span className={`text-xs font-mono font-semibold ${
                  isDark ? 'text-gray-400' : 'text-[#64748b]'
                }`}>
                  {currentCard.article}
                </span>
              )}
            </div>

            {/* Centro do Verso */}
            <div className="my-auto py-6 text-center max-w-xl mx-auto w-full space-y-3">
              <span className={`text-[11px] font-black tracking-widest uppercase mb-2 block ${
                isDark ? 'text-emerald-400' : 'text-[#0070c0]'
              }`}>
                RESPOSTA CORRETA
              </span>
              <p className={`text-lg md:text-xl font-bold leading-relaxed ${
                isDark ? 'text-emerald-300' : 'text-[#0f172a]'
              }`}>
                {currentCard.back}
              </p>
            </div>

            {/* Rodapé do Verso */}
            <div className={`pt-3 border-t text-center text-xs font-medium ${
              isDark ? 'border-sky-950 text-gray-400' : 'border-blue-100 text-[#64748b]'
            }`}>
              Clique no cartão ou pressione Espaço para ver a pergunta ↺
            </div>
          </>
        )}
      </div>

      {/* 3. Controles em uma única linha abaixo do cartão */}
      <div className="w-full max-w-[780px] mx-auto flex flex-wrap sm:flex-nowrap items-center justify-center gap-2 sm:gap-2.5">
        {/* Anterior */}
        <button
          type="button"
          onClick={handlePrev}
          className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 shrink-0 ${
            isDark
              ? 'bg-[#12151c] border border-gray-800 text-gray-200 hover:bg-gray-800'
              : 'bg-[#ffffff] border border-[#cbd5e1] text-[#0f172a] hover:bg-slate-50'
          }`}
          title="Flashcard anterior"
        >
          <ArrowLeft size={14} />
          <span>Anterior</span>
        </button>

        {/* Preciso Revisar */}
        <button
          type="button"
          onClick={() => {
            onSaveStatus(currentCard.id, 'review');
            handleNext();
          }}
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm active:scale-95 shrink-0 ${
            isDark
              ? 'bg-amber-950/40 border border-amber-600/60 text-amber-300 hover:bg-amber-950/70'
              : 'bg-[#ffffff] border-2 border-[#f59e0b] text-[#b45309] hover:bg-amber-50'
          }`}
          title="Marcar como Preciso Revisar e avançar"
        >
          <RotateCcw size={14} className={isDark ? 'text-amber-300' : 'text-[#b45309]'} />
          <span>Preciso Revisar</span>
        </button>

        {/* Virar Card */}
        <button
          type="button"
          onClick={() => setIsFlipped(!isFlipped)}
          className={`flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm active:scale-95 shrink-0 ${
            isDark
              ? 'bg-sky-600 hover:bg-sky-500 text-white'
              : 'bg-[#002060] hover:bg-[#001746] text-white'
          }`}
          title="Virar Flashcard (Espaço)"
        >
          <RotateCcw size={14} />
          <span>Virar Card</span>
        </button>

        {/* Dominei */}
        <button
          type="button"
          onClick={() => {
            onSaveStatus(currentCard.id, 'mastered');
            handleNext();
          }}
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm active:scale-95 shrink-0 ${
            isDark
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
              : 'bg-[#10b981] hover:bg-[#059669] text-white'
          }`}
          title="Marcar como Dominei e avançar"
        >
          <CheckCircle2 size={14} />
          <span>Dominei</span>
        </button>

        {/* Próximo */}
        <button
          type="button"
          onClick={handleNext}
          className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 shrink-0 ${
            isDark
              ? 'bg-[#12151c] border border-gray-800 text-gray-200 hover:bg-gray-800'
              : 'bg-[#ffffff] border border-[#cbd5e1] text-[#0f172a] hover:bg-slate-50'
          }`}
          title="Próximo flashcard"
        >
          <span>Próximo</span>
          <ArrowRight size={14} />
        </button>

        {/* Botão Embaralhar compacto ao lado */}
        <button
          type="button"
          onClick={handleShuffle}
          className={`p-2.5 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 shrink-0 ${
            isDark
              ? 'bg-[#12151c] border border-gray-800 text-gray-400 hover:text-white hover:bg-gray-800'
              : 'bg-[#ffffff] border border-[#cbd5e1] text-[#64748b] hover:text-[#0f172a] hover:bg-slate-50'
          }`}
          title="Embaralhar Flashcards"
        >
          <Shuffle size={14} />
        </button>
      </div>

      {/* Logo abaixo dos botões, centralizado: Card X de Y em fonte monospace #64748b */}
      <div className={`text-center font-mono text-xs font-semibold ${
        isDark ? 'text-gray-500' : 'text-[#64748b]'
      }`}>
        Card {currentIndex + 1} de {filtered.length}
      </div>
    </div>
  );
}
