import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  OnlineCourse,
  CourseModule,
  CourseModuleGroup,
  CourseSection,
  CONTEST_STATUS_LABELS,
  CourseStructureModule
} from '../../../types/course';
import { Class } from '../../../types/class';
import { LiveEvent } from '../../../types/liveEvent';
import { GuidedStudyProgress } from '../../../types/guidedStudy';
import { courseService } from '../../../services/courseService';
import { classService } from '../../../services/classService';
import { classScheduleService } from '../../../services/classScheduleService';
import { guidedStudyService } from '../../../services/guidedStudyService';
import { getStudentConfig } from '../../../services/studentService';
import { liveEventService } from '../../../services/liveEventService';
import { StudentCourseModulesCatalog } from './StudentCourseModulesCatalog';
import { CoursePlayer } from './player/CoursePlayer';
import { useAuth } from '../../../contexts/AuthContext';
import {
  CheckCircle2,
  LayoutList,
  ListTree,
  PlayCircle,
  ArrowLeft,
  Radio,
  Video,
  Clock,
  Play,
  Calendar,
  PlaySquare,
  Lock,
  FileText,
  Loader2,
  Megaphone,
  CheckCircle,
  Target,
  BookOpen,
  GraduationCap
} from 'lucide-react';
import { StudentCourseEdital } from './edital/StudentCourseEdital';
import { CourseReviewDashboard } from './reviews/CourseReviewDashboard';
import { WelcomeVideoModal } from './WelcomeVideoModal';
import {
  subscribeToAnnouncementsByCourse,
  markAnnouncementAsRead
} from '../../../services/announcementService';
import { Announcement } from '../../../types/announcement';
import AnnouncementPopUp from '../AnnouncementPopUp';
import { StudentPresentialDailyGoals } from '../presential/StudentPresentialDailyGoals';
import { StudentClassSchedule } from '../presential/StudentClassSchedule';
import { StudentPedagogicalPlanning } from '../presential/StudentPedagogicalPlanning';
import { LinkedSimulatedView } from '../simulados/LinkedSimulatedView';
import {
  CourseStudentTabId,
  isNativeCourseTabHidden,
  isCoursePresentialTabShared,
  getCoursePresentialTabLabel,
  computeCoursePresentialPendingDailyCount
} from '../../../utils/courseNavigation';
import toast from 'react-hot-toast';

interface CourseDetailsProps {
  course: OnlineCourse;
  onBack: () => void;
  isInsidePlan?: boolean;
}

