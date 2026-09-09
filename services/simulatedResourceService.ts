import { 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  doc, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  getDoc
} from 'firebase/firestore';
import { db } from './firebase';
import { toPlainObject } from './firestoreUtils';
import { SimulatedExam, updateExamQuestions } from './simulatedService';
import { recalculateAttemptsForExam } from './simulatedAttemptService';

export type ResourceType = 'alterar_gabarito' | 'anular_questao';
export type ResourceStatus = 'pending' | 'accepted' | 'rejected' | 'accepted_summary';

export interface SimulatedResource {
  id?: string;
  classId: string;
  examId: string;
  examTitle: string;
  userId: string;
  userName: string;
  userEmail: string;
  userPhoto?: string;
  questionNumber: number;
  type: ResourceType;
  justification: string;
  status: ResourceStatus;
  adminResponse?: string;
  newAlternative?: string; // Only if type is alterar_gabarito and selected by student/admin
  createdAt?: any;
  updatedAt?: any;
}

/**
 * Submits a new resource appeal from a student
 */
export const submitResource = async (resourceData: Omit<SimulatedResource, 'id' | 'status' | 'createdAt' | 'updatedAt'>): Promise<string> => {
  const collectionRef = collection(db, 'simulated_resources');
  
  // Clean up undefined fields to avoid Firestore crashes (e.g. newAlternative is undefined)
  const cleanedData: any = {};
  Object.keys(resourceData).forEach((key) => {
    const value = (resourceData as any)[key];
    if (value !== undefined) {
      cleanedData[key] = value;
    }
  });

  const docRef = await addDoc(collectionRef, {
    ...cleanedData,
    status: 'pending' as ResourceStatus,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return docRef.id;
};

/**
 * Fetches all resources for a specific exam (Admin view)
 */
export const getResourcesForExam = async (examId: string): Promise<SimulatedResource[]> => {
  const q = query(
    collection(db, 'simulated_resources'),
    where('examId', '==', examId),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => toPlainObject({ id: doc.id, ...doc.data() }) as SimulatedResource);
};

/**
 * Fetches all resources submitted by a specific student for a specific exam
 */
export const getResourcesForStudent = async (userId: string, examId: string): Promise<SimulatedResource[]> => {
  const q = query(
    collection(db, 'simulated_resources'),
    where('examId', '==', examId),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => toPlainObject({ id: doc.id, ...doc.data() }) as SimulatedResource);
};

/**
 * Judges/Decides on a resource appeal
 */
export const judgeResource = async (
  resourceId: string,
  classId: string,
  exam: SimulatedExam,
  decision: 'INDEFERIR' | 'DEFERIR' | 'DEFERIR_SUMARIAMENTE',
  adminResponse: string,
  newAlternative?: string // Required if decision is DEFERIR and type is alterar_gabarito
): Promise<void> => {
  const resourceRef = doc(db, 'simulated_resources', resourceId);
  const resourceSnap = await getDoc(resourceRef);
  
  if (!resourceSnap.exists()) {
    throw new Error('Recurso não encontrado.');
  }

  const resourceData = resourceSnap.data() as SimulatedResource;
  const questionNumber = Number(resourceData.questionNumber);
  
  let finalStatus: ResourceStatus = 'pending';
  let updatedQuestions = [...(exam.questions || [])];

  if (decision === 'INDEFERIR') {
    finalStatus = 'rejected';
  } else if (decision === 'DEFERIR_SUMARIAMENTE' || decision === 'DEFERIR') {
    finalStatus = decision === 'DEFERIR_SUMARIAMENTE' ? 'accepted_summary' : 'accepted';

    // Apply the automatic changes based on resource type
    if (resourceData.type === 'anular_questao') {
      // Annul the question automatically
      updatedQuestions = updatedQuestions.map(q => 
        q.index === questionNumber ? { ...q, isAnnulled: true } : q
      );
    } else if (resourceData.type === 'alterar_gabarito') {
      const resolvedAlternative = newAlternative || resourceData.newAlternative;
      if (!resolvedAlternative) {
        throw new Error('Uma nova alternativa correta deve ser fornecida para alterar o gabarito.');
      }
      // Change the correct answer automatically
      updatedQuestions = updatedQuestions.map(q => 
        q.index === questionNumber ? { ...q, answer: resolvedAlternative, isAnnulled: false } : q
      );
    }
  }

  // 1. Update Resource Document
  const resourceUpdates: any = {
    status: finalStatus,
    updatedAt: serverTimestamp()
  };
  if (adminResponse.trim()) {
    resourceUpdates.adminResponse = adminResponse.trim();
  }
  const resolvedAlternative = newAlternative || resourceData.newAlternative;
  if ((decision === 'DEFERIR' || decision === 'DEFERIR_SUMARIAMENTE') && resourceData.type === 'alterar_gabarito' && resolvedAlternative) {
    resourceUpdates.newAlternative = resolvedAlternative;
  }
  await updateDoc(resourceRef, resourceUpdates);

  // 2. If Deferir or Deferir Sumariamente (Approved), update the Exam answers key and recalculate student scores
  if (decision === 'DEFERIR' || decision === 'DEFERIR_SUMARIAMENTE') {
    // Save updated questions to simulated subcollection
    await updateExamQuestions(classId, exam.id!, updatedQuestions);
    
    // Recalculate all student attempts for this exam with the updated questions
    const updatedExam: SimulatedExam = { ...exam, questions: updatedQuestions };
    await recalculateAttemptsForExam(classId, exam.id!, updatedExam);
  }

  // 3. Create a student notification
  if (resourceData.userId && resourceData.userId !== 'admin_correction') {
    try {
      const decisionText = decision === 'INDEFERIR' ? 'INDEFERIDO' : 'DEFERIDO';
      const detailText = decision === 'DEFERIR_SUMARIAMENTE' ? ' (Sumariamente)' : '';
      const title = 'Resultado de Recurso';
      const content = `Seu recurso para a Questão ${questionNumber} do simulado "${exam.title || 'Simulado'}" foi ${decisionText}${detailText} pela banca examinadora.`;
      
      await addDoc(collection(db, 'user_notifications'), {
        userId: resourceData.userId,
        type: 'simulated_resource',
        title,
        content,
        timestamp: Date.now(),
        read: false,
        data: {
          classId,
          examId: exam.id!,
          questionNumber,
          decision: decisionText
        }
      });
    } catch (notificationError) {
      console.error("Erro ao gerar notificação para o aluno:", notificationError);
    }
  }
};

/**
 * Creates an admin-initiated official correction (retificação oficial) directly
 * without needing an existing student resource.
 */
export const createAdminCorrection = async (
  classId: string,
  exam: SimulatedExam,
  questionNumber: number,
  type: ResourceType,
  justification: string,
  newAlternative?: string
): Promise<string> => {
  const collectionRef = collection(db, 'simulated_resources');
  
  // 1. Create a simulated resource document that is already 'accepted' (approved) and marked as official
  const resourceData: any = {
    classId,
    examId: exam.id!,
    examTitle: exam.title || '',
    userId: 'admin_correction',
    userName: 'BANCA EXAMINADORA',
    userEmail: 'admin@banca.com',
    questionNumber,
    type,
    justification,
    status: 'accepted' as ResourceStatus,
    adminResponse: justification,
    isOfficial: true,
  };

  if (type === 'alterar_gabarito' && newAlternative) {
    resourceData.newAlternative = newAlternative;
  }

  const docRef = await addDoc(collectionRef, {
    ...resourceData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  // 2. Apply the automatic changes based on correction type to the exam questions
  let updatedQuestions = [...(exam.questions || [])];
  if (type === 'anular_questao') {
    updatedQuestions = updatedQuestions.map(q => 
      q.index === questionNumber ? { ...q, isAnnulled: true } : q
    );
  } else if (type === 'alterar_gabarito') {
    if (!newAlternative) {
      throw new Error('Uma nova alternativa correta deve ser fornecida para alterar o gabarito.');
    }
    updatedQuestions = updatedQuestions.map(q => 
      q.index === questionNumber ? { ...q, answer: newAlternative, isAnnulled: false } : q
    );
  }

  // 3. Save updated questions and recalculate attempts
  await updateExamQuestions(classId, exam.id!, updatedQuestions);
  
  const updatedExam: SimulatedExam = { ...exam, questions: updatedQuestions };
  await recalculateAttemptsForExam(classId, exam.id!, updatedExam);

  return docRef.id;
};
