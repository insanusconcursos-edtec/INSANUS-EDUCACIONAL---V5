import {
  Plan,
  NativePlanTabId,
  PlanPresentialSharedTabKey
} from '../types/plan';

export interface NativePlanTabMeta {
  id: NativePlanTabId;
  label: string;
  description: string;
}

export interface PresentialSharedTabMeta {
  key: PlanPresentialSharedTabKey;
  defaultLabel: string;
  queryTab: string;
  description: string;
}

export const NATIVE_PLAN_TABS_META: NativePlanTabMeta[] = [
  {
    id: 'TODAY',
    label: 'METAS DE HOJE (NATIVA)',
    description: 'Painel diário gerado pelo algoritmo de ciclos e rotina do plano.'
  },
  {
    id: 'CALENDAR',
    label: 'CALENDÁRIO (NATIVO)',
    description: 'Calendário individual das metas geradas pela rotina do aluno.'
  },
  {
    id: 'EDICT',
    label: 'EDITAL',
    description: 'Edital verticalizado nativo com acompanhamento de progresso e caderno.'
  },
  {
    id: 'MENTORSHIP',
    label: 'MENTORIA',
    description: 'Módulos e orientações de mentoria vinculados ao plano.'
  },
  {
    id: 'CALL',
    label: 'CALL / CHAT',
    description: 'Canal de atendimento e chat direto com os mentores do plano.'
  },
  {
    id: 'SIMULADOS',
    label: 'SIMULADOS',
    description: 'Área de simulados nativa vinculada diretamente ao plano.'
  },
  {
    id: 'LIVE',
    label: 'AO VIVO',
    description: 'Transmissões ao vivo liberadas para os alunos deste plano.'
  },
  {
    id: 'CONFIG',
    label: 'CONFIGURAÇÃO',
    description: 'Configuração de carga horária semanal, perfil e geração de cronograma.'
  }
];

export const PRESENTIAL_SHARED_TABS_META: PresentialSharedTabMeta[] = [
  {
    key: 'dailyGoals',
    defaultLabel: 'METAS DE HOJE',
    queryTab: 'presential_daily',
    description: 'Reúne aulas presenciais, eventos ao vivo, simulados do dia e metas do Estudo Guiado.'
  },
  {
    key: 'schedule',
    defaultLabel: 'CRONOGRAMA',
    queryTab: 'presential_schedule',
    description: 'Grade completa de encontros, turnos, simulados e Estudo Guiado da turma presencial.'
  },
  {
    key: 'planning',
    defaultLabel: 'PLANEJAMENTO',
    queryTab: 'presential_planning',
    description: 'Planejamento pedagógico com disciplinas, assuntos, módulos e carga horária da turma.'
  },
  {
    key: 'teaching',
    defaultLabel: 'ÁREA DE ENSINO',
    queryTab: 'presential_teaching',
    description: 'Módulos e blocos de aulas do ambiente de ensino da turma presencial.'
  },
  {
    key: 'live',
    defaultLabel: 'EVENTOS AO VIVO (TURMA)',
    queryTab: 'presential_live',
    description: 'Salas de transmissão ao vivo programadas especificamente para a turma presencial.'
  },
  {
    key: 'simulados',
    defaultLabel: 'SIMULADOS (TURMA)',
    queryTab: 'presential_simulados',
    description: 'Bateria de simulados vinculada diretamente à turma presencial referenciada.'
  }
];

export const isNativePlanTabHidden = (
  plan: Partial<Plan> | null | undefined,
  tabId: NativePlanTabId
): boolean => {
  if (!plan) return false;
  if (tabId === 'CALL' && plan.isChatDisabled) return true;
  return Array.isArray(plan.hiddenTabs) && plan.hiddenTabs.includes(tabId);
};

export const isPresentialIntegrationActive = (
  plan: Partial<Plan> | null | undefined
): boolean => {
  return Boolean(
    plan?.linkedPresentialConfig?.enabled &&
      plan?.linkedPresentialConfig?.classId &&
      plan.linkedPresentialConfig.classId.trim() !== ''
  );
};

export const isPresentialTabShared = (
  plan: Partial<Plan> | null | undefined,
  key: PlanPresentialSharedTabKey
): boolean => {
  if (!isPresentialIntegrationActive(plan)) return false;
  return Boolean(plan?.linkedPresentialConfig?.sharedTabs?.[key]?.enabled);
};

export const getPresentialTabLabel = (
  plan: Partial<Plan> | null | undefined,
  key: PlanPresentialSharedTabKey
): string => {
  const custom = plan?.linkedPresentialConfig?.sharedTabs?.[key]?.label?.trim();
  if (custom) return custom.toUpperCase();
  const meta = PRESENTIAL_SHARED_TABS_META.find((m) => m.key === key);
  return meta ? meta.defaultLabel : key.toUpperCase();
};

