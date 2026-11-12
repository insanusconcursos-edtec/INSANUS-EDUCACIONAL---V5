import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { InteractiveMapStudentProgress } from '../types/interactiveMap';

const COLLECTION_NAME = 'interactive_map_progress';

function getStorageKey(userId: string, lessonId: string, contentId: string): string {
  return `insanus_map_progress_${userId}_${lessonId}_${contentId}`;
}

const DEFAULT_PROGRESS: InteractiveMapStudentProgress = {
  completedNodeIds: [],
  questionAnswers: {},
  flashcardStatus: {},
  testHistory: []
};

export const interactiveMapProgressService = {
  /**
   * Obtém o progresso do estudante para uma aula e conteúdo específicos
   */
  async getProgress(
    userId: string,
    lessonId: string,
    contentId: string
  ): Promise<InteractiveMapStudentProgress> {
    if (!userId || !contentId) return { ...DEFAULT_PROGRESS };

    const docId = `${userId}_${lessonId}_${contentId}`;
    const storageKey = getStorageKey(userId, lessonId, contentId);

    // 1. Tenta carregar do localStorage primeiro para resposta instantânea
    let localData: InteractiveMapStudentProgress | null = null;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        localData = JSON.parse(stored);
      }
    } catch (e) {
      // Ignora erro de localStorage
    }

    // 2. Busca do Firestore para sincronização
    try {
      const ref = doc(db, COLLECTION_NAME, docId);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        const firestoreData = snap.data() as InteractiveMapStudentProgress;
        const merged: InteractiveMapStudentProgress = {
          completedNodeIds: Array.from(new Set([
            ...(localData?.completedNodeIds || []),
            ...(firestoreData.completedNodeIds || [])
          ])),
          questionAnswers: {
            ...(localData?.questionAnswers || {}),
            ...(firestoreData.questionAnswers || {})
          },
          flashcardStatus: {
            ...(localData?.flashcardStatus || {}),
            ...(firestoreData.flashcardStatus || {})
          },
          testHistory: firestoreData.testHistory || localData?.testHistory || [],
          lastUpdated: firestoreData.lastUpdated || new Date().toISOString()
        };

        // Atualiza cache local
        try {
          localStorage.setItem(storageKey, JSON.stringify(merged));
        } catch (e) {
          console.warn('[INTERACTIVE_MAP] Falha ao atualizar localStorage:', e);
        }

        return merged;
      }
    } catch (error) {
      console.warn('[INTERACTIVE_MAP] Fallback para progresso local devido a falha no Firestore:', error);
    }

    return localData || { ...DEFAULT_PROGRESS };
  },

  /**
   * Salva o progresso do estudante
   */
  async saveProgress(
    userId: string,
    lessonId: string,
    contentId: string,
    progress: Partial<InteractiveMapStudentProgress>
  ): Promise<void> {
    if (!userId || !contentId) return;

    const docId = `${userId}_${lessonId}_${contentId}`;
    const storageKey = getStorageKey(userId, lessonId, contentId);
    const now = new Date().toISOString();

    // 1. Atualização imediata no localStorage
    try {
      const current = localStorage.getItem(storageKey);
      const parsed = current ? JSON.parse(current) : { ...DEFAULT_PROGRESS };
      const updated: InteractiveMapStudentProgress = {
        ...parsed,
        ...progress,
        lastUpdated: now
      };
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch (e) {
      console.warn('[INTERACTIVE_MAP] Falha ao gravar localStorage:', e);
    }

    // 2. Sincroniza em background no Firestore
    try {
      const ref = doc(db, COLLECTION_NAME, docId);
      await setDoc(
        ref,
        {
          userId,
          lessonId,
          contentId,
          ...progress,
          lastUpdated: now
        },
        { merge: true }
      );
    } catch (error) {
      console.warn('[INTERACTIVE_MAP] Erro ao sincronizar progresso no Firestore, mantido em localStorage:', error);
    }
  }
};
