import {
  OnlineCourse,
  CourseFormData,
  NativeCourseTabId,
  CoursePresentialSharedTabKey,
  CoursePresentialSharedTabsMap
} from '../types/course';
import { ClassScheduleEvent } from '../types/schedule';
import { GuidedStudyMeta, GuidedStudyProgress } from '../types/guidedStudy';
import { LiveEvent } from '../types/liveEvent';
import { toLocalISODate } from './dateUtils';

export type CourseStudentTabId =
  | 'MODULES'
  | 'EDITAL'
  | 'LIVE'
  | 'ANNOUNCEMENTS'
  | 'PRESENTIAL_DAILY_GOALS'
  | 'PRESENTIAL_SCHEDULE'
  | 'PRESENTIAL_PLANNING'
  | 'PRESENTIAL'
  | 'PRESENTIAL_LIVE'
  | 'PRESENTIAL_SIMULADOS';

export interface NativeCourseTabMeta {
  id: NativeCourseTabId;
  label: string;
  description: string;
}

export interface CoursePresentialSharedTabMeta {
  key: CoursePresentialSharedTabKey;
  tabId: CourseStudentTabId;
  defaultLabel: string;
  description: string;
}

export const NATIVE_COURSE_TABS_META: NativeCourseTabMeta[] = [
  {
    id: 'MODULES',
    label: 'MÓDULOS DO CURSO',
    description: 'Grade principal de módulos, blocos de disciplinas, sessões temáticas e videoaulas.'
  },
  {
    id: 'EDITAL',
    label: 'EDITAL VERTICALIZADO',
    description: 'Edital verticalizado com tópicos, controle de revisões programadas e progresso.'
  },
  {
    id: 'LIVE',
    label: 'EVENTOS AO VIVO',
    description: 'Salas de transmissão ao vivo vinculadas diretamente a este curso online.'
  },
  {
    id: 'ANNOUNCEMENTS',
    label: 'AVISOS',
    description: 'Mural de comunicados e avisos importantes enviados pela coordenação.'
  }
];

export const COURSE_PRESENTIAL_SHARED_TABS_META: CoursePresentialSharedTabMeta[] = [
  {
    key: 'dailyGoals',
    tabId: 'PRESENTIAL_DAILY_GOALS',
    defaultLabel: 'METAS DE HOJE',
    description: 'Reúne metas diárias do Estudo Guiado, aulas presenciais do dia, eventos ao vivo e simulados.'
  },
  {
    key: 'schedule',
    tabId: 'PRESENTIAL_SCHEDULE',
    defaultLabel: 'CRONOGRAMA',
    description: 'Grade completa de encontros, turnos, simulados e Estudo Guiado da turma presencial.'
  },
  {
    key: 'planning',
    tabId: 'PRESENTIAL_PLANNING',
    defaultLabel: 'PLANEJAMENTO',
    description: 'Planejamento pedagógico com disciplinas, assuntos, módulos e carga horária da turma.'
  },
  {
    key: 'teaching',
    tabId: 'PRESENTIAL',
    defaultLabel: 'AULAS PRESENCIAIS',
    description: 'Módulos e blocos de aulas do ambiente de ensino da turma presencial.'
  },
  {
    key: 'live',
    tabId: 'PRESENTIAL_LIVE',
    defaultLabel: 'AO VIVO (PRESENCIAL)',
    description: 'Salas de transmissão ao vivo programadas especificamente para a turma presencial.'
  },
  {
    key: 'simulados',
    tabId: 'PRESENTIAL_SIMULADOS',
    defaultLabel: 'SIMULADOS',
    description: 'Bateria de simulados vinculada diretamente à turma presencial referenciada.'
  }
];

type CourseLike = Partial<OnlineCourse> | Partial<CourseFormData> | null | undefined;

export const isNativeCourseTabHidden = (
  course: CourseLike,
  tabId: NativeCourseTabId
): boolean => {
  if (!course || !Array.isArray(course.hiddenTabs)) return false;
  return course.hiddenTabs.includes(tabId);
};

