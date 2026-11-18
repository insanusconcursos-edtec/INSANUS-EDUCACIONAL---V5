import { Topic, Module, Subject } from '../../types/curriculum';
import { ClassAllocationMode, ClassScheduleEvent, ScheduledModuleLink } from '../../types/schedule';

export interface CurriculumSlotUnit {
  slotKey: string;
  orderNumber: number;
  primaryTopic: Topic;
  primaryModule: Module;
  primaryIndexLabel: string;
  modules: ScheduledModuleLink[];
}

export const makeSlotUnitKey = (
  topicId: string,
  moduleId: string,
  indexLabel: string = '1/1'
): string => `${topicId}::${moduleId}::${indexLabel}`;

/**
 * Constrói a fila sequencial de slots (tempos de aula) de uma disciplina,
 * agrupando automaticamente módulos marcados com `groupedWithPrevious` (ou `classesCount === 0`)
 * junto ao slot imediatamente anterior da mesma disciplina.
 */
export const buildSubjectSlotUnits = (
  subjectId: string,
  topics: Topic[],
  onlySelectedTopics: boolean = true
): CurriculumSlotUnit[] => {
  const subjectTopics = topics
    .filter(t => t.subjectId === subjectId && (!onlySelectedTopics || t.isSelected))
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const slotUnits: CurriculumSlotUnit[] = [];

  subjectTopics.forEach(topic => {
    // Guarda os índices dos slots criados pelo último módulo titular (ex: Parte 1/2 e Parte 2/2),
    // garantindo que módulos marcados com "Mesma aula ant." acompanhem todas as partes desse bloco.
    let lastPrimarySlotIndices: number[] = [];

    if (topic.modules && topic.modules.length > 0) {
      topic.modules.forEach(module => {
        if (onlySelectedTopics && module.isSelected === false) return;
        if (module.isOnline) return;

        const isGrouped = Boolean(module.groupedWithPrevious) || Number(module.classesCount) === 0;

        if (isGrouped) {
          if (lastPrimarySlotIndices.length > 0) {
            lastPrimarySlotIndices.forEach(slotIdx => {
              slotUnits[slotIdx].modules.push({
                topicId: topic.id,
                moduleId: module.id,
                moduleIndex: 'Conjunto',
              });
            });
          } else if (slotUnits.length > 0) {
            slotUnits[slotUnits.length - 1].modules.push({
              topicId: topic.id,
              moduleId: module.id,
              moduleIndex: 'Conjunto',
            });
          } else {
            // Fallback seguro caso seja o primeiro módulo presencial da disciplina
            const indexLabel = '1/1';
            const newIdx = slotUnits.length;
            slotUnits.push({
              slotKey: makeSlotUnitKey(topic.id, module.id, indexLabel),
              orderNumber: newIdx + 1,
              primaryTopic: topic,
              primaryModule: module,
              primaryIndexLabel: indexLabel,
              modules: [
                {
                  topicId: topic.id,
                  moduleId: module.id,
                  moduleIndex: indexLabel,
                },
              ],
            });
            lastPrimarySlotIndices = [newIdx];
          }
        } else {
          const count = Math.max(1, Number(module.classesCount) || 1);
          const createdIndices: number[] = [];
          for (let i = 0; i < count; i++) {
            const indexLabel = `${i + 1}/${count}`;
            const newIdx = slotUnits.length;
            slotUnits.push({
              slotKey: makeSlotUnitKey(topic.id, module.id, indexLabel),
              orderNumber: newIdx + 1,
              primaryTopic: topic,
              primaryModule: module,
              primaryIndexLabel: indexLabel,
              modules: [
                {
                  topicId: topic.id,
                  moduleId: module.id,
                  moduleIndex: indexLabel,
                },
              ],
            });
            createdIndices.push(newIdx);
          }
          lastPrimarySlotIndices = createdIndices;
        }
      });
    } else if (topic.requiredClasses > 0) {
      const dummyModule: Module = {
        id: `topic-${topic.id}-general`,
        name: topic.name,
        classesCount: topic.requiredClasses,
        isSelected: true,
      };
      for (let i = 0; i < topic.requiredClasses; i++) {
        const indexLabel = `${i + 1}/${topic.requiredClasses}`;
        slotUnits.push({
          slotKey: makeSlotUnitKey(topic.id, dummyModule.id, indexLabel),
          orderNumber: slotUnits.length + 1,
          primaryTopic: topic,
          primaryModule: dummyModule,
          primaryIndexLabel: indexLabel,
          modules: [
            {
              topicId: topic.id,
              moduleId: dummyModule.id,
              moduleIndex: indexLabel,
            },
          ],
        });
      }
    }
  });

  return slotUnits;
};