export const getPresentialKeyFromQueryTab = (
  queryTab: string | null | undefined
): PlanPresentialSharedTabKey | null => {
  if (!queryTab) return null;
  const found = PRESENTIAL_SHARED_TABS_META.find((m) => m.queryTab === queryTab);
  return found ? found.key : null;
};

/**
 * Se a rotina nativa estiver desativada/oculta ou o plano usar o cronograma/metas
 * de uma turma presencial, o aluno NÃO deve ser redirecionado automaticamente para Mentoria
 * por causa de rotina semanal zerada.
 */
export const shouldBypassPlanRoutineOnboarding = (
  plan: Partial<Plan> | null | undefined
): boolean => {
  if (!plan) return false;
  if (isNativePlanTabHidden(plan, 'TODAY')) return true;
  if (isNativePlanTabHidden(plan, 'CONFIG')) return true;
  if (isNativePlanTabHidden(plan, 'MENTORSHIP')) return true;
  if (isPresentialTabShared(plan, 'dailyGoals') || isPresentialTabShared(plan, 'schedule')) {
    return true;
  }
  return false;
};

/**
 * Determina de forma segura a primeira rota/aba acessível de um Plano.
 */
export const getDefaultPlanLandingPath = (
  plan: Partial<Plan> | null | undefined
): string => {
  if (!plan) return '/app/dashboard';

  if (!isNativePlanTabHidden(plan, 'TODAY')) return '/app/dashboard';
  if (isPresentialTabShared(plan, 'dailyGoals')) return '/app/dashboard?tab=presential_daily';
  if (isPresentialTabShared(plan, 'schedule')) return '/app/dashboard?tab=presential_schedule';
  if (!isNativePlanTabHidden(plan, 'CALENDAR')) return '/app/calendar';
  if (isPresentialTabShared(plan, 'planning')) return '/app/dashboard?tab=presential_planning';
  if (!isNativePlanTabHidden(plan, 'EDICT')) return '/app/edict';
  if (!isNativePlanTabHidden(plan, 'MENTORSHIP')) return '/app/dashboard?tab=mentorship';
  if (isPresentialTabShared(plan, 'teaching')) return '/app/dashboard?tab=presential_teaching';

  const firstLinkedCourse = (plan.linkedCourses || []).find((lc) => lc.courseId);
  if (firstLinkedCourse) {
    return `/app/dashboard?tab=course_${firstLinkedCourse.courseId}`;
  }

  if (!isNativePlanTabHidden(plan, 'SIMULADOS')) return '/app/dashboard?tab=simulados';
  if (isPresentialTabShared(plan, 'simulados')) return '/app/dashboard?tab=presential_simulados';
  if (!isNativePlanTabHidden(plan, 'LIVE')) return '/app/dashboard?tab=live';
  if (isPresentialTabShared(plan, 'live')) return '/app/dashboard?tab=presential_live';
  if (!isNativePlanTabHidden(plan, 'CALL')) return '/app/dashboard?tab=call';
  if (!isNativePlanTabHidden(plan, 'CONFIG')) return '/app/config';

  return '/app/dashboard/planos';
};

/**
 * Verifica se a rota atual do aluno dentro da área do Plano está liberada
 * conforme as configurações de visibilidade e abas compartilhadas.
 */
export const isCurrentPlanLocationAllowed = (
  plan: Partial<Plan> | null | undefined,
  pathname: string,
  activeTabParam: string | null
): boolean => {
  if (!plan) return true;

  if (pathname === '/app/calendar') {
    return !isNativePlanTabHidden(plan, 'CALENDAR');
  }
  if (pathname === '/app/edict' || pathname === '/app/edital') {
    return !isNativePlanTabHidden(plan, 'EDICT');
  }
  if (pathname === '/app/config') {
    return !isNativePlanTabHidden(plan, 'CONFIG');
  }

  if (pathname === '/app/dashboard') {
    if (!activeTabParam) {
      return !isNativePlanTabHidden(plan, 'TODAY');
    }
    if (activeTabParam === 'mentorship') {
      return !isNativePlanTabHidden(plan, 'MENTORSHIP');
    }
    if (activeTabParam === 'call') {
      return !isNativePlanTabHidden(plan, 'CALL');
    }
    if (activeTabParam === 'simulados') {
      return !isNativePlanTabHidden(plan, 'SIMULADOS');
    }
    if (activeTabParam === 'live') {
      return !isNativePlanTabHidden(plan, 'LIVE');
    }
    if (activeTabParam.startsWith('presential_')) {
      const key = getPresentialKeyFromQueryTab(activeTabParam);
      return key ? isPresentialTabShared(plan, key) : false;
    }
    if (activeTabParam.startsWith('course_')) {
      const courseId = activeTabParam.replace('course_', '');
      return Boolean((plan.linkedCourses || []).some((lc) => lc.courseId === courseId));
    }
  }

  return true;
};
