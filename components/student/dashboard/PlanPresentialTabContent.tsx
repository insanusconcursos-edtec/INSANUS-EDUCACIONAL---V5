import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Calendar,
  Clock,
  GraduationCap,
  Loader2,
  Play,
  Radio,
  Video,
  FileText,
  AlertCircle
} from 'lucide-react';
import { Plan, PlanPresentialSharedTabKey } from '../../../types/plan';
import { Class } from '../../../types/class';
import { OnlineCourse, CourseModule, CourseModuleGroup, CourseSection } from '../../../types/course';
import { LiveEvent } from '../../../types/liveEvent';
import { classService } from '../../../services/classService';
import { courseService } from '../../../services/courseService';
import { liveEventService } from '../../../services/liveEventService';
import { PlanHeroBanner } from '../PlanHeroBanner';
import { StudentPresentialDailyGoals } from '../presential/StudentPresentialDailyGoals';
import { StudentClassSchedule } from '../presential/StudentClassSchedule';
import { StudentPedagogicalPlanning } from '../presential/StudentPedagogicalPlanning';
import { ConcursoStatusBanner } from '../presential/ConcursoStatusBanner';
import { StudentCourseModulesCatalog } from '../courses/StudentCourseModulesCatalog';
import { CoursePlayer } from '../courses/player/CoursePlayer';
import { LinkedSimulatedView } from '../simulados/LinkedSimulatedView';
import {
  isPresentialTabShared,
  isNativePlanTabHidden,
  getPresentialTabLabel
} from '../../../utils/planNavigation';

interface PlanPresentialTabContentProps {
  planId: string;
  planData: Plan | null;
  classId: string;
  activePresentialTab: PlanPresentialSharedTabKey;
}

