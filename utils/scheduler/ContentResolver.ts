import { Topic, Module, Subject } from '../../types/curriculum';
import { ClassScheduleEvent, ScheduledModuleLink } from '../../types/schedule';

export interface CurriculumSlotUnit {
  primaryTopic: Topic;
  primaryModule: Module;
  primaryIndexLabel: string;
  modules: ScheduledModuleLink[];
}

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
    if (topic.modules && topic.modules.length > 0) {
      topic.modules.forEach(module => {
        if (onlySelectedTopics && module.isSelected === false) return;
        if (module.isOnline) return;

        const isGrouped = Boolean(module.groupedWithPrevious) || Number(module.classesCount) === 0;

        if (isGrouped) {
          if (slotUnits.length > 0) {
            slotUnits[slotUnits.length - 1].modules.push({
              topicId: topic.id,
              moduleId: module.id,
              moduleIndex: 'Conjunto',
            });
          } else {
            // Fallback seguro caso seja o primeiro módulo presencial da disciplina
            slotUnits.push({
              primaryTopic: topic,
              primaryModule: module,
              primaryIndexLabel: '1/1',
              modules: [
                {
                  topicId: topic.id,
                  moduleId: module.id,
                  moduleIndex: '1/1',
                },
              ],
            });
          }
        } else {
          const count = Math.max(1, Number(module.classesCount) || 1);
          for (let i = 0; i < count; i++) {
            const indexLabel = `${i + 1}/${count}`;
            slotUnits.push({
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
          }
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
    const subjectAppointments = appointmentsBySubject[subjectId];

    // 3. CHRONOLOGICAL SORTING (The Domino Effect)
    subjectAppointments.sort((a, b) => {
      const dateA = new Date(`${a.date}T${a.startTime}`);
      const dateB = new Date(`${b.date}T${b.startTime}`);
      return dateA.getTime() - dateB.getTime();
    });

    // 4. MODULE ASSIGNMENT (Sliding Logic with Multi-Module Support)
    const slotUnits = buildSubjectSlotUnits(subjectId, topics, true);

    let currentSlotIndex = 0;

    subjectAppointments.forEach((appointment, index) => {
      const extraSlots = Math.max(0, Number(appointment.extraModulesCount) || 0);
      const requestedSlots = 1 + extraSlots;
      const consumedUnits = slotUnits.slice(currentSlotIndex, currentSlotIndex + requestedSlots);
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
        meetingNumber: index + 1,
        isException: appointment.isException || appointment.isManual || false,
        isOverflow: consumedUnits.length === 0,
        shift: appointment.shift,
        classId: appointment.classId || '',
        status: appointment.status || 'SCHEDULED',
        classOrderIndex: index + 1,
        isSubstitute: appointment.isSubstitute || false,
        isLiveEvent: Boolean(appointment.isLiveEvent),
      });

      currentSlotIndex += requestedSlots;
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