/**
 * Distribui uma lista ordenada de `slotKey`s selecionados entre `periodCount` tempos de um encontro,
 * mantendo a sequência didática (ex: Parte 1/2 no 1º Tempo e Parte 2/2 no 2º Tempo).
 */
export const distributeSlotKeysAcrossPeriods = (
  slotKeys: string[],
  periodCount: number
): string[][] => {
  const pCount = Math.max(1, periodCount);
  const buckets: string[][] = Array.from({ length: pCount }, () => []);
  if (!Array.isArray(slotKeys) || slotKeys.length === 0) return buckets;

  if (slotKeys.length <= pCount) {
    slotKeys.forEach((key, idx) => {
      buckets[idx].push(key);
    });
    return buckets;
  }

  const base = Math.floor(slotKeys.length / pCount);
  const remainder = slotKeys.length % pCount;
  let cursor = 0;
  for (let i = 0; i < pCount; i++) {
    const size = base + (i < remainder ? 1 : 0);
    buckets[i] = slotKeys.slice(cursor, cursor + size);
    cursor += size;
  }
  return buckets;
};

/**
 * Resolve uma lista de `pinnedSlotKeys` contra `slotUnits` da disciplina,
 * com fallback resiliente caso a quantidade total de aulas do módulo (`1/1` -> `1/2`) tenha sido editada.
 */
export const matchSlotUnitsByKeys = (
  pinnedSlotKeys: string[] | undefined,
  slotUnits: CurriculumSlotUnit[]
): CurriculumSlotUnit[] => {
  if (!Array.isArray(pinnedSlotKeys) || pinnedSlotKeys.length === 0 || slotUnits.length === 0) {
    return [];
  }

  const byExactKey = new Map<string, CurriculumSlotUnit>();
  slotUnits.forEach(u => byExactKey.set(u.slotKey, u));

  const matched: CurriculumSlotUnit[] = [];
  const usedKeysInCall = new Set<string>();

  pinnedSlotKeys.forEach(rawKey => {
    if (!rawKey) return;
    const exact = byExactKey.get(rawKey);
    if (exact && !usedKeysInCall.has(exact.slotKey)) {
      usedKeysInCall.add(exact.slotKey);
      matched.push(exact);
      return;
    }

    // Fallback resiliente por topicId + moduleId + número da parte (ex: '1/1' -> '1/2')
    const [topicId, moduleId, indexPart] = rawKey.split('::');
    if (!topicId || !moduleId) return;
    const requestedPartNumber = parseInt((indexPart || '1').split('/')[0], 10) || 1;

    const moduleUnits = slotUnits.filter(
      u => u.primaryTopic.id === topicId && u.primaryModule.id === moduleId
    );
    const candidate =
      moduleUnits[requestedPartNumber - 1] ||
      moduleUnits.find(u => !usedKeysInCall.has(u.slotKey));

    if (candidate && !usedKeysInCall.has(candidate.slotKey)) {
      usedKeysInCall.add(candidate.slotKey);
      matched.push(candidate);
    }
  });

  // Mantém a ordem didática cadastrada dentro da mesma aula
  return matched.sort((a, b) => a.orderNumber - b.orderNumber);
};

/**
 * Identifica quais `slotKey`s da grade curricular estão cobertos por um determinado evento.
 */
