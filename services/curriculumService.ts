import { db } from './firebase';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  deleteField,
} from 'firebase/firestore';
import { Subject, SubjectGroup, Topic } from '../types/curriculum';

const CLASSES_COLLECTION = 'classes';
const SUBJECTS_COLLECTION = 'subjects';
const TOPICS_COLLECTION = 'topics';

export const curriculumService = {
  // --- SUBJECTS ---
  createSubject: async (subjectData: Omit<Subject, 'id'>): Promise<string> => {
    try {
      const payload: Record<string, any> = {
        ...subjectData,
        order: subjectData.order ?? Date.now(),
        createdAt: new Date().toISOString(),
      };
      Object.keys(payload).forEach((key) => {
        if (payload[key] === undefined) {
          delete payload[key];
        }
      });

      const docRef = await addDoc(collection(db, SUBJECTS_COLLECTION), payload);
      return docRef.id;
    } catch (error) {
      console.error("Error creating subject: ", error);
      throw error;
    }
  },

  getSubjectsByClass: async (classId: string): Promise<Subject[]> => {
    try {
      const q = query(
        collection(db, SUBJECTS_COLLECTION), 
        where("classId", "==", classId)
      );
      const querySnapshot = await getDocs(q);
      const subjects: Subject[] = [];
      querySnapshot.forEach((docSnap) => {
        subjects.push({ id: docSnap.id, ...docSnap.data() } as Subject);
      });
      return subjects.sort((a, b) => (a.order || 0) - (b.order || 0));
    } catch (error) {
      console.error("Error fetching subjects: ", error);
      throw error;
    }
  },

  updateSubject: async (id: string, data: Partial<Subject>): Promise<void> => {
    try {
      const sanitized: Record<string, any> = { ...data };
      Object.keys(sanitized).forEach((key) => {
        if (sanitized[key] === undefined) {
          sanitized[key] = deleteField();
        }
      });
      const docRef = doc(db, SUBJECTS_COLLECTION, id);
      await updateDoc(docRef, sanitized);
    } catch (error) {
      console.error("Error updating subject: ", error);
      throw error;
    }
  },

  deleteSubject: async (id: string): Promise<void> => {
    try {
      await deleteDoc(doc(db, SUBJECTS_COLLECTION, id));
    } catch (error) {
      console.error("Error deleting subject: ", error);
      throw error;
    }
  },

  updateSubjectOrders: async (subjects: { id: string; order: number; groupId?: string | null }[]) => {
    try {
      const batch = writeBatch(db);
      subjects.forEach(({ id, order, groupId }) => {
        const subjectRef = doc(db, SUBJECTS_COLLECTION, id);
        const updatePayload: Record<string, any> = { order };
        if (groupId !== undefined) {
          updatePayload.groupId = groupId;
        }
        batch.update(subjectRef, updatePayload);
      });
      await batch.commit();
    } catch (error) {
      console.error("Error updating subject orders:", error);
      throw error;
    }
  },

  batchSetSubjectsGroup: async (updates: { id: string; groupId: string | null }[]): Promise<void> => {
    if (updates.length === 0) return;
    try {
      const batch = writeBatch(db);
      updates.forEach(({ id, groupId }) => {
        const subjectRef = doc(db, SUBJECTS_COLLECTION, id);
        batch.update(subjectRef, { groupId });
      });
      await batch.commit();
    } catch (error) {
      console.error("Error updating subject groups in batch:", error);
      throw error;
    }
  },

  // --- TOPICS ---
  createTopic: async (topicData: Omit<Topic, 'id'>): Promise<string> => {
    try {
      const docRef = await addDoc(collection(db, TOPICS_COLLECTION), {
        ...topicData,
        order: topicData.order ?? Date.now(),
        createdAt: new Date().toISOString()
      });
      return docRef.id;
    } catch (error) {
      console.error("Error creating topic: ", error);
      throw error;
    }
  },

  getTopicsByClass: async (classId: string): Promise<Topic[]> => {
    try {
      const q = query(
        collection(db, TOPICS_COLLECTION), 
        where("classId", "==", classId)
      );
      const querySnapshot = await getDocs(q);
      const topics: Topic[] = [];
      querySnapshot.forEach((docSnap) => {
        topics.push({ id: docSnap.id, ...docSnap.data() } as Topic);
      });
      return topics.sort((a, b) => (a.order || 0) - (b.order || 0));
    } catch (error) {
      console.error("Error fetching topics: ", error);
      throw error;
    }
  },

  updateTopic: async (id: string, data: Partial<Topic>): Promise<void> => {
    try {
      const docRef = doc(db, TOPICS_COLLECTION, id);
      await updateDoc(docRef, data);
    } catch (error) {
      console.error("Error updating topic: ", error);
      throw error;
    }
  },

  deleteTopic: async (id: string): Promise<void> => {
    try {
      await deleteDoc(doc(db, TOPICS_COLLECTION, id));
    } catch (error) {
      console.error("Error deleting topic: ", error);
      throw error;
    }
  },

  updateTopicOrders: async (topics: {id: string, order: number}[]): Promise<void> => {
    try {
      const batch = writeBatch(db);
      topics.forEach(topic => {
        const topicRef = doc(db, TOPICS_COLLECTION, topic.id);
        batch.update(topicRef, { order: topic.order });
      });
      await batch.commit();
    } catch (error) {
      console.error("Error updating topic orders: ", error);
      throw error;
    }
  },

  cloneCurriculum: async (sourceClassId: string, targetClassId: string): Promise<void> => {
    try {
      const [sourceClassSnap, targetClassSnap, subjectsSnapshot, topicsSnapshot] = await Promise.all([
        getDoc(doc(db, CLASSES_COLLECTION, sourceClassId)),
        getDoc(doc(db, CLASSES_COLLECTION, targetClassId)),
        getDocs(query(collection(db, SUBJECTS_COLLECTION), where("classId", "==", sourceClassId))),
        getDocs(query(collection(db, TOPICS_COLLECTION), where("classId", "==", sourceClassId))),
      ]);

      const sourceSubjects = subjectsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Subject));
      const sourceTopics = topicsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Topic));

      const batch = writeBatch(db);

      // Clonar grupos de disciplinas da Turma Mãe preservando a ordem e os vínculos
      const sourceGroups: SubjectGroup[] = Array.isArray(sourceClassSnap.data()?.subjectGroups)
        ? [...sourceClassSnap.data()!.subjectGroups].sort((a: SubjectGroup, b: SubjectGroup) => (a.order ?? 0) - (b.order ?? 0))
        : [];
      const existingTargetGroups: SubjectGroup[] = Array.isArray(targetClassSnap.data()?.subjectGroups)
        ? [...targetClassSnap.data()!.subjectGroups]
        : [];

      const groupIdMap = new Map<string, string>();
      if (sourceGroups.length > 0 && targetClassSnap.exists()) {
        const baseOrder = existingTargetGroups.length;
        const clonedGroups: SubjectGroup[] = sourceGroups.map((grp, idx) => {
          const newGroupId = `grp_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`;
          groupIdMap.set(grp.id, newGroupId);
          return {
            id: newGroupId,
            name: grp.name,
            order: baseOrder + idx,
            createdAt: new Date().toISOString(),
          };
        });

        batch.update(doc(db, CLASSES_COLLECTION, targetClassId), {
          subjectGroups: [...existingTargetGroups, ...clonedGroups],
          updatedAt: new Date().toISOString(),
        });
      }

      for (const subject of sourceSubjects) {
        const { id: oldSubjectId, ...subjectData } = subject;
        const newSubjectRef = doc(collection(db, SUBJECTS_COLLECTION));
        const newSubjectId = newSubjectRef.id;

        const mappedGroupId =
          subjectData.groupId && groupIdMap.has(subjectData.groupId)
            ? groupIdMap.get(subjectData.groupId)!
            : null;

        const newSubjectPayload: Record<string, any> = {
          ...subjectData,
          classId: targetClassId,
          groupId: mappedGroupId,
          createdAt: new Date().toISOString(),
        };
        Object.keys(newSubjectPayload).forEach((k) => {
          if (newSubjectPayload[k] === undefined) delete newSubjectPayload[k];
        });

        batch.set(newSubjectRef, newSubjectPayload);

        // Find topics for this subject and clone them
        const subjectTopics = sourceTopics.filter(t => t.subjectId === oldSubjectId);
        for (const topic of subjectTopics) {
          const { id: _oldTopicId, ...topicData } = topic;
          const newTopicRef = doc(collection(db, TOPICS_COLLECTION));
          const newTopicPayload: Record<string, any> = {
            ...topicData,
            classId: targetClassId,
            subjectId: newSubjectId,
            createdAt: new Date().toISOString(),
          };
          Object.keys(newTopicPayload).forEach((k) => {
            if (newTopicPayload[k] === undefined) delete newTopicPayload[k];
          });
          batch.set(newTopicRef, newTopicPayload);
        }
      }

      await batch.commit();
    } catch (error) {
      console.error("Error cloning curriculum: ", error);
      throw error;
    }
  }
};
