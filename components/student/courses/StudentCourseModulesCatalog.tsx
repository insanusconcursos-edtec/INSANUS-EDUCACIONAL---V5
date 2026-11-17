import React, { useState } from 'react';
import { CourseModule, CourseModuleGroup, CourseSection } from '../../../types/course';
import { StudentModuleCard } from './StudentModuleCard';
import { StudentModuleGroupCard } from './StudentModuleGroupCard';
import { ArrowLeft, Layers, ChevronDown, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';

interface StudentCourseModulesCatalogProps {
  modules: CourseModule[];
  moduleGroups: CourseModuleGroup[];
  sections: CourseSection[];
  selectedGroupId: string | null;
  onSelectGroup: (groupId: string | null) => void;
  onSelectModule: (module: CourseModule) => void;
  isMaintenance?: boolean;
  maintenanceMessage?: string;
  emptyMessage?: string;
}

export const StudentCourseModulesCatalog: React.FC<StudentCourseModulesCatalogProps> = ({
  modules,
  moduleGroups,
  sections,
  selectedGroupId,
  onSelectGroup,
  onSelectModule,
  isMaintenance = false,
  maintenanceMessage,
  emptyMessage = 'Nenhum módulo ou bloco disponível neste curso.'
}) => {
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const toggleSectionCollapse = (sectionId: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  };

  const handleLockedOrSelectModule = (module: CourseModule) => {
    if (isMaintenance) {
      toast.error(maintenanceMessage || 'O conteúdo do curso foi trancado para atualização.');
      return;
    }
    onSelectModule(module);
  };

  const handleLockedOrSelectGroup = (group: CourseModuleGroup) => {
    if (isMaintenance) {
      toast.error(maintenanceMessage || 'O conteúdo do curso foi trancado para atualização.');
      return;
    }
    onSelectGroup(group.id);
  };

  // 1. VISÃO INTERNA DO BLOCO SELECIONADO
  if (selectedGroupId) {
    const activeGroup = moduleGroups.find((g) => g.id === selectedGroupId);
    const currentGroupModules = modules
      .filter((m) => m.groupId === selectedGroupId)
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

    return (
      <div className="space-y-6 animate-in fade-in">
        {/* Barra de Navegação do Bloco */}
        <div className="flex items-center justify-between gap-4 bg-purple-950/20 border border-purple-900/40 p-4 rounded-xl">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => onSelectGroup(null)}
              className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-lg border border-zinc-700 text-xs font-bold uppercase flex items-center gap-2 transition-all shadow cursor-pointer"
            >
              <ArrowLeft size={14} /> Voltar aos Blocos
            </button>
            <div className="border-l border-zinc-800 pl-3">
              <div className="flex items-center gap-2">
                <span className="text-purple-400 font-black text-[10px] uppercase tracking-wider flex items-center gap-1">
                  <Layers size={11} /> Bloco de Disciplinas
                </span>
                <span className="bg-purple-900/60 text-purple-200 text-[10px] font-bold px-2 py-0.5 rounded-full border border-purple-700/50">
                  {currentGroupModules.length} {currentGroupModules.length === 1 ? 'módulo' : 'módulos'}
                </span>
              </div>
              <h3 className="text-white font-black text-lg uppercase drop-shadow-sm">
                {activeGroup?.title || 'Bloco Selecionado'}
              </h3>
            </div>
          </div>
        </div>

        {/* Cards dos Módulos do Bloco */}
        {currentGroupModules.length === 0 ? (
          <div className="text-zinc-500 italic px-1 text-sm border-l-2 border-purple-900 pl-4 py-4 bg-purple-950/10 rounded-r-xl">
            Nenhum módulo disponível neste bloco no momento.
          </div>
        ) : (
          <div className="flex gap-4 md:gap-6 overflow-x-auto pb-8 scrollbar-thin scrollbar-thumb-purple-900 scrollbar-track-transparent px-1">
            {currentGroupModules.map((module) => (
              <StudentModuleCard
                key={module.id}
                module={module}
                onClick={handleLockedOrSelectModule}
                isLocked={isMaintenance}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // 2. VISÃO GERAL (SESSÕES TEMÁTICAS COM ACORDEÃO E LINHAS UNIFICADAS DE BLOCOS + MÓDULOS AVULSOS)
  const rootModules = modules.filter((m) => !m.groupId);
  const hasSections = sections.length > 0;
  const hasGroups = moduleGroups.length > 0;
  const hasRootModules = rootModules.length > 0;

  if (!hasSections && !hasGroups && !hasRootModules) {
    return (
      <div className="p-8 text-center bg-zinc-900/50 rounded-xl border border-zinc-800 text-zinc-500">
        {emptyMessage}
      </div>
    );
  }

  const renderUnifiedRow = (sectionIdFilter: string | null) => {
    const rowGroups = moduleGroups.filter((g) => (g.sectionId || null) === sectionIdFilter);
    const rowModules = rootModules.filter((m) => (m.sectionId || null) === sectionIdFilter);

    const rowItems = [
      ...rowGroups.map((g) => ({
        type: 'group' as const,
        id: g.id,
        order: g.order ?? 999,
        group: g,
        moduleCount: modules.filter((m) => m.groupId === g.id).length
      })),
      ...rowModules.map((m) => ({
        type: 'module' as const,
        id: m.id,
        order: m.order ?? 999,
        module: m
      }))
    ].sort((a, b) => a.order - b.order);

    if (rowItems.length === 0) {
      return (
        <div className="py-4 text-zinc-600 italic text-xs pl-2">
          Nenhum conteúdo cadastrado nesta sessão.
        </div>
      );
    }

    return (
      <div className="flex gap-4 md:gap-6 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent px-1">
        {rowItems.map((item) => {
          if (item.type === 'group') {
            return (
              <StudentModuleGroupCard
                key={item.id}
                group={item.group}
                moduleCount={item.moduleCount}
                onClick={handleLockedOrSelectGroup}
                isMaintenanceLocked={isMaintenance}
              />
            );
          }
          return (
            <StudentModuleCard
              key={item.id}
              module={item.module}
              onClick={handleLockedOrSelectModule}
              isLocked={isMaintenance}
            />
          );
        })}
      </div>
    );
  };

  // Sem sessões temáticas: exibe todos os itens de primeiro nível (blocos e módulos avulsos) na mesma linha horizontal
  if (!hasSections) {
    const allRootItems = [
      ...moduleGroups.map((g) => ({
        type: 'group' as const,
        id: g.id,
        order: g.order ?? 999,
        group: g,
        moduleCount: modules.filter((m) => m.groupId === g.id).length
      })),
      ...rootModules.map((m) => ({
        type: 'module' as const,
        id: m.id,
        order: m.order ?? 999,
        module: m
      }))
    ].sort((a, b) => a.order - b.order);

    return (
      <div className="flex gap-4 md:gap-6 overflow-x-auto pb-8 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent px-1">
        {allRootItems.map((item) => {
          if (item.type === 'group') {
            return (
              <StudentModuleGroupCard
                key={item.id}
                group={item.group}
                moduleCount={item.moduleCount}
                onClick={handleLockedOrSelectGroup}
                isMaintenanceLocked={isMaintenance}
              />
            );
          }
          return (
            <StudentModuleCard
              key={item.id}
              module={item.module}
              onClick={handleLockedOrSelectModule}
              isLocked={isMaintenance}
            />
          );
        })}
      </div>
    );
  }

  // Com sessões temáticas: exibe cada sessão com Acordeão Inteligente
  const unassignedGroups = moduleGroups.filter((g) => !g.sectionId);
  const unassignedModules = rootModules.filter((m) => !m.sectionId);
  const hasUnassigned = unassignedGroups.length > 0 || unassignedModules.length > 0;

  return (
    <div className="space-y-6">
      {sections.map((section) => {
        const isCollapsed = !!collapsedSections[section.id];
        const sectionGroups = moduleGroups.filter((g) => g.sectionId === section.id);
        const sectionModules = rootModules.filter((m) => m.sectionId === section.id);
        const totalItems = sectionGroups.length + sectionModules.length;

        return (
          <div
            key={section.id}
            className="bg-zinc-950/40 border border-zinc-800/80 rounded-2xl p-4 md:p-5 transition-all"
          >
            <button
              type="button"
              onClick={() => toggleSectionCollapse(section.id)}
              className="w-full flex items-center justify-between text-left group hover:opacity-90 transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 group-hover:text-white transition-colors">
                  {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                </div>
                <h3 className="text-white font-black text-sm md:text-base uppercase tracking-wider flex items-center gap-2">
                  {section.title}
                </h3>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-zinc-900 text-zinc-400 border border-zinc-800">
                  {totalItems} {totalItems === 1 ? 'item' : 'itens'}
                </span>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 group-hover:text-zinc-300 transition-colors">
                {isCollapsed ? 'Expandir' : 'Recolher'}
              </span>
            </button>

            <AnimatePresence initial={false}>
              {!isCollapsed && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden mt-4 pt-4 border-t border-zinc-800/60"
                >
                  {renderUnifiedRow(section.id)}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}

      {hasUnassigned && (
        <div className="bg-zinc-950/40 border border-zinc-800/80 rounded-2xl p-4 md:p-5 transition-all">
          <button
            type="button"
            onClick={() => toggleSectionCollapse('unassigned')}
            className="w-full flex items-center justify-between text-left group hover:opacity-90 transition-all cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 group-hover:text-white transition-colors">
                {collapsedSections['unassigned'] ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
              </div>
              <h3 className="text-white font-black text-sm md:text-base uppercase tracking-wider flex items-center gap-2">
                Disciplinas Gerais / Outros Módulos
              </h3>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-zinc-900 text-zinc-400 border border-zinc-800">
                {unassignedGroups.length + unassignedModules.length}{' '}
                {unassignedGroups.length + unassignedModules.length === 1 ? 'item' : 'itens'}
              </span>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 group-hover:text-zinc-300 transition-colors">
              {collapsedSections['unassigned'] ? 'Expandir' : 'Recolher'}
            </span>
          </button>

          <AnimatePresence initial={false}>
            {!collapsedSections['unassigned'] && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden mt-4 pt-4 border-t border-zinc-800/60"
              >
                {renderUnifiedRow(null)}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};
