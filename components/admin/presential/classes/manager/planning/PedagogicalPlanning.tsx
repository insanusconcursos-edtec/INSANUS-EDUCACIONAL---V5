import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  CheckCircle,
  Clock,
  AlertCircle,
  Globe,
  Video,
  CheckCircle2,
  Layers,
  Link2,
  Radio,
  Pin,
  Target,
  FileJson,
  HelpCircle,
  Scale,
  Zap,
  BookOpen,
  Eye
} from 'lucide-react';
import { Subject, SubjectGroup, Topic, Module } from '../../../../../../types/curriculum';
import { ClassScheduleEvent } from '../../../../../../types/schedule';
import { Teacher } from '../../../../../../types/teacher';
import {
  GuidedStudyMeta,
  computeClassEncounterMap,
  getGuidedMetasForModule,
  getGuidedModuleAdminStatus
} from '../../../../../../types/guidedStudy';
import { guidedStudyService } from '../../../../../../services/guidedStudyService';
import { StudentGuidedStudyModal } from '../../../../../student/presential/StudentGuidedStudyModal';
import { toLocalISODate } from '../../../../../../utils/dateUtils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useAuth } from '../../../../../../contexts/AuthContext';
import { openWatermarkedPdf } from '../../../../../../utils/pdfSecurityService';
import { getSubjectEffectiveSlotCount } from '../../../../../../utils/scheduler/ContentResolver';

interface PedagogicalPlanningProps {
  classId?: string;
  isGuidedStudyEnabled?: boolean;
  defaultShift?: string;
  subjects: Subject[];
  topics: Topic[];
  modules: Module[];
  events: ClassScheduleEvent[];
  teachers: Teacher[];
  totalMeetings?: number;
  subjectGroups?: SubjectGroup[];
}

const getGuidedMetaTypeDisplay = (type: GuidedStudyMeta['type']) => {
  switch (type) {
    case 'interactive_map':
      return { label: 'Mapa .JSON', Icon: FileJson };
    case 'aula':
      return { label: 'Videoaula', Icon: Video };
    case 'material':
      return { label: 'Material PDF', Icon: FileText };
    case 'questoes':
      return { label: 'Questões', Icon: HelpCircle };
    case 'lei_seca':
      return { label: 'Lei Seca', Icon: Scale };
    case 'flashcards':
      return { label: 'Flashcards', Icon: Zap };
    case 'resumo':
      return { label: 'Resumo', Icon: BookOpen };
    default:
      return { label: 'Meta', Icon: Target };
  }
};

