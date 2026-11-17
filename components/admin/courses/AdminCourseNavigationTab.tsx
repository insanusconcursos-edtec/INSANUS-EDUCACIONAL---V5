import React, { useState, useEffect } from 'react';
import { SlidersHorizontal, RotateCcw, Save, Loader2, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { OnlineCourse } from '../../../types/course';
import { Class } from '../../../types/class';
import { classService } from '../../../services/classService';
import { courseService } from '../../../services/courseService';
import { normalizeCoursePresentialSharedTabs } from '../../../utils/courseNavigation';
import {
  CourseNavigationFields,
  CourseNavigationDraftValue
} from './CourseNavigationFields';

interface AdminCourseNavigationTabProps {
  course: OnlineCourse;
  onCourseUpdated?: (updatedCourse: OnlineCourse) => void;
}

export const AdminCourseNavigationTab: React.FC<AdminCourseNavigationTabProps> = ({
  course,
  onCourseUpdated
}) => {
  const [classes, setClasses] = useState<Class[]>([]);
  const [loadingClasses, setLoadingClasses] = useState<boolean>(true);
  const [presentialModules, setPresentialModules] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingModules, setLoadingModules] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  const [draft, setDraft] = useState<CourseNavigationDraftValue>(() => ({
    hiddenTabs: course.hiddenTabs || [],
    linkedPresentialId: course.linkedPresentialId || '',
    linkedPresentialTabName: course.linkedPresentialTabName || '',
    linkedPresentialModules: course.linkedPresentialModules || 'all',
    linkedPresentialSharedTabs: normalizeCoursePresentialSharedTabs(course)
  }));

  useEffect(() => {
    setDraft({
      hiddenTabs: course.hiddenTabs || [],
      linkedPresentialId: course.linkedPresentialId || '',
      linkedPresentialTabName: course.linkedPresentialTabName || '',
      linkedPresentialModules: course.linkedPresentialModules || 'all',
      linkedPresentialSharedTabs: normalizeCoursePresentialSharedTabs(course)
    });
  }, [course.id]);

  useEffect(() => {
    let isMounted = true;
    const loadClasses = async () => {
      setLoadingClasses(true);
      try {
        const list = await classService.getClasses();
        if (isMounted) {
          setClasses((list || []).sort((a, b) => a.name.localeCompare(b.name)));
        }
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

  useEffect(() => {
    let isMounted = true;
    const loadModules = async () => {
      if (!draft.linkedPresentialId) {
        setPresentialModules([]);
        return;
      }
      setLoadingModules(true);
      try {
        const mods = await courseService.getModules(draft.linkedPresentialId);
        if (isMounted) {
          setPresentialModules(mods.map((m) => ({ id: m.id, name: m.title })));
        }
      } catch (err) {
        console.error('Erro ao carregar módulos presenciais:', err);
      } finally {
        if (isMounted) setLoadingModules(false);
      }
    };
    loadModules();
    return () => {
      isMounted = false;
    };
  }, [draft.linkedPresentialId]);

  const handleRestoreDefaults = () => {
    setDraft((prev) => ({
      ...prev,
      hiddenTabs: [],
      linkedPresentialId: ''
    }));
    toast.success('Padrão nativo restaurado no rascunho. Clique em Salvar para confirmar.');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        hiddenTabs: draft.hiddenTabs,
        linkedPresentialId: draft.linkedPresentialId || '',
        linkedPresentialTabName:
          draft.linkedPresentialSharedTabs.teaching?.label || draft.linkedPresentialTabName || '',
        linkedPresentialModules: draft.linkedPresentialModules || 'all',
        linkedPresentialSharedTabs: draft.linkedPresentialSharedTabs
      };

      await courseService.updateCourse(course.id, payload);

      if (onCourseUpdated) {
        onCourseUpdated({
          ...course,
          ...payload,
          updatedAt: new Date().toISOString()
        });
      }

      toast.success('Configuração de abas e vínculo presencial salva com sucesso!');
    } catch (err) {
      console.error('Erro ao salvar abas do curso online:', err);
      toast.error('Não foi possível salvar as alterações.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-amber-400 text-[10px] font-black uppercase tracking-[0.2em] mb-1">
            <SlidersHorizontal size={13} />
            <span>ARQUITETURA DE NAVEGAÇÃO DO CURSO ONLINE</span>
          </div>
          <h3 className="text-xl font-black text-white uppercase tracking-tight">
            Visibilidade de Abas & Recursos da Turma Presencial
          </h3>
          <p className="text-xs text-zinc-400 mt-1 max-w-3xl leading-relaxed">
            Oculte abas nativas deste Curso Online e referencie uma Turma Presencial para compartilhar{' '}
            <strong>Metas Diárias (Estudo Guiado + Aulas do Dia)</strong>,{' '}
            <strong>Cronograma</strong>, <strong>Planejamento Pedagógico</strong> e demais recursos diretamente com os alunos do curso.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={handleRestoreDefaults}
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

      <CourseNavigationFields
        value={draft}
        onChange={setDraft}
        availablePresentialClasses={classes}
        loadingClasses={loadingClasses}
        availablePresentialModules={presentialModules}
        loadingPresentialModules={loadingModules}
      />

      <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/90 flex items-start gap-3">
        <ShieldCheck size={18} className="text-emerald-400 shrink-0 mt-0.5" />
        <div className="text-xs text-zinc-400 leading-relaxed">
          <strong className="text-zinc-200 uppercase text-[11px] tracking-wider block mb-0.5">
            Progresso Individual e Isolamento Garantidos
          </strong>
          Cada aluno do curso online registra seu próprio avanço nas metas diárias do Estudo Guiado sem interferir nos demais alunos, e nenhum módulo, edital ou progresso do curso é apagado ao ocultar abas.
        </div>
      </div>
    </div>
  );
};
