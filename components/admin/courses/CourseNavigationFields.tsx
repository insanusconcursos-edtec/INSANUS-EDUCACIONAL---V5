import React, { useMemo } from 'react';
import {
  Eye,
  EyeOff,
  Building2,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  LayoutList,
  ListTree,
  Radio,
  Megaphone,
  Target,
  CalendarDays,
  BookOpen,
  GraduationCap,
  FileText,
  Layers,
  Check,
  Loader2
} from 'lucide-react';
import {
  NativeCourseTabId,
  CoursePresentialSharedTabKey,
  CoursePresentialSharedTabsMap
} from '../../../types/course';
import { Class } from '../../../types/class';
import {
  NATIVE_COURSE_TABS_META,
  COURSE_PRESENTIAL_SHARED_TABS_META,
  isNativeCourseTabHidden,
  isCoursePresentialTabShared,
  getCoursePresentialTabLabel
} from '../../../utils/courseNavigation';

export interface CourseNavigationDraftValue {
  hiddenTabs: NativeCourseTabId[];
  linkedPresentialId: string;
  linkedPresentialTabName: string;
  linkedPresentialModules: string[] | 'all';
  linkedPresentialSharedTabs: Required<CoursePresentialSharedTabsMap>;
}

interface PresentialModuleOption {
  id: string;
  name: string;
}

interface CourseNavigationFieldsProps {
  value: CourseNavigationDraftValue;
  onChange: (next: CourseNavigationDraftValue) => void;
  availablePresentialClasses: Class[];
  loadingClasses?: boolean;
  availablePresentialModules: PresentialModuleOption[];
  loadingPresentialModules?: boolean;
  compact?: boolean;
}

const NATIVE_COURSE_TAB_ICONS: Record<
  NativeCourseTabId,
  React.ComponentType<{ size?: number; className?: string }>
> = {
  MODULES: LayoutList,
  EDITAL: ListTree,
  LIVE: Radio,
  ANNOUNCEMENTS: Megaphone
};

const PRESENTIAL_SHARED_TAB_ICONS: Record<
  CoursePresentialSharedTabKey,
  React.ComponentType<{ size?: number; className?: string }>
> = {
  dailyGoals: Target,
  schedule: CalendarDays,
  planning: BookOpen,
  teaching: GraduationCap,
  live: Radio,
  simulados: FileText
};

