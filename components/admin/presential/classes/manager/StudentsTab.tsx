/* eslint-disable react/prop-types */
import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  MessageCircle,
  User,
  Star,
  Loader2,
  RefreshCw,
  Users,
  FileCheck2,
  FolderSync,
  Clock,
  History,
  Save,
  Mail,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  UserX,
} from 'lucide-react';
import { getStudentsByClass, batchReleaseClassAccess } from '../../../../../services/studentService';
import { classService } from '../../../../../services/classService';
import { autentiqueAdminService } from '../../../../../services/autentiqueAdminService';
import { Class } from '../../../../../types/class';
import {
  AutentiqueSyncedContract,
  AutentiqueClassSyncResult,
  AutentiqueFolderXRay,
  AutentiquePendingDocItem,
} from '../../../../../types/autentique';
import { toast } from 'react-hot-toast';

interface Props {
  classId: string;
  cls?: Class | null;
  onClassRefresh?: () => void;
}

type ActiveAutentiquePanel =
  | 'NONE'
  | 'SYNCED_CONTRACTS'
  | 'UNSIGNED_DOCS'
  | 'MISSING_EMAIL_DOCS';

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

  // States para PopUp de confirmação de segurança (migração em lote)
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmData, setConfirmData] = useState<{
    targetClassName: string;
    affectedCount: number;
    days: number;
  } | null>(null);

  // States para Automação Autentique
  const [autentiqueLogs, setAutentiqueLogs] = useState<AutentiqueSyncedContract[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [activeAutentiquePanel, setActiveAutentiquePanel] = useState<ActiveAutentiquePanel>('NONE');
  const [logSearch, setLogSearch] = useState('');
  const [pendingSearch, setPendingSearch] = useState('');
  const [isSyncingAutentique, setIsSyncingAutentique] = useState(false);
  const [syncProgressText, setSyncProgressText] = useState<string | null>(null);
  const [lastSyncXRay, setLastSyncXRay] = useState<AutentiqueFolderXRay | null>(
    cls?.autentiqueLastXRay || null
  );
  const [resendingLogId, setResendingLogId] = useState<string | null>(null);
  const [isResendingFailedBatch, setIsResendingFailedBatch] = useState(false);
  const [editableAutentiqueDays, setEditableAutentiqueDays] = useState<number>(
    Number(cls?.autentiqueAccessDays) > 0 ? Number(cls?.autentiqueAccessDays) : 60
  );
  const [savingAutentiqueDays, setSavingAutentiqueDays] = useState(false);

  // Filtro e modal de confirmação para revogar acesso à turma (mantendo conta do aluno)
  const [contractStatusFilter, setContractStatusFilter] = useState<'ACTIVE' | 'REVOKED' | 'ALL'>(
    'ACTIVE'
  );
  const [logToRevoke, setLogToRevoke] = useState<AutentiqueSyncedContract | null>(null);
  const [blockFutureEmailOnRevoke, setBlockFutureEmailOnRevoke] = useState(false);
  const [isRevokingContract, setIsRevokingContract] = useState(false);

  useEffect(() => {
    setEditableAutentiqueDays(
      Number(cls?.autentiqueAccessDays) > 0 ? Number(cls?.autentiqueAccessDays) : 60
    );
  }, [cls?.autentiqueAccessDays]);

  useEffect(() => {
    if (cls?.autentiqueLastXRay) {
      setLastSyncXRay(cls.autentiqueLastXRay);
    }
  }, [cls?.autentiqueLastXRay]);

  const toggleAutentiquePanel = (panel: Exclude<ActiveAutentiquePanel, 'NONE'>) => {
    setActiveAutentiquePanel((prev) => (prev === panel ? 'NONE' : panel));
  };

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
    setSyncProgressText('Lendo pasta no Autentique...');

    let totalNewCreated = 0;
    let totalExistingReleased = 0;
    let totalEmailFailures = 0;
    let totalPurged = 0;
    let totalAutoRevoked = 0;
    let latestSummary: AutentiqueClassSyncResult | null = null;

    try {
      let batchNumber = 1;
      const maxBatches = 20;

      while (batchNumber <= maxBatches) {
        const summary = await autentiqueAdminService.syncClass(classId, 25);
        latestSummary = summary;

        if (!summary) break;

        totalNewCreated += summary.newlyCreatedStudents || 0;
        totalExistingReleased += summary.existingReleasedStudents || 0;
        totalEmailFailures += summary.emailFailures || 0;
        totalPurged += summary.purgedInvalidEnrollments || 0;
        totalAutoRevoked += summary.autoRevokedContracts || 0;

        if (!summary.hasMoreToSync || summary.remainingPendingToSync <= 0) {
          break;
        }

        batchNumber += 1;
        setSyncProgressText(
          `Lote ${batchNumber}: faltam ${summary.remainingPendingToSync} contrato(s)...`
        );
      }

      if (latestSummary) {
        setLastSyncXRay({
          scannedDocuments: latestSummary.scannedDocuments,
          signedStudentContractsFound: latestSummary.signedStudentContractsFound,
          unsignedDocuments: latestSummary.unsignedDocuments,
          missingEmailSigners: latestSummary.missingEmailSigners,
          activeSignedDocumentIds: latestSummary.activeSignedDocumentIds,
          unsignedItems: latestSummary.unsignedItems || [],
          missingEmailItems: latestSummary.missingEmailItems || [],
          updatedAt: new Date().toISOString(),
        });
      }

      if (totalAutoRevoked > 0) {
        toast.success(
          `${totalAutoRevoked} acesso(s) à turma revogado(s) automaticamente por remoção/cancelamento de contrato (conta do aluno preservada).`
        );
      }

      if (totalPurged > 0) {
        toast.success(
          `${totalPurged} cadastro(s) interno(s) titular(es) da conta removido(s) automaticamente!`
        );
      }

      if (totalNewCreated > 0 || totalExistingReleased > 0) {
        toast.success(
          `Sincronização concluída: ${totalNewCreated} novo(s) cadastro(s) e ${totalExistingReleased} acesso(s) liberado(s)!`
        );
      } else if (latestSummary?.errors && latestSummary.errors.length > 0) {
        toast.error(`Sincronizado com avisos: ${latestSummary.errors[0]}`);
      } else if (latestSummary && totalAutoRevoked === 0) {
        toast.success(
          `Pasta verificada (${latestSummary.scannedDocuments} doc(s)): ${latestSummary.signedStudentContractsFound} c/ e-mail, ${latestSummary.unsignedDocuments} aguardando, ${latestSummary.missingEmailSigners} sem e-mail.`
        );
      }

      if (totalEmailFailures > 0) {
        toast.error(
          `${totalEmailFailures} e-mail(s) falharam no SMTP. Você pode reenviá-los em "Contratos".`
        );
      }
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao sincronizar pasta do Autentique.');
    } finally {
      setSyncProgressText(null);
      setIsSyncingAutentique(false);
      setRefreshTrigger((prev) => prev + 1);
      if (onClassRefresh) onClassRefresh();
    }
  };

  const handleResendSingleAccess = async (log: AutentiqueSyncedContract) => {
    setResendingLogId(log.id);
    try {
      const outcome = await autentiqueAdminService.resendSingleEmail(log.id);
      if (outcome.sent) {
        toast.success(
          outcome.mode === 'WELCOME_NEW_PASSWORD'
            ? `Nova senha temporária enviada para ${log.studentEmail}!`
            : `Aviso de acesso reenviado para ${log.studentEmail}!`
        );
      } else {
        toast.error(`Falha no SMTP: ${outcome.error || 'Tente novamente em alguns minutos.'}`);
      }
      await loadAutentiqueLogs();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao reenviar acesso.');
    } finally {
      setResendingLogId(null);
    }
  };

  const handleResendAllFailedEmails = async () => {
    if (!classId) return;
    setIsResendingFailedBatch(true);
    try {
      const res = await autentiqueAdminService.resendFailedEmails(classId);
      if (res.resentSuccess > 0) {
        toast.success(`${res.resentSuccess} e-mail(s) reenviado(s) com sucesso!`);
      }
      if (res.resentFailed > 0) {
        toast.error(`${res.resentFailed} envio(s) ainda recusado(s) pelo SMTP.`);
      }
      await loadAutentiqueLogs();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao reenviar e-mails pendentes.');
    } finally {
      setIsResendingFailedBatch(false);
    }
  };

  const handleConfirmRevokeContract = async () => {
    if (!logToRevoke) return;
    setIsRevokingContract(true);
    try {
      const res = await autentiqueAdminService.revokeContract(
        logToRevoke.id,
        blockFutureEmailOnRevoke
      );
      toast.success(
        `Acesso à turma de "${res.studentName}" revogado com sucesso (conta do aluno mantida).`
      );
      setLogToRevoke(null);
      setRefreshTrigger((prev) => prev + 1);
      if (onClassRefresh) onClassRefresh();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao revogar acesso deste contrato.');
    } finally {
      setIsRevokingContract(false);
    }
  };

  const failedEmailCount = useMemo(
    () => autentiqueLogs.filter((l) => !l.accessRevoked && l.emailSent === false).length,
    [autentiqueLogs]
  );

  const activeLogsCount = useMemo(
    () => autentiqueLogs.filter((l) => !l.accessRevoked).length,
    [autentiqueLogs]
  );

  const revokedLogsCount = useMemo(
    () => autentiqueLogs.filter((l) => l.accessRevoked === true).length,
    [autentiqueLogs]
  );

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

  const activeSignedDocIdSet = useMemo(() => {
    const ids = lastSyncXRay?.activeSignedDocumentIds;
    if (!Array.isArray(ids)) return null;
    return new Set(ids);
  }, [lastSyncXRay?.activeSignedDocumentIds]);

  const isLogRemovedFromFolder = React.useCallback(
    (log: AutentiqueSyncedContract): boolean => {
      if (log.missingFromFolder === true) return true;
      if (activeSignedDocIdSet && log.documentId && !activeSignedDocIdSet.has(log.documentId)) {
        return true;
      }
      return false;
    },
    [activeSignedDocIdSet]
  );

  const unrevokedRemovedCount = useMemo(
    () => autentiqueLogs.filter((l) => !l.accessRevoked && isLogRemovedFromFolder(l)).length,
    [autentiqueLogs, isLogRemovedFromFolder]
  );

  const filteredAutentiqueLogs = useMemo(() => {
    const byStatus = autentiqueLogs.filter((item) => {
      if (contractStatusFilter === 'ACTIVE') return !item.accessRevoked;
      if (contractStatusFilter === 'REVOKED') return item.accessRevoked === true;
      return true;
    });

    const base = !logSearch.trim()
      ? byStatus
      : byStatus.filter((item) => {
          const term = logSearch.toLowerCase();
          return (
            (item.studentName || '').toLowerCase().includes(term) ||
            (item.studentEmail || '').toLowerCase().includes(term) ||
            (item.documentName || '').toLowerCase().includes(term)
          );
        });

    return [...base].sort((a, b) => {
      const aUnrevokedRemoved = !a.accessRevoked && isLogRemovedFromFolder(a) ? 1 : 0;
      const bUnrevokedRemoved = !b.accessRevoked && isLogRemovedFromFolder(b) ? 1 : 0;
      if (aUnrevokedRemoved !== bUnrevokedRemoved) return bUnrevokedRemoved - aUnrevokedRemoved;
      return new Date(b.syncedAt || 0).getTime() - new Date(a.syncedAt || 0).getTime();
    });
  }, [autentiqueLogs, contractStatusFilter, logSearch, isLogRemovedFromFolder]);

  const filterPendingItems = (items: AutentiquePendingDocItem[] | undefined) => {
    const list = Array.isArray(items) ? items : [];
    if (!pendingSearch.trim()) return list;
    const term = pendingSearch.toLowerCase();
    return list.filter(
      (item) =>
        (item.documentName || '').toLowerCase().includes(term) ||
        item.signers.some(
          (s) =>
            (s.name || '').toLowerCase().includes(term) ||
            (s.email || '').toLowerCase().includes(term) ||
            (s.phone || '').toLowerCase().includes(term)
        )
    );
  };

  const filteredUnsignedItems = useMemo(
    () => filterPendingItems(lastSyncXRay?.unsignedItems),
    [lastSyncXRay?.unsignedItems, pendingSearch]
  );

  const filteredMissingEmailItems = useMemo(
    () => filterPendingItems(lastSyncXRay?.missingEmailItems),
    [lastSyncXRay?.missingEmailItems, pendingSearch]
  );

  useEffect(() => {
    const fetchStudents = async () => {
      setIsLoading(true);
      try {
        const data = await getStudentsByClass(classId);
        data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setStudents(data);
      } catch (error) {
        console.error('Erro ao buscar alunos da turma:', error);
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
        const filtered = list.filter((c) => c.id !== classId);
        filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setClassesList(filtered);
      } catch (error) {
        console.error('Erro ao carregar outras turmas presenciais:', error);
      }
    };

    if (classId) {
      fetchOtherClasses();
    }
  }, [classId]);

  const handleInitiateBatch = () => {
    if (!targetClassId) {
      toast.error('Por favor, selecione a turma de destino.');
      return;
    }
    if (accessDays <= 0) {
      toast.error('O tempo de acesso deve ser de pelo menos 1 dia.');
      return;
    }

    const targetClass = classesList.find((c) => c.id === targetClassId);
    if (!targetClass) {
      toast.error('Turma de destino inválida.');
      return;
    }

    const affectedStudentsCount =
      selectedStudentType === 'all'
        ? students.length
        : selectedStudentType === 'regular'
          ? students.filter((s) => !s.classAccess?.isScholarship).length
          : students.filter((s) => s.classAccess?.isScholarship).length;

    if (affectedStudentsCount === 0) {
      toast.error('Não há alunos correspondentes ao filtro de origem para liberar.');
      return;
    }

    setConfirmData({
      targetClassName: targetClass.name,
      affectedCount: affectedStudentsCount,
      days: accessDays,
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

      toast.success(
        `${resultCount} aluno(s) receberam acesso à turma "${confirmData.targetClassName.toUpperCase()}" com sucesso!`
      );
      setShowConfirmModal(false);
      setConfirmData(null);
      setShowBatchModal(false);
      setRefreshTrigger((prev) => prev + 1);
    } catch (error) {
      console.error('Erro ao executar liberação em lote:', error);
      toast.error('Ocorreu um erro ao liberar acesso em lote.');
    } finally {
      setIsProcessingBatch(false);
    }
  };

  // Filtra e divide as listas (Memoizado para performance)
  const { regularStudents, scholarshipStudents } = useMemo(() => {
    const filtered = students.filter((student) => {
      const term = searchTerm.toLowerCase();
      return (
        (student.name || '').toLowerCase().includes(term) ||
        (student.email || '').toLowerCase().includes(term) ||
        (student.cpf || '').includes(term)
      );
    });

    const regular = filtered.filter((s) => !s.classAccess?.isScholarship);
    const scholarship = filtered.filter((s) => s.classAccess?.isScholarship);

    return { regularStudents: regular, scholarshipStudents: scholarship };
  }, [students, searchTerm]);

  // Componente interno para renderizar o Card do Aluno
  const StudentCard = ({ student, isScholarship }: { student: any; isScholarship: boolean }) => {
    const access = student.classAccess;
    const phoneDigits = (student.whatsapp || student.phone)?.replace(/\D/g, '');

    return (
      <div
        className={`p-4 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition ${
          isScholarship
            ? 'bg-blue-900/10 border-blue-900/50 hover:border-blue-700'
            : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
        }`}
      >
        <div className="flex items-center gap-4">
          {student.photoUrl ? (
            <img
              src={student.photoUrl}
              alt={student.name}
              className="w-12 h-12 rounded-full object-cover border-2 border-zinc-800"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg ${
                isScholarship ? 'bg-blue-900 text-blue-300' : 'bg-zinc-800 text-zinc-500'
              }`}
            >
              {(student.name || 'U').charAt(0).toUpperCase()}
            </div>
          )}

          <div className="flex flex-col">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-white text-lg">{student.name}</h3>
              {isScholarship && (
                <span className="flex items-center gap-1 bg-blue-900/50 text-blue-400 border border-blue-800 text-[10px] px-2 py-0.5 rounded uppercase font-bold">
                  <Star size={10} /> Bolsista
                </span>
              )}
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

        <div className="flex flex-col md:items-end gap-2 w-full md:w-auto">
          <div className="text-xs text-gray-400 grid grid-cols-2 md:text-right gap-x-4 gap-y-1 bg-gray-900/50 p-2 rounded-lg tabular-nums">
            <span>
              Dia Início:{' '}
              <strong className="text-gray-300">
                {(() => {
                  const dateVal = access?.diaInicio || access?.startDate;
                  if (!dateVal) return 'N/A';
                  if (typeof dateVal.toDate === 'function')
                    return dateVal.toDate().toLocaleDateString('pt-BR');
                  return new Date(dateVal).toLocaleDateString('pt-BR');
                })()}
              </strong>
            </span>
            <span>
              Dia Fim:{' '}
              <strong className="text-gray-300">
                {(() => {
                  const dateVal = access?.diaFim || access?.endDate;
                  if (!dateVal) return 'N/A';
                  if (typeof dateVal.toDate === 'function')
                    return dateVal.toDate().toLocaleDateString('pt-BR');
                  return new Date(dateVal).toLocaleDateString('pt-BR');
                })()}
              </strong>
            </span>
            <span className="col-span-2">
              Acesso: <strong className="text-gray-300">{access?.days || 0} dias</strong>
            </span>
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

  if (isLoading)
    return (
      <div className="p-8 flex flex-col items-center justify-center gap-3">
        <Loader2 className="animate-spin text-brand-red" size={32} />
        <span className="text-xs font-black text-zinc-500 uppercase tracking-widest">
          Carregando Alunos...
        </span>
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
              {/* Editor rápido do prazo padrão */}
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
                    className="ml-1 flex items-center gap-1 px-2 py-0.5 rounded bg-brand-red hover:bg-red-600 text-white text-[10px] font-bold uppercase transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
                    title="Salvar novo prazo de acesso"
                  >
                    <Save className="w-3 h-3" />
                    Salvar
                  </button>
                )}
              </div>

              {failedEmailCount > 0 && (
                <button
                  type="button"
                  onClick={handleResendAllFailedEmails}
                  disabled={isResendingFailedBatch}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50 font-mono tabular-nums whitespace-nowrap shrink-0"
                  title="Reenviar e-mails que falharam no SMTP"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {isResendingFailedBatch ? 'Reenviando...' : `Reenviar E-mails (${failedEmailCount})`}
                </button>
              )}

              <button
                type="button"
                onClick={() => toggleAutentiquePanel('SYNCED_CONTRACTS')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold uppercase tracking-wider transition-colors font-mono tabular-nums whitespace-nowrap shrink-0 ${
                  activeAutentiquePanel === 'SYNCED_CONTRACTS'
                    ? 'bg-zinc-700 border-zinc-500 text-white'
                    : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-200'
                }`}
              >
                <History className="w-3.5 h-3.5 text-zinc-400" />
                Contratos ({activeLogsCount})
              </button>

              <button
                type="button"
                onClick={handleSyncClassAutentique}
                disabled={isSyncingAutentique}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingAutentique ? 'animate-spin' : ''}`} />
                {isSyncingAutentique
                  ? syncProgressText || 'Sincronizando...'
                  : 'Sincronizar Pasta'}
              </button>
            </div>
          </div>

          {unrevokedRemovedCount > 0 ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-red-950/30 border border-red-500/30 rounded-lg px-3.5 py-2.5">
              <div className="flex items-center gap-2.5 text-xs text-red-200">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>
                  <strong className="font-mono tabular-nums text-white">
                    {unrevokedRemovedCount}
                  </strong>{' '}
                  contrato(s) removido(s)/cancelado(s) no Autentique aguardando revogação de acesso na sincronização.
                </span>
              </div>
              <button
                type="button"
                onClick={handleSyncClassAutentique}
                disabled={isSyncingAutentique}
                className="px-3 py-1 rounded bg-red-600 hover:bg-red-500 text-white text-[11px] font-bold uppercase tracking-wider transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                Sincronizar e Revogar
              </button>
            </div>
          ) : revokedLogsCount > 0 ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-950/70 border border-zinc-800 rounded-lg px-3.5 py-2">
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <UserX className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <span>
                  <strong className="font-mono tabular-nums text-zinc-200">
                    {revokedLogsCount}
                  </strong>{' '}
                  contrato(s) removido(s)/cancelado(s) tiveram o acesso à turma revogado — conta do aluno mantida.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setContractStatusFilter('REVOKED');
                  setActiveAutentiquePanel('SYNCED_CONTRACTS');
                }}
                className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-[10px] font-bold uppercase tracking-wider transition-colors whitespace-nowrap shrink-0"
              >
                Ver Revogados ({revokedLogsCount})
              </button>
            </div>
          ) : null}

          {/* Raio-X por Documento (Soma exata = Documentos na Pasta) */}
          {lastSyncXRay && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-3 border-t border-zinc-800/80">
              <div className="bg-zinc-950/70 border border-zinc-800 rounded-lg px-3.5 py-2.5 flex items-center justify-between">
                <div>
                  <span className="block text-[10px] font-bold uppercase text-zinc-500">
                    Documentos na Pasta
                  </span>
                  <strong className="text-base font-mono tabular-nums text-white">
                    {lastSyncXRay.scannedDocuments}
                  </strong>
                </div>
                <span className="text-[10px] text-zinc-500 font-mono tabular-nums">
                  100% por doc
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  setContractStatusFilter('ACTIVE');
                  toggleAutentiquePanel('SYNCED_CONTRACTS');
                }}
                className={`text-left bg-zinc-950/70 border rounded-lg px-3.5 py-2.5 flex items-center justify-between transition-colors ${
                  activeAutentiquePanel === 'SYNCED_CONTRACTS'
                    ? 'border-emerald-500/60 bg-emerald-950/20'
                    : 'border-zinc-800 hover:border-emerald-500/40 hover:bg-zinc-900'
                }`}
              >
                <div>
                  <span className="block text-[10px] font-bold uppercase text-emerald-500">
                    Assinados (Alunos)
                  </span>
                  <strong className="text-base font-mono tabular-nums text-emerald-400">
                    {lastSyncXRay.signedStudentContractsFound}
                  </strong>
                </div>
                <span className="flex items-center gap-1 text-[10px] font-semibold text-zinc-400 whitespace-nowrap shrink-0">
                  {activeAutentiquePanel === 'SYNCED_CONTRACTS' ? (
                    <>
                      Ocultar <ChevronUp className="w-3.5 h-3.5" />
                    </>
                  ) : (
                    <>
                      Ver lista <ChevronDown className="w-3.5 h-3.5" />
                    </>
                  )}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPendingSearch('');
                  toggleAutentiquePanel('UNSIGNED_DOCS');
                }}
                className={`text-left bg-zinc-950/70 border rounded-lg px-3.5 py-2.5 flex items-center justify-between transition-colors ${
                  activeAutentiquePanel === 'UNSIGNED_DOCS'
                    ? 'border-amber-500/60 bg-amber-950/20'
                    : 'border-zinc-800 hover:border-amber-500/40 hover:bg-zinc-900'
                }`}
              >
                <div>
                  <span className="block text-[10px] font-bold uppercase text-amber-500">
                    Aguardando Assinatura
                  </span>
                  <strong className="text-base font-mono tabular-nums text-amber-400">
                    {lastSyncXRay.unsignedDocuments}
                  </strong>
                </div>
                <span className="flex items-center gap-1 text-[10px] font-semibold text-zinc-400 whitespace-nowrap shrink-0">
                  {activeAutentiquePanel === 'UNSIGNED_DOCS' ? (
                    <>
                      Ocultar <ChevronUp className="w-3.5 h-3.5" />
                    </>
                  ) : (
                    <>
                      Ver lista <ChevronDown className="w-3.5 h-3.5" />
                    </>
                  )}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPendingSearch('');
                  toggleAutentiquePanel('MISSING_EMAIL_DOCS');
                }}
                className={`text-left bg-zinc-950/70 border rounded-lg px-3.5 py-2.5 flex items-center justify-between transition-colors ${
                  activeAutentiquePanel === 'MISSING_EMAIL_DOCS'
                    ? 'border-zinc-400 bg-zinc-800/60'
                    : 'border-zinc-800 hover:border-zinc-600 hover:bg-zinc-900'
                }`}
              >
                <div>
                  <span className="block text-[10px] font-bold uppercase text-zinc-400">
                    Assinados Sem E-mail
                  </span>
                  <strong className="text-base font-mono tabular-nums text-zinc-200">
                    {lastSyncXRay.missingEmailSigners}
                  </strong>
                </div>
                <span className="flex items-center gap-1 text-[10px] font-semibold text-zinc-400 whitespace-nowrap shrink-0">
                  {activeAutentiquePanel === 'MISSING_EMAIL_DOCS' ? (
                    <>
                      Ocultar <ChevronUp className="w-3.5 h-3.5" />
                    </>
                  ) : (
                    <>
                      Ver lista <ChevronDown className="w-3.5 h-3.5" />
                    </>
                  )}
                </span>
              </button>
            </div>
          )}

          {/* Painel 1: Contratos Assinados c/ E-mail e Liberações */}
          {activeAutentiquePanel === 'SYNCED_CONTRACTS' && (
            <div className="pt-4 border-t border-zinc-800 space-y-3">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                    Contratos &amp; Acessos ({filteredAutentiqueLogs.length})
                  </span>
                  <div className="inline-flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-0.5 text-[11px] font-mono tabular-nums">
                    <button
                      type="button"
                      onClick={() => setContractStatusFilter('ACTIVE')}
                      className={`px-2.5 py-1 rounded-md font-bold uppercase transition-colors whitespace-nowrap shrink-0 ${
                        contractStatusFilter === 'ACTIVE'
                          ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Ativos ({activeLogsCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setContractStatusFilter('REVOKED')}
                      className={`px-2.5 py-1 rounded-md font-bold uppercase transition-colors whitespace-nowrap shrink-0 ${
                        contractStatusFilter === 'REVOKED'
                          ? 'bg-red-600/20 text-red-400 border border-red-500/30'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Revogados ({revokedLogsCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setContractStatusFilter('ALL')}
                      className={`px-2.5 py-1 rounded-md font-bold uppercase transition-colors whitespace-nowrap shrink-0 ${
                        contractStatusFilter === 'ALL'
                          ? 'bg-zinc-800 text-white'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Todos ({autentiqueLogs.length})
                    </button>
                  </div>
                </div>

                <div className="relative w-full lg:w-72">
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
                  Nenhum contrato encontrado para este filtro.
                </div>
              ) : (
                <div className="overflow-x-auto border border-zinc-800 rounded-lg max-h-[420px] overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-zinc-950 border-b border-zinc-800 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                        <th className="py-2.5 px-3 w-10">#</th>
                        <th className="py-2.5 px-3">Aluno / E-mail</th>
                        <th className="py-2.5 px-3">Contrato (Autentique)</th>
                        <th className="py-2.5 px-3">Assinado em</th>
                        <th className="py-2.5 px-3 text-right">Prazo</th>
                        <th className="py-2.5 px-3">Status do Acesso</th>
                        <th className="py-2.5 px-3 text-right">Opções</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/70 text-xs">
                      {filteredAutentiqueLogs.map((log, idx) => {
                        const isRevoked = log.accessRevoked === true;
                        const removedFromFolder = isLogRemovedFromFolder(log);
                        return (
                          <tr
                            key={log.id}
                            className={`transition-colors ${
                              isRevoked
                                ? 'bg-zinc-950/60 opacity-80'
                                : removedFromFolder
                                  ? 'bg-red-950/25 hover:bg-red-950/35'
                                  : 'hover:bg-zinc-800/30'
                            }`}
                          >
                            <td className="py-2.5 px-3 font-mono tabular-nums text-zinc-500">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="font-semibold text-white">{log.studentName}</div>
                              <div className="text-[11px] text-zinc-400">{log.studentEmail}</div>
                            </td>
                            <td className="py-2.5 px-3 max-w-[260px]" title={log.documentName}>
                              <div className="text-zinc-300 truncate">{log.documentName}</div>
                              {isRevoked ? (
                                <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-red-400">
                                  <UserX className="w-3 h-3 shrink-0" />
                                  {log.revokeReason === 'CONTRACT_REMOVED_FROM_FOLDER'
                                    ? 'Contrato removido/cancelado no Autentique'
                                    : 'Acesso revogado manualmente'}
                                </div>
                              ) : removedFromFolder ? (
                                <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-red-400">
                                  <AlertTriangle className="w-3 h-3 shrink-0" />
                                  Removido da pasta no Autentique
                                </div>
                              ) : null}
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
                            <td className="py-2.5 px-3 whitespace-nowrap text-zinc-300">
                              {isRevoked ? (
                                <div>
                                  <span className="font-semibold text-red-400">
                                    Acesso revogado
                                  </span>
                                  <div className="text-[10px] text-zinc-500 font-mono tabular-nums">
                                    Conta mantida
                                    {log.revokedAt
                                      ? ` · ${new Date(log.revokedAt).toLocaleDateString('pt-BR')}`
                                      : ''}
                                  </div>
                                </div>
                              ) : (
                                <>
                                  {log.actionTaken === 'CREATED_AND_RELEASED' &&
                                    'Novo cadastro + liberado'}
                                  {log.actionTaken === 'EXISTING_USER_RELEASED' &&
                                    'Já cadastrado + liberado'}
                                  {log.actionTaken === 'ALREADY_HAD_ACCESS' && 'Acesso já ativo'}
                                  {log.emailSent === false && (
                                    <span
                                      className="ml-2 text-amber-400 font-semibold"
                                      title={log.emailError || 'Falha no envio SMTP'}
                                    >
                                      · Falha SMTP
                                    </span>
                                  )}
                                </>
                              )}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              {isRevoked ? (
                                <div className="text-right text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                                  Revogado
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleResendSingleAccess(log)}
                                    disabled={resendingLogId === log.id}
                                    className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[10px] font-bold uppercase text-zinc-200 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
                                    title="Reenviar e-mail de acesso (gera nova senha temporária se o aluno ainda nunca acessou)"
                                  >
                                    <Mail className="w-3 h-3" />
                                    {resendingLogId === log.id ? 'Enviando...' : 'Reenviar'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setBlockFutureEmailOnRevoke(false);
                                      setLogToRevoke(log);
                                    }}
                                    className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-900 hover:bg-red-950/60 border border-zinc-800 hover:border-red-500/40 text-[10px] font-bold uppercase text-zinc-400 hover:text-red-400 transition-colors whitespace-nowrap shrink-0"
                                    title="Revogar acesso desta turma presencial (mantém a conta do aluno)"
                                  >
                                    <UserX className="w-3 h-3" />
                                    Revogar Acesso
                                  </button>
                                </div>
                              )}
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

          {/* Painel 2: Contratos Aguardando Assinatura */}
          {activeAutentiquePanel === 'UNSIGNED_DOCS' && (
            <div className="pt-4 border-t border-zinc-800 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="block text-xs font-bold uppercase tracking-wider text-amber-400">
                    Contratos Aguardando Assinatura do Aluno ({filteredUnsignedItems.length})
                  </span>
                  <p className="text-xs text-zinc-400">
                    Documentos presentes na pasta em que o aluno ainda não concluiu a assinatura no Autentique.
                  </p>
                </div>
                <div className="relative w-full sm:w-72">
                  <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={pendingSearch}
                    onChange={(e) => setPendingSearch(e.target.value)}
                    placeholder="Buscar contrato ou signatário..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-brand-red"
                  />
                </div>
              </div>

              {!lastSyncXRay?.unsignedItems ? (
                <div className="py-6 px-4 text-center border border-dashed border-zinc-800 rounded-lg text-xs text-zinc-400">
                  Clique em <strong>Sincronizar Pasta</strong> acima para carregar os nomes detalhados dos contratos pendentes.
                </div>
              ) : filteredUnsignedItems.length === 0 ? (
                <div className="py-6 px-4 text-center border border-dashed border-zinc-800 rounded-lg text-xs text-zinc-500">
                  Nenhum contrato aguardando assinatura encontrado para este filtro.
                </div>
              ) : (
                <div className="overflow-x-auto border border-zinc-800 rounded-lg max-h-[420px] overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-zinc-950 border-b border-zinc-800 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                        <th className="py-2.5 px-3 w-10">#</th>
                        <th className="py-2.5 px-3">Nome do Contrato (Autentique)</th>
                        <th className="py-2.5 px-3">Signatário(s) Pendente(s)</th>
                        <th className="py-2.5 px-3">Contato no Autentique</th>
                        <th className="py-2.5 px-3 text-right">Criado em</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/70 text-xs">
                      {filteredUnsignedItems.map((item, idx) => (
                        <tr key={item.documentId} className="hover:bg-zinc-800/30 transition-colors">
                          <td className="py-2.5 px-3 font-mono tabular-nums text-zinc-500">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-white">
                            {item.documentName}
                          </td>
                          <td className="py-2.5 px-3 text-zinc-300">
                            {item.signers.map((s) => s.name).join(', ')}
                          </td>
                          <td className="py-2.5 px-3 text-zinc-400">
                            {item.signers
                              .map((s) => s.email || s.phone || 'Link sem e-mail')
                              .join(' · ')}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-zinc-400 whitespace-nowrap">
                            {item.createdAt
                              ? new Date(item.createdAt).toLocaleDateString('pt-BR')
                              : 'N/D'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Painel 3: Contratos Assinados Sem E-mail (Link / WhatsApp) */}
          {activeAutentiquePanel === 'MISSING_EMAIL_DOCS' && (
            <div className="pt-4 border-t border-zinc-800 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="block text-xs font-bold uppercase tracking-wider text-zinc-200">
                    Contratos Assinados Sem E-mail — Link / WhatsApp ({filteredMissingEmailItems.length})
                  </span>
                  <p className="text-xs text-zinc-400">
                    Contratos já assinados pelo aluno, mas enviados por link/WhatsApp sem endereço de e-mail cadastrado no Autentique.
                  </p>
                </div>
                <div className="relative w-full sm:w-72">
                  <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={pendingSearch}
                    onChange={(e) => setPendingSearch(e.target.value)}
                    placeholder="Buscar contrato ou quem assinou..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-brand-red"
                  />
                </div>
              </div>

              {!lastSyncXRay?.missingEmailItems ? (
                <div className="py-6 px-4 text-center border border-dashed border-zinc-800 rounded-lg text-xs text-zinc-400">
                  Clique em <strong>Sincronizar Pasta</strong> acima para listar o nome de cada contrato e de quem assinou sem e-mail.
                </div>
              ) : filteredMissingEmailItems.length === 0 ? (
                <div className="py-6 px-4 text-center border border-dashed border-zinc-800 rounded-lg text-xs text-zinc-500">
                  Nenhum contrato assinado sem e-mail encontrado para este filtro.
                </div>
              ) : (
                <div className="overflow-x-auto border border-zinc-800 rounded-lg max-h-[420px] overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-zinc-950 border-b border-zinc-800 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                        <th className="py-2.5 px-3 w-10">#</th>
                        <th className="py-2.5 px-3">Nome do Contrato (Autentique)</th>
                        <th className="py-2.5 px-3">Nome de Quem Assinou</th>
                        <th className="py-2.5 px-3">Telefone (Autentique)</th>
                        <th className="py-2.5 px-3 text-right">Assinado em</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/70 text-xs">
                      {filteredMissingEmailItems.map((item, idx) => {
                        const firstPhone = item.signers
                          .map((s) => (s.phone || '').replace(/\D/g, ''))
                          .find(Boolean);
                        return (
                          <tr key={item.documentId} className="hover:bg-zinc-800/30 transition-colors">
                            <td className="py-2.5 px-3 font-mono tabular-nums text-zinc-500">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-3 text-zinc-300">{item.documentName}</td>
                            <td className="py-2.5 px-3 font-semibold text-white">
                              {item.signers.map((s) => s.name).join(', ')}
                            </td>
                            <td className="py-2.5 px-3 text-zinc-400 font-mono tabular-nums whitespace-nowrap">
                              {firstPhone ? (
                                <a
                                  href={`https://wa.me/${firstPhone.startsWith('55') ? firstPhone : `55${firstPhone}`}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition-colors"
                                >
                                  <MessageCircle className="w-3.5 h-3.5" />
                                  {firstPhone}
                                </a>
                              ) : (
                                'Não informado'
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums text-zinc-400 whitespace-nowrap">
                              {item.signedAt
                                ? new Date(item.signedAt).toLocaleString('pt-BR', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : 'Assinado'}
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
        </div>
      )}

      {/* Modal de Confirmação para Revogar Acesso do Contrato */}
      {logToRevoke && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-500">
              <span className="p-2.5 bg-red-500/10 rounded-lg">
                <UserX size={20} />
              </span>
              <h4 className="text-base font-bold text-white">Revogar Acesso desta Turma</h4>
            </div>

            <div className="space-y-3 text-sm text-zinc-300 border-y border-zinc-800/80 py-4">
              <p>
                Deseja revogar o acesso liberado pelo contrato{' '}
                <strong className="text-white">{logToRevoke.documentName}</strong>?
              </p>
              <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs space-y-1">
                <div>
                  Aluno: <strong className="text-white">{logToRevoke.studentName}</strong>
                </div>
                <div>
                  E-mail: <strong className="text-zinc-300">{logToRevoke.studentEmail}</strong>
                </div>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                A conta de usuário do aluno e eventuais outros cursos/recursos na plataforma{' '}
                <strong className="text-zinc-200">permanecerão intactos</strong>. Apenas o acesso a
                esta turma presencial será encerrado.
              </p>
              <label className="flex items-start gap-2.5 pt-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={blockFutureEmailOnRevoke}
                  onChange={(e) => setBlockFutureEmailOnRevoke(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-red-600 focus:ring-red-600"
                />
                <span className="text-xs text-zinc-300">
                  Ignorar o e-mail <strong>{logToRevoke.studentEmail}</strong> nas próximas
                  sincronizações desta turma (marque apenas se for e-mail interno/corporativo).
                </span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setLogToRevoke(null)}
                disabled={isRevokingContract}
                className="px-4 py-2 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800 text-zinc-400 hover:text-white text-xs font-bold uppercase tracking-wider rounded-lg transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmRevokeContract}
                disabled={isRevokingContract}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wider rounded-lg transition disabled:opacity-50"
              >
                {isRevokingContract ? (
                  <>
                    <Loader2 className="animate-spin" size={14} />
                    Revogando...
                  </>
                ) : (
                  'Revogar Acesso'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cabeçalho e Pesquisa */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-bold text-white flex items-center gap-2 tabular-nums">
            <User className="text-red-500" /> Alunos Matriculados ({students.length})
          </h2>
          <button
            onClick={() => setRefreshTrigger((prev) => prev + 1)}
            disabled={isLoading}
            className="p-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-md text-zinc-400 hover:text-white transition disabled:opacity-50"
            title="Sincronizar Lista"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin text-red-500' : ''} />
          </button>

          <button
            onClick={() => setShowBatchModal((prev) => !prev)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wider rounded-lg transition whitespace-nowrap shrink-0"
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
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6 space-y-4">
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

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Tempo de Acesso (Dias)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  value={accessDays}
                  onChange={(e) => setAccessDays(parseInt(e.target.value, 10) || 0)}
                  disabled={isProcessingBatch}
                  className="w-full bg-zinc-950 border border-zinc-800 text-sm text-white rounded-lg p-2.5 focus:outline-none focus:border-brand-red pr-14 tabular-nums"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-500 uppercase">
                  Dias
                </span>
              </div>
              <span className="text-[10px] text-zinc-500 italic">
                {accessDays === 365
                  ? '365 dias = 1 ano'
                  : accessDays === 180
                    ? '180 dias = ~6 meses'
                    : `${accessDays} dias de validade`}
              </span>
            </div>

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
                <option value="regular">
                  Apenas Alunos Regulares ({students.filter((s) => !s.classAccess?.isScholarship).length})
                </option>
                <option value="scholarship">
                  Apenas Bolsistas ({students.filter((s) => s.classAccess?.isScholarship).length})
                </option>
              </select>
            </div>

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
            <div className="text-sm text-zinc-400 tabular-nums">
              Esta ação afetará exatamente{' '}
              <strong className="text-white">
                {selectedStudentType === 'all'
                  ? students.length
                  : selectedStudentType === 'regular'
                    ? students.filter((s) => !s.classAccess?.isScholarship).length
                    : students.filter((s) => s.classAccess?.isScholarship).length}
              </strong>{' '}
              aluno(s).
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
                  'Confirmar e Executar'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PopUp de Confirmação de Segurança */}
      {showConfirmModal && confirmData && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-500">
              <span className="p-2.5 bg-red-500/10 rounded-lg">
                <Users size={24} />
              </span>
              <h4 className="text-lg font-bold text-white">Confirmação de Segurança</h4>
            </div>

            <div className="space-y-3 text-zinc-300 text-sm border-y border-zinc-800/80 py-4">
              <p>Você está prestes a realizar uma liberação de acesso em lote:</p>
              <ul className="space-y-2 text-zinc-400 pl-4 list-disc tabular-nums">
                <li>
                  Origem: <strong className="text-white">Esta turma</strong>
                </li>
                <li>
                  Destino: <strong className="text-white">{confirmData.targetClassName.toUpperCase()}</strong>
                </li>
                <li>
                  Estudantes afetados: <strong className="text-white">{confirmData.affectedCount}</strong>
                </li>
                <li>
                  Período de acesso: <strong className="text-white">{confirmData.days} dias</strong>
                </li>
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
                  'Confirmar e Executar'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lista de Alunos Regulares */}
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-800 pb-2 tabular-nums">
          Alunos Regulares ({regularStudents.length})
        </h3>
        {regularStudents.length === 0 ? (
          <p className="text-zinc-600 text-sm italic">Nenhum aluno regular encontrado.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {regularStudents.map((student) => (
              <StudentCard key={student.id} student={student} isScholarship={false} />
            ))}
          </div>
        )}
      </div>

      {/* Lista de Bolsistas */}
      <div className="flex flex-col gap-3 mt-4">
        <h3 className="text-sm font-bold text-blue-500 uppercase tracking-wider border-b border-zinc-800 pb-2 flex items-center gap-2 tabular-nums">
          <Star size={14} /> Bolsistas ({scholarshipStudents.length})
        </h3>
        {scholarshipStudents.length === 0 ? (
          <p className="text-zinc-600 text-sm italic">Nenhum bolsista encontrado.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {scholarshipStudents.map((student) => (
              <StudentCard key={student.id} student={student} isScholarship={true} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