export const PlanPresentialTabContent: React.FC<PlanPresentialTabContentProps> = ({
  planData,
  classId,
  activePresentialTab
}) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const moduleIdParam = searchParams.get('module');

  const [currentClass, setCurrentClass] = useState<Class | null>(null);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Teaching tab states (supports Blocks / ModuleGroups and Thematic Sections)
  const [teachingClassId, setTeachingClassId] = useState<string>(classId);
  const [modules, setModules] = useState<CourseModule[]>([]);
  const [moduleGroups, setModuleGroups] = useState<CourseModuleGroup[]>([]);
  const [sections, setSections] = useState<CourseSection[]>([]);
  const [loadingTeaching, setLoadingTeaching] = useState<boolean>(false);
  const [selectedModule, setSelectedModule] = useState<CourseModule | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadClassContext = async () => {
      if (!classId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const data = await classService.getClassById(classId);
        if (!data) {
          if (isMounted) setCurrentClass(null);
          return;
        }

        let resolvedLiveEvents = await liveEventService.getLiveEventsByPresentialClass(classId);
        let resolvedLinkedSimulatedId = data.linkedSimulatedId;
        let resolvedIsGuidedStudy = data.isGuidedStudyEnabled;
        let resolvedTeachingClassId = classId;

        if (data.masterClassId) {
          const masterData = await classService.getClassById(data.masterClassId);
          if (masterData) {
            if (resolvedLiveEvents.length === 0) {
              const masterLives = await liveEventService.getLiveEventsByPresentialClass(
                data.masterClassId
              );
              if (masterLives.length > 0) resolvedLiveEvents = masterLives;
            }
            if (!resolvedLinkedSimulatedId && masterData.linkedSimulatedId) {
              resolvedLinkedSimulatedId = masterData.linkedSimulatedId;
            }
            if (masterData.isGuidedStudyEnabled && !resolvedIsGuidedStudy) {
              resolvedIsGuidedStudy = true;
            }
            const ownModules = await courseService.getModules(classId);
            if (ownModules.length === 0) {
              const masterModules = await courseService.getModules(data.masterClassId);
              if (masterModules.length > 0) {
                resolvedTeachingClassId = data.masterClassId;
              }
            }
          }
        }

        if (!isMounted) return;
        setCurrentClass({
          ...data,
          linkedSimulatedId: resolvedLinkedSimulatedId,
          isGuidedStudyEnabled: resolvedIsGuidedStudy
        });
        setLiveEvents(resolvedLiveEvents);
        setTeachingClassId(resolvedTeachingClassId);
      } catch (err) {
        console.error('Erro ao carregar turma presencial vinculada ao plano:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadClassContext();
    return () => {
      isMounted = false;
    };
  }, [classId]);

  // Carrega módulos, blocos e seções caso a aba ativa seja ÁREA DE ENSINO
  useEffect(() => {
    let isMounted = true;

    const loadTeachingData = async () => {
      if (activePresentialTab !== 'teaching' || !teachingClassId) return;
      setLoadingTeaching(true);
      try {
        const [modsData, groupsData, sectionsData] = await Promise.all([
          courseService.getModules(teachingClassId),
          courseService.getModuleGroups(teachingClassId),
          courseService.getCourseSections(teachingClassId)
        ]);
        if (!isMounted) return;
        setModules(modsData || []);
        setModuleGroups(groupsData || []);
        setSections(sectionsData || []);
      } catch (err) {
        console.error('Erro ao carregar módulos da turma presencial no plano:', err);
      } finally {
        if (isMounted) setLoadingTeaching(false);
      }
    };

    loadTeachingData();
    return () => {
      isMounted = false;
    };
  }, [activePresentialTab, teachingClassId]);

  // Deep link de módulo na Área de Ensino
  useEffect(() => {
    if (activePresentialTab !== 'teaching' || !moduleIdParam) return;
    const found = modules.find((m) => m.id === moduleIdParam);
    if (found) {
      if (found.groupId) setSelectedGroupId(found.groupId);
      if (!selectedModule || selectedModule.id !== found.id) {
        setSelectedModule(found);
      }
    }
  }, [activePresentialTab, moduleIdParam, modules, selectedModule]);

  // Reset de player quando troca de aba
  useEffect(() => {
    if (activePresentialTab !== 'teaching' && selectedModule) {
      setSelectedModule(null);
    }
  }, [activePresentialTab, selectedModule]);

  const canOpenSchedule = isPresentialTabShared(planData, 'schedule');
  const canOpenPlanning = isPresentialTabShared(planData, 'planning');
  const canOpenSimulados =
    (isPresentialTabShared(planData, 'simulados') && Boolean(currentClass?.linkedSimulatedId)) ||
    (!isNativePlanTabHidden(planData, 'SIMULADOS') &&
      Boolean(planData?.simuladosVinculados?.length || planData?.linkedSimuladoClassId));
  const canOpenLive =
    isPresentialTabShared(planData, 'live') || !isNativePlanTabHidden(planData, 'LIVE');

  const handleSwitchPresentialTab = useCallback(
    (targetId: string, queryParams?: Record<string, string>) => {
      const upper = targetId.toUpperCase();
      let nextTabQuery = '';

      if (upper === 'SCHEDULE' && canOpenSchedule) {
        nextTabQuery = 'presential_schedule';
      } else if (upper === 'DAILY_GOALS' && isPresentialTabShared(planData, 'dailyGoals')) {
        nextTabQuery = 'presential_daily';
      } else if (upper === 'PLANNING' && canOpenPlanning) {
        nextTabQuery = 'presential_planning';
      } else if (upper === 'TEACHING' && isPresentialTabShared(planData, 'teaching')) {
        nextTabQuery = 'presential_teaching';
      } else if (upper === 'SIMULADOS') {
        if (isPresentialTabShared(planData, 'simulados')) {
          nextTabQuery = 'presential_simulados';
        } else if (!isNativePlanTabHidden(planData, 'SIMULADOS')) {
          nextTabQuery = 'simulados';
        }
      } else if (upper === 'LIVE') {
        if (isPresentialTabShared(planData, 'live')) {
          nextTabQuery = 'presential_live';
        } else if (!isNativePlanTabHidden(planData, 'LIVE')) {
          nextTabQuery = 'live';
        }
      }

      if (!nextTabQuery) return;

      const nextParams = new URLSearchParams();
      nextParams.set('tab', nextTabQuery);
      if (queryParams) {
        Object.entries(queryParams).forEach(([k, v]) => {
          if (v) nextParams.set(k, v);
        });
      }
      setSearchParams(nextParams);
    },
    [planData, canOpenSchedule, canOpenPlanning, setSearchParams]
  );

  const bannerKey = useMemo<
    'today' | 'calendar' | 'edict' | 'mentorship' | 'call' | 'simulados' | 'live'
  >(() => {
    switch (activePresentialTab) {
      case 'dailyGoals':
        return 'today';
      case 'schedule':
      case 'planning':
      case 'teaching':
        return 'calendar';
      case 'live':
        return 'live';
      case 'simulados':
        return 'simulados';
      default:
        return 'today';
    }
  }, [activePresentialTab]);

  const hasPlanBanner = useMemo(() => {
    if (!planData?.banners) return false;
    const b = (planData.banners as Record<string, { desktop?: string; tablet?: string; mobile?: string }>)[
      bannerKey
    ];
    return Boolean(b && (b.desktop || b.tablet || b.mobile));
  }, [planData, bannerKey]);

  const isPlayerActive = activePresentialTab === 'teaching' && Boolean(selectedModule);

  const clearModuleParams = () => {
    if (searchParams.has('module') || searchParams.has('lesson')) {
      const next = new URLSearchParams(searchParams);
      next.delete('module');
      next.delete('lesson');
      setSearchParams(next, { replace: true });
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 bg-zinc-950">
        <Loader2 size={38} className="animate-spin text-red-600" />
        <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">
          Sincronizando recursos da turma presencial...
        </p>
      </div>
    );
  }

  if (!currentClass) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center bg-zinc-950">
        <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-amber-400 mb-4">
          <AlertCircle size={32} />
        </div>
        <h3 className="text-lg font-black uppercase text-white tracking-tight">
          Turma Presencial Não Encontrada
        </h3>
        <p className="text-xs text-zinc-400 max-w-md mt-2 leading-relaxed">
          A turma presencial referenciada neste plano não está mais disponível ou teve seu vínculo alterado.
        </p>
      </div>
    );
  }

  const fakeCourseForPlayer: OnlineCourse = {
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

  return (
    <div className="relative w-full min-h-screen bg-zinc-950 flex flex-col pb-20 animate-in fade-in duration-500">
      {!isPlayerActive && planData && hasPlanBanner && (
        <PlanHeroBanner currentTab={bannerKey} planData={planData} />
      )}

      <div
        className={`relative z-10 w-full max-w-[1600px] mx-auto px-4 md:px-8 flex-1 flex flex-col ${
          isPlayerActive
            ? 'pt-4'
            : hasPlanBanner
              ? 'pt-10 md:pt-14 -mt-8 md:-mt-14'
              : 'pt-6 md:pt-8'
        }`}
      >
        {!isPlayerActive && (
          <div className="mb-4">
            <ConcursoStatusBanner classData={currentClass} />
          </div>
        )}

        {activePresentialTab === 'dailyGoals' && (
          <StudentPresentialDailyGoals
            classId={currentClass.id}
            masterClassId={currentClass.masterClassId}
            linkedSimulatedId={currentClass.linkedSimulatedId}
            liveEvents={liveEvents}
            onSwitchTab={handleSwitchPresentialTab}
            canOpenSchedule={canOpenSchedule}
            canOpenPlanning={canOpenPlanning}
            canOpenSimuladosTab={canOpenSimulados}
            canOpenLiveTab={canOpenLive}
          />
        )}

        {activePresentialTab === 'schedule' && (
          <StudentClassSchedule
            classId={currentClass.id}
            masterClassId={currentClass.masterClassId}
            linkedSimulatedId={currentClass.linkedSimulatedId}
            onSwitchTab={handleSwitchPresentialTab}
            canOpenPlanning={canOpenPlanning}
            canOpenSimuladosTabOverride={canOpenSimulados}
          />
        )}

        {activePresentialTab === 'planning' && (
          <StudentPedagogicalPlanning
            classId={currentClass.id}
            masterClassId={currentClass.masterClassId}
            totalMeetings={currentClass.totalMeetings}
            subjectGroups={currentClass.subjectGroups}
          />
        )}

        {activePresentialTab === 'teaching' &&
          (selectedModule ? (
            <CoursePlayer
              course={fakeCourseForPlayer}
              module={selectedModule}
              onBack={() => {
                setSelectedModule(null);
                clearModuleParams();
              }}
            />
          ) : loadingTeaching ? (
            <div className="flex gap-4 overflow-hidden py-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="w-60 h-[300px] bg-zinc-900 rounded-xl border border-zinc-800 animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              <h3 className="text-xl font-black text-zinc-100 flex items-center uppercase tracking-tight">
                <GraduationCap className="mr-2.5 text-red-500" size={22} />
                {getPresentialTabLabel(planData, 'teaching')}
              </h3>

              <StudentCourseModulesCatalog
                modules={modules}
                moduleGroups={moduleGroups}
                sections={sections}
                selectedGroupId={selectedGroupId}
                onSelectGroup={setSelectedGroupId}
                onSelectModule={setSelectedModule}
                emptyMessage="Nenhum módulo ou bloco disponível na área de ensino desta turma."
              />
            </div>
          ))}

        {activePresentialTab === 'live' && (
          <div className="space-y-6">
            <h3 className="text-xl font-black text-zinc-100 flex items-center uppercase tracking-tight">
              <Radio className="mr-2.5 text-red-500" size={22} />
              {getPresentialTabLabel(planData, 'live')}
            </h3>

            {liveEvents.length === 0 ? (
              <div className="p-10 text-center bg-zinc-900/40 rounded-2xl border border-zinc-800 text-zinc-400 text-sm">
                Nenhum evento ao vivo programado para esta turma presencial no momento.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {liveEvents.map((event) => (
                  <div
                    key={event.id}
                    className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden flex flex-col group hover:border-zinc-700 transition-colors"
                  >
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

                      <div className="absolute top-3 right-3">
                        <span
                          className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase shadow-lg ${
                            event.status === 'live'
                              ? 'bg-red-600 text-white animate-pulse'
                              : event.status === 'scheduled'
                                ? 'bg-blue-600 text-white'
                                : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          {event.status === 'live'
                            ? 'AO VIVO AGORA'
                            : event.status === 'scheduled'
                              ? 'AGENDADO'
                              : 'ENCERRADO'}
                        </span>
                      </div>
                    </div>

                    <div className="p-5 flex flex-col flex-1">
                      <h4 className="text-lg font-bold text-white mb-1 line-clamp-2">
                        {event.title}
                      </h4>
                      {event.subtitle && (
                        <p className="text-zinc-400 text-sm mb-4 line-clamp-2">{event.subtitle}</p>
                      )}

                      <div className="mt-auto space-y-2 mb-6">
                        <div className="flex items-center gap-2 text-zinc-300 text-sm tabular-nums">
                          <Calendar size={16} className="text-zinc-500" />
                          <span>{event.eventDate.split('-').reverse().join('/')}</span>
                        </div>
                        <div className="flex items-center gap-2 text-zinc-300 text-sm tabular-nums">
                          <Clock size={16} className="text-zinc-500" />
                          <span>{event.startTime}</span>
                        </div>
                      </div>

                      <button
                        type="button"
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
            )}
          </div>
        )}

        {activePresentialTab === 'simulados' &&
          (currentClass.linkedSimulatedId ? (
            <LinkedSimulatedView simulatedId={currentClass.linkedSimulatedId} />
          ) : (
            <div className="p-10 text-center bg-zinc-900/40 rounded-2xl border border-zinc-800 text-zinc-400 space-y-2">
              <FileText size={36} className="mx-auto text-zinc-600" />
              <p className="text-sm font-bold text-zinc-300 uppercase">
                Nenhuma turma de simulados vinculada à turma presencial referenciada.
              </p>
            </div>
          ))}
      </div>
    </div>
  );
};
