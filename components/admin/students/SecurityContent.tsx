import React from 'react';
import { ShieldAlert, Unlock, Star, ShieldCheck, Loader2, Activity, User, RefreshCw, AlertCircle, CheckCircle, Info, Calendar, Clock, ChevronLeft, ChevronRight, HelpCircle } from 'lucide-react';
import { 
    Student, 
    unblockStudent, 
    blockStudent,
    setExceptionStatus, 
    clearActiveSessions,
    getBlockedStudents, 
    getWhitelistStudents, 
    searchStudentsGlobal,
    getStudentById
} from '../../../services/userService';
import { toast } from 'react-hot-toast';

interface Props {
    students: Student[];
    onUpdate: () => void;
}

const SecurityContent: React.FC<Props> = ({ students, onUpdate }) => {
    
    const [searchTerm, setSearchTerm] = React.useState('');
    const [blockedStudents, setBlockedStudents] = React.useState<Student[]>([]);
    const [exceptionStudents, setExceptionStudents] = React.useState<Student[]>([]);
    const [searchedStudents, setSearchedStudents] = React.useState<Student[]>([]);
    const [loadingSecurity, setLoadingSecurity] = React.useState(true);
    const [searching, setSearching] = React.useState(false);
    const [selectedStudent, setSelectedStudent] = React.useState<Student | null>(null);
    const [loadingSelected, setLoadingSelected] = React.useState(false);

    // Paginação das listas
    const [blockedPage, setBlockedPage] = React.useState(1);
    const [whitelistPage, setWhitelistPage] = React.useState(1);
    const pageSize = 10;

    // Estados do formulário de bloqueio inline
    const [isBlockFormActive, setIsBlockFormActive] = React.useState(false);
    const [blockType, setBlockType] = React.useState<'permanent' | 'suspension'>('permanent');
    const [blockReasonInput, setBlockReasonInput] = React.useState('');
    const [suspensionPeriod, setSuspensionPeriod] = React.useState<'1_day' | '7_days' | '30_days' | 'custom'>('1_day');
    const [customSuspensionDate, setCustomSuspensionDate] = React.useState('');

    const loadSecurityData = React.useCallback(async () => {
        try {
            setLoadingSecurity(true);
            const [blocked, whitelist] = await Promise.all([
                getBlockedStudents(),
                getWhitelistStudents()
            ]);
            setBlockedStudents(blocked);
            setExceptionStudents(whitelist);
        } catch (error) {
            console.error("Erro ao carregar dados de segurança:", error);
            toast.error("Erro ao carregar dados de segurança.");
        } finally {
            setLoadingSecurity(false);
        }
    }, []);

    React.useEffect(() => {
        loadSecurityData();
    }, [loadSecurityData]);

    React.useEffect(() => {
        const delayDebounceFn = setTimeout(async () => {
            const trimmed = searchTerm.trim();
            if (trimmed.length > 0) {
                setSearching(true);
                try {
                    const results = await searchStudentsGlobal(trimmed);
                    setSearchedStudents(results);
                } catch (error) {
                    console.error("Erro na busca de alunos:", error);
                } finally {
                    setSearching(false);
                }
            } else {
                setSearchedStudents([]);
            }
        }, 400);

        return () => clearTimeout(delayDebounceFn);
    }, [searchTerm]);

    const refreshSelectedStudentData = async (uid: string) => {
        setLoadingSelected(true);
        try {
            const updated = await getStudentById(uid);
            if (updated) {
                setSelectedStudent(updated);
            }
        } catch (error) {
            console.error("Erro ao atualizar dados do aluno selecionado:", error);
        } finally {
            setLoadingSelected(false);
        }
    };
    
    const handleUnblock = async (uid: string) => {
        try {
            await unblockStudent(uid);
            toast.success("Conta desbloqueada com sucesso!");
            await loadSecurityData();
            onUpdate();
            if (selectedStudent && selectedStudent.uid === uid) {
                await refreshSelectedStudentData(uid);
            }
        } catch (error) {
            toast.error("Erro ao desbloquear.");
        }
    };

    const handleApplyBlockOrSuspension = async () => {
        if (!selectedStudent) return;
        
        let suspendedUntil: string | null = null;
        let finalReason = blockReasonInput.trim() || (blockType === 'suspension' ? 'Suspensão Temporária' : 'Bloqueio de segurança');
        
        if (blockType === 'suspension') {
            const now = new Date();
            if (suspensionPeriod === '1_day') {
                now.setDate(now.getDate() + 1);
                suspendedUntil = now.toISOString();
            } else if (suspensionPeriod === '7_days') {
                now.setDate(now.getDate() + 7);
                suspendedUntil = now.toISOString();
            } else if (suspensionPeriod === '30_days') {
                now.setDate(now.getDate() + 30);
                suspendedUntil = now.toISOString();
            } else if (suspensionPeriod === 'custom') {
                if (!customSuspensionDate) {
                    toast.error("Por favor, selecione uma data e hora para a suspensão.");
                    return;
                }
                const customDate = new Date(customSuspensionDate);
                if (customDate <= now) {
                    toast.error("A data de suspensão deve ser no futuro.");
                    return;
                }
                suspendedUntil = customDate.toISOString();
            }
            finalReason = 'suspension';
        }

        try {
            await blockStudent(selectedStudent.uid, finalReason, suspendedUntil);
            toast.success(blockType === 'permanent' ? "Conta bloqueada com sucesso!" : "Conta suspensa temporariamente!");
            setIsBlockFormActive(false);
            setBlockReasonInput('');
            await loadSecurityData();
            onUpdate();
            await refreshSelectedStudentData(selectedStudent.uid);
        } catch (error) {
            toast.error("Erro ao aplicar bloqueio/suspensão.");
        }
    };

    const handleToggleException = async (uid: string, isException: boolean | undefined) => {
        try {
            await setExceptionStatus(uid, !isException);
            toast.success(!isException ? "Adicionado à lista de exceções!" : "Removido da lista de exceções.");
            await loadSecurityData();
            onUpdate();
            if (selectedStudent && selectedStudent.uid === uid) {
                await refreshSelectedStudentData(uid);
            }
        } catch (error) {
            toast.error("Erro ao alterar status de exceção.");
        }
    };

    const handleClearSessions = async (uid: string) => {
        try {
            await clearActiveSessions(uid);
            toast.success("Todas as conexões e sessões ativas foram redefinidas com sucesso!");
            await loadSecurityData();
            onUpdate();
            if (selectedStudent && selectedStudent.uid === uid) {
                await refreshSelectedStudentData(uid);
            }
        } catch (error) {
            toast.error("Erro ao limpar sessões.");
        }
    };

    // Paginação matemática de listas
    const totalBlockedPages = Math.max(1, Math.ceil(blockedStudents.length / pageSize));
    const paginatedBlocked = blockedStudents.slice(
        (blockedPage - 1) * pageSize,
        blockedPage * pageSize
    );

    const totalWhitelistPages = Math.max(1, Math.ceil(exceptionStudents.length / pageSize));
    const paginatedWhitelist = exceptionStudents.slice(
        (whitelistPage - 1) * pageSize,
        whitelistPage * pageSize
    );

    // Correção automática de página se os dados encolherem
    React.useEffect(() => {
        if (blockedPage > totalBlockedPages) {
            setBlockedPage(Math.max(1, totalBlockedPages));
        }
    }, [blockedStudents.length, totalBlockedPages, blockedPage]);

    React.useEffect(() => {
        if (whitelistPage > totalWhitelistPages) {
            setWhitelistPage(Math.max(1, totalWhitelistPages));
        }
    }, [exceptionStudents.length, totalWhitelistPages, whitelistPage]);

    const formatSuspensionDate = (dateString: string | undefined) => {
        if (!dateString) return '';
        try {
            const date = new Date(dateString);
            return date.toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        } catch (e) {
            return dateString;
        }
    };

    if (loadingSecurity) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-500 gap-2">
                <Loader2 className="animate-spin text-brand-red" size={24} />
                <span className="text-xs uppercase font-black tracking-widest">Carregando painel de segurança...</span>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            
            {/* PERSISTENT HERO / AUDIT PANEL */}
            {selectedStudent ? (
                <div className="bg-zinc-900 border-2 border-zinc-800 rounded-2xl p-6 relative overflow-hidden transition-all duration-300">
                    <div className="absolute top-0 right-0 p-4">
                        <button 
                            onClick={() => {
                                setSelectedStudent(null);
                                setIsBlockFormActive(false);
                            }}
                            className="text-zinc-500 hover:text-white uppercase text-[10px] font-black tracking-wider bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg border border-zinc-700"
                        >
                            Fechar Diagnóstico
                        </button>
                    </div>

                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2.5 bg-brand-red/10 border border-brand-red/20 text-brand-red rounded-xl">
                            <Activity size={20} />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-white uppercase tracking-wider">
                                Diagnóstico & Auditoria da Conta do Aluno
                            </h3>
                            <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">
                                Analise acessos simultâneos, geolocalização, aplique bloqueios ou suspensão temporária
                            </p>
                        </div>
                    </div>

                    {loadingSelected ? (
                        <div className="flex items-center justify-center py-8 text-zinc-500 gap-2">
                            <Loader2 className="animate-spin text-zinc-500" size={18} />
                            <span className="text-[10px] uppercase font-bold tracking-widest">Atualizando dados...</span>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Account Details */}
                            <div className="space-y-4">
                                <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-2">
                                    <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Dados Cadastrais</div>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-zinc-800 rounded-full flex items-center justify-center border border-zinc-700 text-white text-xs font-black uppercase">
                                            {selectedStudent.name?.split(' ').slice(0, 2).map(n => n[0]).join('') || <User size={16} />}
                                        </div>
                                        <div>
                                            <div className="text-xs font-bold text-white uppercase">{selectedStudent.name}</div>
                                            <div className="text-[10px] text-zinc-400">{selectedStudent.email}</div>
                                            <div className="text-[9px] text-zinc-600 font-mono mt-0.5">CPF: {selectedStudent.cpf || '---'}</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-2">
                                    <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Sessões & Conexões Ativas</div>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="text-xs font-bold text-white uppercase">
                                                {selectedStudent.activeSessionIds?.length || 0} conexões registradas
                                            </div>
                                            <p className="text-[9px] text-zinc-500 max-w-[280px] leading-relaxed uppercase mt-0.5">
                                                Limite de até 2 sessões simultâneas para estudantes normais.
                                            </p>
                                        </div>
                                        <button 
                                            onClick={() => handleClearSessions(selectedStudent.uid)}
                                            className="flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
                                        >
                                            <RefreshCw size={12} /> Limpar Conexões
                                        </button>
                                    </div>
                                    {selectedStudent.activeSessionIds && selectedStudent.activeSessionIds.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            {selectedStudent.activeSessionIds.map(id => (
                                                <span key={id} className="text-[9px] font-mono px-2 py-0.5 bg-zinc-900 border border-zinc-800 rounded text-zinc-400">
                                                    ID: {id}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Access Status Check */}
                            <div className="space-y-4">
                                <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-3">
                                    <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Estados Lógicos de Acesso</div>
                                    
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-zinc-900 p-3 rounded-lg border border-zinc-800 flex flex-col justify-center">
                                            <div className="text-[9px] font-bold text-zinc-500 uppercase">Bloqueio de Segurança</div>
                                            {selectedStudent.blocked ? (
                                                <span className="inline-flex items-center gap-1 text-red-500 text-xs font-black uppercase mt-1">
                                                    <AlertCircle size={14} /> {selectedStudent.blockReason === 'suspension' ? 'SUSPENSO TEMPORARIAMENTE' : 'BLOQUEADO'}
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-emerald-500 text-xs font-black uppercase mt-1">
                                                    <CheckCircle size={14} /> LIBERADO
                                                </span>
                                            )}
                                        </div>

                                        <div className="bg-zinc-900 p-3 rounded-lg border border-zinc-800 flex flex-col justify-center">
                                            <div className="text-[9px] font-bold text-zinc-500 uppercase">Lista de Exceções (Whitelist)</div>
                                            {selectedStudent.isException ? (
                                                <span className="inline-flex items-center gap-1 text-amber-500 text-xs font-black uppercase mt-1">
                                                    <Star className="fill-amber-500 text-amber-500" size={14} /> ATIVA (EXCEÇÃO)
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-zinc-500 text-xs font-black uppercase mt-1">
                                                    <Star size={14} /> INATIVA
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Exibição da Expiração de Suspensão */}
                                    {selectedStudent.blocked && selectedStudent.blockReason === 'suspension' && selectedStudent.suspendedUntil && (
                                        <div className="p-3 bg-red-950/20 border border-red-900/30 text-red-400 rounded-lg flex items-center gap-2">
                                            <Clock size={14} className="animate-pulse" />
                                            <span className="text-[10px] font-black uppercase tracking-wider">
                                                Acesso Suspenso até: {formatSuspensionDate(selectedStudent.suspendedUntil)}
                                            </span>
                                        </div>
                                    )}

                                    {/* Block details / historical logs */}
                                    <div className="bg-zinc-900 p-3 rounded-lg border border-zinc-800 space-y-1.5">
                                        <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1">
                                            <Info size={12} className="text-zinc-500" /> Histórico / Detalhes de Bloqueios Recentes
                                        </div>
                                        {selectedStudent.blockDetails ? (
                                            <div className="p-2.5 bg-zinc-950 border border-zinc-800 rounded text-[9px] font-mono text-zinc-400 leading-relaxed max-h-24 overflow-y-auto uppercase">
                                                {selectedStudent.blockDetails}
                                            </div>
                                        ) : (
                                            <p className="text-[10px] text-zinc-500 uppercase italic">Nenhum registro de alerta recente.</p>
                                        )}
                                        {selectedStudent.blockReason && selectedStudent.blockReason !== 'suspension' && (
                                            <div className="text-[10px] text-zinc-400 font-bold uppercase">
                                                Motivo Atual: <span className="text-red-500">{selectedStudent.blockReason}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Quick Controls / Forms */}
                                {isBlockFormActive ? (
                                    <div className="bg-zinc-950 p-4 rounded-xl border-2 border-red-900/50 space-y-4 animate-in slide-in-from-bottom-2 duration-200">
                                        <div className="text-[10px] font-black uppercase text-red-400 tracking-wider">
                                            Configurar Bloqueio / Suspensão
                                        </div>
                                        
                                        <div className="flex gap-4">
                                            <label className="flex items-center gap-1.5 text-xs text-white uppercase font-bold cursor-pointer">
                                                <input 
                                                    type="radio" 
                                                    checked={blockType === 'permanent'} 
                                                    onChange={() => setBlockType('permanent')} 
                                                    className="accent-brand-red"
                                                />
                                                Bloqueio Definitivo
                                            </label>
                                            <label className="flex items-center gap-1.5 text-xs text-white uppercase font-bold cursor-pointer">
                                                <input 
                                                    type="radio" 
                                                    checked={blockType === 'suspension'} 
                                                    onChange={() => setBlockType('suspension')} 
                                                    className="accent-brand-red"
                                                />
                                                Suspensão Temporária
                                            </label>
                                        </div>

                                        {blockType === 'permanent' ? (
                                            <div className="space-y-1">
                                                <span className="text-[9px] text-zinc-500 font-bold uppercase">Motivo do Bloqueio:</span>
                                                <input 
                                                    type="text" 
                                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-xs text-white uppercase placeholder-zinc-700"
                                                    placeholder="Ex: Compartilhamento de conta, pirataria..."
                                                    value={blockReasonInput}
                                                    onChange={(e) => setBlockReasonInput(e.target.value)}
                                                />
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                <div className="space-y-1">
                                                    <span className="text-[9px] text-zinc-500 font-bold uppercase block">Período da Suspensão:</span>
                                                    <select 
                                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-xs text-white uppercase"
                                                        value={suspensionPeriod}
                                                        onChange={(e: any) => setSuspensionPeriod(e.target.value)}
                                                    >
                                                        <option value="1_day">24 Horas (1 Dia)</option>
                                                        <option value="7_days">7 Dias (1 Semana)</option>
                                                        <option value="30_days">30 Dias (1 Mês)</option>
                                                        <option value="custom">Data e Hora Customizada</option>
                                                    </select>
                                                </div>

                                                {suspensionPeriod === 'custom' && (
                                                    <div className="space-y-1">
                                                        <span className="text-[9px] text-zinc-500 font-bold uppercase block">Data e Hora de Término:</span>
                                                        <input 
                                                            type="datetime-local" 
                                                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-xs text-white uppercase"
                                                            value={customSuspensionDate}
                                                            onChange={(e) => setCustomSuspensionDate(e.target.value)}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div className="flex gap-2 pt-2">
                                            <button 
                                                onClick={handleApplyBlockOrSuspension}
                                                className="flex-1 bg-red-600 hover:bg-red-500 text-white text-[10px] font-black uppercase tracking-wider py-2.5 rounded-lg border border-red-500 shadow-md transition-all"
                                            >
                                                Aplicar Restrição
                                            </button>
                                            <button 
                                                onClick={() => setIsBlockFormActive(false)}
                                                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-[10px] font-black uppercase tracking-wider py-2.5 rounded-lg border border-zinc-700 transition-all"
                                            >
                                                Cancelar
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => handleToggleException(selectedStudent.uid, selectedStudent.isException)}
                                            className={`flex-1 flex items-center justify-center gap-2 border px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 ${
                                                selectedStudent.isException 
                                                    ? 'bg-zinc-900 border-zinc-700 hover:bg-zinc-800 text-zinc-400' 
                                                    : 'bg-amber-600 border-amber-500 hover:bg-amber-500 text-white shadow-lg shadow-amber-950/20'
                                            }`}
                                        >
                                            <Star size={14} className={selectedStudent.isException ? '' : 'fill-white'} /> 
                                            {selectedStudent.isException ? "Remover Whitelist" : "Adicionar Whitelist"}
                                        </button>

                                        {selectedStudent.blocked ? (
                                            <button 
                                                onClick={() => handleUnblock(selectedStudent.uid)}
                                                className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 shadow-lg shadow-emerald-950/20"
                                            >
                                                <Unlock size={14} /> Desbloquear Aluno
                                            </button>
                                        ) : (
                                            <button 
                                                onClick={() => setIsBlockFormActive(true)}
                                                className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 border border-red-500 text-white px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 shadow-lg shadow-red-950/25"
                                            >
                                                <ShieldAlert size={14} /> Bloquear / Suspender
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                /* GORGEOUS INSTRUCTIONAL / SEARCH HERO CARD */
                <div className="bg-zinc-900/60 border-2 border-dashed border-zinc-800 rounded-2xl p-8 relative overflow-hidden transition-all duration-300">
                    <div className="flex flex-col md:flex-row items-center gap-6 justify-between">
                        <div className="space-y-3 max-w-xl">
                            <div className="flex items-center gap-2 text-brand-red text-xs font-black uppercase tracking-widest">
                                <Activity size={16} /> Painel de Diagnóstico & Controle de Acesso
                            </div>
                            <h3 className="text-xl font-black text-white uppercase tracking-tight">
                                Auditoria, Bloqueio Manual e Suspensões de Alunos
                            </h3>
                            <p className="text-xs text-zinc-400 leading-relaxed uppercase">
                                Esta área permite auditar, limpar logins e restringir acessos manualmente. Para configurar restrições de um aluno, siga os passos simples:
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[10px] text-zinc-500 font-bold uppercase pl-1 pt-1">
                                <div className="flex gap-2 items-start">
                                    <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700 flex items-center justify-center flex-shrink-0 text-[9px]">1</span>
                                    <span>Pesquise o aluno pelo Nome, E-mail ou CPF no campo ao lado.</span>
                                </div>
                                <div className="flex gap-2 items-start">
                                    <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700 flex items-center justify-center flex-shrink-0 text-[9px]">2</span>
                                    <span>Clique em <strong className="text-zinc-300">"Inspecionar"</strong> para abrir a ficha cadastral dele.</span>
                                </div>
                                <div className="flex gap-2 items-start">
                                    <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700 flex items-center justify-center flex-shrink-0 text-[9px]">3</span>
                                    <span>Escolha se deseja Bloquear Definitivamente ou aplicar Suspensão Temporária.</span>
                                </div>
                                <div className="flex gap-2 items-start">
                                    <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700 flex items-center justify-center flex-shrink-0 text-[9px]">4</span>
                                    <span>Remova as sessões presas de login clicando em <strong className="text-zinc-300">"Limpar Conexões"</strong>.</span>
                                </div>
                            </div>
                        </div>

                        {/* Search Bar Embedded directly in the welcome card */}
                        <div className="w-full md:w-80 space-y-2 bg-zinc-950 p-4 rounded-xl border border-zinc-800 flex-shrink-0">
                            <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block flex items-center gap-1">
                                <HelpCircle size={12} className="text-zinc-600" /> Inspecionar Aluno Agora:
                            </span>
                            <div className="relative">
                                <input 
                                    type="text" 
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-xs text-white uppercase placeholder-zinc-650 focus:outline-none focus:border-brand-red transition-all"
                                    placeholder="Nome, E-mail ou CPF..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                                {searching && (
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                        <Loader2 className="animate-spin text-zinc-500" size={14} />
                                    </div>
                                )}
                                {searchedStudents.length > 0 && (
                                    <div className="absolute z-10 w-full bg-zinc-900 border border-zinc-800 rounded-lg mt-1 max-h-48 overflow-y-auto shadow-2xl left-0 border-t-0">
                                        {searchedStudents.map(s => (
                                            <button 
                                                key={s.uid} 
                                                className="w-full text-left p-2.5 text-xs text-white hover:bg-zinc-800 border-b border-zinc-800 flex justify-between items-center transition-colors"
                                                onClick={() => {
                                                    setSelectedStudent(s);
                                                    setSearchTerm('');
                                                    setSearchedStudents([]);
                                                }}
                                            >
                                                <div>
                                                    <span className="font-bold block uppercase text-left">{s.name}</span>
                                                    <span className="text-[10px] text-zinc-500 block lowercase text-left">{s.email}</span>
                                                </div>
                                                <span className="text-[9px] uppercase tracking-wider font-black text-brand-red bg-brand-red/10 border border-brand-red/20 px-2.5 py-1 rounded flex-shrink-0">
                                                    Inspecionar
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Blocked Users Column */}
                <div className="bg-zinc-900/20 border border-zinc-800 rounded-2xl p-6 flex flex-col justify-between">
                    <div>
                        <h3 className="text-lg font-black text-white uppercase mb-4 flex items-center gap-2">
                            <ShieldAlert className="text-red-500" /> Contas Bloqueadas / Suspensas
                        </h3>
                        <div className="space-y-3 min-h-[300px]">
                            {blockedStudents.length === 0 && (
                                <p className="text-xs text-zinc-500 font-bold uppercase p-4 text-center">Nenhuma conta bloqueada.</p>
                            )}
                            {paginatedBlocked.map(s => (
                                <div key={s.uid} className="flex justify-between items-center bg-zinc-900 p-4 rounded-xl border border-zinc-800 animate-in fade-in duration-300">
                                    <div className="max-w-[180px] sm:max-w-xs">
                                        <button 
                                            onClick={() => setSelectedStudent(s)}
                                            className="font-bold text-white uppercase text-xs hover:text-red-400 text-left transition-colors block truncate"
                                        >
                                            {s.name}
                                        </button>
                                        <div className="text-[10px] text-zinc-500 truncate flex items-center gap-1">
                                            {s.blockReason === 'suspension' ? (
                                                <span className="text-amber-500 font-bold">
                                                    SUSPENSÃO TEMPORÁRIA {s.suspendedUntil ? `(ATÉ ${formatSuspensionDate(s.suspendedUntil)})` : ''}
                                                </span>
                                            ) : (
                                                <span>{s.blockReason || 'Bloqueio de segurança'}</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button 
                                            onClick={() => setSelectedStudent(s)} 
                                            className="text-zinc-500 hover:text-white text-[10px] uppercase font-bold tracking-wider px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg"
                                        >
                                            Inspecionar
                                        </button>
                                        <button onClick={() => handleUnblock(s.uid)} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider">
                                            <Unlock size={12} /> Desbloquear
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Paginação Contas Bloqueadas */}
                    {blockedStudents.length > pageSize && (
                        <div className="flex items-center justify-between border-t border-zinc-800/60 pt-4 mt-6">
                            <span className="text-[9px] text-zinc-500 font-bold uppercase">
                                Página {blockedPage} de {totalBlockedPages} ({blockedStudents.length} bloqueios)
                            </span>
                            <div className="flex gap-1">
                                <button 
                                    onClick={() => setBlockedPage(p => Math.max(1, p - 1))}
                                    disabled={blockedPage === 1}
                                    className="p-1.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-all"
                                >
                                    <ChevronLeft size={14} />
                                </button>
                                <button 
                                    onClick={() => setBlockedPage(p => Math.min(totalBlockedPages, p + 1))}
                                    disabled={blockedPage === totalBlockedPages}
                                    className="p-1.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-all"
                                >
                                    <ChevronRight size={14} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Whitelist Column */}
                <div className="bg-zinc-900/20 border border-zinc-800 rounded-2xl p-6 flex flex-col justify-between">
                    <div>
                        <h3 className="text-lg font-black text-white uppercase mb-4 flex items-center gap-2">
                            <Star className="text-amber-500" /> Exceções (Whitelist)
                        </h3>
                        <div className="space-y-3 min-h-[300px]">
                            {exceptionStudents.length === 0 && (
                                <p className="text-xs text-zinc-500 font-bold uppercase p-4 text-center">Nenhuma conta na whitelist.</p>
                            )}
                            {paginatedWhitelist.map(s => (
                                <div key={s.uid} className="flex justify-between items-center bg-zinc-900 p-4 rounded-xl border border-zinc-800 animate-in fade-in duration-300">
                                    <div className="max-w-[180px] sm:max-w-xs">
                                        <button 
                                            onClick={() => setSelectedStudent(s)}
                                            className="font-bold text-white uppercase text-xs hover:text-amber-400 text-left transition-colors block truncate"
                                        >
                                            {s.name}
                                        </button>
                                        <div className="text-[9px] text-zinc-500 truncate">{s.email}</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button 
                                            onClick={() => setSelectedStudent(s)} 
                                            className="text-zinc-500 hover:text-white text-[10px] uppercase font-bold tracking-wider px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg"
                                        >
                                            Inspecionar
                                        </button>
                                        <button onClick={() => handleToggleException(s.uid, s.isException)} className="text-amber-500 hover:text-red-500">
                                            <ShieldCheck size={18} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Paginação Whitelist & Search */}
                    <div>
                        {exceptionStudents.length > pageSize && (
                            <div className="flex items-center justify-between border-t border-zinc-800/60 pt-4 mt-6">
                                <span className="text-[9px] text-zinc-500 font-bold uppercase">
                                    Página {whitelistPage} de {totalWhitelistPages} ({exceptionStudents.length} membros)
                                </span>
                                <div className="flex gap-1">
                                    <button 
                                        onClick={() => setWhitelistPage(p => Math.max(1, p - 1))}
                                        disabled={whitelistPage === 1}
                                        className="p-1.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-all"
                                    >
                                        <ChevronLeft size={14} />
                                    </button>
                                    <button 
                                        onClick={() => setWhitelistPage(p => Math.min(totalWhitelistPages, p + 1))}
                                        disabled={whitelistPage === totalWhitelistPages}
                                        className="p-1.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-all"
                                    >
                                        <ChevronRight size={14} />
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="mt-4 pt-4 border-t border-zinc-800">
                             <p className="text-[10px] text-zinc-500 italic mb-2 uppercase">Pesquisar aluno em todo o banco (Auditoria ou Whitelist):</p>
                             <div className="relative">
                                <input 
                                    type="text" 
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-xs text-white uppercase placeholder-zinc-600"
                                    placeholder="Digite Nome, E-mail ou CPF..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                                {searching && (
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                        <Loader2 className="animate-spin text-zinc-500" size={14} />
                                    </div>
                                )}
                                {searchedStudents.length > 0 && (
                                    <div className="absolute z-10 w-full bg-zinc-800 border border-zinc-700 rounded-lg mt-1 max-h-48 overflow-y-auto shadow-2xl">
                                        {searchedStudents.map(s => (
                                            <button 
                                                key={s.uid} 
                                                className="w-full text-left p-2.5 text-xs text-white hover:bg-zinc-700 border-b border-zinc-700 flex justify-between items-center transition-colors"
                                                onClick={() => {
                                                    setSelectedStudent(s);
                                                    setSearchTerm('');
                                                    setSearchedStudents([]);
                                                }}
                                            >
                                                <div>
                                                    <span className="font-bold block uppercase text-left">{s.name}</span>
                                                    <span className="text-[10px] text-zinc-400 block lowercase text-left">{s.email}</span>
                                                </div>
                                                <span className="text-[9px] uppercase tracking-wider font-black text-brand-red bg-brand-red/10 border border-brand-red/20 px-2.5 py-1 rounded">
                                                    Inspecionar
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                             </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SecurityContent;
