import { 
  collection, 
  getDocs, 
  doc, 
  query, 
  where, 
  setDoc, 
  deleteDoc, 
  getDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from './firebase';
import { GuidedStudyMeta, GuidedStudyProgress } from '../types/guidedStudy';

const COLLECTION_METAS = 'class_guided_metas';

export const guidedStudyService = {
  /**
   * Buscas todas as metas do Estudo Guiado cadastradas para uma turma presencial
   */
  async getMetasByClass(classId: string): Promise<GuidedStudyMeta[]> {
    try {
      const q = query(
        collection(db, COLLECTION_METAS),
        where('classId', '==', classId)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      })) as GuidedStudyMeta[];
    } catch (error) {
      console.error('Erro ao buscar metas do estudo guiado:', error);
      return [];
    }
  },

  /**
   * Salva (cria ou atualiza) uma meta do Estudo Guiado
   */
  async saveMeta(meta: GuidedStudyMeta): Promise<GuidedStudyMeta> {
    try {
      const collectionRef = collection(db, COLLECTION_METAS);
      const docRef = meta.id ? doc(db, COLLECTION_METAS, meta.id) : doc(collectionRef);
      
      const payload: GuidedStudyMeta = {
        ...meta,
        id: docRef.id,
        updatedAt: new Date().toISOString(),
        createdAt: meta.createdAt || new Date().toISOString()
      };

      await setDoc(docRef, payload, { merge: true });
      return payload;
    } catch (error) {
      console.error('Erro ao salvar meta do estudo guiado:', error);
      throw error;
    }
  },

  /**
   * Deleta uma meta do Estudo Guiado
   */
  async deleteMeta(metaId: string): Promise<void> {
    try {
      const docRef = doc(db, COLLECTION_METAS, metaId);
      await deleteDoc(docRef);
    } catch (error) {
      console.error('Erro ao deletar meta do estudo guiado:', error);
      throw error;
    }
  },

  /**
   * Obtém o progresso do aluno nas metas de uma turma presencial
   */
  async getStudentProgress(userId: string, classId: string): Promise<Record<string, GuidedStudyProgress>> {
    if (!userId || !classId) return {};
    try {
      const docRef = doc(db, `users/${userId}/presential_progress`, classId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data() as Record<string, GuidedStudyProgress>;
      }
      return {};
    } catch (error) {
      console.error('Erro ao buscar progresso do aluno:', error);
      return {};
    }
  },

  /**
   * Registra a conclusão / desmarcação de uma meta de Estudo Guiado pelo aluno
   */
  async toggleMetaProgress(
    userId: string, 
    classId: string, 
    metaId: string, 
    completed: boolean, 
    recordedMinutes: number = 0
  ): Promise<void> {
    if (!userId || !classId || !metaId) return;
    try {
      const docRef = doc(db, `users/${userId}/presential_progress`, classId);
      const updateData = {
        [metaId]: {
          completed,
          completedAt: completed ? new Date().toISOString() : null,
          recordedMinutes
        }
      };
      await setDoc(docRef, updateData, { merge: true });
    } catch (error) {
      console.error('Erro ao atualizar progresso da meta:', error);
      throw error;
    }
  }
};
