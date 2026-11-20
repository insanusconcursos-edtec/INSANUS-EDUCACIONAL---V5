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