export const normalizeCoursePresentialSharedTabs = (
  course: CourseLike
): Required<CoursePresentialSharedTabsMap> => {
  const hasLinkedPresential = Boolean(
    course?.linkedPresentialId && course.linkedPresentialId.trim() !== ''
  );
  const raw = course?.linkedPresentialSharedTabs;
  const legacyTeachingLabel = course?.linkedPresentialTabName?.trim() || 'AULAS PRESENCIAIS';

  // Retrocompatibilidade 100%: cursos antigos que possuíam apenas linkedPresentialId
  // sem linkedPresentialSharedTabs mantêm a aba de Aulas Presenciais ativa automaticamente.
  if (!raw) {
    return {
      dailyGoals: { enabled: false, label: 'METAS DE HOJE' },
      schedule: { enabled: false, label: 'CRONOGRAMA' },
      planning: { enabled: false, label: 'PLANEJAMENTO' },
      teaching: {
        enabled: hasLinkedPresential,
        label: legacyTeachingLabel
      },
      live: { enabled: false, label: 'AO VIVO (PRESENCIAL)' },
      simulados: { enabled: false, label: 'SIMULADOS' }
    };
  }

  return {
    dailyGoals: {
      enabled: Boolean(raw.dailyGoals?.enabled),
      label: raw.dailyGoals?.label || 'METAS DE HOJE'
    },
    schedule: {
      enabled: Boolean(raw.schedule?.enabled),
      label: raw.schedule?.label || 'CRONOGRAMA'
    },
    planning: {
      enabled: Boolean(raw.planning?.enabled),
      label: raw.planning?.label || 'PLANEJAMENTO'
    },
    teaching: {
      enabled: Boolean(raw.teaching?.enabled),
      label: raw.teaching?.label || legacyTeachingLabel
    },
    live: {
      enabled: Boolean(raw.live?.enabled),
      label: raw.live?.label || 'AO VIVO (PRESENCIAL)'
    },
    simulados: {
      enabled: Boolean(raw.simulados?.enabled),
      label: raw.simulados?.label || 'SIMULADOS'
    }
  };
};

export const isCoursePresentialTabShared = (
  course: CourseLike,
  key: CoursePresentialSharedTabKey
): boolean => {
  if (!course?.linkedPresentialId || !course.linkedPresentialId.trim()) return false;
  const normalized = normalizeCoursePresentialSharedTabs(course);
  return Boolean(normalized[key]?.enabled);
};

export const getCoursePresentialTabLabel = (
  course: CourseLike,
  key: CoursePresentialSharedTabKey
): string => {
  const normalized = normalizeCoursePresentialSharedTabs(course);
  const custom = normalized[key]?.label?.trim();
  if (custom) return custom.toUpperCase();
  const meta = COURSE_PRESENTIAL_SHARED_TABS_META.find((m) => m.key === key);
  return meta ? meta.defaultLabel : key.toUpperCase();
};

export const computeCoursePresentialPendingDailyCount = (
  events: ClassScheduleEvent[],
  metas: GuidedStudyMeta[],
  liveEvents: LiveEvent[],
  progressMap: Record<string, GuidedStudyProgress>
): number => {
  const todayStr = toLocalISODate();
  const pendingMetas = metas.filter(
    (m) => m.date <= todayStr && !progressMap[m.id || '']?.completed
  ).length;
  const todaysEvents = events.filter(
    (ev) => ev.date === todayStr && ev.status !== 'CANCELED' && ev.status !== 'COMPLETED'
  );
  const linkedLiveIds = new Set(
    todaysEvents.map((ev) => ev.liveEventId).filter((id): id is string => Boolean(id))
  );
  const standaloneTodaysLives = liveEvents.filter(
    (le) => le.eventDate === todayStr && le.status !== 'ended' && !linkedLiveIds.has(le.id)
  );
  return pendingMetas + todaysEvents.length + standaloneTodaysLives.length;
};
