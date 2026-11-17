import React, { useState, useEffect, useMemo } from 'react';
import {
  SlidersHorizontal,
  Eye,
  EyeOff,
  Building2,
  CheckCircle2,
  Sparkles,
  RotateCcw,
  Save,
  Loader2,
  ShieldCheck,
  GraduationCap,
  Target,
  CalendarDays,
  BookOpen,
  FileText,
  Video,
  Radio,
  Settings
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Plan,
  NativePlanTabId,
  PlanPresentialSharedTabKey,
  PlanLinkedPresentialConfig
} from '../../../../types/plan';
import { Class } from '../../../../types/class';
import { classService } from '../../../../services/classService';
import {
  NATIVE_PLAN_TABS_META,
  PRESENTIAL_SHARED_TABS_META,
  isNativePlanTabHidden,
  isPresentialTabShared,
  getPresentialTabLabel
} from '../../../../utils/planNavigation';

interface PlanNavigationTabProps {
  plan: Plan;
  onUpdate: (updates: Partial<Plan>) => Promise<void> | void;
}

const NATIVE_TAB_ICONS: Record<NativePlanTabId, React.ComponentType<{ size?: number; className?: string }>> = {
  TODAY: Target,
  CALENDAR: CalendarDays,
  EDICT: FileText,
  MENTORSHIP: GraduationCap,
  CALL: Video,
  SIMULADOS: FileText,
  LIVE: Radio,
  CONFIG: Settings
};

const PRESENTIAL_TAB_ICONS: Record<
  PlanPresentialSharedTabKey,
  React.ComponentType<{ size?: number; className?: string }>
> = {
  dailyGoals: Target,
  schedule: CalendarDays,
  planning: BookOpen,
  teaching: GraduationCap,
  live: Radio,
  simulados: FileText
};

