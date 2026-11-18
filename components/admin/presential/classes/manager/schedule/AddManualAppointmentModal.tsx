import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Check,
  Clock,
  AlertCircle,
  Radio,
  MapPin,
  AlertTriangle,
  Plus,
  Minus,
  Layers,
  Pin,
  Sparkles,
  SlidersHorizontal,
  Link2,
} from 'lucide-react';
import { Class } from '../../../../../../types/class';
import { Teacher } from '../../../../../../types/teacher';
import { Subject, Topic } from '../../../../../../types/curriculum';
import { ClassAllocationMode, ClassScheduleEvent } from '../../../../../../types/schedule';
import { LiveEvent } from '../../../../../../types/liveEvent';
import { liveEventService } from '../../../../../../services/liveEventService';
import { checkTeacherAvailability } from '../../../../../../utils/scheduler/ResourceValidator';
import { calculateMultiPeriodTimes } from '../../../../../../utils/scheduler/TimeCalculator';
import {
  distributeSlotKeysAcrossPeriods,
  resolveManualSchedule,
} from '../../../../../../utils/scheduler/ContentResolver';
import { SubjectCurriculumSlotPicker } from './SubjectCurriculumSlotPicker';
import { LiveEventRoomPicker } from './LiveEventRoomPicker';

interface AddManualAppointmentModalProps {
  selectedDate: string;
  classData: Class;
  teachers: Teacher[];
  subjects: Subject[];
  topics: Topic[];
  existingEvents?: ClassScheduleEvent[];
  isHoliday?: boolean;
  initialIsLiveEvent?: boolean;
  liveEvents?: LiveEvent[];
  loadingLiveEvents?: boolean;
  onClose: () => void;
  onSave: (appointments: any[]) => void;
}

interface PeriodContentConfig {
  allocationMode: ClassAllocationMode;
  extraModulesCount: number;
  pinnedSlotKeys: string[];
  customActivityTitle: string;
}

const createDefaultPeriodConfig = (): PeriodContentConfig => ({
  allocationMode: 'AUTO',
  extraModulesCount: 0,
  pinnedSlotKeys: [],
  customActivityTitle: '',
});

const normalizeText = (text: string | undefined | null) => {
  if (!text) return '';
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
};

