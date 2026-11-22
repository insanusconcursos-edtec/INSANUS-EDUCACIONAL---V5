
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
  disapprovalReasons?: string[];
  rankingCategoryId?: string;
  rankingCategoryLabel?: string;
  completedAt: any;
  autodiagnosis?: {
    rawAnswers?: Record<number, string>;
    analysis: Record<string, {
      strong: number;
      review: number;
      weak: number;
      topicsToStudy: string[];
      topicsToReview: string[];
    }>;
  };
}

export interface DisciplineEvaluation {
  id: string;
  name: string;
  questionCount: number;
  startIndex: number;
  endIndex: number;
  correctCount: number;
  wrongCount: number;
  blankCount: number;
  score: number;
  maxPoints: number;
  isZeroed: boolean;
}

export interface BlockEvaluation {
  name: string;
  questionCount: number;
  minApproval: number;
  forbidZeroDiscipline: boolean;
  score: number;
  maxPoints: number;
  percent: number;
  passedMinApproval: boolean;
  zeroedDisciplines: string[];
  passedNoZeroRule: boolean;
  isApproved: boolean;
  disciplines: DisciplineEvaluation[];
}

export interface AttemptEvaluationResult {
  score: number;
  correctCount: number;
  wrongCount: number;
  blankCount: number;
  maxPossibleScore: number;
  overallPercent: number;
  passedOverallMin: boolean;
  isApproved: boolean;
  disapprovalReasons: string[];
  blockEvaluations: BlockEvaluation[];
}

const EPSILON = 1e-9;

/**
 * Avalia pontuação, aproveitamento por bloco/disciplina e todos os critérios de aprovação
 * (nota mínima geral, nota mínima por bloco e regra condicional "não zerar nenhuma disciplina").
 */
