import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Edit2, ChevronDown, ChevronUp, ChevronRight, AlertTriangle, BookOpen, User, CheckSquare, Save, Loader2, Link, Link2, Unlink, GitBranch, FolderPlus, Layers, Target } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Class } from '../../../../../types/class';
import { Subject, SubjectGroup, Topic, Module, ModuleContent, OnlineStatus, TeachingAreaLink } from '../../../../../types/curriculum';
import { ClassScheduleEvent } from '../../../../../types/schedule';
import {
  GuidedStudyMeta,
  computeClassEncounterMap,
  getGuidedMetasForModule,
  getGuidedModuleAdminStatus
} from '../../../../../types/guidedStudy';
import { Teacher } from '../../../../../types/teacher';
import { curriculumService } from '../../../../../services/curriculumService';
import { classService } from '../../../../../services/classService';
import { classScheduleService } from '../../../../../services/classScheduleService';
import { guidedStudyService } from '../../../../../services/guidedStudyService';
import { teacherService } from '../../../../../services/teacherService';
import { getSubjectEffectiveSlotCount, resolveManualSchedule } from '../../../../../utils/scheduler/ContentResolver';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../../../../services/firebase';
import { TeachingAreaSelectorModal } from '../../TeachingAreaSelectorModal';

interface SubjectsTabProps {
  cls: Class;
  onUpdate?: (silent?: boolean) => Promise<void> | void;
}