export const AddManualAppointmentModal: React.FC<AddManualAppointmentModalProps> = ({
  selectedDate,
  classData,
  teachers,
  subjects,
  topics,
  existingEvents = [],
  isHoliday = false,
  initialIsLiveEvent = false,
  liveEvents: propLiveEvents,
  loadingLiveEvents: propLoadingLiveEvents = false,
  onClose,
  onSave,
}) => {
  const dateObj = new Date(selectedDate + 'T12:00:00');
  const dayOfWeek = dateObj.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6 || isHoliday;

  const [isLiveEvent, setIsLiveEvent] = useState<boolean>(initialIsLiveEvent);
  const [selectedLiveEventId, setSelectedLiveEventId] = useState<string>('');
  const [selectedLiveEventTitle, setSelectedLiveEventTitle] = useState<string>('');
  const [fetchedLiveEvents, setFetchedLiveEvents] = useState<LiveEvent[]>([]);
  const [fetchingLiveEvents, setFetchingLiveEvents] = useState<boolean>(false);

  useEffect(() => {
    if (propLiveEvents !== undefined) return;
    let cancelled = false;
    setFetchingLiveEvents(true);
    liveEventService
      .getLiveEvents()
      .then(list => {
        if (!cancelled) setFetchedLiveEvents(list);
      })
      .catch(err => console.error('Erro ao buscar salas de eventos ao vivo:', err))
      .finally(() => {
        if (!cancelled) setFetchingLiveEvents(false);
      });
    return () => {
      cancelled = true;
    };
  }, [propLiveEvents]);

  const availableLiveEvents = propLiveEvents !== undefined ? propLiveEvents : fetchedLiveEvents;
  const isLoadingLiveRooms = propLiveEvents !== undefined ? propLoadingLiveEvents : fetchingLiveEvents;

  const [startTime, setStartTime] = useState(isWeekend ? '' : classData.startTime);
  const [shift, setShift] = useState(isWeekend ? '' : classData.shift);

  const [numberOfPeriods, setNumberOfPeriods] = useState(1);
  const [isSameSubject, setIsSameSubject] = useState(true);
  const [customizePerTempo, setCustomizePerTempo] = useState(false);
  const [activeGlobalPeriodTab, setActiveGlobalPeriodTab] = useState<number>(0);

  // Estado unificado do encontro quando todos os tempos compartilham a mesma disciplina
  const [encounterAllocationMode, setEncounterAllocationMode] =
    useState<ClassAllocationMode>('AUTO');
  const [encounterPinnedSlotKeys, setEncounterPinnedSlotKeys] = useState<string[]>([]);
  const [encounterCustomTitle, setEncounterCustomTitle] = useState<string>('');

  const [globalSelection, setGlobalSelection] = useState({ subjectId: '', teacherId: '' });
  const [periodSelections, setPeriodSelections] = useState<
    Array<{ subjectId: string; teacherId: string }>
  >(() => Array.from({ length: 4 }, () => ({ subjectId: '', teacherId: '' })));

  const [periodConfigs, setPeriodConfigs] = useState<PeriodContentConfig[]>(() =>
    Array.from({ length: 4 }, () => createDefaultPeriodConfig())
  );

  const updatePeriodConfig = (periodIdx: number, patch: Partial<PeriodContentConfig>) => {
    setPeriodConfigs(prev => {
      const next = [...prev];
      next[periodIdx] = { ...next[periodIdx], ...patch };
      return next;
    });
  };

  const updatePeriodExtraModules = (periodIdx: number, delta: number) => {
    setPeriodConfigs(prev => {
      const next = [...prev];
      const current = next[periodIdx]?.extraModulesCount || 0;
      next[periodIdx] = {
        ...next[periodIdx],
        extraModulesCount: Math.max(0, Math.min(8, current + delta)),
      };
      return next;
    });
  };

  // Calcula a configuração efetiva de cada tempo (distribuindo automaticamente os slots no Fura-Fila unificado)
  const effectivePeriodConfigs = useMemo<PeriodContentConfig[]>(() => {
    if (!isSameSubject || customizePerTempo) {
      return Array.from({ length: numberOfPeriods }, (_, idx) => {
        return periodConfigs[idx] || createDefaultPeriodConfig();
      });
    }

    if (encounterAllocationMode === 'FREE_REVIEW') {
      return Array.from({ length: numberOfPeriods }, () => ({
        allocationMode: 'FREE_REVIEW',
        extraModulesCount: 0,
        pinnedSlotKeys: [],
        customActivityTitle: encounterCustomTitle,
      }));
    }

    if (encounterAllocationMode === 'MANUAL_PIN') {
      const buckets = distributeSlotKeysAcrossPeriods(encounterPinnedSlotKeys, numberOfPeriods);
      return Array.from({ length: numberOfPeriods }, (_, idx) => {
        const assignedKeys = buckets[idx] || [];
        if (assignedKeys.length > 0) {
          return {
            allocationMode: 'MANUAL_PIN',
            extraModulesCount: 0,
            pinnedSlotKeys: assignedKeys,
            customActivityTitle: '',
          };
        }
        // Caso o usuário selecione menos aulas (ex: 1 aula) do que a quantidade de tempos (ex: 2 tempos),
        // o tempo restante segue a fila automática de forma transparente
        return {
          allocationMode: 'AUTO',
          extraModulesCount: 0,
          pinnedSlotKeys: [],
          customActivityTitle: '',
        };
      });
    }

    return Array.from({ length: numberOfPeriods }, (_, idx) => ({
      allocationMode: 'AUTO',
      extraModulesCount: periodConfigs[idx]?.extraModulesCount || 0,
      pinnedSlotKeys: [],
      customActivityTitle: '',
    }));
  }, [
    isSameSubject,
    customizePerTempo,
    numberOfPeriods,
    encounterAllocationMode,
    encounterPinnedSlotKeys,
    encounterCustomTitle,
    periodConfigs,
  ]);

  const handleToggleCustomizePerTempo = () => {
    if (!customizePerTempo) {
      // Copia a distribuição atual para os tempos individuais antes de separar
      setPeriodConfigs(prev => {
        const next = [...prev];
        for (let i = 0; i < numberOfPeriods; i++) {
          if (effectivePeriodConfigs[i]) {
            next[i] = {
              ...effectivePeriodConfigs[i],
              pinnedSlotKeys: [...effectivePeriodConfigs[i].pinnedSlotKeys],
            };
          }
        }
        return next;
      });
      setCustomizePerTempo(true);
    } else {
      // Consolida de volta para o modo unificado do encontro
      const allPinned: string[] = [];
      for (let i = 0; i < numberOfPeriods; i++) {
        const cfg = periodConfigs[i];
        if (cfg?.allocationMode === 'MANUAL_PIN') {
          cfg.pinnedSlotKeys.forEach(k => {
            if (!allPinned.includes(k)) allPinned.push(k);
          });
        }
      }
      if (allPinned.length > 0) {
        setEncounterAllocationMode('MANUAL_PIN');
        setEncounterPinnedSlotKeys(allPinned);
      } else if (periodConfigs[0]?.allocationMode === 'FREE_REVIEW') {
        setEncounterAllocationMode('FREE_REVIEW');
        setEncounterCustomTitle(periodConfigs[0]?.customActivityTitle || '');
      } else {
        setEncounterAllocationMode('AUTO');
      }
      setCustomizePerTempo(false);
    }
  };

  const intervalMinutes = classData.hasBreak ? classData.breakDuration : 0;
  const classDurationMinutes = useMemo(() => {
    const totalMinutes = classData.meetingDuration * 60;
    return Math.floor(totalMinutes / numberOfPeriods);
  }, [classData.meetingDuration, numberOfPeriods]);

  const previewPeriodsTimes = useMemo(() => {
    const effectiveStart = startTime || classData.startTime || '19:00';
    return calculateMultiPeriodTimes(
      effectiveStart,
      numberOfPeriods,
      classDurationMinutes,
      intervalMinutes
    );
  }, [startTime, classData.startTime, numberOfPeriods, classDurationMinutes, intervalMinutes]);

  // Simula em tempo real o que cada tempo (0..numberOfPeriods-1) receberá
  const simulatedPeriodModulesMap = useMemo(() => {
    const result = new Map<
      number,
      { moduleName: string; topicName: string; badge?: string }[]
    >();

    const activeSubjectIds = new Set<string>();
    for (let i = 0; i < numberOfPeriods; i++) {
      const subId = isSameSubject ? globalSelection.subjectId : periodSelections[i]?.subjectId;
      if (subId) activeSubjectIds.add(subId);
    }
    if (activeSubjectIds.size === 0) return result;

    const baseSubjectEvents = existingEvents.filter(
      ev =>
        ev.eventType !== 'SIMULADO' &&
        ev.status !== 'CANCELED' &&
        activeSubjectIds.has(ev.subjectId)
    );

    const draftAppointments = previewPeriodsTimes
      .map((period, idx) => {
        const subId = isSameSubject ? globalSelection.subjectId : periodSelections[idx]?.subjectId;
        if (!subId) return null;
        const cfg = effectivePeriodConfigs[idx] || createDefaultPeriodConfig();
        return {
          id: `__draft_period_${idx}__`,
          date: selectedDate,
          startTime: period.startTime,
          endTime: period.endTime,
          shift: shift || classData.shift || 'NIGHT',
          teacherId: '',
          subjectId: subId,
          periodNumber: period.periodNumber,
          allocationMode: cfg.allocationMode,
          extraModulesCount: cfg.allocationMode === 'AUTO' ? cfg.extraModulesCount : 0,
          pinnedSlotKeys: cfg.allocationMode === 'MANUAL_PIN' ? cfg.pinnedSlotKeys : undefined,
          customActivityTitle:
            cfg.allocationMode === 'FREE_REVIEW' ? cfg.customActivityTitle : undefined,
          isManual: true,
        };
      })
      .filter(Boolean);

    const resolved = resolveManualSchedule(
      [...baseSubjectEvents, ...draftAppointments],
      subjects,
      topics
    );

    for (let idx = 0; idx < numberOfPeriods; idx++) {
      const draftEv = resolved.find(ev => ev.id === `__draft_period_${idx}__`);
      if (!draftEv || !draftEv.linkedModules?.length) {
        result.set(idx, []);
        continue;
      }
      const seen = new Set<string>();
      const list: { moduleName: string; topicName: string; badge?: string }[] = [];
      draftEv.linkedModules.forEach(lm => {
        const uniq = `${lm.topicId}::${lm.moduleId}::${lm.moduleIndex || ''}`;
        if (seen.has(uniq)) return;
        seen.add(uniq);
        const t = topics.find(tp => tp.id === lm.topicId);
        const m = t?.modules?.find(md => md.id === lm.moduleId);
        const modName =
          m?.name || (lm.moduleId.startsWith('topic-') && t?.name ? t.name : 'Módulo');

        let badge: string | undefined;
        if (lm.moduleIndex === 'Conjunto') {
          badge = 'Conjunto';
        } else if (lm.moduleIndex && lm.moduleIndex !== '1/1') {
          badge = `Parte ${lm.moduleIndex}`;
        }

        list.push({
          moduleName: modName,
          topicName: t?.name || 'Assunto',
          badge,
        });
      });
      result.set(idx, list);
    }

    return result;
  }, [
    numberOfPeriods,
    isSameSubject,
    globalSelection.subjectId,
    periodSelections,
    existingEvents,
    previewPeriodsTimes,
    effectivePeriodConfigs,
    selectedDate,
    shift,
    classData.shift,
    subjects,
    topics,
  ]);

  const getAvailableTeachers = (subjectId: string) => {
    if (!shift || !subjectId)
      return { availableTeachers: [], unavailableTeachers: [], hasQualifiedTeachers: false };

    const available: Teacher[] = [];
    const unavailable: { teacher: Teacher; details: string }[] = [];

    const selectedSubject = subjects.find(s => s.id === subjectId);
    const normTargetId = normalizeText(subjectId);
    const normTargetName = normalizeText(selectedSubject?.name);

    const qualifiedTeachers = teachers.filter(t => {
      const isLinkedInCurriculum =
        selectedSubject?.defaultTeacherId === t.id ||
        topics.some(topic => topic.subjectId === subjectId && topic.teacherId === t.id);

      if (isLinkedInCurriculum) return true;

      const professorSubjects = (t as any).subjects || (t as any).materiasLecionadas || [];
      if (!professorSubjects || !Array.isArray(professorSubjects) || professorSubjects.length === 0) {
        return false;
      }

      const isMatch = (target: string, candidate: string) => {
        if (!target || !candidate) return false;
        return target === candidate || target.includes(candidate) || candidate.includes(target);
      };

      return professorSubjects.some((sub: any) => {
        if (typeof sub === 'string') {
          const normSub = normalizeText(sub);
          return isMatch(normTargetId, normSub) || isMatch(normTargetName, normSub);
        }

        if (typeof sub === 'object' && sub !== null) {
          const normSubId = normalizeText(sub.id);
          const normSubName = normalizeText(sub.name || sub.title || sub.materia);

          return (
            isMatch(normTargetId, normSubId) ||
            isMatch(normTargetId, normSubName) ||
            isMatch(normTargetName, normSubId) ||
            isMatch(normTargetName, normSubName)
          );
        }

        return false;
      });
    });

    qualifiedTeachers.forEach(t => {
      const mockClassData = { ...classData, shift: shift as any };
      const availability = checkTeacherAvailability(t, selectedDate, mockClassData);

      if (availability.isAvailable) {
        available.push(t);
      } else {
        unavailable.push({ teacher: t, details: availability.details || 'Indisponível' });
      }
    });

    return {
      availableTeachers: available,
      unavailableTeachers: unavailable,
      hasQualifiedTeachers: qualifiedTeachers.length > 0,
    };
  };

  const isSaveDisabled = () => {
    if (!startTime || !shift) return true;
    if (isSameSubject) {
      if (!globalSelection.subjectId || !globalSelection.teacherId) return true;
      if (!customizePerTempo) {
        if (encounterAllocationMode === 'MANUAL_PIN' && encounterPinnedSlotKeys.length === 0) {
          return true;
        }
        return false;
      }
    } else {
      for (let i = 0; i < numberOfPeriods; i++) {
        if (!periodSelections[i].subjectId || !periodSelections[i].teacherId) return true;
      }
    }

    for (let i = 0; i < numberOfPeriods; i++) {
      const cfg = effectivePeriodConfigs[i];
      if (cfg?.allocationMode === 'MANUAL_PIN' && cfg.pinnedSlotKeys.length === 0) {
        return true;
      }
    }

    return false;
  };

  const handleSave = () => {
    if (isSaveDisabled()) return;

    const periodsTimes = calculateMultiPeriodTimes(
      startTime,
      numberOfPeriods,
      classDurationMinutes,
      intervalMinutes
    );

    const appointmentsToSave = periodsTimes.map((period, index) => {
      const selection = isSameSubject ? globalSelection : periodSelections[index];
      const cfg = effectivePeriodConfigs[index] || createDefaultPeriodConfig();
      const mode: ClassAllocationMode = cfg.allocationMode || 'AUTO';

      return {
        id: Math.random().toString(36).substring(2, 15),
        date: selectedDate,
        startTime: period.startTime,
        endTime: period.endTime,
        shift: shift,
        teacherId: selection.teacherId,
        subjectId: selection.subjectId,
        periodNumber: period.periodNumber,
        allocationMode: mode,
        extraModulesCount: mode === 'AUTO' ? Math.max(0, cfg.extraModulesCount || 0) : 0,
        pinnedSlotKeys: mode === 'MANUAL_PIN' ? cfg.pinnedSlotKeys : undefined,
        customActivityTitle:
          mode === 'FREE_REVIEW'
            ? cfg.customActivityTitle.trim() || 'Aula Extra / Revisão'
            : undefined,
        isManual: true,
        isLiveEvent: isLiveEvent,
        liveEventId: isLiveEvent && selectedLiveEventId ? selectedLiveEventId : undefined,
        liveEventTitle:
          isLiveEvent && selectedLiveEventId ? selectedLiveEventTitle || undefined : undefined,
      };
    });

    onSave(appointmentsToSave);
  };

  const renderUnifiedEncounterAllocationControls = (subjectId: string) => {
    return (
      <div className="space-y-3">
        {/* Seletor Unificado de Modo para o Encontro */}
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-zinc-950 rounded-lg border border-zinc-800">
          <button
            type="button"
            onClick={() => setEncounterAllocationMode('AUTO')}
            className={`py-1.5 px-2 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${
              encounterAllocationMode === 'AUTO'
                ? 'bg-zinc-800 text-white border border-zinc-700 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Layers className="w-3 h-3 text-amber-400 shrink-0" />
            <span className="truncate">Fila Automática</span>
          </button>

          <button
            type="button"
            onClick={() => setEncounterAllocationMode('MANUAL_PIN')}
            className={`py-1.5 px-2 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${
              encounterAllocationMode === 'MANUAL_PIN'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Pin className="w-3 h-3 shrink-0" />
            <span className="truncate">Fura-Fila</span>
          </button>

          <button
            type="button"
            onClick={() => setEncounterAllocationMode('FREE_REVIEW')}
            className={`py-1.5 px-2 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${
              encounterAllocationMode === 'FREE_REVIEW'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sparkles className="w-3 h-3 shrink-0" />
            <span className="truncate">Revisão / Extra</span>
          </button>
        </div>

        {/* MODO 1: FILA AUTOMÁTICA (EXIBE TODOS OS TEMPOS DO ENCONTRO) */}
        {encounterAllocationMode === 'AUTO' && (
          <div className="space-y-2">
            {Array.from({ length: numberOfPeriods }).map((_, pIdx) => {
              const pCfg = effectivePeriodConfigs[pIdx] || createDefaultPeriodConfig();
              const autoPreviewList = simulatedPeriodModulesMap.get(pIdx) || [];
              const timeInfo = previewPeriodsTimes[pIdx];

              return (
                <div
                  key={pIdx}
                  className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-zinc-300 tabular-nums">
                      {numberOfPeriods > 1
                        ? `${pIdx + 1}º Tempo (${timeInfo?.startTime || ''} - ${timeInfo?.endTime || ''})`
                        : 'Slots da fila consumidos neste tempo'}
                    </span>
                    <div className="flex items-center gap-1.5 tabular-nums">
                      <button
                        type="button"
                        onClick={() => updatePeriodExtraModules(pIdx, -1)}
                        disabled={pCfg.extraModulesCount === 0}
                        className="w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none transition-colors"
                        title="Reduzir slots neste tempo"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-xs font-bold text-amber-400 min-w-[66px] text-center whitespace-nowrap">
                        {1 + pCfg.extraModulesCount}{' '}
                        {1 + pCfg.extraModulesCount === 1 ? 'aula' : 'aulas'}
                      </span>
                      <button
                        type="button"
                        onClick={() => updatePeriodExtraModules(pIdx, 1)}
                        className="w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center transition-colors"
                        title="Puxar próxima aula da fila neste mesmo tempo"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {autoPreviewList.length > 0 ? (
                    <div className="space-y-1 pt-1 border-t border-zinc-800/70">
                      {autoPreviewList.map((item, mIdx) => (
                        <div
                          key={mIdx}
                          className="text-[11px] text-zinc-200 leading-snug flex items-start gap-1.5 flex-wrap"
                        >
                          <span className="text-amber-400 font-bold tabular-nums">
                            {mIdx + 1}.
                          </span>
                          <span className="font-medium break-words">{item.moduleName}</span>
                          {item.badge && (
                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-amber-300 border border-zinc-700 tabular-nums">
                              {item.badge}
                            </span>
                          )}
                          <span className="text-[10px] text-zinc-500">({item.topicName})</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-amber-400/90 pt-1 border-t border-zinc-800/70">
                      Todos os módulos desta disciplina já estão alocados anteriormente na fila.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* MODO 2: FURA-FILA INTELIGENTE COM DISTRIBUIÇÃO AUTOMÁTICA NOS TEMPOS */}
        {encounterAllocationMode === 'MANUAL_PIN' && (
          <div className="space-y-2.5 animate-in fade-in duration-150">
            <div className="p-2.5 rounded-lg bg-indigo-950/30 border border-indigo-500/30 text-[11px] text-indigo-200 leading-relaxed">
              {numberOfPeriods > 1 ? (
                <>
                  Escolha o assunto/módulo futuro abaixo. Como o encontro possui{' '}
                  <strong>{numberOfPeriods} tempos</strong>, conteúdos com múltiplas aulas (ex:{' '}
                  <strong>Parte 1/2</strong> e <strong>Parte 2/2</strong>) serão distribuídos
                  automaticamente entre o 1º e o {numberOfPeriods}º tempo!
                </>
              ) : (
                <>
                  Escolha livremente qual assunto/módulo será ministrado neste tempo. Os assuntos
                  anteriores pulados permanecem no início da fila automática e o módulo escolhido
                  não será duplicado no futuro.
                </>
              )}
            </div>

            <SubjectCurriculumSlotPicker
              subjectId={subjectId}
              topics={topics}
              existingEvents={existingEvents}
              selectedSlotKeys={encounterPinnedSlotKeys}
              onChange={setEncounterPinnedSlotKeys}
            />

            {encounterPinnedSlotKeys.length > 0 && numberOfPeriods > 1 && (
              <div className="p-2.5 rounded-lg bg-zinc-950/80 border border-indigo-500/30 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                    Distribuição nos {numberOfPeriods} tempos deste encontro
                  </span>
                  {encounterPinnedSlotKeys.length < numberOfPeriods && (
                    <span className="text-[10px] text-amber-300 font-semibold">
                      {encounterPinnedSlotKeys.length} de {numberOfPeriods} tempos fixados
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  {Array.from({ length: numberOfPeriods }).map((_, pIdx) => {
                    const pCfg = effectivePeriodConfigs[pIdx];
                    const items = simulatedPeriodModulesMap.get(pIdx) || [];
                    const timeInfo = previewPeriodsTimes[pIdx];
                    const isPinnedTempo = pCfg?.allocationMode === 'MANUAL_PIN';

                    return (
                      <div
                        key={pIdx}
                        className={`p-2 rounded-md border text-[11px] space-y-1 ${
                          isPinnedTempo
                            ? 'bg-indigo-950/30 border-indigo-500/35'
                            : 'bg-amber-950/20 border-amber-500/30'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-zinc-200 tabular-nums">
                            {pIdx + 1}º Tempo ({timeInfo?.startTime || ''} - {timeInfo?.endTime || ''})
                          </span>
                          {isPinnedTempo ? (
                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-200 border border-indigo-500/40 flex items-center gap-1">
                              <Pin className="w-2.5 h-2.5" />
                              Fixado
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-500/40">
                              Segue Fila Automática
                            </span>
                          )}
                        </div>

                        {items.length > 0 ? (
                          <div className="space-y-0.5">
                            {items.map((it, mIdx) => (
                              <div
                                key={mIdx}
                                className="text-zinc-300 leading-snug flex items-center gap-1.5 flex-wrap"
                              >
                                <span className="text-indigo-300 font-bold tabular-nums">
                                  {mIdx + 1}.
                                </span>
                                <span className="break-words">{it.moduleName}</span>
                                {it.badge && (
                                  <span
                                    className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border tabular-nums ${
                                      it.badge === 'Conjunto'
                                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                        : 'bg-indigo-500/20 text-indigo-200 border-indigo-500/40'
                                    }`}
                                  >
                                    {it.badge}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-zinc-500 text-[10px]">
                            Sem módulos pendentes na fila
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* MODO 3: REVISÃO / AULA EXTRA PARA TODO O ENCONTRO */}
        {encounterAllocationMode === 'FREE_REVIEW' && (
          <div className="space-y-2 animate-in fade-in duration-150">
            <div className="p-2 rounded-lg bg-purple-950/30 border border-purple-500/30 text-[11px] text-purple-200 leading-relaxed">
              {numberOfPeriods > 1
                ? `Os ${numberOfPeriods} tempos deste encontro serão registrados como Revisão / Aula Extra sem consumir módulos da fila sequencial.`
                : 'Esta aula não consumirá nenhum módulo da grade e manterá a ordem futura intacta.'}
            </div>
            <div>
              <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">
                Título / Tema da Atividade (Opcional)
              </label>
              <input
                type="text"
                value={encounterCustomTitle}
                onChange={e => setEncounterCustomTitle(e.target.value)}
                placeholder="Ex: Revisão Geral e Resolução de Questões"
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-purple-500 rounded-lg px-3 py-2 text-xs text-white placeholder:text-zinc-500 outline-none"
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderPeriodAllocationControls = (periodIdx: number, subjectId: string) => {
    const cfg = periodConfigs[periodIdx] || createDefaultPeriodConfig();
    const mode = cfg.allocationMode;
    const autoPreviewList = simulatedPeriodModulesMap.get(periodIdx) || [];

    // Slots marcados em OUTROS tempos desta mesma disciplina no formulário atual
    const otherSelectedKeys = new Set<string>();
    for (let i = 0; i < numberOfPeriods; i++) {
      if (i === periodIdx) continue;
      const otherSubj = isSameSubject ? globalSelection.subjectId : periodSelections[i]?.subjectId;
      if (otherSubj === subjectId && periodConfigs[i]?.allocationMode === 'MANUAL_PIN') {
        periodConfigs[i].pinnedSlotKeys.forEach(k => otherSelectedKeys.add(k));
      }
    }

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-zinc-950 rounded-lg border border-zinc-800">
          <button
            type="button"
            onClick={() => updatePeriodConfig(periodIdx, { allocationMode: 'AUTO' })}
            className={`py-1.5 px-2 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${
              mode === 'AUTO'
                ? 'bg-zinc-800 text-white border border-zinc-700 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Layers className="w-3 h-3 text-amber-400 shrink-0" />
            <span className="truncate">Fila Automática</span>
          </button>

          <button
            type="button"
            onClick={() => updatePeriodConfig(periodIdx, { allocationMode: 'MANUAL_PIN' })}
            className={`py-1.5 px-2 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${
              mode === 'MANUAL_PIN'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Pin className="w-3 h-3 shrink-0" />
            <span className="truncate">Fura-Fila</span>
          </button>

          <button
            type="button"
            onClick={() => updatePeriodConfig(periodIdx, { allocationMode: 'FREE_REVIEW' })}
            className={`py-1.5 px-2 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${
              mode === 'FREE_REVIEW'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sparkles className="w-3 h-3 shrink-0" />
            <span className="truncate">Revisão / Extra</span>
          </button>
        </div>

        {mode === 'AUTO' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 bg-zinc-950/70 px-3 py-2 rounded-lg border border-zinc-800">
              <span className="text-[11px] font-bold text-zinc-300">
                Módulos puxados da fila neste tempo
              </span>
              <div className="flex items-center gap-1.5 tabular-nums">
                <button
                  type="button"
                  onClick={() => updatePeriodExtraModules(periodIdx, -1)}
                  disabled={cfg.extraModulesCount === 0}
                  className="w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  title="Reduzir módulos neste tempo"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="text-xs font-bold text-amber-400 min-w-[74px] text-center whitespace-nowrap">
                  {1 + cfg.extraModulesCount}{' '}
                  {1 + cfg.extraModulesCount === 1 ? 'aula' : 'aulas'}
                </span>
                <button
                  type="button"
                  onClick={() => updatePeriodExtraModules(periodIdx, 1)}
                  className="w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center transition-colors"
                  title="Incluir próximo módulo da fila neste mesmo tempo"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>

            {autoPreviewList.length > 0 ? (
              <div className="px-2.5 py-2 rounded-lg bg-zinc-950/50 border border-zinc-800/80 space-y-1">
                <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 block">
                  Previsto na sequência para este tempo:
                </span>
                {autoPreviewList.map((item, mIdx) => (
                  <div
                    key={mIdx}
                    className="text-[11px] text-zinc-200 leading-snug flex items-center gap-1.5 flex-wrap"
                  >
                    <span className="text-amber-400 font-bold tabular-nums">{mIdx + 1}.</span>
                    <span className="font-medium break-words">{item.moduleName}</span>
                    {item.badge && (
                      <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-amber-300 border border-zinc-700 tabular-nums">
                        {item.badge}
                      </span>
                    )}
                    <span className="text-[10px] text-zinc-500">({item.topicName})</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-amber-400/90 px-1">
                Todos os módulos desta disciplina já estão alocados anteriormente na fila.
              </p>
            )}
          </div>
        )}

        {mode === 'MANUAL_PIN' && (
          <div className="space-y-2 animate-in fade-in duration-150">
            <div className="p-2 rounded-lg bg-indigo-950/30 border border-indigo-500/30 text-[11px] text-indigo-200 leading-relaxed">
              Escolha qual assunto/módulo será ministrado especificamente neste tempo.
            </div>

            <SubjectCurriculumSlotPicker
              subjectId={subjectId}
              topics={topics}
              existingEvents={existingEvents}
              otherSelectedKeysInForm={otherSelectedKeys}
              selectedSlotKeys={cfg.pinnedSlotKeys}
              onChange={keys => updatePeriodConfig(periodIdx, { pinnedSlotKeys: keys })}
            />
          </div>
        )}

        {mode === 'FREE_REVIEW' && (
          <div className="space-y-2 animate-in fade-in duration-150">
            <div className="p-2 rounded-lg bg-purple-950/30 border border-purple-500/30 text-[11px] text-purple-200 leading-relaxed">
              Esta aula não consumirá nenhum módulo da grade e manterá a ordem futura intacta.
            </div>
            <div>
              <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">
                Título / Tema da Atividade (Opcional)
              </label>
              <input
                type="text"
                value={cfg.customActivityTitle}
                onChange={e =>
                  updatePeriodConfig(periodIdx, { customActivityTitle: e.target.value })
                }
                placeholder="Ex: Revisão Geral e Resolução de Questões"
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-purple-500 rounded-lg px-3 py-2 text-xs text-white placeholder:text-zinc-500 outline-none"
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderSelectionFields = (index: number, isGlobal: boolean) => {
    const selection = isGlobal ? globalSelection : periodSelections[index];
    const setSelection = (newSelection: Partial<{ subjectId: string; teacherId: string }>) => {
      if (isGlobal) {
        setGlobalSelection(prev => {
          const subjectChanged =
            newSelection.subjectId !== undefined && newSelection.subjectId !== prev.subjectId;
          if (subjectChanged) {
            setEncounterAllocationMode('AUTO');
            setEncounterPinnedSlotKeys([]);
            setEncounterCustomTitle('');
            setCustomizePerTempo(false);
            setPeriodConfigs(
              Array.from({ length: 4 }, () => createDefaultPeriodConfig())
            );
          }
          return { ...prev, ...newSelection };
        });
      } else {
        setPeriodSelections(prev => {
          const subjectChanged =
            newSelection.subjectId !== undefined &&
            newSelection.subjectId !== prev[index]?.subjectId;
          if (subjectChanged) {
            updatePeriodConfig(index, createDefaultPeriodConfig());
          }
          const newArr = [...prev];
          newArr[index] = { ...newArr[index], ...newSelection };
          return newArr;
        });
      }
    };

    const { availableTeachers, unavailableTeachers, hasQualifiedTeachers } = getAvailableTeachers(
      selection.subjectId
    );

    const safeGlobalTab = Math.min(activeGlobalPeriodTab, Math.max(0, numberOfPeriods - 1));

    return (
      <div className="space-y-4 p-4 bg-zinc-950/50 rounded-lg border border-zinc-800">
        {!isGlobal && <h4 className="text-sm font-bold text-white mb-2">{index + 1}º Tempo</h4>}
        <div>
          <label className="text-xs font-bold text-zinc-500 uppercase block mb-1">Disciplina</label>
          <select
            value={selection.subjectId}
            onChange={e => {
              setSelection({ subjectId: e.target.value, teacherId: '' });
            }}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-white text-sm focus:border-brand-red focus:ring-1 focus:ring-brand-red outline-none"
          >
            <option value="">Selecione a disciplina...</option>
            {subjects.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {selection.subjectId && (
          <div className="p-3 rounded-lg bg-zinc-900/70 border border-zinc-800/80 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider">
                Conteúdo / Ordem Pedagógica
              </span>
              {isGlobal && numberOfPeriods > 1 && (
                <button
                  type="button"
                  onClick={handleToggleCustomizePerTempo}
                  className={`text-[10px] font-bold px-2 py-1 rounded border flex items-center gap-1 transition-colors ${
                    customizePerTempo
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/35 hover:bg-amber-500/25'
                      : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                  }`}
                >
                  <SlidersHorizontal className="w-3 h-3 shrink-0" />
                  {customizePerTempo
                    ? 'Voltar para distribuição automática do encontro'
                    : 'Personalizar tempos separadamente'}
                </button>
              )}
            </div>

            {isGlobal ? (
              customizePerTempo && numberOfPeriods > 1 ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                    {Array.from({ length: numberOfPeriods }).map((_, pIdx) => {
                      const pCfg = periodConfigs[pIdx] || createDefaultPeriodConfig();
                      const isSelectedTab = safeGlobalTab === pIdx;
                      const needsAttention =
                        pCfg.allocationMode === 'MANUAL_PIN' && pCfg.pinnedSlotKeys.length === 0;

                      return (
                        <button
                          key={pIdx}
                          type="button"
                          onClick={() => setActiveGlobalPeriodTab(pIdx)}
                          className={`px-2.5 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 border whitespace-nowrap tabular-nums ${
                            isSelectedTab
                              ? 'bg-zinc-800 text-white border-zinc-600 shadow-sm'
                              : 'bg-zinc-950/80 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                          }`}
                        >
                          <span>{pIdx + 1}º Tempo</span>
                          {pCfg.allocationMode === 'MANUAL_PIN' && (
                            <span
                              className={`w-2 h-2 rounded-full ${
                                needsAttention ? 'bg-amber-400 animate-pulse' : 'bg-indigo-400'
                              }`}
                              title="Fura-Fila ativo neste tempo"
                            />
                          )}
                          {pCfg.allocationMode === 'FREE_REVIEW' && (
                            <span
                              className="w-2 h-2 rounded-full bg-purple-400"
                              title="Revisão Livre ativa neste tempo"
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {renderPeriodAllocationControls(safeGlobalTab, selection.subjectId)}
                </div>
              ) : (
                renderUnifiedEncounterAllocationControls(selection.subjectId)
              )
            ) : (
              renderPeriodAllocationControls(index, selection.subjectId)
            )}
          </div>
        )}

        {shift && selection.subjectId && (
          <div className="space-y-2 pt-2 border-t border-zinc-800">
            <label className="text-sm font-medium text-zinc-300 block">Professor</label>

            <div className="border border-zinc-700 p-2 rounded bg-zinc-900">
              {!hasQualifiedTeachers ? (
                <div className="text-zinc-500 text-xs text-center py-4 italic">
                  Nenhum professor cadastrado e habilitado para esta disciplina.
                </div>
              ) : (
                <>
                  {availableTeachers.length > 0 && (
                    <div className="mb-3">
                      <div className="text-xs font-bold text-emerald-500 uppercase mb-1 flex items-center gap-1">
                        Professores Disponíveis
                      </div>
                      <div className="space-y-1">
                        {availableTeachers.map(teacher => (
                          <button
                            type="button"
                            key={teacher.id}
                            onClick={() => setSelection({ teacherId: teacher.id })}
                            className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors flex items-center justify-between ${
                              selection.teacherId === teacher.id
                                ? 'bg-emerald-900/30 text-emerald-200 border border-emerald-800'
                                : 'text-zinc-300 hover:bg-zinc-800'
                            }`}
                          >
                            <span>{teacher.name}</span>
                            {selection.teacherId === teacher.id && <Check className="w-3 h-3" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {unavailableTeachers.length > 0 && (
                    <div>
                      <div className="text-xs font-bold text-amber-400 uppercase mb-1 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        Professores com Restrição no Turno (Clique para forçar)
                      </div>
                      <div className="space-y-1">
                        {unavailableTeachers.map(({ teacher, details }) => {
                          const isSelected = selection.teacherId === teacher.id;
                          return (
                            <button
                              type="button"
                              key={teacher.id}
                              onClick={() => setSelection({ teacherId: teacher.id })}
                              className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors flex items-center justify-between gap-2 border ${
                                isSelected
                                  ? 'bg-amber-900/30 text-amber-200 border-amber-600'
                                  : 'bg-zinc-950/50 text-zinc-400 border-zinc-800 hover:bg-zinc-800/70 hover:text-zinc-200'
                              }`}
                            >
                              <span className="truncate">{teacher.name}</span>
                              <span className="flex items-center gap-1.5 shrink-0 max-w-[50%]">
                                <span
                                  className="text-[10px] text-amber-400/90 truncate"
                                  title={details}
                                >
                                  {details}
                                </span>
                                {isSelected && (
                                  <Check className="w-3 h-3 text-amber-300 shrink-0" />
                                )}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/50">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            {isLiveEvent ? (
              <>
                <Radio className="w-5 h-5 text-sky-400 shrink-0" />
                <span>Agendar Evento Ao Vivo</span>
              </>
            ) : (
              <>
                <MapPin className="w-5 h-5 text-brand-red shrink-0" />
                <span>Agendar Aula Presencial</span>
              </>
            )}
          </h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[78vh] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700">
          <div className="space-y-4">
            {/* Modality Selector */}
            <div>
              <label className="text-xs font-bold text-zinc-500 uppercase block mb-1.5">
                Formato do Encontro
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-950 rounded-lg border border-zinc-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsLiveEvent(false);
                    if (!isWeekend) {
                      setShift(classData.shift);
                      setStartTime(classData.startTime);
                    }
                  }}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                    !isLiveEvent
                      ? 'bg-brand-red text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  Aula Presencial
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsLiveEvent(true);
                    if (!shift && classData.shift) setShift(classData.shift);
                    if (!startTime && classData.startTime) setStartTime(classData.startTime);
                  }}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                    isLiveEvent
                      ? 'bg-sky-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Radio className="w-3.5 h-3.5 shrink-0" />
                  Evento Ao Vivo
                </button>
              </div>
              {isLiveEvent && (
                <div className="mt-3 p-3.5 rounded-xl bg-sky-950/20 border border-sky-500/30 space-y-2.5 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-bold text-sky-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Link2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      <span>Vincular Sala de Transmissão (Eventos Ao Vivo)</span>
                    </label>
                    <span className="text-[10px] font-semibold text-zinc-400">Opcional</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Referencie um dos Eventos Ao Vivo criados para liberar no cronograma e nas metas do aluno o botão direto para a sala de transmissão.
                  </p>
                  <LiveEventRoomPicker
                    liveEvents={availableLiveEvents}
                    loading={isLoadingLiveRooms}
                    classId={classData.id}
                    targetDate={selectedDate}
                    selectedLiveEventId={selectedLiveEventId}
                    onChange={(id, title) => {
                      setSelectedLiveEventId(id);
                      setSelectedLiveEventTitle(title);
                    }}
                  />
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-500 uppercase block mb-1">Data</label>
              <div className="text-sm font-medium text-white bg-zinc-800/50 p-2 rounded border border-zinc-700">
                {dateObj.toLocaleDateString('pt-BR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-zinc-500 uppercase block mb-1">Turno</label>
                {isWeekend || isLiveEvent ? (
                  <select
                    value={shift}
                    onChange={e => setShift(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-white text-sm focus:border-brand-red focus:ring-1 focus:ring-brand-red outline-none"
                  >
                    <option value="">Selecione...</option>
                    <option value="MORNING">Manhã</option>
                    <option value="AFTERNOON">Tarde</option>
                    <option value="NIGHT">Noite</option>
                  </select>
                ) : (
                  <div className="text-sm font-medium text-zinc-300 bg-zinc-800/30 p-2 rounded border border-zinc-800">
                    {shift === 'MORNING' ? 'Manhã' : shift === 'AFTERNOON' ? 'Tarde' : 'Noite'}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs font-bold text-zinc-500 uppercase block mb-1">
                  Horário de Início
                </label>
                {isWeekend || isLiveEvent ? (
                  <input
                    type="time"
                    value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-white text-sm focus:border-brand-red focus:ring-1 focus:ring-brand-red outline-none tabular-nums"
                  />
                ) : (
                  <div className="text-sm font-medium text-zinc-300 bg-zinc-800/30 p-2 rounded border border-zinc-800 flex items-center gap-2 tabular-nums">
                    <Clock className="w-4 h-4" />
                    {startTime}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-zinc-500 uppercase block mb-1">
                  Quantos tempos de aula?
                </label>
                <input
                  type="number"
                  min="1"
                  max="4"
                  value={numberOfPeriods}
                  onChange={e => {
                    const nextPeriods = Math.max(1, Math.min(4, parseInt(e.target.value) || 1));
                    setNumberOfPeriods(nextPeriods);
                    if (nextPeriods === 1) {
                      setCustomizePerTempo(false);
                    }
                    if (activeGlobalPeriodTab >= nextPeriods) {
                      setActiveGlobalPeriodTab(0);
                    }
                  }}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-white text-sm focus:border-brand-red focus:ring-1 focus:ring-brand-red outline-none tabular-nums"
                />
              </div>
            </div>

            <div className="flex items-start gap-2 text-xs text-zinc-400 bg-zinc-950/50 p-3 rounded-lg border border-zinc-800">
              <AlertCircle className="w-4 h-4 text-brand-red shrink-0 mt-0.5" />
              <p>
                O sistema aplicará os intervalos de acordo com a configuração da turma (
                {intervalMinutes} minutos de intervalo).
              </p>
            </div>

            {numberOfPeriods > 1 && (
              <div className="flex items-center gap-3 p-3 bg-zinc-800/30 rounded-lg border border-zinc-700">
                <label className="text-sm font-medium text-white flex-1 cursor-pointer">
                  Usar a mesma disciplina/professor para todos os tempos?
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsSameSubject(true)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      isSameSubject
                        ? 'bg-brand-red text-white'
                        : 'bg-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    Sim
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSameSubject(false);
                      setCustomizePerTempo(false);
                    }}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      !isSameSubject
                        ? 'bg-brand-red text-white'
                        : 'bg-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    Não
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {isSameSubject
                ? renderSelectionFields(0, true)
                : Array.from({ length: numberOfPeriods }).map((_, index) => (
                    <React.Fragment key={index}>{renderSelectionFields(index, false)}</React.Fragment>
                  ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-zinc-800 bg-zinc-950/50 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaveDisabled()}
            className={`flex items-center gap-2 px-4 py-2 text-white rounded-lg font-medium shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap ${
              isLiveEvent
                ? 'bg-sky-600 hover:bg-sky-500 shadow-sky-600/20'
                : 'bg-brand-red hover:bg-red-600 shadow-brand-red/20'
            }`}
          >
            <Check className="w-4 h-4 shrink-0" />
            {isLiveEvent ? 'Salvar Evento Ao Vivo' : 'Salvar Agendamento'}
          </button>
        </div>
      </div>
    </div>
  );
};
