
import { 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  limit,
  getDoc,
  updateDoc
} from 'firebase/firestore';
import { db } from './firebase';
import { ExamQuestion, SimulatedExam } from './simulatedService';
import { Student, updateStudent } from './userService';

export interface SimulatedAttempt {
  id?: string;
  userId: string;
  userPhoto?: string;
  userName: string; // Snapshot do nome/apelido no momento da prova
  simulatedId: string;
  simulatedTitle: string;
  classId?: string; // ID da turma
  userAnswers: Record<number, string>; // { 1: 'A', 2: 'C' }
  score: number;
  correctCount: number;
  wrongCount: number;
  blankCount: number;
  totalQuestions: number;
  maxPossibleScore?: number;
  isApproved: boolean;
  completedAt: any;
  autodiagnosis?: {
    analysis: Record<string, {
      strong: number;
      review: number;
      weak: number;
      topicsToStudy: string[];
      topicsToReview: string[];
    }>;
  };
}

/**
 * Verifica se o usuário já realizou este simulado.
 */
export const checkExistingAttempt = async (userId: string, simulatedId: string): Promise<SimulatedAttempt | null> => {
  const q = query(
    collection(db, 'simulated_attempts'),
    where('userId', '==', userId),
    where('simulatedId', '==', simulatedId),
    limit(1)
  );
  
  const snapshot = await getDocs(q);
  if (!snapshot.empty) {
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as SimulatedAttempt;
  }
  return null;
};

/**
 * Calcula a nota e salva a tentativa.
 */
export const submitExamAttempt = async (
  user: { uid: string; name: string; photoURL?: string; nickname?: string },
  exam: SimulatedExam,
  userAnswers: Record<number, string>,
  classId?: string
): Promise<SimulatedAttempt> => {
  
  console.log("Submitting attempt for:", user.name, "Exam:", exam.title);

  // 1. Verificação de Segurança (Duplicidade)
  const existing = await checkExistingAttempt(user.uid, exam.id!);
  if (existing) {
    throw new Error("Você já realizou este simulado.");
  }

  // 2. Cálculo da Nota
  let correct = 0;
  let wrong = 0;
  let blank = 0;
  let score = 0;
  let totalMaxPoints = 0;

  const questionsMap = new Map<number, ExamQuestion>();
  if (exam.questions) {
    exam.questions.forEach(q => {
      questionsMap.set(q.index, q);
    });
  }

  // Itera sobre o total de questões do simulado
  for (let i = 1; i <= exam.questionCount; i++) {
    // Normalização da chave (aceita number ou string)
    const userAnswer = userAnswers[i] || userAnswers[String(i)];
    const questionData = questionsMap.get(i);
    const correctAnswer = questionData?.answer;
    const questionWeight = questionData?.value || 1;

    totalMaxPoints += questionWeight;

    // Se a questão foi anulada, conta como ponto para todos (Acerto Automático)
    if (questionData?.isAnnulled) {
        correct++;
        score += questionWeight;
        continue;
    }

    if (!userAnswer) {
        blank++;
        // Em branco não pontua nem penaliza
    } else if (userAnswer === correctAnswer) {
        correct++;
        score += questionWeight; // Ponto ponderado por acerto
    } else {
        wrong++;
        // Lógica de Penalidade (Estilo Cespe)
        if (exam.hasPenalty) {
            score -= questionWeight; // Penalidade ponderada por erro
        }
    }
  }

  // 3. Aprovação e Nota Líquida
  // Permite nota negativa (padrão Cespe)
  const maxPoints = totalMaxPoints > 0 ? totalMaxPoints : exam.questionCount;
  
  // Percentual para aprovação
  // Nota: Se a nota for negativa, consideramos 0 para efeito de % de aproveitamento visual,
  // mas o score salvo pode ser negativo. Para aprovação, score >= minPoints.
  // Cálculo de aprovação baseado em percentual da pontuação total possível
  const minScore = (exam.minApprovalPercent / 100) * maxPoints;
  const isApproved = score >= minScore;

  // 4. Preparar Nome de Exibição
  // Lógica: Se tem nickname, usa. Senão, usa Nome.
  const displayName = (user.nickname && user.nickname.trim().length > 0)
      ? user.nickname 
      : user.name;

  // 5. Preparar Objeto
  const attempt: SimulatedAttempt = {
    userId: user.uid,
    userPhoto: user.photoURL || '',
    userName: displayName,
    simulatedId: exam.id!,
    simulatedTitle: exam.title,
    classId: classId || '',
    userAnswers,
    score: Number(score.toFixed(2)), // Fix decimal
    correctCount: correct,
    wrongCount: wrong,
    blankCount: blank,
    totalQuestions: exam.questionCount,
    maxPossibleScore: Number(maxPoints.toFixed(2)),
    isApproved,
    completedAt: serverTimestamp()
  };

  console.log("Calculated Attempt Data:", attempt);

  // 6. Salvar no Firestore
  const docRef = await addDoc(collection(db, 'simulated_attempts'), attempt);
  
  // 7. Atualizar Nível de Preparação se for Simulado de Nivelamento
  if (exam.isLeveling) {
    const percent = (correct / exam.questionCount) * 100;
    let newLevel: 'beginner' | 'intermediate' | 'advanced' | 'insane' = 'beginner';
    
    if (percent > 90) newLevel = 'insane';
    else if (percent >= 71) newLevel = 'advanced';
    else if (percent >= 51) newLevel = 'intermediate';
    // Else stays beginner (< 51%)

    try {
      await updateStudent(user.uid, { studentLevel: newLevel });
      console.log("Student level updated to:", newLevel);
    } catch (e) {
      console.error("Error updating student level:", e);
    }
  }

  return { ...attempt, id: docRef.id };
};

