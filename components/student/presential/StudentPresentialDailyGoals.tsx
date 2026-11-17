import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Target,
  Calendar,
  Clock,
  CheckCircle2,
  Circle,
  Play,
  PlayCircle,
  FileText,
  FileJson,
  HelpCircle,
  Scale,
  Zap,
  BookOpen,
  Radio,
  MapPin,
  Trophy,
  DoorOpen,
  Lock,
  Flag,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  User,
  Coffee,
  AlertTriangle,
  ExternalLink,
  MessageSquare,
  ArrowUpRight,
  Layers
} from 'lucide-react';
import { classScheduleService } from '../../../services/classScheduleService';
import { curriculumService } from '../../../services/curriculumService';
import { teacherService } from '../../../services/teacherService';
import { holidayService } from '../../../services/holidayService';
import { guidedStudyService } from '../../../services/guidedStudyService';
import { ClassScheduleEvent } from '../../../types/schedule';
import { Subject, Topic } from '../../../types/curriculum';
import { Teacher } from '../../../types/teacher';
import { LiveEvent } from '../../../types/liveEvent';
import { GuidedStudyMeta, GuidedStudyMetaType, GuidedStudyProgress } from '../../../types/guidedStudy';
import { StudentGuidedStudyModal } from './StudentGuidedStudyModal';
import { useAuth } from '../../../contexts/AuthContext';
import { toLocalISODate, parseSafeLocalDate, formatSafeDateLocal } from '../../../utils/dateUtils';

interface StudentPresentialDailyGoalsProps {
  classId: string;
  masterClassId?: string;
  linkedSimulatedId?: string | null;
  liveEvents?: LiveEvent[];
  onSwitchTab?: (tabId: string, queryParams?: Record<string, string>) => void;
  onProgressUpdated?: () => void;
  canOpenSchedule?: boolean;
  canOpenPlanning?: boolean;
  canOpenSimuladosTab?: boolean;
  canOpenLiveTab?: boolean;
}

const META_TYPE_CONFIG: Record<
  GuidedStudyMetaType,
  { label: string; defaultColor: string; Icon: React.ComponentType<{ size?: number; className?: string }> }
> = {
  aula: { label: 'AULA', defaultColor: '#3b82f6', Icon: PlayCircle },
  material: { label: 'PDF', defaultColor: '#f97316', Icon: FileText },
  questoes: { label: 'QUESTÕES', defaultColor: '#10b981', Icon: HelpCircle },
  lei_seca: { label: 'LEI SECA', defaultColor: '#eab308', Icon: Scale },
  flashcards: { label: 'FLASHCARD', defaultColor: '#ec4899', Icon: Zap },
  resumo: { label: 'RESUMO', defaultColor: '#a855f7', Icon: BookOpen },
  interactive_map: { label: 'MAPA .JSON', defaultColor: '#6366f1', Icon: FileJson }
};

const SHIFT_LABELS: Record<string, string> = {
  MORNING: 'MANHÃ',
  AFTERNOON: 'TARDE',
  NIGHT: 'NOITE'
};

const formatSimuladoDurationLabel = (minutes?: number): string => {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  if (total === 0) return '';
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0 && m > 0) return `${h}h ${String(m).padStart(2, '0')}min`;
  if (h > 0) return `${h}h`;
  return `${m} min`;
};

const calculateSlotDurationMinutes = (startTime?: string, endTime?: string): number => {
  if (!startTime || !endTime) return 0;
  const [sH, sM] = startTime.split(':').map(Number);
  const [eH, eM] = endTime.split(':').map(Number);
  if (Number.isNaN(sH) || Number.isNaN(sM) || Number.isNaN(eH) || Number.isNaN(eM)) return 0;
  const diff = eH * 60 + eM - (sH * 60 + sM);
  return diff > 0 ? diff : 0;
};

const shiftISODateByDays = (isoDate: string, deltaDays: number): string => {
  const parsed = parseSafeLocalDate(isoDate) || new Date();
  parsed.setDate(parsed.getDate() + deltaDays);
  return toLocalISODate(parsed);
};

