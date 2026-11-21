export type GuidedStudyMetaType =
  | 'aula'
  | 'material'
  | 'questoes'
  | 'lei_seca'
  | 'flashcards'
  | 'resumo'
  | 'interactive_map';

export interface GuidedStudyVideo {
  id?: string;
  title: string;
  link: string;
  pandaVideoId?: string;
  duration: number; // minutos
}

export interface GuidedStudyModuleLink {
  subjectId: string;
  topicId: string;
  moduleId: string;
  subjectName?: string;
  topicName?: string;
  moduleName?: string;
}

export interface GuidedStudyFlashcard {
  id: string;
  front: string;
  back: string;
}

export interface GuidedStudyInteractiveMapSummary {
  disciplina: string;
  assunto: string;
  nodeCount: number;
  matrixCount: number;
  questionCount: number;
  flashcardCount: number;
}

export interface GuidedStudyMeta {
  id?: string;
  classId: string;
  date: string; // YYYY-MM-DD
  type: GuidedStudyMetaType;
  title: string;
  description?: string;
  disciplineName?: string;
  duration?: number; // minutos estimados
  order?: number; // ordem de exibição dentro do dia
  color?: string; // Cor customizada ou preset hex (#3b82f6)

  // Lesson (Panda Video - legado single-video + suporte multi-vídeos)
  pandaVideoUrl?: string;
  pandaVideoId?: string;
  videos?: GuidedStudyVideo[];

  // Material / Shared PDF & Links
  pdfUrl?: string;
  pdfName?: string;
  externalLink?: string;

  // Questions / Law / Flashcard / Summary
  questionCount?: number;
  articles?: string;
  cards?: GuidedStudyFlashcard[];

  // Vínculo opcional com módulos do Planejamento Pedagógico (aba Disciplinas)
  linkedModules?: GuidedStudyModuleLink[];

