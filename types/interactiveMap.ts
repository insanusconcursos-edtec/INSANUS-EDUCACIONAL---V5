/**
 * Tipos e Contratos para o Conteúdo Interativo: MAPA / REVISÃO (INTERACTIVE_MAP)
 */

export type MindmapNodeColor = 'navy' | 'royal' | 'green' | 'red' | 'amber';

export interface MindmapBlock {
  id?: string;
  type: 'visao' | 'lei' | 'exemplo' | 'atencao' | 'lista' | 'livre';
  title?: string;
  html: string;
}

export interface MindmapKeyNumber {
  label: string;
  value: string;
}

export interface MindmapNodeDetail {
  resumo?: string;
  lei_seca?: string[];
  checklist?: string[];
  exemplo?: string;
  pegadinha?: string;
  key_numbers?: MindmapKeyNumber[];
  blocks?: MindmapBlock[];
}

export interface MindmapNode {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  color?: MindmapNodeColor;
  bateria_id?: number | string;
  detail?: MindmapNodeDetail;
  children?: MindmapNode[];
}

export interface MatrixColumn {
  label: string;
  tone?: MindmapNodeColor;
}

export interface InteractiveMatrix {
  id: string;
  title: string;
  subtitle?: string;
  columns: MatrixColumn[];
  rows: string[][];
  callout?: string;
}

export interface InteractiveBateria {
  id: number | string;
  titulo: string;
}

export interface InteractiveQuestao {
  numero: number;
  bateria_id: number | string;
  banca?: string;
  enunciado?: string;
  enunciation?: string;
  alternativas?: Record<string, string>; // { A: "...", B: "...", ... }
  options?: Record<string, string>;
  gabarito: string; // "A", "B", etc.
  comentario?: string;
}

export interface InteractiveFlashcard {
  id: string;
  bateria_id?: number | string;
  topic?: string;
  front: string;
  back: string;
  article?: string;
}

export interface InteractiveMapMeta {
  disciplina?: string;
  assunto?: string;
  banca?: string;
  titulo?: string;
  subtitulo?: string;
}

export interface InteractiveMapData {
  meta: InteractiveMapMeta;
  mindmap: MindmapNode;
  matrices?: InteractiveMatrix[];
  baterias?: InteractiveBateria[];
  questoes?: InteractiveQuestao[];
  flashcards?: InteractiveFlashcard[];
}

export interface QuestionAttempt {
  selected: string;
  isCorrect: boolean;
  timestamp: number;
}

export interface QuestionAnswerData {
  selected: string;
  revealed: boolean;
  eliminated?: string[];
  attempts?: QuestionAttempt[];
  lastIsCorrect?: boolean;
}

export interface BatteryTestHistoryItem {
  id: string;
  bateriaId: number | string;
  bateriaTitulo?: string;
  date: string;
  timestamp: number;
  answered: number;
  total: number;
  correct: number;
  wrong: number;
  accuracy: number;
}

export interface InteractiveMapStudentProgress {
  completedNodeIds: string[];
  questionAnswers: Record<number, QuestionAnswerData>;
  flashcardStatus: Record<string, 'mastered' | 'review'>;
  testHistory?: BatteryTestHistoryItem[];
  lastUpdated?: string;
}