export function CourseDetails({ course, onBack, isInsidePlan = false }: CourseDetailsProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  // Mantém os metadados do curso sempre sincronizados com o Firestore
  const [effectiveCourse, setEffectiveCourse] = useState<OnlineCourse>(course);

  useEffect(() => {
    setEffectiveCourse(course);
  }, [course]);

  // Aba ativa do aluno (nativas + abas compartilhadas da turma presencial)
  const [activeTab, setActiveTab] = useState<CourseStudentTabId>('MODULES');
  const [courseAnnouncements, setCourseAnnouncements] = useState<Announcement[]>([]);
  const [activePopUpAnnouncement, setActivePopUpAnnouncement] = useState<Announcement | null>(null);
  const [focusTopicId, setFocusTopicId] = useState<string | null>(null);

  // Estrutura nativa do Curso Online
  const [modules, setModules] = useState<CourseModule[]>([]);
  const [moduleGroups, setModuleGroups] = useState<CourseModuleGroup[]>([]);
  const [sections, setSections] = useState<CourseSection[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [courseLiveEvents, setCourseLiveEvents] = useState<LiveEvent[]>([]);
  const [selectedModule, setSelectedModule] = useState<CourseModule | null>(null);

  // Recursos puxados da Turma Presencial Vinculada
  const [linkedClass, setLinkedClass] = useState<Class | null>(null);
  const [presentialTeachingClassId, setPresentialTeachingClassId] = useState<string>('');
  const [presentialModules, setPresentialModules] = useState<CourseModule[]>([]);
  const [presentialModuleGroups, setPresentialModuleGroups] = useState<CourseModuleGroup[]>([]);
  const [presentialSections, setPresentialSections] = useState<CourseSection[]>([]);
  const [selectedPresentialGroupId, setSelectedPresentialGroupId] = useState<string | null>(null);
  const [selectedPresentialModule, setSelectedPresentialModule] = useState<CourseModule | null>(null);
  const [presentialLiveEvents, setPresentialLiveEvents] = useState<LiveEvent[]>([]);
  const [presentialDailyBadgeCount, setPresentialDailyBadgeCount] = useState<number>(0);
  const [loadingPresential, setLoadingPresential] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(true);
  const [linkedCourseConfig, setLinkedCourseConfig] = useState<{
    courseId: string;
    tabName: string;
    visibleTabs: string[];
  } | null>(null);

  // Manutenção
  const isUserWhitelisted = effectiveCourse.maintenanceMode?.whitelistedUsers?.includes(
    currentUser?.email || ''
  );
  const isMaintenance = Boolean(effectiveCourse.maintenanceMode?.enabled && !isUserWhitelisted);
  const [showMaintenancePopup, setShowMaintenancePopup] = useState<boolean>(isMaintenance);

  // Progresso e Estrutura para "Continuar Estudos"
  const [structure, setStructure] = useState<CourseStructureModule[]>([]);
  const [detailedProgress, setDetailedProgress] = useState<Record<string, { completedAt: string }>>(
    {}
  );
  const [progress, setProgress] = useState<number>(0);
  const [isWelcomeModalOpen, setIsWelcomeModalOpen] = useState<boolean>(false);
  const [currentPlanId, setCurrentPlanId] = useState<string | undefined>(undefined);

  const refreshPresentialDailyBadge = useCallback(
    async (
      targetClassId?: string,
      masterId?: string,
      livesOverride?: LiveEvent[]
    ) => {
      const resolvedClassId = targetClassId || linkedClass?.id || effectiveCourse.linkedPresentialId;
      if (!resolvedClassId) return;

      try {
        const [initialEvents, initialMetas, prog] = await Promise.all([
          classScheduleService.getScheduleEventsByClass(resolvedClassId),
          guidedStudyService.getMetasByClass(resolvedClassId),
          currentUser?.uid
            ? guidedStudyService.getStudentProgress(currentUser.uid, resolvedClassId)
            : Promise.resolve({} as Record<string, GuidedStudyProgress>)
        ]);

        let eventsData = initialEvents;
        let metasData = initialMetas;
        const resolvedMasterId = masterId !== undefined ? masterId : linkedClass?.masterClassId;

        if (resolvedMasterId && (eventsData.length === 0 || metasData.length === 0)) {
          const [mEvents, mMetas] = await Promise.all([
            eventsData.length === 0
              ? classScheduleService.getScheduleEventsByClass(resolvedMasterId)
              : Promise.resolve([]),
            metasData.length === 0
              ? guidedStudyService.getMetasByClass(resolvedMasterId)
              : Promise.resolve([])
          ]);
          if (eventsData.length === 0 && mEvents.length > 0) eventsData = mEvents;
          if (metasData.length === 0 && mMetas.length > 0) metasData = mMetas;
        }

        const count = computeCoursePresentialPendingDailyCount(
          eventsData,
          metasData,
          livesOverride ?? presentialLiveEvents,
          prog
        );
        setPresentialDailyBadgeCount(count);
      } catch (err) {
        console.error('Erro ao atualizar contador de metas diárias presenciais no curso:', err);
      }
    },
    [
      linkedClass?.id,
      linkedClass?.masterClassId,
      effectiveCourse.linkedPresentialId,
      currentUser?.uid,
      presentialLiveEvents
    ]
  );

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      setLoading(true);
      try {
        // 0. Busca metadados atualizados do curso online (garante leitura imediata de hiddenTabs/linkedPresentialSharedTabs)
        const freshCourse = await courseService.getCourse(course.id);
        const resolvedCourse: OnlineCourse = freshCourse ? { ...course, ...freshCourse } : course;
        if (isMounted) {
          setEffectiveCourse(resolvedCourse);
        }

        // 1. Carrega Módulos, Blocos, Sessões, Estrutura e Eventos ao Vivo do Curso Online
        const [modulesData, groupsData, sectionsData, structureData, liveEventsData] =
          await Promise.all([
            courseService.getModules(course.id),
            courseService.getModuleGroups(course.id),
            courseService.getCourseSections(course.id),
            courseService.getCourseStructure(course.id),
            liveEventService.getLiveEventsByOnlineCourse(course.id)
          ]);

        if (!isMounted) return;
        setModules(modulesData);
        setModuleGroups(groupsData);
        setSections(sectionsData);
        setStructure(structureData);
        setCourseLiveEvents(liveEventsData);

        // 2. Carrega Turma Presencial Vinculada e seus Recursos (se houver)
        if (resolvedCourse.linkedPresentialId) {
          setLoadingPresential(true);
          try {
            const pClassId = resolvedCourse.linkedPresentialId;
            const classData = await classService.getClassById(pClassId);

            if (classData && isMounted) {
              let resolvedLives = await liveEventService.getLiveEventsByPresentialClass(pClassId);
              let resolvedSimulatedId = classData.linkedSimulatedId;
              let resolvedGuidedStudy = classData.isGuidedStudyEnabled;
              let resolvedTeachId = pClassId;

              if (classData.masterClassId) {
                const masterData = await classService.getClassById(classData.masterClassId);
                if (masterData) {
                  if (resolvedLives.length === 0) {
                    const masterLives = await liveEventService.getLiveEventsByPresentialClass(
                      classData.masterClassId
                    );
                    if (masterLives.length > 0) resolvedLives = masterLives;
                  }
                  if (!resolvedSimulatedId && masterData.linkedSimulatedId) {
                    resolvedSimulatedId = masterData.linkedSimulatedId;
                  }
                  if (masterData.isGuidedStudyEnabled && !resolvedGuidedStudy) {
                    resolvedGuidedStudy = true;
                  }
                  const ownMods = await courseService.getModules(pClassId);
                  if (ownMods.length === 0) {
                    const masterMods = await courseService.getModules(classData.masterClassId);
                    if (masterMods.length > 0) {
                      resolvedTeachId = classData.masterClassId;
                    }
                  }
                }
              }

              const enrichedClass: Class = {
                ...classData,
                linkedSimulatedId: resolvedSimulatedId,
                isGuidedStudyEnabled: resolvedGuidedStudy
              };

              const [pMods, pGroups, pSections] = await Promise.all([
                courseService.getModules(resolvedTeachId),
                courseService.getModuleGroups(resolvedTeachId),
                courseService.getCourseSections(resolvedTeachId)
              ]);

              let filteredMods = pMods || [];
              let filteredGroups = pGroups || [];
              let filteredSections = pSections || [];

              if (
                resolvedCourse.linkedPresentialModules &&
                resolvedCourse.linkedPresentialModules !== 'all'
              ) {
                const allowedSet = new Set(resolvedCourse.linkedPresentialModules);
                filteredMods = filteredMods.filter((m) => allowedSet.has(m.id));
                const activeGroupIds = new Set(
                  filteredMods.map((m) => m.groupId).filter((id): id is string => Boolean(id))
                );
                filteredGroups = filteredGroups.filter((g) => activeGroupIds.has(g.id));
                const activeSectionIds = new Set<string>([
                  ...filteredMods
                    .filter((m) => !m.groupId && m.sectionId)
                    .map((m) => m.sectionId as string),
                  ...filteredGroups
                    .filter((g) => g.sectionId)
                    .map((g) => g.sectionId as string)
                ]);
                filteredSections = filteredSections.filter((s) => activeSectionIds.has(s.id));
              }

              if (isMounted) {
                setLinkedClass(enrichedClass);
                setPresentialTeachingClassId(resolvedTeachId);
                setPresentialLiveEvents(resolvedLives);
                setPresentialModules(filteredMods);
                setPresentialModuleGroups(filteredGroups);
                setPresentialSections(filteredSections);
              }

              if (isCoursePresentialTabShared(resolvedCourse, 'dailyGoals')) {
                await refreshPresentialDailyBadge(
                  enrichedClass.id,
                  enrichedClass.masterClassId,
                  resolvedLives
                );
              }
            }
          } catch (error) {
            console.error('Erro ao carregar dados da turma presencial vinculada:', error);
          } finally {
            if (isMounted) setLoadingPresential(false);
          }
        } else {
          setLinkedClass(null);
          setPresentialModules([]);
          setPresentialModuleGroups([]);
          setPresentialSections([]);
          setPresentialLiveEvents([]);
          setPresentialDailyBadgeCount(0);
        }

        // 3. Calcula Progresso Geral e Config do Plano (quando embutido em Plano)
        if (currentUser) {
          const [completedLessons, detailed, stats, config] = await Promise.all([
            courseService.getCompletedLessons(currentUser.uid, course.id),
            courseService.getDetailedProgress(currentUser.uid, course.id),
            courseService.getCourseStats(course.id),
            getStudentConfig(currentUser.uid)
          ]);

          if (!isMounted) return;
          setDetailedProgress(detailed);
          setCurrentPlanId(config?.currentPlanId);

          if (isInsidePlan && config?.currentPlanId) {
            try {
              const { getPlanById } = await import('../../../services/planService');
              const planData = await getPlanById(config.currentPlanId);
              if (planData && planData.linkedCourses && isMounted) {
                const matchingConfig = planData.linkedCourses.find(
                  (lc) => lc.courseId === course.id
                );
                if (matchingConfig) {
                  setLinkedCourseConfig(matchingConfig);
                }
              }
            } catch (err) {
              console.error('Erro ao carregar config de abas do plano:', err);
            }
          }

          const total = stats.totalLessons;
          const completed = completedLessons.length;
          const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
          setProgress(percentage);
        }
      } catch (error) {
        console.error(error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();
    return () => {
      isMounted = false;
    };
  }, [course.id, currentUser, isInsidePlan]);

  // Monitorar comunicados do curso em tempo real e disparar popups obrigatórios
  useEffect(() => {
    if (!course?.id) return;
    const unsub = subscribeToAnnouncementsByCourse(course.id, (data) => {
      setCourseAnnouncements(data);
      if (currentUser?.uid) {
        const popup = data.find((a) => a.forcePopUp && !a.readBy?.includes(currentUser.uid));
        if (popup) {
          setActivePopUpAnnouncement(popup);
        }
      }
    });
    return () => unsub();
  }, [course.id, currentUser?.uid]);

  const unreadAnnouncementsCount = currentUser
    ? courseAnnouncements.filter((a) => !a.readBy?.includes(currentUser.uid)).length
    : 0;

  // Verifica se o Plano pai permite a aba (quando o curso está embutido dentro de um Plano)
  const isTabAllowedByParentPlan = useCallback(
    (tabId: CourseStudentTabId): boolean => {
      if (
        !isInsidePlan ||
        !linkedCourseConfig ||
        !Array.isArray(linkedCourseConfig.visibleTabs) ||
        linkedCourseConfig.visibleTabs.length === 0
      ) {
        return true;
      }
      if (tabId.startsWith('PRESENTIAL')) {
        return (
          linkedCourseConfig.visibleTabs.includes('PRESENTIAL') ||
          linkedCourseConfig.visibleTabs.includes(tabId)
        );
      }
      return linkedCourseConfig.visibleTabs.includes(tabId);
    },
    [isInsidePlan, linkedCourseConfig]
  );

  const isModulesTabVisible =
    !isNativeCourseTabHidden(effectiveCourse, 'MODULES') && isTabAllowedByParentPlan('MODULES');
  const isEditalTabVisible =
    !isNativeCourseTabHidden(effectiveCourse, 'EDITAL') && isTabAllowedByParentPlan('EDITAL');

  // Lista dinâmica e ordenada das abas disponíveis para o aluno neste curso
  const availableTabs = useMemo(() => {
    const list: Array<{
      id: CourseStudentTabId;
      label: string;
      icon: React.ComponentType<{ size?: number; className?: string }>;
      badge?: number;
      badgeTone?: 'amber' | 'red';
    }> = [];

    if (isModulesTabVisible) {
      list.push({ id: 'MODULES', label: 'Módulos do Curso', icon: LayoutList });
    }

    if (
      isCoursePresentialTabShared(effectiveCourse, 'dailyGoals') &&
      isTabAllowedByParentPlan('PRESENTIAL_DAILY_GOALS')
    ) {
      list.push({
        id: 'PRESENTIAL_DAILY_GOALS',
        label: getCoursePresentialTabLabel(effectiveCourse, 'dailyGoals'),
        icon: Target,
        badge: presentialDailyBadgeCount,
        badgeTone: 'amber'
      });
    }

    if (
      isCoursePresentialTabShared(effectiveCourse, 'schedule') &&
      isTabAllowedByParentPlan('PRESENTIAL_SCHEDULE')
    ) {
      list.push({
        id: 'PRESENTIAL_SCHEDULE',
        label: getCoursePresentialTabLabel(effectiveCourse, 'schedule'),
        icon: Calendar
      });
    }

    if (
      isCoursePresentialTabShared(effectiveCourse, 'planning') &&
      isTabAllowedByParentPlan('PRESENTIAL_PLANNING')
    ) {
      list.push({
        id: 'PRESENTIAL_PLANNING',
        label: getCoursePresentialTabLabel(effectiveCourse, 'planning'),
        icon: BookOpen
      });
    }

    if (isEditalTabVisible) {
      list.push({ id: 'EDITAL', label: 'Edital Verticalizado', icon: ListTree });
    }

    if (
      isCoursePresentialTabShared(effectiveCourse, 'teaching') &&
      isTabAllowedByParentPlan('PRESENTIAL')
    ) {
      list.push({
        id: 'PRESENTIAL',
        label: getCoursePresentialTabLabel(effectiveCourse, 'teaching'),
        icon: GraduationCap
      });
    }

    if (
      isCoursePresentialTabShared(effectiveCourse, 'simulados') &&
      isTabAllowedByParentPlan('PRESENTIAL_SIMULADOS')
    ) {
      list.push({
        id: 'PRESENTIAL_SIMULADOS',
        label: getCoursePresentialTabLabel(effectiveCourse, 'simulados'),
        icon: FileText
      });
    }

    if (
      courseLiveEvents.length > 0 &&
      !isNativeCourseTabHidden(effectiveCourse, 'LIVE') &&
      isTabAllowedByParentPlan('LIVE')
    ) {
      list.push({ id: 'LIVE', label: 'Eventos ao Vivo', icon: Radio });
    }

    if (
      isCoursePresentialTabShared(effectiveCourse, 'live') &&
      isTabAllowedByParentPlan('PRESENTIAL_LIVE')
    ) {
      list.push({
        id: 'PRESENTIAL_LIVE',
        label: getCoursePresentialTabLabel(effectiveCourse, 'live'),
        icon: Radio
      });
    }

    if (
      !isNativeCourseTabHidden(effectiveCourse, 'ANNOUNCEMENTS') &&
      isTabAllowedByParentPlan('ANNOUNCEMENTS')
    ) {
      list.push({
        id: 'ANNOUNCEMENTS',
        label: 'Avisos',
        icon: Megaphone,
        badge: unreadAnnouncementsCount,
        badgeTone: 'red'
      });
    }

    return list;
  }, [
    effectiveCourse,
    isModulesTabVisible,
    isEditalTabVisible,
    isTabAllowedByParentPlan,
    presentialDailyBadgeCount,
    courseLiveEvents.length,
    unreadAnnouncementsCount
  ]);

  // Garante seleção automática da primeira aba visível caso a aba atual tenha sido ocultada
  useEffect(() => {
    if (loading) return;
    if (availableTabs.length > 0 && !availableTabs.some((t) => t.id === activeTab)) {
      setActiveTab(availableTabs[0].id);
    }
  }, [loading, availableTabs, activeTab]);

  // Limpa parâmetros internos preservando ?tab=course_<id> caso esteja dentro de um Plano
  const updateCourseSearchParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams);
      Object.entries(updates).forEach(([k, v]) => {
        if (v === null || v === '') next.delete(k);
        else next.set(k, v);
      });
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  // Lógica para abrir módulo via URL
  useEffect(() => {
    const moduleId = searchParams.get('module');
    if (moduleId && modules.length > 0 && isModulesTabVisible) {
      const mod = modules.find((m) => m.id === moduleId);
      if (mod) {
        if (mod.groupId) setSelectedGroupId(mod.groupId);
        setSelectedModule(mod);
      }
    }
  }, [searchParams, modules, isModulesTabVisible]);

  // Navegação cruzada entre as abas presenciais compartilhadas (Metas de Hoje <-> Cronograma <-> Planejamento <-> Simulados <-> Ao Vivo)
  const canOpenPresentialSchedule = availableTabs.some((t) => t.id === 'PRESENTIAL_SCHEDULE');
  const canOpenPresentialPlanning = availableTabs.some((t) => t.id === 'PRESENTIAL_PLANNING');
  const canOpenPresentialSimulados =
    availableTabs.some((t) => t.id === 'PRESENTIAL_SIMULADOS') &&
    Boolean(linkedClass?.linkedSimulatedId);
  const canOpenAnyLive =
    availableTabs.some((t) => t.id === 'PRESENTIAL_LIVE') ||
    availableTabs.some((t) => t.id === 'LIVE');

  const handleSwitchFromPresentialWidget = useCallback(
    (targetId: string, queryParams?: Record<string, string>) => {
      const upper = targetId.toUpperCase();
      let nextTab: CourseStudentTabId | null = null;

      if (upper === 'SCHEDULE' && canOpenPresentialSchedule) {
        nextTab = 'PRESENTIAL_SCHEDULE';
      } else if (
        upper === 'DAILY_GOALS' &&
        availableTabs.some((t) => t.id === 'PRESENTIAL_DAILY_GOALS')
      ) {
        nextTab = 'PRESENTIAL_DAILY_GOALS';
      } else if (upper === 'PLANNING' && canOpenPresentialPlanning) {
        nextTab = 'PRESENTIAL_PLANNING';
      } else if (upper === 'TEACHING' && availableTabs.some((t) => t.id === 'PRESENTIAL')) {
        nextTab = 'PRESENTIAL';
      } else if (upper === 'SIMULADOS' && canOpenPresentialSimulados) {
        nextTab = 'PRESENTIAL_SIMULADOS';
      } else if (upper === 'LIVE') {
        if (availableTabs.some((t) => t.id === 'PRESENTIAL_LIVE')) {
          nextTab = 'PRESENTIAL_LIVE';
        } else if (availableTabs.some((t) => t.id === 'LIVE')) {
          nextTab = 'LIVE';
        }
      }

      if (!nextTab) return;
      setActiveTab(nextTab);
      setFocusTopicId(null);

      if (queryParams && Object.keys(queryParams).length > 0) {
        updateCourseSearchParams({
          subjectId: queryParams.subjectId || null,
          topicId: queryParams.topicId || null,
          moduleId: queryParams.moduleId || null
        });
      } else {
        updateCourseSearchParams({
          subjectId: null,
          topicId: null,
          moduleId: null
        });
      }
    },
    [
      availableTabs,
      canOpenPresentialSchedule,
      canOpenPresentialPlanning,
      canOpenPresentialSimulados,
      updateCourseSearchParams
    ]
  );

  const handleSelectCourseTab = (tabId: CourseStudentTabId) => {
    setActiveTab(tabId);
    setFocusTopicId(null);
    if (
      searchParams.has('subjectId') ||
      searchParams.has('topicId') ||
      searchParams.has('moduleId')
    ) {
      updateCourseSearchParams({
        subjectId: null,
        topicId: null,
        moduleId: null
      });
    }
  };

  // Handler para Navegação via Review
  const handleReviewNow = (_disciplineId: string, topicId: string) => {
    if (!isEditalTabVisible) return;
    setActiveTab('EDITAL');
    setFocusTopicId(topicId);
  };

  // Algoritmo de Busca Cronológica (Última Concluída + 1)
  const handleContinue = () => {
    if (!currentUser || structure.length === 0) return;

    const flatCurriculum: { moduleId: string; lessonId: string }[] = [];
    structure.forEach((mod) => {
      mod.folders.forEach((folder) => {
        folder.lessons.forEach((lesson) => {
          if (!lesson.isProduction) {
            flatCurriculum.push({ moduleId: mod.id, lessonId: lesson.id });
          }
        });
      });
      mod.looseLessons.forEach((lesson) => {
        if (!lesson.isProduction) {
          flatCurriculum.push({ moduleId: mod.id, lessonId: lesson.id });
        }
      });
    });

    if (flatCurriculum.length === 0) return;

    let mostRecentIndex = -1;
    let latestTimestamp = 0;

    for (let i = 0; i < flatCurriculum.length; i++) {
      const item = flatCurriculum[i];
      const prog = detailedProgress[item.lessonId];

      if (prog) {
        const itemDate = new Date(prog.completedAt).getTime();
        if (itemDate >= latestTimestamp) {
          latestTimestamp = itemDate;
          mostRecentIndex = i;
        }
      }
    }

    let targetItem = null;
    if (mostRecentIndex === -1) {
      targetItem = flatCurriculum[0];
    } else if (mostRecentIndex + 1 < flatCurriculum.length) {
      targetItem = flatCurriculum[mostRecentIndex + 1];
    } else {
      targetItem = flatCurriculum[mostRecentIndex];
    }

    if (targetItem) {
      updateCourseSearchParams({
        module: targetItem.moduleId,
        lesson: targetItem.lessonId
      });
    }
  };

  const renderLiveEventsGrid = (eventsList: LiveEvent[], emptyLabel: string) => {
    if (eventsList.length === 0) {
      return (
        <div className="p-10 text-center bg-zinc-900/40 rounded-2xl border border-zinc-800 text-zinc-400 text-sm">
          {emptyLabel}
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {eventsList.map((event) => (
          <div
            key={event.id}
            className="group bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden hover:border-[var(--plan-theme)]/50 transition-all duration-300 flex flex-col"
          >
            <div className="relative aspect-video overflow-hidden bg-zinc-800">
              {event.thumbnailUrl ? (
                <img
                  src={event.thumbnailUrl}
                  alt={event.title}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-600">
                  <Video size={48} />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60" />

              <div className="absolute top-4 left-4">
                {event.status === 'live' ? (
                  <div className="flex items-center gap-2 bg-[var(--plan-theme)] text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest animate-pulse shadow-[0_0_15px_rgba(var(--plan-theme-rgb),0.5)]">
                    <div className="w-1.5 h-1.5 bg-white rounded-full" />
                    Ao Vivo Agora
                  </div>
                ) : (
                  <div className="flex items-center gap-2 bg-zinc-800/90 backdrop-blur-md text-zinc-300 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-zinc-700">
                    <Clock size={10} />
                    {event.status === 'scheduled' ? 'Agendado' : 'Encerrado'}
                  </div>
                )}
              </div>
            </div>

            <div className="p-5 flex-1 flex flex-col gap-4">
              <div className="space-y-2">
                <h3 className="text-white font-black text-lg uppercase tracking-tight line-clamp-2 group-hover:text-[var(--plan-theme)] transition-colors">
                  {event.title}
                </h3>
                <div className="flex items-center gap-4 text-zinc-500 font-bold text-[10px] uppercase tracking-widest">
                  <div className="flex items-center gap-1.5">
                    <Calendar size={12} className="text-[var(--plan-theme)]" />
                    {event.eventDate.split('-').reverse().join('/')}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock size={12} />
                    {event.startTime}
                  </div>
                </div>
              </div>

              <button
                onClick={() => navigate(`/app/eventos-ao-vivo/sala/${event.id}`)}
                className={`w-full mt-auto flex items-center justify-center gap-2 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all duration-300 group/btn ${
                  event.status === 'live'
                    ? 'bg-[var(--plan-theme)] hover:brightness-110 text-white shadow-lg shadow-[var(--plan-theme)]/20'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-white'
                }`}
              >
                <Play size={14} fill="currentColor" className="group-hover/btn:scale-110 transition-transform" />
                {event.status === 'live' ? 'ACESSAR SALA DE TRANSMISSÃO' : 'VER DETALHES DO EVENTO'}
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (selectedModule || selectedPresentialModule) {
    const activeModule = selectedModule || selectedPresentialModule;
    const activeCourse = selectedModule
      ? effectiveCourse
      : ({
          id: presentialTeachingClassId || linkedClass?.id || effectiveCourse.linkedPresentialId || '',
          title: linkedClass?.name || 'Turma Presencial',
          coverUrl: linkedClass?.coverImage || '',
          bannerUrlDesktop: linkedClass?.bannerUrlDesktop || '',
          bannerUrlTablet: linkedClass?.bannerUrlTablet || '',
          bannerUrlMobile: linkedClass?.bannerUrlMobile || '',
          categoryId: linkedClass?.category || '',
          active: true,
          createdAt: linkedClass?.createdAt || new Date().toISOString(),
          updatedAt: linkedClass?.updatedAt || new Date().toISOString()
        } as OnlineCourse);

    return (
      <CoursePlayer
        course={activeCourse}
        module={activeModule!}
        onBack={() => {
          setSelectedModule(null);
          setSelectedPresentialModule(null);
          updateCourseSearchParams({
            module: null,
            lesson: null
          });
        }}
      />
    );
  }

  return (
    <div className="flex flex-col w-full animate-in fade-in pb-20 min-h-full">
      {/* HERO BANNER RESPONSIVO */}
      <div className="relative w-full mb-6 bg-zinc-900">
        <button
          onClick={onBack}
          className="absolute top-4 left-4 z-10 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors backdrop-blur-sm"
        >
          <ArrowLeft size={24} />
        </button>

        <picture>
          <source
            media="(min-width: 768px)"
            srcSet={effectiveCourse.bannerUrlDesktop || effectiveCourse.coverUrl}
          />
          <img
            src={effectiveCourse.bannerUrlMobile || effectiveCourse.coverUrl}
            alt={`Banner do curso ${effectiveCourse.title}`}
            className={`w-full h-48 md:h-[400px] object-cover border-b border-[var(--plan-theme)]/30 shadow-lg transition-all duration-700 ${
              isMaintenance ? 'grayscale opacity-50 contrast-125' : ''
            }`}
            referrerPolicy="no-referrer"
          />
        </picture>

        <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black to-transparent h-24 md:h-32 pointer-events-none" />
      </div>

      <div className="w-full px-6 md:px-8">
        {/* BARRA DE AÇÕES E PROGRESSO */}
        {(isModulesTabVisible ||
          Boolean(effectiveCourse.welcomeVideoUrl) ||
          (effectiveCourse.contestStatus && effectiveCourse.contestStatus !== 'SEM_PREVISAO')) && (
          <div className="mb-8">
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              {isModulesTabVisible && (
                <button
                  onClick={() => {
                    if (isMaintenance) {
                      toast.error(
                        effectiveCourse.maintenanceMode?.message ||
                          'O conteúdo do curso foi trancado para atualização.'
                      );
                      return;
                    }
                    handleContinue();
                  }}
                  className={`flex items-center justify-center gap-2 px-8 py-3 rounded-lg font-black text-sm uppercase transition-all shadow-[0_0_20px_rgba(255,255,255,0.3)] shrink-0 ${
                    isMaintenance
                      ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-50'
                      : 'bg-white hover:bg-gray-200 text-black hover:scale-105'
                  }`}
                >
                  <PlayCircle size={20} fill="currentColor" />
                  {progress > 0 ? 'CONTINUAR ESTUDOS' : 'INICIAR CURSO'}
                </button>
              )}

              {effectiveCourse.welcomeVideoUrl && (
                <button
                  onClick={() => setIsWelcomeModalOpen(true)}
                  className="flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white px-8 py-3 rounded-lg font-black text-sm uppercase transition-transform hover:scale-105 border border-zinc-700 shrink-0"
                >
                  <PlaySquare size={20} className="text-[var(--plan-theme)]" />
                  {effectiveCourse.welcomeButtonTitle || 'BOAS VINDAS'}
                </button>
              )}

              <div className="flex items-center gap-4 flex-wrap w-full md:w-auto">
                {effectiveCourse.contestStatus &&
                  effectiveCourse.contestStatus !== 'SEM_PREVISAO' && (
                    <div className="flex items-center gap-2 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-white font-bold text-xs uppercase shrink-0">
                      <CheckCircle2 size={16} className="text-green-500" />
                      <span className="text-gray-300">
                        {CONTEST_STATUS_LABELS[effectiveCourse.contestStatus]}
                        {effectiveCourse.contestStatus === 'BANCA_CONTRATADA' &&
                          effectiveCourse.examBoard && (
                            <span className="text-white ml-1">: {effectiveCourse.examBoard}</span>
                          )}
                      </span>
                    </div>
                  )}

                {isModulesTabVisible && (
                  <div className="flex-1 min-w-[200px] max-w-md flex items-center gap-4 bg-zinc-900 border border-zinc-800 rounded-lg p-3 px-4">
                    <span className="text-[10px] font-bold text-gray-400 uppercase hidden sm:block">
                      Progresso
                    </span>
                    <div className="flex-1 bg-black rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-[var(--plan-theme)] h-full rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="text-sm font-black text-white">{progress}%</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* DASHBOARD DE REVISÕES (VINCULADO AO EDITAL) */}
        {isEditalTabVisible && (
          <div className="mb-8">
            <CourseReviewDashboard courseId={effectiveCourse.id} onReviewNow={handleReviewNow} />
          </div>
        )}

        {/* SISTEMA DE ABAS DINÂMICO (NATIVAS + TURMA PRESENCIAL COMPARTILHADA) */}
        <div className="flex items-center gap-6 md:gap-8 border-b border-gray-800 mb-8 overflow-x-auto scrollbar-none whitespace-nowrap px-1">
          {availableTabs.map((tab) => {
            const IconComp = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleSelectCourseTab(tab.id)}
                className={`flex items-center gap-2 pb-4 px-1 border-b-2 font-black text-[10px] md:text-xs uppercase tracking-widest transition-all shrink-0 ${
                  isActive
                    ? 'border-[var(--plan-theme)] text-white'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <IconComp
                  size={16}
                  className={`md:w-[18px] md:h-[18px] ${
                    isActive ? 'text-[var(--plan-theme)]' : ''
                  }`}
                />
                <span>{tab.label}</span>
                {typeof tab.badge === 'number' && tab.badge > 0 && (
                  <span
                    className={`text-[9px] font-black px-1.5 py-0.5 rounded-full tabular-nums ${
                      tab.badgeTone === 'red'
                        ? 'bg-red-600 text-white animate-pulse'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/35'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* CONTEÚDO CONDICIONAL DA ABA ATIVA */}
        <div>
          {activeTab === 'MODULES' ? (
            loading ? (
              <div className="flex gap-4 overflow-hidden">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="w-60 h-[300px] bg-zinc-900 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : (
              <StudentCourseModulesCatalog
                modules={modules}
                moduleGroups={moduleGroups}
                sections={sections}
                selectedGroupId={selectedGroupId}
                onSelectGroup={setSelectedGroupId}
                onSelectModule={setSelectedModule}
                isMaintenance={isMaintenance}
                maintenanceMessage={effectiveCourse.maintenanceMode?.message}
                emptyMessage="Nenhum módulo ou bloco disponível neste curso."
              />
            )
          ) : activeTab === 'PRESENTIAL_DAILY_GOALS' ? (
            loadingPresential ? (
              <div className="flex items-center justify-center py-16 gap-3 text-zinc-400 text-xs font-bold uppercase tracking-widest">
                <Loader2 size={20} className="animate-spin text-[var(--plan-theme)]" />
                Carregando metas diárias da turma presencial...
              </div>
            ) : linkedClass ? (
              <StudentPresentialDailyGoals
                classId={linkedClass.id}
                masterClassId={linkedClass.masterClassId}
                linkedSimulatedId={linkedClass.linkedSimulatedId}
                liveEvents={presentialLiveEvents}
                onSwitchTab={handleSwitchFromPresentialWidget}
                onProgressUpdated={() => refreshPresentialDailyBadge()}
                canOpenSchedule={canOpenPresentialSchedule}
                canOpenPlanning={canOpenPresentialPlanning}
                canOpenSimuladosTab={canOpenPresentialSimulados}
                canOpenLiveTab={canOpenAnyLive}
              />
            ) : (
              <div className="p-8 text-center bg-zinc-900/40 border border-zinc-800 rounded-2xl text-zinc-400 text-sm">
                A turma presencial vinculada não foi encontrada.
              </div>
            )
          ) : activeTab === 'PRESENTIAL_SCHEDULE' ? (
            loadingPresential ? (
              <div className="flex items-center justify-center py-16 gap-3 text-zinc-400 text-xs font-bold uppercase tracking-widest">
                <Loader2 size={20} className="animate-spin text-[var(--plan-theme)]" />
                Carregando cronograma da turma presencial...
              </div>
            ) : linkedClass ? (
              <StudentClassSchedule
                classId={linkedClass.id}
                masterClassId={linkedClass.masterClassId}
                linkedSimulatedId={linkedClass.linkedSimulatedId}
                onSwitchTab={handleSwitchFromPresentialWidget}
                onProgressUpdated={() => refreshPresentialDailyBadge()}
                canOpenPlanning={canOpenPresentialPlanning}
                canOpenSimuladosTabOverride={canOpenPresentialSimulados}
              />
            ) : (
              <div className="p-8 text-center bg-zinc-900/40 border border-zinc-800 rounded-2xl text-zinc-400 text-sm">
                A turma presencial vinculada não foi encontrada.
              </div>
            )
          ) : activeTab === 'PRESENTIAL_PLANNING' ? (
            loadingPresential ? (
              <div className="flex items-center justify-center py-16 gap-3 text-zinc-400 text-xs font-bold uppercase tracking-widest">
                <Loader2 size={20} className="animate-spin text-[var(--plan-theme)]" />
                Carregando planejamento pedagógico...
              </div>
            ) : linkedClass ? (
              <StudentPedagogicalPlanning
                classId={linkedClass.id}
                masterClassId={linkedClass.masterClassId}
                totalMeetings={linkedClass.totalMeetings}
                subjectGroups={linkedClass.subjectGroups}
              />
            ) : (
              <div className="p-8 text-center bg-zinc-900/40 border border-zinc-800 rounded-2xl text-zinc-400 text-sm">
                A turma presencial vinculada não foi encontrada.
              </div>
            )
          ) : activeTab === 'EDITAL' ? (
            <StudentCourseEdital
              courseId={effectiveCourse.id}
              planId={currentPlanId}
              focusTopicId={focusTopicId}
              isMaintenance={isMaintenance}
              maintenanceMessage={effectiveCourse.maintenanceMode?.message}
            />
          ) : activeTab === 'PRESENTIAL' ? (
            loadingPresential ? (
              <div className="flex gap-4 overflow-hidden">
                {[1, 2].map((i) => (
                  <div key={i} className="w-60 h-[300px] bg-zinc-900 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : (
              <StudentCourseModulesCatalog
                modules={presentialModules}
                moduleGroups={presentialModuleGroups}
                sections={presentialSections}
                selectedGroupId={selectedPresentialGroupId}
                onSelectGroup={setSelectedPresentialGroupId}
                onSelectModule={setSelectedPresentialModule}
                isMaintenance={isMaintenance}
                maintenanceMessage={effectiveCourse.maintenanceMode?.message}
                emptyMessage="Nenhum módulo disponível no ambiente de ensino da turma presencial."
              />
            )
          ) : activeTab === 'PRESENTIAL_SIMULADOS' ? (
            loadingPresential ? (
              <div className="flex items-center justify-center py-16 gap-3 text-zinc-400 text-xs font-bold uppercase tracking-widest">
                <Loader2 size={20} className="animate-spin text-[var(--plan-theme)]" />
                Carregando simulados da turma presencial...
              </div>
            ) : linkedClass?.linkedSimulatedId ? (
              <LinkedSimulatedView simulatedId={linkedClass.linkedSimulatedId} />
            ) : (
              <div className="p-10 text-center bg-zinc-900/40 rounded-2xl border border-zinc-800 text-zinc-400 space-y-2">
                <FileText size={36} className="mx-auto text-zinc-600" />
                <p className="text-sm font-bold text-zinc-300 uppercase">
                  Nenhuma turma de simulados vinculada à turma presencial referenciada.
                </p>
              </div>
            )
          ) : activeTab === 'PRESENTIAL_LIVE' ? (
            renderLiveEventsGrid(
              presentialLiveEvents,
              'Nenhum evento ao vivo programado para a turma presencial vinculada.'
            )
          ) : activeTab === 'ANNOUNCEMENTS' ? (
            <div className="space-y-4 max-w-4xl animate-in fade-in duration-300">
              {courseAnnouncements.length === 0 ? (
                <div className="p-8 text-center bg-zinc-900/50 border border-zinc-800 rounded-2xl">
                  <Megaphone className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                  <p className="text-zinc-400 text-sm font-bold uppercase tracking-tight">
                    Nenhum comunicado até o momento
                  </p>
                  <p className="text-zinc-600 text-xs mt-1 font-medium">
                    Os avisos enviados pela coordenação deste curso aparecerão aqui.
                  </p>
                </div>
              ) : (
                courseAnnouncements.map((ann) => {
                  const isRead = currentUser ? ann.readBy?.includes(currentUser.uid) : false;
                  return (
                    <div
                      key={ann.id}
                      className="bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-6 space-y-3 transition-all"
                    >
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-2">
                          {ann.forcePopUp ? (
                            <span className="bg-amber-500/10 text-amber-500 text-[9px] font-black uppercase px-2 py-0.5 rounded border border-amber-500/20">
                              Pop-up
                            </span>
                          ) : (
                            <span className="bg-zinc-800 text-zinc-400 text-[9px] font-black uppercase px-2 py-0.5 rounded">
                              Comunicado
                            </span>
                          )}
                          <span className="text-[11px] font-medium text-zinc-500">
                            {new Date(ann.createdAt).toLocaleDateString('pt-BR')} às{' '}
                            {new Date(ann.createdAt).toLocaleTimeString('pt-BR', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>

                        {currentUser &&
                          (isRead ? (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                              <CheckCircle size={12} /> Lido
                            </span>
                          ) : (
                            <button
                              onClick={() => markAnnouncementAsRead(ann.id, currentUser.uid)}
                              className="text-[10px] font-bold text-white bg-red-600 hover:bg-red-700 px-3 py-1 rounded-lg uppercase tracking-wider transition-colors shadow-sm"
                            >
                              Marcar como lido
                            </button>
                          ))}
                      </div>

                      <h3 className="text-lg font-black text-white uppercase tracking-tight">
                        {ann.title}
                      </h3>
                      <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap font-medium">
                        {ann.content}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            renderLiveEventsGrid(
              courseLiveEvents,
              'Nenhum evento ao vivo programado para este curso no momento.'
            )
          )}
        </div>
      </div>

      {/* MODAL DE VÍDEO DE BOAS-VINDAS */}
      {effectiveCourse.welcomeVideoUrl && (
        <WelcomeVideoModal
          isOpen={isWelcomeModalOpen}
          onClose={() => setIsWelcomeModalOpen(false)}
          videoUrl={effectiveCourse.welcomeVideoUrl}
          title={effectiveCourse.welcomeButtonTitle || 'BOAS VINDAS'}
        />
      )}

      {/* POPUP DE MANUTENÇÃO */}
      {showMaintenancePopup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-zinc-900 border border-orange-500/30 rounded-3xl p-8 max-w-md w-full shadow-[0_0_50px_rgba(249,115,22,0.15)] text-center relative overflow-hidden group">
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-orange-500/10 rounded-full blur-[60px]" />
            <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-orange-500/10 rounded-full blur-[60px]" />

            <div className="relative space-y-6">
              <div className="inline-flex p-5 bg-orange-500/10 rounded-full text-orange-500 mb-2">
                <Lock size={40} strokeWidth={2.5} />
              </div>

              <div className="space-y-3">
                <h2 className="text-2xl font-black text-white uppercase tracking-tight">
                  Portal em <span className="text-orange-500">Manutenção</span>
                </h2>
                <p className="text-zinc-400 text-sm leading-relaxed font-medium">
                  {effectiveCourse.maintenanceMode?.message ||
                    'O conteúdo deste curso está sendo atualizado para garantir a melhor experiência de estudo para você.'}
                </p>
              </div>

              {effectiveCourse.maintenanceMode?.endDate && (
                <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 inline-block w-full">
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">
                    Previsão de Retorno
                  </p>
                  <p className="text-xl font-black text-white uppercase tracking-tight">
                    {new Date(
                      effectiveCourse.maintenanceMode.endDate + 'T12:00:00'
                    ).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </p>
                </div>
              )}

              <button
                onClick={() => setShowMaintenancePopup(false)}
                className="w-full bg-white hover:bg-zinc-200 text-black py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg"
              >
                Entendi, vou aguardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP DE COMUNICADO OBRIGATÓRIO DO CURSO */}
      {activePopUpAnnouncement && currentUser && (
        <AnnouncementPopUp
          announcement={activePopUpAnnouncement}
          userId={currentUser.uid}
          onClose={() => setActivePopUpAnnouncement(null)}
        />
      )}
    </div>
  );
}