  // Mapa / Revisão Interativa (.JSON)
  interactiveMapJson?: string | null;
  interactiveMapUrl?: string | null;
  interactiveMapFileName?: string | null;
  interactiveMapSummary?: GuidedStudyInteractiveMapSummary | null;

  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface GuidedStudyProgress {
  completed: boolean;
  completedAt?: string | null;
  recordedMinutes?: number;
}

const DEFAULT_PANDA_EMBED_BASE = 'https://player-vz-226f9de3-772.tv.pandavideo.com.br/embed/?v=';

export const resolveGuidedStudyVideoUrl = (link?: string, pandaVideoId?: string): string => {
  const cleanLink = (link || '').trim();
  if (cleanLink) {
    if (/^https?:\/\//i.test(cleanLink) || cleanLink.startsWith('//')) {
      return cleanLink;
    }
    return `${DEFAULT_PANDA_EMBED_BASE}${cleanLink}`;
  }

  const cleanId = (pandaVideoId || '').trim();
  if (cleanId) {
    if (/^https?:\/\//i.test(cleanId) || cleanId.startsWith('//')) {
      return cleanId;
    }
    return `${DEFAULT_PANDA_EMBED_BASE}${cleanId}`;
  }

  return '';
};

export const getGuidedMetaVideos = (meta?: GuidedStudyMeta | null): GuidedStudyVideo[] => {
  if (!meta) return [];

  if (Array.isArray(meta.videos) && meta.videos.length > 0) {
    const normalized = meta.videos
      .map((video, idx) => {
        const resolvedLink = resolveGuidedStudyVideoUrl(video?.link, video?.pandaVideoId);
        if (!resolvedLink) return null;
        return {
          id: video?.id || `video_${idx}`,
          title: (video?.title || '').trim() || `Aula ${idx + 1}`,
          link: resolvedLink,
          pandaVideoId: (video?.pandaVideoId || '').trim(),
          duration: Math.max(0, Math.round(Number(video?.duration) || 0))
        } as GuidedStudyVideo;
      })
      .filter((video): video is GuidedStudyVideo => video !== null);

    if (normalized.length > 0) {
      return normalized;
    }
  }

  const legacyLink = resolveGuidedStudyVideoUrl(meta.pandaVideoUrl, meta.pandaVideoId);
  if (legacyLink) {
    return [
      {
        id: 'legacy_video_0',
        title: (meta.title || '').trim() || 'Videoaula',
        link: legacyLink,
        pandaVideoId: (meta.pandaVideoId || '').trim(),
        duration: Math.max(0, Math.round(Number(meta.duration) || 0))
      }
    ];
  }

  return [];
};

const getSortableTimestamp = (val: unknown): number => {
  if (!val) return 0;
  if (typeof val === 'string') {
    const parsed = Date.parse(val);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof val === 'number') return val;
  if (typeof val === 'object' && val !== null) {
    const record = val as { seconds?: number; toMillis?: () => number };
    if (typeof record.toMillis === 'function') return record.toMillis();
    if (typeof record.seconds === 'number') return record.seconds * 1000;
  }
  return 0;
};

export const compareGuidedMetasWithinDay = (a: GuidedStudyMeta, b: GuidedStudyMeta): number => {
  const orderA = typeof a.order === 'number' && Number.isFinite(a.order) ? a.order : Number.MAX_SAFE_INTEGER;
  const orderB = typeof b.order === 'number' && Number.isFinite(b.order) ? b.order : Number.MAX_SAFE_INTEGER;
  if (orderA !== orderB) return orderA - orderB;

  const timeA = getSortableTimestamp(a.createdAt);
  const timeB = getSortableTimestamp(b.createdAt);
  if (timeA !== timeB) return timeA - timeB;

  return (a.id || '').localeCompare(b.id || '');
};

export const sortGuidedMetas = (metas: GuidedStudyMeta[]): GuidedStudyMeta[] => {
  return [...metas].sort((a, b) => {
    const dateDiff = (a.date || '').localeCompare(b.date || '');
    if (dateDiff !== 0) return dateDiff;
    return compareGuidedMetasWithinDay(a, b);
  });
};

export const getGuidedMetasForModule = (
  metas: GuidedStudyMeta[],
  moduleId: string
): GuidedStudyMeta[] => {
  if (!moduleId || !Array.isArray(metas) || metas.length === 0) return [];
  return sortGuidedMetas(
    metas.filter(meta =>
      Array.isArray(meta.linkedModules) &&
      meta.linkedModules.some(link => link.moduleId === moduleId)
    )
  );
};

export type GuidedModuleAdminStatus = 'UNSCHEDULED' | 'SCHEDULED' | 'DELIVERED';

export const getGuidedModuleAdminStatus = (
  linkedMetas: GuidedStudyMeta[],
  todayIso: string
): GuidedModuleAdminStatus => {
  if (!linkedMetas || linkedMetas.length === 0) return 'UNSCHEDULED';
  const allReachedDate = linkedMetas.every(meta => Boolean(meta.date) && meta.date <= todayIso);
  return allReachedDate ? 'DELIVERED' : 'SCHEDULED';
};

export type GuidedModuleStudentStatus =
  | 'UNSCHEDULED'
  | 'SCHEDULED'
  | 'AVAILABLE'
  | 'IN_PROGRESS'
  | 'COMPLETED';

export const getGuidedModuleStudentStatus = (
  linkedMetas: GuidedStudyMeta[],
  studentProgress: Record<string, GuidedStudyProgress>,
  todayIso: string
): { status: GuidedModuleStudentStatus; completedCount: number; totalCount: number } => {
  const totalCount = linkedMetas?.length || 0;
  if (totalCount === 0) {
    return { status: 'UNSCHEDULED', completedCount: 0, totalCount: 0 };
  }

  const completedCount = linkedMetas.filter(
    meta => Boolean(meta.id && studentProgress[meta.id]?.completed)
  ).length;

  if (completedCount === totalCount) {
    return { status: 'COMPLETED', completedCount, totalCount };
  }
  if (completedCount > 0) {
    return { status: 'IN_PROGRESS', completedCount, totalCount };
  }
  const hasAnyAvailable = linkedMetas.some(meta => Boolean(meta.date) && meta.date <= todayIso);
  return {
    status: hasAnyAvailable ? 'AVAILABLE' : 'SCHEDULED',
    completedCount: 0,
    totalCount
  };
};

export interface EncounterSummaryItem {
  key: string;
  date: string;
  kind: 'CLASS_SHIFT' | 'GUIDED_STUDY';
  shift?: string;
  encounterNumber: number;
  isOverflow: boolean;
  isCompleted: boolean;
}

export interface EncounterMapResult {
  items: EncounterSummaryItem[];
  byShiftKey: Map<string, EncounterSummaryItem>; // `${date}::${shift}`
  byGuidedDate: Map<string, EncounterSummaryItem>; // `${date}`
  totalEncounters: number;
  completedEncounters: number;
  completedClassEncounters: number;
  completedGuidedEncounters: number;
  guidedOnlyEncountersCount: number;
}

const SHIFT_SORT_ORDER: Record<string, number> = {
  MORNING: 0,
  AFTERNOON: 1,
  NIGHT: 2
};

/**
 * Unifica a contagem de encontros da turma considerando:
 * 1) Turnos com aulas presenciais / ao vivo (excluindo simulados e cancelados);
 * 2) Dias com metas de Estudo Guiado sem aula presencial/ao vivo no mesmo dia
 *    (cada dia com Estudo Guiado contabiliza 1 encontro, independente da quantidade de metas).
 */
export const computeClassEncounterMap = (
  events: Array<{
    date: string;
    shift?: string;
    status?: string;
    eventType?: string;
  }>,
  guidedMetas: GuidedStudyMeta[],
  options: {
    defaultShift?: string;
    totalMeetings?: number;
    todayIso: string;
    includeGuidedStudy?: boolean;
  }
): EncounterMapResult => {
  const {
    defaultShift = 'NIGHT',
    totalMeetings = 0,
    todayIso,
    includeGuidedStudy = true
  } = options;

  const regularEventsByShiftKey = new Map<
    string,
    { date: string; shift: string; events: typeof events }
  >();
  const datesWithRegularClass = new Set<string>();

  (events || []).forEach(ev => {
    if (!ev?.date) return;
    if (ev.status === 'CANCELED') return;
    if (ev.eventType === 'SIMULADO') return;

    const shift = ev.shift || defaultShift || 'NIGHT';
    const key = `${ev.date}::${shift}`;
    datesWithRegularClass.add(ev.date);

    if (!regularEventsByShiftKey.has(key)) {
      regularEventsByShiftKey.set(key, { date: ev.date, shift, events: [] });
    }
    regularEventsByShiftKey.get(key)!.events.push(ev);
  });

  const guidedDatesMap = new Map<string, GuidedStudyMeta[]>();
  if (includeGuidedStudy) {
    (guidedMetas || []).forEach(meta => {
      if (!meta?.date) return;
      if (!guidedDatesMap.has(meta.date)) {
        guidedDatesMap.set(meta.date, []);
      }
      guidedDatesMap.get(meta.date)!.push(meta);
    });
  }

  const rawUnits: Array<{
    key: string;
    date: string;
    kind: 'CLASS_SHIFT' | 'GUIDED_STUDY';
    shift?: string;
    sortRank: number;
    isCompleted: boolean;
  }> = [];

  regularEventsByShiftKey.forEach((group, shiftKey) => {
    rawUnits.push({
      key: `shift::${shiftKey}`,
      date: group.date,
      kind: 'CLASS_SHIFT',
      shift: group.shift,
      sortRank: SHIFT_SORT_ORDER[group.shift] ?? 3,
      isCompleted: group.events.length > 0 && group.events.every(e => e.status === 'COMPLETED')
    });
  });

  guidedDatesMap.forEach((dayMetas, dateStr) => {
    // Se já há encontro presencial/ao vivo neste dia, não duplica a contagem do encontro no mesmo dia
    if (datesWithRegularClass.has(dateStr)) return;
    rawUnits.push({
      key: `guided::${dateStr}`,
      date: dateStr,
      kind: 'GUIDED_STUDY',
      sortRank: 4,
      isCompleted: dayMetas.length > 0 && dateStr <= todayIso
    });
  });

  rawUnits.sort((a, b) => {
    const dateDiff = a.date.localeCompare(b.date);
    if (dateDiff !== 0) return dateDiff;
    return a.sortRank - b.sortRank;
  });

  const byShiftKey = new Map<string, EncounterSummaryItem>();
  const byGuidedDate = new Map<string, EncounterSummaryItem>();
  let completedClassEncounters = 0;
  let completedGuidedEncounters = 0;
  let guidedOnlyEncountersCount = 0;

  const items: EncounterSummaryItem[] = rawUnits.map((unit, idx) => {
    const encounterNumber = idx + 1;
    const item: EncounterSummaryItem = {
      key: unit.key,
      date: unit.date,
      kind: unit.kind,
      shift: unit.shift,
      encounterNumber,
      isOverflow: totalMeetings > 0 && encounterNumber > totalMeetings,
      isCompleted: unit.isCompleted
    };

    if (unit.kind === 'CLASS_SHIFT' && unit.shift) {
      byShiftKey.set(`${unit.date}::${unit.shift}`, item);
      if (unit.isCompleted) completedClassEncounters++;
    } else if (unit.kind === 'GUIDED_STUDY') {
      byGuidedDate.set(unit.date, item);
      guidedOnlyEncountersCount++;
      if (unit.isCompleted) completedGuidedEncounters++;
    }

    return item;
  });

  return {
    items,
    byShiftKey,
    byGuidedDate,
    totalEncounters: items.length,
    completedEncounters: completedClassEncounters + completedGuidedEncounters,
    completedClassEncounters,
    completedGuidedEncounters,
    guidedOnlyEncountersCount
  };
};



