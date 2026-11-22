import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { classScheduleService } from '../../../services/classScheduleService';
import { curriculumService } from '../../../services/curriculumService';
import { teacherService } from '../../../services/teacherService';
import { holidayService } from '../../../services/holidayService';
import { classService } from '../../../services/classService';
import { liveEventService } from '../../../services/liveEventService';
import { ClassScheduleEvent } from '../../../types/schedule';
import { Subject, Topic } from '../../../types/curriculum';
import { Teacher } from '../../../types/teacher';
import { Class } from '../../../types/class';
import { LiveEvent } from '../../../types/liveEvent';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  User, 
  BookOpen, 
  AlertTriangle, 
  ChevronLeft, 
  ChevronRight, 
  LayoutGrid, 
  List,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  Target,
  Radio,
  MapPin,
  Trophy,
  DoorOpen,
  Lock,
  Play,
  Flag,
  ArrowUpRight,
  FileJson,
  FileText,
  Video,
  HelpCircle,
  Scale,
  Zap,
  Maximize2,
  ExternalLink,
  Sparkles
} from 'lucide-react';
import {
  GuidedStudyMeta,
  GuidedStudyProgress,
  getGuidedMetaVideos,
  compareGuidedMetasWithinDay,
  computeClassEncounterMap
} from '../../../types/guidedStudy';
import { guidedStudyService } from '../../../services/guidedStudyService';
import { StudentGuidedStudyModal } from './StudentGuidedStudyModal';
import { useAuth } from '../../../contexts/AuthContext';
import { toLocalISODate, formatSafeDateLocal } from '../../../utils/dateUtils';

interface StudentClassScheduleProps {
  classId: string;
  masterClassId?: string;
  linkedSimulatedId?: string;
  onProgressUpdated?: () => void;
  onSwitchTab?: (tabId: string, queryParams?: Record<string, string>) => void;
  canOpenPlanning?: boolean;
  canOpenSimuladosTabOverride?: boolean;
}

const formatSimuladoDurationLabel = (minutes?: number): string => {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  if (total === 0) return '';
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0 && m > 0) return `${h}h ${String(m).padStart(2, '0')}min`;
  if (h > 0) return `${h}h`;
  return `${m} min`;
};