export const PlanNavigationTab: React.FC<PlanNavigationTabProps> = ({ plan, onUpdate }) => {
  const [classes, setClasses] = useState<Class[]>([]);
  const [loadingClasses, setLoadingClasses] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  // Local editable draft synced from plan
  const [hiddenTabs, setHiddenTabs] = useState<NativePlanTabId[]>(() => {
    const initial = new Set<NativePlanTabId>(plan.hiddenTabs || []);
    if (plan.isChatDisabled) initial.add('CALL');
    return Array.from(initial);
  });

  const [presentialConfig, setPresentialConfig] = useState<PlanLinkedPresentialConfig>(() => ({
    enabled: Boolean(plan.linkedPresentialConfig?.enabled),
    classId: plan.linkedPresentialConfig?.classId || '',
    sharedTabs: {
      dailyGoals: {
        enabled: Boolean(plan.linkedPresentialConfig?.sharedTabs?.dailyGoals?.enabled),
        label: plan.linkedPresentialConfig?.sharedTabs?.dailyGoals?.label || 'METAS DE HOJE'
      },
      schedule: {
        enabled: Boolean(plan.linkedPresentialConfig?.sharedTabs?.schedule?.enabled),
        label: plan.linkedPresentialConfig?.sharedTabs?.schedule?.label || 'CRONOGRAMA'
      },
      planning: {
        enabled: Boolean(plan.linkedPresentialConfig?.sharedTabs?.planning?.enabled),
        label: plan.linkedPresentialConfig?.sharedTabs?.planning?.label || 'PLANEJAMENTO'
      },
      teaching: {
        enabled: Boolean(plan.linkedPresentialConfig?.sharedTabs?.teaching?.enabled),
        label: plan.linkedPresentialConfig?.sharedTabs?.teaching?.label || 'ÁREA DE ENSINO'
      },
      live: {
        enabled: Boolean(plan.linkedPresentialConfig?.sharedTabs?.live?.enabled),
        label: plan.linkedPresentialConfig?.sharedTabs?.live?.label || 'EVENTOS AO VIVO'
      },
      simulados: {
        enabled: Boolean(plan.linkedPresentialConfig?.sharedTabs?.simulados?.enabled),
        label: plan.linkedPresentialConfig?.sharedTabs?.simulados?.label || 'SIMULADOS (TURMA)'
      }
    }
  }));

  useEffect(() => {
    let isMounted = true;
    const loadClasses = async () => {
      setLoadingClasses(true);
      try {
        const allClasses = await classService.getClasses();
        if (isMounted) setClasses(allClasses || []);
      } catch (err) {
        console.error('Erro ao carregar turmas presenciais:', err);
      } finally {
        if (isMounted) setLoadingClasses(false);
      }
    };
    loadClasses();
    return () => {
      isMounted = false;
    };
  }, []);

  // Sync local draft if plan id changes
  useEffect(() => {
    const nextHidden = new Set<NativePlanTabId>(plan.hiddenTabs || []);
    if (plan.isChatDisabled) nextHidden.add('CALL');
    setHiddenTabs(Array.from(nextHidden));

    setPresentialConfig({
      enabled: Boolean(plan.linkedPresentialConfig?.enabled),
      classId: plan.linkedPresentialConfig?.classId || '',
      sharedTabs: {
        dailyGoals: {
          enabled: Boolean(plan.linkedPresentialConfig?.sharedTabs?.dailyGoals?.enabled),
          label: plan.linkedPresentialConfig?.sharedTabs?.dailyGoals?.label || 'METAS DE HOJE'
        },
        schedule: {
          enabled: Boolean(plan.linkedPresentialConfig?.sharedTabs?.schedule?.enabled),
          label: plan.linkedPresentialConfig?.sharedTabs?.schedule?.label || 'CRONOGRAMA'
        },
        planning: {
          enabled: Boolean(plan.linkedPresentialConfig?.sharedTabs?.planning?.enabled),
          label: plan.linkedPresentialConfig?.sharedTabs?.planning?.label || 'PLANEJAMENTO'
        },
        teaching: {
          enabled: Boolean(plan.linkedPresentialConfig?.sharedTabs?.teaching?.enabled),
          label: plan.linkedPresentialConfig?.sharedTabs?.teaching?.label || 'ÁREA DE ENSINO'
        },
        live: {
          enabled: Boolean(plan.linkedPresentialConfig?.sharedTabs?.live?.enabled),
          label: plan.linkedPresentialConfig?.sharedTabs?.live?.label || 'EVENTOS AO VIVO'
        },
        simulados: {
          enabled: Boolean(plan.linkedPresentialConfig?.sharedTabs?.simulados?.enabled),
          label: plan.linkedPresentialConfig?.sharedTabs?.simulados?.label || 'SIMULADOS (TURMA)'
        }
      }
    });
  }, [plan.id]);

  const previewPlanDraft = useMemo<Plan>(
    () => ({
      ...plan,
      hiddenTabs,
      isChatDisabled: hiddenTabs.includes('CALL'),
      linkedPresentialConfig: presentialConfig
    }),
    [plan, hiddenTabs, presentialConfig]
  );

  const selectedClassObj = useMemo(
    () => classes.find((c) => c.id === presentialConfig.classId) || null,
    [classes, presentialConfig.classId]
  );

  // Build exact preview items matching StudentNavbar order
  const previewNavbarItems = useMemo(() => {
    const list: Array<{ key: string; label: string; source: 'fixed' | 'native' | 'presential' | 'course' }> = [
      { key: 'planos', label: 'PLANOS', source: 'fixed' }
    ];

    if (!isNativePlanTabHidden(previewPlanDraft, 'TODAY')) {
      list.push({ key: 'today', label: 'METAS DE HOJE', source: 'native' });
    }
    if (isPresentialTabShared(previewPlanDraft, 'dailyGoals')) {
      list.push({
        key: 'p_daily',
        label: getPresentialTabLabel(previewPlanDraft, 'dailyGoals'),
        source: 'presential'
      });
    }
    if (!isNativePlanTabHidden(previewPlanDraft, 'CALENDAR')) {
      list.push({ key: 'calendar', label: 'CALENDÁRIO', source: 'native' });
    }
    if (isPresentialTabShared(previewPlanDraft, 'schedule')) {
      list.push({
        key: 'p_schedule',
        label: getPresentialTabLabel(previewPlanDraft, 'schedule'),
        source: 'presential'
      });
    }
    if (isPresentialTabShared(previewPlanDraft, 'planning')) {
      list.push({
        key: 'p_planning',
        label: getPresentialTabLabel(previewPlanDraft, 'planning'),
        source: 'presential'
      });
    }
    if (!isNativePlanTabHidden(previewPlanDraft, 'EDICT')) {
      list.push({ key: 'edict', label: 'EDITAL', source: 'native' });
    }
    if (!isNativePlanTabHidden(previewPlanDraft, 'MENTORSHIP')) {
      list.push({ key: 'mentorship', label: 'MENTORIA', source: 'native' });
    }
    if (!isNativePlanTabHidden(previewPlanDraft, 'CALL')) {
      list.push({ key: 'call', label: 'CALL', source: 'native' });
    }
    if (!isNativePlanTabHidden(previewPlanDraft, 'SIMULADOS')) {
      list.push({ key: 'simulados', label: 'SIMULADOS', source: 'native' });
    }
    if (isPresentialTabShared(previewPlanDraft, 'simulados')) {
      list.push({
        key: 'p_simulados',
        label: getPresentialTabLabel(previewPlanDraft, 'simulados'),
        source: 'presential'
      });
    }
    if (!isNativePlanTabHidden(previewPlanDraft, 'LIVE')) {
      list.push({ key: 'live', label: 'AO VIVO', source: 'native' });
    }
    if (isPresentialTabShared(previewPlanDraft, 'live')) {
      list.push({
        key: 'p_live',
        label: getPresentialTabLabel(previewPlanDraft, 'live'),
        source: 'presential'
      });
    }
    if (isPresentialTabShared(previewPlanDraft, 'teaching')) {
      list.push({
        key: 'p_teaching',
        label: getPresentialTabLabel(previewPlanDraft, 'teaching'),
        source: 'presential'
      });
    }
    (previewPlanDraft.linkedCourses || []).forEach((lc) => {
      if (lc?.courseId) {
        list.push({
          key: `c_${lc.courseId}`,
          label: (lc.tabName || 'CURSO').toUpperCase(),
          source: 'course'
        });
      }
    });
    if (!isNativePlanTabHidden(previewPlanDraft, 'CONFIG')) {
      list.push({ key: 'config', label: 'CONFIGURAÇÃO', source: 'native' });
    }

    return list;
  }, [previewPlanDraft]);

  const toggleNativeTab = (tabId: NativePlanTabId) => {
    setHiddenTabs((prev) =>
      prev.includes(tabId) ? prev.filter((id) => id !== tabId) : [...prev, tabId]
    );
  };

  const togglePresentialSharedTab = (key: PlanPresentialSharedTabKey) => {
    setPresentialConfig((prev) => {
      const current = prev.sharedTabs?.[key];
      const meta = PRESENTIAL_SHARED_TABS_META.find((m) => m.key === key);
      return {
        ...prev,
        sharedTabs: {
          ...(prev.sharedTabs || {}),
          [key]: {
            enabled: !current?.enabled,
            label: current?.label || meta?.defaultLabel || key.toUpperCase()
          }
        }
      };
    });
  };

  const updatePresentialSharedLabel = (key: PlanPresentialSharedTabKey, label: string) => {
    setPresentialConfig((prev) => ({
      ...prev,
      sharedTabs: {
        ...(prev.sharedTabs || {}),
        [key]: {
          enabled: Boolean(prev.sharedTabs?.[key]?.enabled),
          label
        }
      }
    }));
  };

  const applyPresentialReplacementPreset = () => {
    setHiddenTabs((prev) => {
      const next = new Set<NativePlanTabId>(prev);
      next.add('TODAY');
      next.add('CALENDAR');
      next.add('CONFIG');
      return Array.from(next);
    });

    setPresentialConfig((prev) => ({
      ...prev,
      enabled: true,
      classId: prev.classId || (classes[0]?.id ?? ''),
      sharedTabs: {
        ...(prev.sharedTabs || {}),
        dailyGoals: {
          enabled: true,
          label: prev.sharedTabs?.dailyGoals?.label || 'METAS DE HOJE'
        },
        schedule: {
          enabled: true,
          label: prev.sharedTabs?.schedule?.label || 'CRONOGRAMA'
        }
      }
    }));

    toast.success(
      'Preset aplicado! Selecione ou confirme a Turma Presencial abaixo e clique em Salvar.'
    );
  };

  const restoreNativeDefaults = () => {
    setHiddenTabs(plan.isChatDisabled ? ['CALL'] : []);
    setPresentialConfig((prev) => ({
      ...prev,
      enabled: false
    }));
    toast.success('Configuração padrão nativa restaurada no rascunho. Clique em Salvar para confirmar.');
  };

  const handleSave = async () => {
    if (presentialConfig.enabled && (!presentialConfig.classId || !presentialConfig.classId.trim())) {
      toast.error('Selecione qual Turma Presencial será referenciada antes de salvar.');
      return;
    }

    setSaving(true);
    try {
      const cleanedConfig: PlanLinkedPresentialConfig = {
        enabled: Boolean(presentialConfig.enabled),
        classId: presentialConfig.classId || null,
        sharedTabs: presentialConfig.sharedTabs || {}
      };

      await onUpdate({
        hiddenTabs,
        isChatDisabled: hiddenTabs.includes('CALL'),
        linkedPresentialConfig: cleanedConfig
      });

      toast.success('Visibilidade de abas e vínculo presencial salvos com sucesso!');
    } catch (err) {
      console.error('Erro ao salvar configurações de abas do plano:', err);
      toast.error('Não foi possível salvar as alterações.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto pr-1 pb-12 space-y-6 custom-scrollbar">
      {/* BARRA SUPERIOR DE AÇÃO E PRÉVIA EM TEMPO REAL */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-amber-400 text-[10px] font-black uppercase tracking-[0.2em] mb-1">
              <SlidersHorizontal size={13} />
              <span>ARQUITETURA DE NAVEGAÇÃO DO ALUNO</span>
            </div>
            <h2 className="text-xl font-black text-white uppercase tracking-tight">
              Controle de Abas & Vínculo com Turma Presencial
            </h2>
            <p className="text-xs text-zinc-400 mt-1 max-w-3xl leading-relaxed">
              Oculte livremente abas nativas deste plano (como Configurações, Metas de Hoje ou Calendário) e, se desejar, puxe o Cronograma, Metas de Hoje, Planejamento e demais recursos diretamente de uma Turma Presencial.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={restoreNativeDefaults}
              className="px-4 py-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-[11px] font-black uppercase tracking-wider transition-colors flex items-center gap-2"
            >
              <RotateCcw size={14} />
              <span>Padrão Nativo</span>
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-900/30 flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              <span>Salvar Alterações</span>
            </button>
          </div>
        </div>

        {/* PRÉVIA EM TEMPO REAL DA NAVBAR DO ALUNO */}
        <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/90 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-2">
              <ShieldCheck size={13} className="text-emerald-400" />
              Prévia em Tempo Real da Barra de Abas do Aluno ({previewNavbarItems.length}{' '}
              {previewNavbarItems.length === 1 ? 'aba visível' : 'abas visíveis'})
            </span>
            <div className="flex items-center gap-3 text-[10px] font-bold">
              <span className="flex items-center gap-1.5 text-zinc-400">
                <span className="w-2 h-2 rounded-full bg-zinc-600" /> Nativa do Plano
              </span>
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> Puxada da Turma Presencial
              </span>
              <span className="flex items-center gap-1.5 text-sky-400">
                <span className="w-2 h-2 rounded-full bg-sky-500" /> Curso Online Vinculado
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {previewNavbarItems.map((item, idx) => {
              const isLanding = idx === 1;
              return (
                <div
                  key={item.key}
                  className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap border flex items-center gap-2 shrink-0 ${
                    item.source === 'presential'
                      ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-300'
                      : item.source === 'course'
                        ? 'bg-sky-500/10 border-sky-500/35 text-sky-300'
                        : item.source === 'fixed'
                          ? 'bg-zinc-900 border-zinc-800 text-zinc-400'
                          : 'bg-zinc-900 border-zinc-700/80 text-zinc-200'
                  }`}
                >
                  <span>{item.label}</span>
                  {isLanding && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[8px] font-black">
                      INICIAL
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* SEÇÃO 1: OCULTAÇÃO DE ABAS NATIVAS DO PLANO */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-white uppercase tracking-tight flex items-center gap-2">
              <Eye size={18} className="text-red-500" />
              <span>1. Visibilidade das Abas Nativas do Plano</span>
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Desative qualquer aba nativa que não deva aparecer para os alunos deste plano. Rotas ocultadas ficam protegidas automaticamente.
            </p>
          </div>

          <span className="text-[11px] font-bold text-zinc-400 tabular-nums">
            {NATIVE_PLAN_TABS_META.length - hiddenTabs.length} visíveis • {hiddenTabs.length} ocultas
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {NATIVE_PLAN_TABS_META.map((tabMeta) => {
            const isHidden = hiddenTabs.includes(tabMeta.id);
            const isVisible = !isHidden;
            const IconComp = NATIVE_TAB_ICONS[tabMeta.id] || FileText;

            return (
              <div
                key={tabMeta.id}
                onClick={() => toggleNativeTab(tabMeta.id)}
                className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-4 ${
                  isVisible
                    ? 'bg-zinc-950/80 border-zinc-800 hover:border-zinc-700'
                    : 'bg-red-950/15 border-red-900/35 hover:border-red-800/50 opacity-80'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
                        isVisible
                          ? 'bg-zinc-900 border-zinc-800 text-zinc-200'
                          : 'bg-red-950/40 border-red-900/40 text-red-400'
                      }`}
                    >
                      <IconComp size={15} />
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

                  <h4
                    className={`text-xs font-black uppercase tracking-wider ${
                      isVisible ? 'text-white' : 'text-zinc-400 line-through'
                    }`}
                  >
                    {tabMeta.label}
                  </h4>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">{tabMeta.description}</p>
                </div>

                <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    {isVisible ? 'Exibir no Plano' : 'Ocultada do Aluno'}
                  </span>
                  <div
                    className={`w-10 h-5 rounded-full transition-colors relative ${
                      isVisible ? 'bg-emerald-600' : 'bg-zinc-800'
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        isVisible ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SEÇÃO 2: VINCULAÇÃO COM TURMA PRESENCIAL (PUXAR METAS DE HOJE, CRONOGRAMA, PLANEJAMENTO E OUTRAS ABAS) */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-zinc-800">
          <div className="space-y-1">
            <h3 className="text-base font-black text-white uppercase tracking-tight flex items-center gap-2">
              <Building2 size={18} className="text-emerald-400" />
              <span>2. Referenciar Turma Presencial (Compartilhar Abas e Recursos)</span>
            </h3>
            <p className="text-xs text-zinc-400 max-w-3xl leading-relaxed">
              Vincule uma Turma Presencial para puxar seu <strong>Cronograma de Aulas</strong>,{' '}
              <strong>Metas de Hoje (Estudo Guiado + Aulas do Dia + Simulados)</strong>,{' '}
              <strong>Planejamento Pedagógico</strong> e outras abas diretamente para dentro deste Plano.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap shrink-0">
            <button
              type="button"
              onClick={applyPresentialReplacementPreset}
              className="px-3.5 py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-300 text-[11px] font-black uppercase tracking-wider transition-colors flex items-center gap-2"
              title="Oculta Metas de Hoje, Calendário e Configuração nativos e ativa Metas de Hoje + Cronograma da Turma Presencial"
            >
              <Sparkles size={14} />
              <span>Substituir Metas & Calendário pelo Presencial</span>
            </button>

            <button
              type="button"
              onClick={() =>
                setPresentialConfig((prev) => ({
                  ...prev,
                  enabled: !prev.enabled
                }))
              }
              className={`px-4 py-2.5 rounded-xl border text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                presentialConfig.enabled
                  ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              <CheckCircle2 size={15} />
              <span>{presentialConfig.enabled ? 'Vínculo Ativo' : 'Ativar Vínculo'}</span>
            </button>
          </div>
        </div>

        {/* SELETOR DA TURMA PRESENCIAL */}
        <div
          className={`space-y-6 transition-opacity ${
            presentialConfig.enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'
          }`}
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
            <div className="lg:col-span-7 space-y-2">
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                Turma Presencial de Origem *
              </label>
              {loadingClasses ? (
                <div className="h-12 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center px-4 gap-2 text-xs text-zinc-500">
                  <Loader2 size={14} className="animate-spin" /> Carregando turmas presenciais...
                </div>
              ) : (
                <select
                  value={presentialConfig.classId || ''}
                  onChange={(e) =>
                    setPresentialConfig((prev) => ({
                      ...prev,
                      classId: e.target.value
                    }))
                  }
                  className="w-full h-12 bg-zinc-950 border border-zinc-800 rounded-xl px-4 text-xs font-bold text-white focus:outline-none focus:border-emerald-500 uppercase"
                >
                  <option value="">-- SELECIONE UMA TURMA PRESENCIAL --</option>
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name} • {cls.shift === 'MORNING' ? 'MANHÃ' : cls.shift === 'AFTERNOON' ? 'TARDE' : 'NOITE'}
                      {cls.isGuidedStudyEnabled ? ' • [ESTUDO GUIADO ATIVO]' : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="lg:col-span-5">
              {selectedClassObj ? (
                <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400 block">
                      TURMA CONECTADA
                    </span>
                    <p className="text-xs font-black text-white uppercase truncate mt-0.5">
                      {selectedClassObj.name}
                    </p>
                    <p className="text-[10px] text-zinc-400 mt-0.5">
                      {selectedClassObj.category} •{' '}
                      {selectedClassObj.isGuidedStudyEnabled
                        ? 'Estudo Guiado Ativo'
                        : 'Grade de Encontros Presenciais'}
                    </p>
                  </div>
                  <CheckCircle2 size={22} className="text-emerald-400 shrink-0" />
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-zinc-950 border border-dashed border-zinc-800 text-[11px] text-zinc-500">
                  Escolha uma Turma Presencial ao lado para compartilhar suas abas com os alunos deste Plano.
                </div>
              )}
            </div>
          </div>

          {/* SELEÇÃO INDIVIDUAL DAS ABAS COMPARTILHADAS DA TURMA PRESENCIAL */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                Abas da Turma Presencial que aparecerão neste Plano
              </label>
              <span className="text-[10px] text-zinc-500">
                Você pode personalizar o título exibido em cada aba
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {PRESENTIAL_SHARED_TABS_META.map((meta) => {
                const tabState = presentialConfig.sharedTabs?.[meta.key];
                const isEnabled = Boolean(tabState?.enabled);
                const customLabel = tabState?.label ?? meta.defaultLabel;
                const IconComp = PRESENTIAL_TAB_ICONS[meta.key] || CalendarDays;

                return (
                  <div
                    key={meta.key}
                    className={`p-4 rounded-xl border transition-all flex flex-col justify-between gap-4 ${
                      isEnabled
                        ? 'bg-emerald-950/15 border-emerald-500/40 shadow-lg shadow-emerald-950/20'
                        : 'bg-zinc-950/80 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
                              isEnabled
                                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                                : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                            }`}
                          >
                            <IconComp size={15} />
                          </div>
                          <div>
                            <span className="text-xs font-black uppercase text-white block leading-tight">
                              {meta.defaultLabel}
                            </span>
                            <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-400/90">
                              Origem: Turma Presencial
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => togglePresentialSharedTab(meta.key)}
                          className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${
                            isEnabled ? 'bg-emerald-600' : 'bg-zinc-800'
                          }`}
                          title={isEnabled ? 'Desativar aba compartilhada' : 'Ativar aba compartilhada'}
                        >
                          <div
                            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                              isEnabled ? 'translate-x-5' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      </div>

                      <p className="text-[11px] text-zinc-400 leading-relaxed">{meta.description}</p>
                    </div>

                    <div className="pt-3 border-t border-zinc-800/80 space-y-1">
                      <label className="block text-[9px] font-black uppercase tracking-widest text-zinc-500">
                        Título da Aba na Barra do Aluno
                      </label>
                      <input
                        type="text"
                        value={customLabel}
                        onChange={(e) => updatePresentialSharedLabel(meta.key, e.target.value)}
                        placeholder={meta.defaultLabel}
                        className="w-full bg-zinc-900 border border-zinc-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs font-bold text-white uppercase outline-none"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* NOTA DE SEGURANÇA E ISOLAMENTO */}
        <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/90 flex items-start gap-3">
          <ShieldCheck size={18} className="text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-xs text-zinc-400 leading-relaxed">
            <strong className="text-zinc-200 uppercase text-[11px] tracking-wider block mb-0.5">
              Operação 100% Segura e Reversível
            </strong>
            O progresso de cada aluno nas metas do Estudo Guiado é salvo individualmente por usuário e nenhuma meta, ciclo ou progresso nativo deste Plano é apagado ao ocultar abas ou ativar a referência presencial.
          </div>
        </div>
      </div>
    </div>
  );
};
