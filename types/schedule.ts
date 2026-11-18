export interface ScheduleGap {
  date: string;
  startTime?: string;
  endTime?: string;
  reason: 'HOLIDAY' | 'NO_TEACHER' | 'NO_CLASS_DAY';
  description: string;
}

export interface ScheduledModuleLink {
  topicId: string;
  moduleId: string;
  moduleIndex?: string;
}

export type ScheduleEventType = 'CLASS' | 'SIMULADO';

export type ClassAllocationMode = 'AUTO' | 'MANUAL_PIN' | 'FREE_REVIEW';

export interface ClassScheduleEvent {
  id: string;
  classId: string;
  date: string; // Formato YYYY-MM-DD
  startTime: string; // Formato HH:mm
  endTime: string; // Formato HH:mm
  shift?: string; // Turno do evento (MORNING, AFTERNOON, NIGHT)
  eventType?: ScheduleEventType; // 'CLASS' (padrão) ou 'SIMULADO'
  
  // Relacionamentos de Currículo
  subjectId: string;
  topicId: string;
  moduleId: string;
  moduleIndex?: string; // Ex: '1/2', '2/2', 'Extra', 'Revisão / Extra'
  linkedModules?: ScheduledModuleLink[]; // Todos os módulos trabalhados neste tempo de aula (1 ou mais)
  extraModulesCount?: number; // Quantidade de slots extras puxados sob demanda no cronograma
  consumedSlotsCount?: number; // Total de tempos/slots da grade consumidos por este evento
  allocationMode?: ClassAllocationMode; // 'AUTO' (fila padrão), 'MANUAL_PIN' (fura-fila fixado) ou 'FREE_REVIEW' (revisão/extra livre)
  pinnedSlotKeys?: string[]; // Chaves determinísticas dos slots fixados manualmente quando allocationMode === 'MANUAL_PIN'
  customActivityTitle?: string; // Título descritivo quando allocationMode === 'FREE_REVIEW'

  // Metadados exclusivos de Simulado Presencial / Turma (quando eventType === 'SIMULADO')
  simulatedClassId?: string;
  simulatedExamId?: string;
  simulatedTitle?: string;
  simulatedQuestionCount?: number;
  simulatedExamType?: 'multiple_choice' | 'true_false';
  durationMinutes?: number; // Duração oficial cadastrada no simulado (em minutos)
  gatesOpenTime?: string; // Horário de abertura dos portões (HH:mm)
  gatesCloseTime?: string; // Horário de fechamento dos portões (HH:mm)
  examStartTime?: string; // Horário de início da prova (HH:mm)
  examEndTime?: string; // Horário de término da prova calculado a partir do início + duração (HH:mm)
  
  // Relacionamentos de Pessoal
  teacherId: string;
  originalTeacherId?: string; // ID do professor que DEVERIA dar a aula (para aplicar o desconto)
  isSubstitute: boolean; // Flag para indicar se o professor foi alterado manualmente
  
  // Controle de Estado
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELED' | 'RESCHEDULED';
  
  // Metadados para Lógica de Empuxo
  meetingNumber: number; // Ex: Encontro 1, Encontro 2
  classOrderIndex: number; // A ordem matemática desta aula dentro do currículo
  isOverflow?: boolean; // Flag para indicar se o evento excede o limite original de encontros ou data
  isLiveEvent?: boolean; // Flag para identificar Evento Ao Vivo transmitido no portal (segue a mesma sequência de assuntos/módulos)
  liveEventId?: string; // ID da sala de transmissão (live_events) vinculada a este encontro ao vivo
  liveEventTitle?: string; // Título de referência do Evento Ao Vivo vinculado
}

export type ExceptionType =
  | 'SUBSTITUTION'
  | 'CANCELLATION'
  | 'MODALITY_CHANGE'
  | 'ADJUST_MODULES'
  | 'LINK_LIVE_EVENT';

export interface ScheduleException {
  id: string;
  eventId?: string; // ID of the event being modified
  date: string;
  meetingNumber?: number; // Identifica qual encontro do dia (1, 2, etc)
  originalTeacherId?: string; // Para quem ia dar aula (opcional se for slot vazio)
  substituteTeacherId?: string; // Quem vai assumir (apenas para substituição/alteração)
  isLiveEvent?: boolean; // Usado quando type === 'MODALITY_CHANGE'
  liveEventId?: string | null; // Usado em 'LINK_LIVE_EVENT' ou 'MODALITY_CHANGE'
  liveEventTitle?: string | null; // Usado em 'LINK_LIVE_EVENT' ou 'MODALITY_CHANGE'
  extraModulesCount?: number; // Usado quando type === 'ADJUST_MODULES'
  allocationMode?: ClassAllocationMode; // Usado quando type === 'ADJUST_MODULES'
  pinnedSlotKeys?: string[]; // Usado quando type === 'ADJUST_MODULES' e allocationMode === 'MANUAL_PIN'
  periodPinAssignments?: Array<{
    eventId: string;
    startTime: string;
    pinnedSlotKeys: string[];
  }>; // Distribuição automática entre múltiplos tempos do mesmo encontro
  customActivityTitle?: string; // Usado quando type === 'ADJUST_MODULES' e allocationMode === 'FREE_REVIEW'
  type: ExceptionType;
}

export interface ScheduleConflictData {
  teacherId: string;
  teacherName: string;
  date: string;
  subjectId: string;
  meetingNumber: number;
}

export interface ScheduleAlert {
  type: 'RED' | 'YELLOW';
  message: string;
  conflictData?: ScheduleConflictData; // Populado se houver conflito de professor no final de semana
}
