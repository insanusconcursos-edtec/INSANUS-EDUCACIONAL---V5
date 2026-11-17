export interface Folder {
  id: string;
  name: string;
  order: number;
}

export type CycleSystem = 'continuous' | 'rotative';

export interface CycleItem {
  id: string;
  type: 'discipline' | 'folder' | 'simulado';
  referenceId: string;
  topicsPerTurn: number;
  order: number;
  simuladoTitle?: string;
  duration?: number;
}

export interface Cycle {
  id: string;
  name: string;
  order: number;
  items: CycleItem[];
}

export interface LinkedCourse {
  courseId: string;
  tabName: string;
  visibleTabs: string[];
}

export type NativePlanTabId =
  | 'TODAY'
  | 'CALENDAR'
  | 'EDICT'
  | 'MENTORSHIP'
  | 'CALL'
  | 'SIMULADOS'
  | 'LIVE'
  | 'CONFIG';

export type PlanPresentialSharedTabKey =
  | 'dailyGoals'
  | 'schedule'
  | 'planning'
  | 'teaching'
  | 'live'
  | 'simulados';

export interface PlanPresentialSharedTabConfig {
  enabled?: boolean;
  label?: string;
}

export interface PlanLinkedPresentialConfig {
  enabled?: boolean;
  classId?: string | null;
  sharedTabs?: Partial<Record<PlanPresentialSharedTabKey, PlanPresentialSharedTabConfig>>;
}

export interface Plan {
  id?: string;
  title: string;
  imageUrl: string;
  banners?: {
    today: { desktop: string; tablet: string; mobile: string };
    calendar: { desktop: string; tablet: string; mobile: string };
    edict: { desktop: string; tablet: string; mobile: string };
    mentorship: { desktop: string; tablet: string; mobile: string };
  };
  category: string;
  subcategory: string;
  organ: string;
  purchaseLink: string;
  folders?: Folder[];
  cycleSystem?: CycleSystem;
  cycles?: Cycle[];
  isEdictEnabled?: boolean;
  isActiveUserMode?: boolean;
  linkedSimuladoClassId?: string;
  simuladosVinculados?: string[];
  linkedMentors?: string[]; // IDs dos mentores vinculados
  linkedCourses?: LinkedCourse[]; // Cursos online vinculados com abas customizadas
  hiddenTabs?: NativePlanTabId[]; // Abas nativas ocultadas pelo administrador
  linkedPresentialConfig?: PlanLinkedPresentialConfig; // Vinculação de abas e recursos de Turma Presencial
  isGenerationBlocked?: boolean;
  isChatDisabled?: boolean;
  createdAt?: any;
  lastModifiedAt?: any;
  lastSyncedAt?: any;
  themeColor?: string;
  published?: boolean;
  draftWhitelist?: string[];
  excludeFromFreePass?: boolean;
  isBlocked?: boolean;
  unlockDate?: string | null;
}