export const getSlotKeysCoveredByEvent = (
  event: ClassScheduleEvent,
  slotUnits: CurriculumSlotUnit[]
): string[] => {
  if (
    event.eventType === 'SIMULADO' ||
    event.allocationMode === 'FREE_REVIEW' ||
    event.topicId === 'free_review' ||
    event.isOverflow
  ) {
    return [];
  }

  if (event.allocationMode === 'MANUAL_PIN' && event.pinnedSlotKeys?.length) {
    return matchSlotUnitsByKeys(event.pinnedSlotKeys, slotUnits).map(u => u.slotKey);
  }

  const candidateKeys: string[] = [];
  if (event.linkedModules && event.linkedModules.length > 0) {
    event.linkedModules.forEach(lm => {
      if (lm.moduleIndex && lm.moduleIndex !== 'Conjunto') {
        candidateKeys.push(makeSlotUnitKey(lm.topicId, lm.moduleId, lm.moduleIndex));
      }
    });
  } else if (event.topicId && event.moduleId && event.moduleId !== 'extra') {
    candidateKeys.push(
      makeSlotUnitKey(event.topicId, event.moduleId, event.moduleIndex || '1/1')
    );
  }

  return matchSlotUnitsByKeys(candidateKeys, slotUnits).map(u => u.slotKey);
};

/**
 * Simula em tempo real quais slots da fila automática (`autoQueue`) serão atribuídos a um evento específico
 * caso ele opere em modo `'AUTO'` com `extraModulesCount`, respeitando todos os demais pins e revisões livres.
 */
export const previewAutoAllocationForEvent = (
  allEvents: ClassScheduleEvent[],
  targetEventId: string,
  subjectId: string,
  extraModulesCount: number,
  topics: Topic[]
): {
  maxExtraSlots: number;
  remainingAvailableSlots: number;
  consumedUnits: CurriculumSlotUnit[];
} => {
  const slotUnits = buildSubjectSlotUnits(subjectId, topics, true);
  const subjectEvents = allEvents
    .filter(e => e.eventType !== 'SIMULADO' && e.subjectId === subjectId && e.status !== 'CANCELED')
    .sort((a, b) => {
      const timeDiff =
        new Date(`${a.date}T${a.startTime}`).getTime() -
        new Date(`${b.date}T${b.startTime}`).getTime();
      if (timeDiff !== 0) return timeDiff;
      return (a.classOrderIndex || 0) - (b.classOrderIndex || 0);
    });

  // Passo 1: Reserva todos os pins manuais dos DEMAIS eventos da disciplina
  const consumedByOtherPins = new Set<string>();
  subjectEvents.forEach(ev => {
    if (ev.id === targetEventId) return;
    if (ev.allocationMode === 'MANUAL_PIN' && ev.pinnedSlotKeys?.length) {
      const matched = matchSlotUnitsByKeys(ev.pinnedSlotKeys, slotUnits);
      matched.forEach(u => consumedByOtherPins.add(u.slotKey));
    }
  });

  const autoQueue = slotUnits.filter(u => !consumedByOtherPins.has(u.slotKey));

  // Passo 2: Avança o cursor apenas nos eventos AUTO anteriores ao evento alvo
  let autoCursor = 0;
  for (const ev of subjectEvents) {
    if (ev.id === targetEventId) break;
    const mode: ClassAllocationMode = ev.allocationMode || 'AUTO';
    if (mode !== 'AUTO') continue;
    const req = 1 + Math.max(0, Number(ev.extraModulesCount) || 0);
    autoCursor += req;
  }

  const remainingAvailableSlots = Math.max(0, autoQueue.length - autoCursor);
  const maxExtraSlots = Math.max(0, remainingAvailableSlots - 1);
  const effectiveSlots = 1 + Math.max(0, extraModulesCount);
  const consumedUnits = autoQueue.slice(autoCursor, autoCursor + effectiveSlots);

  return {
    maxExtraSlots,
    remainingAvailableSlots,
    consumedUnits,
  };
};

/**
 * Retorna a quantidade efetiva de aulas (tempos) presenciais exigidas por uma disciplina.
 */
export const getSubjectEffectiveSlotCount = (
  subjectId: string,
  topics: Topic[],
  onlySelectedTopics: boolean = true
): number => {
  return buildSubjectSlotUnits(subjectId, topics, onlySelectedTopics).length;
};

/**
 * Mescla os módulos de um ou mais slots sequenciais consumidos em um mesmo tempo de aula.
 */
