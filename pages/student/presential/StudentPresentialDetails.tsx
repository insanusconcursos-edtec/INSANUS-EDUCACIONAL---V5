import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { classService } from '../../../services/classService';
import { courseService } from '../../../services/courseService';
import { classScheduleService } from '../../../services/classScheduleService';
import { curriculumService } from '../../../services/curriculumService';
import { guidedStudyService } from '../../../services/guidedStudyService';
import { Class } from '../../../types/class';
import { OnlineCourse, CourseModule, CourseModuleGroup, CourseSection } from '../../../types/course';
import { ClassScheduleEvent } from '../../../types/schedule';
import { GuidedStudyMeta, GuidedStudyProgress } from '../../../types/guidedStudy';
import { ArrowLeft, Calendar, GraduationCap, BookOpen, ChevronDown, Radio, Video, Clock, Play, FileText, ListTree, Target } from 'lucide-react';
import { StudentClassSchedule } from '../../../components/student/presential/StudentClassSchedule';
import { StudentPresentialDailyGoals } from '../../../components/student/presential/StudentPresentialDailyGoals';
import { StudentCourseModulesCatalog } from '../../../components/student/courses/StudentCourseModulesCatalog';
import { CoursePlayer } from '../../../components/student/courses/player/CoursePlayer';
import { StudentPedagogicalPlanning } from '../../../components/student/presential/StudentPedagogicalPlanning';
import { ConcursoStatusBanner } from '../../../components/student/presential/ConcursoStatusBanner';
import { liveEventService } from '../../../services/liveEventService';
import { LiveEvent } from '../../../types/liveEvent';
import { LinkedSimulatedView } from '../../../components/student/simulados/LinkedSimulatedView';
import { useStudyContext } from '../../../contexts/StudyContext';
import { useAuth } from '../../../contexts/AuthContext';
import { StudentCourseEdital } from '../../../components/student/courses/edital/StudentCourseEdital';
import { CourseReviewDashboard } from '../../../components/student/courses/reviews/CourseReviewDashboard';
import { toLocalISODate } from '../../../utils/dateUtils';

const computePendingDailyItemsCount = (
  events: ClassScheduleEvent[],
  metas: GuidedStudyMeta[],
  liveEvents: LiveEvent[],
  progressMap: Record<string, GuidedStudyProgress>
): number => {
  const todayStr = toLocalISODate();
  const pendingMetas = metas.filter((m) => m.date <= todayStr && !progressMap[m.id || '']?.completed).length;
  const todaysEvents = events.filter(
    (ev) => ev.date === todayStr && ev.status !== 'CANCELED' && ev.status !== 'COMPLETED'
  );
  const linkedLiveIds = new Set(
    todaysEvents.map((ev) => ev.liveEventId).filter((id): id is string => Boolean(id))
  );
  const standaloneTodaysLives = liveEvents.filter(
    (le) => le.eventDate === todayStr && le.status !== 'ended' && !linkedLiveIds.has(le.id)
  );
  return pendingMetas + todaysEvents.length + standaloneTodaysLives.length;
};