export const CourseNavigationFields: React.FC<CourseNavigationFieldsProps> = ({
  value,
  onChange,
  availablePresentialClasses,
  loadingClasses = false,
  availablePresentialModules,
  loadingPresentialModules = false,
  compact = false
}) => {
  const selectedClassObj = useMemo(
    () => availablePresentialClasses.find((c) => c.id === value.linkedPresentialId) || null,
    [availablePresentialClasses, value.linkedPresentialId]
  );

  // Ordem real das abas renderizadas em CourseDetails.tsx
  const previewTabs = useMemo(() => {
    const items: Array<{ key: string; label: string; source: 'native' | 'presential' }> = [];

    if (!isNativeCourseTabHidden(value, 'MODULES')) {
      items.push({ key: 'MODULES', label: 'MÓDULOS DO CURSO', source: 'native' });
    }
    if (isCoursePresentialTabShared(value, 'dailyGoals')) {
      items.push({
        key: 'PRESENTIAL_DAILY_GOALS',
        label: getCoursePresentialTabLabel(value, 'dailyGoals'),
        source: 'presential'
      });
    }
    if (isCoursePresentialTabShared(value, 'schedule')) {
      items.push({
        key: 'PRESENTIAL_SCHEDULE',
        label: getCoursePresentialTabLabel(value, 'schedule'),
        source: 'presential'
      });
    }
    if (isCoursePresentialTabShared(value, 'planning')) {
      items.push({
        key: 'PRESENTIAL_PLANNING',
        label: getCoursePresentialTabLabel(value, 'planning'),
        source: 'presential'
      });
    }
    if (!isNativeCourseTabHidden(value, 'EDITAL')) {
      items.push({ key: 'EDITAL', label: 'EDITAL VERTICALIZADO', source: 'native' });
    }
    if (isCoursePresentialTabShared(value, 'teaching')) {
      items.push({
        key: 'PRESENTIAL',
        label: getCoursePresentialTabLabel(value, 'teaching'),
        source: 'presential'
      });
    }
    if (isCoursePresentialTabShared(value, 'simulados')) {
      items.push({
        key: 'PRESENTIAL_SIMULADOS',
        label: getCoursePresentialTabLabel(value, 'simulados'),
        source: 'presential'
      });
    }
    if (!isNativeCourseTabHidden(value, 'LIVE')) {
      items.push({ key: 'LIVE', label: 'EVENTOS AO VIVO', source: 'native' });
    }
    if (isCoursePresentialTabShared(value, 'live')) {
      items.push({
        key: 'PRESENTIAL_LIVE',
        label: getCoursePresentialTabLabel(value, 'live'),
        source: 'presential'
      });
    }
    if (!isNativeCourseTabHidden(value, 'ANNOUNCEMENTS')) {
      items.push({ key: 'ANNOUNCEMENTS', label: 'AVISOS', source: 'native' });
    }

    return items;
  }, [value]);

  const toggleNativeTab = (tabId: NativeCourseTabId) => {
    const nextHidden = value.hiddenTabs.includes(tabId)
      ? value.hiddenTabs.filter((id) => id !== tabId)
      : [...value.hiddenTabs, tabId];

    onChange({
      ...value,
      hiddenTabs: nextHidden
    });
  };

  const handleSelectPresentialClass = (classId: string) => {
    if (!classId) {
      onChange({
        ...value,
        linkedPresentialId: ''
      });
      return;
    }

    // Se nenhuma aba presencial estiver marcada ao selecionar a turma pela primeira vez,
    // ativamos Metas de Hoje + Cronograma + Planejamento por conveniência, ou preservamos escolhas já feitas.
    const anyEnabled = Object.values(value.linkedPresentialSharedTabs).some((t) => t?.enabled);
    const nextShared = anyEnabled
      ? value.linkedPresentialSharedTabs
      : {
          ...value.linkedPresentialSharedTabs,
          dailyGoals: {
            enabled: true,
            label: value.linkedPresentialSharedTabs.dailyGoals.label || 'METAS DE HOJE'
          },
          schedule: {
            enabled: true,
            label: value.linkedPresentialSharedTabs.schedule.label || 'CRONOGRAMA'
          },
          planning: {
            enabled: true,
            label: value.linkedPresentialSharedTabs.planning.label || 'PLANEJAMENTO'
          }
        };

    onChange({
      ...value,
      linkedPresentialId: classId,
      linkedPresentialSharedTabs: nextShared,
      linkedPresentialTabName:
        nextShared.teaching.label || value.linkedPresentialTabName || 'AULAS PRESENCIAIS'
    });
  };

  const togglePresentialTab = (key: CoursePresentialSharedTabKey) => {
    const current = value.linkedPresentialSharedTabs[key];
    const meta = COURSE_PRESENTIAL_SHARED_TABS_META.find((m) => m.key === key);
    const nextLabel = current?.label || meta?.defaultLabel || key.toUpperCase();
    const nextShared: Required<CoursePresentialSharedTabsMap> = {
      ...value.linkedPresentialSharedTabs,
      [key]: {
        enabled: !current?.enabled,
        label: nextLabel
      }
    };

    onChange({
      ...value,
      linkedPresentialSharedTabs: nextShared,
      linkedPresentialTabName:
        key === 'teaching' ? nextLabel : value.linkedPresentialTabName || nextShared.teaching.label || ''
    });
  };

  const updatePresentialTabLabel = (key: CoursePresentialSharedTabKey, label: string) => {
    const nextShared: Required<CoursePresentialSharedTabsMap> = {
      ...value.linkedPresentialSharedTabs,
      [key]: {
        enabled: Boolean(value.linkedPresentialSharedTabs[key]?.enabled),
        label
      }
    };

    onChange({
      ...value,
      linkedPresentialSharedTabs: nextShared,
      linkedPresentialTabName:
        key === 'teaching' ? label : value.linkedPresentialTabName || nextShared.teaching.label || ''
    });
  };

  const applyPresentialStudyPreset = () => {
    const targetClassId =
      value.linkedPresentialId || (availablePresentialClasses[0]?.id ?? '');
    const nextShared: Required<CoursePresentialSharedTabsMap> = {
      ...value.linkedPresentialSharedTabs,
      dailyGoals: {
        enabled: true,
        label: value.linkedPresentialSharedTabs.dailyGoals.label || 'METAS DE HOJE'
      },
      schedule: {
        enabled: true,
        label: value.linkedPresentialSharedTabs.schedule.label || 'CRONOGRAMA'
      },
      planning: {
        enabled: true,
        label: value.linkedPresentialSharedTabs.planning.label || 'PLANEJAMENTO'
      }
    };

    onChange({
      ...value,
      linkedPresentialId: targetClassId,
      linkedPresentialSharedTabs: nextShared
    });
  };

  const togglePresentialModule = (moduleId: string) => {
    let currentModules = value.linkedPresentialModules;

    if (currentModules === 'all') {
      const allIds = availablePresentialModules.map((s) => s.id);
      currentModules = allIds.filter((id) => id !== moduleId);
    } else {
      const list = Array.isArray(currentModules) ? currentModules : [];
      currentModules = list.includes(moduleId)
        ? list.filter((id) => id !== moduleId)
        : [...list, moduleId];
    }

    onChange({
      ...value,
      linkedPresentialModules: currentModules
    });
  };

  const setAllPresentialModules = () => {
    onChange({
      ...value,
      linkedPresentialModules: 'all'
    });
  };

  return (
    <div className="space-y-5">
      {/* PRÉVIA EM TEMPO REAL DA BARRA DE ABAS DO ALUNO */}
      <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/90 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-2">
            <ShieldCheck size={13} className="text-emerald-400" />
            Prévia das Abas do Curso ({previewTabs.length}{' '}
            {previewTabs.length === 1 ? 'aba visível' : 'abas visíveis'})
          </span>
          <div className="flex items-center gap-3 text-[10px] font-bold">
            <span className="flex items-center gap-1.5 text-zinc-400">
              <span className="w-2 h-2 rounded-full bg-zinc-600" /> Nativa do Curso
            </span>
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500" /> Turma Presencial
            </span>
          </div>
        </div>

        {previewTabs.length === 0 ? (
          <div className="text-[11px] text-amber-400 font-bold py-1">
            Atenção: todas as abas estão ocultas. Mantenha ao menos uma aba visível para os alunos.
          </div>
        ) : (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {previewTabs.map((item, idx) => (
              <div
                key={item.key}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap border flex items-center gap-2 shrink-0 ${
                  item.source === 'presential'
                    ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-300'
                    : 'bg-zinc-900 border-zinc-700/80 text-zinc-200'
                }`}
              >
                <span>{item.label}</span>
                {idx === 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[8px] font-black">
                    INICIAL
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 1. VISIBILIDADE DAS ABAS NATIVAS DO CURSO ONLINE */}
      <div className="bg-[#1a1d24] p-4 md:p-5 rounded-xl border border-gray-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Eye size={15} className="text-red-500" />
              <span>Visibilidade das Abas Nativas do Curso</span>
            </h3>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Oculte livremente abas nativas que não devam aparecer para os alunos deste curso online.
            </p>
          </div>
          <span className="text-[10px] font-bold text-zinc-400 uppercase tabular-nums">
            {NATIVE_COURSE_TABS_META.length - value.hiddenTabs.length} visíveis •{' '}
            {value.hiddenTabs.length} ocultas
          </span>
        </div>

        <div
          className={`grid gap-3 ${
            compact ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4'
          }`}
        >
          {NATIVE_COURSE_TABS_META.map((tabMeta) => {
            const isHidden = value.hiddenTabs.includes(tabMeta.id);
            const isVisible = !isHidden;
            const IconComp = NATIVE_COURSE_TAB_ICONS[tabMeta.id] || FileText;

            return (
              <button
                key={tabMeta.id}
                type="button"
                onClick={() => toggleNativeTab(tabMeta.id)}
                className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between gap-3 ${
                  isVisible
                    ? 'bg-zinc-950/90 border-zinc-800 hover:border-zinc-700'
                    : 'bg-red-950/15 border-red-900/35 hover:border-red-800/50 opacity-85'
                }`}
              >
                <div className="space-y-2 w-full">
                  <div className="flex items-center justify-between gap-2">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center border ${
                        isVisible
                          ? 'bg-zinc-900 border-zinc-800 text-zinc-200'
                          : 'bg-red-950/40 border-red-900/40 text-red-400'
                      }`}
                    >
                      <IconComp size={14} />
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border flex items-center gap-1 ${
                        isVisible
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-red-500/15 text-red-400 border-red-500/30'
                      }`}
                    >
                      {isVisible ? <Eye size={10} /> : <EyeOff size={10} />}
                      {isVisible ? 'Visível' : 'Oculta'}
                    </span>
                  </div>

                  <div
                    className={`text-[11px] font-black uppercase tracking-wider ${
                      isVisible ? 'text-white' : 'text-zinc-400 line-through'
                    }`}
                  >
                    {tabMeta.label}
                  </div>
                  <p className="text-[10px] text-zinc-500 leading-relaxed">{tabMeta.description}</p>
                </div>

                <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between w-full">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                    {isVisible ? 'Exibida no Curso' : 'Ocultada'}
                  </span>
                  <div
                    className={`w-9 h-5 rounded-full transition-colors relative ${
                      isVisible ? 'bg-emerald-600' : 'bg-zinc-800'
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        isVisible ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. VINCULAR TURMA PRESENCIAL E COMPARTILHAR RECURSOS (ABAS) */}
      <div className="bg-[#1a1d24] p-4 md:p-5 rounded-xl border border-gray-800 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
          <div>
            <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Building2 size={15} className="text-emerald-400" />
              <span>Vincular Turma Presencial & Compartilhar Recursos (Abas)</span>
            </h3>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Referencie uma Turma Presencial para liberar no curso online suas abas de{' '}
              <strong>Metas Diárias</strong>, <strong>Cronograma</strong>,{' '}
              <strong>Planejamento</strong>, <strong>Aulas Presenciais</strong>,{' '}
              <strong>Ao Vivo</strong> e <strong>Simulados</strong>.
            </p>
          </div>

          {availablePresentialClasses.length > 0 && (
            <button
              type="button"
              onClick={applyPresentialStudyPreset}
              className="px-3 py-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-300 text-[10px] font-black uppercase tracking-wider transition-colors flex items-center gap-1.5 shrink-0"
              title="Ativa automaticamente Metas de Hoje + Cronograma + Planejamento da Turma Presencial"
            >
              <Sparkles size={13} />
              <span>Ativar Metas + Cronograma + Planejamento</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          <div className="md:col-span-7 space-y-1.5">
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
              Turma Presencial Referenciada
            </label>
            {loadingClasses ? (
              <div className="h-11 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center px-3 gap-2 text-xs text-zinc-500">
                <Loader2 size={14} className="animate-spin" /> Carregando turmas presenciais...
              </div>
            ) : (
              <select
                value={value.linkedPresentialId || ''}
                onChange={(e) => handleSelectPresentialClass(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs text-white focus:border-emerald-500 outline-none cursor-pointer uppercase font-bold"
              >
                <option value="">Nenhuma turma presencial vinculada</option>
                {availablePresentialClasses.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name} •{' '}
                    {cls.shift === 'MORNING'
                      ? 'MANHÃ'
                      : cls.shift === 'AFTERNOON'
                        ? 'TARDE'
                        : 'NOITE'}
                    {cls.isGuidedStudyEnabled ? ' • [ESTUDO GUIADO]' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="md:col-span-5">
            {selectedClassObj ? (
              <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/30 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400 block">
                    TURMA VINCULADA
                  </span>
                  <p className="text-xs font-black text-white uppercase truncate">
                    {selectedClassObj.name}
                  </p>
                </div>
                <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-zinc-950 border border-dashed border-zinc-800 text-[10px] text-zinc-500">
                Selecione uma turma presencial para habilitar suas abas no curso online.
              </div>
            )}
          </div>
        </div>

        {value.linkedPresentialId && (
          <div className="space-y-4 pt-1 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                Abas da Turma Presencial compartilhadas neste Curso Online
              </label>
              <span className="text-[10px] text-zinc-500">
                Ative os recursos desejados e personalize o título da aba
              </span>
            </div>

            <div
              className={`grid gap-3 ${
                compact ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
              }`}
            >
              {COURSE_PRESENTIAL_SHARED_TABS_META.map((meta) => {
                const tabState = value.linkedPresentialSharedTabs[meta.key];
                const isEnabled = Boolean(tabState?.enabled);
                const customLabel = tabState?.label ?? meta.defaultLabel;
                const IconComp = PRESENTIAL_SHARED_TAB_ICONS[meta.key] || CalendarDays;

                return (
                  <div
                    key={meta.key}
                    className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between gap-3 ${
                      isEnabled
                        ? 'bg-emerald-950/15 border-emerald-500/40 shadow-md shadow-emerald-950/20'
                        : 'bg-zinc-950/80 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center border shrink-0 ${
                              isEnabled
                                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                                : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                            }`}
                          >
                            <IconComp size={14} />
                          </div>
                          <div className="min-w-0">
                            <span className="text-[11px] font-black uppercase text-white block truncate">
                              {meta.defaultLabel}
                            </span>
                            <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-400/90">
                              Turma Presencial
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => togglePresentialTab(meta.key)}
                          className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${
                            isEnabled ? 'bg-emerald-600' : 'bg-zinc-800'
                          }`}
                          title={isEnabled ? 'Desativar aba' : 'Ativar aba'}
                        >
                          <div
                            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                              isEnabled ? 'translate-x-5' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      </div>

                      <p className="text-[10px] text-zinc-400 leading-relaxed">{meta.description}</p>
                    </div>

                    <div className="pt-2.5 border-t border-zinc-800/80 space-y-1">
                      <label className="block text-[9px] font-black uppercase tracking-widest text-zinc-500">
                        Título da Aba no Aluno
                      </label>
                      <input
                        type="text"
                        value={customLabel}
                        onChange={(e) => updatePresentialTabLabel(meta.key, e.target.value)}
                        placeholder={meta.defaultLabel}
                        className="w-full bg-zinc-900 border border-zinc-800 focus:border-emerald-500 rounded-lg px-2.5 py-1.5 text-xs font-bold text-white uppercase outline-none"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* FILTRO OPCIONAL DE MÓDULOS DA ÁREA DE ENSINO PRESENCIAL QUANDO ATIVA */}
            {value.linkedPresentialSharedTabs.teaching?.enabled && (
              <div className="p-4 rounded-xl bg-zinc-950/90 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <label className="block text-[10px] font-bold text-zinc-300 uppercase tracking-widest">
                    Quais módulos da Área de Ensino Presencial farão parte?
                  </label>
                  <button
                    type="button"
                    onClick={setAllPresentialModules}
                    className={`text-[9px] font-bold uppercase px-2.5 py-1 rounded transition-colors ${
                      value.linkedPresentialModules === 'all'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Toda a Turma (Incluir Blocos e Sessões)
                  </button>
                </div>

                {loadingPresentialModules ? (
                  <div className="flex justify-center py-4">
                    <Loader2 size={16} className="animate-spin text-zinc-500" />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto no-scrollbar pr-1">
                    {availablePresentialModules.map((mod) => {
                      const isSelected =
                        value.linkedPresentialModules === 'all' ||
                        (Array.isArray(value.linkedPresentialModules) &&
                          value.linkedPresentialModules.includes(mod.id));

                      return (
                        <button
                          key={mod.id}
                          type="button"
                          onClick={() => togglePresentialModule(mod.id)}
                          className={`flex items-center justify-between p-2 rounded-lg border text-left transition-all ${
                            isSelected
                              ? 'bg-emerald-500/10 border-emerald-500/35 text-white'
                              : 'bg-zinc-900/60 border-zinc-800 text-zinc-500 hover:border-zinc-700'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <Layers
                              size={12}
                              className={isSelected ? 'text-emerald-400' : 'text-zinc-600'}
                            />
                            <span
                              className={`text-[10px] font-bold uppercase truncate ${
                                isSelected ? 'text-white' : 'text-zinc-400'
                              }`}
                            >
                              {mod.name}
                            </span>
                          </div>
                          {isSelected && <Check size={11} className="text-emerald-400 shrink-0" />}
                        </button>
                      );
                    })}

                    {availablePresentialModules.length === 0 && (
                      <div className="col-span-full py-3 text-center border border-dashed border-zinc-800 rounded-lg">
                        <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
                          Nenhum módulo cadastrado na Área de Ensino desta turma
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
