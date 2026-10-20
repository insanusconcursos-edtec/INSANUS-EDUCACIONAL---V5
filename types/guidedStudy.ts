export type GuidedStudyMetaType = 'aula' | 'material' | 'questoes' | 'lei_seca' | 'flashcards' | 'resumo';

export interface GuidedStudyFlashcard {
  id: string;
  front: string;
  back: string;
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

  createdAt?: any;
  updatedAt?: any;
}

export interface GuidedStudyProgress {
  completed: boolean;
  completedAt?: string;
  recordedMinutes?: number;
}
