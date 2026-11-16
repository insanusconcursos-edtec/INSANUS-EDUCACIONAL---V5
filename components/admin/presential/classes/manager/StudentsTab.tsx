/* eslint-disable react/prop-types */
import React, { useState, useEffect, useMemo } from 'react';
import { Search, MessageCircle, User, Star, Loader2, RefreshCw, Users, FileCheck2, FolderSync, Clock, History, Save } from 'lucide-react';
import { getStudentsByClass, batchReleaseClassAccess } from '../../../../../services/studentService';
import { classService } from '../../../../../services/classService';
import { autentiqueAdminService } from '../../../../../services/autentiqueAdminService';
import { Class } from '../../../../../types/class';
import { AutentiqueSyncedContract } from '../../../../../types/autentique';
import { toast } from 'react-hot-toast';

interface Props {
  classId: string;
  cls?: Class | null;
  onClassRefresh?: () => void;
}

export const StudentsTab: React.FC<Props> = ({ classId, cls, onClassRefresh }) => {
  const [students, setStudents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // States para liberação em lote
  const [classesList, setClassesList] = useState<any[]>([]);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [targetClassId, setTargetClassId] = useState('');
  const [accessDays, setAccessDays] = useState(365);
  const [selectedStudentType, setSelectedStudentType] = useState<'all' | 'regular' | 'scholarship'>('all');
  const [keepScholarship, setKeepScholarship] = useState(true);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);

  // States para PopUp de confirmação de segurança
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmData, setConfirmData] = useState<{
    targetClassName: string;
    affectedCount: number;
    days: number;
  } | null>(null);

  // States para Automação Autentique
  const [autentiqueLogs, setAutentiqueLogs] = useState<AutentiqueSyncedContract[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [showLogsPanel, setShowLogsPanel] = useState(false);
  const [logSearch, setLogSearch] = useState('');
  const [isSyncingAutentique, setIsSyncingAutentique] = useState(false);
  const [editableAutentiqueDays, setEditableAutentiqueDays] = useState<number>(
    Number(cls?.autentiqueAccessDays) > 0 ? Number(cls?.autentiqueAccessDays) : 60
  );
  const [savingAutentiqueDays, setSavingAutentiqueDays] = useState(false);

  useEffect(() => {
    setEditableAutentiqueDays(
      Number(cls?.autentiqueAccessDays) > 0 ? Number(cls?.autentiqueAccessDays) : 60
    );
  }, [cls?.autentiqueAccessDays]);

  const loadAutentiqueLogs = async () => {
    if (!classId) return;
    setLoadingLogs(true);
    try {
      const logs = await autentiqueAdminService.fetchLogs(classId);
      setAutentiqueLogs(logs);
    } catch (error) {
      console.error('Erro ao carregar histórico de contratos Autentique:', error);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (classId && cls?.autentiqueEnabled) {
      loadAutentiqueLogs();
    }
  }, [classId, cls?.autentiqueEnabled, refreshTrigger]);

  const handleSyncClassAutentique = async () => {
    if (!classId) return;
    setIsSyncingAutentique(true);
    try {
      const summary = await autentiqueAdminService.syncClass(classId);
      if (summary) {
        if (summary.newlyCreatedStudents > 0 || summary.existingReleasedStudents > 0) {
          toast.success(
            `Autentique sincronizado: ${summary.newlyCreatedStudents} novo(s) cadastro(s) e ${summary.existingReleasedStudents} acesso(s) liberado(s)!`
          );
        } else if (summary.errors && summary.errors.length > 0) {
          toast.error(`Sincronizado com avisos: ${summary.errors[0]}`);
        } else {
          toast.success(
            `Pasta verificada (${summary.scannedDocuments} documento(s)): nenhum contrato pendente.`
          );
        }
      }
      setRefreshTrigger((prev) => prev + 1);
      if (onClassRefresh) onClassRefresh();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao sincronizar pasta do Autentique.');
    } finally {
      setIsSyncingAutentique(false);
    }
  };

  const handleSaveAutentiqueDays = async () => {
    if (!classId || editableAutentiqueDays < 1) {
      toast.error('O prazo de acesso deve ser de pelo menos 1 dia.');
      return;
    }
    setSavingAutentiqueDays(true);
    try {
      await classService.updateClass(classId, { autentiqueAccessDays: editableAutentiqueDays });
      toast.success(`Prazo padrão atualizado para ${editableAutentiqueDays} dias.`);
      if (onClassRefresh) onClassRefresh();
    } catch {
      toast.error('Erro ao salvar prazo de acesso da turma.');
    } finally {
      setSavingAutentiqueDays(false);
    }
  };

  const filteredAutentiqueLogs = useMemo(() => {
    if (!logSearch.trim()) return autentiqueLogs;
    const term = logSearch.toLowerCase();
    return autentiqueLogs.filter(
      (item) =>
        (item.studentName || '').toLowerCase().includes(term) ||
        (item.studentEmail || '').toLowerCase().includes(term) ||
        (item.documentName || '').toLowerCase().includes(term)
    );
  }, [autentiqueLogs, logSearch]);

  useEffect(() => {
    const fetchStudents = async () => {
      setIsLoading(true);
      try {
        const data = await getStudentsByClass(classId);
        // Ordena alfabeticamente
        data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setStudents(data);
      } catch (error) {
        console.error("Erro ao buscar alunos da turma:", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (classId) fetchStudents();
  }, [classId, refreshTrigger]);

  // Carrega as outras turmas presenciais para a liberação em lote
  useEffect(() => {
    const fetchOtherClasses = async () => {
      try {
        const list = await classService.getClasses();
        // Filtra para remover a turma atual e ordena alfabeticamente
        const filtered = list.filter(c => c.id !== classId);
        filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setClassesList(filtered);
      } catch (error) {
        console.error("Erro ao carregar outras turmas presenciais:", error);
      }
    };

    if (classId) {
      fetchOtherClasses();
    }
  }, [classId]);

  const handleInitiateBatch = () => {
    if (!targetClassId) {
      toast.error("Por favor, selecione a turma de destino.");
      return;
    }
    if (accessDays <= 0) {
      toast.error("O tempo de acesso deve ser de pelo menos 1 dia.");
      return;
    }

    const targetClass = classesList.find(c => c.id === targetClassId);
    if (!targetClass) {
      toast.error("Turma de destino inválida.");
      return;
    }

    const affectedStudentsCount = selectedStudentType === 'all'
      ? students.length
      : selectedStudentType === 'regular'
        ? students.filter(s => !s.classAccess?.isScholarship).length
        : students.filter(s => s.classAccess?.isScholarship).length;

    if (affectedStudentsCount === 0) {
      toast.error("Não há alunos correspondentes ao filtro de origem para liberar.");
      return;
    }

    setConfirmData({
      targetClassName: targetClass.name,
      affectedCount: affectedStudentsCount,
      days: accessDays
    });
    setShowConfirmModal(true);
  };

  const handleConfirmExecution = async () => {
    if (!targetClassId || !confirmData) return;

    setIsProcessingBatch(true);
    try {
      const resultCount = await batchReleaseClassAccess(
        classId,
        targetClassId,
        confirmData.targetClassName,
        accessDays,
        selectedStudentType,
        keepScholarship
      );

      toast.success(`${resultCount} aluno(s) receberam acesso à turma "${confirmData.targetClassName.toUpperCase()}" com sucesso!`);
      setShowConfirmModal(false);
      setConfirmData(null);
      setShowBatchModal(false);
      setRefreshTrigger(prev => prev + 1);
    } catch (error) {
      console.error("Erro ao executar liberação em lote:", error);
      toast.error("Ocorreu um erro ao liberar acesso em lote.");
    } finally {
      setIsProcessingBatch(false);
    }
  };


  // Filtra e divide as listas (Memoizado para performance)
  const { regularStudents, scholarshipStudents } = useMemo(() => {
    const filtered = students.filter(student => {
      const term = searchTerm.toLowerCase();
      return (
        (student.name || '').toLowerCase().includes(term) ||
        (student.email || '').toLowerCase().includes(term) ||
        (student.cpf || '').includes(term)
      );
    });

    const regular = filtered.filter(s => !s.classAccess?.isScholarship);
    const scholarship = filtered.filter(s => s.classAccess?.isScholarship);

    return { regularStudents: regular, scholarshipStudents: scholarship };
  }, [students, searchTerm]);

  // Componente interno para renderizar o Card do Aluno
  const StudentCard = ({ student, isScholarship }: { student: any, isScholarship: boolean }) => {
    const access = student.classAccess;
    const phoneDigits = (student.whatsapp || student.phone)?.replace(/\D/g, '');
    
    return (
      <div className={`p-4 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition ${isScholarship ? 'bg-blue-900/10 border-blue-900/50 hover:border-blue-700' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'}`}>
        <div className="flex items-center gap-4">
          {/* Avatar */}
          {student.photoUrl ? (
            <img src={student.photoUrl} alt={student.name} className="w-12 h-12 rounded-full object-cover border-2 border-zinc-800" referrerPolicy="no-referrer" />
          ) : (
            <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg ${isScholarship ? 'bg-blue-900 text-blue-300' : 'bg-zinc-800 text-zinc-500'}`}>
              {(student.name || 'U').charAt(0).toUpperCase()}
            </div>
          )}
          
          {/* Dados do Aluno */}
          <div className="flex flex-col">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-white text-lg">{student.name}</h3>
              {isScholarship && <span className="flex items-center gap-1 bg-blue-900/50 text-blue-400 border border-blue-800 text-[10px] px-2 py-0.5 rounded uppercase font-bold"><Star size={10} /> Bolsista</span>}
              {access?.origin === 'AUTENTIQUE' && (
                <span className="flex items-center gap-1 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] px-2 py-0.5 rounded uppercase font-bold">
                  <FileCheck2 size={10} /> Contrato Autentique
                </span>
              )}
            </div>
            <div className="text-sm text-zinc-500 flex flex-col sm:flex-row sm:gap-3">
              <span>{student.email}</span>
              <span className="hidden sm:inline">•</span>
              <span>CPF: {student.cpf || 'Não informado'}</span>
            </div>
          </div>
        </div>

        {/* Dados de Acesso e Ações */}
        <div className="flex flex-col md:items-end gap-2 w-full md:w-auto">
          <div className="text-xs text-gray-400 grid grid-cols-2 md:text-right gap-x-4 gap-y-1 bg-gray-900/50 p-2 rounded-lg">
            <span>Dia Início: <strong className="text-gray-300">
              {(() => {
                const dateVal = access?.diaInicio || access?.startDate;
                if (!dateVal) return 'N/A';
                if (typeof dateVal.toDate === 'function') return dateVal.toDate().toLocaleDateString('pt-BR');
                return new Date(dateVal).toLocaleDateString('pt-BR');
              })()}
            </strong></span>
            <span>Dia Fim: <strong className="text-gray-300">
              {(() => {
                const dateVal = access?.diaFim || access?.endDate;
                if (!dateVal) return 'N/A';
                if (typeof dateVal.toDate === 'function') return dateVal.toDate().toLocaleDateString('pt-BR');
                return new Date(dateVal).toLocaleDateString('pt-BR');
              })()}
            </strong></span>
            <span className="col-span-2">Acesso: <strong className="text-gray-300">{access?.days || 0} dias</strong></span>
          </div>
          
          {phoneDigits && (
            <a 
              href={`https://wa.me/55${phoneDigits}`} 
              target="_blank" 
              rel="noopener noreferrer"
              className="mt-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg transition w-full md:w-auto"
            >
              <MessageCircle size={14} />
              WhatsApp
            </a>
          )}
        </div>
      </div>
    );
  };

  if (isLoading) return (
    <div className="p-8 flex flex-col items-center justify-center gap-3">
      <Loader2 className="animate-spin text-brand-red" size={32} />
      <span className="text-xs font-black text-zinc-500 uppercase tracking-widest">Carregando Alunos...</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Painel de Automação Autentique da Turma */}
      {cls?.autentiqueEnabled && cls?.autentiqueFolderId && (
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 shrink-0">
                <FolderSync className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Automação Autentique Vinculada
                  </h3>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold uppercase">
                    Liberação na Assinatura
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
                  <span>
                    Pasta:{' '}
                    <strong className="text-zinc-200">
                      {cls.autentiqueFolderName || cls.autentiqueFolderId}
                    </strong>
                  </span>
                  {cls.autentiqueLastSyncedAt && (
                    <span className="font-mono tabular-nums text-zinc-500">
                      Última leitura:{' '}
                      {new Date(cls.autentiqueLastSyncedAt).toLocaleString('pt-BR')}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Editor rápido do prazo padrão (60 dias ou customizado) */}
              <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5">
                <Clock className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-[10px] font-bold uppercase text-zinc-400">Prazo:</span>
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={editableAutentiqueDays}
                  onChange={(e) => setEditableAutentiqueDays(parseInt(e.target.value, 10) || 0)}
                  className="w-14 bg-transparent text-xs font-mono tabular-nums font-bold text-white text-right focus:outline-none"
                />
                <span className="text-[10px] font-bold uppercase text-zinc-500">dias</span>
                {editableAutentiqueDays !== (cls.autentiqueAccessDays || 60) && (
                  <button
                    type="button"
                    onClick={handleSaveAutentiqueDays}
                    disabled={savingAutentiqueDays}
                    className="ml-1 flex items-center gap-1 px-2 py-0.5 rounded bg-brand-red hover:bg-red-600 text-white text-[10px] font-bold uppercase transition-colors disabled:opacity-50"
                    title="Salvar novo prazo de acesso"
                  >
                    <Save className="w-3 h-3" />
                    Salvar
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowLogsPanel((prev) => !prev)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-bold uppercase tracking-wider text-zinc-200 transition-colors font-mono tabular-nums"
              >
                <History className="w-3.5 h-3.5 text-zinc-400" />
                Contratos ({autentiqueLogs.length})
              </button>

              <button
                type="button"
                onClick={handleSyncClassAutentique}
                disabled={isSyncingAutentique}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingAutentique ? 'animate-spin' : ''}`} />
                {isSyncingAutentique ? 'Sincronizando...' : 'Sincronizar Pasta'}
              </button>
            </div>
          </div>

          {showLogsPanel && (
            <div className="pt-4 border-t border-zinc-800 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Histórico de Contratos Assinados & Liberações Automáticas
                </span>
                <div className="relative w-full sm:w-72">
                  <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    placeholder="Filtrar aluno, e-mail ou contrato..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-brand-red"
                  />
                </div>
              </div>

              {loadingLogs ? (
                <div className="py-6 text-center text-xs text-zinc-500 uppercase font-bold tracking-wider">
                  Carregando registros do Autentique...
                </div>
              ) : filteredAutentiqueLogs.length === 0 ? (
                <div className="py-6 px-4 text-center border border-dashed border-zinc-800 rounded-lg text-xs text-zinc-500">
                  Nenhum contrato processado ainda para esta pasta. Clique em &quot;Sincronizar Pasta&quot; para verificar contratos já assinados.
                </div>
              ) : (
                <div className="overflow-x-auto border border-zinc-800 rounded-lg">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-zinc-950/80 border-b border-zinc-800 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                        <th className="py-2.5 px-3">Aluno / E-mail</th>
                        <th className="py-2.5 px-3">Contrato (Autentique)</th>
                        <th className="py-2.5 px-3">Assinado em</th>
                        <th className="py-2.5 px-3 text-right">Prazo</th>
                        <th className="py-2.5 px-3">Ação Executada</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/70 text-xs">
                      {filteredAutentiqueLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-zinc-800/30 transition-colors">
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-white">{log.studentName}</div>
                            <div className="text-[11px] text-zinc-400">{log.studentEmail}</div>
                          </td>
                          <td className="py-2.5 px-3 text-zinc-300 max-w-[240px] truncate" title={log.documentName}>
                            {log.documentName}
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums text-zinc-400 whitespace-nowrap">
                            {log.signedAt
                              ? new Date(log.signedAt).toLocaleString('pt-BR', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : 'N/D'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-zinc-300 whitespace-nowrap">
                            {log.accessDays}d
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {log.actionTaken === 'CREATED_AND_RELEASED' && (
                              <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold uppercase">
                                Novo Cadastro + Liberado
                              </span>
                            )}
                            {log.actionTaken === 'EXISTING_USER_RELEASED' && (
                              <span className="px-2 py-0.5 rounded bg-blue-500/15 border border-blue-500/30 text-blue-400 text-[10px] font-bold uppercase">
                                Já Cadastrado + Liberado
                              </span>
                            )}
                            {log.actionTaken === 'ALREADY_HAD_ACCESS' && (
                              <span className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 text-[10px] font-bold uppercase">
                                Acesso Já Ativo
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Cabeçalho e Pesquisa */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <User className="text-red-500" /> Alunos Matriculados ({students.length})
          </h2>
          <button 
            onClick={() => setRefreshTrigger(prev => prev + 1)} 
            disabled={isLoading}
            className="p-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-md text-zinc-400 hover:text-white transition disabled:opacity-50"
            title="Sincronizar Lista"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin text-red-500' : ''} />
          </button>
          
          <button
            onClick={() => setShowBatchModal(prev => !prev)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wider rounded-lg transition"
          >
            <Users size={14} />
            Liberar Acesso em Lote
          </button>
        </div>

        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" size={18} />
          <input
            type="text"
            placeholder="Buscar por nome, e-mail ou CPF..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:border-brand-red transition"
          />
        </div>
      </div>

      {/* Container de Liberação em Lote */}
      {showBatchModal && (
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6 space-y-4 animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Users className="text-red-500" size={20} />
                Liberar Acesso em Lote (Migração de Alunos)
              </h3>
              <p className="text-sm text-zinc-400">
                Esta ferramenta permite liberar o acesso de alunos desta turma para outra turma presencial em poucos segundos.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
            {/* Turma de Destino */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Turma de Destino
              </label>
              <select
                value={targetClassId}
                onChange={(e) => setTargetClassId(e.target.value)}
                disabled={isProcessingBatch}
                className="bg-zinc-950 border border-zinc-800 text-sm text-white rounded-lg p-2.5 focus:outline-none focus:border-brand-red"
              >
                <option value="">Selecione a turma de destino...</option>
                {classesList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            {/* Tempo de Acesso (Dias) */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Tempo de Acesso (Dias)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  value={accessDays}
                  onChange={(e) => setAccessDays(parseInt(e.target.value) || 0)}
                  disabled={isProcessingBatch}
                  className="w-full bg-zinc-950 border border-zinc-800 text-sm text-white rounded-lg p-2.5 focus:outline-none focus:border-brand-red pr-14"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-500 uppercase">
                  Dias
                </span>
              </div>
              <span className="text-[10px] text-zinc-500 italic">
                {accessDays === 365 ? '365 dias = 1 ano' : accessDays === 180 ? '180 dias = ~6 meses' : `${accessDays} dias de validade`}
              </span>
            </div>

            {/* Filtro de Alunos */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Alunos Alvo
              </label>
              <select
                value={selectedStudentType}
                onChange={(e) => setSelectedStudentType(e.target.value as any)}
                disabled={isProcessingBatch}
                className="bg-zinc-950 border border-zinc-800 text-sm text-white rounded-lg p-2.5 focus:outline-none focus:border-brand-red"
              >
                <option value="all">Todos os Alunos ({students.length})</option>
                <option value="regular">Apenas Alunos Regulares ({students.filter(s => !s.classAccess?.isScholarship).length})</option>
                <option value="scholarship">Apenas Bolsistas ({students.filter(s => s.classAccess?.isScholarship).length})</option>
              </select>
            </div>

            {/* Configuração de Bolsista */}
            <div className="flex flex-col gap-1.5 justify-center">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-zinc-300 font-medium select-none">
                <input
                  type="checkbox"
                  checked={keepScholarship}
                  onChange={(e) => setKeepScholarship(e.target.checked)}
                  disabled={isProcessingBatch}
                  className="w-4 h-4 rounded border-zinc-800 bg-zinc-950 text-red-600 focus:ring-red-600 focus:ring-opacity-25"
                />
                <span>Manter status de bolsista original</span>
              </label>
              <span className="text-[10px] text-zinc-500 pl-6 leading-tight">
                Se ativado, alunos bolsistas continuarão como bolsistas na turma de destino. Se desativado, todos serão liberados como alunos regulares.
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-t border-zinc-800/80 pt-4 gap-4">
            <div className="text-sm text-zinc-400 flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-500 animate-pulse" />
              <span>
                Esta ação afetará exatamente{' '}
                <strong className="text-white">
                  {selectedStudentType === 'all'
                    ? students.length
                    : selectedStudentType === 'regular'
                      ? students.filter(s => !s.classAccess?.isScholarship).length
                      : students.filter(s => s.classAccess?.isScholarship).length}
                </strong>{' '}
                aluno(s).
              </span>
            </div>

            <div className="flex items-center gap-3 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => setShowBatchModal(false)}
                disabled={isProcessingBatch}
                className="px-4 py-2 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800 text-zinc-400 hover:text-white text-xs font-bold uppercase tracking-wider rounded-lg transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleInitiateBatch}
                disabled={isProcessingBatch || !targetClassId}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wider rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessingBatch ? (
                  <>
                    <Loader2 className="animate-spin" size={14} />
                    Processando...
                  </>
                ) : (
                  <>
                    Confirmar e Executar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PopUp de Confirmação de Segurança */}
      {showConfirmModal && confirmData && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-red-500">
              <span className="p-2.5 bg-red-500/10 rounded-lg">
                <Users size={24} />
              </span>
              <h4 className="text-lg font-bold text-white">Confirmação de Segurança</h4>
            </div>
            
            <div className="space-y-3 text-zinc-300 text-sm border-y border-zinc-800/80 py-4">
              <p>Você está prestes a realizar uma liberação de acesso em lote:</p>
              <ul className="space-y-2 text-zinc-400 pl-4 list-disc">
                <li>Origem: <strong className="text-white">Esta turma</strong></li>
                <li>Destino: <strong className="text-white">{confirmData.targetClassName.toUpperCase()}</strong></li>
                <li>Estudantes afetados: <strong className="text-white">{confirmData.affectedCount}</strong></li>
                <li>Período de acesso: <strong className="text-white">{confirmData.days} dias</strong></li>
              </ul>
              <p className="text-xs text-red-400 font-medium leading-relaxed bg-red-500/5 p-3 rounded-lg border border-red-500/10">
                Atenção: Esta ação concederá ou atualizará o acesso para os alunos selecionados em lote. Deseja realmente prosseguir e executar a ação?
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowConfirmModal(false);
                  setConfirmData(null);
                }}
                disabled={isProcessingBatch}
                className="px-4 py-2 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800 text-zinc-400 hover:text-white text-xs font-bold uppercase tracking-wider rounded-lg transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmExecution}
                disabled={isProcessingBatch}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wider rounded-lg transition disabled:opacity-50"
              >
                {isProcessingBatch ? (
                  <>
                    <Loader2 className="animate-spin" size={14} />
                    Processando...
                  </>
                ) : (
                  <>
                    Confirmar e Executar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lista de Alunos Regulares */}
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-800 pb-2">
          Alunos Regulares ({regularStudents.length})
        </h3>
        {regularStudents.length === 0 ? (
          <p className="text-zinc-600 text-sm italic">Nenhum aluno regular encontrado.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {regularStudents.map(student => <StudentCard key={student.id} student={student} isScholarship={false} />)}
          </div>
        )}
      </div>

      {/* Lista de Bolsistas */}
      <div className="flex flex-col gap-3 mt-4">
        <h3 className="text-sm font-bold text-blue-500 uppercase tracking-wider border-b border-zinc-800 pb-2 flex items-center gap-2">
          <Star size={14} /> Bolsistas ({scholarshipStudents.length})
        </h3>
        {scholarshipStudents.length === 0 ? (
          <p className="text-zinc-600 text-sm italic">Nenhum bolsista encontrado.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {scholarshipStudents.map(student => <StudentCard key={student.id} student={student} isScholarship={true} />)}
          </div>
        )}
      </div>
    </div>
  );
};
