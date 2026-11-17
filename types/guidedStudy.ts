export type GuidedStudyMetaType =
  | 'aula'
  | 'material'
  | 'questoes'
  | 'lei_seca'
  | 'flashcards'
  | 'resumo'
  | 'interactive_map';

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
  color?: string; // Cor customizada ou preset hex (#3b82f6)

  // Lesson (Panda Video)
  pandaVideoUrl?: string;
  pandaVideoId?: string;

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
