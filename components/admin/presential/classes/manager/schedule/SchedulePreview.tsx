import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ClassScheduleEvent, ScheduleGap, ScheduleException, ExceptionType } from '../../../../../../types/schedule';
import { Teacher } from '../../../../../../types/teacher';
import { Subject, Topic } from '../../../../../../types/curriculum';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, User, AlertTriangle, ChevronDown, ChevronUp, LayoutGrid, List, Edit2, X, Check, CheckCircle, Loader2, BookOpen, Target, Trash2, Radio, MapPin, Plus, Minus, Layers, Trophy, DoorOpen, Lock, Play, Flag, FileJson, FileText, Video, HelpCircle, Scale, Zap, Maximize2, ExternalLink } from 'lucide-react';

import { checkTeacherAvailability } from '../../../../../../utils/scheduler/ResourceValidator';
import { buildSubjectSlotUnits, mergeConsumedSlotModules } from '../../../../../../utils/scheduler/ContentResolver';

import { Class } from '../../../../../../types/class';
import { classService } from '../../../../../../services/classService';
import { GuidedStudyMeta } from '../../../../../../types/guidedStudy';
import { guidedStudyService } from '../../../../../../services/guidedStudyService';

import { AddManualAppointmentModal } from './AddManualAppointmentModal';
import { AddSimuladoAppointmentModal, formatSimuladoDuration } from './AddSimuladoAppointmentModal';
import { AddGuidedStudyMetaModal } from './AddGuidedStudyMetaModal';
import { StudentGuidedStudyModal } from '../../../../../student/presential/StudentGuidedStudyModal';
import { toLocalISODate, parseSafeLocalDate, formatSafeDateLocal } from '../../../../../../utils/dateUtils';

interface SchedulePreviewProps {
  classData: Class;
  events: ClassScheduleEvent[];
  gaps: ScheduleGap[];
  teachers: Teacher[];
  subjects: Subject[];
  topics: Topic[];
  onAddException?: (exception: ScheduleException) => void;
  onAddManualAppointment?: (appointment: any) => void;
  onUpdateManualAppointment?: (appointment: Partial<ClassScheduleEvent>) => void;
  onDeleteAppointment?: (eventId: string) => void;
  onUpdateEventStatus?: (eventIds: string[], status: 'COMPLETED' | 'SCHEDULED') => void;
}

const normalizeText = (text: string | undefined | null) => {
  if (!text) return '';
  // Remove acentos, converte para minúsculo e remove espaços em branco extras
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
};