export const SubjectsTab: React.FC<SubjectsTabProps> = ({ cls, onUpdate }) => {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [groups, setGroups] = useState<SubjectGroup[]>(() =>
    [...(cls.subjectGroups || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  );
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<SubjectGroup | null>(null);
  const [groupNameInput, setGroupNameInput] = useState('');
  const [groupSelectedSubjectIds, setGroupSelectedSubjectIds] = useState<Set<string>>(new Set());
  const [isSavingGroup, setIsSavingGroup] = useState(false);
  const [groupDeleteModal, setGroupDeleteModal] = useState<{ isOpen: boolean; group: SubjectGroup | null }>({
    isOpen: false,
    group: null,
  });

  const [topics, setTopics] = useState<Topic[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [guidedMetas, setGuidedMetas] = useState<GuidedStudyMeta[]>([]);
  const [scheduleEvents, setScheduleEvents] = useState<ClassScheduleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newSubject, setNewSubject] = useState({ name: '', color: '#EF4444', defaultTeacherId: '', groupId: '' });
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [subjectDeleteModal, setSubjectDeleteModal] = useState<{ isOpen: boolean, subjectId: string | null }>({ isOpen: false, subjectId: null });
  const [isDeleting, setIsDeleting] = useState(false);
  const [expandedSubjects, setExpandedSubjects] = useState<string[]>([]);
  const [isTopicModalOpen, setIsTopicModalOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);
  const [topicDeleteModal, setTopicDeleteModal] = useState<{ isOpen: boolean, topicId: string | null }>({ isOpen: false, topicId: null });
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [newTopic, setNewTopic] = useState({ name: '', requiredClasses: 0 });
  const [isModuleModalOpen, setIsModuleModalOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<Module | null>(null);
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const [moduleDeleteModal, setModuleDeleteModal] = useState<{ isOpen: boolean, topicId: string | null, moduleId: string | null }>({ isOpen: false, topicId: null, moduleId: null });
  const [newModule, setNewModule] = useState<{ 
    name: string; 
    classesCount: number; 
    groupedWithPrevious?: boolean;
    contents: ModuleContent[];
    isOnline?: boolean;
    isGuidedStudy?: boolean;
    onlineStatus?: OnlineStatus;
    publicationDate?: string;
    teachingAreaLink?: TeachingAreaLink;
  }>({ 
    name: '', 
    classesCount: 1, 
    groupedWithPrevious: false,
    contents: [],
    isOnline: false,
    isGuidedStudy: false,
    onlineStatus: 'EM_GRAVACAO',
    publicationDate: '',
    teachingAreaLink: { moduleId: '', folderId: '' }
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [isCloning, setIsCloning] = useState(false);
  const [pdfDeleteModal, setPdfDeleteModal] = useState<{ isOpen: boolean, contentId: string | null }>({ isOpen: false, contentId: null });
  const [importConfirmModal, setImportConfirmModal] = useState(false);
  const [bulkTeacherConfirmModal, setBulkTeacherConfirmModal] = useState<{ isOpen: boolean, subjectId: string | null }>({ isOpen: false, subjectId: null });

  // Fetch Data
  const sanitizeModules = (modules: Module[]): Module[] => {
    return (modules || []).map(m => {
      const isOnlineMod = !!m.isOnline;
      const isGuidedMod = !isOnlineMod && Boolean(m.isGuidedStudy);
      const isGrouped = !isOnlineMod && !isGuidedMod && (Boolean(m.groupedWithPrevious) || Number(m.classesCount) === 0);
      return {
        id: m.id,
        name: m.name || '',
        groupedWithPrevious: isGrouped,
        classesCount: (isGrouped || isGuidedMod) ? 0 : Math.max(1, Number(m.classesCount) || 1),
        isSelected: m.isSelected !== false,
        isOnline: isOnlineMod,
        isGuidedStudy: isGuidedMod,
        onlineStatus: m.onlineStatus || 'EM_GRAVACAO',
        publicationDate: m.publicationDate || '',
        contents: (m.contents || []).map((c: any) => ({
          id: c.id,
          type: c.type || 'PDF',
          title: c.title || '',
          url: c.url || '',
          createdAt: c.createdAt || new Date().toISOString(),
          fileType: c.fileType || 'theory',
          linkedTheoryId: c.linkedTheoryId || null
        })),
        teachingAreaLink: m.teachingAreaLink ? {
          moduleId: m.teachingAreaLink.moduleId || '',
          folderId: m.teachingAreaLink.folderId || '',
          moduleName: m.teachingAreaLink.moduleName || null,
          folderName: m.teachingAreaLink.folderName || null
        } : { moduleId: '', folderId: '' }
      };
    });
  };

  const fetchData = async (silent: boolean = false) => {
    try {
      if (!silent && subjects.length === 0) {
        setLoading(true);
      }
      const [subjectsData, topicsData, teachersData, guidedMetasData, scheduleEventsData] = await Promise.all([
        curriculumService.getSubjectsByClass(cls.id),
        curriculumService.getTopicsByClass(cls.id),
        teacherService.getTeachers(),
        guidedStudyService.getMetasByClass(cls.id).catch(() => [] as GuidedStudyMeta[]),
        classScheduleService.getScheduleEventsByClass(cls.id).catch(() => [] as ClassScheduleEvent[])
      ]);
      setSubjects(subjectsData);
      setTopics(topicsData);
      setTeachers(teachersData);
      setGuidedMetas(guidedMetasData);
      setScheduleEvents(scheduleEventsData);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleImportFromMaster = async () => {
    if (!cls.masterClassId) return;
    if (subjects.length > 0) {
      setImportConfirmModal(true);
      return;
    }
    await confirmImportFromMaster();
  };

  const confirmImportFromMaster = async () => {
    try {
      setIsCloning(true);
      setImportConfirmModal(false);
      await curriculumService.cloneCurriculum(cls.masterClassId!, cls.id);
      const freshCls = await classService.getClassById(cls.id);
      if (freshCls?.subjectGroups) {
        setGroups([...freshCls.subjectGroups].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
      }
      await fetchData();
      if (onUpdate) await onUpdate(true);
      toast.success('Currículo importado da Turma Mãe com sucesso.');
    } catch (error) {
      console.error("Error importing curriculum:", error);
      toast.error("Erro ao importar disciplinas da Turma Mãe.");
    } finally {
      setIsCloning(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [cls.id]);

  useEffect(() => {
    setGroups([...(cls.subjectGroups || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
  }, [cls.subjectGroups]);

  const todayIso = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }, []);

  // Calculations
  const totalSelectedClasses = useMemo(() => {
    return subjects.reduce(
      (sum, subj) => sum + getSubjectEffectiveSlotCount(subj.id, topics, true),
      0
    );
  }, [subjects, topics]);

  const encounterSummary = useMemo(
    () =>
      computeClassEncounterMap(
        scheduleEvents,
        cls.isGuidedStudyEnabled ? guidedMetas : [],
        {
          defaultShift: cls.shift,
          totalMeetings: cls.totalMeetings,
          todayIso,
          includeGuidedStudy: Boolean(cls.isGuidedStudyEnabled)
        }
      ),
    [scheduleEvents, guidedMetas, cls.isGuidedStudyEnabled, cls.shift, cls.totalMeetings, todayIso]
  );

  const presencialMeetingsConsumed = Math.ceil(totalSelectedClasses / (cls.classesPerMeeting || 1));
  const guidedOnlyEncountersCount = encounterSummary.guidedOnlyEncountersCount;
  const meetingsConsumed = presencialMeetingsConsumed + guidedOnlyEncountersCount;
  const meetingsBalance = cls.totalMeetings - meetingsConsumed;
  const isOverLimit = meetingsBalance < 0;

  /**
   * Localiza o módulo presencial imediatamente anterior na mesma disciplina
   * (seja dentro do mesmo assunto ou no assunto anterior da disciplina).
   */
  const getPrecedingPresencialModule = (
    subjectId: string,
    topicId: string,
    moduleId?: string | null
  ): { topic: Topic; module: Module } | null => {
    if (!subjectId || !topicId) return null;
    const subjTopics = topics
      .filter(t => t.subjectId === subjectId)
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    let lastValid: { topic: Topic; module: Module } | null = null;

    for (const t of subjTopics) {
      const mods = t.modules || [];
      if (t.id === topicId && !moduleId) {
        // Criando novo módulo ao final deste assunto: pega o último módulo presencial válido até aqui
        for (const m of mods) {
          if (!m.isOnline && !m.isGuidedStudy && t.isSelected !== false && m.isSelected !== false) {
            lastValid = { topic: t, module: m };
          }
        }
        return lastValid;
      }

      for (const m of mods) {
        if (t.id === topicId && m.id === moduleId) {
          return lastValid;
        }
        if (!m.isOnline && !m.isGuidedStudy && t.isSelected !== false && m.isSelected !== false) {
          lastValid = { topic: t, module: m };
        }
      }
    }

    return null;
  };

  const handleToggleModuleGroupWithPrevious = async (topicId: string, moduleId: string) => {
    try {
      const topic = topics.find(t => t.id === topicId);
      if (!topic || !topic.modules) return;

      const updatedModules = topic.modules.map(m => {
        if (m.id !== moduleId) return m;
        const nextGrouped = !m.groupedWithPrevious;
        return {
          ...m,
          groupedWithPrevious: nextGrouped,
          classesCount: nextGrouped ? 0 : Math.max(1, Number(m.classesCount) || 1),
        };
      });

      const updatedTopics = topics.map(t =>
        t.id === topicId ? { ...t, modules: updatedModules } : t
      );
      setTopics(updatedTopics);

      const sanitizedModules = sanitizeModules(updatedModules);
      await curriculumService.updateTopic(topicId, { modules: sanitizedModules });
      if (onUpdate) await onUpdate(true);

      const targetMod = updatedModules.find(m => m.id === moduleId);
      if (targetMod?.groupedWithPrevious) {
        toast.success('Módulo agrupado na mesma aula do anterior.');
      } else {
        toast.success('Módulo separado em aula própria (1 aula).');
      }
    } catch (error) {
      console.error('Error toggling module grouping:', error);
      toast.error('Erro ao atualizar agrupamento do módulo.');
      fetchData(true);
    }
  };

  const validGroupIdSet = useMemo(() => new Set(groups.map((g) => g.id)), [groups]);

  const getEffectiveGroupId = (groupId?: string | null): string | null => {
    if (!groupId) return null;
    return validGroupIdSet.has(groupId) ? groupId : null;
  };

  const toggleGroupCollapse = (groupKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  const handleOpenCreateGroup = () => {
    setEditingGroup(null);
    setGroupNameInput('');
    setGroupSelectedSubjectIds(new Set());
    setIsGroupModalOpen(true);
  };

  const handleOpenEditGroup = (group: SubjectGroup) => {
    setEditingGroup(group);
    setGroupNameInput(group.name);
    const linkedIds = subjects
      .filter((s) => s.groupId === group.id)
      .map((s) => s.id);
    setGroupSelectedSubjectIds(new Set(linkedIds));
    setIsGroupModalOpen(true);
  };

  const handleToggleSubjectInGroupModal = (subjectId: string) => {
    setGroupSelectedSubjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(subjectId)) {
        next.delete(subjectId);
      } else {
        next.add(subjectId);
      }
      return next;
    });
  };

  const handleSaveGroup = async () => {
    const trimmedName = groupNameInput.trim();
    if (!trimmedName) return;

    setIsSavingGroup(true);
    try {
      let targetGroupId: string;
      let updatedGroups: SubjectGroup[];

      if (editingGroup) {
        targetGroupId = editingGroup.id;
        updatedGroups = groups.map((g) =>
          g.id === editingGroup.id ? { ...g, name: trimmedName } : g
        );
      } else {
        targetGroupId = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const newGrp: SubjectGroup = {
          id: targetGroupId,
          name: trimmedName,
          order: groups.length,
          createdAt: new Date().toISOString(),
        };
        updatedGroups = [...groups, newGrp];
      }

      // Identifica disciplinas cujo vínculo com este grupo foi alterado no modal
      const subjectGroupUpdates: { id: string; groupId: string | null }[] = [];
      subjects.forEach((subj) => {
        const shouldBeInThisGroup = groupSelectedSubjectIds.has(subj.id);
        const wasInThisGroup = subj.groupId === targetGroupId;

        if (shouldBeInThisGroup && subj.groupId !== targetGroupId) {
          subjectGroupUpdates.push({ id: subj.id, groupId: targetGroupId });
        } else if (!shouldBeInThisGroup && wasInThisGroup) {
          subjectGroupUpdates.push({ id: subj.id, groupId: null });
        }
      });

      setGroups(updatedGroups);
      if (subjectGroupUpdates.length > 0) {
        const updateMap = new Map(subjectGroupUpdates.map((u) => [u.id, u.groupId]));
        setSubjects((prev) =>
          prev.map((s) => (updateMap.has(s.id) ? { ...s, groupId: updateMap.get(s.id)! } : s))
        );
      }

      await Promise.all([
        classService.updateClass(cls.id, { subjectGroups: updatedGroups }),
        curriculumService.batchSetSubjectsGroup(subjectGroupUpdates),
      ]);

      setIsGroupModalOpen(false);
      setEditingGroup(null);
      setGroupNameInput('');
      setGroupSelectedSubjectIds(new Set());

      if (onUpdate) await onUpdate(true);
      toast.success(editingGroup ? 'Grupo atualizado.' : 'Grupo criado com sucesso.');
    } catch (error) {
      console.error('Error saving group:', error);
      toast.error('Erro ao salvar o grupo de disciplinas.');
      fetchData(true);
    } finally {
      setIsSavingGroup(false);
    }
  };

  const handleMoveGroup = async (groupId: string, direction: 'up' | 'down') => {
    const idx = groups.findIndex((g) => g.id === groupId);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= groups.length) return;

    const reordered = [...groups];
    const temp = reordered[idx];
    reordered[idx] = reordered[targetIdx];
    reordered[targetIdx] = temp;
    const normalized = reordered.map((g, index) => ({ ...g, order: index }));

    setGroups(normalized);
    try {
      await classService.updateClass(cls.id, { subjectGroups: normalized });
      if (onUpdate) await onUpdate(true);
    } catch (error) {
      console.error('Error reordering groups:', error);
      toast.error('Erro ao reordenar grupos.');
      if (onUpdate) await onUpdate(true);
    }
  };

  const handleConfirmDeleteGroup = async () => {
    const groupToDelete = groupDeleteModal.group;
    if (!groupToDelete) return;

    setIsDeleting(true);
    try {
      const remainingGroups = groups
        .filter((g) => g.id !== groupToDelete.id)
        .map((g, index) => ({ ...g, order: index }));

      const affectedSubjects = subjects
        .filter((s) => s.groupId === groupToDelete.id)
        .map((s) => ({ id: s.id, groupId: null as string | null }));

      setGroups(remainingGroups);
      if (affectedSubjects.length > 0) {
        setSubjects((prev) =>
          prev.map((s) => (s.groupId === groupToDelete.id ? { ...s, groupId: null } : s))
        );
      }

      await Promise.all([
        classService.updateClass(cls.id, { subjectGroups: remainingGroups }),
        curriculumService.batchSetSubjectsGroup(affectedSubjects),
      ]);

      setGroupDeleteModal({ isOpen: false, group: null });
      if (onUpdate) await onUpdate(true);
      toast.success('Grupo removido. As disciplinas foram mantidas fora de grupo.');
    } catch (error) {
      console.error('Error deleting group:', error);
      toast.error('Erro ao excluir o grupo.');
      fetchData(true);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleQuickChangeSubjectGroup = async (subjectId: string, nextGroupId: string | null) => {
    const normalizedGroupId = nextGroupId || null;
    setSubjects((prev) =>
      prev.map((s) => (s.id === subjectId ? { ...s, groupId: normalizedGroupId } : s))
    );
    try {
      await curriculumService.updateSubject(subjectId, { groupId: normalizedGroupId });
      if (onUpdate) await onUpdate(true);
    } catch (error) {
      console.error('Error changing subject group:', error);
      toast.error('Erro ao mover disciplina de grupo.');
      fetchData(true);
    }
  };

  const handleSaveSubject = async () => {
    if (!newSubject.name.trim()) return;

    const normalizedGroupId = newSubject.groupId ? newSubject.groupId : null;
    const normalizedTeacherId = newSubject.defaultTeacherId || undefined;

    try {
      if (editingSubject) {
        const updatePayload: Partial<Subject> = {
          name: newSubject.name.trim(),
          color: newSubject.color,
          defaultTeacherId: normalizedTeacherId,
          groupId: normalizedGroupId,
        };
        const updatedSubject: Subject = {
          ...editingSubject,
          ...updatePayload,
        };
        setSubjects(prev => prev.map(s => s.id === editingSubject.id ? updatedSubject : s));
        await curriculumService.updateSubject(editingSubject.id, updatePayload);
      } else {
        const subjectData: Omit<Subject, 'id'> = {
          classId: cls.id,
          name: newSubject.name.trim(),
          color: newSubject.color,
          defaultTeacherId: normalizedTeacherId,
          groupId: normalizedGroupId,
          order: subjects.length,
        };
        const id = await curriculumService.createSubject(subjectData);
        setSubjects(prev => [...prev, { ...subjectData, id }]);
      }
      setIsModalOpen(false);
      setEditingSubject(null);
      setNewSubject({ name: '', color: '#EF4444', defaultTeacherId: '', groupId: '' });

      if (onUpdate) await onUpdate(true);
    } catch (error) {
      console.error("Error saving subject:", error);
      toast.error('Erro ao salvar disciplina.');
      fetchData(true);
    }
  };

  const handleEditSubject = (subject: Subject) => {
    setEditingSubject(subject);
    setNewSubject({
      name: subject.name,
      color: subject.color,
      defaultTeacherId: subject.defaultTeacherId || '',
      groupId: getEffectiveGroupId(subject.groupId) || '',
    });
    setIsModalOpen(true);
  };

  const handleDeleteSubject = async () => {
    if (!subjectDeleteModal.subjectId) return;
    
    try {
      setIsDeleting(true);
      await curriculumService.deleteSubject(subjectDeleteModal.subjectId);
      setSubjects(prev => prev.filter(s => s.id !== subjectDeleteModal.subjectId));
      setSubjectDeleteModal({ isOpen: false, subjectId: null });

      if (onUpdate) await onUpdate(true);
    } catch (error) {
      console.error("Error deleting subject:", error);
      fetchData(true);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveTopic = async () => {
    if (!newTopic.name || !selectedSubjectId) return;

    try {
      if (editingTopic) {
        // Update
        const updatedTopic = { ...editingTopic, name: newTopic.name };
        setTopics(prev => prev.map(t => t.id === editingTopic.id ? updatedTopic : t));
        await curriculumService.updateTopic(editingTopic.id, { name: newTopic.name });
      } else {
        // Create
        const topicData = {
          classId: cls.id,
          subjectId: selectedSubjectId,
          name: newTopic.name,
          order: topics.filter(t => t.subjectId === selectedSubjectId).length,
          isSelected: true,
          modules: []
        };
        const id = await curriculumService.createTopic(topicData);
        setTopics(prev => [...prev, { ...topicData, id }]);
      }
      setIsTopicModalOpen(false);
      setEditingTopic(null);
      setNewTopic({ name: '', requiredClasses: 0 });

      if (onUpdate) await onUpdate(true);
    } catch (error) {
      console.error("Error saving topic:", error);
      fetchData(true);
    }
  };

  const handleEditTopic = (topic: Topic) => {
    setEditingTopic(topic);
    setNewTopic({ name: topic.name, requiredClasses: 0 });
    setSelectedSubjectId(topic.subjectId);
    setIsTopicModalOpen(true);
  };

  const handleDeleteTopic = async () => {
    if (!topicDeleteModal.topicId) return;

    try {
      await curriculumService.deleteTopic(topicDeleteModal.topicId);
      setTopics(prev => prev.filter(t => t.id !== topicDeleteModal.topicId));
      setTopicDeleteModal({ isOpen: false, topicId: null });

      if (onUpdate) await onUpdate(true);
    } catch (error) {
      console.error("Error deleting topic:", error);
      fetchData(true);
    }
  };

  const handleMoveSubject = async (subjectId: string, direction: 'up' | 'down') => {
    const targetSubject = subjects.find(s => s.id === subjectId);
    if (!targetSubject) return;

    const targetGroupKey = getEffectiveGroupId(targetSubject.groupId);
    const siblings = subjects
      .filter(s => getEffectiveGroupId(s.groupId) === targetGroupKey)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const siblingIdx = siblings.findIndex(s => s.id === subjectId);
    if (siblingIdx === -1) return;

    const swapIdx = direction === 'up' ? siblingIdx - 1 : siblingIdx + 1;
    if (swapIdx < 0 || swapIdx >= siblings.length) return;

    const reorderedSiblings = [...siblings];
    const temp = reorderedSiblings[siblingIdx];
    reorderedSiblings[siblingIdx] = reorderedSiblings[swapIdx];
    reorderedSiblings[swapIdx] = temp;

    // Reconstrói lista ordenada por grupo + avulsas preservando ordens globais limpas
    const rebuilt: Subject[] = [];
    groups.forEach(grp => {
      const list =
        grp.id === targetGroupKey
          ? reorderedSiblings
          : subjects
              .filter(s => getEffectiveGroupId(s.groupId) === grp.id)
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      rebuilt.push(...list);
    });

    const ungroupedList =
      targetGroupKey === null
        ? reorderedSiblings
        : subjects
            .filter(s => getEffectiveGroupId(s.groupId) === null)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    rebuilt.push(...ungroupedList);

    const normalizedSubjects = rebuilt.map((s, index) => ({ ...s, order: index }));
    setSubjects(normalizedSubjects);

    try {
      await curriculumService.updateSubjectOrders(
        normalizedSubjects.map(s => ({ id: s.id, order: s.order || 0 }))
      );
      if (onUpdate) await onUpdate(true);
    } catch (error) {
      console.error("Error moving subject:", error);
      fetchData(true);
    }
  };

  const handleMoveTopic = async (topicId: string, direction: 'up' | 'down') => {
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;

    const subjectTopics = topics.filter(t => t.subjectId === topic.subjectId).sort((a, b) => (a.order || 0) - (b.order || 0));
    const index = subjectTopics.findIndex(t => t.id === topicId);
    if (index === -1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= subjectTopics.length) return;

    const newSubjectTopics = [...subjectTopics];
    const temp = newSubjectTopics[index];
    newSubjectTopics[index] = newSubjectTopics[targetIndex];
    newSubjectTopics[targetIndex] = temp;

    // Update orders locally for this subset
    newSubjectTopics.forEach((t, i) => t.order = i);

    // Merge back into main topics list
    const otherTopics = topics.filter(t => t.subjectId !== topic.subjectId);
    const newTopics = [...otherTopics, ...newSubjectTopics];
    setTopics(newTopics);

    try {
      await curriculumService.updateTopicOrders(newSubjectTopics.map(t => ({ id: t.id, order: t.order || 0 })));
      if (onUpdate) await onUpdate(true);
    } catch (error) {
      console.error("Error moving topic:", error);
      fetchData(true);
    }
  };

  const handleToggleTopicSelection = async (topic: Topic) => {
    try {
      const newStatus = !topic.isSelected;
      
      // Update topic AND all its modules
      const updatedModules = topic.modules?.map(m => ({ ...m, isSelected: newStatus })) || [];
      
      // Optimistic update
      const updatedTopics = topics.map(t => 
        t.id === topic.id ? { ...t, isSelected: newStatus, modules: updatedModules } : t
      );
      setTopics(updatedTopics);

      await curriculumService.updateTopic(topic.id, { isSelected: newStatus, modules: updatedModules });
      if (onUpdate) await onUpdate(true);
    } catch (error) {
      console.error("Error updating topic selection:", error);
      fetchData(true); // Revert on error
    }
  };

  const handleToggleModuleSelection = async (topicId: string, moduleId: string) => {
    try {
      const topic = topics.find(t => t.id === topicId);
      if (!topic) return;

      const currentModules = topic.modules || [];
      const updatedModules = currentModules.map(m => {
        if (m.id === moduleId) {
          // If undefined (legacy), treat as true, so toggle to false.
          // If false, toggle to true.
          // If true, toggle to false.
          return { ...m, isSelected: m.isSelected === false ? true : false };
        }
        return m;
      });

      // Logic: If at least one module is selected, the topic remains selected.
      // If NO modules are selected, the topic is unselected.
      const hasAnySelected = updatedModules.some(m => m.isSelected !== false);
      const topicSelected = hasAnySelected;

      // Optimistic update
      const updatedTopics = topics.map(t => 
        t.id === topicId ? { ...t, isSelected: topicSelected, modules: updatedModules } : t
      );
      setTopics(updatedTopics);

      const sanitizedModules = sanitizeModules(updatedModules);
      await curriculumService.updateTopic(topicId, { isSelected: topicSelected, modules: sanitizedModules });
      if (onUpdate) await onUpdate(true);
    } catch (error) {
      console.error("Error updating module selection:", error);
      fetchData(true); // Revert on error
    }
  };

  const handleUpdateTopicTeacher = async (topicId: string, teacherId: string | null) => {
    try {
      // Optimistic update
      const updatedTopics = topics.map(t => 
        t.id === topicId ? { ...t, teacherId: teacherId || undefined } : t
      );
      setTopics(updatedTopics);

      // Send null to remove the field/set to null in Firestore
      await curriculumService.updateTopic(topicId, { teacherId: teacherId as any });
      if (onUpdate) await onUpdate(true);
    } catch (error) {
      console.error("Error updating topic teacher:", error);
      fetchData(true); // Revert on error
    }
  };

  const handleBulkApplyTeacher = (subjectId: string) => {
    setBulkTeacherConfirmModal({ isOpen: true, subjectId });
  };

  const confirmBulkApplyTeacher = async () => {
    const subjectId = bulkTeacherConfirmModal.subjectId;
    if (!subjectId) return;
    
    try {
      setBulkTeacherConfirmModal({ isOpen: false, subjectId: null });
      const subjectTopics = topics.filter(t => t.subjectId === subjectId);
      
      // Optimistic update
      const updatedTopics = topics.map(t => 
        t.subjectId === subjectId ? { ...t, teacherId: undefined } : t
      );
      setTopics(updatedTopics);

      await Promise.all(subjectTopics.map(t => 
        curriculumService.updateTopic(t.id, { teacherId: null as any })
      ));
      if (onUpdate) await onUpdate(true);
    } catch (error) {
      console.error("Error bulk updating teachers:", error);
      fetchData(true);
    }
  };

  const handleSaveModule = async () => {
    if (!newModule.name || !activeTopicId) return;
    
    try {
      const topic = topics.find(t => t.id === activeTopicId);
      if (!topic) return;

      const precedingMod = getPrecedingPresencialModule(
        topic.subjectId,
        activeTopicId,
        editingModule?.id || null
      );
      const isOnlineMod = Boolean(newModule.isOnline);
      const isGuidedMod = !isOnlineMod && Boolean(newModule.isGuidedStudy);
      const effectiveGrouped =
        !isOnlineMod && !isGuidedMod && Boolean(newModule.groupedWithPrevious) && Boolean(precedingMod);
      const effectiveClassesCount = isOnlineMod
        ? 1
        : isGuidedMod || effectiveGrouped
          ? 0
          : Math.max(1, Number(newModule.classesCount) || 1);

      const currentModules = topic.modules || [];
      let updatedModules: Module[];

      if (editingModule) {
        updatedModules = currentModules.map(m => 
          m.id === editingModule.id 
            ? { 
                ...m, 
                name: newModule.name, 
                groupedWithPrevious: effectiveGrouped,
                classesCount: effectiveClassesCount, 
                contents: newModule.contents,
                isOnline: isOnlineMod,
                isGuidedStudy: isGuidedMod,
                onlineStatus: newModule.onlineStatus,
                publicationDate: newModule.publicationDate,
                teachingAreaLink: newModule.teachingAreaLink
              }
            : m
        );
      } else {
        const newMod: Module = {
          id: Date.now().toString(),
          name: newModule.name,
          groupedWithPrevious: effectiveGrouped,
          classesCount: effectiveClassesCount,
          contents: newModule.contents,
          isOnline: isOnlineMod,
          isGuidedStudy: isGuidedMod,
          onlineStatus: newModule.onlineStatus,
          publicationDate: newModule.publicationDate,
          teachingAreaLink: newModule.teachingAreaLink
        };
        updatedModules = [...currentModules, newMod];
      }

      // Optimistic update (with original data for state)
      const updatedTopics = topics.map(t => 
        t.id === activeTopicId ? { ...t, modules: updatedModules } : t
      );
      setTopics(updatedTopics);

      const sanitizedModules = sanitizeModules(updatedModules);
      await curriculumService.updateTopic(activeTopicId, { modules: sanitizedModules });
      
      setIsModuleModalOpen(false);
      setEditingModule(null);
      setNewModule({ 
        name: '', 
        classesCount: 1, 
        groupedWithPrevious: false,
        contents: [],
        isOnline: false,
        isGuidedStudy: false,
        onlineStatus: 'EM_GRAVACAO',
        publicationDate: '',
        teachingAreaLink: { moduleId: '', folderId: '' }
      });

      if (onUpdate) await onUpdate(true);
    } catch (error) {
      console.error("Error saving module:", error);
      fetchData(true); // Revert on error
    }
  };

  const handleDeleteModule = async () => {
    if (!moduleDeleteModal.topicId || !moduleDeleteModal.moduleId) return;

    try {
      setIsDeleting(true);
      const topic = topics.find(t => t.id === moduleDeleteModal.topicId);
      if (!topic) return;

      const updatedModules = (topic.modules || []).filter(m => m.id !== moduleDeleteModal.moduleId);

      // Optimistic update
      const updatedTopics = topics.map(t => 
        t.id === moduleDeleteModal.topicId ? { ...t, modules: updatedModules } : t
      );
      setTopics(updatedTopics);

      const sanitizedModules = sanitizeModules(updatedModules);
      await curriculumService.updateTopic(moduleDeleteModal.topicId!, { modules: sanitizedModules });
      
      setModuleDeleteModal({ isOpen: false, topicId: null, moduleId: null });

      if (onUpdate) await onUpdate(true);
    } catch (error) {
      console.error("Error deleting module:", error);
      fetchData(true); // Revert on error
    } finally {
      setIsDeleting(false);
    }
  };

  const handleMoveModule = async (topicId: string, moduleId: string, direction: 'up' | 'down') => {
    const topic = topics.find(t => t.id === topicId);
    if (!topic || !topic.modules) return;

    const moduleIndex = topic.modules.findIndex(m => m.id === moduleId);
    if (moduleIndex === -1) return;

    const targetIndex = direction === 'up' ? moduleIndex - 1 : moduleIndex + 1;
    if (targetIndex < 0 || targetIndex >= topic.modules.length) return;

    const newModules = [...topic.modules];
    const temp = newModules[moduleIndex];
    newModules[moduleIndex] = newModules[targetIndex];
    newModules[targetIndex] = temp;

    // Optimistic update
    const updatedTopics = topics.map(t => 
      t.id === topicId ? { ...t, modules: newModules } : t
    );
    setTopics(updatedTopics);

    try {
      const sanitizedModules = sanitizeModules(newModules);
      await curriculumService.updateTopic(topicId, { modules: sanitizedModules });
      if (onUpdate) await onUpdate(true);
    } catch (error) {
      console.error("Error moving module:", error);
      fetchData(true); // Revert on error
    }
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>, fileType: 'theory' | 'questions' = 'theory') => {
    if (!e.target.files || !e.target.files[0]) return;
    
    const file = e.target.files[0];
    setIsUploadingPdf(true);

    try {
      const fileRef = ref(storage, `class-materials/modules/${Date.now()}_${file.name}`);
      await uploadBytes(fileRef, file);
      const downloadUrl = await getDownloadURL(fileRef);

      const newContent: ModuleContent = {
        id: Date.now().toString(),
        type: 'PDF',
        title: file.name,
        url: downloadUrl,
        createdAt: new Date().toISOString(),
        fileType,
        linkedTheoryId: null
      };

      setNewModule(prev => ({
        ...prev,
        contents: [...(prev.contents || []), newContent]
      }));
    } catch (error) {
      console.error("Error uploading PDF:", error);
      alert("Erro ao fazer upload do PDF. Tente novamente.");
    } finally {
      setIsUploadingPdf(false);
      // Reset input
      e.target.value = '';
    }
  };

  const handleUpdatePdfType = (contentId: string, newType: 'theory' | 'questions') => {
    setNewModule(prev => ({
      ...prev,
      contents: prev.contents.map(c => 
        c.id === contentId 
          ? { 
              ...c, 
              fileType: newType, 
              linkedTheoryId: newType === 'theory' ? null : (c.linkedTheoryId || null) 
            } 
          : c
      )
    }));
  };

  const handleUpdateLinkedTheory = (contentId: string, linkedTheoryId: string | null) => {
    setNewModule(prev => ({
      ...prev,
      contents: prev.contents.map(c => 
        c.id === contentId ? { ...c, linkedTheoryId } : c
      )
    }));
  };

  const handleRemovePdf = (contentId: string) => {
    setPdfDeleteModal({ isOpen: true, contentId });
  };

  const confirmRemovePdf = () => {
    if (!pdfDeleteModal.contentId) return;
    
    setNewModule(prev => ({
      ...prev,
      contents: prev.contents.filter(c => c.id !== pdfDeleteModal.contentId)
    }));
    
    setPdfDeleteModal({ isOpen: false, contentId: null });
  };

  const handleUpdatePdfTitle = (contentId: string, newTitle: string) => {
    setNewModule(prev => ({
      ...prev,
      contents: prev.contents.map(c => 
        c.id === contentId ? { ...c, title: newTitle } : c
      )
    }));
  };

  const handleTeachingAreaSelection = (data: { moduleId: string, moduleName: string, folderId: string, folderName: string }) => {
    setNewModule(prev => ({
      ...prev,
      teachingAreaLink: {
        moduleId: data.moduleId,
        folderId: data.folderId,
        moduleName: data.moduleName,
        folderName: data.folderName
      }
    }));
  };

  const handleSyncGrade = async () => {
    setIsSyncing(true);
    try {
      const existingEvents = await classScheduleService.getScheduleEventsByClass(cls.id);
      if (existingEvents.length > 0) {
        const reResolved = resolveManualSchedule(existingEvents, subjects, topics);
        await classScheduleService.saveScheduleEvents(cls.id, reResolved);
      }
      if (onUpdate) await onUpdate(true);
      setSyncSuccess(true);
      toast.success('Grade e cronograma sincronizados com sucesso.');
      setTimeout(() => {
        setSyncSuccess(false);
      }, 3000);
    } catch (error) {
      console.error('Error syncing grade with schedule:', error);
      toast.error('Erro ao sincronizar a grade.');
    } finally {
      setIsSyncing(false);
    }
  };

  const openTopicModal = (subjectId: string) => {
    setEditingTopic(null);
    setNewTopic({ name: '', requiredClasses: 0 });
    setSelectedSubjectId(subjectId);
    setIsTopicModalOpen(true);
  };

  const toggleSubject = (subjectId: string) => {
    setExpandedSubjects(prev => 
      prev.includes(subjectId) ? prev.filter(id => id !== subjectId) : [...prev, subjectId]
    );
  };

  const getTeacherName = (id?: string) => {
    if (!id) return null;
    return teachers.find(t => t.id === id)?.name || 'Professor não encontrado';
  };

  const ungroupedSubjects = useMemo(
    () =>
      subjects
        .filter((s) => getEffectiveGroupId(s.groupId) === null)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [subjects, validGroupIdSet]
  );

  const getSubjectPresencialClassesCount = (subjectId: string) => {
    return getSubjectEffectiveSlotCount(subjectId, topics, true);
  };

  const renderSubjectCard = (subject: Subject, indexInScope: number, totalInScope: number) => (
    <div key={subject.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 cursor-pointer hover:bg-zinc-800/50 transition-colors"
        onClick={() => toggleSubject(subject.id)}
        style={{ borderLeft: `4px solid ${subject.color}` }}
      >
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <h4 className="font-bold text-white">{subject.name}</h4>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 flex items-center gap-1">
              <User className="w-3 h-3 shrink-0" />
              {getTeacherName(subject.defaultTeacherId) || 'Sem Titular'}
            </span>
            {subject.defaultTeacherId && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleBulkApplyTeacher(subject.id);
                }}
                className="text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-400 px-2 py-0.5 rounded border border-zinc-700 transition-colors whitespace-nowrap shrink-0"
                title="Vincular Titular a Todos os Assuntos"
              >
                Aplicar a todos
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 shrink-0">
          {groups.length > 0 && (
            <div onClick={(e) => e.stopPropagation()}>
              <select
                value={getEffectiveGroupId(subject.groupId) || ''}
                onChange={(e) => handleQuickChangeSubjectGroup(subject.id, e.target.value || null)}
                className="bg-zinc-950 border border-zinc-800 hover:border-zinc-700 rounded-md px-2 py-1 text-[11px] text-zinc-300 focus:outline-none focus:border-brand-red transition-colors cursor-pointer max-w-[180px] truncate"
                title="Vincular ou alterar grupo desta disciplina"
              >
                <option value="">Fora de grupo</option>
                {groups.map((grp) => (
                  <option key={grp.id} value={grp.id}>
                    {grp.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-1 mr-1">
            <div className="flex flex-col mr-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleMoveSubject(subject.id, 'up');
                }}
                disabled={indexInScope === 0}
                className="p-0.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded disabled:opacity-25 disabled:pointer-events-none"
                title="Mover para cima"
              >
                <ChevronUp className="w-3 h-3" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleMoveSubject(subject.id, 'down');
                }}
                disabled={indexInScope === totalInScope - 1}
                className="p-0.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded disabled:opacity-25 disabled:pointer-events-none"
                title="Mover para baixo"
              >
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleEditSubject(subject);
              }}
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors"
              title="Editar Disciplina"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSubjectDeleteModal({ isOpen: true, subjectId: subject.id });
              }}
              className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-zinc-800 rounded transition-colors"
              title="Excluir Disciplina"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <span className="text-xs text-zinc-500 tabular-nums whitespace-nowrap">
            {topics.filter((t) => t.subjectId === subject.id).length} assuntos
          </span>
          {expandedSubjects.includes(subject.id) ? (
            <ChevronUp className="w-4 h-4 text-zinc-500 shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
          )}
        </div>
      </div>

      {expandedSubjects.includes(subject.id) && (
        <div className="p-4 bg-zinc-950/50 border-t border-zinc-800 space-y-3">
          {topics
            .filter((t) => t.subjectId === subject.id)
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .map((topic) => {
              const topicPresencialModules = (topic.modules || []).filter((m) => !m.isOnline && !m.isGuidedStudy);
              const topicOwnClasses = topicPresencialModules.reduce((acc, mod) => {
                const prec = getPrecedingPresencialModule(subject.id, topic.id, mod.id);
                const isEffGrouped = (Boolean(mod.groupedWithPrevious) || Number(mod.classesCount) === 0) && Boolean(prec);
                return acc + (isEffGrouped ? 0 : Math.max(1, Number(mod.classesCount) || 1));
              }, 0);
              const allGroupedInPrevious =
                topicPresencialModules.length > 0 && topicOwnClasses === 0;

              return (
            <div key={topic.id} className="bg-zinc-900 border border-zinc-800 p-3 rounded-lg hover:border-zinc-700 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleToggleTopicSelection(topic)}
                    className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
                      topic.isSelected
                        ? 'bg-brand-red text-white'
                        : 'bg-zinc-800 text-transparent border border-zinc-700 hover:border-zinc-500'
                    }`}
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                  </button>
                  <div>
                    <p className={`text-sm font-medium ${topic.isSelected ? 'text-white' : 'text-zinc-500'}`}>
                      {topic.name}
                    </p>
                    <div className="mt-2">
                      <select
                        value={topic.teacherId || ''}
                        onChange={(e) => handleUpdateTopicTeacher(topic.id, e.target.value || null)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-400 focus:outline-none focus:border-brand-red transition-colors appearance-none cursor-pointer hover:border-zinc-700"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <option value="">Herda da Disciplina ({getTeacherName(subject.defaultTeacherId) || 'Sem Titular'})</option>
                        {teachers.map((teacher) => (
                          <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right tabular-nums">
                    {allGroupedInPrevious ? (
                      <>
                        <span className="block text-[11px] font-bold text-amber-400 whitespace-nowrap">
                          Aula conjunta
                        </span>
                        <span className="text-[10px] text-zinc-500 uppercase whitespace-nowrap">Na anterior</span>
                      </>
                    ) : (
                      <>
                        <span className="block text-xs font-bold text-white whitespace-nowrap">
                          {topicOwnClasses} {topicOwnClasses === 1 ? 'aula' : 'aulas'}
                        </span>
                        <span className="text-[10px] text-zinc-600 uppercase">Total</span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-1 pl-2 border-l border-zinc-800">
                    <div className="flex flex-col">
                      <button
                        onClick={() => handleMoveTopic(topic.id, 'up')}
                        className="p-0.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded"
                        title="Mover para cima"
                      >
                        <ChevronUp className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleMoveTopic(topic.id, 'down')}
                        className="p-0.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded"
                        title="Mover para baixo"
                      >
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    </div>
                    <button
                      onClick={() => handleEditTopic(topic)}
                      className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded transition-colors"
                      title="Editar Assunto"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => setTopicDeleteModal({ isOpen: true, topicId: topic.id })}
                      className="p-1.5 text-zinc-500 hover:text-red-500 hover:bg-zinc-800 rounded transition-colors"
                      title="Excluir Assunto"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Modules List */}
              <div className="mt-3 pl-4 border-l-2 border-zinc-800 space-y-2">
                {topic.modules?.map((module, index) => {
                  const isGuidedMod = !module.isOnline && Boolean(module.isGuidedStudy);
                  const precedingMod = !module.isOnline && !isGuidedMod
                    ? getPrecedingPresencialModule(subject.id, topic.id, module.id)
                    : null;
                  const isGroupedWithPrev =
                    !module.isOnline &&
                    !isGuidedMod &&
                    (Boolean(module.groupedWithPrevious) || Number(module.classesCount) === 0) &&
                    Boolean(precedingMod);
                  const displayClassesCount = Math.max(1, Number(module.classesCount) || 1);
                  const linkedGuidedMetas = getGuidedMetasForModule(guidedMetas, module.id);
                  const guidedStatus = getGuidedModuleAdminStatus(linkedGuidedMetas, todayIso);

                  return (
                  <div key={module.id} className="flex items-center justify-between gap-2 bg-zinc-950/50 p-2 rounded border border-zinc-800/50 hover:border-zinc-700 transition-colors group">
                    <div className="flex items-center gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={module.isSelected !== false}
                        onChange={() => handleToggleModuleSelection(topic.id, module.id)}
                        className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-brand-red focus:ring-brand-red focus:ring-offset-zinc-900 cursor-pointer shrink-0"
                      />
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <div className={`w-1.5 h-1.5 rounded-full transition-colors shrink-0 ${module.isSelected !== false ? (isGuidedMod || isGroupedWithPrev ? 'bg-amber-400' : 'bg-brand-red') : 'bg-zinc-700'}`} />
                        <span className={`text-xs ${module.isSelected !== false ? 'text-zinc-300' : 'text-zinc-600 line-through'}`}>
                          {module.name}
                        </span>
                        {module.isOnline && (
                          <span className="text-[8px] font-bold uppercase px-1 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20 whitespace-nowrap shrink-0">
                            Online
                          </span>
                        )}
                        {isGuidedMod && (
                          <span className="inline-flex items-center gap-1 text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/25 whitespace-nowrap shrink-0">
                            <Target className="w-2.5 h-2.5 shrink-0" />
                            Estudo Guiado
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {module.isOnline ? (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap ${module.onlineStatus === 'PUBLICADO' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}>
                          {module.onlineStatus === 'PUBLICADO' ? 'Publicado' : 'Em Gravação'}
                        </span>
                      ) : isGuidedMod ? (
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap tabular-nums ${
                            guidedStatus === 'DELIVERED'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                              : guidedStatus === 'SCHEDULED'
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/25'
                                : 'bg-zinc-900 text-zinc-500 border-zinc-800'
                          }`}
                        >
                          {guidedStatus === 'DELIVERED'
                            ? `Entregue · ${linkedGuidedMetas.length} ${linkedGuidedMetas.length === 1 ? 'meta' : 'metas'}`
                            : guidedStatus === 'SCHEDULED'
                              ? `Agendado · ${linkedGuidedMetas.length} ${linkedGuidedMetas.length === 1 ? 'meta' : 'metas'}`
                              : 'Sem metas'}
                        </span>
                      ) : isGroupedWithPrev ? (
                        <div className="flex items-center gap-1.5">
                          {linkedGuidedMetas.length > 0 && (
                            <span
                              title={`${linkedGuidedMetas.length} meta(s) do Estudo Guiado vinculada(s)`}
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/25 whitespace-nowrap tabular-nums"
                            >
                              <Target className="w-2.5 h-2.5 shrink-0" />
                              +{linkedGuidedMetas.length}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleToggleModuleGroupWithPrevious(topic.id, module.id)}
                            title={`Ministrado na mesma aula de "${precedingMod?.module.name}". Clique para separar em aula própria.`}
                            className="flex items-center gap-1 text-[10px] font-bold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30 transition-colors whitespace-nowrap shrink-0"
                          >
                            <Link2 className="w-3 h-3 text-amber-400 shrink-0" />
                            <span>Mesma aula ant.</span>
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          {linkedGuidedMetas.length > 0 && (
                            <span
                              title={`${linkedGuidedMetas.length} meta(s) do Estudo Guiado vinculada(s)`}
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/25 whitespace-nowrap tabular-nums"
                            >
                              <Target className="w-2.5 h-2.5 shrink-0" />
                              +{linkedGuidedMetas.length} {linkedGuidedMetas.length === 1 ? 'guiada' : 'guiadas'}
                            </span>
                          )}
                          {precedingMod && (
                            <button
                              type="button"
                              onClick={() => handleToggleModuleGroupWithPrevious(topic.id, module.id)}
                              title={`Agrupar na mesma aula de "${precedingMod.module.name}" (0 aulas extras)`}
                              className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[10px] font-semibold text-zinc-400 hover:text-amber-300 bg-zinc-900 hover:bg-amber-500/10 px-1.5 py-0.5 rounded border border-zinc-800 hover:border-amber-500/30 transition-all whitespace-nowrap shrink-0"
                            >
                              <Link2 className="w-2.5 h-2.5 shrink-0" />
                              <span>Agrupar na ant.</span>
                            </button>
                          )}
                          <span className="text-[10px] font-bold text-zinc-500 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800 tabular-nums whitespace-nowrap">
                            {displayClassesCount} {displayClassesCount === 1 ? 'aula' : 'aulas'}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="flex flex-col mr-1">
                          <button
                            onClick={() => handleMoveModule(topic.id, module.id, 'up')}
                            className="p-0.5 text-zinc-600 hover:text-white hover:bg-zinc-800 rounded"
                            disabled={index === 0}
                          >
                            <ChevronUp className="w-2.5 h-2.5" />
                          </button>
                          <button
                            onClick={() => handleMoveModule(topic.id, module.id, 'down')}
                            className="p-0.5 text-zinc-600 hover:text-white hover:bg-zinc-800 rounded"
                            disabled={index === (topic.modules?.length || 0) - 1}
                          >
                            <ChevronDown className="w-2.5 h-2.5" />
                          </button>
                        </div>
                        <button
                          onClick={() => {
                            setEditingModule(module);
                            setNewModule({
                              name: module.name,
                              classesCount: module.groupedWithPrevious ? 0 : Math.max(1, Number(module.classesCount) || 1),
                              groupedWithPrevious: Boolean(module.groupedWithPrevious) || (!module.isOnline && !module.isGuidedStudy && Number(module.classesCount) === 0),
                              contents: module.contents || [],
                              isOnline: module.isOnline || false,
                              isGuidedStudy: Boolean(module.isGuidedStudy && !module.isOnline),
                              onlineStatus: module.onlineStatus || 'EM_GRAVACAO',
                              publicationDate: module.publicationDate || '',
                              teachingAreaLink: module.teachingAreaLink || { moduleId: '', folderId: '' }
                            });
                            setActiveTopicId(topic.id);
                            setIsModuleModalOpen(true);
                          }}
                          className="p-1 text-zinc-600 hover:text-white hover:bg-zinc-800 rounded"
                          title="Editar Módulo"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setModuleDeleteModal({ isOpen: true, topicId: topic.id, moduleId: module.id })}
                          className="p-1 text-zinc-600 hover:text-red-500 hover:bg-zinc-800 rounded"
                          title="Excluir Módulo"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                  );
                })}

                <button
                  onClick={() => {
                    setEditingModule(null);
                    setNewModule({
                      name: '',
                      classesCount: 1,
                      groupedWithPrevious: false,
                      contents: [],
                      isOnline: false,
                      isGuidedStudy: false,
                      onlineStatus: 'EM_GRAVACAO',
                      publicationDate: '',
                      teachingAreaLink: { moduleId: '', folderId: '' }
                    });
                    setActiveTopicId(topic.id);
                    setIsModuleModalOpen(true);
                  }}
                  className="text-[10px] font-bold uppercase text-zinc-600 hover:text-brand-red flex items-center gap-1 mt-2 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Adicionar Módulo
                </button>
              </div>
            </div>
              );
            })}

          <button
            onClick={() => openTopicModal(subject.id)}
            className="w-full py-2 border border-dashed border-zinc-800 rounded-lg text-zinc-500 text-xs font-bold uppercase hover:text-brand-red hover:border-brand-red/30 transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-3 h-3" />
            Adicionar Assunto
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full animate-in fade-in duration-500">
      {/* Left Column: Subjects & Groups List */}
      <div className="flex-1 space-y-6">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div>
            <h3 className="text-xl font-bold text-white">Disciplinas e Assuntos</h3>
            {groups.length > 0 && (
              <p className="text-xs text-zinc-500 mt-0.5 tabular-nums">
                {groups.length} {groups.length === 1 ? 'grupo organizado' : 'grupos organizados'} · {subjects.length} {subjects.length === 1 ? 'disciplina' : 'disciplinas'}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {cls.masterClassId && (
              <button
                onClick={handleImportFromMaster}
                disabled={isCloning}
                className="flex items-center gap-2 px-3.5 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg font-bold uppercase text-xs tracking-wider transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                {isCloning ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <GitBranch className="w-4 h-4" />
                )}
                Importar da Turma Mãe
              </button>
            )}
            <button
              onClick={handleOpenCreateGroup}
              className="flex items-center gap-2 px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 hover:border-zinc-600 rounded-lg font-bold uppercase text-xs tracking-wider transition-colors whitespace-nowrap shrink-0"
            >
              <FolderPlus className="w-4 h-4 text-brand-red" />
              Novo Grupo
            </button>
            <button
              onClick={() => {
                setEditingSubject(null);
                setNewSubject({ name: '', color: '#EF4444', defaultTeacherId: '', groupId: '' });
                setIsModalOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-brand-red hover:bg-red-600 text-white rounded-lg font-bold uppercase text-xs tracking-wider transition-colors shadow-lg shadow-brand-red/20 whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              Nova Disciplina
            </button>
          </div>
        </div>

        <div className="space-y-6">
          {/* Grupos Cadastrados */}
          {groups.map((group, grpIndex) => {
            const groupSubjects = subjects
              .filter((s) => s.groupId === group.id)
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            const groupSubjectIds = new Set(groupSubjects.map((s) => s.id));
            const groupTopicsCount = topics.filter((t) => groupSubjectIds.has(t.subjectId)).length;
            const groupClassesCount = groupSubjects.reduce(
              (sum, s) => sum + getSubjectPresencialClassesCount(s.id),
              0
            );
            const isGroupCollapsed = collapsedGroups.has(group.id);

            return (
              <div
                key={group.id}
                className="border border-zinc-800 rounded-xl bg-zinc-950/60 overflow-hidden"
              >
                <div
                  onClick={() => toggleGroupCollapse(group.id)}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3.5 bg-zinc-900/80 hover:bg-zinc-900 cursor-pointer transition-colors border-b border-zinc-800/80"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {isGroupCollapsed ? (
                      <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                    )}
                    <Layers className="w-4 h-4 text-brand-red shrink-0" />
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold uppercase tracking-wider text-white truncate">
                        {group.name}
                      </h4>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500 tabular-nums">
                        <span>
                          {groupSubjects.length}{' '}
                          {groupSubjects.length === 1 ? 'disciplina' : 'disciplinas'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {groupTopicsCount} {groupTopicsCount === 1 ? 'assunto' : 'assuntos'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{groupClassesCount} aulas selecionadas</span>
                      </div>
                    </div>
                  </div>

                  <div
                    className="flex items-center justify-end gap-1.5 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSubject(null);
                        setNewSubject({
                          name: '',
                          color: '#EF4444',
                          defaultTeacherId: '',
                          groupId: group.id,
                        });
                        setIsModalOpen(true);
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-[10px] font-bold uppercase tracking-wider transition-colors whitespace-nowrap shrink-0 mr-1"
                      title="Cadastrar nova disciplina diretamente neste grupo"
                    >
                      <Plus className="w-3 h-3 text-brand-red" />
                      Disciplina
                    </button>

                    <div className="flex flex-col">
                      <button
                        type="button"
                        onClick={() => handleMoveGroup(group.id, 'up')}
                        disabled={grpIndex === 0}
                        className="p-0.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded disabled:opacity-25 disabled:pointer-events-none"
                        title="Mover grupo para cima"
                      >
                        <ChevronUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveGroup(group.id, 'down')}
                        disabled={grpIndex === groups.length - 1}
                        className="p-0.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded disabled:opacity-25 disabled:pointer-events-none"
                        title="Mover grupo para baixo"
                      >
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleOpenEditGroup(group)}
                      className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors"
                      title="Editar nome ou disciplinas do grupo"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setGroupDeleteModal({ isOpen: true, group })}
                      className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-zinc-800 rounded transition-colors"
                      title="Excluir grupo (mantém as disciplinas)"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {!isGroupCollapsed && (
                  <div className="p-4 space-y-3">
                    {groupSubjects.length > 0 ? (
                      groupSubjects.map((subject, idx) =>
                        renderSubjectCard(subject, idx, groupSubjects.length)
                      )
                    ) : (
                      <div className="py-6 px-4 text-center border border-dashed border-zinc-800 rounded-lg text-xs text-zinc-500 flex flex-col sm:flex-row items-center justify-center gap-2">
                        <span>Nenhuma disciplina vinculada a este grupo ainda.</span>
                        <button
                          type="button"
                          onClick={() => handleOpenEditGroup(group)}
                          className="text-brand-red hover:underline font-semibold whitespace-nowrap"
                        >
                          Vincular disciplinas existentes
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Disciplinas Fora de Grupo (Avulsas) */}
          {groups.length > 0 ? (
            ungroupedSubjects.length > 0 && (
              <div className="border border-zinc-800/80 rounded-xl bg-zinc-950/40 overflow-hidden">
                <div
                  onClick={() => toggleGroupCollapse('__UNGROUPED__')}
                  className="flex items-center justify-between px-4 py-3 bg-zinc-900/40 hover:bg-zinc-900/70 cursor-pointer transition-colors border-b border-zinc-800/60"
                >
                  <div className="flex items-center gap-2.5">
                    {collapsedGroups.has('__UNGROUPED__') ? (
                      <ChevronRight className="w-4 h-4 text-zinc-500" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-zinc-500" />
                    )}
                    <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                      Disciplinas Fora de Grupo
                    </h4>
                    <span className="text-xs text-zinc-600 tabular-nums">
                      · {ungroupedSubjects.length}{' '}
                      {ungroupedSubjects.length === 1 ? 'disciplina' : 'disciplinas'}
                    </span>
                  </div>
                </div>
                {!collapsedGroups.has('__UNGROUPED__') && (
                  <div className="p-4 space-y-3">
                    {ungroupedSubjects.map((subject, idx) =>
                      renderSubjectCard(subject, idx, ungroupedSubjects.length)
                    )}
                  </div>
                )}
              </div>
            )
          ) : (
            <div className="space-y-4">
              {ungroupedSubjects.map((subject, idx) =>
                renderSubjectCard(subject, idx, ungroupedSubjects.length)
              )}
            </div>
          )}

          {subjects.length === 0 && groups.length === 0 && !loading && (
            <div className="text-center py-12 text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
              Nenhuma disciplina cadastrada. Comece criando um grupo ou adicionando uma disciplina.
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Workload Dashboard (Sticky) */}
      <div className="lg:w-80 shrink-0">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 sticky top-6 space-y-6">
          <div className="flex items-center gap-2 border-b border-zinc-800 pb-4">
            <BookOpen className="w-5 h-5 text-brand-red" />
            <h3 className="font-bold text-white">Carga Horária</h3>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center text-sm">
              <span className="text-zinc-400">Total de Encontros:</span>
              <span className="text-white font-bold">{cls.totalMeetings}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-zinc-400">Aulas por Encontro:</span>
              <span className="text-white font-bold">{cls.classesPerMeeting}</span>
            </div>
            
            <div className="pt-4 border-t border-zinc-800">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-zinc-500 uppercase">Encontros Utilizados</span>
                <span className={`text-xl font-black ${isOverLimit ? 'text-red-500' : 'text-white'}`}>
                  {meetingsConsumed}
                </span>
              </div>
              
              {/* Progress Bar */}
              <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-500 ${isOverLimit ? 'bg-red-500' : 'bg-brand-red'}`}
                  style={{ width: `${Math.min((meetingsConsumed / cls.totalMeetings) * 100, 100)}%` }}
                />
              </div>

              <div className="flex justify-between items-center mt-2 text-xs">
                <span className="text-zinc-500">Saldo Restante:</span>
                <span className={`font-bold ${meetingsBalance < 0 ? 'text-red-500' : 'text-green-500'}`}>
                  {meetingsBalance} encontros
                </span>
              </div>

              {guidedOnlyEncountersCount > 0 && (
                <div className="mt-3 pt-2.5 border-t border-zinc-800/80 space-y-1 text-[11px] text-zinc-400 tabular-nums">
                  <div className="flex items-center justify-between">
                    <span>Aulas presenciais:</span>
                    <span className="font-semibold text-zinc-200">{presencialMeetingsConsumed}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-amber-400">
                      <Target className="w-3 h-3 shrink-0" />
                      Dias de Estudo Guiado:
                    </span>
                    <span className="font-semibold text-amber-300">+{guidedOnlyEncountersCount}</span>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleSyncGrade}
              disabled={isSyncing || syncSuccess}
              className={`w-full py-3 text-white rounded-lg font-bold uppercase text-xs tracking-wider shadow-lg transition-all flex items-center justify-center gap-2 ${
                syncSuccess 
                  ? 'bg-green-600 hover:bg-green-700 shadow-green-600/20' 
                  : 'bg-brand-red hover:bg-red-600 shadow-brand-red/20'
              } ${isSyncing ? 'opacity-70 cursor-wait' : ''}`}
            >
              {isSyncing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Sincronizando...
                </>
              ) : syncSuccess ? (
                <>
                  <CheckSquare className="w-4 h-4" />
                  Grade Sincronizada!
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Salvar e Sincronizar Grade
                </>
              )}
            </button>

            {isOverLimit && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                <div className="space-y-1">
                  <p className="text-xs font-bold text-red-500 uppercase">Limite Excedido</p>
                  <p className="text-[10px] text-red-400 leading-tight">
                    Custo adicional gerado por {Math.abs(meetingsBalance)} encontros extrapolados.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create/Edit SubjectGroup Modal */}
      {isGroupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-lg rounded-xl shadow-2xl p-6 animate-in zoom-in-95 duration-200 space-y-5">
            <div className="flex items-center gap-2.5">
              <Layers className="w-5 h-5 text-brand-red shrink-0" />
              <h3 className="text-lg font-bold text-white">
                {editingGroup ? 'Editar Grupo de Disciplinas' : 'Novo Grupo de Disciplinas'}
              </h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase mb-2">
                  Nome do Grupo
                </label>
                <input
                  type="text"
                  value={groupNameInput}
                  onChange={(e) => setGroupNameInput(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-brand-red transition-colors"
                  placeholder="Ex: CONHECIMENTOS BÁSICOS"
                  autoFocus
                />
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="text-[10px] text-zinc-500 mr-1">Sugestões rápidas:</span>
                  {[
                    'CONHECIMENTOS BÁSICOS',
                    'CONHECIMENTOS JURÍDICOS',
                    'CONHECIMENTOS ESPECÍFICOS',
                    'LEGISLAÇÃO ESPECIAL',
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setGroupNameInput(preset)}
                      className="px-2 py-0.5 rounded bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-[10px] text-zinc-400 hover:text-white transition-colors whitespace-nowrap"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {subjects.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold text-zinc-400 uppercase">
                      Disciplinas vinculadas a este grupo (Opcional)
                    </label>
                    <span className="text-[11px] text-zinc-500 tabular-nums">
                      {groupSelectedSubjectIds.size} selecionada(s)
                    </span>
                  </div>
                  <div className="max-h-52 overflow-y-auto bg-zinc-950 border border-zinc-800 rounded-lg divide-y divide-zinc-800/70">
                    {subjects.map((subj) => {
                      const isChecked = groupSelectedSubjectIds.has(subj.id);
                      const currentGrp = groups.find(
                        (g) => g.id === subj.groupId && g.id !== editingGroup?.id
                      );
                      return (
                        <label
                          key={subj.id}
                          className="flex items-center justify-between gap-3 px-3.5 py-2.5 hover:bg-zinc-900/70 cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleSubjectInGroupModal(subj.id)}
                              className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-brand-red focus:ring-brand-red cursor-pointer shrink-0"
                            />
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: subj.color }}
                            />
                            <span className="text-xs font-medium text-zinc-200 truncate">
                              {subj.name}
                            </span>
                          </div>
                          {currentGrp && (
                            <span className="text-[10px] text-zinc-500 truncate max-w-[150px]">
                              Atual: {currentGrp.name}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-1.5">
                    Disciplinas não marcadas permanecem fora deste grupo. Você também pode alterar o grupo a qualquer momento na própria disciplina.
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsGroupModalOpen(false);
                  setEditingGroup(null);
                }}
                disabled={isSavingGroup}
                className="px-4 py-2 rounded-lg font-bold uppercase text-xs tracking-wider text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveGroup}
                disabled={!groupNameInput.trim() || isSavingGroup}
                className="flex items-center gap-2 px-6 py-2 bg-brand-red hover:bg-red-600 text-white rounded-lg font-bold uppercase text-xs tracking-wider shadow-lg shadow-brand-red/20 transition-colors disabled:opacity-50"
              >
                {isSavingGroup && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {editingGroup ? 'Salvar Grupo' : 'Criar Grupo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete SubjectGroup Confirmation Modal */}
      {groupDeleteModal.isOpen && groupDeleteModal.group && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-xl shadow-2xl p-6 animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Excluir Grupo</h3>
                <p className="text-zinc-300 text-sm mt-2">
                  Deseja remover o grupo{' '}
                  <strong className="text-white">{groupDeleteModal.group.name}</strong>?
                </p>
                <p className="text-zinc-500 text-xs mt-2 leading-relaxed">
                  Fique tranquilo: <strong className="text-zinc-300">nenhuma disciplina ou assunto será excluído</strong>. As disciplinas vinculadas passarão apenas a ficar fora de grupo.
                </p>
              </div>
              <div className="flex gap-3 w-full pt-2">
                <button
                  type="button"
                  onClick={() => setGroupDeleteModal({ isOpen: false, group: null })}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2 rounded-lg font-bold uppercase text-xs tracking-wider text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteGroup}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold uppercase text-xs tracking-wider shadow-lg shadow-red-600/20 transition-colors disabled:opacity-50"
                >
                  {isDeleting ? 'Removendo...' : 'Remover Grupo'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Subject Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-xl shadow-2xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-white mb-4">
              {editingSubject ? 'Editar Disciplina' : 'Nova Disciplina'}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase mb-2">Nome da Disciplina</label>
                <input
                  type="text"
                  value={newSubject.name}
                  onChange={(e) => setNewSubject({ ...newSubject, name: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-brand-red transition-colors"
                  placeholder="Ex: Direito Constitucional"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase mb-2">
                  Grupo de Disciplinas (Opcional)
                </label>
                <select
                  value={newSubject.groupId}
                  onChange={(e) => setNewSubject({ ...newSubject, groupId: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-brand-red transition-colors appearance-none"
                >
                  <option value="">Fora de grupo (Disciplina avulsa)</option>
                  {groups.map((grp) => (
                    <option key={grp.id} value={grp.id}>
                      {grp.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase mb-2">Cor de Identificação</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={newSubject.color}
                    onChange={(e) => setNewSubject({ ...newSubject, color: e.target.value })}
                    className="w-12 h-12 rounded cursor-pointer bg-transparent border-0 p-0"
                  />
                  <span className="text-zinc-500 text-xs uppercase font-mono">{newSubject.color}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase mb-2">Professor Titular (Padrão)</label>
                <select
                  value={newSubject.defaultTeacherId}
                  onChange={(e) => setNewSubject({ ...newSubject, defaultTeacherId: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-brand-red transition-colors appearance-none"
                >
                  <option value="">Selecione um professor (Opcional)</option>
                  {teachers.map(teacher => (
                    <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-lg font-bold uppercase text-xs tracking-wider text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveSubject}
                disabled={!newSubject.name.trim()}
                className="px-6 py-2 bg-brand-red hover:bg-red-600 text-white rounded-lg font-bold uppercase text-xs tracking-wider shadow-lg shadow-brand-red/20 transition-colors disabled:opacity-50"
              >
                {editingSubject ? 'Salvar Alterações' : 'Criar Disciplina'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Subject Confirmation Modal */}
      {subjectDeleteModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-sm rounded-xl shadow-2xl p-6 animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Excluir Disciplina</h3>
                <p className="text-zinc-400 text-sm mt-2">
                  Tem certeza que deseja excluir esta disciplina? Todos os assuntos vinculados também serão removidos.
                </p>
              </div>
              <div className="flex gap-3 w-full pt-2">
                <button
                  onClick={() => setSubjectDeleteModal({ isOpen: false, subjectId: null })}
                  className="flex-1 px-4 py-2 rounded-lg font-bold uppercase text-xs tracking-wider text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteSubject}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold uppercase text-xs tracking-wider shadow-lg shadow-red-600/20 transition-colors disabled:opacity-50"
                >
                  {isDeleting ? 'Excluindo...' : 'Excluir'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Topic Modal */}
      {isTopicModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-xl shadow-2xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-white mb-4">
              {editingTopic ? 'Editar Assunto' : 'Novo Assunto'}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase mb-2">Nome do Assunto</label>
                <input
                  type="text"
                  value={newTopic.name}
                  onChange={(e) => setNewTopic({ ...newTopic, name: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-brand-red transition-colors"
                  placeholder="Ex: Controle de Constitucionalidade"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setIsTopicModalOpen(false)}
                className="px-4 py-2 rounded-lg font-bold uppercase text-xs tracking-wider text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveTopic}
                disabled={!newTopic.name}
                className="px-6 py-2 bg-brand-red hover:bg-red-600 text-white rounded-lg font-bold uppercase text-xs tracking-wider shadow-lg shadow-brand-red/20 transition-colors disabled:opacity-50"
              >
                {editingTopic ? 'Salvar Alterações' : 'Adicionar Assunto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Topic Confirmation Modal */}
      {topicDeleteModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-sm rounded-xl shadow-2xl p-6 animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Excluir Assunto</h3>
                <p className="text-zinc-400 text-sm mt-2">
                  Tem certeza que deseja excluir este assunto? Esta ação não pode ser desfeita.
                </p>
              </div>
              <div className="flex gap-3 w-full pt-2">
                <button
                  onClick={() => setTopicDeleteModal({ isOpen: false, topicId: null })}
                  className="flex-1 px-4 py-2 rounded-lg font-bold uppercase text-xs tracking-wider text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteTopic}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold uppercase text-xs tracking-wider shadow-lg shadow-red-600/20 transition-colors disabled:opacity-50"
                >
                  {isDeleting ? 'Excluindo...' : 'Excluir'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Module Modal */}
      {isModuleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-xl shadow-2xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-white mb-4">
              {editingModule ? 'Editar Módulo' : 'Novo Módulo'}
            </h3>
            
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-zinc-950 rounded-lg border border-zinc-800">
                <button
                  type="button"
                  onClick={() => setNewModule({ ...newModule, isOnline: false, isGuidedStudy: false })}
                  className={`py-2 px-2 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all whitespace-nowrap ${!newModule.isOnline && !newModule.isGuidedStudy ? 'bg-brand-red text-white shadow-lg shadow-brand-red/20' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  Presencial
                </button>
                <button
                  type="button"
                  onClick={() => setNewModule({ ...newModule, isOnline: true, isGuidedStudy: false, groupedWithPrevious: false })}
                  className={`py-2 px-2 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all whitespace-nowrap ${newModule.isOnline ? 'bg-brand-red text-white shadow-lg shadow-brand-red/20' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  Online
                </button>
                <button
                  type="button"
                  onClick={() => setNewModule({ ...newModule, isOnline: false, isGuidedStudy: true, groupedWithPrevious: false, classesCount: 0 })}
                  className={`py-2 px-2 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all whitespace-nowrap flex items-center justify-center gap-1 ${!newModule.isOnline && newModule.isGuidedStudy ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20' : 'text-zinc-500 hover:text-amber-300'}`}
                >
                  <Target className="w-3 h-3 shrink-0" />
                  <span>Estudo Guiado</span>
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase mb-2">Nome do Módulo</label>
                <input
                  type="text"
                  value={newModule.name}
                  onChange={(e) => setNewModule({ ...newModule, name: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-brand-red transition-colors"
                  placeholder="Ex: Introdução ao Direito"
                />
              </div>

              {!newModule.isOnline && newModule.isGuidedStudy ? (
                <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/25 space-y-1.5 animate-in fade-in duration-200">
                  <p className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5 uppercase tracking-wider">
                    <Target className="w-3.5 h-3.5 shrink-0" />
                    Trabalhado via Metas do Estudo Guiado
                  </p>
                  <p className="text-[11px] text-zinc-300 leading-relaxed">
                    Este módulo não consome aulas presenciais na grade automática. Vincule uma ou mais metas (Videoaulas, PDFs, Mapas .JSON ou Questões) ao criá-las no <strong className="text-white">Cronograma</strong>; o módulo constará como <strong className="text-emerald-400">Entregue</strong> assim que todas as metas vinculadas atingirem a data programada.
                  </p>
                </div>
              ) : !newModule.isOnline ? (
                <div className="space-y-3">
                  {(() => {
                    const activeTopicObj = topics.find(t => t.id === activeTopicId);
                    const modalPrecedingMod = activeTopicObj
                      ? getPrecedingPresencialModule(
                          activeTopicObj.subjectId,
                          activeTopicObj.id,
                          editingModule?.id || null
                        )
                      : null;

                    return (
                      <>
                        {modalPrecedingMod && (
                          <div>
                            <label className="block text-xs font-bold text-zinc-400 uppercase mb-2">
                              Alocação na Aula
                            </label>
                            <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-950 rounded-lg border border-zinc-800">
                              <button
                                type="button"
                                onClick={() =>
                                  setNewModule({
                                    ...newModule,
                                    groupedWithPrevious: false,
                                    classesCount: Math.max(1, Number(newModule.classesCount) || 1),
                                  })
                                }
                                className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                                  !newModule.groupedWithPrevious
                                    ? 'bg-zinc-800 text-white border border-zinc-700'
                                    : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                              >
                                <Unlink className="w-3 h-3 shrink-0" />
                                Aula Própria
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setNewModule({
                                    ...newModule,
                                    groupedWithPrevious: true,
                                    classesCount: 0,
                                  })
                                }
                                className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                                  newModule.groupedWithPrevious
                                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40'
                                    : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                              >
                                <Link2 className="w-3 h-3 shrink-0" />
                                Mesma Aula Anterior
                              </button>
                            </div>
                          </div>
                        )}

                        {modalPrecedingMod && newModule.groupedWithPrevious ? (
                          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/25 space-y-1">
                            <p className="text-[11px] font-semibold text-amber-300 flex items-center gap-1.5">
                              <Link2 className="w-3.5 h-3.5 shrink-0" />
                              Agrupado no mesmo tempo de aula (0 aulas extras)
                            </p>
                            <p className="text-[11px] text-zinc-300 leading-relaxed">
                              Este tópico será ministrado junto com{' '}
                              <strong className="text-white">&ldquo;{modalPrecedingMod.module.name}&rdquo;</strong> sem consumir um novo encontro na carga horária.
                            </p>
                          </div>
                        ) : (
                          <div>
                            <label className="block text-xs font-bold text-zinc-400 uppercase mb-2">
                              Quantidade de Aulas
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={Math.max(1, Number(newModule.classesCount) || 1)}
                              onChange={(e) =>
                                setNewModule({
                                  ...newModule,
                                  groupedWithPrevious: false,
                                  classesCount: Math.max(1, Number(e.target.value) || 1),
                                })
                              }
                              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-brand-red transition-colors tabular-nums"
                            />
                            <p className="text-[10px] text-zinc-600 mt-1">
                              Quantos tempos de aula são necessários para este módulo?
                            </p>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              ) : (
                <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase mb-2">Status do Módulo Online</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setNewModule({ ...newModule, onlineStatus: 'EM_GRAVACAO' })}
                        className={`py-2 text-[10px] font-bold uppercase rounded-lg border transition-all ${newModule.onlineStatus === 'EM_GRAVACAO' ? 'bg-zinc-800 border-brand-red text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700'}`}
                      >
                        Em Gravação
                      </button>
                      <button
                        onClick={() => setNewModule({ ...newModule, onlineStatus: 'PUBLICADO' })}
                        className={`py-2 text-[10px] font-bold uppercase rounded-lg border transition-all ${newModule.onlineStatus === 'PUBLICADO' ? 'bg-zinc-800 border-brand-red text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700'}`}
                      >
                        Publicado
                      </button>
                    </div>
                  </div>

                  {newModule.onlineStatus === 'EM_GRAVACAO' && (
                    <div>
                      <label className="block text-xs font-bold text-zinc-400 uppercase mb-2">Data Prevista de Publicação</label>
                      <input
                        type="date"
                        value={newModule.publicationDate}
                        onChange={(e) => setNewModule({ ...newModule, publicationDate: e.target.value })}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-brand-red transition-colors"
                      />
                    </div>
                  )}

                  {newModule.onlineStatus === 'PUBLICADO' && (
                    <div className="flex flex-col gap-2">
                      <label className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Vínculo com Área de Ensino</label>
                      
                      <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 flex flex-col gap-3">
                        {newModule.teachingAreaLink?.moduleId ? (
                          <div className="flex flex-col gap-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex flex-col">
                                <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Módulo Online</span>
                                <span className="text-xs font-medium text-white">{newModule.teachingAreaLink.moduleName || 'ID: ' + newModule.teachingAreaLink.moduleId}</span>
                              </div>
                              <div className="flex flex-col text-right">
                                <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Pasta</span>
                                <span className="text-xs font-medium text-amber-500">{newModule.teachingAreaLink.folderName || 'ID: ' + newModule.teachingAreaLink.folderId}</span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setIsSelectorOpen(true)}
                              className="w-full mt-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-[10px] font-bold uppercase tracking-wider rounded transition flex items-center justify-center gap-2"
                            >
                              <Link size={12} />
                              Alterar Vínculo
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setIsSelectorOpen(true)}
                            className="w-full py-3 border border-dashed border-zinc-700 hover:border-brand-red hover:text-brand-red text-zinc-500 text-xs font-bold uppercase rounded-lg transition flex items-center justify-center gap-2 bg-zinc-950 hover:bg-brand-red/5"
                          >
                            <Link size={14} />
                            Selecionar Conteúdo na Área de Ensino
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase mb-2">Materiais de Apoio (PDF)</label>
                
                <div className="space-y-3 mb-4">
                  {newModule.contents?.filter(c => c.fileType === 'theory' || !c.fileType).map(content => (
                    <div key={content.id} className="space-y-2">
                      <div className="flex items-center gap-2 bg-zinc-950 p-2 rounded border border-zinc-800">
                        <select
                          value={content.fileType || 'theory'}
                          onChange={(e) => handleUpdatePdfType(content.id, e.target.value as 'theory' | 'questions')}
                          className="p-1 px-1.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20 text-[9px] font-black uppercase focus:outline-none cursor-pointer hover:bg-blue-500/20 transition-colors"
                        >
                          <option value="theory" className="bg-zinc-900 text-white">Teoria</option>
                          <option value="questions" className="bg-zinc-900 text-white">Questões</option>
                        </select>
                        <input
                          type="text"
                          value={content.title}
                          onChange={(e) => handleUpdatePdfTitle(content.id, e.target.value)}
                          className="flex-1 bg-transparent border-none text-xs text-white focus:ring-0 p-0"
                          placeholder="Nome do arquivo"
                        />
                        <button
                          onClick={() => handleRemovePdf(content.id)}
                          className="p-1 text-zinc-500 hover:text-red-500 hover:bg-zinc-900 rounded transition-colors"
                          title="Remover arquivo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Linked Questions */}
                      {newModule.contents?.filter(q => q.fileType === 'questions' && q.linkedTheoryId === content.id).map(question => (
                        <div key={question.id} className="relative ml-6">
                          <div className="absolute -left-4 top-0 h-1/2 w-4 border-b-2 border-l-2 border-zinc-700 rounded-bl-md"></div>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 bg-zinc-950/50 p-2 rounded border border-zinc-800">
                              <select
                                value={question.fileType || 'questions'}
                                onChange={(e) => handleUpdatePdfType(question.id, e.target.value as 'theory' | 'questions')}
                                className="p-1 px-1.5 rounded bg-orange-500/10 text-orange-500 border border-orange-500/20 text-[9px] font-black uppercase focus:outline-none cursor-pointer hover:bg-orange-500/20 transition-colors"
                              >
                                <option value="theory" className="bg-zinc-900 text-white">Teoria</option>
                                <option value="questions" className="bg-zinc-900 text-white">Questões</option>
                              </select>
                              <input
                                type="text"
                                value={question.title}
                                onChange={(e) => handleUpdatePdfTitle(question.id, e.target.value)}
                                className="flex-1 bg-transparent border-none text-xs text-white focus:ring-0 p-0"
                                placeholder="Nome do arquivo"
                              />
                              <button
                                onClick={() => handleRemovePdf(question.id)}
                                className="p-1 text-zinc-500 hover:text-red-500 hover:bg-zinc-900 rounded transition-colors"
                                title="Remover arquivo"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <div className="ml-6">
                              <select
                                value={question.linkedTheoryId || ''}
                                onChange={(e) => handleUpdateLinkedTheory(question.id, e.target.value || null)}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-400 focus:outline-none focus:border-brand-red transition-colors"
                              >
                                <option value="">Vincular a qual material de teoria? (Opcional)</option>
                                {newModule.contents?.filter(c => (c.fileType === 'theory' || !c.fileType) && c.id !== question.id).map(theory => (
                                  <option key={theory.id} value={theory.id}>{theory.title}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}

                  {/* Orphaned Questions */}
                  {newModule.contents?.filter(c => c.fileType === 'questions' && !c.linkedTheoryId).map(content => (
                    <div key={content.id} className="space-y-2">
                       <div className="flex items-center gap-2 bg-zinc-950 p-2 rounded border border-zinc-800">
                        <select
                          value={content.fileType || 'questions'}
                          onChange={(e) => handleUpdatePdfType(content.id, e.target.value as 'theory' | 'questions')}
                          className="p-1 px-1.5 rounded bg-orange-500/10 text-orange-500 border border-orange-500/20 text-[9px] font-black uppercase focus:outline-none cursor-pointer hover:bg-orange-500/20 transition-colors"
                        >
                          <option value="theory" className="bg-zinc-900 text-white">Teoria</option>
                          <option value="questions" className="bg-zinc-900 text-white">Questões</option>
                        </select>
                        <input
                          type="text"
                          value={content.title}
                          onChange={(e) => handleUpdatePdfTitle(content.id, e.target.value)}
                          className="flex-1 bg-transparent border-none text-xs text-white focus:ring-0 p-0"
                          placeholder="Nome do arquivo"
                        />
                        <button
                          onClick={() => handleRemovePdf(content.id)}
                          className="p-1 text-zinc-500 hover:text-red-500 hover:bg-zinc-900 rounded transition-colors"
                          title="Remover arquivo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="ml-6">
                        <select
                          value={content.linkedTheoryId || ''}
                          onChange={(e) => handleUpdateLinkedTheory(content.id, e.target.value || null)}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-400 focus:outline-none focus:border-brand-red transition-colors"
                        >
                          <option value="">Vincular a qual material de teoria? (Opcional)</option>
                          {newModule.contents?.filter(c => c.fileType === 'theory' || !c.fileType).map(theory => (
                            <option key={theory.id} value={theory.id}>{theory.title}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={(e) => handlePdfUpload(e, 'theory')}
                      disabled={isUploadingPdf}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                    />
                    <div className={`w-full py-2 border border-dashed border-zinc-800 rounded-lg flex items-center justify-center gap-2 transition-colors ${isUploadingPdf ? 'bg-zinc-900 opacity-50' : 'hover:border-blue-500/50 hover:bg-blue-500/5'}`}>
                      <Plus className="w-3 h-3 text-zinc-500" />
                      <span className="text-[10px] font-bold text-zinc-500 uppercase">Teoria</span>
                    </div>
                  </div>

                  <div className="relative">
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={(e) => handlePdfUpload(e, 'questions')}
                      disabled={isUploadingPdf}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                    />
                    <div className={`w-full py-2 border border-dashed border-zinc-800 rounded-lg flex items-center justify-center gap-2 transition-colors ${isUploadingPdf ? 'bg-zinc-900 opacity-50' : 'hover:border-orange-500/50 hover:bg-orange-500/5'}`}>
                      <Plus className="w-3 h-3 text-zinc-500" />
                      <span className="text-[10px] font-bold text-zinc-500 uppercase">Questões</span>
                    </div>
                  </div>
                </div>
                {isUploadingPdf && (
                  <div className="mt-2 flex items-center justify-center gap-2">
                    <Loader2 className="w-3 h-3 text-brand-red animate-spin" />
                    <span className="text-[10px] font-bold text-zinc-500 uppercase">Fazendo upload...</span>
                  </div>
                )}
              </div>

            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setIsModuleModalOpen(false)}
                className="px-4 py-2 rounded-lg font-bold uppercase text-xs tracking-wider text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveModule}
                disabled={!newModule.name}
                className="px-6 py-2 bg-brand-red hover:bg-red-600 text-white rounded-lg font-bold uppercase text-xs tracking-wider shadow-lg shadow-brand-red/20 transition-colors disabled:opacity-50"
              >
                {editingModule ? 'Salvar Alterações' : 'Adicionar Módulo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import From Master Confirmation Modal */}
      {importConfirmModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-sm rounded-xl shadow-2xl p-6 animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                <GitBranch className="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Importar da Turma Mãe</h3>
                <p className="text-zinc-400 text-sm mt-2">
                  Atenção: Esta ação irá importar as disciplinas e assuntos da Turma Mãe. Deseja continuar?
                </p>
              </div>
              <div className="flex gap-3 w-full pt-2">
                <button
                  onClick={() => setImportConfirmModal(false)}
                  className="flex-1 px-4 py-2 rounded-lg font-bold uppercase text-xs tracking-wider text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmImportFromMaster}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold uppercase text-xs tracking-wider shadow-lg shadow-blue-600/20 transition-colors"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Apply Teacher Confirmation Modal */}
      {bulkTeacherConfirmModal.isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-sm rounded-xl shadow-2xl p-6 animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-brand-red/10 flex items-center justify-center">
                <User className="w-6 h-6 text-brand-red" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Vincular Titular</h3>
                <p className="text-zinc-400 text-sm mt-2">
                  Deseja vincular o professor titular a todos os assuntos desta disciplina? Isso removerá professores específicos.
                </p>
              </div>
              <div className="flex gap-3 w-full pt-2">
                <button
                  onClick={() => setBulkTeacherConfirmModal({ isOpen: false, subjectId: null })}
                  className="flex-1 px-4 py-2 rounded-lg font-bold uppercase text-xs tracking-wider text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmBulkApplyTeacher}
                  className="flex-1 px-4 py-2 bg-brand-red hover:bg-red-600 text-white rounded-lg font-bold uppercase text-xs tracking-wider shadow-lg shadow-brand-red/20 transition-colors"
                >
                  Vincular
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete PDF Confirmation Modal */}
      {pdfDeleteModal.isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-sm rounded-xl shadow-2xl p-6 animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Excluir Material</h3>
                <p className="text-zinc-400 text-sm mt-2">
                  Tem certeza que deseja excluir este material de apoio?
                </p>
              </div>
              <div className="flex gap-3 w-full pt-2">
                <button
                  onClick={() => setPdfDeleteModal({ isOpen: false, contentId: null })}
                  className="flex-1 px-4 py-2 rounded-lg font-bold uppercase text-xs tracking-wider text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmRemovePdf}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold uppercase text-xs tracking-wider shadow-lg shadow-red-600/20 transition-colors"
                >
                  Excluir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Module Confirmation Modal */}
      {moduleDeleteModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-sm rounded-xl shadow-2xl p-6 animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Excluir Módulo</h3>
                <p className="text-zinc-400 text-sm mt-2">
                  Tem certeza que deseja excluir este módulo? Esta ação não pode ser desfeita.
                </p>
              </div>
              <div className="flex gap-3 w-full pt-2">
                <button
                  onClick={() => setModuleDeleteModal({ isOpen: false, topicId: null, moduleId: null })}
                  className="flex-1 px-4 py-2 rounded-lg font-bold uppercase text-xs tracking-wider text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteModule}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold uppercase text-xs tracking-wider shadow-lg shadow-red-600/20 transition-colors disabled:opacity-50"
                >
                  {isDeleting ? 'Excluindo...' : 'Excluir'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <TeachingAreaSelectorModal 
        isOpen={isSelectorOpen}
        classId={cls.id}
        onClose={() => setIsSelectorOpen(false)}
        onSelect={handleTeachingAreaSelection}
      />
    </div>
  );
};
