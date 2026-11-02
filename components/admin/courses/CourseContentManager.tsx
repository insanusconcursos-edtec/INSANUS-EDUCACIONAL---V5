import React, { useState, useEffect } from 'react';
import { OnlineCourse, CourseModule, CourseModuleGroup, CourseSection } from '../../../types/course';
import { courseService } from '../../../services/courseService';
import { CourseModuleCard } from './modules/CourseModuleCard';
import { CourseModuleModal } from './modules/CourseModuleModal';
import { CourseModuleGroupCard } from './modules/CourseModuleGroupCard';
import { CourseModuleGroupModal } from './modules/CourseModuleGroupModal';
import { CourseSectionModal } from './modules/CourseSectionModal';
import { ModuleContentManager } from './modules/ModuleContentManager';
import { ConfirmationModal } from '../ui/ConfirmationModal';
import { AdminCourseEditalManager } from './edital/AdminCourseEditalManager'; // Importando o Gerenciador de Edital
import { AdminCourseStudentsTab } from './AdminCourseStudentsTab'; // Importando a Aba de Alunos
import { CourseAnnouncementsTab } from './CourseAnnouncementsTab'; // Importando a Aba de Avisos
import { 
  Layout, FileText, Users, Settings, Code, Megaphone, Layers, ArrowLeft, Plus, 
  ChevronDown, ChevronRight, Edit2, Trash2, ArrowUp, ArrowDown, FolderPlus 
} from 'lucide-react';
import { AdminCourseMaintenanceTab } from './AdminCourseMaintenanceTab'; // Nova Aba de Manutenção
import { ExportCourseStructureModal } from './modals/ExportCourseStructureModal';
import { MigrateModuleModal } from './modals/MigrateModuleModal';
import { CopyModuleModal } from './modals/CopyModuleModal';
import { motion, AnimatePresence } from 'motion/react';

interface CourseContentManagerProps {
  course: OnlineCourse;
  onBack: () => void;
}

