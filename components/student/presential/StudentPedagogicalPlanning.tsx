import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Link as LinkIcon,
  CheckCircle,
  Clock,
  AlertCircle,
  BookOpen,
  Video,
  CheckCircle2,
  Calendar,
  PlayCircle,
  ClipboardList,
  Layers,
  Link2,
  Radio,
  Target,
  FileJson,
  HelpCircle,
  Scale,
  Zap
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Subject, SubjectGroup, Topic } from '../../../types/curriculum';
import { ClassScheduleEvent } from '../../../types/schedule';
import { Teacher } from '../../../types/teacher';
import {
  GuidedStudyMeta,
  GuidedStudyProgress,
  computeClassEncounterMap,
  getGuidedMetasForModule,
  getGuidedModuleStudentStatus
} from '../../../types/guidedStudy';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { twMerge } from 'tailwind-merge';
import { useAuth } from '../../../contexts/AuthContext';
import { openWatermarkedPdf } from '../../../utils/pdfSecurityService';
import { classScheduleService } from '../../../services/classScheduleService';
import { curriculumService } from '../../../services/curriculumService';
import { classService } from '../../../services/classService';
import { teacherService } from '../../../services/teacherService';
import { guidedStudyService } from '../../../services/guidedStudyService';
import { StudentGuidedStudyModal } from './StudentGuidedStudyModal';
import { toLocalISODate } from '../../../utils/dateUtils';
import { getSubjectEffectiveSlotCount } from '../../../utils/scheduler/ContentResolver';

interface StudentPedagogicalPlanningProps {
  classId: string;
  masterClassId?: string;
  totalMeetings?: number;
  subjectGroups?: SubjectGroup[];
}