export const mergeConsumedSlotModules = (consumedUnits: CurriculumSlotUnit[]): ScheduledModuleLink[] => {
  const merged: ScheduledModuleLink[] = [];
  consumedUnits.forEach(unit => {
    unit.modules.forEach(modLink => {
      merged.push({ ...modLink });
    });
  });
  return merged;
};

export const resolveManualSchedule = (
  manualAppointments: any[],
  _subjects: Subject[],
  topics: Topic[]
): ClassScheduleEvent[] => {
  const simuladoRawAppointments = manualAppointments.filter(
    (app) => app?.eventType === 'SIMULADO'
  );
  const classRawAppointments = manualAppointments.filter(
    (app) => app?.eventType !== 'SIMULADO'
  );

  // 1. Group class appointments by Subject (subjectId)
  const appointmentsBySubject = classRawAppointments.reduce((acc, curr) => {
    if (!acc[curr.subjectId]) acc[curr.subjectId] = [];
    acc[curr.subjectId].push(curr);
    return acc;
  }, {} as Record<string, any[]>);

  const appointmentsWithModules: ClassScheduleEvent[] = [];

  // 2. Process each subject separately
  for (const subjectId in appointmentsBySubject) {
    const subjectAppointments = [...appointmentsBySubject[subjectId]];

    // 3. CHRONOLOGICAL SORTING (The Domino Effect)
    subjectAppointments.sort((a, b) => {
      const dateA = new Date(`${a.date}T${a.startTime}`);
      const dateB = new Date(`${b.date}T${b.startTime}`);
      const diff = dateA.getTime() - dateB.getTime();
      if (diff !== 0) return diff;
      return (Number(a.periodNumber) || 0) - (Number(b.periodNumber) || 0);
    });

    // 4. TWO-PASS SMART QUEUE RESOLUTION ("Fura-Fila Inteligente")
    const slotUnits = buildSubjectSlotUnits(subjectId, topics, true);

    // Passo 4.1: Reserva os slots explicitamente fixados (MANUAL_PIN) em qualquer data
    const consumedByPinSet = new Set<string>();
    const resolvedPinsByIndex = new Map<
      number,
      { units: CurriculumSlotUnit[]; uniqueCount: number; normalizedKeys: string[] }
    >();

    subjectAppointments.forEach((appointment, index) => {
      if (appointment.allocationMode === 'MANUAL_PIN') {
        const matchedUnits = matchSlotUnitsByKeys(appointment.pinnedSlotKeys, slotUnits);
        let uniqueNewlyConsumed = 0;
        matchedUnits.forEach(u => {
          if (!consumedByPinSet.has(u.slotKey)) {
            consumedByPinSet.add(u.slotKey);
            uniqueNewlyConsumed++;
          }
        });
        resolvedPinsByIndex.set(index, {
          units: matchedUnits,
          uniqueCount: uniqueNewlyConsumed,
          normalizedKeys: matchedUnits.map(u => u.slotKey),
        });
      }
    });

    // Fila sequencial automática contendo apenas os slots não antecipados/fixados manualmente
    const autoQueue = slotUnits.filter(u => !consumedByPinSet.has(u.slotKey));
    let autoCursor = 0;

    // Passo 4.2: Distribuição cronológica respeitando o modo de cada aula
    subjectAppointments.forEach((appointment, index) => {
      const mode: ClassAllocationMode =
        appointment.allocationMode === 'MANUAL_PIN' || appointment.allocationMode === 'FREE_REVIEW'
          ? appointment.allocationMode
          : 'AUTO';

      if (mode === 'FREE_REVIEW') {
        const reviewTitle =
          typeof appointment.customActivityTitle === 'string' &&
          appointment.customActivityTitle.trim().length > 0
            ? appointment.customActivityTitle.trim()
            : 'Aula Extra / Revisão';

        appointmentsWithModules.push({
          ...appointment,
          eventType: 'CLASS',
          id: appointment.id || `manual-${appointment.date}-${appointment.startTime}-${index}`,
          date: appointment.date,
          startTime: appointment.startTime,
          endTime: appointment.endTime || calculateEndTime(appointment.startTime, appointment.shift),
          teacherId: appointment.teacherId,
          subjectId: appointment.subjectId,
          topicId: 'free_review',
          moduleId: 'free_review',
          moduleIndex: 'Revisão / Extra',
          linkedModules: [],
          extraModulesCount: 0,
          consumedSlotsCount: 0,
          allocationMode: 'FREE_REVIEW',
          pinnedSlotKeys: undefined,
          customActivityTitle: reviewTitle,
          meetingNumber: index + 1,
          isException: appointment.isException || appointment.isManual || false,
          isOverflow: false,
          shift: appointment.shift,
          classId: appointment.classId || '',
          status: appointment.status || 'SCHEDULED',
          classOrderIndex: index + 1,
          isSubstitute: appointment.isSubstitute || false,
          isLiveEvent: Boolean(appointment.isLiveEvent),
          liveEventId: appointment.isLiveEvent ? appointment.liveEventId || undefined : undefined,
          liveEventTitle: appointment.isLiveEvent ? appointment.liveEventTitle || undefined : undefined,
        });
        return;
      }

      if (mode === 'MANUAL_PIN') {
        const pinInfo = resolvedPinsByIndex.get(index) || {
          units: [],
          uniqueCount: 0,
          normalizedKeys: [],
        };
        const consumedUnits = pinInfo.units;
        const firstUnit = consumedUnits[0];
        const mergedModules = mergeConsumedSlotModules(consumedUnits);
        const persistedKeys =
          pinInfo.normalizedKeys.length > 0
            ? pinInfo.normalizedKeys
            : Array.isArray(appointment.pinnedSlotKeys)
              ? appointment.pinnedSlotKeys
              : [];

        appointmentsWithModules.push({
          ...appointment,
          eventType: 'CLASS',
          id: appointment.id || `manual-${appointment.date}-${appointment.startTime}-${index}`,
          date: appointment.date,
          startTime: appointment.startTime,
          endTime: appointment.endTime || calculateEndTime(appointment.startTime, appointment.shift),
          teacherId: appointment.teacherId,
          subjectId: appointment.subjectId,
          topicId: firstUnit?.primaryTopic.id || 'extra',
          moduleId: firstUnit?.primaryModule.id || 'extra',
          moduleIndex: firstUnit ? firstUnit.primaryIndexLabel : 'Extra',
          linkedModules: mergedModules,
          extraModulesCount: Math.max(0, consumedUnits.length - 1),
          consumedSlotsCount: pinInfo.uniqueCount,
          allocationMode: 'MANUAL_PIN',
          pinnedSlotKeys: persistedKeys,
          customActivityTitle: undefined,
          meetingNumber: index + 1,
          isException: appointment.isException || appointment.isManual || false,
          isOverflow: consumedUnits.length === 0,
          shift: appointment.shift,
          classId: appointment.classId || '',
          status: appointment.status || 'SCHEDULED',
          classOrderIndex: index + 1,
          isSubstitute: appointment.isSubstitute || false,
          isLiveEvent: Boolean(appointment.isLiveEvent),
          liveEventId: appointment.isLiveEvent ? appointment.liveEventId || undefined : undefined,
          liveEventTitle: appointment.isLiveEvent ? appointment.liveEventTitle || undefined : undefined,
        });
        return;
      }

      // Modo padrão: 'AUTO' (consome sequencialmente da autoQueue)
      const extraSlots = Math.max(0, Number(appointment.extraModulesCount) || 0);
      const requestedSlots = 1 + extraSlots;
      const consumedUnits = autoQueue.slice(autoCursor, autoCursor + requestedSlots);
      autoCursor += requestedSlots;

      const firstUnit = consumedUnits[0];
      const mergedModules = mergeConsumedSlotModules(consumedUnits);

      appointmentsWithModules.push({
        ...appointment,
        eventType: 'CLASS',
        id: appointment.id || `manual-${appointment.date}-${appointment.startTime}-${index}`,
        date: appointment.date,
        startTime: appointment.startTime,
        endTime: appointment.endTime || calculateEndTime(appointment.startTime, appointment.shift),
        teacherId: appointment.teacherId,
        subjectId: appointment.subjectId,
        topicId: firstUnit?.primaryTopic.id || 'extra',
        moduleId: firstUnit?.primaryModule.id || 'extra',
        moduleIndex: firstUnit ? firstUnit.primaryIndexLabel : 'Extra',
        linkedModules: mergedModules,
        extraModulesCount: extraSlots,
        consumedSlotsCount: consumedUnits.length,
        allocationMode: 'AUTO',
        pinnedSlotKeys: undefined,
        customActivityTitle: undefined,
        meetingNumber: index + 1,
        isException: appointment.isException || appointment.isManual || false,
        isOverflow: consumedUnits.length === 0,
        shift: appointment.shift,
        classId: appointment.classId || '',
        status: appointment.status || 'SCHEDULED',
        classOrderIndex: index + 1,
        isSubstitute: appointment.isSubstitute || false,
        isLiveEvent: Boolean(appointment.isLiveEvent),
        liveEventId: appointment.isLiveEvent ? appointment.liveEventId || undefined : undefined,
        liveEventTitle: appointment.isLiveEvent ? appointment.liveEventTitle || undefined : undefined,
      });
    });
  }

  // PASSO 2: CONTAGEM GLOBAL DE ENCONTROS (Apenas para aulas regulares/ao vivo)
  const sortedGlobalAppointments = [...appointmentsWithModules].sort((a, b) => {
    const timeA = new Date(`${a.date}T${a.startTime}`);
    const timeB = new Date(`${b.date}T${b.startTime}`);
    return timeA.getTime() - timeB.getTime();
  });

  let currentMeetingNumber = 0;
  let lastDateShiftKey = '';

  const finalClassSchedule = sortedGlobalAppointments.map(app => {
    const currentDateShiftKey = `${app.date}-${app.shift}`;

    if (currentDateShiftKey !== lastDateShiftKey) {
      currentMeetingNumber++;
      lastDateShiftKey = currentDateShiftKey;
    }

    return {
      ...app,
      meetingNumber: currentMeetingNumber,
    };
  });

  // PASSO 3: NORMALIZAÇÃO DOS AGENDAMENTOS DE SIMULADOS (Independentes da fila de disciplinas)
  const normalizedSimulados: ClassScheduleEvent[] = simuladoRawAppointments.map((sim, idx) => {
    const examStart = sim.examStartTime || sim.startTime || '08:00';
    const gatesOpen = sim.gatesOpenTime || examStart;
    const examEnd = sim.examEndTime || sim.endTime || examStart;

    return {
      ...sim,
      id: sim.id || `simulado-${sim.date}-${examStart.replace(':', '')}-${idx}`,
      classId: sim.classId || '',
      date: sim.date,
      startTime: gatesOpen,
      endTime: examEnd,
      shift: sim.shift || inferShiftFromTime(examStart),
      eventType: 'SIMULADO',
      subjectId: '',
      topicId: '',
      moduleId: '',
      teacherId: '',
      isSubstitute: false,
      status: sim.status || 'SCHEDULED',
      meetingNumber: 0,
      classOrderIndex: 0,
      isOverflow: false,
      isLiveEvent: false,
      simulatedClassId: sim.simulatedClassId || '',
      simulatedExamId: sim.simulatedExamId || '',
      simulatedTitle: sim.simulatedTitle || 'Simulado Oficial',
      simulatedQuestionCount: sim.simulatedQuestionCount,
      simulatedExamType: sim.simulatedExamType,
      durationMinutes: Number(sim.durationMinutes) || 0,
      gatesOpenTime: gatesOpen,
      gatesCloseTime: sim.gatesCloseTime || examStart,
      examStartTime: examStart,
      examEndTime: examEnd,
    };
  });

  return [...finalClassSchedule, ...normalizedSimulados].sort((a, b) => {
    const timeA = new Date(`${a.date}T${a.startTime}`);
    const timeB = new Date(`${b.date}T${b.startTime}`);
    return timeA.getTime() - timeB.getTime();
  });
};

const inferShiftFromTime = (timeStr: string): string => {
  const hour = Number((timeStr || '08:00').split(':')[0]);
  if (hour < 12) return 'MORNING';
  if (hour < 18) return 'AFTERNOON';
  return 'NIGHT';
};

const calculateEndTime = (startTime: string, _shift: string): string => {
  if (!startTime) return '';
  const [hours, minutes] = startTime.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  date.setMinutes(date.getMinutes() + 100);

  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
};