export function CourseContentManager({ course, onBack }: CourseContentManagerProps) {
  const [activeTab, setActiveTab] = useState<'MODULES' | 'EDITAL' | 'STUDENTS' | 'ANNOUNCEMENTS' | 'MAINTENANCE'>('MODULES');

  // --- ESTADOS DE SESSÕES, BLOCOS E MÓDULOS ---
  const [sections, setSections] = useState<CourseSection[]>([]);
  const [modules, setModules] = useState<CourseModule[]>([]);
  const [moduleGroups, setModuleGroups] = useState<CourseModuleGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Estado do Acordeão das Sessões (id -> isCollapsed)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  
  // Sessão alvo temporária ao clicar em "+ Bloco" ou "+ Módulo" dentro de uma sessão específica
  const [targetSectionIdForNewItem, setTargetSectionIdForNewItem] = useState<string | null>(null);

  // Modais de Sessão
  const [isSectionModalOpen, setIsSectionModalOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<CourseSection | null>(null);
  const [sectionToDelete, setSectionToDelete] = useState<CourseSection | null>(null);

  // Modais de Módulo
  const [isModuleModalOpen, setIsModuleModalOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<CourseModule | null>(null);
  const [moduleToDelete, setModuleToDelete] = useState<CourseModule | null>(null);
  const [moduleToMigrate, setModuleToMigrate] = useState<CourseModule | null>(null);
  const [moduleToCopy, setModuleToCopy] = useState<CourseModule | null>(null);
  const [managingModule, setManagingModule] = useState<CourseModule | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Modais de Bloco / Grupo
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<CourseModuleGroup | null>(null);
  const [groupToDelete, setGroupToDelete] = useState<CourseModuleGroup | null>(null);

  // Carregar Sessões, Módulos e Grupos
  const loadData = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const [modulesData, groupsData, sectionsData] = await Promise.all([
        courseService.getModules(course.id),
        courseService.getModuleGroups(course.id),
        courseService.getCourseSections(course.id)
      ]);
      setModules(modulesData);
      setModuleGroups(groupsData);
      setSections(sectionsData);
    } catch (error) {
      console.error("Erro ao carregar dados do curso:", error);
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'MODULES') {
      loadData();
    }
  }, [course.id, activeTab]);

  const toggleSection = (sectionId: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  };

  // CRUD Sessões
  const handleSaveSection = async (data: Partial<CourseSection>) => {
    if (editingSection) {
      await courseService.updateCourseSection(editingSection.id, data);
    } else {
      await courseService.createCourseSection({
        ...data,
        courseId: course.id,
        order: 999
      } as Omit<CourseSection, 'id'>);
    }
    await loadData();
    setEditingSection(null);
  };

  const handleDeleteSection = async () => {
    if (sectionToDelete) {
      await courseService.deleteCourseSection(sectionToDelete.id);
      await loadData();
      setSectionToDelete(null);
    }
  };

  const handleReorderSections = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sections.length) return;

    const newSections = [...sections];
    [newSections[index], newSections[targetIndex]] = [newSections[targetIndex], newSections[index]];
    setSections(newSections);
    await courseService.reorderCourseSections(newSections);
  };

  // CRUD Módulos
  const handleSaveModule = async (data: Partial<CourseModule>) => {
    if (editingModule) {
      await courseService.updateModule(editingModule.id, data);
    } else {
      await courseService.createModule({
        ...data,
        courseId: course.id,
        sectionId: data.sectionId !== undefined ? data.sectionId : (targetSectionIdForNewItem || null),
        groupId: data.groupId !== undefined ? data.groupId : (selectedGroupId || null),
        order: 999 
      } as Omit<CourseModule, 'id'>);
    }
    await loadData();
    setEditingModule(null);
    setTargetSectionIdForNewItem(null);
  };

  const handleDeleteModule = async () => {
    if (moduleToDelete) {
      await courseService.deleteModule(moduleToDelete.id);
      await loadData();
      setModuleToDelete(null);
    }
  };

  // CRUD Grupos de Módulos (Blocos)
  const handleSaveGroup = async (data: Partial<CourseModuleGroup>) => {
    if (editingGroup) {
      await courseService.updateModuleGroup(editingGroup.id, data);
    } else {
      await courseService.createModuleGroup({
        ...data,
        courseId: course.id,
        sectionId: data.sectionId !== undefined ? data.sectionId : (targetSectionIdForNewItem || null),
        order: 999
      } as Omit<CourseModuleGroup, 'id'>);
    }
    await loadData();
    setEditingGroup(null);
    setTargetSectionIdForNewItem(null);
  };

  const handleDeleteGroup = async () => {
    if (groupToDelete) {
      await courseService.deleteModuleGroup(groupToDelete.id);
      if (selectedGroupId === groupToDelete.id) {
        setSelectedGroupId(null);
      }
      await loadData();
      setGroupToDelete(null);
    }
  };

  // Reordenação Unificada de Itens na Mesma Linha (Intercala Blocos e Módulos em tempo real sem piscar a tela)
  const handleMoveUnified = async (
    rowItems: Array<{ id: string; isGroup: boolean; order: number }>,
    index: number,
    direction: 'left' | 'right'
  ) => {
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= rowItems.length) return;

    const newItems = [...rowItems];
    [newItems[index], newItems[targetIndex]] = [newItems[targetIndex], newItems[index]];

    const itemsToUpdate = newItems.map((item, idx) => ({
      id: item.id,
      isGroup: item.isGroup,
      order: idx + 1
    }));

    // 1. Atualização OTIMISTA imediata do estado local (sem spinner, troca imediata em tempo real)
    setModuleGroups(prev => prev.map(g => {
      const match = itemsToUpdate.find(i => i.isGroup && i.id === g.id);
      return match ? { ...g, order: match.order } : g;
    }));

    setModules(prev => prev.map(m => {
      const match = itemsToUpdate.find(i => !i.isGroup && i.id === m.id);
      return match ? { ...m, order: match.order } : m;
    }));

    // 2. Persistência em segundo plano no Firestore (sem piscar a interface)
    try {
      await courseService.reorderUnifiedItems(itemsToUpdate);
    } catch (error) {
      console.error("Erro ao salvar ordem no Firestore:", error);
      await loadData(false);
    }
  };

  // Reordenação de Módulos dentro de um Bloco em tempo real
  const handleReorderGroupModules = async (groupModulesList: CourseModule[], index: number, direction: 'left' | 'right') => {
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= groupModulesList.length) return;

    const itemA = groupModulesList[index];
    const itemB = groupModulesList[targetIndex];

    const newModules = [...modules];
    const fullIndexA = newModules.findIndex(m => m.id === itemA.id);
    const fullIndexB = newModules.findIndex(m => m.id === itemB.id);

    if (fullIndexA !== -1 && fullIndexB !== -1) {
      const tempOrder = newModules[fullIndexA].order ?? fullIndexA + 1;
      newModules[fullIndexA] = { ...newModules[fullIndexA], order: newModules[fullIndexB].order ?? fullIndexB + 1 };
      newModules[fullIndexB] = { ...newModules[fullIndexB], order: tempOrder };

      [newModules[fullIndexA], newModules[fullIndexB]] = [newModules[fullIndexB], newModules[fullIndexA]];
      setModules(newModules);
      try {
        await courseService.reorderModules(newModules);
      } catch (error) {
        console.error("Erro ao persistir ordem dos módulos:", error);
        await loadData(false);
      }
    }
  };

  const handleManageInternal = (module: CourseModule) => {
    setManagingModule(module);
  };

  const handleMigrateModule = async (targetModuleId: string) => {
    if (!moduleToMigrate) return;
    try {
      await courseService.migrateModuleToGroup(moduleToMigrate.id, targetModuleId);
      await loadData();
      setModuleToMigrate(null);
    } catch (error) {
      console.error("Erro ao migrar módulo:", error);
      alert("Erro ao realizar a migração. Verifique o console.");
    }
  };

  const handleCopyModule = async (targetCourseId: string) => {
    if (!moduleToCopy) return;
    try {
      await courseService.copyModule(moduleToCopy.id, targetCourseId);
      setModuleToCopy(null);
    } catch (error) {
      console.error("Erro ao copiar módulo:", error);
      throw error;
    }
  };

  if (managingModule) {
    return (
      <ModuleContentManager 
        module={managingModule} 
        onBack={() => setManagingModule(null)} 
      />
    );
  }

  return (
    <div className={`space-y-6 animate-in fade-in flex flex-col ${activeTab === 'MODULES' ? 'h-full' : 'min-h-full'}`}>
      
      {/* Header com Navegação */}
      <div className="flex flex-col gap-4 border-b border-gray-800 pb-4 shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 hover:bg-white/5 rounded-full transition-colors text-gray-400 hover:text-white">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </button>
            <div>
            <span className="text-red-500 font-bold text-xs uppercase tracking-wider">Gerenciando Curso</span>
            <h2 className="text-2xl font-black text-white uppercase">{course.title}</h2>
            </div>
          </div>

          {/* Abas de Navegação */}
          <div className="flex gap-1 bg-zinc-900/50 p-1 rounded-lg border border-zinc-800 w-fit">
              <button 
                  onClick={() => setActiveTab('MODULES')}
                  className={`px-4 py-2 rounded-md text-xs font-bold uppercase flex items-center gap-2 transition-all ${activeTab === 'MODULES' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                  <Layout size={14} /> Módulos e Aulas
              </button>
              <button 
                  onClick={() => setActiveTab('EDITAL')}
                  className={`px-4 py-2 rounded-md text-xs font-bold uppercase flex items-center gap-2 transition-all ${activeTab === 'EDITAL' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                  <FileText size={14} /> Edital Verticalizado
              </button>
              <button 
                  onClick={() => setActiveTab('STUDENTS')}
                  className={`px-4 py-2 rounded-md text-xs font-bold uppercase flex items-center gap-2 transition-all ${activeTab === 'STUDENTS' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                  <Users size={14} /> Alunos
              </button>
              <button 
                  onClick={() => setActiveTab('ANNOUNCEMENTS')}
                  className={`px-4 py-2 rounded-md text-xs font-bold uppercase flex items-center gap-2 transition-all ${activeTab === 'ANNOUNCEMENTS' ? 'bg-red-600 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                  <Megaphone size={14} /> Avisos
              </button>
              <button 
                  onClick={() => setActiveTab('MAINTENANCE')}
                  className={`px-4 py-2 rounded-md text-xs font-bold uppercase flex items-center gap-2 transition-all ${activeTab === 'MAINTENANCE' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                  <Settings size={14} /> Manutenção
              </button>
          </div>
      </div>

      {/* Conteúdo da Aba */}
      <div className={`flex-1 ${activeTab === 'MODULES' ? 'overflow-hidden' : ''}`}>
          {activeTab === 'EDITAL' ? (
              <AdminCourseEditalManager courseId={course.id} />
          ) : activeTab === 'STUDENTS' ? (
              <AdminCourseStudentsTab courseId={course.id} />
          ) : activeTab === 'ANNOUNCEMENTS' ? (
              <CourseAnnouncementsTab courseId={course.id} />
          ) : activeTab === 'MAINTENANCE' ? (
              <AdminCourseMaintenanceTab course={course} />
          ) : (
             <div className="space-y-6 h-full overflow-y-auto custom-scrollbar p-1">
                {/* Sub-header de navegação quando dentro de um Bloco */}
                {selectedGroupId ? (
                  (() => {
                    const activeGroup = moduleGroups.find(g => g.id === selectedGroupId);
                    const currentGroupModules = modules.filter(m => m.groupId === selectedGroupId);
                    return (
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-purple-950/20 border border-purple-900/40 p-4 rounded-xl">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => setSelectedGroupId(null)}
                            className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-lg border border-zinc-700 text-xs font-bold uppercase flex items-center gap-2 transition-all shadow"
                          >
                            <ArrowLeft size={14} /> Voltar para Todos os Blocos
                          </button>
                          <div className="border-l border-zinc-800 pl-3">
                            <div className="flex items-center gap-2">
                              <span className="text-purple-400 font-black text-[10px] uppercase tracking-wider flex items-center gap-1">
                                <Layers size={11} /> Bloco Ativo
                              </span>
                              <span className="bg-purple-900/60 text-purple-200 text-[10px] font-bold px-2 py-0.5 rounded-full border border-purple-700/50">
                                {currentGroupModules.length} {currentGroupModules.length === 1 ? 'módulo' : 'módulos'}
                              </span>
                            </div>
                            <h3 className="text-white font-black text-lg uppercase drop-shadow-sm">
                              {activeGroup?.title || 'Bloco de Disciplinas'}
                            </h3>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                          {activeGroup && (
                            <button
                              onClick={() => {
                                setEditingGroup(activeGroup);
                                setIsGroupModalOpen(true);
                              }}
                              className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-purple-300 hover:text-purple-200 text-xs font-bold uppercase rounded-lg border border-purple-900/60 flex items-center gap-1.5 transition-all"
                            >
                              Editar Bloco
                            </button>
                          )}
                          <button 
                            onClick={() => { 
                              setEditingModule(null); 
                              setIsModuleModalOpen(true); 
                            }}
                            className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white font-bold uppercase text-xs rounded-lg shadow-lg shadow-red-900/30 flex items-center gap-2 transition-all"
                          >
                            <Plus size={16} /> Novo Módulo neste Bloco
                          </button>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  /* Cabeçalho Normal (Raiz) */
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-900/40 p-3.5 rounded-xl border border-zinc-800/80">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-zinc-400 text-xs font-bold uppercase">Estrutura do Curso:</span>
                      <span className="text-amber-400 text-xs font-bold bg-amber-950/40 px-2.5 py-0.5 rounded-md border border-amber-900/50 flex items-center gap-1">
                        <Layers size={11} /> {sections.length} {sections.length === 1 ? 'Sessão / Linha' : 'Sessões / Linhas'}
                      </span>
                      <span className="text-purple-400 text-xs font-bold bg-purple-950/40 px-2.5 py-0.5 rounded-md border border-purple-900/50">
                        {moduleGroups.length} {moduleGroups.length === 1 ? 'Bloco' : 'Blocos'}
                      </span>
                      <span className="text-zinc-300 text-xs font-bold bg-zinc-800 px-2.5 py-0.5 rounded-md">
                        {modules.length} {modules.length === 1 ? 'Módulo' : 'Módulos'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button 
                        onClick={() => setIsExportModalOpen(true)}
                        className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-bold uppercase text-[10px] rounded shadow-lg flex items-center gap-1.5 transition-all"
                        title="Gera um código HTML da estrutura do curso para usar em landing pages."
                      >
                        <Code size={14} className="text-red-500" />
                        Exportar HTML
                      </button>

                      <button 
                        onClick={() => { 
                          setEditingSection(null); 
                          setIsSectionModalOpen(true); 
                        }}
                        className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold uppercase text-xs rounded shadow-lg shadow-amber-950/30 flex items-center gap-1.5 transition-all"
                        title="Criar nova linha temática (ex: TAF, Mentoria, etc.)"
                      >
                        <Plus size={15} /> Nova Sessão / Linha
                      </button>

                      <button 
                        onClick={() => { 
                          setTargetSectionIdForNewItem(null);
                          setEditingGroup(null); 
                          setIsGroupModalOpen(true); 
                        }}
                        className="px-3.5 py-2 bg-purple-700 hover:bg-purple-600 text-white font-bold uppercase text-xs rounded shadow-lg shadow-purple-950/30 flex items-center gap-1.5 transition-all"
                      >
                        <Layers size={14} /> Novo Bloco
                      </button>

                      <button 
                        onClick={() => { 
                          setTargetSectionIdForNewItem(null);
                          setEditingModule(null); 
                          setIsModuleModalOpen(true); 
                        }}
                        className="px-3.5 py-2 bg-red-600 hover:bg-red-500 text-white font-bold uppercase text-xs rounded shadow-lg shadow-red-900/20 flex items-center gap-1.5 transition-all"
                      >
                        <Plus size={15} /> Novo Módulo
                      </button>
                    </div>
                  </div>
                )}

                {loading ? (
                  <div className="flex justify-center py-20">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600"></div>
                  </div>
                ) : selectedGroupId ? (
                  /* Visualização interna dos módulos do bloco selecionado */
                  (() => {
                    const currentGroupModules = modules.filter(m => m.groupId === selectedGroupId);
                    return currentGroupModules.length === 0 ? (
                      <div className="text-center py-20 border border-dashed border-purple-900/50 rounded-xl bg-purple-950/10">
                        <Layers size={36} className="text-purple-400 mx-auto mb-3 opacity-60" />
                        <p className="text-gray-300 font-bold text-sm">Nenhum módulo vinculado a este bloco ainda.</p>
                        <p className="text-gray-500 text-xs mt-1">Clique em "Novo Módulo neste Bloco" acima para adicionar.</p>
                      </div>
                    ) : (
                      <div className="flex gap-6 overflow-x-auto pb-6 scrollbar-thin scrollbar-thumb-purple-900 scrollbar-track-transparent px-1">
                        {currentGroupModules.map((module, index) => (
                          <motion.div
                            key={module.id}
                            layout
                            transition={{ 
                              type: 'spring', 
                              stiffness: 400, 
                              damping: 30,
                              mass: 0.8
                            }}
                            className="flex-none"
                          >
                            <CourseModuleCard 
                              module={module}
                              onEdit={(m) => { setEditingModule(m); setIsModuleModalOpen(true); }}
                              onDelete={setModuleToDelete}
                              onMigrate={setModuleToMigrate}
                              onCopy={setModuleToCopy}
                              onMoveLeft={() => { handleReorderGroupModules(currentGroupModules, index, 'left'); }}
                              onMoveRight={() => { handleReorderGroupModules(currentGroupModules, index, 'right'); }}
                              onManageContent={handleManageInternal}
                              isFirst={index === 0}
                              isLast={index === currentGroupModules.length - 1}
                            />
                          </motion.div>
                        ))}
                      </div>
                    );
                  })()
                ) : (
                  /* Visualização das Sessões (Linhas Temáticas) com Acordeão Inteligente e Itens Unificados na mesma linha */
                  (() => {
                    const rootModules = modules.filter(m => !m.groupId);
                    const hasNothing = sections.length === 0 && moduleGroups.length === 0 && rootModules.length === 0;

                    if (hasNothing) {
                      return (
                        <div className="text-center py-20 border border-dashed border-gray-800 rounded-xl bg-zinc-950/40">
                          <Layers size={40} className="text-gray-600 mx-auto mb-3" />
                          <p className="text-gray-300 font-bold text-sm">Nenhum conteúdo cadastrado neste curso.</p>
                          <p className="text-gray-500 text-xs mt-1">Crie uma Sessão (ex: TAF, Mentoria), um Bloco (ex: Conhecimentos Básicos) ou um Módulo avulso acima.</p>
                        </div>
                      );
                    }

                    // Função para renderizar uma linha de itens unificados (Blocos e Módulos juntos na mesma linha horizontal)
                    const renderUnifiedRow = (sectionIdFilter: string | null) => {
                      const rowGroups = moduleGroups.filter(g => (g.sectionId || null) === sectionIdFilter);
                      const rowModules = rootModules.filter(m => (m.sectionId || null) === sectionIdFilter);

                      const rowItems = [
                        ...rowGroups.map(g => ({
                          type: 'group' as const,
                          id: g.id,
                          order: g.order ?? 999,
                          group: g,
                          moduleCount: modules.filter(m => m.groupId === g.id).length
                        })),
                        ...rowModules.map(m => ({
                          type: 'module' as const,
                          id: m.id,
                          order: m.order ?? 999,
                          module: m
                        }))
                      ].sort((a, b) => a.order - b.order);

                      if (rowItems.length === 0) {
                        return (
                          <div className="p-8 text-center border border-dashed border-zinc-800 rounded-xl bg-black/20">
                            <p className="text-zinc-500 text-xs font-semibold">Nenhum bloco ou módulo nesta sessão ainda.</p>
                            <p className="text-zinc-600 text-[10px] mt-1">Use os botões de ação da sessão acima para adicionar blocos ou módulos.</p>
                          </div>
                        );
                      }

                      return (
                        <div className="flex gap-6 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent px-1">
                          {rowItems.map((item, index) => (
                            <motion.div
                              key={item.id}
                              layout
                              transition={{ 
                                type: 'spring', 
                                stiffness: 450, 
                                damping: 30,
                                mass: 0.8
                              }}
                              className="flex-none"
                            >
                              {item.type === 'group' ? (
                                <CourseModuleGroupCard 
                                  group={item.group}
                                  moduleCount={item.moduleCount}
                                  onOpen={(g) => setSelectedGroupId(g.id)}
                                  onEdit={(g) => { setEditingGroup(g); setIsGroupModalOpen(true); }}
                                  onDelete={(g) => setGroupToDelete(g)}
                                  onMoveLeft={() => handleMoveUnified(rowItems.map(i => ({ id: i.id, isGroup: i.type === 'group', order: i.order })), index, 'left')}
                                  onMoveRight={() => handleMoveUnified(rowItems.map(i => ({ id: i.id, isGroup: i.type === 'group', order: i.order })), index, 'right')}
                                  isFirst={index === 0}
                                  isLast={index === rowItems.length - 1}
                                />
                              ) : (
                                <CourseModuleCard 
                                  module={item.module}
                                  onEdit={(m) => { setEditingModule(m); setIsModuleModalOpen(true); }}
                                  onDelete={setModuleToDelete}
                                  onMigrate={setModuleToMigrate}
                                  onCopy={setModuleToCopy}
                                  onMoveLeft={() => handleMoveUnified(rowItems.map(i => ({ id: i.id, isGroup: i.type === 'group', order: i.order })), index, 'left')}
                                  onMoveRight={() => handleMoveUnified(rowItems.map(i => ({ id: i.id, isGroup: i.type === 'group', order: i.order })), index, 'right')}
                                  onManageContent={handleManageInternal}
                                  isFirst={index === 0}
                                  isLast={index === rowItems.length - 1}
                                />
                              )}
                            </motion.div>
                          ))}
                        </div>
                      );
                    };

                    // Se não existem sessões criadas, renderiza todos os itens na linha principal unificada
                    if (sections.length === 0) {
                      return (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                                <Layers size={16} className="text-amber-500" />
                                Disciplinas e Blocos do Curso
                              </h3>
                              <span className="text-[10px] text-zinc-400 font-bold bg-zinc-800 px-2 py-0.5 rounded-full">
                                {moduleGroups.length + rootModules.length} itens
                              </span>
                            </div>
                            <span className="text-[11px] text-zinc-500">
                              Blocos e disciplinas organizados lado a lado na mesma linha
                            </span>
                          </div>

                          {renderUnifiedRow(null)}
                        </div>
                      );
                    }

                    // Se existem sessões personalizadas, renderiza cada sessão com Acordeão Inteligente
                    return (
                      <div className="space-y-6">
                        {sections.map((section, sIndex) => {
                          const isCollapsed = !!collapsedSections[section.id];
                          const secGroupsCount = moduleGroups.filter(g => g.sectionId === section.id).length;
                          const secModulesCount = rootModules.filter(m => m.sectionId === section.id).length;
                          const totalItems = secGroupsCount + secModulesCount;

                          return (
                            <motion.div 
                              key={section.id} 
                              layout
                              transition={{ 
                                type: 'spring', 
                                stiffness: 400, 
                                damping: 32,
                                mass: 0.8
                              }}
                              className="bg-zinc-950/60 border border-zinc-800/90 rounded-2xl p-4 transition-all hover:border-zinc-700 shadow-md"
                            >
                              {/* Header do Acordeão da Sessão */}
                              <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                                <button
                                  type="button"
                                  onClick={() => toggleSection(section.id)}
                                  className="flex items-center gap-3 text-left group focus:outline-none"
                                >
                                  <div className="p-1 rounded-md bg-zinc-800 text-zinc-300 group-hover:bg-amber-500 group-hover:text-black transition-colors">
                                    {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <h3 className="text-base font-black uppercase text-white group-hover:text-amber-400 transition-colors">
                                        {section.title}
                                      </h3>
                                      <span className="text-[10px] font-bold text-amber-300 bg-amber-950/60 border border-amber-800/60 px-2 py-0.5 rounded-full">
                                        {totalItems} {totalItems === 1 ? 'item' : 'itens'}
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-zinc-500">
                                      {secGroupsCount} {secGroupsCount === 1 ? 'bloco' : 'blocos'}, {secModulesCount} {secModulesCount === 1 ? 'módulo avulso' : 'módulos avulsos'}
                                    </p>
                                  </div>
                                </button>

                                {/* Ações da Sessão */}
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {/* Mover Linha para Cima / Baixo */}
                                  <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 mr-1">
                                    <button
                                      type="button"
                                      disabled={sIndex === 0}
                                      onClick={() => handleReorderSections(sIndex, 'up')}
                                      className="p-1 text-zinc-400 hover:text-white disabled:opacity-20 transition-colors"
                                      title="Mover sessão para cima"
                                    >
                                      <ArrowUp size={14} />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={sIndex === sections.length - 1}
                                      onClick={() => handleReorderSections(sIndex, 'down')}
                                      className="p-1 text-zinc-400 hover:text-white disabled:opacity-20 transition-colors"
                                      title="Mover sessão para baixo"
                                    >
                                      <ArrowDown size={14} />
                                    </button>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingSection(section);
                                      setIsSectionModalOpen(true);
                                    }}
                                    className="p-2 text-zinc-400 hover:text-amber-400 hover:bg-zinc-900 rounded-lg transition-colors"
                                    title="Editar nome da sessão"
                                  >
                                    <Edit2 size={14} />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setSectionToDelete(section)}
                                    className="p-2 text-zinc-400 hover:text-red-400 hover:bg-zinc-900 rounded-lg transition-colors"
                                    title="Excluir sessão"
                                  >
                                    <Trash2 size={14} />
                                  </button>

                                  <div className="h-4 w-[1px] bg-zinc-800 mx-1" />

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setTargetSectionIdForNewItem(section.id);
                                      setEditingGroup(null);
                                      setIsGroupModalOpen(true);
                                    }}
                                    className="px-2.5 py-1.5 bg-purple-900/40 hover:bg-purple-900/70 border border-purple-700/50 text-purple-200 text-[11px] font-bold uppercase rounded-lg flex items-center gap-1 transition-colors"
                                  >
                                    <Layers size={12} /> + Bloco
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setTargetSectionIdForNewItem(section.id);
                                      setEditingModule(null);
                                      setIsModuleModalOpen(true);
                                    }}
                                    className="px-2.5 py-1.5 bg-red-900/40 hover:bg-red-900/70 border border-red-700/50 text-red-200 text-[11px] font-bold uppercase rounded-lg flex items-center gap-1 transition-colors"
                                  >
                                    <Plus size={12} /> + Módulo
                                  </button>
                                </div>
                              </div>

                              {/* Corpo do Acordeão */}
                              {!isCollapsed && (
                                <div className="mt-4 pt-3 border-t border-zinc-900 animate-in fade-in">
                                  {renderUnifiedRow(section.id)}
                                </div>
                              )}
                            </motion.div>
                          );
                        })}

                        {/* Itens que não foram vinculados a nenhuma sessão ainda */}
                        {(() => {
                          const unassignedGroups = moduleGroups.filter(g => !g.sectionId);
                          const unassignedModules = rootModules.filter(m => !m.sectionId);
                          const totalUnassigned = unassignedGroups.length + unassignedModules.length;

                          if (totalUnassigned === 0) return null;

                          const isUnassignedCollapsed = !!collapsedSections['unassigned'];

                          return (
                            <div className="bg-zinc-950/40 border border-dashed border-zinc-800 rounded-2xl p-4 mt-6">
                              <div className="flex items-center justify-between mb-2">
                                <button
                                  type="button"
                                  onClick={() => toggleSection('unassigned')}
                                  className="flex items-center gap-3 text-left group"
                                >
                                  <div className="p-1 rounded-md bg-zinc-800 text-zinc-300">
                                    {isUnassignedCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                                  </div>
                                  <div>
                                    <h4 className="text-sm font-bold uppercase text-zinc-400">
                                      Itens Fora de Sessões Específicas ({totalUnassigned})
                                    </h4>
                                    <p className="text-[10px] text-zinc-500">
                                      Estes itens podem ser vinculados a uma sessão editando seus cadastros.
                                    </p>
                                  </div>
                                </button>
                              </div>

                              {!isUnassignedCollapsed && (
                                <div className="mt-4 pt-3 border-t border-zinc-900">
                                  {renderUnifiedRow(null)}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })()
                )}
             </div>
          )}
      </div>

      {/* Modais de Sessão */}
      <CourseSectionModal 
        isOpen={isSectionModalOpen}
        onClose={() => setIsSectionModalOpen(false)}
        onSave={handleSaveSection}
        initialData={editingSection}
      />

      <ConfirmationModal 
        isOpen={!!sectionToDelete}
        title="Excluir Sessão?"
        message={`Deseja excluir a sessão "${sectionToDelete?.title}"? Os blocos e módulos contidos nela NÃO serão apagados, eles apenas voltarão para a visualização geral.`}
        onConfirm={handleDeleteSection}
        onCancel={() => setSectionToDelete(null)}
        isDanger
      />

      {/* Modais de Módulo */}
      <CourseModuleModal 
        isOpen={isModuleModalOpen}
        onClose={() => setIsModuleModalOpen(false)}
        onSave={handleSaveModule}
        initialData={editingModule}
        moduleGroups={moduleGroups}
        defaultGroupId={selectedGroupId}
        sections={sections}
        defaultSectionId={targetSectionIdForNewItem}
      />

      <ConfirmationModal 
        isOpen={!!moduleToDelete}
        title="Excluir Módulo?"
        message={`Deseja excluir "${moduleToDelete?.title}"? Todo o conteúdo interno será perdido.`}
        onConfirm={handleDeleteModule}
        onCancel={() => setModuleToDelete(null)}
        isDanger
      />

      {/* Modais de Bloco / Grupo */}
      <CourseModuleGroupModal 
        isOpen={isGroupModalOpen}
        onClose={() => setIsGroupModalOpen(false)}
        onSave={handleSaveGroup}
        initialData={editingGroup}
        sections={sections}
        defaultSectionId={targetSectionIdForNewItem}
      />

      <ConfirmationModal 
        isOpen={!!groupToDelete}
        title="Excluir Bloco de Módulos?"
        message={`Deseja excluir o bloco "${groupToDelete?.title}"? Os módulos contidos nele NÃO serão perdidos; eles retornarão automaticamente para a visualização principal.`}
        onConfirm={handleDeleteGroup}
        onCancel={() => setGroupToDelete(null)}
        isDanger
      />

      <ExportCourseStructureModal 
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        course={course}
      />

      <MigrateModuleModal 
        isOpen={!!moduleToMigrate}
        onClose={() => setModuleToMigrate(null)}
        sourceModule={moduleToMigrate}
        availableModules={modules}
        onConfirm={handleMigrateModule}
      />

      <CopyModuleModal 
        isOpen={!!moduleToCopy}
        onClose={() => setModuleToCopy(null)}
        sourceModule={moduleToCopy}
        onConfirm={handleCopyModule}
      />
    </div>
  );
}