export const StudentPresentialDailyGoals: React.FC<StudentPresentialDailyGoalsProps> = ({
  classId,
  masterClassId,
  linkedSimulatedId,
  liveEvents = [],
  onSwitchTab,
  onProgressUpdated,
  canOpenSchedule = true,
  canOpenPlanning = true,
  canOpenSimuladosTab,
  canOpenLiveTab = true
}) => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const todayString = toLocalISODate();

  const [selectedDate, setSelectedDate] = useState<string>(todayString);
  const [events, setEvents] = useState<ClassScheduleEvent[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [guidedMetas, setGuidedMetas] = useState<GuidedStudyMeta[]>([]);
  const [studentProgress, setStudentProgress] = useState<Record<string, GuidedStudyProgress>>({});
  const [loading, setLoading] = useState<boolean>(true);

  // Interactive UI states for cards & modals
  const [expandedMetaIds, setExpandedMetaIds] = useState<Record<string, boolean>>({});
  const [expandedNoteIds, setExpandedNoteIds] = useState<Record<string, boolean>>({});
  const [selectedMetaForModal, setSelectedMetaForModal] = useState<GuidedStudyMeta | null>(null);
  const [confirmCompleteMeta, setConfirmCompleteMeta] = useState<GuidedStudyMeta | null>(null);
  const [togglingMetaId, setTogglingMetaId] = useState<string | null>(null);

  const reloadGuidedProgress = useCallback(async () => {
    if (!currentUser?.uid) return;
    const prog = await guidedStudyService.getStudentProgress(currentUser.uid, classId);
    setStudentProgress(prog);
    if (onProgressUpdated) onProgressUpdated();
    window.dispatchEvent(
      new CustomEvent('insanus:presential-progress-updated', { detail: { classId } })
    );
  }, [currentUser?.uid, classId, onProgressUpdated]);

  useEffect(() => {
    let isMounted = true;

    const loadAllData = async () => {
      setLoading(true);
      try {
        const [
          primaryEvents,
          primarySubjects,
          primaryTopics,
          teachersList,
          holidaysList,
          primaryMetas
        ] = await Promise.all([
          classScheduleService.getScheduleEventsByClass(classId),
          curriculumService.getSubjectsByClass(classId),
          curriculumService.getTopicsByClass(classId),
          teacherService.getTeachers(),
          holidayService.getHolidays(),
          guidedStudyService.getMetasByClass(classId)
        ]);

        let resolvedEvents = primaryEvents;
        let resolvedSubjects = primarySubjects;
        let resolvedTopics = primaryTopics;
        let resolvedMetas = primaryMetas;

        if (masterClassId) {
          const [masterEvents, masterSubjects, masterTopics, masterMetas] = await Promise.all([
            resolvedEvents.length === 0
              ? classScheduleService.getScheduleEventsByClass(masterClassId)
              : Promise.resolve([]),
            resolvedSubjects.length === 0
              ? curriculumService.getSubjectsByClass(masterClassId)
              : Promise.resolve([]),
            resolvedTopics.length === 0
              ? curriculumService.getTopicsByClass(masterClassId)
              : Promise.resolve([]),
            resolvedMetas.length === 0
              ? guidedStudyService.getMetasByClass(masterClassId)
              : Promise.resolve([])
          ]);

          if (resolvedEvents.length === 0 && masterEvents.length > 0) resolvedEvents = masterEvents;
          if (resolvedSubjects.length === 0 && masterSubjects.length > 0) resolvedSubjects = masterSubjects;
          if (resolvedTopics.length === 0 && masterTopics.length > 0) resolvedTopics = masterTopics;
          if (resolvedMetas.length === 0 && masterMetas.length > 0) resolvedMetas = masterMetas;
        }

        let resolvedProgress: Record<string, GuidedStudyProgress> = {};
        if (currentUser?.uid) {
          resolvedProgress = await guidedStudyService.getStudentProgress(currentUser.uid, classId);
        }

        if (!isMounted) return;
        setEvents(resolvedEvents);
        setSubjects(resolvedSubjects);
        setTopics(resolvedTopics);
        setTeachers(teachersList);
        setHolidays(holidaysList);
        setGuidedMetas(resolvedMetas);
        setStudentProgress(resolvedProgress);
      } catch (err) {
        console.error('Erro ao carregar Metas de Hoje da turma presencial:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadAllData();
    return () => {
      isMounted = false;
    };
  }, [classId, masterClassId, currentUser?.uid]);

  const getSubject = useCallback(
    (subjectId: string) => subjects.find(s => s.id === subjectId),
    [subjects]
  );

  const getTeacherName = useCallback(
    (teacherId: string) => teachers.find(t => t.id === teacherId)?.name || 'Professor a definir',
    [teachers]
  );

  const getEventModules = useCallback(
    (event: ClassScheduleEvent) => {
      const rawLinks =
        event.linkedModules && event.linkedModules.length > 0
          ? event.linkedModules
          : event.topicId && event.moduleId && event.moduleId !== 'extra'
            ? [{ topicId: event.topicId, moduleId: event.moduleId, moduleIndex: event.moduleIndex }]
            : [];

      const seen = new Set<string>();
      const resolved: { topicId: string; moduleId: string; topicName: string; moduleName: string }[] = [];

      rawLinks.forEach(link => {
        if (!link.moduleId || seen.has(link.moduleId)) return;
        seen.add(link.moduleId);
        const topic = topics.find(t => t.id === link.topicId);
        const mod = topic?.modules?.find(m => m.id === link.moduleId);
        const moduleName =
          mod?.name ||
          (link.moduleId.startsWith('topic-') && topic?.name ? topic.name : 'Módulo programado');
        resolved.push({
          topicId: link.topicId,
          moduleId: link.moduleId,
          topicName: topic?.name || 'Assunto',
          moduleName
        });
      });

      return resolved;
    },
    [topics]
  );

  // Eventos do dia selecionado (excluindo cancelados)
  const dayScheduleEvents = useMemo(() => {
    return events
      .filter(ev => ev.date === selectedDate && ev.status !== 'CANCELED')
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [events, selectedDate]);

  // Metas do Estudo Guiado do dia selecionado
  const dayGuidedMetas = useMemo(() => {
    return guidedMetas.filter(meta => meta.date === selectedDate);
  }, [guidedMetas, selectedDate]);

  // Metas do Estudo Guiado em atraso (exibidas quando estamos visualizando HOJE)
  const overdueGuidedMetas = useMemo(() => {
    if (selectedDate !== todayString) return [];
    return guidedMetas
      .filter(meta => {
        if (!meta.id || !meta.date) return false;
        const isCompleted = Boolean(studentProgress[meta.id]?.completed);
        return meta.date < todayString && !isCompleted;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [guidedMetas, studentProgress, selectedDate, todayString]);

  const isHoliday = useMemo(() => {
    return holidays.includes(selectedDate) && dayScheduleEvents.length === 0;
  }, [holidays, selectedDate, dayScheduleEvents.length]);

  // Estatísticas do dia selecionado
  const dayStats = useMemo(() => {
    const totalMetas = dayGuidedMetas.length;
    const completedMetas = dayGuidedMetas.filter(m => m.id && studentProgress[m.id]?.completed).length;

    const totalEvents = dayScheduleEvents.length;
    const completedEvents = dayScheduleEvents.filter(e => e.status === 'COMPLETED').length;

    const metasMinutes = dayGuidedMetas.reduce((acc, m) => acc + (Number(m.duration) || 30), 0);
    const eventsMinutes = dayScheduleEvents.reduce((acc, ev) => {
      if (ev.eventType === 'SIMULADO' && ev.durationMinutes) return acc + Number(ev.durationMinutes);
      return acc + calculateSlotDurationMinutes(ev.startTime, ev.endTime);
    }, 0);

    const totalTasks = totalMetas + totalEvents;
    const completedTasks = completedMetas + completedEvents;
    const allMetasCompleted = totalMetas > 0 && completedMetas === totalMetas;
    const progressPercent =
      totalMetas > 0
        ? Math.round((completedMetas / totalMetas) * 100)
        : totalEvents > 0
          ? Math.round((completedEvents / totalEvents) * 100)
          : 0;

    return {
      totalMetas,
      completedMetas,
      totalEvents,
      completedEvents,
      totalTasks,
      completedTasks,
      metasMinutes,
      totalMinutes: metasMinutes + eventsMinutes,
      allMetasCompleted,
      progressPercent
    };
  }, [dayGuidedMetas, dayScheduleEvents, studentProgress]);

  const formattedSelectedDateLong = useMemo(() => {
    const d = parseSafeLocalDate(selectedDate);
    if (!d) return selectedDate;
    return d.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  }, [selectedDate]);

  const handleDirectToggleComplete = async (meta: GuidedStudyMeta, nextCompleted: boolean) => {
    if (!currentUser?.uid || !meta.id || togglingMetaId === meta.id) return;
    const metaId = meta.id;
    setTogglingMetaId(metaId);

    const prevState = studentProgress[metaId];
    setStudentProgress(prev => ({
      ...prev,
      [metaId]: {
        completed: nextCompleted,
        completedAt: nextCompleted ? new Date().toISOString() : null,
        recordedMinutes: prev[metaId]?.recordedMinutes || meta.duration || 0
      }
    }));

    try {
      await guidedStudyService.toggleMetaProgress(
        currentUser.uid,
        classId,
        metaId,
        nextCompleted,
        nextCompleted ? meta.duration || 0 : 0
      );
      if (onProgressUpdated) onProgressUpdated();
      window.dispatchEvent(
        new CustomEvent('insanus:presential-progress-updated', { detail: { classId } })
      );
    } catch (err) {
      console.error('Erro ao alternar conclusão da meta:', err);
      setStudentProgress(prev => {
        const clone = { ...prev };
        if (prevState) clone[metaId] = prevState;
        else delete clone[metaId];
        return clone;
      });
    } finally {
      setTogglingMetaId(null);
      setConfirmCompleteMeta(null);
    }
  };

  const getMetaAttachmentsCount = (meta: GuidedStudyMeta): number => {
    let count = 0;
    if (meta.type === 'interactive_map' && (meta.interactiveMapJson || meta.interactiveMapUrl)) count++;
    if (meta.pandaVideoUrl || meta.pandaVideoId) count++;
    if (meta.pdfUrl) count++;
    if (meta.externalLink) count++;
    if (meta.cards && meta.cards.length > 0) count++;
    return count;
  };

  const renderGuidedMetaCard = (meta: GuidedStudyMeta, isDelayed = false) => {
    const metaKey = meta.id || `${meta.date}-${meta.title}`;
    const isCompleted = Boolean(meta.id && studentProgress[meta.id]?.completed);
    const cfg = META_TYPE_CONFIG[meta.type] || META_TYPE_CONFIG.aula;
    const activeColor = meta.color && meta.color.startsWith('#') ? meta.color : cfg.defaultColor;
    const isExpanded = Boolean(expandedMetaIds[metaKey]);
    const isNoteOpen = Boolean(expandedNoteIds[metaKey]);
    const attachmentsCount = getMetaAttachmentsCount(meta);
    const disciplineLabel =
      meta.disciplineName || meta.interactiveMapSummary?.disciplina || 'ESTUDO GUIADO';
    const durationMin = meta.duration || 30;
    const TypeIcon = cfg.Icon;

    return (
      <div
        key={metaKey}
        className={`group relative flex flex-col bg-zinc-900 border rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl ${
          isCompleted
            ? 'border-zinc-800/80 opacity-65'
            : isDelayed
              ? 'border-red-900/40 hover:border-red-500/50'
              : 'border-zinc-800 hover:border-zinc-700'
        }`}
      >
        {/* Faixa lateral colorida idêntica aos Planos */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1.5 z-10 transition-colors"
          style={{ backgroundColor: isCompleted ? '#10b981' : activeColor }}
        />

        {/* Topo do Card: Círculo de Conclusão + Tag de Formato + Tempo Estimado */}
        <div className="p-5 pb-2 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 flex-wrap min-w-0">
            <button
              type="button"
              disabled={!meta.id || togglingMetaId === meta.id}
              onClick={e => {
                e.stopPropagation();
                if (!meta.id) return;
                if (isCompleted) {
                  handleDirectToggleComplete(meta, false);
                } else {
                  setConfirmCompleteMeta(meta);
                }
              }}
              className="text-zinc-500 hover:text-white transition-colors focus:outline-none shrink-0"
              title={isCompleted ? 'Desmarcar conclusão' : 'Concluir meta manualmente'}
            >
              {isCompleted ? (
                <CheckCircle2 size={24} className="text-emerald-500" />
              ) : (
                <Circle size={24} className="text-zinc-600 group-hover:text-zinc-300" />
              )}
            </button>

            <span
              className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded border transition-colors flex items-center gap-1.5 shrink-0"
              style={{
                color: activeColor,
                borderColor: `${activeColor}45`,
                backgroundColor: `${activeColor}18`
              }}
            >
              <TypeIcon size={11} />
              <span>{cfg.label}</span>
            </span>

            <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider flex items-center">
              <span className="mr-1.5 opacity-40">•</span>
              ESTUDO GUIADO
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-zinc-400 shrink-0 tabular-nums">
            <Clock size={12} className="text-zinc-500" />
            <span className="text-xs font-mono font-bold">{durationMin} min</span>
          </div>
        </div>

        {/* Corpo do Card */}
        <div
          className="px-5 py-2 flex-1 cursor-pointer"
          onClick={() => setExpandedMetaIds(prev => ({ ...prev, [metaKey]: !prev[metaKey] }))}
        >
          {isDelayed && (
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
              <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest">
                ATRASADO • {formatSafeDateLocal(meta.date)}
              </span>
            </div>
          )}

          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1 truncate">
            {disciplineLabel}
          </span>

          <h3
            className={`text-sm font-black uppercase leading-snug break-words ${
              isCompleted ? 'text-zinc-500 line-through' : 'text-white'
            }`}
          >
            {meta.title}
          </h3>

          {/* Sub-informações específicas por tipo de meta */}
          {meta.type === 'interactive_map' && meta.interactiveMapSummary && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {meta.interactiveMapSummary.nodeCount > 0 && (
                <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-zinc-800/90 text-zinc-300 border border-zinc-700/70 tabular-nums">
                  {meta.interactiveMapSummary.nodeCount} Tópicos
                </span>
              )}
              {meta.interactiveMapSummary.matrixCount > 0 && (
                <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-zinc-800/90 text-zinc-300 border border-zinc-700/70 tabular-nums">
                  {meta.interactiveMapSummary.matrixCount} Quadros
                </span>
              )}
              {meta.interactiveMapSummary.questionCount > 0 && (
                <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-zinc-800/90 text-zinc-300 border border-zinc-700/70 tabular-nums">
                  {meta.interactiveMapSummary.questionCount} Questões
                </span>
              )}
              {meta.interactiveMapSummary.flashcardCount > 0 && (
                <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-zinc-800/90 text-zinc-300 border border-zinc-700/70 tabular-nums">
                  {meta.interactiveMapSummary.flashcardCount} Flashcards
                </span>
              )}
            </div>
          )}

          {meta.type === 'questoes' && meta.questionCount && meta.questionCount > 0 ? (
            <p className="text-[10px] text-emerald-400 font-bold mt-1.5 uppercase tracking-wider">
              Meta de Resolução: {meta.questionCount} questões
            </p>
          ) : null}

          {meta.type === 'lei_seca' && meta.articles ? (
            <p className="text-[10px] text-amber-400 font-bold mt-1.5 uppercase tracking-wider line-clamp-2">
              Dispositivos: {meta.articles}
            </p>
          ) : null}

          {/* Orientação / Dica de Estudo Retrátil */}
          {meta.description && (
            <div className="mt-3 flex flex-col gap-1" onClick={e => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setExpandedNoteIds(prev => ({ ...prev, [metaKey]: !prev[metaKey] }))}
                className="flex items-center justify-between w-full p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg hover:bg-amber-500/15 transition-all"
              >
                <div className="flex items-center gap-2 text-amber-400 text-[10px] font-black uppercase tracking-wider">
                  <MessageSquare size={13} />
                  <span>Orientação de Estudo</span>
                </div>
                <ChevronDown
                  size={14}
                  className={`text-amber-400 transition-transform duration-200 ${
                    isNoteOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {isNoteOpen && (
                <div className="p-3 bg-amber-500/5 border border-amber-500/15 rounded-lg text-[11px] text-zinc-300 leading-relaxed whitespace-pre-wrap animate-in fade-in duration-150">
                  {meta.description}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Indicador de Materiais Disponíveis + Gaveta Expansível */}
        {attachmentsCount > 0 && (
          <div className="px-5 pt-1">
            <button
              type="button"
              onClick={() => setExpandedMetaIds(prev => ({ ...prev, [metaKey]: !prev[metaKey] }))}
              className="w-full py-1.5 flex flex-col items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <span className="text-[9px] font-black uppercase tracking-[0.16em]">
                {attachmentsCount}{' '}
                {attachmentsCount === 1 ? 'MATERIAL DISPONÍVEL' : 'MATERIAIS DISPONÍVEIS'}
              </span>
              {isExpanded ? <ChevronUp size={13} className="mt-0.5" /> : <ChevronDown size={13} className="mt-0.5" />}
            </button>
          </div>
        )}

        {isExpanded && attachmentsCount > 0 && (
          <div className="mx-5 mb-2 p-2.5 rounded-xl bg-black/35 border border-zinc-800/80 space-y-1.5 animate-in fade-in duration-150">
            {meta.type === 'interactive_map' && (meta.interactiveMapJson || meta.interactiveMapUrl) && (
              <button
                type="button"
                onClick={() => setSelectedMetaForModal(meta)}
                className="w-full flex items-center justify-between gap-2 p-2 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-left transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileJson size={14} className="text-indigo-400 shrink-0" />
                  <span className="text-xs font-bold text-indigo-200 truncate">
                    {meta.interactiveMapFileName || 'Modelo Interativo (.JSON)'}
                  </span>
                </div>
                <span className="text-[9px] font-black uppercase tracking-wider text-indigo-300 shrink-0">
                  Abrir ↗
                </span>
              </button>
            )}

            {(meta.pandaVideoUrl || meta.pandaVideoId) && (
              <button
                type="button"
                onClick={() => setSelectedMetaForModal(meta)}
                className="w-full flex items-center justify-between gap-2 p-2 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-left transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <PlayCircle size={14} className="text-blue-400 shrink-0" />
                  <span className="text-xs font-bold text-blue-200 truncate">Videoaula Vinculada</span>
                </div>
                <span className="text-[9px] font-black uppercase tracking-wider text-blue-300 shrink-0">
                  Assistir ↗
                </span>
              </button>
            )}

            {meta.pdfUrl && (
              <button
                type="button"
                onClick={() => setSelectedMetaForModal(meta)}
                className="w-full flex items-center justify-between gap-2 p-2 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 text-left transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText size={14} className="text-orange-400 shrink-0" />
                  <span className="text-xs font-bold text-orange-200 truncate">
                    {meta.pdfName || 'Material em PDF'}
                  </span>
                </div>
                <span className="text-[9px] font-black uppercase tracking-wider text-orange-300 shrink-0">
                  Ler PDF ↗
                </span>
              </button>
            )}

            {meta.cards && meta.cards.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedMetaForModal(meta)}
                className="w-full flex items-center justify-between gap-2 p-2 rounded-lg bg-pink-500/10 hover:bg-pink-500/20 border border-pink-500/30 text-left transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Zap size={14} className="text-pink-400 shrink-0" />
                  <span className="text-xs font-bold text-pink-200 truncate">
                    Deck com {meta.cards.length} Flashcards
                  </span>
                </div>
                <span className="text-[9px] font-black uppercase tracking-wider text-pink-300 shrink-0">
                  Praticar ↗
                </span>
              </button>
            )}

            {meta.externalLink && (
              <a
                href={meta.externalLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="w-full flex items-center justify-between gap-2 p-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700 text-left transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ExternalLink size={14} className="text-zinc-300 shrink-0" />
                  <span className="text-xs font-bold text-zinc-200 truncate">Link Complementar</span>
                </div>
                <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400 shrink-0">
                  Acessar ↗
                </span>
              </a>
            )}
          </div>
        )}

        {/* Rodapé de Ação do Card (Padrão Planos) */}
        <div className="p-5 pt-3 mt-auto">
          {!isCompleted ? (
            <button
              type="button"
              onClick={() => setSelectedMetaForModal(meta)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all hover:brightness-110 shadow-lg active:scale-95 text-white"
              style={{
                backgroundColor: activeColor,
                boxShadow: `0 4px 20px ${activeColor}35`
              }}
            >
              <Play size={14} fill="currentColor" />
              <span>INICIAR ESTUDO</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setSelectedMetaForModal(meta)}
              className="w-full py-3 bg-zinc-950 hover:bg-zinc-900 border border-emerald-900/40 rounded-xl flex items-center justify-center gap-2 text-emerald-400 transition-colors"
              title="Meta concluída — clique para revisar o conteúdo"
            >
              <CheckCircle2 size={16} />
              <span className="text-xs font-black uppercase tracking-widest">
                META CONCLUÍDA • REVISAR
              </span>
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderScheduleEventCard = (event: ClassScheduleEvent, indexInDay: number) => {
    // 1. CARD PREMIUM BLACK GOLD PARA SIMULADOS
    if (event.eventType === 'SIMULADO') {
      const examStart = event.examStartTime || event.startTime;
      const examEnd = event.examEndTime || event.endTime;
      const gatesOpen = event.gatesOpenTime || examStart;
      const gatesClose = event.gatesCloseTime || examStart;
      const durationText = formatSimuladoDurationLabel(event.durationMinutes);
      const isCompleted = event.status === 'COMPLETED';
      const canOpenSimulados =
        canOpenSimuladosTab ?? Boolean(linkedSimulatedId || event.simulatedClassId);

      return (
        <div
          key={event.id}
          className={`relative flex flex-col rounded-2xl border overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl bg-gradient-to-br from-[#17130a] via-[#09090b] to-[#211909] ${
            isCompleted
              ? 'border-emerald-500/40 opacity-85'
              : 'border-amber-500/45 hover:border-amber-400/75'
          }`}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/80 to-transparent" />
          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-amber-300 via-amber-500 to-yellow-700" />

          <div className="p-5 pb-3 flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-b from-amber-400/25 to-amber-600/10 border border-amber-400/45 flex items-center justify-center shrink-0">
                <Trophy size={15} className="text-amber-300" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded border border-amber-400/40 bg-amber-500/10 text-amber-300">
                SIMULADO OFICIAL
              </span>
              {isCompleted && (
                <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                  APLICADO
                </span>
              )}
            </div>

            {durationText && (
              <div className="flex items-center gap-1.5 text-amber-300/90 tabular-nums shrink-0">
                <Clock size={12} />
                <span className="text-xs font-mono font-bold">{durationText}</span>
              </div>
            )}
          </div>

          <div className="px-5 py-2 flex-1 space-y-3">
            <div>
              <span className="text-[10px] font-bold text-amber-400/80 uppercase tracking-wider block mb-1">
                AVALIAÇÃO DE DESEMPENHO
              </span>
              <h3 className="text-sm font-black uppercase text-amber-50 leading-snug break-words">
                {event.simulatedTitle || 'Simulado Oficial da Turma'}
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-black/45 border border-amber-500/20 text-[11px] tabular-nums">
              <div className="flex flex-col">
                <span className="text-[9px] uppercase font-bold text-zinc-400 flex items-center gap-1">
                  <DoorOpen size={11} className="text-amber-400" /> Abertura Portões
                </span>
                <span className="font-bold text-amber-100 mt-0.5">{gatesOpen}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] uppercase font-bold text-amber-300/90 flex items-center gap-1">
                  <Lock size={11} className="text-amber-400" /> Fechamento
                </span>
                <span className="font-bold text-amber-300 mt-0.5">{gatesClose}</span>
              </div>
              <div className="flex flex-col pt-1.5 border-t border-amber-500/15">
                <span className="text-[9px] uppercase font-bold text-zinc-400 flex items-center gap-1">
                  <Play size={11} className="text-amber-400" /> Início da Prova
                </span>
                <span className="font-bold text-white mt-0.5">{examStart}</span>
              </div>
              <div className="flex flex-col pt-1.5 border-t border-amber-500/15">
                <span className="text-[9px] uppercase font-bold text-zinc-400 flex items-center gap-1">
                  <Flag size={11} className="text-amber-400" /> Fim Previsto
                </span>
                <span className="font-bold text-amber-200 mt-0.5">{examEnd}</span>
              </div>
            </div>

            {(event.simulatedQuestionCount || event.simulatedExamType) && (
              <div className="text-[10px] font-bold text-amber-200/75 uppercase tracking-wider">
                {event.simulatedQuestionCount ? `${event.simulatedQuestionCount} questões` : ''}
                {event.simulatedQuestionCount && event.simulatedExamType ? ' • ' : ''}
                {event.simulatedExamType
                  ? event.simulatedExamType === 'true_false'
                    ? 'Certo ou Errado'
                    : 'Múltipla Escolha'
                  : ''}
              </div>
            )}
          </div>

          <div className="p-5 pt-3 mt-auto">
            {canOpenSimulados && onSwitchTab ? (
              <button
                type="button"
                onClick={() => onSwitchTab('SIMULADOS')}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:brightness-110 text-black text-xs font-black uppercase tracking-widest shadow-lg shadow-amber-500/20 transition-all active:scale-95"
              >
                <Trophy size={14} />
                <span>ACESSAR ÁREA DE SIMULADOS</span>
                <ArrowUpRight size={14} />
              </button>
            ) : (
              <div className="w-full py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-center text-[10px] font-black uppercase tracking-widest text-amber-300">
                Confira o horário oficial de aplicação
              </div>
            )}
          </div>
        </div>
      );
    }

    // 2. CARD DE AULA PRESENCIAL OU EVENTO AO VIVO NO PORTAL
    const subject = getSubject(event.subjectId);
    const teacherName = getTeacherName(event.teacherId);
    const eventModules = getEventModules(event);
    const isLive = Boolean(event.isLiveEvent);
    const isCompleted = event.status === 'COMPLETED';
    const accentColor = isLive ? '#0ea5e9' : subject?.color || '#dc2626';
    const shiftLabel = event.shift ? SHIFT_LABELS[event.shift] || event.shift : '';
    const slotMinutes = calculateSlotDurationMinutes(event.startTime, event.endTime);

    // Busca evento de transmissão ao vivo correspondente na mesma data (se houver sala cadastrada)
    const matchedLiveTransmission = isLive
      ? liveEvents.find(le => le.eventDate === event.date && le.status !== 'ended') ||
        liveEvents.find(le => le.eventDate === event.date)
      : undefined;

    return (
      <div
        key={event.id}
        className={`group relative flex flex-col bg-zinc-900 border rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl ${
          isCompleted
            ? 'border-emerald-800/50 opacity-75'
            : isLive
              ? 'border-sky-500/35 hover:border-sky-400/60'
              : 'border-zinc-800 hover:border-zinc-700'
        }`}
      >
        {/* Faixa lateral colorida */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1.5 z-10"
          style={{ backgroundColor: isCompleted ? '#10b981' : accentColor }}
        />

        {/* Topo do Card */}
        <div className="p-5 pb-2 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {isLive ? (
              <span className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded border border-sky-500/45 bg-sky-500/15 text-sky-300 flex items-center gap-1.5">
                <Radio size={11} className="text-sky-400 animate-pulse" />
                AO VIVO • PORTAL
              </span>
            ) : (
              <span
                className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded border flex items-center gap-1.5"
                style={{
                  color: accentColor,
                  borderColor: `${accentColor}45`,
                  backgroundColor: `${accentColor}18`
                }}
              >
                <MapPin size={11} />
                AULA PRESENCIAL
              </span>
            )}

            <span className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider tabular-nums">
              • {indexInDay + 1}º TEMPO{shiftLabel ? ` (${shiftLabel})` : ''}
            </span>

            {event.isSubstitute && (
              <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-yellow-500 text-black">
                SUBST.
              </span>
            )}
            {event.isOverflow && (
              <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1">
                <AlertTriangle size={10} /> EXTRA
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-zinc-300 shrink-0 tabular-nums">
            <Clock size={12} className="text-zinc-500" />
            <span className="text-xs font-mono font-bold">
              {event.startTime} - {event.endTime}
            </span>
          </div>
        </div>

        {/* Corpo do Card */}
        <div className="px-5 py-2 flex-1 flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider truncate">
              ENCONTRO #{event.meetingNumber}
              {slotMinutes > 0 ? ` • ${slotMinutes} MIN` : ''}
            </span>
            {isCompleted && (
              <span className="text-[9px] font-black uppercase text-emerald-400 flex items-center gap-1">
                <CheckCircle2 size={11} /> Ministrada
              </span>
            )}
          </div>

          <h3 className="text-sm font-black uppercase text-white leading-snug break-words">
            {subject?.name || 'Disciplina Programada'}
          </h3>

          <div className="flex items-center gap-1.5 text-xs text-zinc-400 mt-1.5">
            <User size={13} className="text-zinc-500 shrink-0" />
            <span className="font-semibold truncate">{teacherName}</span>
          </div>

          {/* Lista de Tópicos / Módulos Trabalhados na Aula */}
          {eventModules.length > 0 && (
            <div className="mt-3 p-3 rounded-xl bg-black/35 border border-zinc-800/90 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500 flex items-center gap-1">
                  <Layers size={11} />
                  {eventModules.length === 1
                    ? 'TÓPICO / MÓDULO DA AULA'
                    : `MÓDULOS DESTA AULA (${eventModules.length})`}
                </span>
              </div>
              <div className="space-y-1.5">
                {eventModules.map((mod, mIdx) => (
                  <div key={`${event.id}-${mod.moduleId}`} className="text-xs text-zinc-200 leading-snug">
                    {eventModules.length > 1 && (
                      <span className="text-amber-400 font-black tabular-nums mr-1.5">
                        {mIdx + 1}.
                      </span>
                    )}
                    <span className="font-semibold break-words">{mod.moduleName}</span>
                    {mod.topicName && mod.topicName !== mod.moduleName && (
                      <span className="block text-[10px] text-zinc-500 uppercase mt-0.5">
                        Assunto: {mod.topicName}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Rodapé de Ação */}
        <div className="p-5 pt-3 mt-auto flex flex-col gap-2">
          {isLive && matchedLiveTransmission ? (
            <button
              type="button"
              onClick={() => navigate(`/app/eventos-ao-vivo/sala/${matchedLiveTransmission.id}`)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-sky-900/30 transition-all active:scale-95"
            >
              <Play size={14} fill="currentColor" />
              <span>ACESSAR TRANSMISSÃO AO VIVO</span>
            </button>
          ) : isLive && liveEvents.length > 0 && canOpenLiveTab && onSwitchTab ? (
            <button
              type="button"
              onClick={() => onSwitchTab('LIVE')}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-sky-900/30 transition-all active:scale-95"
            >
              <Radio size={14} />
              <span>VER SALAS DE EVENTOS AO VIVO</span>
            </button>
          ) : null}

          {canOpenPlanning && onSwitchTab && (
            <button
              type="button"
              onClick={() => {
                const params: Record<string, string> = {};
                if (event.subjectId) params.subjectId = event.subjectId;
                if (event.topicId && event.topicId !== 'extra') params.topicId = event.topicId;
                if (event.moduleId && event.moduleId !== 'extra' && !event.moduleId.startsWith('topic-')) {
                  params.moduleId = event.moduleId;
                }
                onSwitchTab('PLANNING', params);
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-200 text-[11px] font-black uppercase tracking-wider transition-colors"
            >
              <BookOpen size={13} />
              <span>VER NO PLANEJAMENTO PEDAGÓGICO</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 py-6">
        {[1, 2, 3].map(item => (
          <div
            key={item}
            className="h-64 rounded-2xl bg-zinc-900/70 border border-zinc-800 animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* BARRA DE NAVEGAÇÃO DE DATA (ONTEM | HOJE | AMANHÃ + ATALHO CRONOGRAMA) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-red-600/15 border border-red-500/30 flex items-center justify-center text-red-500 shrink-0">
            <Target size={20} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">
                PAINEL DE EXECUÇÃO DIÁRIA
              </span>
              {selectedDate === todayString ? (
                <span className="px-2 py-0.5 rounded bg-red-600 text-white text-[9px] font-black uppercase tracking-widest">
                  HOJE
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 text-[9px] font-black uppercase tracking-widest tabular-nums">
                  {formatSafeDateLocal(selectedDate)}
                </span>
              )}
            </div>
            <h2 className="text-base sm:text-lg font-black uppercase text-white tracking-tight truncate mt-0.5">
              {formattedSelectedDateLong}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setSelectedDate(prev => shiftISODateByDays(prev, -1))}
              className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              title="Dia Anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate(todayString)}
              className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-colors ${
                selectedDate === todayString
                  ? 'bg-red-600 text-white'
                  : 'text-zinc-300 hover:text-white hover:bg-zinc-800'
              }`}
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate(prev => shiftISODateByDays(prev, 1))}
              className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              title="Próximo Dia"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {canOpenSchedule && onSwitchTab && (
            <button
              type="button"
              onClick={() => onSwitchTab('SCHEDULE')}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white text-xs font-bold uppercase tracking-wider transition-colors"
            >
              <Calendar size={14} className="text-red-500" />
              <span>Cronograma Completo</span>
            </button>
          )}
        </div>
      </div>

      {/* BANNER DE CONQUISTA / PROGRESSO DO DIA (INSPIRADO NOS PLANOS) */}
      {dayStats.allMetasCompleted ? (
        <div className="rounded-2xl border border-amber-500/35 bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-400/35 flex items-center justify-center text-amber-400 shrink-0">
              <Trophy size={26} />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black uppercase text-white tracking-tight">
                PARABÉNS! VOCÊ CONCLUIU SUAS METAS DESTE DIA.
              </h3>
              <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
                Todas as {dayStats.totalMetas}{' '}
                {dayStats.totalMetas === 1 ? 'meta guiada foi concluída' : 'metas guiadas foram concluídas'}{' '}
                com sucesso. Continue mantendo a constância!
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setSelectedDate(prev => shiftISODateByDays(prev, 1))}
            className="px-5 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-black uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2 shrink-0 shadow-lg shadow-amber-500/20"
          >
            <span>VER PRÓXIMO DIA</span>
            <ChevronRight size={15} />
          </button>
        </div>
      ) : (
        (dayStats.totalTasks > 0 || overdueGuidedMetas.length > 0) && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="flex flex-wrap items-center gap-3">
              {dayStats.totalEvents > 0 && (
                <div className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center gap-2">
                  <Calendar size={14} className="text-red-500" />
                  <span className="text-xs font-bold text-zinc-200 tabular-nums">
                    <strong>{dayStats.totalEvents}</strong>{' '}
                    {dayStats.totalEvents === 1 ? 'Aula / Evento no Dia' : 'Aulas / Eventos no Dia'}
                  </span>
                </div>
              )}

              {dayStats.totalMetas > 0 && (
                <div className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center gap-2">
                  <Target size={14} className="text-amber-400" />
                  <span className="text-xs font-bold text-zinc-200 tabular-nums">
                    Metas Guiadas: <strong>{dayStats.completedMetas}</strong>/{dayStats.totalMetas} concluídas
                  </span>
                </div>
              )}

              {dayStats.totalMinutes > 0 && (
                <div className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center gap-2">
                  <Clock size={14} className="text-sky-400" />
                  <span className="text-xs font-bold text-zinc-200 tabular-nums">
                    Carga Estimada: <strong>{formatSimuladoDurationLabel(dayStats.totalMinutes)}</strong>
                  </span>
                </div>
              )}

              {overdueGuidedMetas.length > 0 && (
                <div className="px-3 py-2 rounded-xl bg-red-950/40 border border-red-500/30 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-xs font-bold text-red-300 tabular-nums">
                    <strong>{overdueGuidedMetas.length}</strong>{' '}
                    {overdueGuidedMetas.length === 1 ? 'Meta em Atraso' : 'Metas em Atraso'}
                  </span>
                </div>
              )}
            </div>

            {dayStats.totalMetas > 0 && (
              <div className="w-full lg:w-64 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-zinc-400 uppercase tracking-wider">Progresso das Metas</span>
                  <span className="text-emerald-400 font-mono">{dayStats.progressPercent}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
                    style={{ width: `${dayStats.progressPercent}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )
      )}

      {/* SEÇÃO 1: METAS DE CONTEÚDO EM ATRASO (EXATAMENTE COMO NOS PLANOS) */}
      {overdueGuidedMetas.length > 0 && (
        <section className="rounded-3xl border border-red-900/35 bg-gradient-to-b from-red-950/10 to-transparent p-5 sm:p-6 space-y-5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-xs font-black text-red-400 uppercase tracking-[0.2em] flex items-center gap-2">
              <Clock size={15} className="text-red-500" />
              <span>METAS DE CONTEÚDO EM ATRASO ({overdueGuidedMetas.length})</span>
            </h3>
            <span className="text-[11px] text-zinc-400 font-medium">
              Conclua para colocar seu Estudo Guiado em dia
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {overdueGuidedMetas.map(meta => renderGuidedMetaCard(meta, true))}
          </div>
        </section>
      )}

      {/* SEÇÃO 2: AULAS PRESENCIAIS, EVENTOS AO VIVO E SIMULADOS DO DIA */}
      {dayScheduleEvents.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-black text-zinc-300 uppercase tracking-[0.2em] flex items-center gap-2">
              <Calendar size={15} className="text-red-500" />
              <span>
                AULAS, EVENTOS AO VIVO E SIMULADOS{' '}
                {selectedDate === todayString ? 'DE HOJE' : `(${formatSafeDateLocal(selectedDate)})`}
              </span>
            </h3>
            <span className="text-xs font-bold text-zinc-500 tabular-nums">
              {dayScheduleEvents.length}{' '}
              {dayScheduleEvents.length === 1 ? 'compromisso agendado' : 'compromissos agendados'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {dayScheduleEvents.map((ev, idx) => renderScheduleEventCard(ev, idx))}
          </div>
        </section>
      )}

      {/* SEÇÃO 3: METAS DO ESTUDO GUIADO DO DIA */}
      {dayGuidedMetas.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-black text-amber-400 uppercase tracking-[0.2em] flex items-center gap-2">
              <Target size={15} className="text-amber-400" />
              <span>
                METAS DO ESTUDO GUIADO{' '}
                {selectedDate === todayString ? 'DE HOJE' : `(${formatSafeDateLocal(selectedDate)})`}
              </span>
            </h3>
            <span className="text-xs font-bold text-zinc-400 tabular-nums">
              {dayStats.completedMetas}/{dayStats.totalMetas} concluídas
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {dayGuidedMetas.map(meta => renderGuidedMetaCard(meta, false))}
          </div>
        </section>
      )}

      {/* ESTADO VAZIO DO DIA (QUANDO NÃO HÁ AULAS NEM METAS NA DATA SELECIONADA) */}
      {dayScheduleEvents.length === 0 && dayGuidedMetas.length === 0 && (
        <div className="py-16 px-6 flex flex-col items-center justify-center text-center border-2 border-dashed border-zinc-800 rounded-3xl bg-zinc-900/20">
          <div className="mb-4 p-4 rounded-full bg-zinc-900 border border-zinc-800">
            <Coffee size={32} className="text-zinc-500" />
          </div>
          <h3 className="text-lg font-black uppercase text-zinc-300 tracking-tight">
            {isHoliday
              ? 'Feriado / Dia sem Expediente Letivo'
              : selectedDate === todayString
                ? 'Nenhuma aula ou meta agendada para hoje!'
                : 'Nenhuma atividade programada para esta data'}
          </h3>
          <p className="text-xs font-medium text-zinc-500 max-w-md mt-1.5 leading-relaxed">
            {overdueGuidedMetas.length > 0
              ? 'Aproveite o dia livre na grade para colocar em dia as suas metas pendentes acima.'
              : 'Você pode navegar pelos próximos dias acima ou consultar a visão completa no Cronograma da turma.'}
          </p>
          {canOpenSchedule && onSwitchTab && (
            <button
              type="button"
              onClick={() => onSwitchTab('SCHEDULE')}
              className="mt-5 px-5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs font-black uppercase tracking-wider text-white transition-colors flex items-center gap-2"
            >
              <Calendar size={14} className="text-red-500" />
              <span>Abrir Cronograma da Turma</span>
            </button>
          )}
        </div>
      )}

      {/* MODAL DE EXECUÇÃO DA META DO ESTUDO GUIADO (.JSON TELA CHEIA, PDF, VIDEOAULA, FLASHCARDS) */}
      {selectedMetaForModal && currentUser && (
        <StudentGuidedStudyModal
          isOpen={!!selectedMetaForModal}
          onClose={() => setSelectedMetaForModal(null)}
          meta={selectedMetaForModal}
          classId={classId}
          userId={currentUser.uid}
          progress={selectedMetaForModal.id ? studentProgress[selectedMetaForModal.id] : undefined}
          onProgressUpdated={reloadGuidedProgress}
        />
      )}

      {/* MODAL DE CONFIRMAÇÃO DE CONCLUSÃO MANUAL (PADRÃO PLANOS) */}
      {confirmCompleteMeta &&
        createPortal(
          <div
            className="fixed inset-0 z-[130] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => setConfirmCompleteMeta(null)}
          >
            <div
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in-95 duration-150"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 size={24} />
                </div>

                <h3 className="text-lg font-black text-white uppercase tracking-tight">
                  CONCLUIR META?
                </h3>

                <p className="text-zinc-400 text-xs leading-relaxed">
                  Deseja marcar <strong className="text-zinc-200">{confirmCompleteMeta.title}</strong> como concluída? O progresso será sincronizado automaticamente com o seu Cronograma.
                </p>

                <div className="flex gap-3 w-full mt-2">
                  <button
                    type="button"
                    onClick={() => setConfirmCompleteMeta(null)}
                    className="flex-1 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-bold transition-colors border border-zinc-700 text-xs uppercase tracking-wider"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={togglingMetaId === confirmCompleteMeta.id}
                    onClick={() => handleDirectToggleComplete(confirmCompleteMeta, true)}
                    className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black transition-colors shadow-lg shadow-emerald-900/30 text-xs uppercase tracking-wider"
                  >
                    Sim, Concluir
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