export const StudentPresentialDetails: React.FC = () => {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { setCurrentProduct } = useStudyContext();
  const moduleIdParam = searchParams.get('module');
  
  const { currentUser } = useAuth();
  const [currentClass, setCurrentClass] = useState<Class | null>(null);
  const [activeTab, setActiveTab] = useState<
    'TEACHING' | 'DAILY_GOALS' | 'SCHEDULE' | 'PLANNING' | 'LIVE' | 'SIMULADOS' | 
    'LINKED_COURSE' | 'LINKED_COURSE_MODULES' | 'LINKED_COURSE_EDITAL' | 'LINKED_COURSE_LIVE'
  >('TEACHING');
  const [loading, setLoading] = useState(true);
  const [classLiveEvents, setClassLiveEvents] = useState<LiveEvent[]>([]);
  const [focusTopicId, setFocusTopicId] = useState<string | null>(null);

  // Handler para Navegação via Review
  const handleReviewNow = (disciplineId: string, topicId: string) => {
      setActiveTab('LINKED_COURSE_EDITAL');
      setFocusTopicId(topicId);
  };
  
  // Linked Course State
  const [linkedCourse, setLinkedCourse] = useState<OnlineCourse | null>(null);
  const [linkedCourseModules, setLinkedCourseModules] = useState<CourseModule[]>([]);
  const [linkedCourseModuleGroups, setLinkedCourseModuleGroups] = useState<CourseModuleGroup[]>([]);
  const [linkedCourseSections, setLinkedCourseSections] = useState<CourseSection[]>([]);
  const [linkedCourseLiveEvents, setLinkedCourseLiveEvents] = useState<LiveEvent[]>([]);
  const [loadingLinkedCourse, setLoadingLinkedCourse] = useState(false);
  const [selectedLinkedModule, setSelectedLinkedModule] = useState<CourseModule | null>(null);
  const [selectedLinkedGroupId, setSelectedLinkedGroupId] = useState<string | null>(null);

  // Update current product for support
  useEffect(() => {
    if (currentClass) {
      setCurrentProduct({
        type: 'turma_presencial',
        id: currentClass.id,
        name: currentClass.name
      });
    }
    return () => {
      setCurrentProduct(null);
    };
  }, [currentClass, setCurrentProduct]);
  
  // Tab availability flags
  const [hasModules, setHasModules] = useState(false);
  const [hasSchedule, setHasSchedule] = useState(false);
  const [hasGuidedMetas, setHasGuidedMetas] = useState(false);
  const [hasPlanning, setHasPlanning] = useState(false);
  const [dailyBadgeCount, setDailyBadgeCount] = useState(0);
  
  // Teaching Tab State
  const [modules, setModules] = useState<CourseModule[]>([]);
  const [teachingModuleGroups, setTeachingModuleGroups] = useState<CourseModuleGroup[]>([]);
  const [teachingSections, setTeachingSections] = useState<CourseSection[]>([]);
  const [selectedModule, setSelectedModule] = useState<CourseModule | null>(null);
  const [selectedTeachingGroupId, setSelectedTeachingGroupId] = useState<string | null>(null);
  const [loadingModules, setLoadingModules] = useState(false);
  const [teachingClassId, setTeachingClassId] = useState<string>(classId || '');

  const handleSwitchTab = useCallback(
    (tabId: string, queryParams?: Record<string, string>) => {
      setActiveTab(tabId as any);
      if (queryParams && Object.keys(queryParams).length > 0) {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set('tab', tabId);
        Object.entries(queryParams).forEach(([k, v]) => {
          if (v) nextParams.set(k, v);
          else nextParams.delete(k);
        });
        setSearchParams(nextParams, { replace: true });
      } else if (
        searchParams.has('tab') ||
        searchParams.has('subjectId') ||
        searchParams.has('topicId') ||
        searchParams.has('moduleId')
      ) {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('tab');
        nextParams.delete('subjectId');
        nextParams.delete('topicId');
        nextParams.delete('moduleId');
        setSearchParams(nextParams, { replace: true });
      }
    },
    [searchParams, setSearchParams]
  );

  const refreshDailyBadge = useCallback(async () => {
    if (!classId) return;
    try {
      const [initialEvents, initialMetas, prog] = await Promise.all([
        classScheduleService.getScheduleEventsByClass(classId),
        guidedStudyService.getMetasByClass(classId),
        currentUser?.uid
          ? guidedStudyService.getStudentProgress(currentUser.uid, classId)
          : Promise.resolve({} as Record<string, GuidedStudyProgress>)
      ]);

      let eventsData = initialEvents;
      let metasData = initialMetas;
      const masterId = currentClass?.masterClassId;

      if (masterId && (eventsData.length === 0 || metasData.length === 0)) {
        const [mEvents, mMetas] = await Promise.all([
          eventsData.length === 0 ? classScheduleService.getScheduleEventsByClass(masterId) : Promise.resolve([]),
          metasData.length === 0 ? guidedStudyService.getMetasByClass(masterId) : Promise.resolve([])
        ]);
        if (eventsData.length === 0 && mEvents.length > 0) eventsData = mEvents;
        if (metasData.length === 0 && mMetas.length > 0) metasData = mMetas;
      }

      setDailyBadgeCount(computePendingDailyItemsCount(eventsData, metasData, classLiveEvents, prog));
    } catch (err) {
      console.error('Error refreshing daily goals badge:', err);
    }
  }, [classId, currentClass?.masterClassId, currentUser?.uid, classLiveEvents]);

  const tabs = React.useMemo(() => {
    const showDailyAndSchedule =
      hasSchedule || hasGuidedMetas || Boolean(currentClass?.isGuidedStudyEnabled);

    const list: Array<{
      id: string;
      label: string;
      icon: React.ComponentType<{ size?: number; className?: string }>;
      show: boolean;
      badge?: number;
    }> = [
      { id: 'TEACHING', label: 'ÁREA DE ENSINO', icon: GraduationCap, show: hasModules },
      { id: 'DAILY_GOALS', label: 'METAS DE HOJE', icon: Target, show: showDailyAndSchedule, badge: dailyBadgeCount },
      { id: 'SCHEDULE', label: 'CRONOGRAMA', icon: Calendar, show: showDailyAndSchedule },
      { id: 'PLANNING', label: 'PLANEJAMENTO PEDAGÓGICO', icon: BookOpen, show: hasPlanning },
      { id: 'LIVE', label: '🔴 EVENTOS AO VIVO', icon: Radio, show: classLiveEvents.length > 0 },
      { id: 'SIMULADOS', label: 'SIMULADOS', icon: FileText, show: !!currentClass?.linkedSimulatedId },
    ];

    if (currentClass?.linkedCourseId) {
      const sharedTabs = currentClass.linkedCourseSharedTabs;
      if (!sharedTabs) {
        // Backwards compatibility fallback
        list.push({
          id: 'LINKED_COURSE_MODULES',
          label: (currentClass.linkedCourseTabLabel || 'CURSO ONLINE').toUpperCase(),
          icon: Video,
          show: true
        });
      } else {
        if (sharedTabs.modules?.enabled !== false) {
          list.push({
            id: 'LINKED_COURSE_MODULES',
            label: (sharedTabs.modules?.label || currentClass.linkedCourseTabLabel || 'MÓDULOS DO CURSO').toUpperCase(),
            icon: Video,
            show: true
          });
        }
        if (sharedTabs.edital?.enabled) {
          list.push({
            id: 'LINKED_COURSE_EDITAL',
            label: (sharedTabs.edital?.label || 'EDITAL VERTICALIZADO').toUpperCase(),
            icon: ListTree,
            show: true
          });
        }
        if (sharedTabs.live?.enabled) {
          list.push({
            id: 'LINKED_COURSE_LIVE',
            label: (sharedTabs.live?.label || 'EVENTOS AO VIVO').toUpperCase(),
            icon: Radio,
            show: true
          });
        }
      }
    }

    return list.filter(tab => tab.show);
  }, [hasModules, hasSchedule, hasGuidedMetas, dailyBadgeCount, hasPlanning, classLiveEvents, currentClass]);

  useEffect(() => {
    const fetchClass = async () => {
      if (classId) {
        try {
          const data = await classService.getClassById(classId);
          if (data) {
            // Check content availability for current class
            const [
              initialModulesData,
              initialEventsData,
              initialSubjectsData,
              initialLiveEventsData,
              initialGuidedMetasData,
              studentProgressData
            ] = await Promise.all([
              courseService.getModules(classId),
              classScheduleService.getScheduleEventsByClass(classId),
              curriculumService.getSubjectsByClass(classId),
              liveEventService.getLiveEventsByPresentialClass(classId),
              guidedStudyService.getMetasByClass(classId),
              currentUser?.uid
                ? guidedStudyService.getStudentProgress(currentUser.uid, classId)
                : Promise.resolve({} as Record<string, GuidedStudyProgress>)
            ]);

            let modulesData = initialModulesData;
            let eventsData = initialEventsData;
            let subjectsData = initialSubjectsData;
            let liveEventsData = initialLiveEventsData;
            let guidedMetasData = initialGuidedMetasData;

            let tId = classId;
            let currentLinkedSimulatedId = data.linkedSimulatedId;
            let currentLinkedCourseId = data.linkedCourseId;
            let currentLinkedCourseTabLabel = data.linkedCourseTabLabel;
            let currentLinkedCourseSharedTabs = data.linkedCourseSharedTabs;
            let currentIsGuidedStudyEnabled = data.isGuidedStudyEnabled;

            // Inheritance Logic: Fallback to master class if child is empty
            if (data.masterClassId) {
              const needsModules = modulesData.length === 0;
              const needsEvents = eventsData.length === 0;
              const needsSubjects = subjectsData.length === 0;
              const needsLiveEvents = liveEventsData.length === 0;
              const needsGuidedMetas = guidedMetasData.length === 0;
              const needsSimulated = !currentLinkedSimulatedId;
              const needsLinkedCourse = !currentLinkedCourseId;

              if (
                needsModules ||
                needsEvents ||
                needsSubjects ||
                needsLiveEvents ||
                needsGuidedMetas ||
                needsSimulated ||
                needsLinkedCourse
              ) {
                const masterData = await classService.getClassById(data.masterClassId);
                if (masterData) {
                  const [
                    masterModules,
                    masterEvents,
                    masterSubjects,
                    masterLiveEvents,
                    masterGuidedMetas
                  ] = await Promise.all([
                    needsModules ? courseService.getModules(data.masterClassId) : Promise.resolve([]),
                    needsEvents ? classScheduleService.getScheduleEventsByClass(data.masterClassId) : Promise.resolve([]),
                    needsSubjects ? curriculumService.getSubjectsByClass(data.masterClassId) : Promise.resolve([]),
                    needsLiveEvents ? liveEventService.getLiveEventsByPresentialClass(data.masterClassId) : Promise.resolve([]),
                    needsGuidedMetas ? guidedStudyService.getMetasByClass(data.masterClassId) : Promise.resolve([])
                  ]);

                  if (needsModules && masterModules.length > 0) {
                    modulesData = masterModules;
                    tId = data.masterClassId;
                  }
                  if (needsEvents && masterEvents.length > 0) {
                    eventsData = masterEvents;
                  }
                  if (needsSubjects && masterSubjects.length > 0) {
                    subjectsData = masterSubjects;
                  }
                  if (needsLiveEvents && masterLiveEvents.length > 0) {
                    liveEventsData = masterLiveEvents;
                  }
                  if (needsGuidedMetas && masterGuidedMetas.length > 0) {
                    guidedMetasData = masterGuidedMetas;
                  }
                  if (masterData.isGuidedStudyEnabled && !currentIsGuidedStudyEnabled) {
                    currentIsGuidedStudyEnabled = true;
                  }

                  // Simulateds inheritance
                  if (needsSimulated && masterData.linkedSimulatedId) {
                    currentLinkedSimulatedId = masterData.linkedSimulatedId;
                  }

                  // Linked Course inheritance
                  if (needsLinkedCourse && masterData.linkedCourseId) {
                    currentLinkedCourseId = masterData.linkedCourseId;
                    currentLinkedCourseTabLabel = masterData.linkedCourseTabLabel;
                    currentLinkedCourseSharedTabs = masterData.linkedCourseSharedTabs;
                  }
                }
              }
            }

            // Update state with (potentially inherited) values
            const updatedClass = {
              ...data,
              isGuidedStudyEnabled: currentIsGuidedStudyEnabled,
              linkedSimulatedId: currentLinkedSimulatedId,
              linkedCourseId: currentLinkedCourseId,
              linkedCourseTabLabel: currentLinkedCourseTabLabel,
              linkedCourseSharedTabs: currentLinkedCourseSharedTabs
            };

            setCurrentClass(updatedClass);
            setTeachingClassId(tId);
            setModules(modulesData);
            setClassLiveEvents(liveEventsData);
            
            setHasModules(modulesData.length > 0);
            setHasSchedule(eventsData.length > 0);
            setHasGuidedMetas(guidedMetasData.length > 0);
            setHasPlanning(subjectsData.length > 0);
            setDailyBadgeCount(
              computePendingDailyItemsCount(eventsData, guidedMetasData, liveEventsData, studentProgressData)
            );

            // Fetch Linked Course if exists (including Blocks / ModuleGroups and Thematic Sections)
            if (currentLinkedCourseId) {
              setLoadingLinkedCourse(true);
              setSelectedLinkedGroupId(null);
              try {
                const [lCourse, lModules, lGroups, lSections, lLiveEvents] = await Promise.all([
                  courseService.getCourse(currentLinkedCourseId),
                  courseService.getModules(currentLinkedCourseId),
                  courseService.getModuleGroups(currentLinkedCourseId),
                  courseService.getCourseSections(currentLinkedCourseId),
                  liveEventService.getLiveEventsByOnlineCourse(currentLinkedCourseId)
                ]);
                setLinkedCourse(lCourse);
                setLinkedCourseModules(lModules);
                setLinkedCourseModuleGroups(lGroups || []);
                setLinkedCourseSections(lSections || []);
                setLinkedCourseLiveEvents(lLiveEvents || []);
              } catch (err) {
                console.error("Error fetching linked course:", err);
              } finally {
                setLoadingLinkedCourse(false);
              }
            }

            // Adjust active tab if current one is hidden
            const hModules = modulesData.length > 0;
            const hDailyAndSchedule =
              eventsData.length > 0 || guidedMetasData.length > 0 || Boolean(currentIsGuidedStudyEnabled);
            const hPlanning = subjectsData.length > 0;
            const hLive = liveEventsData.length > 0;
            const hSimulated = !!currentLinkedSimulatedId;

            const availableIds = [
              ...(hModules ? ['TEACHING'] : []),
              ...(hDailyAndSchedule ? ['DAILY_GOALS', 'SCHEDULE'] : []),
              ...(hPlanning ? ['PLANNING'] : []),
              ...(hLive ? ['LIVE'] : []),
              ...(hSimulated ? ['SIMULADOS'] : []),
            ];

            if (currentLinkedCourseId) {
              const sharedTabs = updatedClass.linkedCourseSharedTabs;
              if (!sharedTabs) {
                availableIds.push('LINKED_COURSE_MODULES');
              } else {
                if (sharedTabs.modules?.enabled !== false) {
                  availableIds.push('LINKED_COURSE_MODULES');
                }
                if (sharedTabs.edital?.enabled) {
                  availableIds.push('LINKED_COURSE_EDITAL');
                }
                if (sharedTabs.live?.enabled) {
                  availableIds.push('LINKED_COURSE_LIVE');
                }
              }
            }

            if (availableIds.length > 0 && !availableIds.includes(activeTab)) {
              setActiveTab(availableIds[0] as any);
            }
          }
        } catch (error) {
          console.error("Error fetching class:", error);
        } finally {
          setLoading(false);
        }
      }
    };

    fetchClass();
  }, [classId, currentUser?.uid]);

  useEffect(() => {
    const fetchModules = async () => {
      if (activeTab === 'TEACHING' && teachingClassId) {
        setLoadingModules(true);
        try {
          const [modsData, groupsData, sectionsData] = await Promise.all([
            courseService.getModules(teachingClassId),
            courseService.getModuleGroups(teachingClassId),
            courseService.getCourseSections(teachingClassId)
          ]);
          setModules(modsData);
          setTeachingModuleGroups(groupsData || []);
          setTeachingSections(sectionsData || []);
        } catch (error) {
          console.error("Error fetching modules:", error);
        } finally {
          setLoadingModules(false);
        }
      }
    };

    fetchModules();
  }, [activeTab, teachingClassId]);

  // Deep Linking: Switch to requested tab if tab param is present
  useEffect(() => {
    const tabParam = searchParams.get('tab')?.toUpperCase();
    if (tabParam === 'DAILY_GOALS') {
      setActiveTab('DAILY_GOALS');
    } else if (tabParam === 'SCHEDULE') {
      setActiveTab('SCHEDULE');
    } else if (tabParam === 'PLANNING') {
      setActiveTab('PLANNING');
    } else if (tabParam === 'SIMULADOS') {
      setActiveTab('SIMULADOS');
    } else if (tabParam === 'LIVE') {
      setActiveTab('LIVE');
    }
  }, [searchParams]);

  // Deep Linking: Auto-select module (either in Teaching or in Linked Course, including its Block) when loaded
  useEffect(() => {
    if (!moduleIdParam) return;

    const teachingMod = modules.find((m) => m.id === moduleIdParam);
    if (teachingMod) {
      if (activeTab !== 'TEACHING') setActiveTab('TEACHING');
      if (teachingMod.groupId) setSelectedTeachingGroupId(teachingMod.groupId);
      if (!selectedModule || selectedModule.id !== teachingMod.id) {
        setSelectedModule(teachingMod);
      }
      return;
    }

    const linkedMod = linkedCourseModules.find((m) => m.id === moduleIdParam);
    if (linkedMod) {
      if (activeTab !== 'LINKED_COURSE_MODULES' && activeTab !== 'LINKED_COURSE') {
        setActiveTab('LINKED_COURSE_MODULES');
      }
      if (linkedMod.groupId) setSelectedLinkedGroupId(linkedMod.groupId);
      if (!selectedLinkedModule || selectedLinkedModule.id !== linkedMod.id) {
        setSelectedLinkedModule(linkedMod);
      }
    }
  }, [moduleIdParam, modules, linkedCourseModules, activeTab, selectedModule, selectedLinkedModule]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  if (!currentClass) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 text-white">
        <h2 className="text-2xl font-bold mb-4">Turma não encontrada</h2>
        <button 
          onClick={() => navigate('/app/presential')}
          className="px-4 py-2 bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
        >
          Voltar para Turmas
        </button>
      </div>
    );
  }

  // Adapter to use CoursePlayer with Class data
  const fakeCourse: OnlineCourse = {
    id: teachingClassId,
    title: currentClass.name,
    coverUrl: currentClass.coverImage,
    bannerUrlDesktop: currentClass.bannerUrlDesktop,
    bannerUrlTablet: currentClass.bannerUrlTablet,
    bannerUrlMobile: currentClass.bannerUrlMobile,
    categoryId: currentClass.category,
    subcategoryId: currentClass.subcategory,
    organization: currentClass.organization,
    createdAt: currentClass.createdAt || new Date().toISOString(),
    updatedAt: currentClass.updatedAt || new Date().toISOString(),
    active: true
  };

  const isLinkedCourseMaintenance = Boolean(
    linkedCourse?.maintenanceMode?.enabled &&
      !linkedCourse?.maintenanceMode?.whitelistedUsers?.includes(currentUser?.email || '')
  );

  const clearModuleSearchParams = () => {
    if (searchParams.has('module') || searchParams.has('lesson')) {
      const next = new URLSearchParams(searchParams);
      next.delete('module');
      next.delete('lesson');
      setSearchParams(next, { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-black text-gray-100 pb-20">
      {/* --- BANNER RESPONSIVO --- */}
      <div className="relative w-full bg-zinc-900">
        <button 
          onClick={() => navigate('/app/presential')}
          className="absolute top-4 left-4 z-10 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors backdrop-blur-sm"
        >
          <ArrowLeft size={24} />
        </button>
        
        <picture>
          <source 
            media="(min-width: 1024px)" 
            srcSet={currentClass.bannerUrlDesktop || currentClass.coverImage} 
          />
          <source 
            media="(min-width: 768px)" 
            srcSet={currentClass.bannerUrlTablet || currentClass.bannerUrlDesktop || currentClass.coverImage} 
          />
          <img 
            src={currentClass.bannerUrlMobile || currentClass.coverImage} 
            alt={`Banner da turma ${currentClass.name}`} 
            className="w-full h-48 md:h-[400px] object-cover border-b border-red-600/30 shadow-lg"
            referrerPolicy="no-referrer"
          />
        </picture>
        
        <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black to-transparent h-24 md:h-32 pointer-events-none"></div>
      </div>

      <div className="max-w-7xl mx-auto px-4 pt-6">
        <ConcursoStatusBanner classData={currentClass} />
      </div>

      {/* --- NAVEGAÇÃO DE ABAS --- */}
      <div className="sticky top-0 z-20 bg-black/95 backdrop-blur-md border-b border-zinc-800 shadow-md">
        <div className="max-w-7xl mx-auto px-4">
          {/* Desktop Tabs Navigation */}
          <div className="hidden md:flex items-center space-x-6 overflow-x-auto no-scrollbar py-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleSwitchTab(tab.id)}
                className={`flex items-center space-x-2 px-4 py-3 text-base font-medium transition-colors whitespace-nowrap border-b-2 ${
                  activeTab === tab.id 
                    ? 'border-red-600 text-red-600' 
                    : 'border-transparent text-zinc-400 hover:text-white hover:border-zinc-700'
                }`}
              >
                <tab.icon size={18} />
                <span>{tab.label}</span>
                {typeof tab.badge === 'number' && tab.badge > 0 && (
                  <span
                    className={`ml-1 px-1.5 py-0.5 rounded-md text-[10px] font-black tabular-nums leading-none border ${
                      activeTab === tab.id
                        ? 'bg-red-600 text-white border-red-500'
                        : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Mobile Select Navigation */}
          <div className="md:hidden flex justify-center py-3">
            {tabs.length > 0 && (
              <div className="relative w-full max-w-[300px]">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-red-600 pointer-events-none">
                  {React.createElement(tabs.find(t => t.id === activeTab)?.icon || GraduationCap, { size: 18 })}
                </div>
                <select
                  value={activeTab}
                  onChange={(e) => handleSwitchTab(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-lg pl-10 pr-10 py-2.5 text-sm font-bold appearance-none focus:outline-none focus:ring-1 focus:ring-red-600/50"
                >
                  {tabs.map((tab) => (
                    <option key={tab.id} value={tab.id}>
                      {tab.label}{typeof tab.badge === 'number' && tab.badge > 0 ? ` (${tab.badge})` : ''}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none">
                  <ChevronDown size={16} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- ÁREA DE CONTEÚDO --- */}
      <div className="max-w-7xl mx-auto px-4 mt-6 md:mt-8">
        {/* DASHBOARD DE REVISÕES COPIADO DO CURSO ONLINE SE O EDITAL VERTICALIZADO ESTIVER ATIVO */}
        {currentClass?.linkedCourseId && currentClass?.linkedCourseSharedTabs?.edital?.enabled && (
          <div className="mb-8">
            <CourseReviewDashboard 
              courseId={currentClass.linkedCourseId} 
              onReviewNow={handleReviewNow} 
            />
          </div>
        )}

        {activeTab === 'TEACHING' && (
          selectedModule ? (
            <CoursePlayer 
              course={fakeCourse} 
              module={selectedModule} 
              onBack={() => {
                setSelectedModule(null);
                clearModuleSearchParams();
              }} 
            />
          ) : (
            loadingModules ? (
              <div className="flex gap-4 overflow-hidden">
                {[1,2,3].map(i => <div key={i} className="w-60 h-[300px] bg-gray-900 rounded-lg animate-pulse" />)}
              </div>
            ) : (
              <div className="space-y-6">
                <h3 className="text-xl font-semibold text-gray-200 flex items-center uppercase">
                  <GraduationCap className="mr-2 text-red-500" />
                  Módulos de Ensino
                </h3>

                <StudentCourseModulesCatalog
                  modules={modules}
                  moduleGroups={teachingModuleGroups}
                  sections={teachingSections}
                  selectedGroupId={selectedTeachingGroupId}
                  onSelectGroup={setSelectedTeachingGroupId}
                  onSelectModule={setSelectedModule}
                  emptyMessage="Nenhum módulo disponível para esta turma."
                />
              </div>
            )
          )
        )}

        {(activeTab === 'LINKED_COURSE' || activeTab === 'LINKED_COURSE_MODULES') && currentClass?.linkedCourseId && (
          selectedLinkedModule ? (
            <CoursePlayer 
              course={linkedCourse!} 
              module={selectedLinkedModule} 
              onBack={() => {
                setSelectedLinkedModule(null);
                clearModuleSearchParams();
              }} 
            />
          ) : (
            loadingLinkedCourse ? (
              <div className="flex gap-4 overflow-hidden">
                {[1,2,3].map(i => <div key={i} className="w-60 h-[300px] bg-gray-900 rounded-lg animate-pulse" />)}
              </div>
            ) : (
              <div className="space-y-6">
                <h3 className="text-xl font-semibold text-gray-200 flex items-center uppercase">
                  <Video className="mr-2 text-red-500" />
                  {currentClass?.linkedCourseSharedTabs?.modules?.label || currentClass?.linkedCourseTabLabel || 'Módulos do Curso'}
                </h3>

                <StudentCourseModulesCatalog
                  modules={linkedCourseModules}
                  moduleGroups={linkedCourseModuleGroups}
                  sections={linkedCourseSections}
                  selectedGroupId={selectedLinkedGroupId}
                  onSelectGroup={setSelectedLinkedGroupId}
                  onSelectModule={setSelectedLinkedModule}
                  isMaintenance={isLinkedCourseMaintenance}
                  maintenanceMessage={linkedCourse?.maintenanceMode?.message}
                  emptyMessage="Nenhum módulo ou bloco disponível para este curso."
                />
              </div>
            )
          )
        )}

        {activeTab === 'LINKED_COURSE_EDITAL' && currentClass?.linkedCourseId && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="text-xl font-semibold text-gray-200 flex items-center">
              <ListTree className="mr-2 text-red-500" />
              {currentClass?.linkedCourseSharedTabs?.edital?.label || 'Edital Verticalizado'}
            </h3>
            <StudentCourseEdital 
              courseId={currentClass.linkedCourseId}
              focusTopicId={focusTopicId}
              isMaintenance={linkedCourse?.maintenanceMode?.enabled && !linkedCourse?.maintenanceMode?.whitelistedUsers?.includes(currentUser?.email || '')}
              maintenanceMessage={linkedCourse?.maintenanceMode?.message}
            />
          </div>
        )}

        {activeTab === 'LINKED_COURSE_LIVE' && currentClass?.linkedCourseId && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="text-xl font-semibold text-gray-200 flex items-center">
              <Radio className="mr-2 text-red-500" />
              {currentClass?.linkedCourseSharedTabs?.live?.label || 'Eventos ao Vivo'}
            </h3>
            
            {linkedCourseLiveEvents.length === 0 ? (
              <div className="p-8 text-center bg-gray-900/50 rounded-xl border border-gray-800 text-gray-500">
                Nenhum evento ao vivo programado para este curso vinculado.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {linkedCourseLiveEvents.map((event) => (
                  <div 
                    key={event.id} 
                    className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden flex flex-col group hover:border-zinc-700 transition-colors"
                  >
                    {/* Thumbnail */}
                    <div className="relative aspect-video bg-zinc-800">
                      {event.thumbnailUrl ? (
                        <img 
                          src={event.thumbnailUrl} 
                          alt={event.title} 
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-600">
                          <Video size={48} />
                        </div>
                      )}
                      
                      {/* Status Badge */}
                      <div className="absolute top-3 right-3">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase shadow-lg ${
                          event.status === 'live' ? 'bg-red-600 text-white animate-pulse' :
                          event.status === 'scheduled' ? 'bg-blue-600 text-white' :
                          'bg-zinc-800 text-zinc-400'
                        }`}>
                          {event.status === 'live' ? 'AO VIVO AGORA' : event.status === 'scheduled' ? 'AGENDADO' : 'ENCERRADO'}
                        </span>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-5 flex flex-col flex-1">
                      <h3 className="text-lg font-bold text-white mb-1 line-clamp-2">{event.title}</h3>
                      {event.subtitle && (
                        <p className="text-zinc-400 text-sm mb-4 line-clamp-2">{event.subtitle}</p>
                      )}
                      
                      <div className="mt-auto space-y-2 mb-6">
                        <div className="flex items-center gap-2 text-zinc-300 text-sm">
                          <Calendar size={16} className="text-zinc-500" />
                          <span>{event.eventDate.split('-').reverse().join('/')}</span>
                        </div>
                        <div className="flex items-center gap-2 text-zinc-300 text-sm">
                          <Clock size={16} className="text-zinc-500" />
                          <span>{event.startTime}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => navigate(`/app/eventos-ao-vivo/sala/${event.id}`)}
                        className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                          event.status === 'live' 
                            ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-900/20' 
                            : 'bg-zinc-800 hover:bg-zinc-700 text-white'
                        }`}
                      >
                        {event.status === 'live' ? 'ACESSAR SALA DE TRANSMISSÃO' : 'VER DETALHES DO EVENTO'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'DAILY_GOALS' && (
          <StudentPresentialDailyGoals
            classId={currentClass.id}
            masterClassId={currentClass.masterClassId}
            linkedSimulatedId={currentClass.linkedSimulatedId}
            liveEvents={classLiveEvents}
            onSwitchTab={handleSwitchTab}
            onProgressUpdated={refreshDailyBadge}
          />
        )}

        {activeTab === 'SCHEDULE' && (
          <StudentClassSchedule 
            classId={currentClass.id} 
            masterClassId={currentClass.masterClassId}
            linkedSimulatedId={currentClass.linkedSimulatedId}
            onProgressUpdated={refreshDailyBadge}
          />
        )}

        {activeTab === 'PLANNING' && (
          <StudentPedagogicalPlanning 
            classId={currentClass.id}
            masterClassId={currentClass.masterClassId}
            totalMeetings={currentClass.totalMeetings}
            subjectGroups={currentClass.subjectGroups}
          />
        )}

        {activeTab === 'LIVE' && classLiveEvents.length > 0 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {classLiveEvents.map((event) => (
                <div 
                  key={event.id} 
                  className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden flex flex-col group hover:border-zinc-700 transition-colors"
                >
                  {/* Thumbnail */}
                  <div className="relative aspect-video bg-zinc-800">
                    {event.thumbnailUrl ? (
                      <img 
                        src={event.thumbnailUrl} 
                        alt={event.title} 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-600">
                        <Video size={48} />
                      </div>
                    )}
                    
                    {/* Status Badge */}
                    <div className="absolute top-3 right-3">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase shadow-lg ${
                        event.status === 'live' ? 'bg-red-600 text-white animate-pulse' :
                        event.status === 'scheduled' ? 'bg-blue-600 text-white' :
                        'bg-zinc-800 text-zinc-400'
                      }`}>
                        {event.status === 'live' ? 'AO VIVO AGORA' : event.status === 'scheduled' ? 'AGENDADO' : 'ENCERRADO'}
                      </span>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-5 flex flex-col flex-1">
                    <h3 className="text-lg font-bold text-white mb-1 line-clamp-2">{event.title}</h3>
                    {event.subtitle && (
                      <p className="text-zinc-400 text-sm mb-4 line-clamp-2">{event.subtitle}</p>
                    )}
                    
                    <div className="mt-auto space-y-2 mb-6">
                      <div className="flex items-center gap-2 text-zinc-300 text-sm">
                        <Calendar size={16} className="text-zinc-500" />
                        <span>{event.eventDate.split('-').reverse().join('/')}</span>
                      </div>
                      <div className="flex items-center gap-2 text-zinc-300 text-sm">
                        <Clock size={16} className="text-zinc-500" />
                        <span>{event.startTime}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => navigate(`/app/eventos-ao-vivo/sala/${event.id}`)}
                      className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                        event.status === 'live' 
                          ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-900/20' 
                          : 'bg-zinc-800 hover:bg-zinc-700 text-white'
                      }`}
                    >
                      {event.status === 'live' ? (
                        <>
                          <Play size={18} fill="currentColor" />
                          ACESSAR SALA DE TRANSMISSÃO
                        </>
                      ) : (
                        'VER DETALHES DO EVENTO'
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'SIMULADOS' && currentClass?.linkedSimulatedId && (
          <LinkedSimulatedView simulatedId={currentClass.linkedSimulatedId} />
        )}
      </div>


    </div>
  );
};