export const evaluateSimulatedAttempt = (
  exam: SimulatedExam,
  userAnswers: Record<number, string> = {}
): AttemptEvaluationResult => {
  const questionsMap = new Map<number, ExamQuestion>();
  if (exam.questions) {
    exam.questions.forEach(q => {
      questionsMap.set(q.index, q);
    });
  }

  const gradeQuestion = (qIndex: number) => {
    const userAnswer = userAnswers[qIndex] || (userAnswers as Record<string, string>)[String(qIndex)];
    const questionData = questionsMap.get(qIndex);
    const correctAnswer = questionData?.answer;
    const weight = Number(questionData?.value) || 1;

    if (questionData?.isAnnulled) {
      return { status: 'correct' as const, points: weight, weight };
    }
    if (!userAnswer) {
      return { status: 'blank' as const, points: 0, weight };
    }
    if (userAnswer === correctAnswer) {
      return { status: 'correct' as const, points: weight, weight };
    }
    return {
      status: 'wrong' as const,
      points: exam.hasPenalty ? -weight : 0,
      weight
    };
  };

  // 1. Cálculo Geral
  let correct = 0;
  let wrong = 0;
  let blank = 0;
  let rawScore = 0;
  let totalMaxPoints = 0;

  for (let i = 1; i <= exam.questionCount; i++) {
    const graded = gradeQuestion(i);
    totalMaxPoints += graded.weight;
    rawScore += graded.points;
    if (graded.status === 'correct') correct++;
    else if (graded.status === 'wrong') wrong++;
    else blank++;
  }

  const maxPoints = totalMaxPoints > 0 ? totalMaxPoints : exam.questionCount;
  const overallPercent = maxPoints > 0 ? (rawScore / maxPoints) * 100 : 0;
  const minOverallPercent = Number(exam.minApprovalPercent) || 0;
  const minOverallScore = (minOverallPercent / 100) * maxPoints;
  const passedOverallMin = minOverallPercent <= 0 || rawScore + EPSILON >= minOverallScore;

  const disapprovalReasons: string[] = [];
  if (!passedOverallMin) {
    disapprovalReasons.push(
      `Não atingiu a nota mínima geral de ${minOverallPercent}% (${Number(rawScore.toFixed(2))} de ${Number(minOverallScore.toFixed(2))} pts exigidos)`
    );
  }

  // 2. Cálculo e Critérios por Bloco / Disciplina
  const blockEvaluations: BlockEvaluation[] = [];

  if (exam.hasBlocks && Array.isArray(exam.blocks) && exam.blocks.length > 0) {
    let currentStart = 1;

    exam.blocks.forEach((block, blockIdx) => {
      const blockName = block.name?.trim() || `Bloco ${blockIdx + 1}`;
      const blockMinApproval = Number(block.minApproval) || 0;
      const forbidZeroDiscipline = Boolean(block.forbidZeroDiscipline);
      const blockDisciplines = block.disciplines || [];

      let blockScore = 0;
      let blockMaxPoints = 0;
      const disciplinesEval: DisciplineEvaluation[] = [];
      const zeroedDisciplines: string[] = [];

      if (blockDisciplines.length > 0) {
        blockDisciplines.forEach((disc, discIdx) => {
          const discName = disc.name?.trim() || `Disciplina ${discIdx + 1}`;
          const qCount = Math.max(0, Number(disc.questionCount) || 0);
          const startIndex = currentStart;
          const endIndex = qCount > 0 ? currentStart + qCount - 1 : currentStart - 1;

          let dCorrect = 0;
          let dWrong = 0;
          let dBlank = 0;
          let dScore = 0;
          let dMaxPoints = 0;

          for (let i = startIndex; i <= endIndex; i++) {
            const graded = gradeQuestion(i);
            dMaxPoints += graded.weight;
            dScore += graded.points;
            if (graded.status === 'correct') dCorrect++;
            else if (graded.status === 'wrong') dWrong++;
            else dBlank++;
          }

          if (qCount > 0) {
            currentStart = endIndex + 1;
          }

          blockScore += dScore;
          blockMaxPoints += dMaxPoints;

          const roundedDiscScore = Number(dScore.toFixed(4));
          const isZeroed = qCount > 0 && roundedDiscScore <= 0;
          if (isZeroed) {
            zeroedDisciplines.push(discName);
          }

          disciplinesEval.push({
            id: disc.id || `${blockIdx}_${discIdx}`,
            name: discName,
            questionCount: qCount,
            startIndex,
            endIndex,
            correctCount: dCorrect,
            wrongCount: dWrong,
            blankCount: dBlank,
            score: Number(dScore.toFixed(2)),
            maxPoints: Number(dMaxPoints.toFixed(2)),
            isZeroed
          });
        });
      } else {
        const qCount = Math.max(0, Number(block.questionCount) || 0);
        const startIndex = currentStart;
        const endIndex = qCount > 0 ? currentStart + qCount - 1 : currentStart - 1;

        for (let i = startIndex; i <= endIndex; i++) {
          const graded = gradeQuestion(i);
          blockMaxPoints += graded.weight;
          blockScore += graded.points;
        }

        if (qCount > 0) {
          currentStart = endIndex + 1;
        }
      }

      const blockMinScore = (blockMinApproval / 100) * blockMaxPoints;
      const passedMinApproval =
        blockMinApproval <= 0 || blockMaxPoints <= 0 || blockScore + EPSILON >= blockMinScore;
      const passedNoZeroRule = !forbidZeroDiscipline || zeroedDisciplines.length === 0;
      const blockApproved = passedMinApproval && passedNoZeroRule;

      if (!passedMinApproval) {
        disapprovalReasons.push(
          `Não atingiu o mínimo de ${blockMinApproval}% no bloco "${blockName}" (${Number(blockScore.toFixed(2))} de ${Number(blockMinScore.toFixed(2))} pts exigidos)`
        );
      }

      if (!passedNoZeroRule) {
        zeroedDisciplines.forEach(discName => {
          disapprovalReasons.push(
            `Zerou a disciplina "${discName}" no bloco "${blockName}" (regra: não zerar nenhuma disciplina)`
          );
        });
      }

      blockEvaluations.push({
        name: blockName,
        questionCount: Number(block.questionCount) || 0,
        minApproval: blockMinApproval,
        forbidZeroDiscipline,
        score: Number(blockScore.toFixed(2)),
        maxPoints: Number(blockMaxPoints.toFixed(2)),
        percent: blockMaxPoints > 0 ? Number(((blockScore / blockMaxPoints) * 100).toFixed(1)) : 0,
        passedMinApproval,
        zeroedDisciplines,
        passedNoZeroRule,
        isApproved: blockApproved,
        disciplines: disciplinesEval
      });
    });
  }

  return {
    score: Number(rawScore.toFixed(2)),
    correctCount: correct,
    wrongCount: wrong,
    blankCount: blank,
    maxPossibleScore: Number(maxPoints.toFixed(2)),
    overallPercent: Number(overallPercent.toFixed(1)),
    passedOverallMin,
    isApproved: disapprovalReasons.length === 0,
    disapprovalReasons,
    blockEvaluations
  };
};

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
  classId?: string,
  rankingSelection?: { categoryId?: string; categoryLabel?: string }
): Promise<SimulatedAttempt> => {
  
  console.log("Submitting attempt for:", user.name, "Exam:", exam.title);

  // 1. Verificação de Segurança (Duplicidade)
  const existing = await checkExistingAttempt(user.uid, exam.id!);
  if (existing) {
    throw new Error("Você já realizou este simulado.");
  }

  // 2. Cálculo da Nota e Critérios de Aprovação (Geral + Blocos + Não Zerar Disciplinas)
  const evaluation = evaluateSimulatedAttempt(exam, userAnswers);
  const {
    correctCount: correct,
    wrongCount: wrong,
    blankCount: blank,
    score,
    maxPossibleScore: maxPoints,
    isApproved,
    disapprovalReasons
  } = evaluation;

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
    score,
    correctCount: correct,
    wrongCount: wrong,
    blankCount: blank,
    totalQuestions: exam.questionCount,
    maxPossibleScore: maxPoints,
    isApproved,
    disapprovalReasons,
    ...(rankingSelection?.categoryId
      ? {
          rankingCategoryId: rankingSelection.categoryId,
          rankingCategoryLabel: rankingSelection.categoryLabel || ''
        }
      : {}),
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

  // 2. Processar cada tentativa
  for (const docSnap of snapshot.docs) {
    const attempt = docSnap.data() as SimulatedAttempt;
    const userAnswers = attempt.userAnswers || {};

    const evaluation = evaluateSimulatedAttempt(exam, userAnswers);

    const updates: Partial<SimulatedAttempt> = {
      score: evaluation.score,
      correctCount: evaluation.correctCount,
      wrongCount: evaluation.wrongCount,
      blankCount: evaluation.blankCount,
      maxPossibleScore: evaluation.maxPossibleScore,
      isApproved: evaluation.isApproved,
      disapprovalReasons: evaluation.disapprovalReasons
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