export const StudentClassSchedule: React.FC<StudentClassScheduleProps> = ({
  classId,
  masterClassId,
  linkedSimulatedId,
  onProgressUpdated,
  onSwitchTab,
  canOpenPlanning = true,
  canOpenSimuladosTabOverride
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [events, setEvents] = useState<ClassScheduleEvent[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [classData, setClassData] = useState<Class | null>(null);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // View State
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'weekend'>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const todayString = toLocalISODate();

  const { currentUser } = useAuth();
  const [guidedMetas, setGuidedMetas] = useState<GuidedStudyMeta[]>([]);
  const [studentProgress, setStudentProgress] = useState<Record<string, GuidedStudyProgress>>({});
  const [expandedMetaId, setExpandedMetaId] = useState<string | null>(null);
  const [selectedMetaForModal, setSelectedMetaForModal] = useState<GuidedStudyMeta | null>(null);

  const encounterMap = useMemo(
    () =>
      computeClassEncounterMap(
        events,
        classData?.isGuidedStudyEnabled ? guidedMetas : [],
        {
          defaultShift: classData?.shift,
          totalMeetings: classData?.totalMeetings,
          todayIso: todayString,
          includeGuidedStudy: Boolean(classData?.isGuidedStudyEnabled)
        }
      ),
    [events, guidedMetas, classData?.isGuidedStudyEnabled, classData?.shift, classData?.totalMeetings, todayString]
  );

  const navigateToPresentialTab = (tabId: string, params?: Record<string, string>) => {
    if (onSwitchTab) {
      onSwitchTab(tabId, params);
      return;
    }
    const newParams = new URLSearchParams(searchParams);
    newParams.set('tab', tabId);
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v) newParams.set(k, v);
      });
    }
    setSearchParams(newParams);
  };

  const reloadGuidedProgress = async () => {
    if (currentUser?.uid) {
      const prog = await guidedStudyService.getStudentProgress(currentUser.uid, classId);
      setStudentProgress(prog);
    }
    onProgressUpdated?.();
    window.dispatchEvent(
      new CustomEvent('insanus:presential-progress-updated', { detail: { classId } })
    );
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const [initialEvents, initialSubjects, initialTopics, teachersData, holidaysData, fetchedClassData, initialMetas] = await Promise.all([
          classScheduleService.getScheduleEventsByClass(classId),
          curriculumService.getSubjectsByClass(classId),
          curriculumService.getTopicsByClass(classId),
          teacherService.getTeachers(),
          holidayService.getHolidays(),
          classService.getClassById(classId).catch(() => null),
          guidedStudyService.getMetasByClass(classId)
        ]);

        let eventsData = initialEvents;
        let subjectsData = initialSubjects;
        let topicsData = initialTopics;
        let metasData = initialMetas;

        const effectiveMasterId = masterClassId || fetchedClassData?.masterClassId;
        if (effectiveMasterId) {
          const [masterEvents, masterSubjects, masterTopics, masterMetas] = await Promise.all([
            eventsData.length === 0 ? classScheduleService.getScheduleEventsByClass(effectiveMasterId) : Promise.resolve([]),
            subjectsData.length === 0 ? curriculumService.getSubjectsByClass(effectiveMasterId) : Promise.resolve([]),
            topicsData.length === 0 ? curriculumService.getTopicsByClass(effectiveMasterId) : Promise.resolve([]),
            metasData.length === 0 ? guidedStudyService.getMetasByClass(effectiveMasterId) : Promise.resolve([])
          ]);

          if (eventsData.length === 0 && masterEvents.length > 0) eventsData = masterEvents;
          if (subjectsData.length === 0 && masterSubjects.length > 0) subjectsData = masterSubjects;
          if (topicsData.length === 0 && masterTopics.length > 0) topicsData = masterTopics;
          if (metasData.length === 0 && masterMetas.length > 0) metasData = masterMetas;
        }

        setEvents(eventsData);
        setSubjects(subjectsData);
        setTopics(topicsData);
        setTeachers(teachersData);
        setHolidays(holidaysData);
        setClassData(fetchedClassData);
        setGuidedMetas(metasData);

        // Carrega salas de Eventos Ao Vivo da turma + salas explicitamente vinculadas no cronograma
        try {
          const [classLives, masterLives] = await Promise.all([
            liveEventService.getLiveEventsByPresentialClass(classId).catch(() => []),
            effectiveMasterId
              ? liveEventService.getLiveEventsByPresentialClass(effectiveMasterId).catch(() => [])
              : Promise.resolve([]),
          ]);

          const liveMap = new Map<string, LiveEvent>();
          [...classLives, ...masterLives].forEach(le => {
            if (le?.id) liveMap.set(le.id, le);
          });

          const missingLinkedIds = Array.from(
            new Set(
              eventsData
                .filter(ev => ev.isLiveEvent && ev.liveEventId && !liveMap.has(ev.liveEventId))
                .map(ev => ev.liveEventId as string)
            )
          );

          if (missingLinkedIds.length > 0) {
            const fetchedLinked = await Promise.all(
              missingLinkedIds.map(id => liveEventService.getLiveEventById(id).catch(() => null))
            );
            fetchedLinked.forEach(le => {
              if (le?.id) liveMap.set(le.id, le);
            });
          }

          setLiveEvents(Array.from(liveMap.values()));
        } catch (liveErr) {
          console.error('Erro ao carregar salas de eventos ao vivo do cronograma:', liveErr);
        }

        if (currentUser?.uid) {
          const prog = await guidedStudyService.getStudentProgress(currentUser.uid, classId);
          setStudentProgress(prog);
        }

        // Se for turma de final de semana, o padrão é a visualização de finais de semana
        if (fetchedClassData?.isWeekendOnly) {
          setViewMode('weekend');
        }
      } catch (error) {
        console.error("Error loading schedule data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [classId, masterClassId, currentUser?.uid]);

  const getWeekendsOfMonth = (year: number, month: number) => {
    const weekendsList: { number: number; saturday: string; sunday: string }[] = [];
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    let weekendCount = 1;
    for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
      if (d.getDay() === 6) { // Saturday
        const satStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const sun = new Date(d);
        sun.setDate(sun.getDate() + 1);
        const sunStr = `${sun.getFullYear()}-${String(sun.getMonth() + 1).padStart(2, '0')}-${String(sun.getDate()).padStart(2, '0')}`;
        
        weekendsList.push({
          number: weekendCount++,
          saturday: satStr,
          sunday: sunStr
        });
      }
    }
    return weekendsList;
  };

  const weekends = useMemo(() => {
    return getWeekendsOfMonth(currentDate.getFullYear(), currentDate.getMonth());
  }, [currentDate]);

  const [selectedWeekendIndex, setSelectedWeekendIndex] = useState(0);

  useEffect(() => {
    if (weekends.length > 0) {
      const todayStr = toLocalISODate();
      const index = weekends.findIndex(wk => wk.saturday === todayStr || wk.sunday === todayStr);
      if (index !== -1) {
        setSelectedWeekendIndex(index);
      } else {
        const futureIndex = weekends.findIndex(wk => wk.saturday >= todayStr);
        if (futureIndex !== -1) {
          setSelectedWeekendIndex(futureIndex);
        } else {
          setSelectedWeekendIndex(0);
        }
      }
    }
  }, [weekends]);

  // Helpers
  const getSubject = (id: string) => subjects.find(s => s.id === id);
  const getTopicName = (id: string) => topics.find(t => t.id === id)?.name || 'Assunto não encontrado';
  const getTeacherName = (id: string) => teachers.find(t => t.id === id)?.name || 'Professor não atribuído';
  const getModuleName = (topicId: string, moduleId: string) => {
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return 'Tópico desconhecido';
    const module = topic.modules?.find(m => m.id === moduleId);
    if (module) return module.name;
    if (moduleId.startsWith('topic-')) return topic.name;
    return 'Módulo desconhecido';
  };

  const resolveLiveRoomForEvent = (
    event: ClassScheduleEvent
  ): { id: string; title: string; status?: LiveEvent['status'] } | null => {
    if (!event.isLiveEvent) return null;

    if (event.liveEventId) {
      const matched = liveEvents.find(le => le.id === event.liveEventId);
      return {
        id: event.liveEventId,
        title: matched?.title || event.liveEventTitle || 'Sala de Transmissão Ao Vivo',
        status: matched?.status,
      };
    }

    const fallbackByDate =
      liveEvents.find(le => le.eventDate === event.date && le.status !== 'ended') ||
      liveEvents.find(le => le.eventDate === event.date);

    if (fallbackByDate?.id) {
      return {
        id: fallbackByDate.id,
        title: fallbackByDate.title,
        status: fallbackByDate.status,
      };
    }

    return null;
  };

  const openLiveTransmissionRoom = (liveRoomId: string) => {
    navigate(`/app/eventos-ao-vivo/sala/${liveRoomId}`, {
      state: { returnPath: `${location.pathname}${location.search}` },
    });
  };

  const getEventModules = (event: ClassScheduleEvent) => {
    if (event.allocationMode === 'FREE_REVIEW' || event.topicId === 'free_review') {
      return [];
    }

    const rawLinks =
      event.linkedModules && event.linkedModules.length > 0
        ? event.linkedModules
        : event.topicId && event.moduleId && event.moduleId !== 'extra' && event.moduleId !== 'free_review'
          ? [{ topicId: event.topicId, moduleId: event.moduleId, moduleIndex: event.moduleIndex }]
          : [];

    const indicesByModule = new Map<string, string[]>();
    rawLinks.forEach(link => {
      if (!link.moduleId) return;
      if (!indicesByModule.has(link.moduleId)) {
        indicesByModule.set(link.moduleId, []);
      }
      if (link.moduleIndex && !indicesByModule.get(link.moduleId)!.includes(link.moduleIndex)) {
        indicesByModule.get(link.moduleId)!.push(link.moduleIndex);
      }
    });

    const seen = new Set<string>();
    const resolved: {
      topicId: string;
      moduleId: string;
      topicName: string;
      moduleName: string;
      partLabel?: string;
    }[] = [];

    rawLinks.forEach((link) => {
      if (!link.moduleId || seen.has(link.moduleId)) return;
      seen.add(link.moduleId);
      const topic = topics.find((t) => t.id === link.topicId);
      const mod = topic?.modules?.find((m) => m.id === link.moduleId);
      const moduleName =
        mod?.name ||
        (link.moduleId.startsWith('topic-') && topic?.name ? topic.name : 'Módulo desconhecido');

      const indices = indicesByModule.get(link.moduleId) || [];
      const numberedParts = indices.filter(
        idx =>
          idx &&
          idx !== 'Conjunto' &&
          idx !== '1/1' &&
          idx !== 'Extra' &&
          idx !== 'Revisão / Extra'
      );

      let partLabel: string | undefined;
      if (numberedParts.length === 1) {
        partLabel = `Parte ${numberedParts[0]}`;
      } else if (numberedParts.length > 1) {
        partLabel = `Partes ${numberedParts.join(', ')}`;
      } else if (indices.includes('Conjunto')) {
        partLabel = 'Conjunto';
      }

      resolved.push({
        topicId: link.topicId,
        moduleId: link.moduleId,
        topicName: topic?.name || 'Assunto',
        moduleName,
        partLabel,
      });
    });

    return resolved;
  };

  // Calendar Logic
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    return new Date(year, month, 1).getDay();
  };

  const getStartOfWeek = (date: Date) => {
    const day = date.getDay();
    const diff = date.getDate() - day;
    return new Date(date.getFullYear(), date.getMonth(), diff);
  };

  const handlePrev = () => {
    if (viewMode === 'month' || viewMode === 'weekend') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    } else {
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() - 7);
      setCurrentDate(newDate);
    }
  };

  const handleNext = () => {
    if (viewMode === 'month' || viewMode === 'weekend') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    } else {
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() + 7);
      setCurrentDate(newDate);
    }
  };

  const formatHeaderDate = (date: Date) => {
    if (viewMode === 'month' || viewMode === 'weekend') {
      return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    } else {
      const start = getStartOfWeek(date);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      const startStr = start.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
      const endStr = end.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
      return `${startStr} - ${endStr}`;
    }
  };

  const calendarCells = useMemo(() => {
    const cells = [];
    
    if (viewMode === 'month') {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const daysInMonth = getDaysInMonth(currentDate);
      const firstDay = getFirstDayOfMonth(currentDate);
      
      // Empty cells for previous month
      for (let i = 0; i < firstDay; i++) {
        cells.push({ type: 'empty', key: `empty-${i}` });
      }
      
      // Days of current month
      for (let day = 1; day <= daysInMonth; day++) {
        const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayEvents = events.filter(e => e.date === dateString)
          .sort((a, b) => a.startTime.localeCompare(b.startTime));
        const isHoliday = holidays.includes(dateString) && dayEvents.length === 0;
        
        cells.push({
          type: 'day',
          day,
          dateString,
          events: dayEvents,
          isHoliday,
          key: dateString
        });
      }
    } else {
      // Week View
      const startOfWeek = getStartOfWeek(currentDate);
      for (let i = 0; i < 7; i++) {
        const date = new Date(startOfWeek);
        date.setDate(date.getDate() + i);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayEvents = events.filter(e => e.date === dateString)
          .sort((a, b) => a.startTime.localeCompare(b.startTime));
        const isHoliday = holidays.includes(dateString) && dayEvents.length === 0;

        cells.push({
          type: 'day',
          day,
          dateString,
          events: dayEvents,
          isHoliday,
          key: dateString
        });
      }
    }

    return cells;
  }, [currentDate, events, holidays, viewMode]);

  const renderDayContent = (dateString: string) => {
    const dayEvents = events.filter(e => e.date === dateString)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    const isHoliday = holidays.includes(dateString) && dayEvents.length === 0;

    return (
      <div className="space-y-2">
        {/* Holiday Display */}
        {isHoliday && (
          <div className="h-full flex flex-col items-center justify-center py-4">
            <div className="w-full p-3 rounded-lg border border-dashed border-zinc-700 bg-zinc-900/30 text-zinc-500 flex flex-col items-center justify-center text-center gap-2">
              <CalendarIcon className="w-5 h-5 opacity-50" />
              <span className="text-xs font-medium">Feriado</span>
            </div>
          </div>
        )}

        {/* Events Display */}
        {!isHoliday && (() => {
          const eventsByShift = dayEvents.reduce((acc, event) => {
            const shift = event.shift || classData?.shift || 'MORNING';
            const shiftName = shift === 'MORNING' ? 'Manhã' : shift === 'AFTERNOON' ? 'Tarde' : 'Noite';
            if (!acc[shiftName]) acc[shiftName] = [];
            acc[shiftName].push(event);
            return acc;
          }, {} as Record<string, ClassScheduleEvent[]>);

          const activeShifts = ['Manhã', 'Tarde', 'Noite'].filter(s => eventsByShift[s]?.length > 0);
          const hasDayGuidedMetas =
            Boolean(classData?.isGuidedStudyEnabled) &&
            guidedMetas.some(m => m.date === dateString);

          if (activeShifts.length === 0) {
            if (hasDayGuidedMetas) return null;
            return (
              <div className="text-center py-4 text-xs text-zinc-600 border border-dashed border-zinc-800 rounded-lg">
                Nenhuma aula agendada
              </div>
            );
          }

          return activeShifts.map((shiftName, shiftIndex) => {
            const shiftEvents = eventsByShift[shiftName];
            const regularClassEvents = shiftEvents.filter(ev => ev.eventType !== 'SIMULADO');
            const firstRegularEvent = regularClassEvents[0];
            const shiftEnum =
              firstRegularEvent?.shift ||
              (shiftName === 'Manhã' ? 'MORNING' : shiftName === 'Tarde' ? 'AFTERNOON' : 'NIGHT');
            const shiftEncounter = firstRegularEvent
              ? encounterMap.byShiftKey.get(`${dateString}::${shiftEnum}`)
              : undefined;
            const isShiftCompleted =
              regularClassEvents.length > 0 &&
              regularClassEvents.every(ev => ev.status === 'COMPLETED');
            let regularClassCounter = 0;

            return (
              <div key={shiftName} className={shiftIndex > 0 ? "mt-4" : ""}>
                {/* Visual Divider between shifts */}
                {shiftIndex > 0 && (
                  <div className="relative my-4 flex items-center">
                    <div className="flex-grow border-t border-zinc-800"></div>
                    <span className="flex-shrink mx-2 text-[8px] font-extrabold text-zinc-500 uppercase tracking-wider">Novo Turno</span>
                    <div className="flex-grow border-t border-zinc-800"></div>
                  </div>
                )}

                {/* Shift Header */}
                <div className="flex justify-between items-center mb-2 gap-1.5">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{shiftName}</span>
                  {shiftEncounter && (
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide whitespace-nowrap ${
                        isShiftCompleted
                          ? 'bg-emerald-600 text-white border-emerald-500'
                          : shiftEncounter.isOverflow
                            ? 'bg-red-600 text-white border-red-500'
                            : 'text-brand-red bg-brand-red/10 border-brand-red/20'
                      }`}
                    >
                      {shiftEncounter.isOverflow
                        ? `Encontro #${shiftEncounter.encounterNumber} (EXTRA)`
                        : `Encontro #${shiftEncounter.encounterNumber}`}
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  {shiftEvents.map((event: ClassScheduleEvent) => {
                    const isExpanded = expandedEventId === event.id;

                    // === CARD PREMIUM BLACK GOLD PARA SIMULADOS (VISÃO DO ALUNO) ===
                    if (event.eventType === 'SIMULADO') {
                      const examStart = event.examStartTime || event.startTime;
                      const examEnd = event.examEndTime || event.endTime;
                      const gatesOpen = event.gatesOpenTime || examStart;
                      const gatesClose = event.gatesCloseTime || examStart;
                      const durationText = formatSimuladoDurationLabel(event.durationMinutes);
                      const isCompleted = event.status === 'COMPLETED';
                      const canOpenSimuladosTab =
                        canOpenSimuladosTabOverride ??
                        Boolean(
                          linkedSimulatedId || classData?.linkedSimulatedId || event.simulatedClassId
                        );

                      return (
                        <div
                          key={event.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedEventId(isExpanded ? null : event.id);
                          }}
                          className={`relative rounded-lg border transition-all cursor-pointer overflow-hidden bg-gradient-to-br from-[#17130a] via-[#09090b] to-[#211909] ${
                            isCompleted
                              ? 'border-emerald-500/50 opacity-85'
                              : isExpanded
                                ? 'border-amber-400/80 shadow-lg shadow-amber-500/10 z-20'
                                : 'border-amber-500/45 hover:border-amber-400/75'
                          }`}
                        >
                          {/* Specular Gold Top Highlight */}
                          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/80 to-transparent" />

                          <div className="p-2.5 space-y-1.5">
                            <div className="flex items-center justify-between gap-1.5">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <div className="w-5 h-5 rounded bg-gradient-to-b from-amber-400/25 to-amber-600/10 border border-amber-400/45 flex items-center justify-center shrink-0">
                                  <Trophy className="w-3 h-3 text-amber-300" />
                                </div>
                                <span className="text-[9px] font-extrabold uppercase tracking-widest text-amber-300 truncate">
                                  Simulado Oficial
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {isCompleted && (
                                  <span className="text-[9px] font-bold text-emerald-400 flex items-center gap-1 whitespace-nowrap">
                                    <CheckCircle className="w-2.5 h-2.5 shrink-0" />
                                    Aplicado
                                  </span>
                                )}
                                <div className="text-amber-300/70">
                                  {isExpanded ? (
                                    <ChevronUp className="w-3.5 h-3.5" />
                                  ) : (
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  )}
                                </div>
                              </div>
                            </div>

                            <div
                              className="font-bold text-xs text-amber-50 leading-snug break-words"
                              title={event.simulatedTitle || 'Simulado Oficial'}
                            >
                              {event.simulatedTitle || 'Simulado Oficial'}
                            </div>

                            <div className="space-y-0.5 pt-0.5 tabular-nums">
                              <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-300 flex-wrap">
                                <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                                <span className="whitespace-nowrap">
                                  Prova: {examStart} - {examEnd}
                                </span>
                                {durationText && (
                                  <span className="text-amber-200/75 font-semibold whitespace-nowrap">
                                    · {durationText}
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-amber-100/65">
                                Portões: {gatesOpen} às {gatesClose}
                              </div>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="px-2.5 pb-2.5 pt-1 space-y-2.5 animate-in fade-in duration-150">
                              <div className="h-px bg-amber-500/20 w-full" />

                              <div className="space-y-1.5 text-[11px] tabular-nums">
                                <div className="flex items-center justify-between gap-2 text-zinc-300">
                                  <span className="flex items-center gap-1.5 text-zinc-400">
                                    <DoorOpen className="w-3 h-3 text-amber-400/80 shrink-0" />
                                    Abertura dos Portões
                                  </span>
                                  <span className="font-semibold text-amber-100 whitespace-nowrap">
                                    {gatesOpen}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="flex items-center gap-1.5 text-amber-300 font-semibold">
                                    <Lock className="w-3 h-3 text-amber-400 shrink-0" />
                                    Fechamento dos Portões
                                  </span>
                                  <span className="font-bold text-amber-300 whitespace-nowrap">
                                    {gatesClose}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between gap-2 text-zinc-200">
                                  <span className="flex items-center gap-1.5 text-zinc-300">
                                    <Play className="w-3 h-3 text-amber-400 shrink-0" />
                                    Início da Prova
                                  </span>
                                  <span className="font-bold text-white whitespace-nowrap">
                                    {examStart}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between gap-2 text-zinc-200 pt-1 border-t border-amber-500/15">
                                  <span className="flex items-center gap-1.5 text-amber-200/90">
                                    <Flag className="w-3 h-3 text-amber-400 shrink-0" />
                                    Término Previsto
                                  </span>
                                  <span className="font-bold text-amber-300 whitespace-nowrap">
                                    {examEnd}
                                    {durationText ? ` (${durationText})` : ''}
                                  </span>
                                </div>
                              </div>

                              {(event.simulatedQuestionCount || event.simulatedExamType) && (
                                <div className="text-[10px] text-amber-200/70 tabular-nums pt-0.5">
                                  {event.simulatedQuestionCount
                                    ? `${event.simulatedQuestionCount} questões`
                                    : ''}
                                  {event.simulatedQuestionCount && event.simulatedExamType
                                    ? ' · '
                                    : ''}
                                  {event.simulatedExamType
                                    ? event.simulatedExamType === 'true_false'
                                      ? 'Certo ou Errado'
                                      : 'Múltipla Escolha'
                                    : ''}
                                </div>
                              )}

                              {canOpenSimuladosTab && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const params: Record<string, string> = {};
                                    if (event.simulatedExamId) {
                                      params.highlightExamId = event.simulatedExamId;
                                    }
                                    if (event.simulatedTitle) {
                                      params.highlightExamTitle = event.simulatedTitle;
                                    }
                                    navigateToPresentialTab('SIMULADOS', params);
                                  }}
                                  className="w-full min-w-0 max-w-full flex items-center justify-center gap-1 py-2 px-2 rounded-md bg-gradient-to-r from-amber-500/20 via-yellow-500/15 to-amber-500/20 hover:from-amber-500/30 hover:to-yellow-500/25 border border-amber-400/40 text-amber-200 text-[9.5px] font-bold uppercase tracking-wide leading-tight text-center whitespace-normal transition-all"
                                >
                                  <span className="break-words">Acessar Área de Simulados</span>
                                  <ArrowUpRight className="w-3 h-3 shrink-0" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    }

                    const currentTempoNumber = ++regularClassCounter;
                    const subject = getSubject(event.subjectId);
                    const borderColor = subject?.color || '#52525b';
                    const isOverflow = event.isOverflow;
                    const isLive = Boolean(event.isLiveEvent);
                    const resolvedLiveRoom = isLive ? resolveLiveRoomForEvent(event) : null;

                    const eventModules = getEventModules(event);
                    const hasMultipleModules = eventModules.length > 1;
                    const spansMultipleTopics = new Set(eventModules.map((m) => m.topicId)).size > 1;

                    return (
                      <React.Fragment key={event.id}>
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedEventId(isExpanded ? null : event.id);
                          }}
                          className={`
                            rounded-lg border-l-4 transition-all cursor-pointer overflow-hidden
                            ${isExpanded
                              ? 'bg-zinc-900 shadow-lg ring-1 ring-zinc-800 z-20 relative'
                              : isLive && event.status !== 'COMPLETED' && !isOverflow
                                ? 'bg-sky-950/20 hover:bg-sky-950/35 ring-1 ring-sky-500/30'
                                : 'bg-zinc-900/50 hover:bg-zinc-900'}
                            ${isOverflow ? 'border-red-500 bg-red-900/20' : ''}
                            ${event.status === 'COMPLETED' ? 'border-emerald-500 bg-emerald-900/10 opacity-80' : ''}
                          `}
                          style={{ borderLeftColor: event.status === 'COMPLETED' ? '#10b981' : borderColor }}
                        >
                          {/* Card Header */}
                          <div className="p-2">
                            <div className="flex justify-between items-center mb-1 flex-wrap gap-1">
                              <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider tabular-nums flex items-center gap-1 flex-wrap">
                                <span>{currentTempoNumber}º Tempo</span>
                                {eventModules[0]?.partLabel?.startsWith('Parte') && (
                                  <span className="text-indigo-300 font-extrabold">
                                    • {eventModules[0].partLabel}
                                  </span>
                                )}
                                {hasMultipleModules && (
                                  <span className="text-amber-400/90" title={`${eventModules.length} módulos previstos nesta aula`}>
                                    • {eventModules.length} Módulos
                                  </span>
                                )}
                              </div>
                              <div className="flex gap-1 flex-wrap justify-end">
                                {isLive && (
                                  <span
                                    className="text-[8px] font-bold text-sky-300 bg-sky-950/80 px-1.5 py-0.5 rounded border border-sky-500/40 uppercase tracking-wider flex items-center gap-1 whitespace-nowrap"
                                    title="Acompanhe ao vivo pelo Portal"
                                  >
                                    <Radio className="w-2.5 h-2.5 shrink-0 text-sky-400" />
                                    AO VIVO • PORTAL
                                  </span>
                                )}
                                {event.allocationMode === 'FREE_REVIEW' && (
                                  <span
                                    className="text-[8px] font-bold text-purple-200 bg-purple-950/80 px-1.5 py-0.5 rounded border border-purple-500/40 uppercase tracking-wider flex items-center gap-1 whitespace-nowrap"
                                    title="Aula de Revisão / Atividade Complementar"
                                  >
                                    <Sparkles className="w-2.5 h-2.5 shrink-0 text-purple-400" />
                                    REVISÃO
                                  </span>
                                )}
                                {event.status === 'COMPLETED' && (
                                  <span className="text-[8px] font-bold text-emerald-500 bg-emerald-950/50 px-1 py-0.5 rounded border border-emerald-900/50 uppercase tracking-wider flex items-center gap-1 whitespace-nowrap" title="Concluído">
                                    <CheckCircle className="w-2 h-2 shrink-0" />
                                    <span className="hidden lg:inline">CONCLUÍDO</span>
                                  </span>
                                )}
                                {event.isSubstitute && (
                                  <span className="text-[8px] font-bold text-black bg-yellow-500 px-1 py-0.5 rounded border border-yellow-600 uppercase tracking-wider flex items-center gap-1 whitespace-nowrap" title="Substituição">
                                    SUBST.
                                  </span>
                                )}
                                {isOverflow && (
                                  <span className="text-[8px] font-bold text-red-400 bg-red-950/50 px-1 py-0.5 rounded border border-red-900/50 uppercase tracking-wider flex items-center gap-1 whitespace-nowrap" title="Aula Extra">
                                    <AlertTriangle className="w-2 h-2 shrink-0" />
                                    <span className="hidden lg:inline">EXTRA</span>
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex justify-between items-start gap-1">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1 text-[10px] font-bold text-zinc-400 mb-0.5 flex-wrap tabular-nums">
                                  <Clock className="w-3 h-3 shrink-0" />
                                  <span className="whitespace-nowrap">{event.startTime} - {event.endTime}</span>
                                </div>
                                <div className="font-bold text-xs text-zinc-200 leading-snug break-words" title={subject?.name}>
                                  {subject?.name || 'Disciplina Desconhecida'}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {canOpenPlanning && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const params: Record<string, string> = {};
                                      if (event.subjectId) params.subjectId = event.subjectId;
                                      if (event.topicId && event.topicId !== 'extra' && event.topicId !== 'free_review') {
                                        params.topicId = event.topicId;
                                      }
                                      if (
                                        event.moduleId &&
                                        event.moduleId !== 'extra' &&
                                        event.moduleId !== 'free_review' &&
                                        !event.moduleId.startsWith('topic-')
                                      ) {
                                        params.moduleId = event.moduleId;
                                      }
                                      navigateToPresentialTab('PLANNING', params);
                                    }}
                                    className="p-1 text-zinc-500 hover:text-brand-red transition-colors"
                                    title="Ver materiais no Planejamento"
                                  >
                                    <BookOpen className="w-3 h-3" />
                                  </button>
                                )}
                                  <div className="text-zinc-500">
                                    {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                  </div>
                                </div>
                              </div>

                              {isLive && resolvedLiveRoom && !isExpanded && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openLiveTransmissionRoom(resolvedLiveRoom.id);
                                  }}
                                  className={`mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                                    resolvedLiveRoom.status === 'live'
                                      ? 'bg-red-600 hover:bg-red-500 text-white shadow-sm'
                                      : 'bg-sky-600/90 hover:bg-sky-500 text-white shadow-sm'
                                  }`}
                                  title={`Entrar na sala: ${resolvedLiveRoom.title}`}
                                >
                                  <Play className="w-2.5 h-2.5 shrink-0 fill-current" />
                                  <span className="truncate">
                                    {resolvedLiveRoom.status === 'live'
                                      ? 'Assistir Ao Vivo'
                                      : 'Acessar Sala Ao Vivo'}
                                  </span>
                                  <ArrowUpRight className="w-3 h-3 shrink-0" />
                                </button>
                              )}
                            </div>

                            {/* Card Details */}
                            {isExpanded && (
                              <div className="px-2 pb-2 pt-0 space-y-2 animate-in slide-in-from-top-1 duration-200">
                                <div className="h-px bg-zinc-800 w-full my-1" />

                                <div>
                                  <span className="text-[10px] text-zinc-500 uppercase font-bold block mb-0.5">Modalidade</span>
                                  {isLive ? (
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-300">
                                        <Radio className="w-3 h-3 text-sky-400 shrink-0" />
                                        <span>Transmissão Ao Vivo pelo Portal</span>
                                      </div>
                                      {resolvedLiveRoom && (
                                        <div
                                          className="text-[10px] text-sky-200/90 bg-sky-950/50 border border-sky-500/30 rounded px-2 py-1 truncate"
                                          title={resolvedLiveRoom.title}
                                        >
                                          Sala: <strong>{resolvedLiveRoom.title}</strong>
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1.5 text-[11px] text-zinc-300">
                                      <MapPin className="w-3 h-3 text-zinc-500 shrink-0" />
                                      <span>Aula Presencial</span>
                                    </div>
                                  )}
                                </div>
                              
                              {event.allocationMode === 'FREE_REVIEW' || event.topicId === 'free_review' ? (
                                <div>
                                  <span className="text-[10px] text-purple-400 uppercase font-bold block mb-0.5">
                                    Atividade / Revisão
                                  </span>
                                  <p className="text-[11px] text-zinc-200 font-medium leading-tight">
                                    {event.customActivityTitle || 'Aula Extra / Revisão'}
                                  </p>
                                </div>
                              ) : hasMultipleModules ? (
                                <div>
                                  <span className="text-[10px] text-zinc-500 uppercase font-bold block mb-1 tabular-nums">
                                    Módulos desta Aula ({eventModules.length})
                                  </span>
                                  <div className="space-y-1 rounded-md bg-zinc-950/70 border border-zinc-800 p-1.5">
                                    {eventModules.map((modItem, modIdx) => (
                                      <div
                                        key={`${event.id}-mod-${modItem.moduleId}`}
                                        className="flex items-start justify-between gap-1.5 py-1 border-b border-zinc-800/80 last:border-0"
                                      >
                                        <div className="min-w-0 flex-1">
                                          <div className="text-[11px] text-zinc-200 leading-snug break-words flex items-center gap-1 flex-wrap">
                                            <span className="text-amber-400/90 font-bold tabular-nums">
                                              {modIdx + 1}.
                                            </span>
                                            <span>{modItem.moduleName}</span>
                                            {modItem.partLabel && (
                                              <span
                                                className={`text-[8px] font-bold uppercase px-1 py-0.5 rounded border tabular-nums ${
                                                  modItem.partLabel === 'Conjunto'
                                                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                                    : 'bg-indigo-500/20 text-indigo-200 border-indigo-500/40'
                                                }`}
                                              >
                                                {modItem.partLabel}
                                              </span>
                                            )}
                                          </div>
                                          {spansMultipleTopics && (
                                            <p
                                              className="text-[9px] text-zinc-500 leading-tight mt-0.5 truncate"
                                              title={modItem.topicName}
                                            >
                                              Assunto: {modItem.topicName}
                                            </p>
                                          )}
                                        </div>
                                        {canOpenPlanning && (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              const params: Record<string, string> = {};
                                              if (event.subjectId) params.subjectId = event.subjectId;
                                              if (modItem.topicId) params.topicId = modItem.topicId;
                                              if (modItem.moduleId && !modItem.moduleId.startsWith('topic-')) {
                                                params.moduleId = modItem.moduleId;
                                              }
                                              navigateToPresentialTab('PLANNING', params);
                                            }}
                                            className="p-1 text-zinc-500 hover:text-brand-red transition-colors shrink-0"
                                            title={`Abrir "${modItem.moduleName}" no Planejamento`}
                                          >
                                            <BookOpen className="w-3 h-3" />
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <div>
                                  <span className="text-[10px] text-zinc-500 uppercase font-bold block mb-0.5">Módulo</span>
                                  <div className="text-[11px] text-zinc-300 leading-tight flex items-center gap-1.5 flex-wrap">
                                    <span>
                                      {eventModules[0]?.moduleName ||
                                        (isOverflow ? 'Aula complementar' : getModuleName(event.topicId, event.moduleId))}
                                    </span>
                                    {eventModules[0]?.partLabel && (
                                      <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-200 border border-indigo-500/40 tabular-nums">
                                        {eventModules[0].partLabel}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}

                              {!spansMultipleTopics &&
                                event.topicId &&
                                event.topicId !== 'extra' &&
                                event.topicId !== 'free_review' &&
                                event.allocationMode !== 'FREE_REVIEW' && (
                                  <div>
                                    <span className="text-[10px] text-zinc-500 uppercase font-bold block mb-0.5">Assunto</span>
                                    <div className="flex items-center gap-1.5 text-[11px] text-zinc-300">
                                      <BookOpen className="w-3 h-3 text-zinc-500 shrink-0" />
                                      <span>{getTopicName(event.topicId)}</span>
                                    </div>
                                  </div>
                                )}

                              <div>
                                <span className="text-[10px] text-zinc-500 uppercase font-bold block mb-0.5">Professor</span>
                                <div className="flex items-center gap-1.5 text-[11px] text-zinc-300">
                                  <User className="w-3 h-3 text-zinc-500 shrink-0" />
                                  <span>{getTeacherName(event.teacherId)}</span>
                                </div>
                              </div>

                              {isLive && resolvedLiveRoom && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openLiveTransmissionRoom(resolvedLiveRoom.id);
                                  }}
                                  className={`w-full flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider transition-all whitespace-nowrap shadow-sm ${
                                    resolvedLiveRoom.status === 'live'
                                      ? 'bg-red-600 hover:bg-red-500 text-white'
                                      : 'bg-sky-600 hover:bg-sky-500 text-white'
                                  }`}
                                >
                                  <Play className="w-3 h-3 shrink-0 fill-current" />
                                  <span className="truncate">
                                    {resolvedLiveRoom.status === 'live'
                                      ? 'Assistir Transmissão Ao Vivo'
                                      : 'Acessar Sala de Transmissão'}
                                  </span>
                                  <ArrowUpRight className="w-3 h-3 shrink-0" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Interval Divider */}
                        {currentTempoNumber === 1 && regularClassEvents.length > 1 && (
                          <div className="flex items-center gap-2 my-2 opacity-50">
                            <div className="h-px bg-zinc-800 border-t border-dashed border-zinc-700 flex-1"></div>
                            <span className="text-[9px] text-zinc-500 font-medium whitespace-nowrap">Intervalo (15 min)</span>
                            <div className="h-px bg-zinc-800 border-t border-dashed border-zinc-700 flex-1"></div>
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            );
          });
        })()}

        {/* Metas do Estudo Guiado no Cronograma do Aluno */}
        {classData?.isGuidedStudyEnabled && (() => {
          const dayMetas = guidedMetas
            .filter(m => m.date === dateString)
            .sort(compareGuidedMetasWithinDay);
          const completedCount = dayMetas.filter(m => m.id && studentProgress[m.id]?.completed).length;

          const getMetaTypeInfo = (type: GuidedStudyMeta['type']) => {
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

          const guidedEncounter = encounterMap.byGuidedDate.get(dateString);

          return (
            <div className="mt-4 pt-3 border-t border-amber-500/20 space-y-2">
              <div className="flex items-center justify-between gap-1.5 flex-wrap">
                <span className="text-[10px] font-extrabold text-amber-400 uppercase tracking-wider flex items-center gap-1 whitespace-nowrap">
                  <Target className="w-3 h-3 shrink-0" /> Estudo Guiado
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {guidedEncounter && (
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide whitespace-nowrap ${
                        guidedEncounter.isCompleted
                          ? 'bg-emerald-600 text-white border-emerald-500'
                          : guidedEncounter.isOverflow
                            ? 'bg-red-600 text-white border-red-500'
                            : 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                      }`}
                    >
                      {guidedEncounter.isOverflow
                        ? `Encontro #${guidedEncounter.encounterNumber} (EXTRA)`
                        : `Encontro #${guidedEncounter.encounterNumber}`}
                    </span>
                  )}
                  {dayMetas.length > 0 && (
                    <span className="text-[10px] font-semibold text-amber-400/90 tabular-nums whitespace-nowrap">
                      {completedCount}/{dayMetas.length} concluídas
                    </span>
                  )}
                </div>
              </div>

              {dayMetas.length === 0 ? (
                <div className="p-2 text-[10px] text-zinc-500 border border-dashed border-zinc-800/80 rounded-lg text-center">
                  Sem metas programadas para este dia
                </div>
              ) : (
                dayMetas.map(meta => {
                  const metaKey = meta.id || `${meta.date}_${meta.title}`;
                  const isMetaDone = !!(meta.id && studentProgress[meta.id]?.completed);
                  const isJsonMap = meta.type === 'interactive_map';
                  const isMetaExpanded = expandedMetaId === metaKey;
                  const cardColor = meta.color || (isJsonMap ? '#6366f1' : '#f59e0b');
                  const { label: typeLabel, Icon: TypeIcon } = getMetaTypeInfo(meta.type);
                  const summary = meta.interactiveMapSummary;

                  return (
                    <div
                      key={metaKey}
                      onClick={e => {
                        e.stopPropagation();
                        setExpandedMetaId(isMetaExpanded ? null : metaKey);
                      }}
                      className={`
                        p-2.5 rounded-xl border transition-all cursor-pointer shadow-md
                        ${
                          isMetaDone
                            ? 'bg-emerald-950/20 border-emerald-500/40'
                            : isMetaExpanded
                              ? 'bg-zinc-900 shadow-lg z-20 relative'
                              : 'bg-zinc-900/90 hover:bg-zinc-800/90'
                        }
                      `}
                      style={!isMetaDone ? { borderColor: isMetaExpanded ? cardColor : `${cardColor}50` } : undefined}
                    >
                      {/* Cabeçalho compacto do Card */}
                      <div className="flex items-center justify-between gap-1.5 mb-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div
                            className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
                            style={
                              isMetaDone
                                ? { backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }
                                : { backgroundColor: `${cardColor}22`, color: cardColor }
                            }
                          >
                            <TypeIcon className="w-3 h-3" />
                          </div>
                          <span
                            className="text-[9px] font-bold uppercase tracking-wider truncate"
                            style={{ color: isMetaDone ? '#34d399' : cardColor }}
                          >
                            {typeLabel}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {isMetaDone && (
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" title="Meta concluída" />
                          )}
                          <div className="text-zinc-400">
                            {isMetaExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Título legível */}
                      <div
                        className={`font-bold text-xs leading-snug break-words ${
                          isMetaDone ? 'text-emerald-200' : 'text-white'
                        } ${isMetaExpanded ? '' : 'line-clamp-2'}`}
                        title={meta.title}
                      >
                        {meta.title}
                      </div>

                      {/* Metadados base */}
                      <div className="mt-1 text-[10px] text-zinc-400 leading-tight break-words tabular-nums">
                        {meta.disciplineName ? `${meta.disciplineName} · ` : ''}
                        {meta.duration || 30} min
                        {isMetaDone ? ' · Concluída' : ''}
                      </div>

                      {/* Painel Expandido com Detalhes Completos e Arquivo Clicável */}
                      {isMetaExpanded && (
                        <div className="mt-2.5 pt-2.5 border-t border-zinc-800 space-y-2.5 animate-in fade-in duration-150">
                          {meta.disciplineName && (
                            <div>
                              <span className="text-[9px] font-bold text-zinc-500 uppercase block mb-0.5">
                                Disciplina
                              </span>
                              <span className="text-[11px] font-semibold text-zinc-200 break-words block">
                                {meta.disciplineName}
                              </span>
                            </div>
                          )}

                          {meta.description && (
                            <div>
                              <span className="text-[9px] font-bold text-amber-400/90 uppercase block mb-0.5">
                                Orientação de Estudo
                              </span>
                              <p className="text-[11px] text-zinc-300 leading-relaxed whitespace-pre-line bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-2">
                                {meta.description}
                              </p>
                            </div>
                          )}

                          {isJsonMap && summary && (
                            <div className="grid grid-cols-2 gap-1.5 text-[10px] tabular-nums">
                              <div className="px-2 py-1.5 rounded-lg bg-zinc-950/70 border border-zinc-800/80">
                                <span className="text-zinc-500 block text-[9px] uppercase font-semibold">Mapa Mental</span>
                                <strong className="text-zinc-200 font-bold">{summary.nodeCount} nós</strong>
                              </div>
                              <div className="px-2 py-1.5 rounded-lg bg-zinc-950/70 border border-zinc-800/80">
                                <span className="text-zinc-500 block text-[9px] uppercase font-semibold">Quadros</span>
                                <strong className="text-zinc-200 font-bold">{summary.matrixCount} quadros</strong>
                              </div>
                              <div className="px-2 py-1.5 rounded-lg bg-zinc-950/70 border border-zinc-800/80">
                                <span className="text-zinc-500 block text-[9px] uppercase font-semibold">Questões</span>
                                <strong className="text-zinc-200 font-bold">{summary.questionCount} questões</strong>
                              </div>
                              <div className="px-2 py-1.5 rounded-lg bg-zinc-950/70 border border-zinc-800/80">
                                <span className="text-zinc-500 block text-[9px] uppercase font-semibold">Flashcards</span>
                                <strong className="text-zinc-200 font-bold">{summary.flashcardCount} cards</strong>
                              </div>
                            </div>
                          )}

                          {meta.articles && (
                            <div className="text-[11px] text-purple-200 bg-purple-950/30 border border-purple-500/20 rounded-lg p-2">
                              <span className="text-[9px] font-bold uppercase text-purple-400 block mb-0.5">
                                Artigos Recomendados
                              </span>
                              {meta.articles}
                            </div>
                          )}

                          {meta.type === 'questoes' && meta.questionCount && meta.questionCount > 0 ? (
                            <div className="text-[11px] text-emerald-200 bg-emerald-950/30 border border-emerald-500/20 rounded-lg p-2 tabular-nums">
                              Meta programada: <strong>{meta.questionCount} questões</strong>
                            </div>
                          ) : null}

                          {/* Arquivo / Conteúdo Vinculado -> Clique abre o Modal Expandido */}
                          {isJsonMap ? (
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                setSelectedMetaForModal(meta);
                              }}
                              className="w-full p-2.5 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/40 text-left transition-all flex items-center justify-between gap-2 group"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <FileJson className="w-4 h-4 text-indigo-300 shrink-0" />
                                <div className="min-w-0">
                                  <span className="block text-[11px] font-bold text-indigo-100 truncate">
                                    {meta.interactiveMapFileName || 'Modelo Interativo (.JSON)'}
                                  </span>
                                  <span className="block text-[9px] text-indigo-300/90">
                                    Clique para abrir em tela ampla
                                  </span>
                                </div>
                              </div>
                              <Maximize2 className="w-3.5 h-3.5 text-indigo-300 group-hover:scale-110 transition-transform shrink-0" />
                            </button>
                          ) : meta.pdfUrl ? (
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                setSelectedMetaForModal(meta);
                              }}
                              className="w-full p-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-left transition-all flex items-center justify-between gap-2 group"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="w-4 h-4 text-amber-300 shrink-0" />
                                <div className="min-w-0">
                                  <span className="block text-[11px] font-bold text-amber-100 truncate">
                                    {meta.pdfName || 'Material em PDF'}
                                  </span>
                                  <span className="block text-[9px] text-amber-300/90">
                                    Clique para abrir o material
                                  </span>
                                </div>
                              </div>
                              <Maximize2 className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                            </button>
                          ) : meta.type === 'aula' && getGuidedMetaVideos(meta).length > 0 ? (() => {
                            const videosCount = getGuidedMetaVideos(meta).length;
                            return (
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation();
                                  setSelectedMetaForModal(meta);
                                }}
                                className="w-full p-2.5 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/40 text-left transition-all flex items-center justify-between gap-2 group"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <Video className="w-4 h-4 text-blue-300 shrink-0" />
                                  <div className="min-w-0">
                                    <span className="block text-[11px] font-bold text-blue-100 truncate">
                                      {videosCount > 1
                                        ? `Assistir Videoaulas (${videosCount} aulas)`
                                        : 'Assistir Videoaula'}
                                    </span>
                                    <span className="block text-[9px] text-blue-300/90">
                                      {videosCount > 1
                                        ? 'Abrir playlist das aulas'
                                        : 'Abrir player da aula'}
                                    </span>
                                  </div>
                                </div>
                                <Maximize2 className="w-3.5 h-3.5 text-blue-300 shrink-0" />
                              </button>
                            );
                          })() : meta.type === 'flashcards' ? (
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                setSelectedMetaForModal(meta);
                              }}
                              className="w-full p-2.5 rounded-xl bg-pink-500/15 hover:bg-pink-500/25 border border-pink-500/40 text-left transition-all flex items-center justify-between gap-2 group"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <Zap className="w-4 h-4 text-pink-300 shrink-0" />
                                <div className="min-w-0">
                                  <span className="block text-[11px] font-bold text-pink-100 truncate">
                                    Baralho ({meta.cards?.length || 0} cards)
                                  </span>
                                  <span className="block text-[9px] text-pink-300/90">
                                    Clique para praticar
                                  </span>
                                </div>
                              </div>
                              <Maximize2 className="w-3.5 h-3.5 text-pink-300 shrink-0" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                setSelectedMetaForModal(meta);
                              }}
                              className="w-full py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[11px] font-bold text-white transition-colors flex items-center justify-between gap-2"
                            >
                              <span>{isMetaDone ? 'Rever Meta / Detalhes' : 'Iniciar Estudo da Meta'}</span>
                              <ExternalLink className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          );
        })()}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-red-500"></div>
      </div>
    );
  }

  if (events.length === 0 && holidays.length === 0 && guidedMetas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-500 bg-gray-900/30 rounded-xl border border-gray-800">
        <CalendarIcon size={48} className="mb-4 opacity-50" />
        <p className="text-lg font-medium">Nenhuma aula agendada ainda.</p>
        <p className="text-sm">O cronograma será disponibilizado em breve.</p>
      </div>
    );
  }

  return (
    <div className="bg-black border border-zinc-800 rounded-xl overflow-hidden shadow-sm animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between p-4 border-b border-zinc-800 bg-black gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-white capitalize flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-brand-red" />
            {formatHeaderDate(currentDate)}
          </h2>
          <div className="flex items-center gap-1 bg-zinc-900 rounded-lg p-1 border border-zinc-800">
            <button
              onClick={() => {
                if (viewMode !== 'month') {
                  setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));
                  setViewMode('month');
                }
              }}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'month' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
              title="Visualização Mensal"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                if (viewMode !== 'week') {
                  const today = new Date();
                  if (currentDate.getMonth() === today.getMonth() && currentDate.getFullYear() === today.getFullYear()) {
                    setCurrentDate(today);
                  }
                  setViewMode('week');
                }
              }}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'week' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
              title="Visualização Semanal"
            >
              <List className="w-4 h-4" />
            </button>
            {classData?.isWeekendOnly && (
              <button
                onClick={() => setViewMode('weekend')}
                className={`p-1.5 rounded-md transition-all flex items-center gap-1.5 ${viewMode === 'weekend' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
                title="Apenas Finais de Semana"
              >
                <CalendarIcon className="w-3.5 h-3.5 text-brand-red" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Finais de Semana</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={handlePrev}
            className="p-2 hover:bg-zinc-900 rounded-lg text-zinc-400 hover:text-white transition-colors border border-transparent hover:border-zinc-800"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setCurrentDate(new Date())}
            className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-700 rounded-lg transition-colors"
          >
            Hoje
          </button>
          <button 
            onClick={handleNext}
            className="p-2 hover:bg-zinc-900 rounded-lg text-zinc-400 hover:text-white transition-colors border border-transparent hover:border-zinc-800"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Calendar Container with Horizontal Scroll for Tablets */}
      <div className="overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
        <div className={viewMode === 'weekend' ? "min-w-full" : "min-w-full md:min-w-[900px]"}>
          {/* Weekday Headers */}
          {viewMode !== 'weekend' && (
            <div className="hidden md:grid grid-cols-7 border-b border-zinc-800 bg-black">
              {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
                <div key={day} className="py-3 text-center text-xs font-bold text-zinc-500 uppercase tracking-wider">
                  {day}
                </div>
              ))}
            </div>
          )}

          {/* Calendar Grid / Weekend Grid */}
          {viewMode === 'weekend' ? (
            <div className="p-4 bg-zinc-950/20">
              {/* Weekend View Tabs for Mobile/Tablet (lg:hidden) */}
              <div className="flex lg:hidden overflow-x-auto gap-2 mb-4 pb-2 scrollbar-none">
                {weekends.map((wk, index) => {
                  const isSelected = selectedWeekendIndex === index;
                  const isCurrent = todayString === wk.saturday || todayString === wk.sunday;
                  return (
                    <button
                      key={`tab-wk-${wk.number}`}
                      onClick={() => setSelectedWeekendIndex(index)}
                      className={`px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider whitespace-nowrap border transition-all flex items-center gap-1.5 ${
                        isSelected 
                          ? 'bg-brand-red border-brand-red text-white shadow-md' 
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                      }`}
                    >
                      {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>}
                      FDS {wk.number}
                    </button>
                  );
                })}
              </div>

              {/* Grid Wrapper */}
              {/* On Large Screens (lg): show all weekends side-by-side without overflow */}
              <div className="hidden lg:grid gap-4" style={{ gridTemplateColumns: `repeat(${weekends.length}, minmax(0, 1fr))` }}>
                {weekends.map((wk) => {
                  const satDate = new Date(wk.saturday + 'T12:00:00');
                  const sunDate = new Date(wk.sunday + 'T12:00:00');
                  const isSatToday = todayString === wk.saturday;
                  const isSunToday = todayString === wk.sunday;

                  const formatCardDate = (date: Date) => {
                    return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'numeric' });
                  };

                  return (
                    <div key={`weekend-desktop-${wk.number}`} className="flex flex-col bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden p-3 space-y-4">
                      {/* Weekend Header */}
                      <div className="text-center py-2 bg-brand-red/10 border-b border-brand-red/20 rounded-lg">
                        <span className="text-xs font-extrabold text-brand-red uppercase tracking-wider">
                          FINAL DE SEMANA {wk.number}
                        </span>
                      </div>

                      {/* Saturday Card */}
                      <div className={`p-3 rounded-lg border ${isSatToday ? 'bg-brand-red/5 border-brand-red/30' : 'bg-zinc-900/40 border-zinc-800'}`}>
                        <div className="flex justify-between items-center mb-3">
                          <span className="text-xs font-bold text-white uppercase flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                            SÁBADO
                          </span>
                          <span className="text-xs font-semibold text-zinc-400">
                            {formatCardDate(satDate)}
                          </span>
                        </div>
                        {renderDayContent(wk.saturday)}
                      </div>

                      {/* Sunday Card */}
                      <div className={`p-3 rounded-lg border ${isSunToday ? 'bg-brand-red/5 border-brand-red/30' : 'bg-zinc-900/40 border-zinc-800'}`}>
                        <div className="flex justify-between items-center mb-3">
                          <span className="text-xs font-bold text-white uppercase flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                            DOMINGO
                          </span>
                          <span className="text-xs font-semibold text-zinc-400">
                            {formatCardDate(sunDate)}
                          </span>
                        </div>
                        {renderDayContent(wk.sunday)}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* On Mobile/Tablet: only show the selected weekend in a full-width container */}
              <div className="block lg:hidden">
                {weekends[selectedWeekendIndex] && (() => {
                  const wk = weekends[selectedWeekendIndex];
                  const satDate = new Date(wk.saturday + 'T12:00:00');
                  const sunDate = new Date(wk.sunday + 'T12:00:00');
                  const isSatToday = todayString === wk.saturday;
                  const isSunToday = todayString === wk.sunday;

                  const formatCardDate = (date: Date) => {
                    return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'numeric' });
                  };

                  return (
                    <div className="flex flex-col bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden p-4 space-y-4">
                      {/* Weekend Header */}
                      <div className="text-center py-2 bg-brand-red/10 border-b border-brand-red/20 rounded-lg">
                        <span className="text-xs font-extrabold text-brand-red uppercase tracking-wider">
                          FINAL DE SEMANA {wk.number}
                        </span>
                      </div>

                      {/* On tablets (md) show saturday/sunday side-by-side, on mobile stacked */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Saturday Card */}
                        <div className={`p-4 rounded-lg border ${isSatToday ? 'bg-brand-red/5 border-brand-red/30' : 'bg-zinc-900/40 border-zinc-800'}`}>
                          <div className="flex justify-between items-center mb-3">
                            <span className="text-xs font-bold text-white uppercase flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                              SÁBADO
                            </span>
                            <span className="text-xs font-semibold text-zinc-400">
                              {formatCardDate(satDate)}
                            </span>
                          </div>
                          {renderDayContent(wk.saturday)}
                        </div>

                        {/* Sunday Card */}
                        <div className={`p-4 rounded-lg border ${isSunToday ? 'bg-brand-red/5 border-brand-red/30' : 'bg-zinc-900/40 border-zinc-800'}`}>
                          <div className="flex justify-between items-center mb-3">
                            <span className="text-xs font-bold text-white uppercase flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                              DOMINGO
                            </span>
                            <span className="text-xs font-semibold text-zinc-400">
                              {formatCardDate(sunDate)}
                            </span>
                          </div>
                          {renderDayContent(wk.sunday)}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : (
            <div className={`grid grid-cols-1 md:grid-cols-7 bg-black ${viewMode === 'month' ? 'auto-rows-fr' : 'md:h-[600px]'}`}>
              {calendarCells.map((cell: any) => {
                if (cell.type === 'empty') {
                  return <div key={cell.key} className="hidden md:block min-h-[140px] border-b border-r border-zinc-800/50 bg-black"></div>;
                }

                const isToday = todayString === cell.dateString;
                const monthPart = cell.dateString.split('-')[1];
                
                // Obter o dia da semana abreviado para exibir no mobile
                const dateObj = new Date(cell.dateString + 'T12:00:00');
                const dayOfWeek = dateObj.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');

                return (
                  <div 
                    key={cell.key} 
                    className={`
                      p-2 border-b border-r border-zinc-800 transition-colors relative group overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent
                      ${viewMode === 'month' ? 'min-h-[140px]' : 'h-auto md:h-full'}
                      ${isToday ? 'bg-brand-red/5' : 'hover:bg-zinc-900/30'}
                    `}
                  >
                    <div className="flex justify-between items-center mb-2 sticky top-0 bg-inherit z-10 pb-1 gap-1">
                      <div className="flex items-center gap-2">
                        {viewMode === 'week' ? (
                          <span
                            className={`
                              text-xs font-bold px-2 py-1 rounded-md tabular-nums whitespace-nowrap
                              ${isToday ? 'bg-brand-red text-white' : 'bg-zinc-900 text-zinc-300 group-hover:text-white'}
                            `}
                            title={formatSafeDateLocal(cell.dateString)}
                          >
                            {`${String(cell.day).padStart(2, '0')}/${monthPart}`}
                          </span>
                        ) : (
                          <span 
                            className={`
                              text-sm font-bold w-7 h-7 flex items-center justify-center rounded-md tabular-nums
                              ${isToday ? 'bg-brand-red text-white' : 'text-zinc-400 group-hover:text-zinc-200'}
                            `}
                            title={formatSafeDateLocal(cell.dateString)}
                          >
                            {cell.day}
                          </span>
                        )}
                        <span className="md:hidden text-xs font-bold text-zinc-500 uppercase tracking-wider">
                          {dayOfWeek}
                        </span>
                      </div>
                      {isToday && (
                        <span className="text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded bg-brand-red/20 text-brand-red border border-brand-red/30 whitespace-nowrap shrink-0">
                          Hoje
                        </span>
                      )}
                    </div>

                    {renderDayContent(cell.dateString)}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Student Guided Study Modal */}
      {selectedMetaForModal && (
        <StudentGuidedStudyModal
          isOpen={!!selectedMetaForModal}
          onClose={() => setSelectedMetaForModal(null)}
          meta={selectedMetaForModal}
          classId={classId}
          userId={currentUser?.uid || ''}
          progress={studentProgress[selectedMetaForModal.id!]}
          onProgressUpdated={() => reloadGuidedProgress()}
        />
      )}
    </div>
  );
};