/**
 * Busca o ranking de um simulado específico.
 */
export const getExamRanking = async (simulatedId: string): Promise<SimulatedAttempt[]> => {
  const q = query(
    collection(db, 'simulated_attempts'),
    where('simulatedId', '==', simulatedId),
    orderBy('score', 'desc'),
    orderBy('completedAt', 'asc'), // Desempate por quem fez primeiro
    limit(100) // Top 100
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SimulatedAttempt));
};

/**
 * Busca todas as tentativas de um usuário específico.
 */
export const getAttemptsByUserId = async (userId: string): Promise<SimulatedAttempt[]> => {
  const q = query(
    collection(db, 'simulated_attempts'),
    where('userId', '==', userId),
    orderBy('completedAt', 'desc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SimulatedAttempt));
};

/**
 * Recalcula o relatório de autodiagnóstico com base nas novas respostas do gabarito.
 */
export const recalculateAttemptAutodiagnosis = (
  userAnswers: Record<number, string>,
  rawAnswers: Record<number, string>,
  exam: SimulatedExam
) => {
  const disciplineMap: Record<string, string> = {};
  const list = exam.autodiagnosisDisciplines || [];
  list.forEach((disc) => {
    if (disc.id) {
      disciplineMap[disc.id] = disc.name;
    }
  });

  const getQuestionMeta = (idx: number) => {
    const qData = exam.questions?.find(q => q.index === idx);
    if (qData) {
      let subjectName = null;
      if (qData.disciplineId && disciplineMap[qData.disciplineId]) {
        subjectName = disciplineMap[qData.disciplineId];
      } else {
        subjectName = "Disciplina não identificada";
      }

      const rawTopic = qData.topic || "";
      const comment = qData.comment || "";
      const topicName = Array.isArray(rawTopic) ? rawTopic.join(", ") : rawTopic;

      return { 
        subject: subjectName || "Conteúdo Geral", 
        topic: topicName,
        comment: comment 
      };
    }
    return { subject: "Conteúdo Geral", topic: "", comment: "" };
  };

  const analysisBySubject: Record<string, any> = {};

  const getQuestionStatus = (qIndex: number) => {
    const userAns = userAnswers[qIndex] || userAnswers[String(qIndex)];
    const questionData = exam.questions?.find(q => q.index === qIndex);
    const correctAns = questionData?.answer;
    const isAnnulled = questionData?.isAnnulled;
    
    if (isAnnulled) return 'CORRECT';
    if (!userAns) return 'BLANK';
    return userAns === correctAns ? 'CORRECT' : 'WRONG';
  };

  for (let i = 1; i <= exam.questionCount; i++) {
    const reasonId = rawAnswers[i] || rawAnswers[String(i)];
    if (!reasonId) continue;
    
    const { subject, topic, comment } = getQuestionMeta(i);
    
    let displayTopic = topic && topic.trim() !== "" ? topic : `Questão ${i}`;
    if (comment && comment.trim() !== "") {
      displayTopic = `${displayTopic} (${comment})`;
    }

    if (!analysisBySubject[subject]) {
      analysisBySubject[subject] = { 
        strong: 0, 
        weak: 0, 
        review: 0, 
        topicsToStudy: [], 
        topicsToReview: [], 
        topicsStrong: [] 
      };
    }
    
    const status = getQuestionStatus(i);
    let reasonType: string | null = null;
    
    if (status === 'CORRECT') {
      if (reasonId === 'DOMINIO') reasonType = 'STRONG';
      else if (reasonId === 'CHUTE_CONSCIENTE') reasonType = 'REVIEW';
      else if (reasonId === 'CHUTE_SORTE') reasonType = 'WEAK';
    } else if (status === 'WRONG') {
      if (reasonId === 'FALTA_CONTEUDO') reasonType = 'WEAK';
      else if (reasonId === 'FALTA_ATENCAO') reasonType = 'REVIEW';
    } else { // BLANK
      if (reasonId === 'FALTA_CONTEUDO') reasonType = 'WEAK';
      else if (reasonId === 'INSEGURANCA') reasonType = 'REVIEW';
    }

    if (reasonType) {
      const pushUnique = (arr: any[], item: any) => { if (!arr.includes(item)) arr.push(item); };
      if (reasonType === 'STRONG') { 
        analysisBySubject[subject].strong++; 
        pushUnique(analysisBySubject[subject].topicsStrong, displayTopic); 
      }
      if (reasonType === 'WEAK') { 
        analysisBySubject[subject].weak++; 
        pushUnique(analysisBySubject[subject].topicsToStudy, displayTopic); 
      }
      if (reasonType === 'REVIEW') { 
        analysisBySubject[subject].review++; 
        pushUnique(analysisBySubject[subject].topicsToReview, displayTopic); 
      }
    }
  }

  return analysisBySubject;
};

/**
 * Recalcula as notas e resultados de todas as tentativas de um simulado específico.
 * Chamado quando o administrador altera o gabarito ou anula uma questão.
 */
export const recalculateAttemptsForExam = async (
  classId: string,
  examId: string,
  exam: SimulatedExam
): Promise<void> => {
  console.log(`Recalculating attempts for Exam: ${examId} in Class: ${classId}`);
  
  // 1. Buscar todas as tentativas desse simulado
  const q = query(
    collection(db, 'simulated_attempts'),
    where('simulatedId', '==', examId)
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) {
    console.log("No attempts found for this exam.");
    return;
  }

  const questionsMap = new Map<number, ExamQuestion>();
  if (exam.questions) {
    exam.questions.forEach(q => {
      questionsMap.set(q.index, q);
    });
  }

  // 2. Processar cada tentativa
  for (const docSnap of snapshot.docs) {
    const attempt = docSnap.data() as SimulatedAttempt;
    const userAnswers = attempt.userAnswers || {};

    let correct = 0;
    let wrong = 0;
    let blank = 0;
    let score = 0;
    let totalMaxPoints = 0;

    // Itera sobre o total de questões do simulado
    for (let i = 1; i <= exam.questionCount; i++) {
      const userAnswer = userAnswers[i] || userAnswers[String(i)];
      const questionData = questionsMap.get(i);
      const correctAnswer = questionData?.answer;
      const questionWeight = questionData?.value || 1;

      totalMaxPoints += questionWeight;

      // Se a questão foi anulada, conta como ponto para todos
      if (questionData?.isAnnulled) {
        correct++;
        score += questionWeight;
        continue;
      }

      if (!userAnswer) {
        blank++;
      } else if (userAnswer === correctAnswer) {
        correct++;
        score += questionWeight;
      } else {
        wrong++;
        if (exam.hasPenalty) {
          score -= questionWeight;
        }
      }
    }

    const maxPoints = totalMaxPoints > 0 ? totalMaxPoints : exam.questionCount;
    const minScore = (exam.minApprovalPercent / 100) * maxPoints;
    const isApproved = score >= minScore;

    const updates: Partial<SimulatedAttempt> = {
      score: Number(score.toFixed(2)),
      correctCount: correct,
      wrongCount: wrong,
      blankCount: blank,
      maxPossibleScore: Number(maxPoints.toFixed(2)),
      isApproved
    };

    // Recalcular autodiagnóstico se ele existir e contiver respostas
    if (attempt.autodiagnosis) {
      const rawAnswers = attempt.autodiagnosis.rawAnswers || {};
      if (Object.keys(rawAnswers).length > 0) {
        try {
          const newAnalysis = recalculateAttemptAutodiagnosis(userAnswers, rawAnswers, exam);
          updates.autodiagnosis = {
            ...attempt.autodiagnosis,
            analysis: newAnalysis
          };
        } catch (err) {
          console.error(`Error recalculating autodiagnosis for attempt ${docSnap.id}:`, err);
        }
      }
    }

    // Salvar as atualizações
    const attemptRef = doc(db, 'simulated_attempts', docSnap.id);
    await updateDoc(attemptRef, updates);
    console.log(`Updated attempt ${docSnap.id} for user ${attempt.userName}`);
  }
};