const getStudentGuidedMetaTypeDisplay = (type: GuidedStudyMeta['type']) => {
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

export function StudentPedagogicalPlanning({ classId, masterClassId, totalMeetings = 0, subjectGroups: initialSubjectGroups }: StudentPedagogicalPlanningProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentUser, userData } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectGroups, setSubjectGroups] = useState<SubjectGroup[]>(initialSubjectGroups || []);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [events, setEvents] = useState<ClassScheduleEvent[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [guidedMetas, setGuidedMetas] = useState<GuidedStudyMeta[]>([]);
  const [studentProgress, setStudentProgress] = useState<Record<string, GuidedStudyProgress>>({});
  const [isGuidedStudyEnabled, setIsGuidedStudyEnabled] = useState(false);
  const [classShift, setClassShift] = useState<string | undefined>(undefined);
  const [selectedMetaForModal, setSelectedMetaForModal] = useState<GuidedStudyMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const todayIso = useMemo(() => toLocalISODate(), []);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set());
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (initialSubjectGroups) {
      setSubjectGroups(initialSubjectGroups);
    }
  }, [initialSubjectGroups]);

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

  const refreshStudentProgress = useCallback(async () => {
    if (!currentUser?.uid || !classId) return;
    try {
      const progressData = await guidedStudyService.getStudentProgress(currentUser.uid, classId);
      setStudentProgress(progressData);
    } catch (error) {
      console.error('Erro ao atualizar progresso do estudo guiado:', error);
    }
  }, [currentUser?.uid, classId]);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        const [eventsData, subjectsData, topicsData, teachersData, classDoc] = await Promise.all([
          classScheduleService.getScheduleEventsByClass(classId),
          curriculumService.getSubjectsByClass(classId),
          curriculumService.getTopicsByClass(classId),
          teacherService.getTeachers(),
          classService.getClassById(classId).catch(() => null),
        ]);

        if (cancelled) return;

        setEvents(eventsData);
        setSubjects(subjectsData);
        setTopics(topicsData);
        setTeachers(teachersData);
        if (classDoc?.subjectGroups && initialSubjectGroups === undefined) {
          setSubjectGroups(classDoc.subjectGroups);
        }
        setIsGuidedStudyEnabled(Boolean(classDoc?.isGuidedStudyEnabled));
        setClassShift(classDoc?.shift);

        const resolvedMasterId = masterClassId || classDoc?.masterClassId;
        try {
          let metas = await guidedStudyService.getMetasByClass(classId);
          if (metas.length === 0 && resolvedMasterId) {
            metas = await guidedStudyService.getMetasByClass(resolvedMasterId);
          }
          if (!cancelled) setGuidedMetas(metas);
        } catch (metaErr) {
          console.error('Erro ao carregar metas do estudo guiado no planejamento do aluno:', metaErr);
        }

        if (currentUser?.uid) {
          const progressData = await guidedStudyService
            .getStudentProgress(currentUser.uid, classId)
            .catch(() => ({} as Record<string, GuidedStudyProgress>));
          if (!cancelled) setStudentProgress(progressData);
        }
      } catch (error) {
        console.error("Error loading planning data:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadData();
    return () => {
      cancelled = true;
    };
  }, [classId, masterClassId, currentUser?.uid]);

  useEffect(() => {
    const handleGlobalProgressUpdate = () => {
      refreshStudentProgress();
    };
    window.addEventListener('insanus:presential-progress-updated', handleGlobalProgressUpdate);
    return () => {
      window.removeEventListener('insanus:presential-progress-updated', handleGlobalProgressUpdate);
    };
  }, [refreshStudentProgress]);

  const handleOpenPdf = async (url: string, title: string) => {
    try {
      await openWatermarkedPdf(url, {
        uid: currentUser?.uid,
        email: currentUser?.email || 'aluno@insanus.com',
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
  
  const handleGoToTeachingArea = (teachingAreaLink: any) => {
    if (!teachingAreaLink) return;
    
    // Para turmas presenciais, o classId é usado como courseId para a Área de Ensino
    const courseId = classId; 

    if (courseId) {
      navigate(`/app/presential/${classId}?module=${teachingAreaLink.moduleId}&folder=${teachingAreaLink.folderId}`);
    } else {
      console.error("ID do curso online não encontrado para realizar o redirecionamento.");
    }
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

  const nonPresencialModuleIds = React.useMemo(() => {
    return new Set(
      topics.flatMap(t => t.modules || [])
        .filter(m => m.isOnline || m.isGuidedStudy)
        .map(m => m.id)
    );
  }, [topics]);

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
  const globalStats = React.useMemo(() => {
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
        defaultShift: classShift,
        totalMeetings,
        todayIso,
        includeGuidedStudy: isGuidedStudyEnabled
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
  }, [subjects, topics, events, nonPresencialModuleIds, isGuidedStudyEnabled, guidedMetas, classShift, totalMeetings, todayIso]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-red-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
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
            <CheckCircle2 className={twMerge(
              "w-6 h-6",
              globalStats.completedMeetingsCount >= totalMeetings && totalMeetings > 0 ? "text-emerald-500" : "text-zinc-600"
            )} />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-6">
        <BookOpen className="w-6 h-6 text-red-500" />
        <h2 className="text-xl font-bold text-white">Planejamento Pedagógico</h2>
      </div>

      {(() => {
        const renderSubjectAccordion = (subject: Subject) => {
          const { subjectTopics, totalRequiredClasses, completedClassesCount } = getSubjectMetrics(subject.id);
          const isExpanded = expandedSubjects.has(subject.id);
          const sortedTopics = [...subjectTopics].sort((a, b) => (a.order || 0) - (b.order || 0));

          return (
            <div key={subject.id} className="border border-zinc-800 rounded-lg overflow-hidden bg-black">
            {/* Subject Header */}
            <button
              onClick={() => toggleSubject(subject.id)}
              className="w-full flex flex-col md:flex-row md:items-center justify-between p-4 hover:bg-zinc-900 transition-colors gap-3 md:gap-0"
            >
              <div className="flex items-center gap-3 w-full md:w-auto">
                {isExpanded ? <ChevronDown className="w-5 h-5 text-zinc-400 shrink-0" /> : <ChevronRight className="w-5 h-5 text-zinc-400 shrink-0" />}
                <div 
                  className="w-3 h-3 rounded-full shrink-0" 
                  style={{ backgroundColor: subject.color }}
                />
                <span className="font-medium text-zinc-100 text-left">{subject.name}</span>
              </div>
              <div className="flex items-center justify-between md:justify-end gap-4 text-sm w-full md:w-auto pl-11 md:pl-0 tabular-nums">
                <span className="text-zinc-400 text-xs md:text-sm whitespace-nowrap">
                  {completedClassesCount} / {totalRequiredClasses} aulas concluídas
                </span>
                <div className="w-20 md:w-24 h-2 bg-zinc-800 rounded-full overflow-hidden shrink-0">
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
              <div className="border-t border-zinc-800 bg-black">
                {sortedTopics.map(topic => {
                  const isTopicExpanded = expandedTopics.has(topic.id);
                  const topicModules = topic.modules || [];

                  return (
                    <div key={topic.id} className="border-b border-zinc-800 last:border-0">
                      {/* Topic Header */}
                      <button
                        onClick={() => toggleTopic(topic.id)}
                        className="w-full flex flex-col md:flex-row md:items-center justify-between p-3 pl-8 hover:bg-zinc-900 transition-colors gap-1 md:gap-0"
                      >
                        <div className="flex items-center gap-3 w-full md:w-auto">
                          {isTopicExpanded ? <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" /> : <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />}
                          <span className="text-sm font-medium text-zinc-300 text-left">{topic.name}</span>
                        </div>
                        <span className="text-xs text-zinc-500 text-left pl-7 md:pl-0 shrink-0 tabular-nums">
                          {topicModules.length} módulos
                        </span>
                      </button>

                      {/* Topic Content (Modules) */}
                      {isTopicExpanded && (
                        <div className="bg-black pl-12 pr-4 py-2 space-y-2">
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
                            const guidedStudentState = getGuidedModuleStudentStatus(
                              linkedGuidedMetas,
                              studentProgress,
                              todayIso
                            );

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
                                className="border border-zinc-800 rounded-md overflow-hidden bg-black transition-all duration-500"
                              >
                                {/* Module Header */}
                                <button
                                  onClick={() => toggleModule(module.id)}
                                  className="w-full flex flex-col md:flex-row md:items-center justify-between p-3 hover:bg-zinc-900 transition-colors gap-2 md:gap-0"
                                >
                                  <div className="flex items-center gap-3 w-full md:w-auto">
                                    {isModuleExpanded ? <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" /> : <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />}
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-sm text-zinc-300 text-left">{module.name}</span>
                                      {module.isOnline && (
                                        <span className="text-[10px] bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded border border-blue-500/20 font-medium uppercase shrink-0">
                                          Online
                                        </span>
                                      )}
                                      {isGuidedMod && (
                                        <span className="inline-flex items-center gap-1 text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded border border-amber-500/25 font-bold uppercase shrink-0 whitespace-nowrap">
                                          <Target className="w-2.5 h-2.5 shrink-0" />
                                          Estudo Guiado
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between md:justify-end gap-3 text-xs text-zinc-500 w-full md:w-auto pl-7 md:pl-0 tabular-nums">
                                    <span className="flex items-center gap-1 shrink-0">
                                      <FileText className="w-3 h-3" />
                                      {moduleContents.length}
                                    </span>
                                    {!module.isOnline && !isGuidedMod && linkedGuidedMetas.length > 0 && (
                                      <span
                                        className={twMerge(
                                          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-bold whitespace-nowrap shrink-0",
                                          guidedStudentState.status === 'COMPLETED'
                                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                                            : "bg-amber-500/10 text-amber-400 border-amber-500/25"
                                        )}
                                      >
                                        <Target className="w-2.5 h-2.5 shrink-0" />
                                        {guidedStudentState.completedCount}/{guidedStudentState.totalCount} guiadas
                                      </span>
                                    )}
                                    {module.isOnline ? (
                                      <div className={`flex items-center gap-1.5 text-xs shrink-0 ${module.onlineStatus === 'PUBLICADO' ? 'text-green-500' : 'text-amber-500'}`}>
                                        {module.onlineStatus === 'PUBLICADO' ? <CheckCircle2 size={14} /> : <Video size={14} />}
                                        <span className="font-medium whitespace-nowrap">{module.onlineStatus === 'PUBLICADO' ? 'Publicado' : 'Em Gravação'}</span>
                                      </div>
                                    ) : isGuidedMod ? (
                                      <span
                                        className={twMerge(
                                          "flex items-center gap-1.5 shrink-0 whitespace-nowrap font-semibold",
                                          guidedStudentState.status === 'COMPLETED'
                                            ? "text-emerald-400"
                                            : guidedStudentState.status === 'IN_PROGRESS' || guidedStudentState.status === 'AVAILABLE'
                                              ? "text-amber-400"
                                              : guidedStudentState.status === 'SCHEDULED'
                                                ? "text-amber-400/80"
                                                : "text-zinc-500"
                                        )}
                                      >
                                        {guidedStudentState.status === 'COMPLETED' ? (
                                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                        ) : (
                                          <Clock className="w-3.5 h-3.5 shrink-0" />
                                        )}
                                        {guidedStudentState.status === 'COMPLETED'
                                          ? `Concluído · ${guidedStudentState.completedCount}/${guidedStudentState.totalCount}`
                                          : guidedStudentState.status === 'IN_PROGRESS'
                                            ? `Em andamento · ${guidedStudentState.completedCount}/${guidedStudentState.totalCount}`
                                            : guidedStudentState.status === 'AVAILABLE'
                                              ? `Disponível · 0/${guidedStudentState.totalCount}`
                                              : guidedStudentState.status === 'SCHEDULED'
                                                ? `Agendado · ${guidedStudentState.totalCount} ${guidedStudentState.totalCount === 1 ? 'meta' : 'metas'}`
                                                : 'Aguardando metas'}
                                      </span>
                                    ) : isGroupedModule ? (
                                      <span
                                        className={twMerge(
                                          "flex items-center gap-1 shrink-0 whitespace-nowrap",
                                          completedModuleEvents.length > 0 ? "text-emerald-400" : "text-amber-400/90"
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
                                      <span className="flex items-center gap-1 shrink-0 whitespace-nowrap">
                                        <Clock className="w-3 h-3 shrink-0" />
                                        {Math.min(module.classesCount || 1, completedModuleParts)} / {module.classesCount} aulas
                                      </span>
                                    )}
                                  </div>
                                </button>

                                {/* Module Content (Materials & Classes) */}
                                {isModuleExpanded && (
                                  <div className="p-4 space-y-6 border-t border-zinc-800 bg-black">
                                    
                                    {module.isOnline && (
                                      <div className="mb-4 bg-gray-800/50 border border-gray-700/50 rounded-lg p-4">
                                        <div className="flex items-start justify-between flex-wrap gap-4">
                                          <div>
                                            <h4 className="text-sm font-medium text-white mb-1">Conteúdo Online</h4>
                                            <p className="text-xs text-gray-400">
                                              {module.onlineStatus === 'PUBLICADO' 
                                                ? 'As aulas deste módulo já estão disponíveis e podem ser assistidas na sua Área de Ensino.' 
                                                : 'Este conteúdo está em fase de produção e será disponibilizado em breve.'}
                                            </p>
                                            {module.onlineStatus === 'EM_GRAVACAO' && module.publicationDate && (
                                              <div className="flex items-center gap-2 mt-3 text-xs text-amber-500 bg-amber-500/10 px-2 py-1.5 rounded w-fit font-medium border border-amber-500/20">
                                                <Calendar size={13} />
                                                <span>Previsão de publicação: {new Date(module.publicationDate).toLocaleDateString('pt-BR')}</span>
                                              </div>
                                            )}
                                          </div>
                                          {module.onlineStatus === 'PUBLICADO' && (
                                            <button 
                                              onClick={() => handleGoToTeachingArea(module.teachingAreaLink)}
                                              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-medium transition shadow-lg shadow-blue-500/20 shrink-0"
                                            >
                                              <PlayCircle size={16} />
                                              Ir para Área de Ensino
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* Materials Section */}
                                    {moduleContents.length > 0 && (() => {
                                      const theoryPdfs = moduleContents.filter(c => (c.fileType === 'theory' || !c.fileType) && c.type === 'PDF');
                                      const linkedQuestionPdfs = moduleContents.filter(c => c.fileType === 'questions' && c.linkedTheoryId && c.type === 'PDF');
                                      const unlinkedQuestionPdfs = moduleContents.filter(c => c.fileType === 'questions' && !c.linkedTheoryId && c.type === 'PDF');
                                      const otherContents = moduleContents.filter(c => c.type !== 'PDF');

                                      return (
                                        <div className="space-y-3">
                                          <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Materiais de Apoio</h4>
                                          <div className="flex flex-col gap-2">
                                            {/* Render Theories and Linked Questions */}
                                            {theoryPdfs.map(theoryPdf => (
                                              <React.Fragment key={theoryPdf.id}>
                                                {/* Theory Card */}
                                                <button 
                                                  onClick={() => handleOpenPdf(theoryPdf.url, theoryPdf.title)}
                                                  className="w-full text-left flex items-center gap-3 p-3 rounded-md bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800 transition-all group relative z-10"
                                                >
                                                  <div className="p-2 rounded-md bg-black border border-zinc-800 group-hover:border-zinc-700">
                                                    <FileText className="w-4 h-4 text-red-500" />
                                                  </div>
                                                  <div className="flex-1">
                                                    <p className="text-sm text-zinc-300 group-hover:text-white transition-colors">{theoryPdf.title}</p>
                                                    <p className="text-xs text-zinc-500">Teoria • Adicionado em {new Date(theoryPdf.createdAt).toLocaleDateString('pt-BR')}</p>
                                                  </div>
                                                </button>

                                                {/* Linked Questions */}
                                                {linkedQuestionPdfs.filter(q => q.linkedTheoryId === theoryPdf.id).map(questionPdf => (
                                                  <div key={questionPdf.id} className="relative ml-8 mt-1 mb-2">
                                                    {/* Tree Connector */}
                                                    <div className="absolute -left-5 top-0 h-1/2 w-4 border-b-2 border-l-2 border-zinc-700 rounded-bl-lg"></div>
                                                    
                                                    <button 
                                                      onClick={() => handleOpenPdf(questionPdf.url, questionPdf.title)}
                                                      className="w-full text-left flex items-center gap-3 p-2.5 rounded-md bg-zinc-900/40 border border-zinc-800/50 hover:border-zinc-700 hover:bg-zinc-800 transition-all group relative z-10"
                                                    >
                                                      <div className="p-1.5 rounded bg-black/40 border border-zinc-800/50 group-hover:border-zinc-700">
                                                        <ClipboardList className="w-3.5 h-3.5 text-orange-500" />
                                                      </div>
                                                      <div className="flex-1">
                                                        <p className="text-sm text-zinc-400 group-hover:text-white transition-colors">{questionPdf.title}</p>
                                                        <p className="text-[10px] text-zinc-600">Questões Vinculadas</p>
                                                      </div>
                                                    </button>
                                                  </div>
                                                ))}
                                              </React.Fragment>
                                            ))}

                                            {/* Unlinked Questions Section */}
                                            {unlinkedQuestionPdfs.length > 0 && (
                                              <div className="mt-4">
                                                <h4 className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-2 px-1">Cadernos de Questões Adicionais</h4>
                                                <div className="flex flex-col gap-2">
                                                  {unlinkedQuestionPdfs.map(questionPdf => (
                                                    <button 
                                                      key={questionPdf.id}
                                                      onClick={() => handleOpenPdf(questionPdf.url, questionPdf.title)}
                                                      className="w-full text-left flex items-center gap-3 p-3 rounded-md bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800 transition-all group"
                                                    >
                                                      <div className="p-2 rounded-md bg-black border border-zinc-800 group-hover:border-zinc-700">
                                                        <ClipboardList className="w-4 h-4 text-orange-500" />
                                                      </div>
                                                      <div className="flex-1">
                                                        <p className="text-sm text-zinc-300 group-hover:text-white transition-colors">{questionPdf.title}</p>
                                                        <p className="text-xs text-zinc-500">Questões Avulsas • Adicionado em {new Date(questionPdf.createdAt).toLocaleDateString('pt-BR')}</p>
                                                      </div>
                                                    </button>
                                                  ))}
                                                </div>
                                              </div>
                                            )}

                                            {/* Other Content (Links, etc) */}
                                            {otherContents.length > 0 && (
                                              <div className={unlinkedQuestionPdfs.length > 0 || theoryPdfs.length > 0 ? "mt-4" : ""}>
                                                { (unlinkedQuestionPdfs.length > 0 || theoryPdfs.length > 0) && (
                                                  <h4 className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-2 px-1">Outros Recursos</h4>
                                                )}
                                                <div className="flex flex-col gap-2">
                                                  {otherContents.map(content => (
                                                    <button 
                                                      key={content.id}
                                                      onClick={() => window.open(content.url, '_blank')}
                                                      className="w-full text-left flex items-center gap-3 p-3 rounded-md bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800 transition-all group"
                                                    >
                                                      <div className="p-2 rounded-md bg-black border border-zinc-800 group-hover:border-zinc-700">
                                                        <LinkIcon className="w-4 h-4 text-blue-400" />
                                                      </div>
                                                      <div className="flex-1">
                                                        <p className="text-sm text-zinc-300 group-hover:text-white transition-colors">{content.title}</p>
                                                        <p className="text-xs text-zinc-500">Link Externo • Adicionado em {new Date(content.createdAt).toLocaleDateString('pt-BR')}</p>
                                                      </div>
                                                    </button>
                                                  ))}
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })()}

                                    {/* Guided Study Metas Section (Estudo Guiado modules OR Presencial modules with linked metas) */}
                                    {(isGuidedMod || linkedGuidedMetas.length > 0) && (
                                      <div className="space-y-3">
                                        <div className="flex items-center justify-between gap-2 flex-wrap">
                                          <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                                            <Target className="w-3.5 h-3.5 shrink-0" />
                                            Metas do Estudo Guiado ({guidedStudentState.completedCount}/{guidedStudentState.totalCount})
                                          </h4>
                                          {guidedStudentState.totalCount > 0 && (
                                            <span
                                              className={twMerge(
                                                "text-[11px] font-bold px-2 py-0.5 rounded-full border",
                                                guidedStudentState.status === 'COMPLETED'
                                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                                                  : "bg-amber-500/10 text-amber-400 border-amber-500/25"
                                              )}
                                            >
                                              {guidedStudentState.status === 'COMPLETED'
                                                ? 'Todas concluídas'
                                                : 'Clique em uma meta para estudar'}
                                            </span>
                                          )}
                                        </div>

                                        {linkedGuidedMetas.length === 0 ? (
                                          <div className="text-center py-6 border border-dashed border-amber-500/25 rounded-lg bg-amber-500/5 px-4">
                                            <p className="text-xs text-zinc-400">
                                              As metas de Estudo Guiado deste módulo serão liberadas no seu cronograma em breve.
                                            </p>
                                          </div>
                                        ) : (
                                          <div className="grid gap-2">
                                            {linkedGuidedMetas.map(meta => {
                                              const isMetaDone = Boolean(meta.id && studentProgress[meta.id]?.completed);
                                              const isMetaAvailable = Boolean(meta.date) && meta.date <= todayIso;
                                              const { label: typeLabel, Icon: TypeIcon } = getStudentGuidedMetaTypeDisplay(meta.type);
                                              const accentColor = meta.color || '#f59e0b';
                                              return (
                                                <button
                                                  key={meta.id || `${meta.date}_${meta.title}`}
                                                  type="button"
                                                  onClick={() => setSelectedMetaForModal(meta)}
                                                  className={twMerge(
                                                    "w-full text-left flex items-center justify-between gap-3 p-3 rounded-md border transition-all group",
                                                    isMetaDone
                                                      ? "bg-emerald-950/15 border-emerald-500/35 hover:border-emerald-400/60"
                                                      : "bg-zinc-900 border-zinc-800 hover:border-amber-500/40 hover:bg-zinc-900/80"
                                                  )}
                                                >
                                                  <div className="flex items-center gap-3 min-w-0">
                                                    <div
                                                      className="w-9 h-9 rounded-lg flex items-center justify-center border shrink-0"
                                                      style={
                                                        isMetaDone
                                                          ? {
                                                              backgroundColor: 'rgba(16, 185, 129, 0.14)',
                                                              borderColor: 'rgba(16, 185, 129, 0.35)',
                                                              color: '#34d399'
                                                            }
                                                          : {
                                                              backgroundColor: `${accentColor}18`,
                                                              borderColor: `${accentColor}40`,
                                                              color: accentColor
                                                            }
                                                      }
                                                    >
                                                      {isMetaDone ? (
                                                        <CheckCircle2 className="w-4 h-4" />
                                                      ) : (
                                                        <TypeIcon className="w-4 h-4" />
                                                      )}
                                                    </div>
                                                    <div className="min-w-0">
                                                      <div className="flex items-center gap-2 flex-wrap">
                                                        <span
                                                          className="text-[10px] font-bold uppercase tracking-wider"
                                                          style={{ color: isMetaDone ? '#34d399' : accentColor }}
                                                        >
                                                          {typeLabel}
                                                        </span>
                                                        <span className="text-sm font-medium text-zinc-200 group-hover:text-white truncate">
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
                                                        "text-xs px-2 py-0.5 rounded-full border whitespace-nowrap font-medium",
                                                        isMetaDone
                                                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                                                          : isMetaAvailable
                                                            ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                                                            : "bg-zinc-800 text-zinc-400 border-zinc-700"
                                                      )}
                                                    >
                                                      {isMetaDone
                                                        ? 'Concluída'
                                                        : isMetaAvailable
                                                          ? 'Estudar'
                                                          : 'Agendada'}
                                                    </span>
                                                    <PlayCircle className="w-4 h-4 text-zinc-500 group-hover:text-amber-400 transition-colors shrink-0" />
                                                  </div>
                                                </button>
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
                        className="w-full flex flex-col md:flex-row md:items-center justify-between gap-3 px-4 py-3.5 bg-zinc-900/80 hover:bg-zinc-900 transition-colors border-b border-zinc-800/80"
                      >
                        <div className="flex items-center gap-3 w-full md:w-auto min-w-0">
                          {isCollapsed ? (
                            <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                          )}
                          <Layers className="w-4 h-4 text-brand-red shrink-0" />
                          <span className="text-sm font-bold uppercase tracking-wider text-white text-left truncate">
                            {group.name}
                          </span>
                          <span className="text-xs text-zinc-500 tabular-nums whitespace-nowrap shrink-0">
                            · {grpSubjects.length}{' '}
                            {grpSubjects.length === 1 ? 'disciplina' : 'disciplinas'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between md:justify-end gap-4 text-xs md:text-sm w-full md:w-auto pl-7 md:pl-0 shrink-0 tabular-nums">
                          <span className="text-zinc-400 whitespace-nowrap">
                            {groupTotals.completed} / {groupTotals.required} aulas concluídas
                          </span>
                          <div className="w-20 md:w-24 h-2 bg-zinc-800 rounded-full overflow-hidden shrink-0">
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
                        <div className="p-3 md:p-4 space-y-3">
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
                          <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
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
                      <div className="p-3 md:p-4 space-y-3">
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
                <p className="text-zinc-500 text-sm mt-1">O planejamento pedagógico será disponibilizado em breve.</p>
              </div>
            )}
          </div>
        );
      })()}
      {selectedMetaForModal && (
        <StudentGuidedStudyModal
          isOpen={Boolean(selectedMetaForModal)}
          meta={selectedMetaForModal}
          classId={classId}
          userId={currentUser?.uid || ''}
          progress={selectedMetaForModal.id ? studentProgress[selectedMetaForModal.id] : undefined}
          onClose={() => setSelectedMetaForModal(null)}
          onProgressUpdated={async () => {
            await refreshStudentProgress();
            window.dispatchEvent(new CustomEvent('insanus:presential-progress-updated'));
          }}
        />
      )}
    </div>
  );
}
