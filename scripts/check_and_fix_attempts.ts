import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  getDocs, 
  doc, 
  updateDoc 
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCDAzfb5nHdg8hGPnq-g0S4ojT_lSHmdD4",
  authDomain: "planner-insanus---v2.firebaseapp.com",
  projectId: "planner-insanus---v2",
  storageBucket: "planner-insanus---v2.firebasestorage.app",
  messagingSenderId: "853047463220",
  appId: "1:853047463220:web:4d1f72aa5a197c49256961",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// === REPLICATED TYPES & LOGIC FOR AUTODIAGNOSIS ===

interface ExamQuestion {
  index: number;
  answer: string;
  value: number;
  isAnnulled: boolean;
  disciplineId?: string;
  topic?: string;
  comment?: string;
}

interface SimulatedExam {
  id: string;
  title: string;
  questionCount: number;
  hasPenalty: boolean;
  minApprovalPercent: number;
  questions?: ExamQuestion[];
  autodiagnosisDisciplines?: { id: string; name: string; }[];
}

interface SimulatedAttempt {
  id: string;
  userId: string;
  userName: string;
  simulatedId: string;
  simulatedTitle: string;
  userAnswers: Record<number, string>;
  score: number;
  correctCount: number;
  wrongCount: number;
  blankCount: number;
  totalQuestions: number;
  maxPossibleScore?: number;
  isApproved: boolean;
  autodiagnosis?: any;
}

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

// === MAIN RUNNER ===

async function main() {
  console.log("=================================================");
  console.log("   AUDITORIA E AJUSTE AUTOMÁTICO DE GABARITOS    ");
  console.log("=================================================");
  
  let totalExamsChecked = 0;
  let totalAttemptsAudited = 0;
  let totalAttemptsAdjusted = 0;

  try {
    // 1. Obter todas as classes de simulados
    const classesSnapshot = await getDocs(collection(db, 'simulatedClasses'));
    console.log(`Encontradas ${classesSnapshot.size} turmas de simulados.`);

    for (const classDoc of classesSnapshot.docs) {
      const classId = classDoc.id;
      const className = classDoc.data().title || "Sem Nome";
      console.log(`\n📁 Turma: ${className} (${classId})`);

      // 2. Obter todos os simulados desta turma
      const examsSnapshot = await getDocs(collection(db, 'simulatedClasses', classId, 'exams'));
      console.log(`   Encontrados ${examsSnapshot.size} simulados nesta turma.`);

      for (const examDoc of examsSnapshot.docs) {
        const examId = examDoc.id;
        const examData = examDoc.data() as SimulatedExam;
        const examTitle = examData.title || "Sem Título";
        
        totalExamsChecked++;
        console.log(`   📝 Simulado: ${examTitle} (${examId})`);

        const questionsMap = new Map<number, ExamQuestion>();
        if (examData.questions) {
          examData.questions.forEach(q => {
            questionsMap.set(q.index, q);
          });
        }

        // 3. Obter todas as tentativas deste simulado
        const attemptsSnapshot = await getDocs(collection(db, 'simulated_attempts'));
        const examAttempts = attemptsSnapshot.docs.filter(doc => doc.data().simulatedId === examId);

        console.log(`      -> ${examAttempts.length} tentativas dos alunos registradas.`);

        for (const attemptDoc of examAttempts) {
          totalAttemptsAudited++;
          const attemptId = attemptDoc.id;
          const attempt = attemptDoc.data() as SimulatedAttempt;
          const userAnswers = attempt.userAnswers || {};

          let correct = 0;
          let wrong = 0;
          let blank = 0;
          let score = 0;
          let totalMaxPoints = 0;

          // Itera sobre o total de questões do simulado
          for (let i = 1; i <= examData.questionCount; i++) {
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
              if (examData.hasPenalty) {
                score -= questionWeight;
              }
            }
          }

          const maxPoints = totalMaxPoints > 0 ? totalMaxPoints : examData.questionCount;
          const minScore = (examData.minApprovalPercent / 100) * maxPoints;
          const isApproved = score >= minScore;

          const calculatedScore = Number(score.toFixed(2));
          const calculatedMaxPossibleScore = Number(maxPoints.toFixed(2));

          // Verificar inconsistências
          const isScoreDiff = attempt.score !== calculatedScore;
          const isCorrectDiff = attempt.correctCount !== correct;
          const isWrongDiff = attempt.wrongCount !== wrong;
          const isBlankDiff = attempt.blankCount !== blank;
          const isApprovedDiff = attempt.isApproved !== isApproved;

          if (isScoreDiff || isCorrectDiff || isWrongDiff || isBlankDiff || isApprovedDiff) {
            console.log(`      ⚠️  Ajustando tentativa do usuário: ${attempt.userName} (${attemptId})`);
            console.log(`         - Nota: ${attempt.score} -> ${calculatedScore}`);
            console.log(`         - Acertos: ${attempt.correctCount} -> ${correct}`);
            console.log(`         - Erros: ${attempt.wrongCount} -> ${wrong}`);
            console.log(`         - Brancos: ${attempt.blankCount} -> ${blank}`);
            console.log(`         - Aprovado: ${attempt.isApproved} -> ${isApproved}`);

            const updates: Partial<SimulatedAttempt> = {
              score: calculatedScore,
              correctCount: correct,
              wrongCount: wrong,
              blankCount: blank,
              maxPossibleScore: calculatedMaxPossibleScore,
              isApproved
            };

            // Recalcular autodiagnóstico se existir
            if (attempt.autodiagnosis) {
              const rawAnswers = attempt.autodiagnosis.rawAnswers || {};
              if (Object.keys(rawAnswers).length > 0) {
                try {
                  const newAnalysis = recalculateAttemptAutodiagnosis(userAnswers, rawAnswers, { ...examData, id: examId });
                  updates.autodiagnosis = {
                    ...attempt.autodiagnosis,
                    analysis: newAnalysis
                  };
                  console.log(`         - Autodiagnóstico recalculado com sucesso.`);
                } catch (err: any) {
                  console.error(`         ❌ Erro ao recalcular autodiagnóstico: ${err.message}`);
                }
              }
            }

            // Atualizar no Firestore
            const attemptRef = doc(db, 'simulated_attempts', attemptId);
            await updateDoc(attemptRef, updates);
            totalAttemptsAdjusted++;
          }
        }
      }
    }

    console.log("\n=================================================");
    console.log("            RELATÓRIO FINAL DE AUDITORIA         ");
    console.log("=================================================");
    console.log(`✅ Total de simulados verificados: ${totalExamsChecked}`);
    console.log(`✅ Total de tentativas auditadas: ${totalAttemptsAudited}`);
    console.log(`✅ Total de tentativas ajustadas: ${totalAttemptsAdjusted}`);
    console.log("=================================================\n");

  } catch (error: any) {
    console.error("❌ Ocorreu um erro geral durante a auditoria:", error.message);
  }
}

main();