export function PedagogicalPlanning({
  classId,
  isGuidedStudyEnabled = false,
  defaultShift,
  subjects,
  topics,
  modules,
  events,
  teachers,
  totalMeetings = 0,
  subjectGroups = []
}: PedagogicalPlanningProps) {
  const { currentUser, userData } = useAuth();
  const [searchParams] = useSearchParams();
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set());
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [guidedMetas, setGuidedMetas] = useState<GuidedStudyMeta[]>([]);
  const [previewGuidedMeta, setPreviewGuidedMeta] = useState<GuidedStudyMeta | null>(null);
  const todayIso = useMemo(() => toLocalISODate(), []);

  useEffect(() => {
    let cancelled = false;
    if (!classId) {
      setGuidedMetas([]);
      return;
    }
    guidedStudyService
      .getMetasByClass(classId)
      .then(list => {
        if (!cancelled) setGuidedMetas(list);
      })
      .catch(err => {
        console.error('Erro ao carregar metas do estudo guiado no planejamento:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [classId]);

  const sortedGroups = useMemo(
    () => [...(subjectGroups || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [subjectGroups]
  );

  const validGroupIds = useMemo(() => new Set(sortedGroups.map((g) => g.id)), [sortedGroups]);

  // Deep Linking: Auto-expand group, subject, topic, module and scroll
  useEffect(() => {
    const urlSubjectId = searchParams.get('subjectId');
    const urlTopicId = searchParams.get('topicId');
    const urlModuleId = searchParams.get('moduleId');

    if (urlSubjectId || urlTopicId || urlModuleId) {
      const resolvedSubjectId =
        urlSubjectId ||
        topics.find((t) => t.id === urlTopicId)?.subjectId ||
        topics.find((t) => (t.modules || []).some((m) => m.id === urlModuleId))?.subjectId;

      if (resolvedSubjectId) {
        const targetSubj = subjects.find((s) => s.id === resolvedSubjectId);
        const grpKey =
          targetSubj?.groupId && validGroupIds.has(targetSubj.groupId)
            ? targetSubj.groupId
            : '__UNGROUPED__';
        setCollapsedGroups((prev) => {
          if (!prev.has(grpKey)) return prev;
          const next = new Set(prev);
          next.delete(grpKey);
          return next;
        });
        setExpandedSubjects((prev) => new Set([...prev, resolvedSubjectId]));
      }
      if (urlTopicId) setExpandedTopics(prev => new Set([...prev, urlTopicId]));
      if (urlModuleId) setExpandedModules(prev => new Set([...prev, urlModuleId]));

      // Scroll to module after expansion
      if (urlModuleId) {
        setTimeout(() => {
          const element = document.getElementById(`module-${urlModuleId}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('highlight-pulse');
            setTimeout(() => element.classList.remove('highlight-pulse'), 3000);
          }
        }, 500);
      }
    }
  }, [searchParams, subjects, topics, validGroupIds]);

  const nonPresencialModuleIds = useMemo(
    () => new Set(modules.filter(m => m.isOnline || m.isGuidedStudy).map(m => m.id)),
    [modules]
  );

  const handleOpenPdf = async (url: string, _title: string) => {
    try {
      await openWatermarkedPdf(url, {
        uid: currentUser?.uid,
        email: currentUser?.email || 'admin@insanus.com',
        cpf: userData?.cpf || '000.000.000-00'
      });
    } catch (error) {
      console.error('Error opening PDF:', error);
      window.open(url, '_blank');
    }
  };

  const toggleSubject = (id: string) => {
    const newSet = new Set(expandedSubjects);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedSubjects(newSet);
  };

  const toggleTopic = (id: string) => {
    const newSet = new Set(expandedTopics);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedTopics(newSet);
  };

  const toggleModule = (id: string) => {
    const newSet = new Set(expandedModules);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedModules(newSet);
  };

  const toggleGroup = (groupKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  // Filter subjects that have topics
  const activeSubjects = useMemo(
    () => subjects.filter(subject => topics.some(topic => topic.subjectId === subject.id)),
    [subjects, topics]
  );

  const getSubjectMetrics = (subjectId: string) => {
    const subjectTopics = topics.filter(t => t.subjectId === subjectId);
    const totalRequiredClasses = getSubjectEffectiveSlotCount(subjectId, topics, false);

    const completedEvents = events.filter(
      e =>
        e.subjectId === subjectId &&
        e.status === 'COMPLETED' &&
        !nonPresencialModuleIds.has(e.moduleId)
    );

    const rawCompletedSlots = completedEvents.reduce((sum, e) => {
      if (e.isOverflow) return sum;
      return sum + (e.consumedSlotsCount !== undefined ? e.consumedSlotsCount : 1);
    }, 0);

    const completedClassesCount =
      totalRequiredClasses > 0 ? Math.min(totalRequiredClasses, rawCompletedSlots) : rawCompletedSlots;

    return { subjectTopics, totalRequiredClasses, completedEvents, completedClassesCount };
  };

  const populatedGroups = useMemo(
    () =>
      sortedGroups
        .map((group) => ({
          group,
          subjects: activeSubjects.filter((s) => s.groupId === group.id),
        }))
        .filter((entry) => entry.subjects.length > 0),
    [sortedGroups, activeSubjects]
  );

  const ungroupedActiveSubjects = useMemo(
    () => activeSubjects.filter((s) => !s.groupId || !validGroupIds.has(s.groupId)),
    [activeSubjects, validGroupIds]
  );

  // Calculate global progression
  const globalStats = useMemo(() => {
    let totalRequired = 0;
    let totalCompleted = 0;

    subjects.forEach(subject => {
      const subjectRequired = getSubjectEffectiveSlotCount(subject.id, topics, false);

      const subjectCompletedEvents = events.filter(e => 
        e.subjectId === subject.id && 
        e.status === 'COMPLETED' && 
        !nonPresencialModuleIds.has(e.moduleId)
      );

      const rawSubjectCompleted = subjectCompletedEvents.reduce((sum, e) => {
        if (e.isOverflow) return sum;
        return sum + (e.consumedSlotsCount !== undefined ? e.consumedSlotsCount : 1);
      }, 0);

      const subjectCompleted =
        subjectRequired > 0 ? Math.min(subjectRequired, rawSubjectCompleted) : rawSubjectCompleted;

      totalRequired += subjectRequired;
      totalCompleted += subjectCompleted;
    });

    const encounterMap = computeClassEncounterMap(
      events,
      isGuidedStudyEnabled ? guidedMetas : [],
      {
        defaultShift,
        totalMeetings,
        todayIso,
        includeGuidedStudy: Boolean(isGuidedStudyEnabled)
      }
    );

    return {
      totalRequired,
      totalCompleted,
      completedMeetingsCount: encounterMap.completedEncounters,
      completedClassEncounters: encounterMap.completedClassEncounters,
      completedGuidedEncounters: encounterMap.completedGuidedEncounters,
      percentage: totalRequired > 0 ? Math.round((totalCompleted / totalRequired) * 100) : 0
    };
  }, [subjects, topics, events, nonPresencialModuleIds, isGuidedStudyEnabled, guidedMetas, defaultShift, totalMeetings, todayIso]);

  return (
    <div className="space-y-6">
      {/* Global Progression Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl flex flex-col justify-between">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h3 className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Progresso Geral de Aulas</h3>
              <p className="text-2xl font-black text-white">{globalStats.totalCompleted} / {globalStats.totalRequired}</p>
            </div>
            <span className="text-brand-red font-black text-xl">{globalStats.percentage}%</span>
          </div>
          <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-brand-red h-full transition-all duration-500" 
              style={{ width: `${globalStats.percentage}%` }}
            />
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl flex items-center justify-between">
          <div>
            <h3 className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Contador de Encontros</h3>
            <p className="text-3xl font-black text-white tabular-nums">
              {globalStats.completedMeetingsCount} <span className="text-zinc-500 text-xl">/ {totalMeetings}</span>
            </p>
            {globalStats.completedGuidedEncounters > 0 && (
              <p className="text-[11px] text-zinc-400 mt-1 tabular-nums">
                {globalStats.completedClassEncounters} presenciais ·{' '}
                <span className="text-amber-400 font-semibold">
                  {globalStats.completedGuidedEncounters} estudo guiado
                </span>
              </p>
            )}
          </div>
          <div className="w-12 h-12 rounded-full border-2 border-zinc-800 flex items-center justify-center">
            <CheckCircle2 className={clsx(
              "w-6 h-6",
              globalStats.completedMeetingsCount >= totalMeetings && totalMeetings > 0 ? "text-emerald-500" : "text-zinc-600"
            )} />
          </div>
        </div>
      </div>

      {(() => {
        const renderSubjectAccordion = (subject: Subject) => {
          const { subjectTopics, totalRequiredClasses, completedClassesCount } = getSubjectMetrics(subject.id);
          const isExpanded = expandedSubjects.has(subject.id);
          const sortedTopics = [...subjectTopics].sort((a, b) => (a.order || 0) - (b.order || 0));

          return (
            <div key={subject.id} className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-900/50">
            {/* Subject Header */}
            <button
              onClick={() => toggleSubject(subject.id)}
              className="w-full flex items-center justify-between p-4 hover:bg-zinc-800/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                {isExpanded ? <ChevronDown className="w-5 h-5 text-zinc-400" /> : <ChevronRight className="w-5 h-5 text-zinc-400" />}
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: subject.color }}
                />
                <span className="font-medium text-zinc-100">{subject.name}</span>
              </div>
              <div className="flex items-center gap-4 text-sm tabular-nums">
                <span className="text-zinc-400">
                  {completedClassesCount} / {totalRequiredClasses} aulas concluídas
                </span>
                <div className="w-24 h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 transition-all duration-500"
                    style={{ 
                      width: `${totalRequiredClasses > 0 ? Math.min(100, (completedClassesCount / totalRequiredClasses) * 100) : 0}%` 
                    }}
                  />
                </div>
              </div>
            </button>

            {/* Subject Content (Topics) */}
            {isExpanded && (
              <div className="border-t border-zinc-800 bg-zinc-900/30">
                {sortedTopics.map(topic => {
                  const isTopicExpanded = expandedTopics.has(topic.id);
                  const topicModules = topic.modules || [];

                  return (
                    <div key={topic.id} className="border-b border-zinc-800 last:border-0">
                      {/* Topic Header */}
                      <button
                        onClick={() => toggleTopic(topic.id)}
                        className="w-full flex items-center justify-between p-3 pl-8 hover:bg-zinc-800/30 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {isTopicExpanded ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
                          <span className="text-sm font-medium text-zinc-300">{topic.name}</span>
                        </div>
                        <span className="text-xs text-zinc-500 tabular-nums">
                          {topicModules.length} módulos
                        </span>
                      </button>

                      {/* Topic Content (Modules) */}
                      {isTopicExpanded && (
                        <div className="bg-zinc-950/30 pl-12 pr-4 py-2 space-y-2">
                          {topicModules.map(module => {
                            const isModuleExpanded = expandedModules.has(module.id);
                            const moduleEvents = events
                              .filter(
                                e =>
                                  e.moduleId === module.id ||
                                  e.linkedModules?.some(lm => lm.moduleId === module.id)
                              )
                              .sort(
                                (a, b) =>
                                  new Date(`${a.date}T${a.startTime}`).getTime() -
                                  new Date(`${b.date}T${b.startTime}`).getTime()
                              );

                            const isGuidedMod = !module.isOnline && Boolean(module.isGuidedStudy);
                            const isGroupedModule =
                              !module.isOnline &&
                              !isGuidedMod &&
                              (Boolean(module.groupedWithPrevious) || Number(module.classesCount) === 0);

                            const linkedGuidedMetas = getGuidedMetasForModule(guidedMetas, module.id);
                            const guidedAdminStatus = getGuidedModuleAdminStatus(linkedGuidedMetas, todayIso);

                            const completedModuleEvents = moduleEvents.filter(e => e.status === 'COMPLETED');
                            const completedModuleParts = completedModuleEvents.reduce((sum, e) => {
                              const matchedLinks =
                                e.linkedModules?.filter(lm => lm.moduleId === module.id).length || 0;
                              return sum + Math.max(1, matchedLinks);
                            }, 0);
                            
                            const moduleContents = module.contents || [];

                            return (
                              <div 
                                key={module.id} 
                                id={`module-${module.id}`}
                                className="border border-zinc-800 rounded-md overflow-hidden bg-zinc-900 transition-all duration-500"
                              >
                                {/* Module Header */}
                                  <button
                                    onClick={() => toggleModule(module.id)}
                                    className="w-full flex items-center justify-between p-3 hover:bg-zinc-800/50 transition-colors gap-3"
                                  >
                                    <div className="flex items-center gap-3 min-w-0">
                                      {isModuleExpanded ? <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" /> : <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />}
                                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                                        <span className="text-sm text-zinc-300 text-left">{module.name}</span>
                                        {module.isOnline && (
                                          <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20 text-[10px] font-bold uppercase whitespace-nowrap">
                                            Online
                                          </span>
                                        )}
                                        {isGuidedMod && (
                                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/25 text-[10px] font-bold uppercase whitespace-nowrap">
                                            <Target className="w-2.5 h-2.5 shrink-0" />
                                            Estudo Guiado
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-zinc-500 tabular-nums shrink-0">
                                      <span className="flex items-center gap-1">
                                        <FileText className="w-3 h-3" />
                                        {moduleContents.length}
                                      </span>
                                      {!module.isOnline && !isGuidedMod && linkedGuidedMetas.length > 0 && (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/25 text-[10px] font-bold whitespace-nowrap">
                                          <Target className="w-2.5 h-2.5 shrink-0" />
                                          +{linkedGuidedMetas.length} {linkedGuidedMetas.length === 1 ? 'guiada' : 'guiadas'}
                                        </span>
                                      )}
                                      {isGuidedMod ? (
                                        <span
                                          className={clsx(
                                            "flex items-center gap-1 whitespace-nowrap font-semibold",
                                            guidedAdminStatus === 'DELIVERED'
                                              ? "text-emerald-400"
                                              : guidedAdminStatus === 'SCHEDULED'
                                                ? "text-amber-400"
                                                : "text-zinc-500"
                                          )}
                                        >
                                          {guidedAdminStatus === 'DELIVERED' ? (
                                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                          ) : (
                                            <Clock className="w-3.5 h-3.5 shrink-0" />
                                          )}
                                          {guidedAdminStatus === 'DELIVERED'
                                            ? `Entregue · ${linkedGuidedMetas.length} ${linkedGuidedMetas.length === 1 ? 'meta' : 'metas'}`
                                            : guidedAdminStatus === 'SCHEDULED'
                                              ? `Agendado · ${linkedGuidedMetas.length} ${linkedGuidedMetas.length === 1 ? 'meta' : 'metas'}`
                                              : 'Pendente · Sem metas'}
                                        </span>
                                      ) : !module.isOnline ? (
                                        isGroupedModule ? (
                                          <span
                                            className={clsx(
                                              "flex items-center gap-1 whitespace-nowrap",
                                              completedModuleEvents.length > 0
                                                ? "text-emerald-400"
                                                : "text-amber-400/90"
                                            )}
                                          >
                                            <Link2 className="w-3 h-3 shrink-0" />
                                            {completedModuleEvents.length > 0
                                              ? 'Concluído · Aula conjunta'
                                              : moduleEvents.length > 0
                                                ? 'Agendado · Aula conjunta'
                                                : 'Aula conjunta'}
                                          </span>
                                        ) : (
                                          <span className="flex items-center gap-1 whitespace-nowrap">
                                            <Clock className="w-3 h-3 shrink-0" />
                                            {Math.min(module.classesCount || 1, completedModuleParts)} / {module.classesCount} aulas
                                          </span>
                                        )
                                      ) : (
                                        <span className="flex items-center gap-1">
                                          {module.onlineStatus === 'EM_GRAVACAO' ? (
                                            <Video className="w-3 h-3 text-amber-500" />
                                          ) : (
                                            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                          )}
                                          {module.onlineStatus === 'EM_GRAVACAO' ? 'Em Gravação' : 'Publicado'}
                                        </span>
                                      )}
                                    </div>
                                  </button>

                                {/* Module Content (Materials & Classes) */}
                                {isModuleExpanded && (
                                  <div className="p-4 space-y-6 border-t border-zinc-800 bg-zinc-950/50">
                                    
                                    {/* Online Info Section */}
                                    {module.isOnline && (
                                      <div className="p-4 rounded-lg bg-zinc-900 border border-zinc-800 space-y-4">
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-3">
                                            <div className={twMerge(
                                              "w-10 h-10 rounded-full flex items-center justify-center border",
                                              module.onlineStatus === 'PUBLICADO' 
                                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
                                                : "bg-amber-500/10 border-amber-500/30 text-amber-500"
                                            )}>
                                              {module.onlineStatus === 'PUBLICADO' ? <CheckCircle2 className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                                            </div>
                                            <div>
                                              <h4 className="text-sm font-bold text-white">Módulo Online</h4>
                                              <p className="text-xs text-zinc-500 uppercase font-bold tracking-wider">
                                                Status: {module.onlineStatus === 'EM_GRAVACAO' ? 'Em Gravação' : 'Publicado'}
                                              </p>
                                            </div>
                                          </div>
                                          
                                          {module.onlineStatus === 'EM_GRAVACAO' && module.publicationDate && (
                                            <div className="text-right">
                                              <p className="text-[10px] text-zinc-500 uppercase font-bold">Previsão de Publicação</p>
                                              <p className="text-sm font-bold text-amber-500">
                                                {format(new Date(module.publicationDate + 'T00:00:00'), "dd/MM/yyyy")}
                                              </p>
                                            </div>
                                          )}
                                        </div>

                                        {module.onlineStatus === 'PUBLICADO' && module.teachingAreaLink && (
                                          <button 
                                            onClick={() => {
                                              console.log('Redirecting to teaching area:', module.teachingAreaLink);
                                            }}
                                            className="w-full flex items-center justify-between p-3 rounded-lg bg-zinc-950 border border-zinc-800 hover:border-brand-red/50 transition-all group"
                                          >
                                            <div className="flex items-center gap-3">
                                              <div className="w-8 h-8 rounded bg-zinc-900 flex items-center justify-center border border-zinc-800 group-hover:border-brand-red/30">
                                                <Globe className="w-4 h-4 text-brand-red" />
                                              </div>
                                              <div className="text-left">
                                                <p className="text-xs font-bold text-zinc-300 group-hover:text-white">Acessar na Área de Ensino</p>
                                                <p className="text-[10px] text-zinc-500">Módulo: {module.teachingAreaLink.moduleId} | Pasta: {module.teachingAreaLink.folderId}</p>
                                              </div>
                                            </div>
                                            <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-brand-red" />
                                          </button>
                                        )}
                                      </div>
                                    )}

                                    {/* Materials Section */}
                                    {moduleContents.length > 0 && (
                                      <div className="space-y-4">
                                        <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Materiais de Apoio</h4>
                                        
                                        <div className="space-y-3">
                                          {/* Step A: Theory PDFs */}
                                          {moduleContents.filter(c => c.fileType === 'theory' || !c.fileType).map(content => (
                                            <div key={content.id} className="space-y-2">
                                              <button 
                                                onClick={() => {
                                                  if (content.type === 'PDF') {
                                                    handleOpenPdf(content.url, content.title);
                                                  } else {
                                                    window.open(content.url, '_blank');
                                                  }
                                                }}
                                                className="w-full text-left flex items-center gap-3 p-3 rounded-md bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800 transition-all group"
                                              >
                                                <div className="p-2 rounded-md bg-zinc-950 border border-zinc-800 group-hover:border-zinc-700">
                                                  <FileText className="w-4 h-4 text-red-500" />
                                                </div>
                                                <div className="flex-1">
                                                  <div className="flex items-center gap-2">
                                                    <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20 text-[8px] font-black uppercase">Teoria</span>
                                                    <p className="text-sm text-zinc-300 group-hover:text-white transition-colors">{content.title}</p>
                                                  </div>
                                                  <p className="text-xs text-zinc-500">Adicionado em {new Date(content.createdAt).toLocaleDateString('pt-BR')}</p>
                                                </div>
                                              </button>

                                              {/* Step B & C: Linked Questions */}
                                              {moduleContents.filter(q => q.fileType === 'questions' && q.linkedTheoryId === content.id).map(question => (
                                                <div key={question.id} className="relative ml-8">
                                                  {/* Connection Line */}
                                                  <div className="absolute -left-5 top-0 h-1/2 w-5 border-b-2 border-l-2 border-zinc-700 rounded-bl-md"></div>
                                                  
                                                  <button 
                                                    onClick={() => handleOpenPdf(question.url, question.title)}
                                                    className="w-full text-left flex items-center gap-3 p-2 rounded-md bg-zinc-900/50 border border-zinc-800/50 hover:border-zinc-700 hover:bg-zinc-800 transition-all group"
                                                  >
                                                    <div className="p-1.5 rounded-md bg-zinc-950 border border-zinc-800 group-hover:border-zinc-700">
                                                      <FileText className="w-3.5 h-3.5 text-orange-500" />
                                                    </div>
                                                    <div className="flex-1">
                                                      <div className="flex items-center gap-2">
                                                        <span className="px-1 py-0.5 rounded bg-orange-500/10 text-orange-500 border border-orange-500/20 text-[8px] font-black uppercase">Questões</span>
                                                        <p className="text-xs text-zinc-400 group-hover:text-zinc-200 transition-colors">{question.title}</p>
                                                      </div>
                                                    </div>
                                                  </button>
                                                </div>
                                              ))}
                                            </div>
                                          ))}

                                          {/* Step D: Orphaned Questions */}
                                          {moduleContents.some(c => c.fileType === 'questions' && !c.linkedTheoryId) && (
                                            <div className="pt-2 space-y-2">
                                              <h5 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest pl-1">Outras Listas de Questões</h5>
                                              <div className="grid gap-2">
                                                {moduleContents.filter(c => c.fileType === 'questions' && !c.linkedTheoryId).map(content => (
                                                  <button 
                                                    key={content.id}
                                                    onClick={() => handleOpenPdf(content.url, content.title)}
                                                    className="w-full text-left flex items-center gap-3 p-3 rounded-md bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800 transition-all group"
                                                  >
                                                    <div className="p-2 rounded-md bg-zinc-950 border border-zinc-800 group-hover:border-zinc-700">
                                                      <FileText className="w-4 h-4 text-orange-500" />
                                                    </div>
                                                    <div className="flex-1">
                                                      <div className="flex items-center gap-2">
                                                        <span className="px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-500 border border-orange-500/20 text-[8px] font-black uppercase">Questões</span>
                                                        <p className="text-sm text-zinc-300 group-hover:text-white transition-colors">{content.title}</p>
                                                      </div>
                                                      <p className="text-xs text-zinc-500">Adicionado em {new Date(content.createdAt).toLocaleDateString('pt-BR')}</p>
                                                    </div>
                                                  </button>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}

                                    {/* Guided Study Metas Section (for Estudo Guiado modules OR Presencial modules with linked metas) */}
                                    {(isGuidedMod || linkedGuidedMetas.length > 0) && (
                                      <div className="space-y-3">
                                        <div className="flex items-center justify-between gap-2 flex-wrap">
                                          <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                                            <Target className="w-3.5 h-3.5 shrink-0" />
                                            Metas do Estudo Guiado ({linkedGuidedMetas.length})
                                          </h4>
                                          {isGuidedMod && (
                                            <span
                                              className={clsx(
                                                "text-[11px] font-bold px-2 py-0.5 rounded-full border",
                                                guidedAdminStatus === 'DELIVERED'
                                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                                                  : guidedAdminStatus === 'SCHEDULED'
                                                    ? "bg-amber-500/10 text-amber-400 border-amber-500/25"
                                                    : "bg-zinc-900 text-zinc-400 border-zinc-800"
                                              )}
                                            >
                                              {guidedAdminStatus === 'DELIVERED'
                                                ? 'Entregue (todas as metas na data)'
                                                : guidedAdminStatus === 'SCHEDULED'
                                                  ? 'Agendado no cronograma'
                                                  : 'Sem metas vinculadas'}
                                            </span>
                                          )}
                                        </div>

                                        {linkedGuidedMetas.length === 0 ? (
                                          <div className="text-center py-6 border border-dashed border-amber-500/25 rounded-lg bg-amber-500/5 px-4">
                                            <p className="text-xs text-zinc-400">
                                              Nenhuma meta do Estudo Guiado vinculada a este módulo ainda. Crie ou edite uma meta na aba <strong className="text-amber-300">Cronograma</strong> e selecione este módulo.
                                            </p>
                                          </div>
                                        ) : (
                                          <div className="grid gap-2">
                                            {linkedGuidedMetas.map(meta => {
                                              const isMetaDelivered = Boolean(meta.date) && meta.date <= todayIso;
                                              const { label: typeLabel, Icon: TypeIcon } = getGuidedMetaTypeDisplay(meta.type);
                                              const accentColor = meta.color || '#f59e0b';
                                              return (
                                                <div
                                                  key={meta.id || `${meta.date}_${meta.title}`}
                                                  className={twMerge(
                                                    "flex items-center justify-between gap-3 p-3 rounded-md border transition-all",
                                                    isMetaDelivered
                                                      ? "bg-emerald-950/10 border-emerald-900/30"
                                                      : "bg-zinc-900 border-zinc-800"
                                                  )}
                                                >
                                                  <div className="flex items-center gap-3 min-w-0">
                                                    <div
                                                      className="w-9 h-9 rounded-lg flex items-center justify-center border shrink-0"
                                                      style={{
                                                        backgroundColor: `${accentColor}18`,
                                                        borderColor: `${accentColor}40`,
                                                        color: accentColor
                                                      }}
                                                    >
                                                      <TypeIcon className="w-4 h-4" />
                                                    </div>
                                                    <div className="min-w-0">
                                                      <div className="flex items-center gap-2 flex-wrap">
                                                        <span
                                                          className="text-[10px] font-bold uppercase tracking-wider"
                                                          style={{ color: accentColor }}
                                                        >
                                                          {typeLabel}
                                                        </span>
                                                        <span className="text-sm font-medium text-zinc-200 truncate">
                                                          {meta.title}
                                                        </span>
                                                      </div>
                                                      <div className="flex items-center gap-2 text-xs text-zinc-500 tabular-nums flex-wrap mt-0.5">
                                                        <span>
                                                          {format(new Date(`${meta.date}T00:00:00`), "dd 'de' MMMM", { locale: ptBR })}
                                                        </span>
                                                        <span>·</span>
                                                        <span>{meta.duration || 30} min</span>
                                                      </div>
                                                    </div>
                                                  </div>
                                                  <div className="flex items-center gap-2 shrink-0">
                                                    <span
                                                      className={twMerge(
                                                        "text-xs px-2 py-0.5 rounded-full border whitespace-nowrap",
                                                        isMetaDelivered
                                                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                                                          : "bg-amber-500/10 text-amber-400 border-amber-500/25"
                                                      )}
                                                    >
                                                      {isMetaDelivered ? 'Entregue' : 'Agendado'}
                                                    </span>
                                                    <button
                                                      type="button"
                                                      onClick={() => setPreviewGuidedMeta(meta)}
                                                      className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
                                                      title="Pré-visualizar meta"
                                                    >
                                                      <Eye className="w-3.5 h-3.5" />
                                                    </button>
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* Classes Section */}
                                    {!module.isOnline && !isGuidedMod && (
                                      <div className="space-y-3">
                                        <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                                          Cronograma de Aulas ({moduleEvents.length})
                                        </h4>
                                        
                                        {moduleEvents.length === 0 ? (
                                          <div className="text-center py-8 border border-dashed border-zinc-800 rounded-lg">
                                            <p className="text-sm text-zinc-500">Nenhuma aula agendada para este módulo.</p>
                                          </div>
                                        ) : (
                                          <div className="grid gap-2">
                                            {moduleEvents.map(event => {
                                              const teacher = teachers.find(t => t.id === event.teacherId);
                                              const isCompleted = event.status === 'COMPLETED';
                                              const uniqueEventModuleCount = new Set(
                                                (event.linkedModules || []).map(lm => lm.moduleId)
                                              ).size;
                                              
                                              return (
                                                <div 
                                                  key={event.id}
                                                  className={twMerge(
                                                    "flex items-center justify-between p-3 rounded-md border transition-all",
                                                    isCompleted 
                                                      ? "bg-emerald-950/10 border-emerald-900/30" 
                                                      : "bg-zinc-900 border-zinc-800"
                                                  )}
                                                >
                                                  <div className="flex items-center gap-4">
                                                    <div className={twMerge(
                                                      "w-10 h-10 rounded-full flex items-center justify-center border shrink-0",
                                                      isCompleted
                                                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
                                                        : "bg-zinc-800 border-zinc-700 text-zinc-400"
                                                    )}>
                                                      {isCompleted ? <CheckCircle className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                                                    </div>
                                                    <div>
                                                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                        <span className={twMerge(
                                                          "text-sm font-medium",
                                                          isCompleted ? "text-emerald-400" : "text-zinc-200"
                                                        )}>
                                                          {format(new Date(event.date + 'T00:00:00'), "dd 'de' MMMM", { locale: ptBR })}
                                                        </span>
                                                        <span className="text-xs text-zinc-500 tabular-nums">
                                                          {event.startTime} - {event.endTime}
                                                        </span>
                                                        {event.isLiveEvent && (
                                                          <span className="text-xs text-sky-400 flex items-center gap-1 whitespace-nowrap">
                                                            · <Radio className="w-3 h-3" /> Ao Vivo no Portal
                                                          </span>
                                                        )}
                                                      </div>
                                                      <div className="flex items-center gap-2 text-xs text-zinc-500 flex-wrap">
                                                        <span>Prof. {teacher?.name || 'Não definido'}</span>
                                                        {uniqueEventModuleCount > 1 && (
                                                          <span className="text-amber-400/90 tabular-nums">
                                                            · Aula conjunta ({uniqueEventModuleCount} módulos)
                                                          </span>
                                                        )}
                                                        {event.allocationMode === 'MANUAL_PIN' && (
                                                          <span className="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                                                            <Pin className="w-2.5 h-2.5" />
                                                            Fixada no cronograma
                                                          </span>
                                                        )}
                                                        {event.isSubstitute && (
                                                          <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                                                            Substituto
                                                          </span>
                                                        )}
                                                      </div>
                                                    </div>
                                                  </div>

                                                  <div className="flex items-center gap-2 shrink-0">
                                                    <span className={twMerge(
                                                      "text-xs px-2 py-1 rounded-full border whitespace-nowrap",
                                                      event.status === 'COMPLETED' && "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
                                                      event.status === 'SCHEDULED' && "bg-blue-500/10 text-blue-500 border-blue-500/20",
                                                      event.status === 'CANCELED' && "bg-red-500/10 text-red-500 border-red-500/20",
                                                      event.status === 'RESCHEDULED' && "bg-amber-500/10 text-amber-500 border-amber-500/20",
                                                    )}>
                                                      {event.status === 'COMPLETED' && 'Concluída'}
                                                      {event.status === 'SCHEDULED' && 'Agendada'}
                                                      {event.status === 'CANCELED' && 'Cancelada'}
                                                      {event.status === 'RESCHEDULED' && 'Reagendada'}
                                                    </span>
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            </div>
          );
        };

        return (
          <div className="space-y-6">
            {populatedGroups.length > 0 ? (
              <>
                {populatedGroups.map(({ group, subjects: grpSubjects }) => {
                  const isCollapsed = collapsedGroups.has(group.id);
                  const groupTotals = grpSubjects.reduce(
                    (acc, s) => {
                      const m = getSubjectMetrics(s.id);
                      return {
                        required: acc.required + m.totalRequiredClasses,
                        completed: acc.completed + m.completedClassesCount,
                      };
                    },
                    { required: 0, completed: 0 }
                  );

                  return (
                    <div
                      key={group.id}
                      className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950/60"
                    >
                      <button
                        type="button"
                        onClick={() => toggleGroup(group.id)}
                        className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3.5 bg-zinc-900/80 hover:bg-zinc-900 transition-colors border-b border-zinc-800/80"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {isCollapsed ? (
                            <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                          )}
                          <Layers className="w-4 h-4 text-brand-red shrink-0" />
                          <span className="text-sm font-bold uppercase tracking-wider text-white text-left truncate">
                            {group.name}
                          </span>
                          <span className="text-xs text-zinc-500 tabular-nums whitespace-nowrap">
                            · {grpSubjects.length}{' '}
                            {grpSubjects.length === 1 ? 'disciplina' : 'disciplinas'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-4 text-xs sm:text-sm pl-7 sm:pl-0 shrink-0 tabular-nums">
                          <span className="text-zinc-400 whitespace-nowrap">
                            {groupTotals.completed} / {groupTotals.required} aulas concluídas
                          </span>
                          <div className="w-24 h-2 bg-zinc-800 rounded-full overflow-hidden shrink-0">
                            <div
                              className="h-full bg-brand-red transition-all duration-500"
                              style={{
                                width: `${
                                  groupTotals.required > 0
                                    ? Math.min(
                                        100,
                                        (groupTotals.completed / groupTotals.required) * 100
                                      )
                                    : 0
                                }%`,
                              }}
                            />
                          </div>
                        </div>
                      </button>

                      {!isCollapsed && (
                        <div className="p-4 space-y-3">
                          {grpSubjects.map((subject) => renderSubjectAccordion(subject))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {ungroupedActiveSubjects.length > 0 && (
                  <div className="border border-zinc-800/80 rounded-xl overflow-hidden bg-zinc-950/40">
                    <button
                      type="button"
                      onClick={() => toggleGroup('__UNGROUPED__')}
                      className="w-full flex items-center justify-between px-4 py-3 bg-zinc-900/50 hover:bg-zinc-900/80 transition-colors border-b border-zinc-800/60"
                    >
                      <div className="flex items-center gap-2.5">
                        {collapsedGroups.has('__UNGROUPED__') ? (
                          <ChevronRight className="w-4 h-4 text-zinc-500" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-zinc-500" />
                        )}
                        <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                          Demais Disciplinas
                        </span>
                        <span className="text-xs text-zinc-600 tabular-nums">
                          · {ungroupedActiveSubjects.length}{' '}
                          {ungroupedActiveSubjects.length === 1 ? 'disciplina' : 'disciplinas'}
                        </span>
                      </div>
                    </button>

                    {!collapsedGroups.has('__UNGROUPED__') && (
                      <div className="p-4 space-y-3">
                        {ungroupedActiveSubjects.map((subject) => renderSubjectAccordion(subject))}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-4">
                {activeSubjects.map((subject) => renderSubjectAccordion(subject))}
              </div>
            )}

            {activeSubjects.length === 0 && (
              <div className="text-center py-12 border border-dashed border-zinc-800 rounded-lg bg-zinc-900/30">
                <AlertCircle className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
                <h3 className="text-zinc-400 font-medium">Nenhuma disciplina encontrada</h3>
                <p className="text-zinc-500 text-sm mt-1">Cadastre disciplinas e tópicos para visualizar o planejamento.</p>
              </div>
            )}
          </div>
        );
      })()}
      {previewGuidedMeta && (
        <StudentGuidedStudyModal
          isOpen={Boolean(previewGuidedMeta)}
          isAdminPreview
          meta={previewGuidedMeta}
          classId={classId || ''}
          userId={currentUser?.uid || 'admin-preview'}
          onClose={() => setPreviewGuidedMeta(null)}
        />
      )}
    </div>
  );
}
