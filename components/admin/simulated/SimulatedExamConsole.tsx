import React, { useState, useEffect, useCallback } from 'react';
import { 
  ArrowLeft, Save, ListChecks, Activity, AlertCircle, X as XIcon, Loader2,
  Plus, Copy, CheckCircle, Award, Trophy, Users, Search, Medal
} from 'lucide-react';
import { 
  SimulatedExam, 
  ExamQuestion, 
  ExamDiscipline, 
  updateExamQuestions, 
  saveExamAutodiagnosis,
  getStudentExamResults,
  StudentExamResult
} from '../../../services/simulatedService';
import { recalculateAttemptsForExam } from '../../../services/simulatedAttemptService';
import { 
  getResourcesForExam, 
  judgeResource, 
  SimulatedResource,
  createAdminCorrection
} from '../../../services/simulatedResourceService';
import { Scale, MessageSquare, Check, X, ShieldAlert } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface SimulatedExamConsoleProps {
  classId: string;
  exam: SimulatedExam;
  onBack: () => void;
  onUpdate?: () => void; // Callback to refresh parent list
}

const SimulatedExamConsole: React.FC<SimulatedExamConsoleProps> = ({ classId, exam, onBack, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'GABARITO' | 'AUTODIAGNOSTICO' | 'RESULTADOS' | 'RECURSOS'>('GABARITO');
  
  // Data State
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [disciplines, setDisciplines] = useState<ExamDiscipline[]>([]);
  const [examResults, setExamResults] = useState<StudentExamResult[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [isRankingModalOpen, setIsRankingModalOpen] = useState(false);
  const [rankingSearch, setRankingSearch] = useState('');

  // Resources state
  const [resources, setResources] = useState<SimulatedResource[]>([]);
  const [resourceSubTab, setResourceSubTab] = useState<'BANCA' | 'PENDING' | 'ACCEPTED' | 'REJECTED'>('BANCA');
  const [loadingResources, setLoadingResources] = useState(false);
  const [selectedResource, setSelectedResource] = useState<SimulatedResource | null>(null);
  
  // Judging Modal state
  const [isJudgingModalOpen, setIsJudgingModalOpen] = useState(false);
  const [judgmentDecision, setJudgmentDecision] = useState<'INDEFERIR' | 'DEFERIR' | 'DEFERIR_SUMARIAMENTE'>('INDEFERIR');
  const [judgmentResponse, setJudgmentResponse] = useState('');
  const [judgmentNewAlternative, setJudgmentNewAlternative] = useState('A');
  const [isSubmittingJudgment, setIsSubmittingJudgment] = useState(false);

  // Admin Correction modal state
  const [isAdminCorrectionModalOpen, setIsAdminCorrectionModalOpen] = useState(false);
  const [adminCorrectionQuestionNumber, setAdminCorrectionQuestionNumber] = useState<number>(1);
  const [adminCorrectionType, setAdminCorrectionType] = useState<'alterar_gabarito' | 'anular_questao'>('alterar_gabarito');
  const [adminCorrectionJustification, setAdminCorrectionJustification] = useState('');
  const [adminCorrectionNewAlternative, setAdminCorrectionNewAlternative] = useState('A');
  const [isSubmittingAdminCorrection, setIsSubmittingAdminCorrection] = useState(false);

  const loadResources = useCallback(async () => {
    if (!exam.id) return;
    setLoadingResources(true);
    try {
      const res = await getResourcesForExam(exam.id);
      setResources(res);
    } catch (error) {
      console.error("Erro ao carregar recursos:", error);
    } finally {
      setLoadingResources(false);
    }
  }, [exam.id]);

  useEffect(() => {
    if (activeTab === 'RECURSOS') {
      loadResources();
    }
  }, [activeTab, loadResources]);
  
  // UI State
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [newDisciplineName, setNewDisciplineName] = useState('');

  // Helper to get question department (Block > Discipline)
  const getQuestionInfo = (qIndex: number) => {
    if (!exam.hasBlocks || !exam.blocks) return null;
    let currentStart = 1;
    for (const block of exam.blocks) {
        for (const disc of (block.disciplines || [])) {
            const end = currentStart + (Number(disc.questionCount) || 0) - 1;
            if (qIndex >= currentStart && qIndex <= end) {
                return { blockName: block.name, discName: disc.name };
            }
            currentStart = end + 1;
        }
    }
    return null;
  };

  // Inicialização
  useEffect(() => {
    // 1. Carregar Questões
    if (exam.questions && exam.questions.length > 0) {
      setQuestions(exam.questions);
    } else {
      // Gera estrutura inicial se vazio
      const initialQuestions: ExamQuestion[] = Array.from({ length: exam.questionCount }, (_, i) => ({
        index: i + 1,
        answer: '',
        value: 1.0,
        isAnnulled: false,
        topic: '',
        comment: ''
      }));
      setQuestions(initialQuestions);
    }

    // 2. Carregar Disciplinas
    if (exam.autodiagnosisDisciplines && exam.autodiagnosisDisciplines.length > 0) {
        setDisciplines(exam.autodiagnosisDisciplines);
    } else {
        setDisciplines([]);
    }
  }, [exam]);

  // Fetch Results
  const fetchResults = useCallback(async () => {
    if (!classId || !exam.id) return;
    setLoadingResults(true);
    try {
      const results = await getStudentExamResults(classId, exam.id);
      setExamResults(results);
    } catch (error) {
      console.error("Erro ao carregar resultados:", error);
    } finally {
      setLoadingResults(false);
    }
  }, [classId, exam.id]);

  useEffect(() => {
    if (activeTab === 'RESULTADOS' || isRankingModalOpen) {
      fetchResults();
    }
  }, [activeTab, isRankingModalOpen, fetchResults]);

  // Toast Timer
  useEffect(() => {
    if (saveSuccess) {
        const timer = setTimeout(() => setSaveSuccess(false), 3000);
        return () => clearTimeout(timer);
    }
  }, [saveSuccess]);

  // === GABARITO HANDLERS ===

  const handleAnswerChange = (index: number, answer: string) => {
    setQuestions(prev => prev.map(q => q.index === index ? { ...q, answer } : q));
  };

  const handlePointsChange = (index: number, value: number) => {
    setQuestions(prev => prev.map(q => q.index === index ? { ...q, value } : q));
  };

  const handleToggleAnnul = (index: number) => {
    setQuestions(prev => prev.map(q => q.index === index ? { ...q, isAnnulled: !q.isAnnulled } : q));
  };

  const handleSaveGabarito = async () => {
    setIsSaving(true);
    try {
      await updateExamQuestions(classId, exam.id!, questions);
      const updatedExam = { ...exam, questions };
      await recalculateAttemptsForExam(classId, exam.id!, updatedExam);
      setSaveSuccess(true);
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("Erro ao salvar gabarito:", error);
      alert("Erro ao salvar gabarito.");
    } finally {
      setIsSaving(false);
    }
  };

  // === AUTODIAGNÓSTICO HANDLERS ===

  const handleAddDiscipline = () => {
    if (!newDisciplineName.trim()) return;
    const newDisc: ExamDiscipline = {
        id: crypto.randomUUID(),
        name: newDisciplineName.trim().toUpperCase()
    };
    setDisciplines([...disciplines, newDisc]);
    setNewDisciplineName('');
  };

  // FIX: Função corrigida - Removeu window.confirm e limpa referências
  const handleRemoveDiscipline = (id: string) => {
    // 1. Remove da lista local imediatamente
    setDisciplines(prev => prev.filter(d => d.id !== id));

    // 2. Limpa referências nas questões (Evita IDs órfãos)
    setQuestions(prev => prev.map(q => 
        q.disciplineId === id ? { ...q, disciplineId: '' } : q
    ));
  };

  const handleQuestionAutoDiagChange = (index: number, field: 'disciplineId' | 'topic' | 'comment', value: string) => {
    setQuestions(prev => prev.map(q => q.index === index ? { ...q, [field]: value } : q));
  };

  const handleCopyFromPrevious = (currentIndex: number) => {
    if (currentIndex <= 1) return; 
    const prevQ = questions.find(q => q.index === currentIndex - 1);
    if (prevQ) {
        setQuestions(prev => prev.map(q => q.index === currentIndex ? { 
            ...q, 
            disciplineId: prevQ.disciplineId,
            topic: prevQ.topic 
        } : q));
    }
  };

  const handleSaveAutoDiagnosis = async () => {
    setIsSaving(true);
    try {
        await saveExamAutodiagnosis(classId, exam.id!, disciplines, questions);
        const updatedExam = { ...exam, autodiagnosisDisciplines: disciplines, questions };
        await recalculateAttemptsForExam(classId, exam.id!, updatedExam);
        setSaveSuccess(true);
        if (onUpdate) onUpdate();
    } catch (error) {
        console.error("Erro ao salvar autodiagnóstico:", error);
        alert("Erro ao salvar.");
    } finally {
        setIsSaving(false);
    }
  };

  // === RENDER HELPERS ===

  const renderOptionButton = (q: ExamQuestion, option: string, label: string) => {
    const isSelected = q.answer === option;
    const isAnnulled = q.isAnnulled;
    
    let bgClass = "bg-zinc-900 border-zinc-700 text-zinc-500 hover:text-white";
    if (isAnnulled) {
        bgClass = "bg-zinc-900 border-zinc-800 text-zinc-700 cursor-not-allowed";
    } else if (isSelected) {
        if (exam.type === 'true_false') {
            bgClass = option === 'C' 
                ? "bg-emerald-600 border-emerald-500 text-white" 
                : "bg-red-600 border-red-500 text-white";
        } else {
            bgClass = "bg-brand-red border-red-500 text-white";
        }
    }

    return (
      <button
        key={option}
        onClick={() => !isAnnulled && handleAnswerChange(q.index, option)}
        disabled={isAnnulled}
        className={`w-8 h-8 rounded-lg border flex items-center justify-center text-xs font-black transition-all ${bgClass}`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-500">
      
      {/* HEADER */}
      <div className="flex flex-col gap-4 mb-4 border-b border-zinc-800 pb-4">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
                <button 
                    onClick={onBack}
                    className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white hover:border-zinc-600 transition-all"
                >
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[9px] font-black uppercase tracking-widest border px-2 py-0.5 rounded-full ${
                            exam.type === 'true_false' 
                                ? 'border-blue-500/30 text-blue-400 bg-blue-500/10' 
                                : 'border-purple-500/30 text-purple-400 bg-purple-500/10'
                        }`}>
                            {exam.type === 'true_false' ? 'Certo / Errado' : 'Múltipla Escolha'}
                        </span>
                        <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest border border-zinc-800 bg-zinc-900 px-2 py-0.5 rounded-full">
                            {exam.questionCount} Questões
                        </span>
                    </div>
                    <h1 className="text-2xl font-black text-white uppercase tracking-tighter leading-none">
                        {exam.title}
                    </h1>
                </div>
            </div>

            <div className="flex items-center gap-2">
              {examResults.length > 0 && (
                <button 
                  onClick={() => setIsRankingModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-purple-400 border border-purple-500/30 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  <Award size={14} /> Ver Ranking
                </button>
              )}
              <button 
                  onClick={activeTab === 'GABARITO' ? handleSaveGabarito : handleSaveAutoDiagnosis}
                  disabled={isSaving || activeTab === 'RESULTADOS' || activeTab === 'RECURSOS'}
                  className={`flex items-center gap-2 px-6 py-3 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                      saveSuccess 
                          ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/20'
                          : activeTab === 'RESULTADOS' || activeTab === 'RECURSOS'
                              ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed shadow-none border border-zinc-700'
                              : activeTab === 'GABARITO' 
                                  ? 'bg-brand-red hover:bg-red-600 shadow-red-900/20' 
                                  : 'bg-purple-600 hover:bg-purple-500 shadow-purple-900/20'
                  }`}
              >
                  {isSaving ? <Loader2 size={16} className="animate-spin"/> : saveSuccess ? <CheckCircle size={16} /> : <Save size={16} />}
                  {isSaving ? 'Salvando...' : saveSuccess ? 'Salvo!' : (activeTab === 'GABARITO' ? 'Salvar Gabarito' : (activeTab === 'RESULTADOS' || activeTab === 'RECURSOS') ? 'Visualização' : 'Salvar Autodiagnóstico')}
              </button>
            </div>
        </div>

        {/* TABS */}
        <div className="flex gap-1 bg-zinc-900/50 p-1 rounded-xl border border-zinc-800 w-fit">
            <button
                onClick={() => setActiveTab('GABARITO')}
                className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                    activeTab === 'GABARITO' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                }`}
            >
                <ListChecks size={14} /> Gabarito & Pontuação
            </button>
            <button
                onClick={() => setActiveTab('AUTODIAGNOSTICO')}
                className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                    activeTab === 'AUTODIAGNOSTICO' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                }`}
            >
                <Activity size={14} /> Autodiagnóstico
            </button>
            <button
                onClick={() => setActiveTab('RESULTADOS')}
                className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                    activeTab === 'RESULTADOS' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                }`}
            >
                <Trophy size={14} /> Resultados dos Alunos
            </button>
            <button
                onClick={() => setActiveTab('RECURSOS')}
                className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                    activeTab === 'RECURSOS' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                }`}
            >
                <Scale size={14} /> Recursos dos Alunos
            </button>
        </div>
      </div>

      {/* CONTENT AREA */}
      <div className="flex-1 bg-zinc-950/50 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col">
        
        {/* === ABA 1: GABARITO === */}
        {activeTab === 'GABARITO' && (
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-20">
                    {questions.map((q) => {
                        const qInfo = getQuestionInfo(q.index);
                        return (
                        <div 
                            key={q.index}
                            className={`
                                relative flex flex-col gap-3 p-3 rounded-xl border transition-all
                                ${q.isAnnulled 
                                    ? 'bg-red-900/10 border-red-900/30 opacity-70' 
                                    : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700'
                                }
                            `}
                        >
                            {/* Discipline Label */}
                            {qInfo && (
                                <div className="text-[8px] font-black text-purple-400 uppercase tracking-widest border-b border-zinc-800/50 pb-1 mb-1 truncate">
                                    {qInfo.blockName} » {qInfo.discName}
                                </div>
                            )}

                            <div className="flex items-center gap-3">
                                {/* Number Badge */}
                                <div className={`
                                    w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black
                                    ${q.isAnnulled ? 'bg-zinc-900 text-zinc-600' : 'bg-zinc-950 text-white border border-zinc-800'}
                                `}>
                                    {q.index.toString().padStart(2, '0')}
                                </div>

                                {/* Options */}
                                <div className="flex-1 flex gap-1 justify-center">
                                    {exam.type === 'multiple_choice' ? (
                                        <>
                                            {renderOptionButton(q, 'A', 'A')}
                                            {renderOptionButton(q, 'B', 'B')}
                                            {renderOptionButton(q, 'C', 'C')}
                                            {renderOptionButton(q, 'D', 'D')}
                                            {(exam.alternativesCount === 5) && renderOptionButton(q, 'E', 'E')}
                                        </>
                                    ) : (
                                        <>
                                            {renderOptionButton(q, 'C', 'C')}
                                            {renderOptionButton(q, 'E', 'E')}
                                        </>
                                    )}
                                </div>

                                {/* Controls Column */}
                                <div className="flex flex-col items-end gap-1">
                                    {/* Points Input */}
                                    <div className="relative w-12">
                                        <input 
                                            type="number" 
                                            step="0.1"
                                            value={q.value}
                                            onChange={(e) => handlePointsChange(q.index, parseFloat(e.target.value))}
                                            disabled={q.isAnnulled}
                                            className="w-full bg-zinc-950 border border-zinc-800 rounded px-1 py-0.5 text-[10px] text-center text-white focus:outline-none focus:border-brand-red disabled:opacity-50"
                                        />
                                        <span className="absolute -right-3 top-1/2 -translate-y-1/2 text-[8px] text-zinc-600 font-bold">pts</span>
                                    </div>

                                    {/* Annul Toggle */}
                                    <button 
                                        onClick={() => handleToggleAnnul(q.index)}
                                        className={`text-[9px] font-bold uppercase tracking-widest flex items-center gap-1 ${q.isAnnulled ? 'text-red-500' : 'text-zinc-600 hover:text-zinc-400'}`}
                                        title="Anular Questão"
                                    >
                                        {q.isAnnulled ? <AlertCircle size={10} /> : <XIcon size={10} />}
                                        {q.isAnnulled ? 'Anulada' : 'Anular'}
                                    </button>
                                </div>
                            </div>

                            {/* Strike line for annulled */}
                            {q.isAnnulled && (
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <div className="w-[90%] h-px bg-red-500/50 rotate-12"></div>
                                </div>
                            )}
                        </div>
                    )})}
                </div>
            </div>
        )}

        {/* === ABA 2: AUTODIAGNÓSTICO === */}
        {activeTab === 'AUTODIAGNOSTICO' && (
            <div className="flex flex-col h-full">
                
                {/* 1. Discipline Manager */}
                <div className="p-4 border-b border-zinc-800 bg-zinc-900/30">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Disciplinas do Simulado</span>
                        <div className="flex gap-2">
                            <input 
                                value={newDisciplineName}
                                onChange={(e) => setNewDisciplineName(e.target.value)}
                                placeholder="NOVA DISCIPLINA (EX: PORTUGUÊS)"
                                className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white uppercase focus:border-purple-500 outline-none w-64"
                                onKeyDown={(e) => e.key === 'Enter' && handleAddDiscipline()}
                            />
                            <button 
                                onClick={handleAddDiscipline}
                                disabled={!newDisciplineName.trim()}
                                className="px-3 py-1.5 bg-zinc-800 hover:bg-purple-600 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                            >
                                <Plus size={14} />
                            </button>
                        </div>
                    </div>
                    
                    {disciplines.length === 0 ? (
                        <div className="text-center py-2 border border-dashed border-zinc-800 rounded text-[10px] text-zinc-600">
                            Nenhuma disciplina cadastrada para este simulado.
                        </div>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {disciplines.map(d => (
                                <div key={d.id} className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 px-3 py-1.5 rounded-lg group">
                                    <span className="text-[10px] font-bold text-zinc-300 uppercase">{d.name}</span>
                                    <button 
                                        type="button" // Fix: Tipo button para evitar submit
                                        onClick={() => handleRemoveDiscipline(d.id)}
                                        className="ml-2 text-zinc-500 hover:text-red-500 transition-colors cursor-pointer p-0.5"
                                        title="Remover Disciplina"
                                    >
                                        <XIcon size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* 2. Questions Mapping Table */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-zinc-950 text-zinc-500 text-[10px] font-black uppercase tracking-widest sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="p-3 border-b border-zinc-800 w-16 text-center">Questão</th>
                                <th className="p-3 border-b border-zinc-800 w-1/4">Disciplina</th>
                                <th className="p-3 border-b border-zinc-800 w-1/3">Assunto (Tópico)</th>
                                <th className="p-3 border-b border-zinc-800">Comentário / Obs</th>
                                <th className="p-3 border-b border-zinc-800 w-10 text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50">
                            {questions.map((q) => (
                                <tr key={q.index} className="hover:bg-zinc-900/30 transition-colors group">
                                    <td className="p-2 text-center">
                                        <div className="w-8 h-8 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-300 mx-auto">
                                            {q.index}
                                        </div>
                                    </td>
                                    <td className="p-2">
                                        <select
                                            value={q.disciplineId || ''}
                                            onChange={(e) => handleQuestionAutoDiagChange(q.index, 'disciplineId', e.target.value)}
                                            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs text-white focus:border-purple-500 outline-none uppercase"
                                        >
                                            <option value="" className="bg-zinc-900 text-zinc-400">SELECIONE...</option>
                                            {disciplines.map(d => (
                                                <option key={d.id} value={d.id} className="bg-zinc-900 text-white">{d.name}</option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="p-2">
                                        <input 
                                            value={q.topic || ''}
                                            onChange={(e) => handleQuestionAutoDiagChange(q.index, 'topic', e.target.value)}
                                            placeholder="Ex: Concordância Verbal"
                                            className="w-full bg-transparent border border-zinc-800 rounded px-2 py-1.5 text-xs text-white focus:border-purple-500 outline-none"
                                        />
                                    </td>
                                    <td className="p-2">
                                        <input 
                                            value={q.comment || ''}
                                            onChange={(e) => handleQuestionAutoDiagChange(q.index, 'comment', e.target.value)}
                                            placeholder="Obs..."
                                            className="w-full bg-transparent border-b border-transparent focus:border-zinc-700 text-xs text-zinc-400 focus:text-white outline-none"
                                        />
                                    </td>
                                    <td className="p-2 text-center">
                                        {q.index > 1 && (
                                            <button 
                                                onClick={() => handleCopyFromPrevious(q.index)}
                                                className="p-1.5 text-zinc-600 hover:text-purple-400 hover:bg-zinc-800 rounded transition-colors"
                                                title="Copiar Disciplina/Assunto da anterior"
                                            >
                                                <Copy size={14} />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {/* === ABA 3: RESULTADOS === */}
        {activeTab === 'RESULTADOS' && (
          <div className="flex-1 flex flex-col h-full bg-zinc-950 overflow-hidden">
            {loadingResults ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 text-zinc-500">
                <Loader2 size={40} className="animate-spin text-brand-red" />
                <span className="text-[10px] font-black uppercase tracking-widest">Carregando Resultados...</span>
              </div>
            ) : examResults.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
                <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center text-zinc-700 mb-4 border border-zinc-800">
                  <Users size={32} />
                </div>
                <h3 className="text-white font-black uppercase tracking-tighter text-xl">Nenhum Aluno Finalizou</h3>
                <p className="text-zinc-500 text-xs mt-2 max-w-xs uppercase tracking-wider font-bold">Aguarde que os alunos enviem suas respostas para visualizar os desempenhos aqui.</p>
              </div>
            ) : (
              <div className="flex-1 overflow-x-auto custom-scrollbar p-6">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-zinc-900/50 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                    <tr>
                      <th className="p-4 border-b border-zinc-800">Candidato</th>
                      <th className="p-4 border-b border-zinc-800 text-center">Data</th>
                      <th className="p-4 border-b border-zinc-800 text-center">Acertos</th>
                      <th className="p-4 border-b border-zinc-800 text-center">Erros</th>
                      <th className="p-4 border-b border-zinc-800 text-center">Nota</th>
                      {exam.isLeveling && <th className="p-4 border-b border-zinc-800 text-center">Nível</th>}
                      <th className="p-4 border-b border-zinc-800 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {examResults.map((result) => {
                      const maxPoints = result.maxPossibleScore || result.totalQuestions || 1;
                      const percent = (result.score / maxPoints) * 100;
                      return (
                        <tr key={result.id} className="hover:bg-zinc-900/30 transition-all group">
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center overflow-hidden">
                                {result.studentPhoto ? (
                                  <img src={result.studentPhoto} alt={result.studentName} className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-zinc-600 font-black text-xs uppercase">{result.studentName.substring(0, 2)}</span>
                                )}
                              </div>
                              <div>
                                <span className="block text-sm font-black text-white uppercase tracking-tight">{result.studentName}</span>
                                <span className="block text-[10px] font-bold text-zinc-600 uppercase tracking-widest">ID: {result.studentId.substring(0,8)}</span>
                              </div>
                            </div>
                          </td>
                          <td className="p-4 text-center">
                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                              {result.completedAt?.toDate?.()?.toLocaleDateString('pt-BR') || '---'}
                            </span>
                          </td>
                          <td className="p-4 text-center text-emerald-500 font-black tracking-tighter text-lg">{result.correctCount}</td>
                          <td className="p-4 text-center text-red-500 font-black tracking-tighter text-lg">{result.wrongCount}</td>
                          <td className="p-4 text-center">
                            <div className="flex flex-col items-center">
                              <span className="text-xl font-black text-white tracking-tighter">{result.score.toFixed(1)}</span>
                              <span className="text-[8px] text-zinc-600 font-black uppercase tracking-widest">Líquida</span>
                            </div>
                          </td>
                          {exam.isLeveling && exam.levelingRanges && (
                            <td className="p-4 text-center">
                              <div className={`px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest inline-flex items-center gap-1.5 ${
                                percent > exam.levelingRanges.advanced ? 'bg-purple-500/10 border-purple-500/30 text-purple-400' :
                                percent > exam.levelingRanges.intermediate ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' :
                                percent > exam.levelingRanges.beginner ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400' :
                                'bg-red-500/10 border-red-500/30 text-red-400'
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${
                                  percent > exam.levelingRanges.advanced ? 'bg-purple-500 animate-pulse' :
                                  percent > exam.levelingRanges.intermediate ? 'bg-blue-500' :
                                  percent > exam.levelingRanges.beginner ? 'bg-yellow-500' :
                                  'bg-red-500'
                                }`}></span>
                                {percent > exam.levelingRanges.advanced ? 'Insano' :
                                 percent > exam.levelingRanges.intermediate ? 'Avançado' :
                                 percent > exam.levelingRanges.beginner ? 'Intermediário' :
                                 'Iniciante'}
                              </div>
                            </td>
                          )}
                          <td className="p-4 text-center">
                            <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border ${
                              result.isApproved ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'
                            }`}>
                              {result.isApproved ? 'APROVADO' : 'REPROVADO'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* === ABA 4: RECURSOS === */}
        {activeTab === 'RECURSOS' && (
          <div className="flex-1 flex flex-col h-full bg-zinc-950 overflow-hidden">
            <div className="p-6 border-b border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900/30">
              <div>
                <h3 className="text-sm font-black text-white flex items-center gap-2 uppercase tracking-widest">
                  <Scale size={16} className="text-brand-red" />
                  Gerenciamento de Recursos
                </h3>
                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mt-1">
                  Analise recursos interpostos pelos alunos para alteração de gabarito ou anulação de questões.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => {
                    setAdminCorrectionQuestionNumber(1);
                    setAdminCorrectionType('alterar_gabarito');
                    setAdminCorrectionJustification('');
                    setAdminCorrectionNewAlternative('A');
                    setIsAdminCorrectionModalOpen(true);
                  }}
                  className="px-4 py-2 bg-brand-red hover:bg-red-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-lg shadow-red-950/20"
                >
                  <Plus size={12} />
                  Nova Retificação da Banca
                </button>
                <button 
                  onClick={loadResources}
                  disabled={loadingResources}
                  className="px-4 py-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-850 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-50"
                >
                  {loadingResources ? 'Atualizando...' : 'Atualizar Lista'}
                </button>
              </div>
            </div>

            {/* Sub-tabs de recursos */}
            <div className="px-6 py-3 border-b border-zinc-800 bg-zinc-950 flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setResourceSubTab('BANCA')}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 border ${
                  resourceSubTab === 'BANCA'
                    ? 'bg-brand-red/10 border-brand-red/30 text-brand-red shadow-sm shadow-red-950/20'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                }`}
              >
                <span>Banca Examinadora</span>
                <span className={`px-1.5 py-0.5 rounded text-[8px] font-black ${
                  resourceSubTab === 'BANCA' ? 'bg-brand-red/20 text-brand-red' : 'bg-zinc-800 text-zinc-500'
                }`}>
                  {resources.filter(r => r.userId === 'admin_correction' || (r as any).isOfficial).length}
                </span>
              </button>

              <button
                onClick={() => setResourceSubTab('PENDING')}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 border ${
                  resourceSubTab === 'PENDING'
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-500 shadow-sm shadow-amber-950/20'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                }`}
              >
                <span>Em Aberto</span>
                <span className={`px-1.5 py-0.5 rounded text-[8px] font-black ${
                  resourceSubTab === 'PENDING' ? 'bg-amber-500/20 text-amber-500' : 'bg-zinc-800 text-zinc-500'
                }`}>
                  {resources.filter(r => !(r.userId === 'admin_correction' || (r as any).isOfficial) && r.status === 'pending').length}
                </span>
              </button>

              <button
                onClick={() => setResourceSubTab('ACCEPTED')}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 border ${
                  resourceSubTab === 'ACCEPTED'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-sm shadow-emerald-950/20'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                }`}
              >
                <span>Deferidos</span>
                <span className={`px-1.5 py-0.5 rounded text-[8px] font-black ${
                  resourceSubTab === 'ACCEPTED' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-500'
                }`}>
                  {resources.filter(r => !(r.userId === 'admin_correction' || (r as any).isOfficial) && (r.status === 'accepted' || r.status === 'accepted_summary')).length}
                </span>
              </button>

              <button
                onClick={() => setResourceSubTab('REJECTED')}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 border ${
                  resourceSubTab === 'REJECTED'
                    ? 'bg-red-500/10 border-red-500/30 text-red-500 shadow-sm shadow-red-950/20'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                }`}
              >
                <span>Indeferidos</span>
                <span className={`px-1.5 py-0.5 rounded text-[8px] font-black ${
                  resourceSubTab === 'REJECTED' ? 'bg-red-500/20 text-red-500' : 'bg-zinc-800 text-zinc-500'
                }`}>
                  {resources.filter(r => !(r.userId === 'admin_correction' || (r as any).isOfficial) && r.status === 'rejected').length}
                </span>
              </button>
            </div>

            {loadingResources ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 text-zinc-500">
                <Loader2 size={40} className="animate-spin text-brand-red" />
                <span className="text-[10px] font-black uppercase tracking-widest">Carregando Recursos...</span>
              </div>
            ) : resources.filter(res => {
              const isOfficial = res.userId === 'admin_correction' || (res as any).isOfficial;
              if (resourceSubTab === 'BANCA') return isOfficial;
              if (isOfficial) return false;
              if (resourceSubTab === 'PENDING') return res.status === 'pending';
              if (resourceSubTab === 'ACCEPTED') return res.status === 'accepted' || res.status === 'accepted_summary';
              if (resourceSubTab === 'REJECTED') return res.status === 'rejected';
              return true;
            }).length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
                <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center text-zinc-700 mb-4 border border-zinc-800">
                  <Scale size={32} />
                </div>
                <h3 className="text-white font-black uppercase tracking-tighter text-lg">
                  {resourceSubTab === 'BANCA' ? 'Nenhuma Retificação Registrada' :
                   resourceSubTab === 'PENDING' ? 'Nenhum Recurso em Aberto' :
                   resourceSubTab === 'ACCEPTED' ? 'Nenhum Recurso Deferido' :
                   'Nenhum Recurso Indeferido'}
                </h3>
                <p className="text-zinc-500 text-xs mt-2 max-w-xs uppercase tracking-wider font-bold">
                  {resourceSubTab === 'BANCA' ? 'As retificações de ofício efetuadas pela banca serão exibidas aqui.' :
                   resourceSubTab === 'PENDING' ? 'Não existem recursos pendentes de análise no momento.' :
                   resourceSubTab === 'ACCEPTED' ? 'Os recursos de alunos que foram aprovados serão listados nesta área.' :
                   'Os recursos de alunos que foram rejeitados serão listados nesta área.'}
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  {resources.filter(res => {
                    const isOfficial = res.userId === 'admin_correction' || (res as any).isOfficial;
                    if (resourceSubTab === 'BANCA') return isOfficial;
                    if (isOfficial) return false;
                    if (resourceSubTab === 'PENDING') return res.status === 'pending';
                    if (resourceSubTab === 'ACCEPTED') return res.status === 'accepted' || res.status === 'accepted_summary';
                    if (resourceSubTab === 'REJECTED') return res.status === 'rejected';
                    return true;
                  }).map((res) => {
                    const isOfficial = res.userId === 'admin_correction' || (res as any).isOfficial;
                    return (
                      <div 
                        key={res.id} 
                        className={`border rounded-xl p-5 space-y-4 relative overflow-hidden transition-all ${
                          isOfficial 
                            ? 'bg-zinc-900/50 border-brand-red/30 shadow-[0_0_15px_rgba(220,38,38,0.05)]' 
                            : 'bg-zinc-900 border-zinc-800'
                        }`}
                      >
                        {/* Badge Topo */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/50 pb-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center overflow-hidden border ${
                              isOfficial 
                                ? 'bg-brand-red/10 border-brand-red/20 text-brand-red' 
                                : 'bg-zinc-950 border-zinc-800 text-zinc-600'
                            }`}>
                              {isOfficial ? (
                                <ShieldAlert size={20} />
                              ) : res.userPhoto ? (
                                <img src={res.userPhoto} alt={res.userName} className="w-full h-full object-cover" />
                              ) : (
                                <span className="font-black text-xs uppercase">{res.userName.substring(0, 2)}</span>
                              )}
                            </div>
                            <div>
                              <span className="block text-xs font-black text-white uppercase tracking-tight">
                                {res.userName} 
                                {isOfficial && <span className="text-brand-red ml-1.5 text-[9px] font-black uppercase bg-brand-red/10 px-2 py-0.5 rounded border border-brand-red/10">Banca</span>}
                              </span>
                              <span className="block text-[9px] font-bold text-zinc-500 uppercase tracking-widest">{res.userEmail}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 rounded text-[8px] font-black uppercase tracking-wider border ${
                              isOfficial ? 'bg-brand-red/10 text-brand-red border-brand-red/20' :
                              res.status === 'pending' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                              res.status === 'accepted' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                              res.status === 'accepted_summary' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                              'bg-red-500/10 text-red-500 border-red-500/20'
                            }`}>
                              {isOfficial ? 'Retificação de Ofício' :
                               res.status === 'pending' ? 'Pendente' :
                               res.status === 'accepted' ? 'Deferido' :
                               res.status === 'accepted_summary' ? 'Deferido Sumariamente' : 'Indeferido'}
                            </span>

                            <span className={`px-2 py-1 rounded text-[8px] font-black uppercase tracking-wider border bg-zinc-950 text-zinc-400 border-zinc-800`}>
                              Q{res.questionNumber} • {res.type === 'anular_questao' ? 'Anulação' : 'Alteração'}
                            </span>
                          </div>
                        </div>

                        {/* Conteúdo */}
                        <div className="space-y-2">
                          <span className="block text-[9px] font-black uppercase text-zinc-500 tracking-wider">
                            {isOfficial ? 'Justificativa / Fundamentação da Banca:' : 'Argumentação / Justificativa do Aluno:'}
                          </span>
                          <p className="text-xs text-zinc-300 font-medium leading-relaxed bg-zinc-950 p-3.5 rounded-lg border border-zinc-800/50">
                            "{res.justification}"
                          </p>
                          {isOfficial && res.type === 'alterar_gabarito' && res.newAlternative && (
                            <p className="text-[10px] text-emerald-400 font-bold uppercase mt-2 flex items-center gap-1.5">
                              <CheckCircle size={12} />
                              Novo Gabarito Aplicado: Alternativa {res.newAlternative}
                            </p>
                          )}
                        </div>

                        {/* Resposta do Admin (se houver e não for oficial) */}
                        {!isOfficial && res.adminResponse && (
                          <div className="bg-zinc-950/40 border-l-2 border-brand-red p-4 rounded-r-lg space-y-1">
                            <span className="block text-[8px] font-black uppercase text-zinc-500 tracking-wider">Resposta da Banca / Administrador:</span>
                            <p className="text-xs text-zinc-400 font-semibold leading-relaxed">
                              {res.adminResponse}
                            </p>
                            {res.newAlternative && (res.status === 'accepted' || res.status === 'accepted_summary') && (
                              <p className="text-[10px] text-emerald-400 font-bold uppercase mt-1">
                                Novo Gabarito Aplicado: Alternativa {res.newAlternative}
                              </p>
                            )}
                          </div>
                        )}

                      {/* Ações para Recursos Pendentes */}
                      {res.status === 'pending' && (
                        <div className="flex justify-end pt-2">
                          <button
                            onClick={() => {
                              setSelectedResource(res);
                              setJudgmentDecision('DEFERIR');
                              setJudgmentResponse('');
                              setJudgmentNewAlternative(res.newAlternative || 'A');
                              setIsJudgingModalOpen(true);
                            }}
                            className="px-4 py-2 bg-brand-red hover:bg-red-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 shadow-lg shadow-red-950/20"
                          >
                            <MessageSquare size={12} />
                            Analisar & Decidir
                          </button>
                        </div>
                      )}
                    </div>
                  )})}
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* JUDGMENT MODAL */}
      {isJudgingModalOpen && selectedResource && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 backdrop-blur-sm animate-in fade-in duration-300 p-4">
          <div className="w-full max-w-xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
            {/* Modal Header */}
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-brand-red/20 rounded-xl flex items-center justify-center text-brand-red border border-brand-red/20">
                  <Scale size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-tighter">Análise do Recurso</h3>
                  <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mt-1">Questão {selectedResource.questionNumber} • {selectedResource.userName}</p>
                </div>
              </div>
              <button 
                onClick={() => setIsJudgingModalOpen(false)}
                className="p-1.5 hover:bg-zinc-800 text-zinc-500 hover:text-white rounded-lg transition-all"
              >
                <XIcon size={18} />
              </button>
            </div>

            {/* Modal Content / Form */}
            <form onSubmit={async (e) => {
              e.preventDefault();
              setIsSubmittingJudgment(true);
              try {
                await judgeResource(
                  selectedResource.id!,
                  classId,
                  exam,
                  judgmentDecision,
                  judgmentResponse,
                  (judgmentDecision === 'DEFERIR' || judgmentDecision === 'DEFERIR_SUMARIAMENTE') && selectedResource.type === 'alterar_gabarito' ? judgmentNewAlternative : undefined
                );
                toast.success('Decisão aplicada com sucesso!');
                setIsJudgingModalOpen(false);
                setSelectedResource(null);
                
                // Refresh parent lists if callbacks exist
                if (onUpdate) onUpdate();
                await loadResources();
              } catch (error: any) {
                console.error("Erro ao julgar recurso:", error);
                toast.error(error.message || 'Erro ao aplicar decisão.');
              } finally {
                setIsSubmittingJudgment(false);
              }
            }} className="p-6 space-y-4">
              {/* Aluno justification preview */}
              <div className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-800/40 space-y-1">
                <span className="text-[8px] font-black uppercase text-zinc-500 tracking-wider">Justificativa do Candidato:</span>
                <p className="text-xs text-zinc-400 italic">
                  "{selectedResource.justification}"
                </p>
              </div>

              {/* Decision select */}
              <div>
                <label className="block text-[10px] font-black uppercase text-zinc-500 tracking-wider mb-2">Decisão da Banca</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['DEFERIR', 'DEFERIR_SUMARIAMENTE', 'INDEFERIR'] as const).map((dec) => (
                    <button
                      key={dec}
                      type="button"
                      onClick={() => setJudgmentDecision(dec)}
                      className={`py-2 px-3 rounded-lg text-[9px] font-black uppercase tracking-wider border transition-all text-center ${
                        judgmentDecision === dec
                          ? dec === 'DEFERIR' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-bold' :
                            dec === 'DEFERIR_SUMARIAMENTE' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30 font-bold' :
                            'bg-red-500/10 text-red-400 border-red-500/30 font-bold'
                          : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300'
                      }`}
                    >
                      {dec === 'DEFERIR' ? 'Deferir' :
                       dec === 'DEFERIR_SUMARIAMENTE' ? 'Sumariar' : 'Indeferir'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Optional: If deferring an answer change request, specify the new answer */}
              {(judgmentDecision === 'DEFERIR' || judgmentDecision === 'DEFERIR_SUMARIAMENTE') && selectedResource.type === 'alterar_gabarito' && (
                <div className="bg-emerald-950/15 border border-emerald-900/20 p-4 rounded-xl space-y-3 animate-in slide-in-from-top-2 duration-300">
                  <div className="flex items-center gap-2 text-emerald-500">
                    <ShieldAlert size={14} />
                    <span className="text-[10px] font-black uppercase tracking-wider">Nova Alternativa Correta</span>
                  </div>
                  <p className="text-[10px] text-zinc-400 uppercase leading-normal">
                    Ao aprovar o recurso de alteração, selecione abaixo qual será o novo gabarito correto. O sistema irá corrigir automaticamente e recalcular os pontos de todos os alunos que realizaram o simulado.
                  </p>
                  <select
                    value={judgmentNewAlternative}
                    onChange={(e) => setJudgmentNewAlternative(e.target.value)}
                    className="w-full bg-zinc-950 text-white text-xs font-bold p-3 rounded-lg border border-zinc-800 focus:border-brand-red focus:outline-none uppercase"
                  >
                    {['A', 'B', 'C', 'D', 'E'].map(opt => (
                      <option key={opt} value={opt}>Alternativa {opt}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Response Message */}
              <div>
                <label className="block text-[10px] font-black uppercase text-zinc-500 tracking-wider mb-2">Mensagem de Resposta / Fundamentação (Opcional)</label>
                <textarea
                  placeholder="Escreva a justificativa para a decisão tomada pela banca..."
                  value={judgmentResponse}
                  onChange={(e) => setJudgmentResponse(e.target.value)}
                  className="w-full min-h-[100px] bg-zinc-900 text-white text-xs font-semibold p-3 rounded-lg border border-zinc-800 focus:border-brand-red focus:outline-none resize-none"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800/50">
                <button
                  type="button"
                  onClick={() => setIsJudgingModalOpen(false)}
                  className="px-4 py-2 bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingJudgment}
                  className="px-5 py-2 bg-brand-red hover:bg-red-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2"
                >
                  {isSubmittingJudgment ? 'Processando...' : 'Confirmar Decisão'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADMIN CORRECTION MODAL (Nova Retificação da Banca) */}
      {isAdminCorrectionModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 backdrop-blur-sm animate-in fade-in duration-300 p-4">
          <div className="w-full max-w-xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
            {/* Modal Header */}
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-brand-red/20 rounded-xl flex items-center justify-center text-brand-red border border-brand-red/20">
                  <ShieldAlert size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-tighter">Retificação Oficial da Banca</h3>
                  <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mt-1">Aplique anulações ou alterações diretamente</p>
                </div>
              </div>
              <button 
                onClick={() => setIsAdminCorrectionModalOpen(false)}
                className="p-1.5 hover:bg-zinc-800 text-zinc-500 hover:text-white rounded-lg transition-all"
              >
                <XIcon size={18} />
              </button>
            </div>

            {/* Modal Content / Form */}
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!adminCorrectionJustification.trim()) {
                toast.error('Por favor, forneça uma justificativa para a retificação.');
                return;
              }
              setIsSubmittingAdminCorrection(true);
              try {
                await createAdminCorrection(
                  classId,
                  exam,
                  adminCorrectionQuestionNumber,
                  adminCorrectionType,
                  adminCorrectionJustification,
                  adminCorrectionType === 'alterar_gabarito' ? adminCorrectionNewAlternative : undefined
                );
                toast.success('Retificação oficial aplicada com sucesso!');
                setIsAdminCorrectionModalOpen(false);
                
                // Refresh parent lists if callbacks exist
                if (onUpdate) onUpdate();
                await loadResources();
              } catch (error: any) {
                console.error("Erro ao aplicar retificação:", error);
                toast.error(error.message || 'Erro ao aplicar retificação.');
              } finally {
                setIsSubmittingAdminCorrection(false);
              }
            }} className="p-6 space-y-4">
              
              {/* Question Number */}
              <div>
                <label className="block text-[10px] font-black uppercase text-zinc-500 tracking-wider mb-2">Selecione a Questão</label>
                <select 
                  value={adminCorrectionQuestionNumber}
                  onChange={(e) => setAdminCorrectionQuestionNumber(Number(e.target.value))}
                  className="w-full bg-zinc-900 text-white text-xs font-bold p-3 rounded-lg border border-zinc-800 focus:border-brand-red focus:outline-none uppercase"
                >
                  {Array.from({ length: exam.questionCount || 0 }).map((_, idx) => (
                    <option key={idx + 1} value={idx + 1}>Questão {idx + 1}</option>
                  ))}
                </select>
              </div>

              {/* Correction Type */}
              <div>
                <label className="block text-[10px] font-black uppercase text-zinc-500 tracking-wider mb-2">Ação Administrativa</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdminCorrectionType('alterar_gabarito')}
                    className={`py-3 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all text-center ${
                      adminCorrectionType === 'alterar_gabarito'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-bold'
                        : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300'
                    }`}
                  >
                    Alterar Gabarito
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminCorrectionType('anular_questao')}
                    className={`py-3 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all text-center ${
                      adminCorrectionType === 'anular_questao'
                        ? 'bg-red-500/10 text-red-400 border-red-500/30 font-bold'
                        : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300'
                    }`}
                  >
                    Anular Questão
                  </button>
                </div>
              </div>

              {/* New alternative choice if alterar_gabarito */}
              {adminCorrectionType === 'alterar_gabarito' && (
                <div className="bg-emerald-950/15 border border-emerald-900/20 p-4 rounded-xl space-y-3 animate-in slide-in-from-top-2 duration-300">
                  <div className="flex items-center gap-2 text-emerald-500">
                    <ShieldAlert size={14} />
                    <span className="text-[10px] font-black uppercase tracking-wider">Novo Gabarito Oficial</span>
                  </div>
                  <p className="text-[10px] text-zinc-400 uppercase leading-normal">
                    Selecione qual será a nova alternativa correta para esta questão. O sistema recalculará a pontuação de todos os candidatos de forma automática.
                  </p>
                  <select
                    value={adminCorrectionNewAlternative}
                    onChange={(e) => setAdminCorrectionNewAlternative(e.target.value)}
                    className="w-full bg-zinc-950 text-white text-xs font-bold p-3 rounded-lg border border-zinc-800 focus:border-brand-red focus:outline-none uppercase"
                  >
                    {['A', 'B', 'C', 'D', 'E'].map(opt => (
                      <option key={opt} value={opt}>Alternativa {opt}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Justification Textarea */}
              <div>
                <label className="block text-[10px] font-black uppercase text-zinc-500 tracking-wider mb-2">Justificativa / Fundamentação Oficial da Banca</label>
                <p className="text-[9px] text-zinc-500 uppercase tracking-wide mb-2 leading-normal">
                  Esta justificativa ficará visível para os alunos na seção de retificações oficiais do simulado.
                </p>
                <textarea
                  placeholder="Escreva detalhadamente a justificativa para a anulação ou alteração tomada diretamente pela banca..."
                  value={adminCorrectionJustification}
                  onChange={(e) => setAdminCorrectionJustification(e.target.value)}
                  className="w-full min-h-[100px] bg-zinc-900 text-white text-xs font-semibold p-3 rounded-lg border border-zinc-800 focus:border-brand-red focus:outline-none resize-none font-medium"
                  required
                />
              </div>

              {/* Submit / Cancel Buttons */}
              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800/50">
                <button
                  type="button"
                  onClick={() => setIsAdminCorrectionModalOpen(false)}
                  className="px-4 py-2 bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAdminCorrection}
                  className="px-5 py-2 bg-brand-red hover:bg-red-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2"
                >
                  {isSubmittingAdminCorrection ? 'Processando...' : 'Aplicar Retificação'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RANKING MODAL */}
      {isRankingModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-300 p-4">
          <div className="w-full max-w-4xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[80vh] animate-in zoom-in-95 duration-300">
            {/* Modal Header */}
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-purple-600/20 rounded-xl flex items-center justify-center text-purple-500 border border-purple-500/20">
                    <Trophy size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white uppercase tracking-tighter leading-none">Ranking Geral</h3>
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">Classificação oficial por nota líquida</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
                    <input 
                      value={rankingSearch}
                      onChange={(e) => setRankingSearch(e.target.value)}
                      placeholder="BUSCAR PELO NOME..."
                      className="bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-4 py-2 text-xs font-bold text-white focus:outline-none focus:border-purple-500 w-64 uppercase"
                    />
                  </div>
                  <button 
                    onClick={() => setIsRankingModalOpen(false)}
                    className="p-2 hover:bg-zinc-800 text-zinc-500 hover:text-white rounded-lg transition-all"
                  >
                    <XIcon size={20} />
                  </button>
                </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
              <table className="w-full">
                <thead className="bg-zinc-900 text-[10px] font-black uppercase tracking-widest text-zinc-500 sticky top-0 z-10">
                  <tr>
                    <th className="p-4 text-center w-16">#</th>
                    <th className="p-4 text-left">Candidato</th>
                    <th className="p-4 text-center">Acertos</th>
                    <th className="p-4 text-center">Erros</th>
                    <th className="p-4 text-center">Média</th>
                    <th className="p-4 text-center">Nota Final</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900">
                  {examResults
                    .filter(r => r.studentName.toLowerCase().includes(rankingSearch.toLowerCase()))
                    .map((r, index) => (
                      <tr key={r.id} className="hover:bg-zinc-900/50 transition-colors">
                        <td className="p-4 text-center">
                          <span className={`font-mono font-black text-sm ${index < 3 ? 'text-yellow-500' : 'text-zinc-600'}`}>
                            {index === 0 ? <Medal size={18} className="mx-auto" /> : 
                             index === 1 ? <Medal size={18} className="mx-auto text-zinc-400" /> :
                             index === 2 ? <Medal size={18} className="mx-auto text-amber-700" /> :
                             `${index + 1}º`}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center overflow-hidden">
                              {r.studentPhoto ? <img src={r.studentPhoto} alt={r.studentName} className="w-full h-full object-cover" /> : <Users size={14} className="text-zinc-700" />}
                            </div>
                            <span className="text-xs font-black text-zinc-300 uppercase tracking-tight">{r.studentName}</span>
                          </div>
                        </td>
                        <td className="p-4 text-center text-emerald-500 font-bold">{r.correctCount}</td>
                        <td className="p-4 text-center text-red-500 font-bold">{r.wrongCount}</td>
                        <td className="p-4 text-center text-zinc-500 font-mono text-[10px]">{((r.score / (r.maxPossibleScore || r.totalQuestions || 1)) * 100).toFixed(1)}%</td>
                        <td className="p-4 text-center">
                          <span className="text-sm font-black text-white">{r.score.toFixed(1)}</span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            
            {/* Modal Footer */}
            <div className="p-4 bg-zinc-900/50 border-t border-zinc-800 flex justify-end">
              <button 
                onClick={() => setIsRankingModalOpen(false)}
                className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-all"
              >
                Fechar Visualização
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default SimulatedExamConsole;