export const SchedulePreview: React.FC<SchedulePreviewProps> = ({ classData, events, gaps, teachers, subjects, topics, onAddException, onAddManualAppointment, onUpdateManualAppointment, onDeleteAppointment, onUpdateEventStatus }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'weekend'>(
    classData?.isWeekendOnly ? 'weekend' : 'month'
  );
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<ClassScheduleEvent | null>(null);
  const [selectedSubstituteId, setSelectedSubstituteId] = useState('');
  const [actionType, setActionType] = useState<ExceptionType>('SUBSTITUTION');
  const [adjustedExtraModules, setAdjustedExtraModules] = useState<number>(0);
  const [forceConfirmData, setForceConfirmData] = useState<{ teacherId: string, details: string } | null>(null);
  const [selectedDateForManual, setSelectedDateForManual] = useState<string | null>(null);
  const [manualAppointmentIsLive, setManualAppointmentIsLive] = useState<boolean>(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Simulado Scheduling State (supports direct link or inheritance from masterClassId)
  const [inheritedSimulatedId, setInheritedSimulatedId] = useState<string>('');
  const [selectedDateForSimulado, setSelectedDateForSimulado] = useState<string | null>(null);
  const [editingSimuladoEvent, setEditingSimuladoEvent] = useState<ClassScheduleEvent | null>(null);
  const [simuladoIdToDelete, setSimuladoIdToDelete] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (classData?.linkedSimulatedId) {
      setInheritedSimulatedId('');
      return;
    }
    if (classData?.masterClassId) {
      classService
        .getClassById(classData.masterClassId)
        .then((masterCls) => {
          if (!cancelled && masterCls?.linkedSimulatedId) {
            setInheritedSimulatedId(masterCls.linkedSimulatedId);
          }
        })
        .catch(() => {});
    } else {
      setInheritedSimulatedId('');
    }
    return () => {
      cancelled = true;
    };
  }, [classData?.linkedSimulatedId, classData?.masterClassId]);

  const effectiveLinkedSimulatedId = classData?.linkedSimulatedId || inheritedSimulatedId || '';
  
  const [completionModalData, setCompletionModalData] = useState<{ shift: string, events: ClassScheduleEvent[] } | null>(null);
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Guided Study State
  const [guidedMetas, setGuidedMetas] = useState<GuidedStudyMeta[]>([]);
  const [isGuidedModalOpen, setIsGuidedModalOpen] = useState(false);
  const [selectedDateForGuided, setSelectedDateForGuided] = useState<string | null>(null);
  const [editingGuidedMeta, setEditingGuidedMeta] = useState<GuidedStudyMeta | null>(null);
  const [expandedGuidedMetaId, setExpandedGuidedMetaId] = useState<string | null>(null);
  const [previewGuidedMeta, setPreviewGuidedMeta] = useState<GuidedStudyMeta | null>(null);
  const [deletingGuidedMetaId, setDeletingGuidedMetaId] = useState<string | null>(null);

  const fetchGuidedMetas = async () => {
    if (classData?.id) {
      try {
        const metas = await guidedStudyService.getMetasByClass(classData.id);
        setGuidedMetas(metas);
      } catch (err) {
        console.error("Erro ao carregar metas do estudo guiado:", err);
      }
    }
  };

  useEffect(() => {
    fetchGuidedMetas();
  }, [classData?.id]);

  const todayString = toLocalISODate();

  // Sync selected substitute and extra modules when editing event changes
  useEffect(() => {
    if (editingEvent) {
      setSelectedSubstituteId(editingEvent.teacherId || '');
      setActionType('SUBSTITUTION'); // Reset to default
      setAdjustedExtraModules(Math.max(0, Number(editingEvent.extraModulesCount) || 0));
      setForceConfirmData(null);
    }
  }, [editingEvent]);

  // Group teachers by availability
  const { availableTeachers, unavailableTeachers, hasQualifiedTeachers } = useMemo(() => {
    if (!editingEvent) return { availableTeachers: [], unavailableTeachers: [], hasQualifiedTeachers: false };

    const available: Teacher[] = [];
    const unavailable: { teacher: Teacher, details: string }[] = [];

    // 1. CAPTURA AS INFORMAÇÕES DA AULA QUE ESTÁ SENDO EDITADA
    const targetSubjectId = editingEvent.subjectId || '';
    const targetSubject = subjects.find(s => s.id === targetSubjectId);
    const targetSubjectName = (editingEvent as any).subjectName || (editingEvent as any).title || (editingEvent as any).subject?.name || targetSubject?.name || '';

    // 2. Normaliza os dados alvo
    const normTargetId = normalizeText(targetSubjectId);
    const normTargetName = normalizeText(targetSubjectName);

    // 3. VERIFICAÇÃO DE SEGURANÇA
    if (!normTargetId && !normTargetName) return { availableTeachers: [], unavailableTeachers: [], hasQualifiedTeachers: false };

    // Robust filtering for qualified teachers
    const qualifiedTeachers = teachers.filter(t => {
      const professorSubjects = (t as any).subjects || (t as any).materiasLecionadas || [];
      
      if (!professorSubjects || !Array.isArray(professorSubjects) || professorSubjects.length === 0) {
        return false;
      }

      // 4. BUSCA BIDIRECIONAL COM NORMALIZAÇÃO
      return professorSubjects.some((sub: any) => {
        if (typeof sub === 'string') {
          const normSub = normalizeText(sub);
          return (normTargetId && normSub === normTargetId) || 
                 (normTargetName && normSub === normTargetName) ||
                 (normTargetId && normSub.includes(normTargetId)) ||
                 (normTargetName && normSub.includes(normTargetName));
        }
        
        if (typeof sub === 'object' && sub !== null) {
           const normSubId = normalizeText(sub.id);
           const normSubName = normalizeText(sub.name || sub.title || sub.materia);

           // Cruza tudo: Testa o ID da aula contra o ID e Nome do professor, e vice-versa
           return (normTargetId && (normSubId === normTargetId || normSubName === normTargetId || normSubId.includes(normTargetId) || normSubName.includes(normTargetId))) || 
                  (normTargetName && (normSubId === normTargetName || normSubName === normTargetName || normSubId.includes(normTargetName) || normSubName.includes(normTargetName)));
        }
        
        return false;
      });
    });

    qualifiedTeachers.forEach(t => {
      // Use the event's shift if available, otherwise fallback to classData.shift
      const effectiveClassData = {
        ...classData,
        shift: editingEvent.shift || classData.shift
      };
      const availability = checkTeacherAvailability(t, editingEvent.date, effectiveClassData);
      if (availability.isAvailable) {
        available.push(t);
      } else {
        unavailable.push({ teacher: t, details: availability.details || 'Indisponível' });
      }
    });

    return { availableTeachers: available, unavailableTeachers: unavailable, hasQualifiedTeachers: qualifiedTeachers.length > 0 };
  }, [teachers, editingEvent, subjects, classData]);

  const handleSelectTeacher = (teacherId: string, isAvailable?: boolean, details?: string) => {
    if (!teacherId) {
      setSelectedSubstituteId('');
      setForceConfirmData(null);
      return;
    }

    // If it's the current teacher (if any), just select it
    if (teacherId === editingEvent?.teacherId) {
      setSelectedSubstituteId(teacherId);
      setForceConfirmData(null);
      return;
    }

    // Optimization: use passed values if present
    if (isAvailable !== undefined) {
      if (isAvailable) {
        setSelectedSubstituteId(teacherId);
        setForceConfirmData(null);
      } else {
        setForceConfirmData({ 
          teacherId, 
          details: details || 'Indisponível' 
        });
      }
      return;
    }

    const teacher = teachers.find(t => t.id === teacherId);
    if (!teacher || !editingEvent) return;

    const effectiveClassData = {
      ...classData,
      shift: editingEvent.shift || classData.shift
    };
    const availability = checkTeacherAvailability(teacher, editingEvent.date, effectiveClassData);

    if (availability.isAvailable) {
      setSelectedSubstituteId(teacherId);
      setForceConfirmData(null);
    } else {
      setForceConfirmData({ 
        teacherId, 
        details: availability.details || 'Indisponível' 
      });
    }
  };

  const confirmForceTeacher = () => {
    if (forceConfirmData) {
      setSelectedSubstituteId(forceConfirmData.teacherId);
      setForceConfirmData(null);
    }
  };

  // Determine the initial date based on the first event, class start date, or current local date
  const initialDate = useMemo(() => {
    if (events.length > 0) {
      const sortedDates = [...events].sort((a, b) => a.date.localeCompare(b.date));
      const firstDate = parseSafeLocalDate(sortedDates[0].date);
      if (firstDate) return firstDate;
    }
    const classStart = parseSafeLocalDate(classData?.startDate);
    if (classStart) return classStart;
    return new Date();
  }, [events, classData?.startDate]);

  const [currentDate, setCurrentDate] = useState(initialDate);

  // Helper to get days in month
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    return new Date(year, month + 1, 0).getDate();
  };

  // Helper to get day of week for the 1st of the month (0-6, 0 is Sunday)
  const getFirstDayOfMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    return new Date(year, month, 1).getDay();
  };

  // Helper to get start of the week for the current date
  const getStartOfWeek = (date: Date) => {
    const day = date.getDay();
    const diff = date.getDate() - day; // Adjust when day is Sunday
    return new Date(date.getFullYear(), date.getMonth(), diff);
  };

  const handlePrev = () => {
    if (viewMode === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    } else {
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() - 7);
      setCurrentDate(newDate);
    }
  };

  const handleNext = () => {
    if (viewMode === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    } else {
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() + 7);
      setCurrentDate(newDate);
    }
  };

  const formatHeaderDate = (date: Date) => {
    if (viewMode === 'month') {
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

  // Data Getters
  const getTeacherName = (teacherId: string) => {
    const teacher = teachers.find(t => t.id === teacherId);
    return teacher ? teacher.name : 'Professor não atribuído';
  };

  const getSubject = (subjectId: string) => {
    return subjects.find(s => s.id === subjectId);
  };

  const getModuleName = (topicId: string, moduleId: string) => {
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return 'Tópico desconhecido';
    const module = topic.modules?.find(m => m.id === moduleId);
    if (module) return module.name;
    if (moduleId.startsWith('topic-')) return topic.name;
    return 'Módulo desconhecido';
  };

  const getEventModules = (event: ClassScheduleEvent) => {
    const rawLinks =
      event.linkedModules && event.linkedModules.length > 0
        ? event.linkedModules
        : event.topicId && event.moduleId && event.moduleId !== 'extra'
          ? [{ topicId: event.topicId, moduleId: event.moduleId, moduleIndex: event.moduleIndex }]
          : [];

    const seen = new Set<string>();
    const resolved: { topicId: string; moduleId: string; topicName: string; moduleName: string }[] = [];

    rawLinks.forEach((link) => {
      if (!link.moduleId || seen.has(link.moduleId)) return;
      seen.add(link.moduleId);
      const topic = topics.find((t) => t.id === link.topicId);
      const mod = topic?.modules?.find((m) => m.id === link.moduleId);
      const moduleName =
        mod?.name ||
        (link.moduleId.startsWith('topic-') && topic?.name ? topic.name : 'Módulo desconhecido');
      resolved.push({
        topicId: link.topicId,
        moduleId: link.moduleId,
        topicName: topic?.name || 'Assunto',
        moduleName,
      });
    });

    return resolved;
  };

  const adjustModulesPreview = useMemo(() => {
    if (!editingEvent) {
      return {
        maxExtraSlots: 0,
        remainingAvailableSlots: 0,
        previewModules: [] as { topicId: string; moduleId: string; topicName: string; moduleName: string }[],
      };
    }

    const slotUnits = buildSubjectSlotUnits(editingEvent.subjectId, topics, true);
    const subjectEventsSorted = events
      .filter((e) => e.subjectId === editingEvent.subjectId)
      .sort(
        (a, b) =>
          new Date(`${a.date}T${a.startTime}`).getTime() -
          new Date(`${b.date}T${b.startTime}`).getTime()
      );

    let startSlotIndex = 0;
    for (const ev of subjectEventsSorted) {
      if (ev.id === editingEvent.id) break;
      const consumed = ev.isOverflow
        ? 0
        : ev.consumedSlotsCount !== undefined
          ? ev.consumedSlotsCount
          : 1 + Math.max(0, Number(ev.extraModulesCount) || 0);
      startSlotIndex += consumed;
    }

    const remainingAvailableSlots = Math.max(0, slotUnits.length - startSlotIndex);
    const maxExtraSlots = Math.max(0, remainingAvailableSlots - 1);
    const effectiveSlots = 1 + Math.max(0, adjustedExtraModules);
    const consumedUnits = slotUnits.slice(startSlotIndex, startSlotIndex + effectiveSlots);
    const mergedLinks = mergeConsumedSlotModules(consumedUnits);

    const seen = new Set<string>();
    const previewModules: { topicId: string; moduleId: string; topicName: string; moduleName: string }[] = [];
    mergedLinks.forEach((link) => {
      if (!link.moduleId || seen.has(link.moduleId)) return;
      seen.add(link.moduleId);
      const topic = topics.find((t) => t.id === link.topicId);
      const mod = topic?.modules?.find((m) => m.id === link.moduleId);
      const moduleName =
        mod?.name ||
        (link.moduleId.startsWith('topic-') && topic?.name ? topic.name : 'Módulo desconhecido');
      previewModules.push({
        topicId: link.topicId,
        moduleId: link.moduleId,
        topicName: topic?.name || 'Assunto',
        moduleName,
      });
    });

    return {
      maxExtraSlots,
      remainingAvailableSlots,
      previewModules,
    };
  }, [editingEvent, events, topics, adjustedExtraModules]);

  const getWeekendsOfMonth = (year: number, month: number) => {
    const weekendsList: { number: number; saturday: string; sunday: string; satDay: number; sunDay: number }[] = [];
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    let currentWeekend: any = null;
    let weekendCount = 1;
    
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const dayOfWeek = date.getDay(); // 0 = Sun, 6 = Sat
      const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      
      if (dayOfWeek === 6) { // Saturday
        currentWeekend = {
          number: weekendCount++,
          saturday: dateString,
          satDay: d,
          sunday: '',
          sunDay: 0
        };
        if (d + 1 <= daysInMonth) {
          const sunDateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(d + 1).padStart(2, '0')}`;
          currentWeekend.sunday = sunDateString;
          currentWeekend.sunDay = d + 1;
        } else {
          const nextMonthDate = new Date(year, month, d + 1);
          const sunDateString = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}-${String(nextMonthDate.getDate()).padStart(2, '0')}`;
          currentWeekend.sunday = sunDateString;
          currentWeekend.sunDay = nextMonthDate.getDate();
        }
        weekendsList.push(currentWeekend);
      } else if (dayOfWeek === 0) { // Sunday
        const hasPaired = weekendsList.some(w => w.sunday === dateString);
        if (!hasPaired) {
          const prevMonthDate = new Date(year, month, d - 1);
          const satDateString = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}-${String(prevMonthDate.getDate()).padStart(2, '0')}`;
          
          currentWeekend = {
            number: weekendCount++,
            saturday: satDateString,
            satDay: prevMonthDate.getDate(),
            sunday: dateString,
            sunDay: d
          };
          weekendsList.push(currentWeekend);
        }
      }
    }
    
    return weekendsList;
  };

  const weekends = useMemo(() => {
    return getWeekendsOfMonth(currentDate.getFullYear(), currentDate.getMonth());
  }, [currentDate]);

  const renderDayContent = (dateString: string) => {
    const dayEvents = events.filter(e => e.date === dateString);
    const dayGaps = gaps.filter(g => g.date === dateString);
    const holidayGap = dayEvents.length === 0 ? dayGaps.find((g: ScheduleGap) => g.reason === 'HOLIDAY') : undefined;

    const timeline = holidayGap 
      ? [] 
      : [
          ...dayEvents.map((e: ClassScheduleEvent) => ({ type: 'event' as const, data: e, startTime: e.startTime, shift: e.shift || classData?.shift || 'MORNING' })),
          ...dayGaps.filter((g: ScheduleGap) => {
            if (!g.startTime || !g.endTime) return false;
            const hasOverlappingEvent = dayEvents.some(e => 
              (e.startTime < g.endTime! && e.endTime > g.startTime!)
            );
            return !hasOverlappingEvent;
          }).map((g: ScheduleGap) => ({ type: 'gap' as const, data: g, startTime: g.startTime!, shift: classData?.shift || 'MORNING' }))
        ].sort((a, b) => a.startTime.localeCompare(b.startTime));

    const eventsByShift = timeline.reduce((acc, item) => {
      const shiftName = item.shift === 'MORNING' ? 'Manhã' : item.shift === 'AFTERNOON' ? 'Tarde' : 'Noite';
      if (!acc[shiftName]) acc[shiftName] = [];
      acc[shiftName].push(item);
      return acc;
    }, {} as Record<string, any[]>);

    const hasEvents = dayEvents.length > 0;

    return (
      <div className="space-y-2">
        {holidayGap && (
          <div className="h-full flex flex-col items-center justify-center py-4">
            <div className="w-full p-3 rounded-lg border border-dashed border-zinc-700 bg-zinc-800/30 text-zinc-500 flex flex-col items-center justify-center text-center gap-2">
              <CalendarIcon className="w-5 h-5 opacity-50" />
              <span className="text-xs font-medium">{holidayGap.description}</span>
            </div>
          </div>
        )}

        {!holidayGap && Object.entries(eventsByShift).map(([shiftName, shiftItems], shiftIndex) => {
          const shiftEvents = shiftItems.filter(i => i.type === 'event').map(i => i.data as ClassScheduleEvent);
          const firstClassEvent = shiftEvents.find(e => e.eventType !== 'SIMULADO');
          const meetingNumber = firstClassEvent?.meetingNumber;
          const isOverflow = firstClassEvent?.isOverflow;
          const isShiftCompleted = shiftEvents.length > 0 && shiftEvents.every(e => e.status === 'COMPLETED');
          const regularShiftItems = shiftItems.filter(
            (si) => !(si.type === 'event' && (si.data as ClassScheduleEvent).eventType === 'SIMULADO')
          );
          let regularItemCounter = 0;

          return (
            <div key={shiftName} className="mb-4">
              {shiftIndex > 0 && (
                <div className="relative my-4 flex items-center">
                  <div className="flex-grow border-t-2 border-zinc-700"></div>
                  <span className="flex-shrink mx-2 text-[8px] font-extrabold text-zinc-500 uppercase tracking-wider">Novo Turno</span>
                  <div className="flex-grow border-t-2 border-zinc-700"></div>
                </div>
              )}
              
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-zinc-500 uppercase">{shiftName}</span>
                <div className="flex items-center gap-2">
                  {meetingNumber ? (
                    <span className={`
                      text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide
                      ${isShiftCompleted 
                        ? 'bg-emerald-600 text-white border-emerald-500' 
                        : isOverflow 
                          ? 'bg-red-600 text-white border-red-500' 
                          : 'text-brand-red bg-brand-red/10 border-brand-red/20'}
                    `}>
                      {isOverflow 
                        ? `Encontro #${meetingNumber} (EXTRA)` 
                        : `Encontro #${meetingNumber}`}
                    </span>
                  ) : null}
                  {onUpdateEventStatus && shiftEvents.length > 0 && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setCompletionModalData({ shift: shiftName, events: shiftEvents });
                        setSelectedEventIds(shiftEvents.filter(e => e.status === 'COMPLETED').map(e => e.id));
                      }}
                      className={`${isShiftCompleted ? 'text-emerald-500' : 'text-zinc-500'} hover:text-emerald-500 transition-colors`}
                      title="Concluir Encontro / Aplicação"
                    >
                      <CheckCircle className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                {shiftItems.map((item, index) => {
                  if (item.type === 'event') {
                    const event = item.data as ClassScheduleEvent;
                    const isExpanded = expandedEventId === event.id;

                    // === CARD PREMIUM BLACK GOLD PARA SIMULADOS ===
                    if (event.eventType === 'SIMULADO') {
                      const examStart = event.examStartTime || event.startTime;
                      const examEnd = event.examEndTime || event.endTime;
                      const gatesOpen = event.gatesOpenTime || examStart;
                      const gatesClose = event.gatesCloseTime || examStart;
                      const durationText = event.durationMinutes
                        ? formatSimuladoDuration(event.durationMinutes)
                        : '';
                      const isCompleted = event.status === 'COMPLETED';

                      return (
                        <div
                          key={event.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedEventId(isExpanded ? null : event.id);
                          }}
                          className={`relative rounded-lg border transition-all cursor-pointer overflow-hidden bg-gradient-to-br from-[#17130a] via-[#0a0a0c] to-[#211909] ${
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

                              <div className="flex items-center gap-1.5 pt-1">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingSimuladoEvent(event);
                                  }}
                                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/35 text-amber-200 text-[10px] font-bold uppercase tracking-wider transition-colors whitespace-nowrap shrink-0"
                                >
                                  <Edit2 className="w-3 h-3 shrink-0" />
                                  Editar
                                </button>
                                {onDeleteAppointment && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSimuladoIdToDelete(event.id);
                                    }}
                                    className="flex items-center justify-center gap-1 py-1.5 px-2.5 rounded bg-zinc-900/90 hover:bg-red-950/60 border border-zinc-700/80 hover:border-red-500/50 text-zinc-400 hover:text-red-300 text-[10px] font-bold uppercase tracking-wider transition-colors whitespace-nowrap shrink-0"
                                    title="Remover Simulado do Cronograma"
                                  >
                                    <Trash2 className="w-3 h-3 shrink-0" />
                                    Remover
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    }

                    const currentTempoNumber = ++regularItemCounter;
                    const subject = getSubject(event.subjectId);
                    const borderColor = subject?.color || '#52525b';
                    const isOverflow = event.isOverflow;
                    const isLive = Boolean(event.isLiveEvent);

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
                              ? 'bg-zinc-800 shadow-lg ring-1 ring-zinc-700 z-20 relative'
                              : isLive && event.status !== 'COMPLETED' && !isOverflow
                                ? 'bg-sky-950/25 hover:bg-sky-950/40 ring-1 ring-sky-500/30'
                                : 'bg-zinc-800/50 hover:bg-zinc-800'}
                            ${isOverflow ? 'border-red-500 bg-red-900/20' : ''}
                            ${event.status === 'COMPLETED' ? 'border-emerald-500 bg-emerald-900/10 opacity-80' : ''}
                          `}
                          style={{ borderLeftColor: event.status === 'COMPLETED' ? '#10b981' : borderColor }}
                        >
                          <div className="p-2">
                            <div className="flex justify-between items-center mb-1 flex-wrap gap-1">
                              <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider tabular-nums flex items-center gap-1">
                                <span>{currentTempoNumber}º Tempo</span>
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
                                    title="Evento Ao Vivo transmitido pelo Portal"
                                  >
                                    <Radio className="w-2.5 h-2.5 shrink-0 text-sky-400" />
                                    AO VIVO • PORTAL
                                  </span>
                                )}
                                {event.status === 'COMPLETED' && (
                                  <span className="text-[8px] font-bold text-emerald-500 bg-emerald-950/50 px-1 py-0.5 rounded border border-emerald-900/50 uppercase tracking-wider flex items-center gap-1 whitespace-nowrap">
                                    <CheckCircle className="w-2 h-2 shrink-0" />
                                    CONCLUÍDO
                                  </span>
                                )}
                                {event.isSubstitute && (
                                  <span className="text-[8px] font-bold text-black bg-yellow-500 px-1 py-0.5 rounded border border-yellow-600 uppercase tracking-wider flex items-center gap-1 whitespace-nowrap">
                                    SUBSTITUIÇÃO
                                  </span>
                                )}
                                {isOverflow && (
                                  <span className="text-[8px] font-bold text-red-400 bg-red-950/50 px-1 py-0.5 rounded border border-red-900/50 uppercase tracking-wider flex items-center gap-1 whitespace-nowrap">
                                    <AlertTriangle className="w-2 h-2 shrink-0" />
                                    ⚠️ Além do limite da turma
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex justify-between items-start gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-400 mb-0.5 tabular-nums">
                                  <Clock className="w-3 h-3 shrink-0" />
                                  <span>{event.startTime} - {event.endTime}</span>
                                </div>
                                <div className="font-bold text-xs text-zinc-200 leading-snug break-words" title={subject?.name || 'Disciplina Desconhecida'}>
                                  {subject?.name || 'Disciplina Desconhecida'}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const newParams = new URLSearchParams(searchParams);
                                    newParams.set('tab', 'PLANNING');
                                    if (event.subjectId) newParams.set('subjectId', event.subjectId);
                                    if (event.topicId && event.topicId !== 'extra') newParams.set('topicId', event.topicId);
                                    if (event.moduleId && event.moduleId !== 'extra' && !event.moduleId.startsWith('topic-')) {
                                      newParams.set('moduleId', event.moduleId);
                                    }
                                    setSearchParams(newParams);
                                  }}
                                  className="p-1 text-zinc-500 hover:text-brand-red transition-colors"
                                  title="Ver materiais no Planejamento"
                                >
                                  <BookOpen className="w-3 h-3" />
                                </button>
                                <div className="text-zinc-500">
                                  {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                </div>
                              </div>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="px-2 pb-2 pt-0 space-y-2 animate-in slide-in-from-top-1 duration-200">
                              <div className="h-px bg-zinc-700/50 w-full my-1" />

                              <div>
                                <span className="text-[10px] text-zinc-500 uppercase font-bold block mb-0.5">Modalidade</span>
                                {isLive ? (
                                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-300">
                                    <Radio className="w-3 h-3 text-sky-400 shrink-0" />
                                    <span>Evento Ao Vivo (Acompanhamento pelo Portal)</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5 text-[11px] text-zinc-300">
                                    <MapPin className="w-3 h-3 text-zinc-500 shrink-0" />
                                    <span>Aula Presencial</span>
                                  </div>
                                )}
                              </div>
                              
                              {hasMultipleModules ? (
                                <div>
                                  <span className="text-[10px] text-zinc-500 uppercase font-bold block mb-1 tabular-nums">
                                    Módulos desta Aula ({eventModules.length})
                                  </span>
                                  <div className="space-y-1 rounded-md bg-zinc-900/60 border border-zinc-700/50 p-1.5">
                                    {eventModules.map((modItem, modIdx) => (
                                      <div
                                        key={`${event.id}-mod-${modItem.moduleId}`}
                                        className="flex items-start justify-between gap-1.5 py-1 border-b border-zinc-800 last:border-0"
                                      >
                                        <div className="min-w-0 flex-1">
                                          <p className="text-[11px] text-zinc-200 leading-snug break-words">
                                            <span className="text-amber-400/90 font-bold tabular-nums mr-1">
                                              {modIdx + 1}.
                                            </span>
                                            {modItem.moduleName}
                                          </p>
                                          {spansMultipleTopics && (
                                            <p
                                              className="text-[9px] text-zinc-500 leading-tight mt-0.5 truncate"
                                              title={modItem.topicName}
                                            >
                                              Assunto: {modItem.topicName}
                                            </p>
                                          )}
                                        </div>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const newParams = new URLSearchParams(searchParams);
                                            newParams.set('tab', 'PLANNING');
                                            if (event.subjectId) newParams.set('subjectId', event.subjectId);
                                            if (modItem.topicId) newParams.set('topicId', modItem.topicId);
                                            if (modItem.moduleId && !modItem.moduleId.startsWith('topic-')) {
                                              newParams.set('moduleId', modItem.moduleId);
                                            }
                                            setSearchParams(newParams);
                                          }}
                                          className="p-1 text-zinc-500 hover:text-brand-red transition-colors shrink-0"
                                          title={`Ver "${modItem.moduleName}" no Planejamento`}
                                        >
                                          <BookOpen className="w-3 h-3" />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <div>
                                  <span className="text-[10px] text-zinc-500 uppercase font-bold block mb-0.5">Módulo</span>
                                  <p className="text-[11px] text-zinc-300 leading-tight">
                                    {eventModules[0]?.moduleName ||
                                      (isOverflow ? 'Aula extra além da carga prevista' : getModuleName(event.topicId, event.moduleId))}
                                  </p>
                                </div>
                              )}

                              <div>
                                <span className="text-[10px] text-zinc-500 uppercase font-bold block mb-0.5">Professor</span>
                                <div className="flex items-center gap-1.5 text-[11px] text-zinc-300">
                                  <User className="w-3 h-3 text-zinc-500" />
                                  <span>{getTeacherName(event.teacherId)}</span>
                                </div>
                              </div>

                              {!event.teacherId && (
                                <div className="flex items-center gap-1.5 text-[10px] text-yellow-500 bg-yellow-900/20 p-1.5 rounded border border-yellow-700/30 mt-1">
                                  <AlertTriangle className="w-3 h-3" />
                                  <span>Professor não alocado</span>
                                </div>
                              )}

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingEvent(event);
                                }}
                                className="w-full flex items-center justify-center gap-1.5 mt-2 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-[10px] font-bold uppercase rounded transition-colors"
                              >
                                <Edit2 className="w-3 h-3" />
                                Gerenciar Encontro
                              </button>
                            </div>
                          )}
                        </div>

                        {currentTempoNumber === 1 && regularShiftItems.length > 1 && (
                          <div className="flex items-center gap-2 my-2 opacity-50">
                            <div className="h-px bg-zinc-700 border-t border-dashed border-zinc-600 flex-1"></div>
                            <span className="text-[9px] text-zinc-500 font-medium whitespace-nowrap">Intervalo (15 min)</span>
                            <div className="h-px bg-zinc-700 border-t border-dashed border-zinc-600 flex-1"></div>
                          </div>
                        )}
                      </React.Fragment>
                    );
                  } else {
                    const currentTempoNumber = ++regularItemCounter;
                    const gap = item.data as ScheduleGap;
                    return (
                      <React.Fragment key={`gap-${index}`}>
                        <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-800/30 p-2">
                          <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-1 tabular-nums">
                            {currentTempoNumber}º Tempo
                          </div>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-500 tabular-nums">
                              <Clock className="w-3 h-3" />
                              <span>{gap.startTime} - {gap.endTime}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                              <AlertTriangle className="w-3 h-3" />
                              <span className="leading-tight">{gap.description}</span>
                            </div>
                          </div>
                        </div>

                        {currentTempoNumber === 1 && regularShiftItems.length > 1 && (
                          <div className="flex items-center gap-2 my-2 opacity-50">
                            <div className="h-px bg-zinc-700 border-t border-dashed border-zinc-600 flex-1"></div>
                            <span className="text-[9px] text-zinc-500 font-medium whitespace-nowrap">Intervalo (15 min)</span>
                            <div className="h-px bg-zinc-700 border-t border-dashed border-zinc-600 flex-1"></div>
                          </div>
                        )}
                      </React.Fragment>
                    );
                  }
                })}
              </div>
            </div>
          );
        })}
        
        {/* Metas do Estudo Guiado */}
        {classData?.isGuidedStudyEnabled && (() => {
          const dayGuidedMetas = guidedMetas.filter(m => m.date === dateString);

          const getAdminMetaTypeInfo = (type: GuidedStudyMeta['type']) => {
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

          return (
            <div className="mt-3 pt-2.5 border-t border-amber-500/20 space-y-2">
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1 whitespace-nowrap">
                  <Target className="w-3 h-3 shrink-0" /> Estudo Guiado
                </span>
                {dayGuidedMetas.length > 0 && (
                  <span className="text-[10px] font-semibold text-amber-400/80 tabular-nums whitespace-nowrap">
                    {dayGuidedMetas.length} {dayGuidedMetas.length === 1 ? 'meta' : 'metas'}
                  </span>
                )}
              </div>

              {dayGuidedMetas.map(meta => {
                const metaKey = meta.id || `${meta.date}_${meta.title}`;
                const isJsonMap = meta.type === 'interactive_map';
                const cardColor = meta.color || (isJsonMap ? '#6366f1' : '#f59e0b');
                const isMetaExpanded = expandedGuidedMetaId === metaKey;
                const isConfirmingDelete = deletingGuidedMetaId === metaKey;
                const { label: typeLabel, Icon: TypeIcon } = getAdminMetaTypeInfo(meta.type);
                const summary = meta.interactiveMapSummary;

                return (
                  <div
                    key={metaKey}
                    onClick={e => {
                      e.stopPropagation();
                      setExpandedGuidedMetaId(isMetaExpanded ? null : metaKey);
                      if (isMetaExpanded) setDeletingGuidedMetaId(null);
                    }}
                    className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                      isMetaExpanded
                        ? 'bg-zinc-900 shadow-lg z-20 relative'
                        : 'bg-zinc-900/80 hover:bg-zinc-800/90'
                    }`}
                    style={{
                      borderColor: isMetaExpanded ? cardColor : `${cardColor}50`
                    }}
                  >
                    {/* Header do Card */}
                    <div className="flex items-center justify-between gap-1.5 mb-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div
                          className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
                          style={{ backgroundColor: `${cardColor}22`, color: cardColor }}
                        >
                          <TypeIcon className="w-3 h-3" />
                        </div>
                        <span
                          className="text-[9px] font-bold uppercase tracking-wider truncate"
                          style={{ color: cardColor }}
                        >
                          {typeLabel}
                        </span>
                      </div>

                      <div className="text-zinc-400 shrink-0">
                        {isMetaExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </div>
                    </div>

                    {/* Título legível */}
                    <div
                      className={`font-bold text-xs text-white leading-snug break-words ${
                        isMetaExpanded ? '' : 'line-clamp-2'
                      }`}
                      title={meta.title}
                    >
                      {meta.title}
                    </div>

                    {/* Metadados base */}
                    <div className="mt-1 text-[10px] text-zinc-400 leading-tight break-words tabular-nums">
                      {meta.disciplineName ? `${meta.disciplineName} · ` : ''}
                      {meta.duration || 30} min
                    </div>

                    {/* Painel Expandido do Admin */}
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

                        {/* Arquivo / Conteúdo Inserido -> Clique abre o Modal Expandido */}
                        {isJsonMap ? (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              setPreviewGuidedMeta(meta);
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
                              setPreviewGuidedMeta(meta);
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
                                  Clique para visualizar PDF
                                </span>
                              </div>
                            </div>
                            <Maximize2 className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                          </button>
                        ) : meta.type === 'aula' && (meta.pandaVideoId || meta.pandaVideoUrl) ? (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              setPreviewGuidedMeta(meta);
                            }}
                            className="w-full p-2.5 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/40 text-left transition-all flex items-center justify-between gap-2 group"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Video className="w-4 h-4 text-blue-300 shrink-0" />
                              <div className="min-w-0">
                                <span className="block text-[11px] font-bold text-blue-100 truncate">
                                  Videoaula Vinculada
                                </span>
                                <span className="block text-[9px] text-blue-300/90">
                                  Clique para pré-visualizar
                                </span>
                              </div>
                            </div>
                            <Maximize2 className="w-3.5 h-3.5 text-blue-300 shrink-0" />
                          </button>
                        ) : meta.type === 'flashcards' && meta.cards && meta.cards.length > 0 ? (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              setPreviewGuidedMeta(meta);
                            }}
                            className="w-full p-2.5 rounded-xl bg-pink-500/15 hover:bg-pink-500/25 border border-pink-500/40 text-left transition-all flex items-center justify-between gap-2 group"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Zap className="w-4 h-4 text-pink-300 shrink-0" />
                              <div className="min-w-0">
                                <span className="block text-[11px] font-bold text-pink-100 truncate">
                                  Baralho ({meta.cards.length} cards)
                                </span>
                                <span className="block text-[9px] text-pink-300/90">
                                  Clique para pré-visualizar
                                </span>
                              </div>
                            </div>
                            <Maximize2 className="w-3.5 h-3.5 text-pink-300 shrink-0" />
                          </button>
                        ) : meta.externalLink ? (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              setPreviewGuidedMeta(meta);
                            }}
                            className="w-full py-2 px-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[11px] font-bold text-white transition-colors flex items-center justify-between gap-2"
                          >
                            <span className="truncate">Visualizar Link Externo</span>
                            <ExternalLink className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          </button>
                        ) : null}

                        {/* Botões Administrativos: Editar / Excluir */}
                        {isConfirmingDelete ? (
                          <div className="p-2 rounded-lg bg-red-950/40 border border-red-500/40 space-y-2">
                            <span className="block text-[10px] font-semibold text-red-200 text-center">
                              Confirmar exclusão desta meta?
                            </span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation();
                                  setDeletingGuidedMetaId(null);
                                }}
                                className="flex-1 py-1 px-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-bold transition-colors whitespace-nowrap"
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={async e => {
                                  e.stopPropagation();
                                  if (meta.id) {
                                    await guidedStudyService.deleteMeta(meta.id);
                                    setDeletingGuidedMetaId(null);
                                    setExpandedGuidedMetaId(null);
                                    fetchGuidedMetas();
                                  }
                                }}
                                className="flex-1 py-1 px-2 rounded bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold transition-colors whitespace-nowrap"
                              >
                                Excluir
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 pt-0.5">
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                setSelectedDateForGuided(dateString);
                                setEditingGuidedMeta(meta);
                                setIsGuidedModalOpen(true);
                              }}
                              className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-[10px] font-bold uppercase tracking-wider transition-colors whitespace-nowrap"
                            >
                              <Edit2 className="w-3 h-3 shrink-0" />
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                setDeletingGuidedMetaId(metaKey);
                              }}
                              className="flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg bg-zinc-900 hover:bg-red-950/60 border border-zinc-700/80 hover:border-red-500/50 text-zinc-400 hover:text-red-300 text-[10px] font-bold uppercase tracking-wider transition-colors whitespace-nowrap"
                              title="Excluir Meta"
                            >
                              <Trash2 className="w-3 h-3 shrink-0" />
                              Excluir
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => {
                  setSelectedDateForGuided(dateString);
                  setEditingGuidedMeta(null);
                  setIsGuidedModalOpen(true);
                }}
                className="w-full mt-1 flex items-center justify-center gap-1 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-bold uppercase rounded transition-colors whitespace-nowrap"
              >
                + Meta (Estudo Guiado)
              </button>
            </div>
          );
        })()}

        <div className="pt-1 space-y-1.5">
          <button
            onClick={() => {
              setManualAppointmentIsLive(false);
              setSelectedDateForManual(dateString);
            }}
            className={`w-full flex items-center justify-center gap-1.5 py-2 hover:bg-zinc-700/80 hover:text-white text-[10px] font-bold uppercase tracking-wider rounded border border-dashed transition-colors whitespace-nowrap ${
              hasEvents 
                ? 'bg-zinc-800/20 text-zinc-500 border-zinc-800 hover:border-zinc-700' 
                : 'bg-zinc-800/50 text-zinc-400 border-zinc-700'
            }`}
          >
            + Aula Presencial
          </button>

          <button
            onClick={() => {
              setManualAppointmentIsLive(true);
              setSelectedDateForManual(dateString);
            }}
            className={`w-full flex items-center justify-center gap-1.5 py-2 text-[10px] font-bold uppercase tracking-wider rounded border border-dashed transition-colors whitespace-nowrap ${
              hasEvents
                ? 'bg-sky-500/5 hover:bg-sky-500/15 text-sky-400/80 hover:text-sky-300 border-sky-500/25 hover:border-sky-500/50'
                : 'bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 hover:text-sky-300 border-sky-500/35 hover:border-sky-500/60'
            }`}
          >
            <Radio className="w-3 h-3 shrink-0" />
            + Evento Ao Vivo
          </button>

          {effectiveLinkedSimulatedId && (
            <button
              onClick={() => {
                setSelectedDateForSimulado(dateString);
              }}
              className={`w-full flex items-center justify-center gap-1.5 py-2 text-[10px] font-bold uppercase tracking-wider rounded border border-dashed transition-all whitespace-nowrap ${
                hasEvents
                  ? 'bg-gradient-to-r from-[#171309]/80 via-[#0d0c09]/80 to-[#1d1709]/80 hover:from-[#211b0c] hover:to-[#29200c] text-amber-300/90 hover:text-amber-200 border-amber-500/35 hover:border-amber-400/70'
                  : 'bg-gradient-to-r from-[#191409] via-[#0f0e0a] to-[#221a0a] hover:from-[#241d0d] hover:to-[#2e230d] text-amber-300 hover:text-amber-200 border-amber-500/45 hover:border-amber-400/80'
              }`}
            >
              <Trophy className="w-3 h-3 text-amber-400 shrink-0" />
              + Simulado
            </button>
          )}
        </div>
      </div>
    );
  };

  const handleSaveCompletion = async () => {
    if (!completionModalData || !onUpdateEventStatus) return;
    setIsUpdatingStatus(true);
    try {
      const allIds = completionModalData.events.map(e => e.id);
      const idsToComplete = selectedEventIds;
      const idsToRevert = allIds.filter(id => !selectedEventIds.includes(id));

      if (idsToComplete.length) onUpdateEventStatus(idsToComplete, 'COMPLETED');
      if (idsToRevert.length) onUpdateEventStatus(idsToRevert, 'SCHEDULED');

      setCompletionModalData(null);
    } catch (error) {
      console.error("Erro ao atualizar status:", error);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleSaveEdit = () => {
    if (editingEvent && onAddException) {
      const newException: ScheduleException = {
        id: Date.now().toString(),
        eventId: editingEvent.id,
        date: editingEvent.date,
        meetingNumber: editingEvent.meetingNumber,
        originalTeacherId: editingEvent.teacherId,
        substituteTeacherId: actionType === 'SUBSTITUTION' ? selectedSubstituteId : undefined,
        isLiveEvent: actionType === 'MODALITY_CHANGE' ? !editingEvent.isLiveEvent : editingEvent.isLiveEvent,
        extraModulesCount: actionType === 'ADJUST_MODULES' ? adjustedExtraModules : editingEvent.extraModulesCount,
        type: actionType
      };
      onAddException(newException);
      setEditingEvent(null);
      setSelectedSubstituteId('');
      setActionType('SUBSTITUTION');
      setAdjustedExtraModules(0);
    } else {
        // If no change or no handler, just close
        setEditingEvent(null);
    }
  };

  // Generate Grid Cells
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
        const dayEvents = events.filter(e => e.date === dateString);
        const dayGaps = gaps.filter(g => g.date === dateString);
        
        cells.push({
          type: 'day',
          day,
          dateString,
          events: dayEvents,
          gaps: dayGaps,
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
        const dayEvents = events.filter(e => e.date === dateString);
        const dayGaps = gaps.filter(g => g.date === dateString);

        cells.push({
          type: 'day',
          day,
          dateString,
          events: dayEvents,
          gaps: dayGaps,
          key: dateString
        });
      }
    }

    return cells;
  }, [currentDate, events, gaps, viewMode]);

  return (
    <>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-sm animate-in fade-in duration-500">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900 gap-4">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-white capitalize flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-brand-red" />
              {formatHeaderDate(currentDate)}
            </h2>
            <div className="flex items-center gap-1 bg-zinc-800 rounded-lg p-1 border border-zinc-700">
              <button
                onClick={() => {
                  if (viewMode !== 'month') {
                    setViewMode('month');
                  }
                }}
                className={`p-1.5 rounded-md transition-all ${viewMode === 'month' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
                title="Visualização Mensal"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  if (viewMode !== 'week') {
                    const today = new Date();
                    const classStart = parseSafeLocalDate(classData?.startDate);
                    if (currentDate.getMonth() === today.getMonth() && currentDate.getFullYear() === today.getFullYear()) {
                      setCurrentDate(today);
                    } else if (
                      classStart &&
                      currentDate.getMonth() === classStart.getMonth() &&
                      currentDate.getFullYear() === classStart.getFullYear() &&
                      currentDate.getDate() === 1
                    ) {
                      setCurrentDate(classStart);
                    }
                    setViewMode('week');
                  }
                }}
                className={`p-1.5 rounded-md transition-all ${viewMode === 'week' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
                title="Visualização Semanal"
              >
                <List className="w-4 h-4" />
              </button>
              {classData?.isWeekendOnly && (
                <button
                  onClick={() => {
                    setViewMode('weekend');
                  }}
                  className={`p-1.5 rounded-md transition-all flex items-center gap-1.5 ${viewMode === 'weekend' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
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
              className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors border border-transparent hover:border-zinc-700 shrink-0"
              title={viewMode === 'week' ? 'Semana anterior' : 'Mês anterior'}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            {classData?.startDate && (
              <button
                onClick={() => {
                  const start = parseSafeLocalDate(classData.startDate);
                  if (start) setCurrentDate(start);
                }}
                className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-600 rounded-lg transition-colors whitespace-nowrap shrink-0 tabular-nums"
                title={`Ir para a data de início da turma (${formatSafeDateLocal(classData.startDate)})`}
              >
                Início ({formatSafeDateLocal(classData.startDate).slice(0, 5)})
              </button>
            )}
            <button 
              onClick={() => setCurrentDate(new Date())}
              className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-600 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Hoje
            </button>
            <button 
              onClick={handleNext}
              className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors border border-transparent hover:border-zinc-700 shrink-0"
              title={viewMode === 'week' ? 'Próxima semana' : 'Próximo mês'}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Weekday Headers */}
        {viewMode !== 'weekend' && (
          <div className="grid grid-cols-7 border-b border-zinc-800 bg-zinc-950">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
              <div key={day} className="py-3 text-center text-xs font-bold text-zinc-500 uppercase tracking-wider">
                {day}
              </div>
            ))}
          </div>
        )}

        {/* Calendar Grid / Weekend Grid */}
        {viewMode === 'weekend' ? (
          <div className="p-4 bg-zinc-950/20 overflow-x-auto">
            <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-${weekends.length} gap-4 min-w-[800px] lg:min-w-0`}>
              {weekends.map((wk) => {
                const satDate = new Date(wk.saturday + 'T12:00:00');
                const sunDate = new Date(wk.sunday + 'T12:00:00');
                const isSatToday = todayString === wk.saturday;
                const isSunToday = todayString === wk.sunday;

                const formatCardDate = (date: Date) => {
                  return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'numeric' });
                };

                return (
                  <div key={`weekend-${wk.number}`} className="flex flex-col bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden p-3 space-y-4">
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
          </div>
        ) : (
          <div className={`grid grid-cols-7 bg-zinc-900 ${viewMode === 'month' ? 'auto-rows-fr' : 'h-[600px]'}`}>
            {calendarCells.map((cell: any) => {
              if (cell.type === 'empty') {
                return <div key={cell.key} className="min-h-[140px] border-b border-r border-zinc-800/50 bg-zinc-950/30"></div>;
              }

              const isToday = todayString === cell.dateString;
              const monthPart = cell.dateString.split('-')[1];

              return (
                <div 
                  key={cell.key} 
                  className={`
                    p-2 border-b border-r border-zinc-800 transition-colors relative group overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent
                    ${viewMode === 'month' ? 'min-h-[140px]' : 'h-full'}
                    ${isToday ? 'bg-brand-red/5' : 'hover:bg-zinc-800/30'}
                  `}
                >
                  <div className="flex justify-between items-center mb-2 sticky top-0 bg-inherit z-10 pb-1 gap-1">
                    {viewMode === 'week' ? (
                      <span
                        className={`
                          text-xs font-bold px-2 py-1 rounded-md tabular-nums whitespace-nowrap
                          ${isToday ? 'bg-brand-red text-white' : 'bg-zinc-800/80 text-zinc-300 group-hover:text-white'}
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

      {/* Edit Modal */}
      {editingEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/50 shrink-0">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-brand-red" />
                Gerenciar Encontro
              </h3>
              <button 
                onClick={() => setEditingEvent(null)}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-6 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
              {/* Event Details */}
              <div className="bg-zinc-800/50 rounded-lg p-4 space-y-3 border border-zinc-800">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-zinc-500 uppercase">Data</span>
                  <span className="text-sm font-medium text-white">
                    {new Date(editingEvent.date + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-zinc-500 uppercase">Horário</span>
                  <span className="text-sm font-medium text-white flex items-center gap-1.5 tabular-nums">
                    <Clock className="w-4 h-4 text-zinc-400" />
                    {editingEvent.startTime} - {editingEvent.endTime}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-zinc-500 uppercase">Disciplina</span>
                  <span className="text-sm font-medium text-white text-right">
                    {getSubject(editingEvent.subjectId)?.name}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-zinc-500 uppercase">Modalidade</span>
                  {editingEvent.isLiveEvent ? (
                    <span className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5 text-sky-400" />
                      Evento Ao Vivo (Portal)
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                      Aula Presencial
                    </span>
                  )}
                </div>
                <div className="pt-2 border-t border-zinc-700/50 mt-2">
                  <p className="text-[10px] text-zinc-400 italic text-center">
                    {actionType === 'ADJUST_MODULES'
                      ? '* O ajuste de módulos aplica-se exclusivamente a este tempo de aula e reordena a fila seguinte da disciplina.'
                      : '* Atenção: Esta alteração será aplicada a todas as aulas (tempos) deste encontro.'}
                  </p>
                </div>
              </div>

              {/* Action Type Selection */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-zinc-500 uppercase block">Ação</label>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    onClick={() => setActionType('SUBSTITUTION')}
                    className={`p-3 rounded-lg border text-left transition-all ${actionType === 'SUBSTITUTION' ? 'bg-zinc-800 border-brand-red ring-1 ring-brand-red' : 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800'}`}
                  >
                    <div className="font-medium text-sm text-white">Substituir Professor</div>
                    <div className="text-xs text-zinc-500">Gera custo adicional. Altera o professor deste encontro.</div>
                  </button>

                  <button
                    onClick={() => setActionType('ADJUST_MODULES')}
                    className={`p-3 rounded-lg border text-left transition-all ${actionType === 'ADJUST_MODULES' ? 'bg-amber-950/30 border-amber-500 ring-1 ring-amber-500' : 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800'}`}
                  >
                    <div className="font-medium text-sm text-white flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Ajustar Módulos desta Aula (Neste Tempo)</span>
                    </div>
                    <div className="text-xs text-zinc-500">
                      Puxa mais tópicos/módulos da fila sequencial para este tempo e adianta as aulas seguintes.
                    </div>
                  </button>

                  <button
                    onClick={() => setActionType('MODALITY_CHANGE')}
                    className={`p-3 rounded-lg border text-left transition-all ${actionType === 'MODALITY_CHANGE' ? 'bg-sky-950/30 border-sky-500 ring-1 ring-sky-500' : 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800'}`}
                  >
                    <div className="font-medium text-sm text-white flex items-center gap-1.5">
                      {editingEvent.isLiveEvent ? (
                        <>
                          <MapPin className="w-4 h-4 text-brand-red shrink-0" />
                          <span>Converter para Aula Presencial</span>
                        </>
                      ) : (
                        <>
                          <Radio className="w-4 h-4 text-sky-400 shrink-0" />
                          <span>Converter para Evento Ao Vivo (Portal)</span>
                        </>
                      )}
                    </div>
                    <div className="text-xs text-zinc-500">
                      Mantém professor, horário e sequência do módulo, alterando apenas o formato de transmissão.
                    </div>
                  </button>

                  <button
                    onClick={() => setActionType('CANCELLATION')}
                    className={`p-3 rounded-lg border text-left transition-all ${actionType === 'CANCELLATION' ? 'bg-zinc-800 border-brand-red ring-1 ring-brand-red' : 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800'}`}
                  >
                    <div className="font-medium text-sm text-white">Cancelar Aula / Evento</div>
                    <div className="text-xs text-zinc-500">Remove o encontro e reajusta a sequência do cronograma.</div>
                  </button>
                </div>
              </div>

              {/* Adjust Modules Control */}
              {actionType === 'ADJUST_MODULES' && (
                <div className="space-y-3 pt-3 border-t border-zinc-800 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between gap-3 bg-zinc-950/60 border border-zinc-800 rounded-lg p-3">
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-zinc-200 block">
                        Slots da fila consumidos neste tempo
                      </span>
                      <span className="text-[11px] text-zinc-500 block">
                        1 padrão {adjustedExtraModules > 0 ? `+ ${adjustedExtraModules} extra(s) puxado(s) da sequência` : '(padrão da grade)'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setAdjustedExtraModules((prev) => Math.max(0, prev - 1))}
                        disabled={adjustedExtraModules <= 0}
                        className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-zinc-200 border border-zinc-700 transition-colors shrink-0"
                        title="Reduzir módulos puxados neste tempo"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="min-w-[2.25rem] text-center text-sm font-black text-amber-400 tabular-nums">
                        {1 + adjustedExtraModules}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setAdjustedExtraModules((prev) =>
                            Math.min(Math.max(prev, adjustModulesPreview.maxExtraSlots), prev + 1)
                          )
                        }
                        disabled={adjustedExtraModules >= adjustModulesPreview.maxExtraSlots}
                        className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-zinc-200 border border-zinc-700 transition-colors shrink-0"
                        title="Puxar próximo módulo da fila para esta aula"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="bg-zinc-950/40 border border-zinc-800 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider tabular-nums">
                        Módulos previstos neste tempo ({adjustModulesPreview.previewModules.length})
                      </span>
                    </div>

                    {adjustModulesPreview.previewModules.length === 0 ? (
                      <p className="text-xs text-zinc-500 italic">
                        Não há módulos pendentes na fila desta disciplina para este horário.
                      </p>
                    ) : (
                      <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-zinc-700">
                        {adjustModulesPreview.previewModules.map((mod, idx) => (
                          <div
                            key={`${mod.moduleId}-${idx}`}
                            className="flex items-start gap-2 text-xs p-2 rounded bg-zinc-900/80 border border-zinc-800/80"
                          >
                            <span className="font-bold text-amber-400 tabular-nums shrink-0">
                              {idx + 1}.
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-zinc-200 font-medium leading-snug break-words">
                                {mod.moduleName}
                              </p>
                              <p className="text-[10px] text-zinc-500 truncate">
                                Assunto: {mod.topicName}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <p className="text-[11px] text-zinc-500 leading-relaxed pt-1">
                      Ao salvar, as próximas aulas desta disciplina serão automaticamente reajustadas em efeito dominó. Lembre-se de clicar em <strong className="text-zinc-300">Salvar Cronograma Definitivo</strong> para gravar.
                    </p>
                  </div>
                </div>
              )}

              {/* Teacher Selection */}
              {actionType === 'SUBSTITUTION' && (
                <div className="space-y-2 pt-2 border-t border-zinc-800">
                  <label className="text-sm font-medium text-zinc-300 block">
                    Professor Substituto
                  </label>
                  
                  <div className="max-h-48 overflow-y-auto border border-zinc-700 p-2 rounded bg-zinc-950/50">
                    {!hasQualifiedTeachers ? (
                      <div className="text-zinc-500 text-xs text-center py-4 italic">
                        Nenhum professor cadastrado e habilitado para esta disciplina.
                      </div>
                    ) : (
                      <>
                        {/* Available Teachers */}
                        {availableTeachers.length > 0 && (
                          <div className="mb-3">
                            <div className="text-xs font-bold text-emerald-500 uppercase mb-1 flex items-center gap-1">
                              ✅ Professores Disponíveis
                            </div>
                            <div className="space-y-1">
                              {availableTeachers.map(teacher => (
                                <button
                                  key={teacher.id}
                                  onClick={() => handleSelectTeacher(teacher.id, true)}
                                  className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors flex items-center justify-between ${
                                    selectedSubstituteId === teacher.id 
                                      ? 'bg-emerald-900/30 text-emerald-200 border border-emerald-800' 
                                      : 'text-zinc-300 hover:bg-zinc-800'
                                  }`}
                                >
                                  <span>{teacher.name}</span>
                                  {selectedSubstituteId === teacher.id && <Check className="w-3 h-3" />}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Unavailable Teachers */}
                        {unavailableTeachers.length > 0 && (
                          <div>
                            <div className="text-xs font-bold text-red-500 uppercase mb-1 flex items-center gap-1">
                              ❌ Professores Indisponíveis
                            </div>
                            <div className="space-y-1">
                              {unavailableTeachers.map(({ teacher, details }) => (
                                <button
                                  key={teacher.id}
                                  onClick={() => handleSelectTeacher(teacher.id, false, details)}
                                  className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors flex items-center justify-between opacity-75 hover:opacity-100 ${
                                    selectedSubstituteId === teacher.id 
                                      ? 'bg-red-900/30 text-red-200 border border-red-800' 
                                      : 'text-zinc-400 hover:bg-zinc-800'
                                  }`}
                                >
                                  <span>{teacher.name}</span>
                                  {selectedSubstituteId === teacher.id && <Check className="w-3 h-3" />}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Force Schedule Alert */}
                  {forceConfirmData && (
                    <div className="bg-red-900/20 border border-red-500/50 p-3 rounded-lg animate-in slide-in-from-top-2">
                      <div className="flex items-start gap-2 mb-3">
                        <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                        <div className="text-xs text-red-200">
                          <span className="font-bold block mb-0.5">Atenção: Este professor está indisponível.</span>
                          Motivo: {forceConfirmData.details}
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => setForceConfirmData(null)}
                          className="px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={confirmForceTeacher}
                          className="px-3 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-500 rounded shadow-sm transition-colors"
                        >
                          FORÇAR AGENDAMENTO
                        </button>
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-zinc-500 mt-1">
                    * Ao alterar o professor manualmente, esta aula será marcada como substituição.
                  </p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-zinc-800 bg-zinc-950/50 flex justify-between items-center gap-3 shrink-0">
              {onDeleteAppointment ? (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-4 py-2 text-sm font-medium text-red-400 hover:text-red-300 transition-colors whitespace-nowrap shrink-0"
                >
                  Remover
                </button>
              ) : (
                <div></div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => setEditingEvent(null)}
                  className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors whitespace-nowrap shrink-0"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="flex items-center gap-2 px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-600 font-medium shadow-lg shadow-brand-red/20 transition-all whitespace-nowrap shrink-0"
                >
                  <Check className="w-4 h-4" />
                  Salvar Ajuste
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && editingEvent && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Remover Agendamento?</h3>
              <p className="text-zinc-400 text-sm mb-6">
                Tem certeza que deseja remover este agendamento? Esta ação não pode ser desfeita e o cronograma será reajustado.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    if (onDeleteAppointment && editingEvent) {
                      onDeleteAppointment(editingEvent.id);
                      setEditingEvent(null);
                      setShowDeleteConfirm(false);
                    }
                  }}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium shadow-lg shadow-red-600/20 transition-colors"
                >
                  Remover
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Completion Modal */}
      {completionModalData && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-emerald-900/30 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-emerald-500" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Concluir Encontro</h3>
                  <p className="text-zinc-400 text-xs uppercase font-bold tracking-wider">
                    Turno: {completionModalData.shift}
                  </p>
                </div>
              </div>

              <div className="space-y-3 mb-8">
                <p className="text-sm text-zinc-300 mb-4">
                  Selecione os itens que foram efetivamente realizados neste turno:
                </p>
                {(() => {
                  let modalClassIdx = 0;
                  return completionModalData.events.map((event) => {
                    const isSimulado = event.eventType === 'SIMULADO';
                    const tempoNum = isSimulado ? 0 : ++modalClassIdx;
                    const subject = isSimulado ? undefined : getSubject(event.subjectId);
                    const evMods = isSimulado ? [] : getEventModules(event);
                    return (
                      <label 
                        key={event.id}
                        className={`
                          flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all
                          ${selectedEventIds.includes(event.id) 
                            ? 'bg-emerald-900/10 border-emerald-500/50' 
                            : isSimulado
                              ? 'bg-[#17130a] border-amber-500/35 hover:border-amber-400/60'
                              : 'bg-zinc-800/50 border-zinc-700 hover:bg-zinc-800'}
                        `}
                      >
                        <input 
                          type="checkbox"
                          checked={selectedEventIds.includes(event.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedEventIds(prev => [...prev, event.id]);
                            } else {
                              setSelectedEventIds(prev => prev.filter(id => id !== event.id));
                            }
                          }}
                          className="w-5 h-5 rounded border-zinc-700 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-zinc-900 bg-zinc-800"
                        />
                        <div className="flex-1 min-w-0">
                          {isSimulado ? (
                            <>
                              <div className="text-[10px] font-bold text-amber-300 uppercase flex items-center gap-1.5 flex-wrap tabular-nums">
                                <Trophy className="w-3 h-3 text-amber-400 shrink-0" />
                                <span>
                                  Simulado Oficial • Prova: {event.examStartTime || event.startTime} - {event.examEndTime || event.endTime}
                                </span>
                              </div>
                              <div className="text-sm font-bold text-amber-50 truncate">
                                {event.simulatedTitle || 'Simulado Oficial'}
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="text-[10px] font-bold text-zinc-500 uppercase flex items-center gap-1.5 flex-wrap tabular-nums">
                                <span>{tempoNum}º Tempo • {event.startTime} - {event.endTime}</span>
                                {evMods.length > 1 && (
                                  <span className="text-amber-400">
                                    • {evMods.length} módulos
                                  </span>
                                )}
                                {event.isLiveEvent && (
                                  <span className="text-sky-400 flex items-center gap-1">
                                    • <Radio className="w-2.5 h-2.5" /> Ao Vivo no Portal
                                  </span>
                                )}
                              </div>
                              <div className="text-sm font-bold text-zinc-200 truncate">
                                {subject?.name || 'Disciplina'}
                              </div>
                            </>
                          )}
                        </div>
                      </label>
                    );
                  });
                })()}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setCompletionModalData(null)}
                  disabled={isUpdatingStatus}
                  className="flex-1 px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 font-medium transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveCompletion}
                  disabled={isUpdatingStatus}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium shadow-lg shadow-emerald-900/20 transition-all disabled:opacity-50"
                >
                  {isUpdatingStatus ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Confirmar
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Manual Appointment Modal */}
      {selectedDateForManual && (
        <AddManualAppointmentModal
          selectedDate={selectedDateForManual}
          classData={classData}
          teachers={teachers}
          subjects={subjects}
          topics={topics}
          isHoliday={gaps.some(g => g.date === selectedDateForManual && g.reason === 'HOLIDAY')}
          initialIsLiveEvent={manualAppointmentIsLive}
          onClose={() => {
            setSelectedDateForManual(null);
            setManualAppointmentIsLive(false);
          }}
          onSave={(appointment) => {
            if (onAddManualAppointment) {
              onAddManualAppointment(appointment);
            }
            setSelectedDateForManual(null);
            setManualAppointmentIsLive(false);
          }}
        />
      )}

      {/* Add / Edit Simulado Appointment Modal */}
      {(selectedDateForSimulado || editingSimuladoEvent) && effectiveLinkedSimulatedId && (
        <AddSimuladoAppointmentModal
          selectedDate={editingSimuladoEvent?.date || selectedDateForSimulado || todayString}
          classData={classData}
          linkedSimulatedClassId={effectiveLinkedSimulatedId}
          eventToEdit={editingSimuladoEvent}
          onClose={() => {
            setSelectedDateForSimulado(null);
            setEditingSimuladoEvent(null);
          }}
          onSave={(simuladoPayload) => {
            if (editingSimuladoEvent && onUpdateManualAppointment) {
              onUpdateManualAppointment(simuladoPayload);
            } else if (onAddManualAppointment) {
              onAddManualAppointment(simuladoPayload);
            }
            setSelectedDateForSimulado(null);
            setEditingSimuladoEvent(null);
          }}
        />
      )}

      {/* Simulado Delete Confirmation Modal */}
      {simuladoIdToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-amber-500/30 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-amber-500/15 border border-amber-500/35 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trophy className="w-6 h-6 text-amber-400" />
              </div>
              <h3 className="text-base font-bold text-white mb-2">
                Remover Simulado do Cronograma?
              </h3>
              <p className="text-zinc-400 text-xs mb-6 leading-relaxed">
                O agendamento deste simulado será removido do calendário da turma (o simulado continuará salvo normalmente na Turma de Simulados).
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setSimuladoIdToDelete(null)}
                  className="flex-1 px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 text-xs font-semibold transition-colors whitespace-nowrap"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (onDeleteAppointment && simuladoIdToDelete) {
                      onDeleteAppointment(simuladoIdToDelete);
                    }
                    if (expandedEventId === simuladoIdToDelete) {
                      setExpandedEventId(null);
                    }
                    setSimuladoIdToDelete(null);
                  }}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-xs font-semibold transition-colors whitespace-nowrap"
                >
                  Remover
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Guided Study Meta Modal */}
      {isGuidedModalOpen && selectedDateForGuided && (
        <AddGuidedStudyMetaModal
          isOpen={isGuidedModalOpen}
          classId={classData.id}
          selectedDate={selectedDateForGuided}
          metaToEdit={editingGuidedMeta}
          subjects={subjects}
          onClose={() => {
            setIsGuidedModalOpen(false);
            setSelectedDateForGuided(null);
            setEditingGuidedMeta(null);
          }}
          onSuccess={() => {
            fetchGuidedMetas();
          }}
        />
      )}

      {/* Admin Preview Modal for Guided Study Metas (.JSON / PDF / Video / Flashcards) */}
      {previewGuidedMeta && (
        <StudentGuidedStudyModal
          isOpen={!!previewGuidedMeta}
          onClose={() => setPreviewGuidedMeta(null)}
          meta={previewGuidedMeta}
          classId={classData.id}
          userId=""
          isAdminPreview
        />
      )}
    </>
  );
};
