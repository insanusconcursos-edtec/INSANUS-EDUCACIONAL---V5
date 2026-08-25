import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Users, UserCheck, UserPlus, GraduationCap, MessageCircle, ExternalLink, Search, Link as LinkIcon, X, Copy, Check, RefreshCw, Trash2, Play, Pause, ArrowLeft, FileText, CheckCircle } from 'lucide-react';
import { CourseEnrollment } from '../../../types/course';
import { differenceInDays, parseISO, format } from 'date-fns';
import toast from 'react-hot-toast';

interface AdminCourseStudentsTabProps {
  courseId: string;
}

export function AdminCourseStudentsTab({ courseId }: AdminCourseStudentsTabProps) {
  const [enrollments, setEnrollments] = useState<CourseEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'REGULAR' | 'MIGRACAO' | 'BOLSISTA'>('ALL');
  const [showMigrationModal, setShowMigrationModal] = useState(false);
  const [migrationConfig, setMigrationConfig] = useState({
    expiresAt: format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
    accessDurationDays: 365
  });
  const [generatedLink, setGeneratedLink] = useState<{ id: string; url: string; embed: string } | null>(null);
  const [isCreatingLink, setIsCreatingLink] = useState(false);

  // Novos estados para o Gerenciador de Links de Migração
  const [migrationLinks, setMigrationLinks] = useState<any[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [migrationModalTab, setMigrationModalTab] = useState<'create' | 'history'>('create');
  const [viewingLinkDetails, setViewingLinkDetails] = useState<any | null>(null);
  const [rawEmailsText, setRawEmailsText] = useState('');
  const [importedEmails, setImportedEmails] = useState<string[]>([]);
  const [detailSearchTerm, setDetailSearchTerm] = useState('');

  // Estados de edição de Link de Migração Ativo
  const [editingExpiresAt, setEditingExpiresAt] = useState('');
  const [editingAccessDurationDays, setEditingAccessDurationDays] = useState(365);
  const [newEmailsText, setNewEmailsText] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const loadMigrationLinks = useCallback(async () => {
    if (!courseId) return;
    setLoadingLinks(true);
    try {
      const res = await fetch(`/api/admin/courses/${courseId}/migration-links`);
      const data = await res.json();
      if (data.success) {
        setMigrationLinks(data.links || []);
      }
    } catch (e) {
      console.error("Erro ao buscar links de migração:", e);
    } finally {
      setLoadingLinks(false);
    }
  }, [courseId]);

  const handleViewLinkDetails = (link: any) => {
    setViewingLinkDetails(link);
    setDetailSearchTerm('');
    setEditingExpiresAt(link.expiresAt ? link.expiresAt.substring(0, 10) : '');
    setEditingAccessDurationDays(link.accessDurationDays || 365);
    setNewEmailsText('');
  };

  const handleSaveLinkEdits = async () => {
    if (!viewingLinkDetails) return;
    setIsSavingEdit(true);
    try {
      const res = await fetch(`/api/admin/courses/${courseId}/migration-links`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          linkId: viewingLinkDetails.id,
          action: 'edit',
          expiresAt: editingExpiresAt,
          accessDurationDays: Number(editingAccessDurationDays)
        })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Configurações do link atualizadas!');
        setViewingLinkDetails(data.link);
        loadMigrationLinks();
      } else {
        toast.error(data.error || 'Erro ao salvar alterações');
      }
    } catch (e) {
      toast.error('Erro de conexão');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleAddNewEmails = async () => {
    if (!viewingLinkDetails) return;
    
    const matches = newEmailsText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    const newEmails = Array.from(new Set(matches.map(m => m.trim().toLowerCase())));
    
    if (newEmails.length === 0) {
      toast.error('Por favor, insira pelo menos um e-mail válido.');
      return;
    }

    setIsSavingEdit(true);
    try {
      const currentEmailsList = (viewingLinkDetails.authorizedEmails || []).map((e: any) => e.email);
      const mergedEmails = Array.from(new Set([...currentEmailsList, ...newEmails]));

      const res = await fetch(`/api/admin/courses/${courseId}/migration-links`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          linkId: viewingLinkDetails.id,
          action: 'edit',
          authorizedEmails: mergedEmails
        })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`${newEmails.length} novo(s) e-mail(s) adicionado(s) com sucesso!`);
        setViewingLinkDetails(data.link);
        setNewEmailsText('');
        loadMigrationLinks();
      } else {
        toast.error(data.error || 'Erro ao adicionar e-mails');
      }
    } catch (e) {
      toast.error('Erro de conexão');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleToggleLinkActive = async (linkId: string) => {
    try {
      const res = await fetch(`/api/admin/courses/${courseId}/migration-links`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkId, action: 'toggle' })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.active ? 'Link ativado com sucesso!' : 'Link desativado com sucesso!');
        loadMigrationLinks();
        if (viewingLinkDetails && viewingLinkDetails.id === linkId) {
          setViewingLinkDetails(prev => prev ? { ...prev, active: data.active } : null);
        }
      } else {
        toast.error(data.error || 'Erro ao alterar status');
      }
    } catch (e) {
      toast.error('Erro de rede');
    }
  };

  const handleDeleteLink = async (linkId: string) => {
    if (!window.confirm('Tem certeza de que deseja excluir permanentemente este link de migração? Todas as autorizações associadas serão perdidas.')) return;
    try {
      const res = await fetch(`/api/admin/courses/${courseId}/migration-links`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkId, action: 'delete' })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Link de migração excluído!');
        loadMigrationLinks();
        if (viewingLinkDetails && viewingLinkDetails.id === linkId) {
          setViewingLinkDetails(null);
        }
      } else {
        toast.error(data.error || 'Erro ao excluir link');
      }
    } catch (e) {
      toast.error('Erro de rede');
    }
  };

  useEffect(() => {
    if (showMigrationModal && courseId) {
      loadMigrationLinks();
    }
  }, [showMigrationModal, courseId, loadMigrationLinks]);

  // Métricas
  const [metrics, setMetrics] = useState({
    total: 0,
    regular: 0,
    migration: 0,
    scholarship: 0
  });

  const fetchLock = useRef(''); // Armazena o ID do curso já carregado

  const loadStudents = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    try {
      fetchLock.current = courseId;
      const response = await fetch(`/api/admin/courses/${courseId}/students`);
      const data = await response.json();
      
      if (data.success) {
        const realStudents = (data.students || []) as CourseEnrollment[];
        
        // Ordenação Alfabética Real (Defensiva)
        realStudents.sort((a, b) => (a?.userName || '').localeCompare(b?.userName || ''));
        
        setEnrollments(realStudents);
        
        // Cálculo Dinâmico das Métricas
        setMetrics({
          total: realStudents.length,
          regular: realStudents.filter(s => s?.enrollmentType === 'REGULAR' || !s?.enrollmentType).length,
          migration: realStudents.filter(s => s?.enrollmentType === 'MIGRACAO').length,
          scholarship: realStudents.filter(s => s?.enrollmentType === 'BOLSISTA').length
        });
      }
    } catch (error) {
      fetchLock.current = ''; // Destranca em caso de erro para permitir retry
      console.error("Erro ao buscar alunos reais:", error);
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    // Se não tem ID, ou se o ID atual já foi carregado, aborta (quebra o loop)
    if (!courseId || fetchLock.current === courseId) return;

    loadStudents();

    // Cleanup: Reseta o lock ao sair da aba, forçando um novo fetch ao voltar
    return () => { fetchLock.current = ''; };
  }, [courseId, loadStudents]);

  const handleSync = () => {
    fetchLock.current = '';
    loadStudents();
  };

  // Formatação de CPF
  const formatCPF = (cpf?: string) => {
    if (!cpf) return '---';
    const clean = cpf.replace(/\D/g, '');
    return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  };

  // Link WhatsApp
  const getWhatsAppLink = (phone?: string) => {
    if (!phone) return null;
    const clean = phone.replace(/\D/g, '');
    return `https://wa.me/55${clean}`;
  };

  // Cálculo de dias restantes
  const getRemainingDays = (expiresAt?: string) => {
    if (!expiresAt) return { label: 'Sem validade', color: 'text-zinc-500' };
    const now = new Date();
    try {
      const expiration = parseISO(expiresAt);
      const days = differenceInDays(expiration, now);
      
      if (days < 0) return { label: 'Expirado', color: 'text-red-500' };
      if (days === 0) return { label: 'Expira hoje', color: 'text-orange-500' };
      return { label: `${days} dias restantes`, color: 'text-emerald-400' };
    } catch (e) {
      return { label: 'Data inválida', color: 'text-zinc-500' };
    }
  };

  const filteredEnrollments = (enrollments || []).filter(e => {
    const searchLower = (searchTerm || '').toLowerCase();
    const matchName = (e?.userName || '').toLowerCase().includes(searchLower);
    const matchEmail = (e?.userEmail || '').toLowerCase().includes(searchLower);
    const matchCpf = (e?.userCpf || '').includes(searchTerm);
    
    const matchesSearch = matchName || matchEmail || matchCpf;
    const matchesFilter = filterType === 'ALL' || e.enrollmentType === filterType;
    return matchesSearch && matchesFilter;
  });

  const handleCreateMigrationLink = async () => {
    setIsCreatingLink(true);
    try {
      const response = await fetch(`/api/admin/courses/${courseId}/migration-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expiresAt: migrationConfig.expiresAt,
          accessDurationDays: migrationConfig.accessDurationDays,
          authorizedEmails: importedEmails
        })
      });
      const data = await response.json();
      if (data.success) {
        const fullUrl = `${window.location.origin}${data.link}`;
        setGeneratedLink({
          id: data.id,
          url: fullUrl,
          embed: `<iframe src="${fullUrl}" width="100%" height="600px" frameborder="0"></iframe>`
        });
        toast.success('Link de migração gerado com sucesso!');
        loadMigrationLinks();
        // Limpar lista local de emails carregados
        setImportedEmails([]);
        setRawEmailsText('');
      } else {
        toast.error(data.error || 'Erro ao gerar link');
      }
    } catch (error) {
      console.error("Erro ao criar link:", error);
      toast.error('Erro de conexão');
    } finally {
      setIsCreatingLink(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado para a área de transferência!');
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-xl flex items-center gap-4">
          <div className="p-3 bg-zinc-800 rounded-lg text-white">
            <Users size={24} />
          </div>
          <div>
            <p className="text-zinc-500 text-xs font-bold uppercase tracking-wider">Total Alunos</p>
            <h3 className="text-2xl font-black text-white">{metrics.total}</h3>
          </div>
        </div>

        <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-xl flex items-center gap-4">
          <div className="p-3 bg-emerald-500/10 rounded-lg text-emerald-500">
            <UserCheck size={24} />
          </div>
          <div>
            <p className="text-zinc-500 text-xs font-bold uppercase tracking-wider">Regulares</p>
            <h3 className="text-2xl font-black text-white">{metrics.regular}</h3>
          </div>
        </div>

        <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-xl flex items-center gap-4">
          <div className="p-3 bg-blue-500/10 rounded-lg text-blue-500">
            <UserPlus size={24} />
          </div>
          <div>
            <p className="text-zinc-500 text-xs font-bold uppercase tracking-wider">Migração</p>
            <h3 className="text-2xl font-black text-white">{metrics.migration}</h3>
          </div>
        </div>

        <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-xl flex items-center gap-4">
          <div className="p-3 bg-purple-500/10 rounded-lg text-purple-500">
            <GraduationCap size={24} />
          </div>
          <div>
            <p className="text-zinc-500 text-xs font-bold uppercase tracking-wider">Bolsistas</p>
            <h3 className="text-2xl font-black text-white">{metrics.scholarship}</h3>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-zinc-900/30 p-4 rounded-xl border border-zinc-800/50">
        <div className="flex flex-col md:flex-row gap-4 items-center w-full md:w-auto">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
            <input 
              type="text"
              placeholder="Buscar por nome, email ou CPF..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-red-600 transition-colors"
            />
          </div>

          <div className="flex gap-2 w-full md:w-auto">
            <button
              onClick={handleSync}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-bold uppercase tracking-wider transition-all border border-zinc-700 justify-center"
              title="Sincronizar dados"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              Sincronizar
            </button>
            <button
              onClick={() => setShowMigrationModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-lg shadow-blue-900/20 w-full md:w-auto justify-center"
            >
              <LinkIcon size={16} />
              Cadastrar Link de Migração
            </button>
          </div>
        </div>

        <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
          {(['ALL', 'REGULAR', 'MIGRACAO', 'BOLSISTA'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${
                filterType === type 
                ? 'bg-red-600 text-white shadow-lg shadow-red-900/20' 
                : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300 border border-zinc-800'
              }`}
            >
              {type === 'ALL' ? 'Todos' : type}
            </button>
          ))}
        </div>
      </div>

      {/* Students Table */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/50">
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Aluno</th>
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Documento</th>
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Contatos</th>
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Acesso</th>
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Grupo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {(filteredEnrollments || []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center text-zinc-500 italic">
                    Nenhum aluno encontrado com os filtros aplicados.
                  </td>
                </tr>
              ) : (
                (filteredEnrollments || []).map((enrollment) => {
                  const remaining = getRemainingDays(enrollment.expiresAt);
                  const waLink = getWhatsAppLink(enrollment.userPhone);

                  return (
                    <tr key={enrollment.id} className="hover:bg-white/5 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center overflow-hidden shrink-0">
                            {enrollment.userAvatar ? (
                              <img src={enrollment.userAvatar} alt={enrollment.userName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <span className="text-zinc-400 font-bold text-sm">
                                {(() => {
                                  const userNameString = enrollment?.userName || 'Aluno';
                                  return userNameString
                                    .split(' ')
                                    .filter(Boolean)
                                    .map(n => n[0])
                                    .join('')
                                    .slice(0, 2)
                                    .toUpperCase() || '👤';
                                })()}
                              </span>
                            )}
                          </div>
                          <div>
                            <p className="text-white font-bold text-sm group-hover:text-red-500 transition-colors">{enrollment.userName}</p>
                            <p className="text-zinc-500 text-xs">{enrollment.userEmail}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-zinc-300 font-mono text-xs">{formatCPF(enrollment.userCpf)}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {waLink && (
                            <a 
                              href={waLink} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="p-2 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white rounded-lg transition-all"
                              title="Abrir WhatsApp"
                            >
                              <MessageCircle size={16} />
                            </a>
                          )}
                          <button 
                            onClick={() => window.location.href = `mailto:${enrollment.userEmail}`}
                            className="p-2 bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white rounded-lg transition-all"
                            title="Enviar E-mail"
                          >
                            <ExternalLink size={16} />
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <p className="text-zinc-400 text-[10px] uppercase font-bold">
                            Expira em: <span className="text-white">
                              {enrollment.expiresAt ? format(parseISO(enrollment.expiresAt), 'dd/MM/yyyy') : '---'}
                            </span>
                          </p>
                          <p className={`text-xs font-bold ${remaining.color}`}>{remaining.label}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter border ${
                          enrollment.enrollmentType === 'REGULAR' 
                          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
                          : enrollment.enrollmentType === 'MIGRACAO'
                          ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                          : 'bg-purple-500/10 text-purple-500 border-purple-500/20'
                        }`}>
                          {enrollment.enrollmentType}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      {/* Migration Link Modal */}
      {showMigrationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                  <LinkIcon size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white uppercase tracking-tighter">Gerenciador de Migrações</h3>
                  <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider">Acesso e segurança de links de migração</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setShowMigrationModal(false);
                  setGeneratedLink(null);
                  setViewingLinkDetails(null);
                  setMigrationModalTab('create');
                }}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            {/* Modal Tabs */}
            {!generatedLink && !viewingLinkDetails && (
              <div className="flex border-b border-zinc-800 bg-zinc-950/20 px-6 shrink-0">
                <button
                  type="button"
                  onClick={() => setMigrationModalTab('create')}
                  className={`py-3 text-xs font-black uppercase tracking-widest transition-all border-b-2 mr-6 ${
                    migrationModalTab === 'create' 
                      ? 'text-blue-500 border-b-2 border-blue-500' 
                      : 'text-zinc-500 hover:text-zinc-300 border-transparent'
                  }`}
                >
                  Gerar Novo Link
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMigrationModalTab('history');
                    loadMigrationLinks();
                  }}
                  className={`py-3 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${
                    migrationModalTab === 'history' 
                      ? 'text-blue-500 border-b-2 border-blue-500' 
                      : 'text-zinc-500 hover:text-zinc-300 border-transparent'
                  }`}
                >
                  Links Ativos & Relatórios
                </button>
              </div>
            )}

            {/* Content Area */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* TAB 1: CREATE LINK */}
              {migrationModalTab === 'create' && !generatedLink && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Validade do Link (Até quando pode ser usado)</label>
                      <input 
                        type="date"
                        value={migrationConfig.expiresAt}
                        onChange={(e) => setMigrationConfig({ ...migrationConfig, expiresAt: e.target.value })}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-all text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Dias de Acesso (Duração da matrícula)</label>
                      <input 
                        type="number"
                        value={migrationConfig.accessDurationDays}
                        onChange={(e) => setMigrationConfig({ ...migrationConfig, accessDurationDays: parseInt(e.target.value) })}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-all text-sm"
                        placeholder="Ex: 365"
                      />
                    </div>
                  </div>

                  {/* E-mails Whitelist Section */}
                  <div className="space-y-3 pt-2 border-t border-zinc-800/60">
                    <div className="flex flex-col">
                      <span className="text-xs font-black text-white uppercase tracking-wider">Lista de E-mails Pré-Autorizados</span>
                      <span className="text-zinc-500 text-[10px]">Apenas e-mails nesta lista poderão utilizar o link (Código de Check-in). Se deixar vazio, qualquer um poderá usar o link.</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Paste Area */}
                      <div>
                        <label className="block text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Colar e-mails da planilha / texto</label>
                        <textarea
                          rows={3}
                          value={rawEmailsText}
                          onChange={(e) => {
                            setRawEmailsText(e.target.value);
                            const matches = e.target.value.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
                            const unique = Array.from(new Set(matches.map(m => m.trim().toLowerCase())));
                            setImportedEmails(unique);
                          }}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-blue-500 transition-all font-mono resize-none"
                          placeholder="Cole uma coluna do Excel ou lista separada por vírgulas..."
                        />
                      </div>

                      {/* File Upload Area */}
                      <div className="flex flex-col justify-end">
                        <label className="block text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Ou importar de arquivo (.CSV / .TXT)</label>
                        <div className="relative border-2 border-dashed border-zinc-800 hover:border-zinc-700 rounded-xl p-6 text-center transition-all cursor-pointer flex flex-col items-center justify-center bg-zinc-950/20 h-[82px]">
                          <input 
                            type="file"
                            accept=".csv,.txt"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = (evt) => {
                                const text = evt.target?.result as string;
                                const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
                                const unique = Array.from(new Set(matches.map(m => m.trim().toLowerCase())));
                                if (unique.length > 0) {
                                  setImportedEmails(prev => Array.from(new Set([...prev, ...unique])));
                                  toast.success(`${unique.length} e-mails importados!`);
                                } else {
                                  toast.error('Nenhum e-mail válido encontrado no arquivo.');
                                }
                              };
                              reader.readAsText(file);
                            }}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                          />
                          <FileText size={18} className="text-zinc-500 mb-1" />
                          <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider">Escolher arquivo</p>
                        </div>
                      </div>
                    </div>

                    {importedEmails.length > 0 && (
                      <div className="flex items-center justify-between p-3 bg-blue-500/5 border border-blue-500/15 rounded-xl text-xs animate-in zoom-in-95 duration-200">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="text-blue-500" size={14} />
                          <span className="text-zinc-300 font-bold"><span className="text-blue-400">{importedEmails.length}</span> e-mails válidos carregados</span>
                        </div>
                        <button 
                          type="button"
                          onClick={() => {
                            setImportedEmails([]);
                            setRawEmailsText('');
                          }} 
                          className="text-[10px] text-zinc-500 hover:text-red-500 font-black uppercase tracking-wider"
                        >
                          Limpar Lista
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={handleCreateMigrationLink}
                    disabled={isCreatingLink}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-blue-900/20 text-xs shrink-0"
                  >
                    {isCreatingLink ? 'Gerando...' : 'Gerar Link e Código Embed'}
                  </button>
                </div>
              )}

              {/* GENERATED LINK SUCCESS VIEW */}
              {generatedLink && (
                <div className="space-y-6 animate-in zoom-in-95 duration-300">
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                    <div className="flex items-center gap-2 text-emerald-500 mb-1">
                      <Check size={16} />
                      <span className="text-xs font-bold uppercase tracking-wider">Link Gerado com Sucesso!</span>
                    </div>
                    <p className="text-zinc-400 text-xs">O link está ativo e pronto para ser compartilhado ou embarcado.</p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">URL Direta</label>
                      <div className="flex gap-2">
                        <input 
                          readOnly
                          value={generatedLink.url}
                          className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-400 focus:outline-none"
                        />
                        <button 
                          onClick={() => copyToClipboard(generatedLink.url)}
                          className="p-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
                        >
                          <Copy size={16} />
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Código Iframe (Embed)</label>
                      <div className="flex gap-2">
                        <textarea 
                          readOnly
                          rows={3}
                          value={generatedLink.embed}
                          className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-[10px] font-mono text-zinc-400 focus:outline-none resize-none"
                        />
                        <button 
                          onClick={() => copyToClipboard(generatedLink.embed)}
                          className="p-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors self-start"
                        >
                          <Copy size={16} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setGeneratedLink(null);
                      setMigrationModalTab('history');
                      loadMigrationLinks();
                    }}
                    className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-bold uppercase tracking-widest rounded-xl transition-all text-xs"
                  >
                    Ver Relatórios de Links
                  </button>
                </div>
              )}

              {/* TAB 2: ACTIVE LINKS LIST */}
              {migrationModalTab === 'history' && !viewingLinkDetails && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  {loadingLinks ? (
                    <div className="flex flex-col items-center justify-center py-10 space-y-2">
                      <RefreshCw className="animate-spin text-blue-500" size={24} />
                      <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Carregando links...</p>
                    </div>
                  ) : migrationLinks.length === 0 ? (
                    <div className="text-center py-10 space-y-2 border border-dashed border-zinc-800 rounded-xl">
                      <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Nenhum link de migração cadastrado</p>
                      <button 
                        type="button"
                        onClick={() => setMigrationModalTab('create')}
                        className="text-blue-500 hover:underline text-xs font-bold uppercase"
                      >
                        Criar primeiro link
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
                      {migrationLinks.map((link) => {
                        const totalEmails = link.authorizedEmails?.length || 0;
                        const completedEmails = link.authorizedEmails?.filter((e: any) => e.status === 'completed').length || 0;
                        const isLinkExpired = link.expiresAt && new Date(link.expiresAt) < new Date();
                        const isLinkActive = link.active !== false && !isLinkExpired;

                        return (
                          <div key={link.id} className="p-4 bg-zinc-950/50 border border-zinc-800 hover:border-zinc-700 rounded-xl transition-all flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-black text-white uppercase tracking-tight">ID: {link.id.substring(0, 8)}...</span>
                                <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                                  isLinkActive 
                                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
                                    : 'bg-zinc-800 text-zinc-500 border-zinc-700/50'
                                }`}>
                                  {isLinkActive ? 'Ativo' : isLinkExpired ? 'Expirado' : 'Inativo'}
                                </span>
                              </div>
                              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
                                Validade: <strong>{link.expiresAt ? format(parseISO(link.expiresAt), 'dd/MM/yyyy') : 'Sem expiração'}</strong> • Matrícula: <strong>{link.accessDurationDays} dias</strong>
                              </p>
                              {totalEmails > 0 ? (
                                <div className="flex items-center gap-2 pt-1">
                                  <div className="w-24 bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                                    <div 
                                      className="bg-blue-500 h-full rounded-full" 
                                      style={{ width: `${(completedEmails / totalEmails) * 100}%` }}
                                    />
                                  </div>
                                  <span className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">
                                    {completedEmails} de {totalEmails} Migrados ({Math.round((completedEmails / totalEmails) * 100)}%)
                                  </span>
                                </div>
                              ) : (
                                <p className="text-[10px] text-zinc-500 uppercase tracking-widest italic pt-1">Link livre (sem restrição de e-mails)</p>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => copyToClipboard(`${window.location.origin}/migracao/${link.id}`)}
                                title="Copiar URL"
                                className="p-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 rounded-lg transition-colors"
                              >
                                <Copy size={14} />
                              </button>
                              
                              <button
                                type="button"
                                onClick={() => handleViewLinkDetails(link)}
                                title="Gerenciar Link de Migração"
                                className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-all"
                              >
                                Gerenciar
                              </button>

                              <button
                                type="button"
                                onClick={() => handleToggleLinkActive(link.id)}
                                title={isLinkActive ? "Desativar Link" : "Ativar Link"}
                                className={`p-2 border rounded-lg transition-colors ${
                                  link.active !== false 
                                    ? 'bg-zinc-900 hover:bg-amber-500/10 text-amber-500 border-zinc-800' 
                                    : 'bg-zinc-900 hover:bg-emerald-500/10 text-emerald-500 border-zinc-800'
                                }`}
                              >
                                {link.active !== false ? <Pause size={14} /> : <Play size={14} />}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteLink(link.id)}
                                title="Excluir Link"
                                className="p-2 bg-zinc-900 hover:bg-red-500/10 text-zinc-500 hover:text-red-500 border border-zinc-800 rounded-lg transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* DETAILED VIEW: EDIT DETAILS, ADD EMAILS, AND AUTHORIZED EMAILS REPORT */}
              {viewingLinkDetails && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  {/* Top Bar / Header */}
                  <div className="flex items-center justify-between border-b border-zinc-800/60 pb-3 shrink-0">
                    <div className="flex items-center gap-2">
                      <button 
                        type="button"
                        onClick={() => setViewingLinkDetails(null)}
                        className="p-1.5 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white rounded-lg transition-colors mr-1"
                      >
                        <ArrowLeft size={14} />
                      </button>
                      <div>
                        <h4 className="text-xs font-black text-white uppercase tracking-wider">Gerenciar Link de Migração</h4>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">ID: {viewingLinkDetails.id}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">
                        {viewingLinkDetails.authorizedEmails?.filter((e: any) => e.status === 'completed').length || 0} / {viewingLinkDetails.authorizedEmails?.length || 0} Migrados
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* LEFT COLUMN: EDIT DETAILS & ADD EMAILS */}
                    <div className="space-y-4">
                      {/* Sub-Card: Edit Fields */}
                      <div className="p-4 bg-zinc-950/40 border border-zinc-800 rounded-xl space-y-3">
                        <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Editar Configurações</span>
                        
                        <div>
                          <label className="block text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Validade do Link</label>
                          <input 
                            type="date"
                            value={editingExpiresAt}
                            onChange={(e) => setEditingExpiresAt(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-all"
                          />
                        </div>

                        <div>
                          <label className="block text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Dias de Acesso (Matrícula)</label>
                          <input 
                            type="number"
                            value={editingAccessDurationDays}
                            onChange={(e) => setEditingAccessDurationDays(parseInt(e.target.value) || 365)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-all"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={handleSaveLinkEdits}
                          disabled={isSavingEdit}
                          className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-widest rounded-lg transition-all"
                        >
                          {isSavingEdit ? 'Salvando...' : 'Salvar Alterações'}
                        </button>
                      </div>

                      {/* Sub-Card: Add Emails */}
                      <div className="p-4 bg-zinc-950/40 border border-zinc-800 rounded-xl space-y-3">
                        <div className="space-y-0.5">
                          <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Adicionar Alunos</span>
                          <span className="text-zinc-500 text-[9px] block leading-snug">Adicione novos e-mails pré-autorizados (um por linha ou separados por vírgula).</span>
                        </div>

                        <textarea
                          rows={3}
                          value={newEmailsText}
                          onChange={(e) => setNewEmailsText(e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-blue-500 transition-all font-mono resize-none"
                          placeholder="Cole e-mails novos aqui..."
                        />

                        <button
                          type="button"
                          onClick={handleAddNewEmails}
                          disabled={isSavingEdit || !newEmailsText.trim()}
                          className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-widest rounded-lg transition-all"
                        >
                          {isSavingEdit ? 'Adicionando...' : 'Adicionar E-mails'}
                        </button>
                      </div>
                    </div>

                    {/* RIGHT COLUMN: EMAILS LIST */}
                    <div className="space-y-3 flex flex-col justify-between">
                      <div className="space-y-3 flex-1 flex flex-col">
                        <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Lista de E-mails Autorizados</span>
                        
                        {/* Filter Search */}
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
                          <input 
                            type="text"
                            placeholder="Buscar e-mail..."
                            value={detailSearchTerm}
                            onChange={(e) => setDetailSearchTerm(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg py-2 pl-9 pr-4 text-xs text-white focus:outline-none focus:border-blue-500 transition-all"
                          />
                        </div>

                        {/* Emails Table */}
                        <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950/20 flex-1 max-h-[30vh] overflow-y-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b border-zinc-800 bg-zinc-950/50 text-[8px] font-black uppercase tracking-widest text-zinc-500">
                                <th className="px-3 py-2">E-mail Autorizado</th>
                                <th className="px-3 py-2">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800/45 text-[11px] text-zinc-300">
                              {(viewingLinkDetails.authorizedEmails || [])
                                .filter((item: any) => item.email.toLowerCase().includes(detailSearchTerm.toLowerCase()))
                                .map((item: any, idx: number) => (
                                  <tr key={idx} className="hover:bg-zinc-900/30 transition-colors">
                                    <td className="px-3 py-2 font-mono truncate max-w-[150px]" title={item.email}>{item.email}</td>
                                    <td className="px-3 py-2">
                                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                                        item.status === 'completed'
                                          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                          : 'bg-zinc-800 text-zinc-500 border-zinc-700/50'
                                      }`}>
                                        {item.status === 'completed' ? 'Migrado' : 'Pendente'}
                                      </span>
                                    </td>
                                  </tr>
                                ))
                              }
                              {(viewingLinkDetails.authorizedEmails || []).filter((item: any) => item.email.toLowerCase().includes(detailSearchTerm.toLowerCase())).length === 0 && (
                                <tr>
                                  <td colSpan={2} className="px-3 py-6 text-center text-zinc-500 text-[10px] uppercase font-bold tracking-widest">
                                    Nenhum e-mail correspondente encontrado
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setViewingLinkDetails(null)}
                        className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-bold uppercase tracking-widest rounded-xl transition-all text-xs text-center mt-4 shrink-0"
                      >
                        Voltar para os links
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
