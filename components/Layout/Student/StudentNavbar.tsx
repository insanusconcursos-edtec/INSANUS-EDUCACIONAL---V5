import React, { useEffect, useState, useCallback } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Clock, Timer, Target, CalendarDays, FileText, GraduationCap, Video, Settings, ChevronDown, Radio, BookOpen } from 'lucide-react';
import { doc, onSnapshot, collection, query, where } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { useAuth } from '../../../contexts/AuthContext';
import { Student } from '../../../services/userService';
import { LiveEvent } from '../../../types/liveEvent';
import { Plan } from '../../../types/plan';
import {
  isNativePlanTabHidden,
  isPresentialTabShared,
  getPresentialTabLabel
} from '../../../utils/planNavigation';
import { classService } from '../../../services/classService';
import { classScheduleService } from '../../../services/classScheduleService';
import { guidedStudyService } from '../../../services/guidedStudyService';
import { liveEventService } from '../../../services/liveEventService';
import { GuidedStudyProgress } from '../../../types/guidedStudy';
import { toLocalISODate } from '../../../utils/dateUtils';

interface StudentNavItem {
  key: string;
  label: string;
  path: string;
  icon: React.ReactNode;
  isSpecial?: boolean;
  badge?: number;
}

const StudentNavbar: React.FC = () => {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get('tab');
  const { currentUser } = useAuth();
  
  const [lifetimeMinutes, setLifetimeMinutes] = useState(0);
  const [planMinutes, setPlanMinutes] = useState(0);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [hasLiveEvent, setHasLiveEvent] = useState(false);
  const [hasPresentialLiveNow, setHasPresentialLiveNow] = useState(false);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [activePlanData, setActivePlanData] = useState<Plan | null>(null);
  const [presentialDailyBadge, setPresentialDailyBadge] = useState<number>(0);

  const linkedPresentialClassId = activePlanData?.linkedPresentialConfig?.enabled
    ? activePlanData?.linkedPresentialConfig?.classId || null
    : null;

  useEffect(() => {
    if (!currentUser) return;

    // Listen to live events
    const q = query(
      collection(db, 'live_events'),
      where('status', '==', 'live')
    );

    const unsubLive = onSnapshot(q, (snapshot) => {
      const liveEvents = snapshot.docs.map(docSnap => docSnap.data() as LiveEvent);
      
      if (activePlanId) {
        const isLiveForPlan = liveEvents.some(event => 
          event.accessControl?.plans?.includes(activePlanId)
        );
        setHasLiveEvent(isLiveForPlan);
      } else {
        setHasLiveEvent(liveEvents.length > 0);
      }

      if (linkedPresentialClassId) {
        const isLiveForClass = liveEvents.some(event =>
          event.accessControl?.presentialClasses?.includes(linkedPresentialClassId)
        );
        setHasPresentialLiveNow(isLiveForClass);
      } else {
        setHasPresentialLiveNow(false);
      }
    });

    return () => unsubLive();
  }, [currentUser, activePlanId, linkedPresentialClassId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isDropdownOpen && !(event.target as Element).closest('.dropdown-container')) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDropdownOpen]);

  // Detect Context
  const isSimulatedContext = location.pathname.includes('/app/simulated');
  const isCoursesContext = location.pathname.includes('/app/courses');

  useEffect(() => {
    if (!currentUser) return;

    // Listen to User Stats changes
    const unsub = onSnapshot(doc(db, 'users', currentUser.uid), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data() as Student;
            
            setLifetimeMinutes(data.lifetimeMinutes || 0);

            const planId = data.activePlanId || data.currentPlanId;
            setActivePlanId(planId || null);

            if (planId && data.planStats && data.planStats[planId]) {
                setPlanMinutes(data.planStats[planId].minutes || 0);
            } else {
                setPlanMinutes(0);
            }
        }
    });

    return () => unsub();
  }, [currentUser]);

  // Real-time listener on active Plan document so admin tab changes reflect immediately
  useEffect(() => {
    if (!activePlanId) {
      setActivePlanData(null);
      return;
    }

    const unsubPlan = onSnapshot(doc(db, 'plans', activePlanId), (planSnap) => {
      if (planSnap.exists()) {
        setActivePlanData({ id: planSnap.id, ...(planSnap.data() as Plan) });
      } else {
        setActivePlanData(null);
      }
    });

    return () => unsubPlan();
  }, [activePlanId]);

  // Compute pending badge for shared Presential Daily Goals tab
  const refreshPresentialBadge = useCallback(async () => {
    if (
      !currentUser?.uid ||
      !linkedPresentialClassId ||
      !isPresentialTabShared(activePlanData, 'dailyGoals')
    ) {
      setPresentialDailyBadge(0);
      return;
    }

    try {
      const [cls, initialEvents, initialMetas, initialLives, prog] = await Promise.all([
        classService.getClassById(linkedPresentialClassId).catch(() => null),
        classScheduleService.getScheduleEventsByClass(linkedPresentialClassId),
        guidedStudyService.getMetasByClass(linkedPresentialClassId),
        liveEventService.getLiveEventsByPresentialClass(linkedPresentialClassId),
        guidedStudyService.getStudentProgress(currentUser.uid, linkedPresentialClassId)
      ]);

      let eventsData = initialEvents;
      let metasData = initialMetas;
      let livesData = initialLives;

      if (cls?.masterClassId) {
        const mId = cls.masterClassId;
        const [mEvents, mMetas, mLives] = await Promise.all([
          eventsData.length === 0 ? classScheduleService.getScheduleEventsByClass(mId) : Promise.resolve([]),
          metasData.length === 0 ? guidedStudyService.getMetasByClass(mId) : Promise.resolve([]),
          livesData.length === 0 ? liveEventService.getLiveEventsByPresentialClass(mId) : Promise.resolve([])
        ]);
        if (eventsData.length === 0 && mEvents.length > 0) eventsData = mEvents;
        if (metasData.length === 0 && mMetas.length > 0) metasData = mMetas;
        if (livesData.length === 0 && mLives.length > 0) livesData = mLives;
      }

      const todayStr = toLocalISODate();
      const progMap: Record<string, GuidedStudyProgress> = prog || {};
      const pendingMetas = metasData.filter(
        (m) => m.date <= todayStr && !progMap[m.id || '']?.completed
      ).length;
      const todaysEvents = eventsData.filter(
        (ev) => ev.date === todayStr && ev.status !== 'CANCELED' && ev.status !== 'COMPLETED'
      );
      const linkedLiveIds = new Set(
        todaysEvents.map((ev) => ev.liveEventId).filter((id): id is string => Boolean(id))
      );
      const standaloneLives = livesData.filter(
        (le) => le.eventDate === todayStr && le.status !== 'ended' && !linkedLiveIds.has(le.id)
      );

      setPresentialDailyBadge(pendingMetas + todaysEvents.length + standaloneLives.length);
    } catch (err) {
      console.error('Erro ao calcular badge de Metas de Hoje (Presencial no Plano):', err);
    }
  }, [currentUser?.uid, linkedPresentialClassId, activePlanData]);

  useEffect(() => {
    refreshPresentialBadge();

    const handleProgressEvent = (ev: Event) => {
      const custom = ev as CustomEvent<{ classId?: string }>;
      if (!custom.detail?.classId || custom.detail.classId === linkedPresentialClassId) {
        refreshPresentialBadge();
      }
    };

    window.addEventListener('insanus:presential-progress-updated', handleProgressEvent);
    return () => {
      window.removeEventListener('insanus:presential-progress-updated', handleProgressEvent);
    };
  }, [refreshPresentialBadge, linkedPresentialClassId]);

  // Helper Formatter
  const formatMinutes = (totalMinutes: number) => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.floor(totalMinutes % 60);
    return `${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m`;
  };

  const activePlanTitle = activePlanData?.title || null;

  // Build Level 2 Navigation Items respecting hiddenTabs and linkedPresentialConfig
  const planNavItems: StudentNavItem[] = React.useMemo(() => {
    const items: StudentNavItem[] = [
      {
        key: 'planos',
        label: 'PLANOS',
        path: '/app/dashboard/planos',
        icon: <GraduationCap className="w-5 h-5" />
      }
    ];

    if (!activePlanId) {
      return items;
    }

    if (!isNativePlanTabHidden(activePlanData, 'TODAY')) {
      items.push({
        key: 'native_today',
        label: 'METAS DE HOJE',
        path: '/app/dashboard',
        icon: <Target className="w-5 h-5" />
      });
    }

    if (isPresentialTabShared(activePlanData, 'dailyGoals')) {
      items.push({
        key: 'presential_daily',
        label: getPresentialTabLabel(activePlanData, 'dailyGoals'),
        path: '/app/dashboard?tab=presential_daily',
        icon: <Target className="w-5 h-5" />,
        badge: presentialDailyBadge
      });
    }

    if (!isNativePlanTabHidden(activePlanData, 'CALENDAR')) {
      items.push({
        key: 'native_calendar',
        label: 'CALENDÁRIO',
        path: '/app/calendar',
        icon: <CalendarDays className="w-5 h-5" />
      });
    }

    if (isPresentialTabShared(activePlanData, 'schedule')) {
      items.push({
        key: 'presential_schedule',
        label: getPresentialTabLabel(activePlanData, 'schedule'),
        path: '/app/dashboard?tab=presential_schedule',
        icon: <CalendarDays className="w-5 h-5" />
      });
    }

    if (isPresentialTabShared(activePlanData, 'planning')) {
      items.push({
        key: 'presential_planning',
        label: getPresentialTabLabel(activePlanData, 'planning'),
        path: '/app/dashboard?tab=presential_planning',
        icon: <BookOpen className="w-5 h-5" />
      });
    }

    if (!isNativePlanTabHidden(activePlanData, 'EDICT')) {
      items.push({
        key: 'native_edict',
        label: 'EDITAL',
        path: '/app/edict',
        icon: <FileText className="w-5 h-5" />
      });
    }

    if (!isNativePlanTabHidden(activePlanData, 'MENTORSHIP')) {
      items.push({
        key: 'native_mentorship',
        label: 'MENTORIA',
        path: '/app/dashboard?tab=mentorship',
        icon: <GraduationCap className="w-5 h-5" />,
        isSpecial: true
      });
    }

    if (!isNativePlanTabHidden(activePlanData, 'CALL')) {
      items.push({
        key: 'native_call',
        label: 'CALL',
        path: '/app/dashboard?tab=call',
        icon: <Video className="w-5 h-5" />,
        isSpecial: true
      });
    }

    if (!isNativePlanTabHidden(activePlanData, 'SIMULADOS')) {
      items.push({
        key: 'native_simulados',
        label: 'SIMULADOS',
        path: '/app/dashboard?tab=simulados',
        icon: <FileText className="w-5 h-5" />,
        isSpecial: true
      });
    }

    if (isPresentialTabShared(activePlanData, 'simulados')) {
      items.push({
        key: 'presential_simulados',
        label: getPresentialTabLabel(activePlanData, 'simulados'),
        path: '/app/dashboard?tab=presential_simulados',
        icon: <FileText className="w-5 h-5" />,
        isSpecial: true
      });
    }

    if (!isNativePlanTabHidden(activePlanData, 'LIVE')) {
      items.push({
        key: 'native_live',
        label: 'AO VIVO',
        path: '/app/dashboard?tab=live',
        icon: (
          <div className="relative">
            <Radio className="w-5 h-5" />
            {hasLiveEvent && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-brand-red rounded-full animate-pulse shadow-[0_0_5px_rgba(239,68,68,0.8)]" />
            )}
          </div>
        ),
        isSpecial: true
      });
    }

    if (isPresentialTabShared(activePlanData, 'live')) {
      items.push({
        key: 'presential_live',
        label: getPresentialTabLabel(activePlanData, 'live'),
        path: '/app/dashboard?tab=presential_live',
        icon: (
          <div className="relative">
            <Radio className="w-5 h-5" />
            {hasPresentialLiveNow && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-brand-red rounded-full animate-pulse shadow-[0_0_5px_rgba(239,68,68,0.8)]" />
            )}
          </div>
        ),
        isSpecial: true
      });
    }

    if (isPresentialTabShared(activePlanData, 'teaching')) {
      items.push({
        key: 'presential_teaching',
        label: getPresentialTabLabel(activePlanData, 'teaching'),
        path: '/app/dashboard?tab=presential_teaching',
        icon: <GraduationCap className="w-5 h-5" />,
        isSpecial: true
      });
    }

    (activePlanData?.linkedCourses || []).forEach((lc) => {
      if (!lc?.courseId) return;
      items.push({
        key: `course_${lc.courseId}`,
        label: (lc.tabName || 'CURSO').toUpperCase(),
        path: `/app/dashboard?tab=course_${lc.courseId}`,
        icon: <GraduationCap className="w-5 h-5" />,
        isSpecial: true
      });
    });

    if (!isNativePlanTabHidden(activePlanData, 'CONFIG')) {
      items.push({
        key: 'native_config',
        label: 'CONFIGURAÇÃO',
        path: '/app/config',
        icon: <Settings className="w-5 h-5" />
      });
    }

    return items;
  }, [activePlanId, activePlanData, hasLiveEvent, hasPresentialLiveNow, presentialDailyBadge]);

  const currentItem = planNavItems.find(item => {
    if (item.path.includes('?tab=')) {
      return activeTab === item.path.split('=')[1];
    }
    return location.pathname === item.path && !activeTab;
  }) || planNavItems[0];

  // Regra PRD: A barra secundária não deve aparecer na tela HOME
  if (location.pathname === '/app/home' || location.pathname.includes('/home')) {
    return null;
  }

  return (
    <div className="h-14 px-6 bg-zinc-950/80 backdrop-blur-sm border-b border-zinc-900 flex items-center justify-between gap-4 sticky top-0 z-40">
      
      {/* LEVEL 2 NAVIGATION LINKS */}
      <div className="flex-1 min-w-0 relative dropdown-container h-full flex items-center gap-4">
        {activePlanTitle && !isSimulatedContext && !isCoursesContext && (
          <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-red-600/10 border border-red-600/30 rounded-lg shrink-0">
            <div className="w-1.5 h-1.5 bg-red-600 rounded-full animate-pulse shadow-[0_0_5px_rgba(220,38,38,0.8)]" />
            <span className="text-[9px] font-black text-red-600 uppercase tracking-widest truncate max-w-[200px]">
              {activePlanTitle}
            </span>
          </div>
        )}

        {!isSimulatedContext && !isCoursesContext && (
          <>
            {/* MOBILE DROPDOWN */}
            <div className="md:hidden w-full">
              <button 
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center justify-between w-full bg-[#121214] border border-white/10 rounded-md px-4 py-3.5 text-white font-medium transition-all active:scale-[0.98]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={currentItem?.isSpecial ? "text-[var(--plan-theme)]" : "text-zinc-400"}>
                    {currentItem?.icon}
                  </div>
                  <span className="text-[11px] font-bold tracking-widest uppercase truncate">{currentItem?.label}</span>
                  {typeof currentItem?.badge === 'number' && currentItem.badge > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-black tabular-nums leading-none shrink-0">
                      {currentItem.badge}
                    </span>
                  )}
                </div>
                <ChevronDown className={`w-5 h-5 text-zinc-500 transition-transform duration-300 shrink-0 ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isDropdownOpen && (
                <div className="absolute top-full left-0 mt-2 w-full max-h-[70vh] overflow-y-auto bg-[#18181b] border border-white/10 rounded-md shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  {planNavItems.map((item) => {
                    const isActive = item.path.includes('?tab=')
                      ? activeTab === item.path.split('=')[1]
                      : location.pathname === item.path && !activeTab;

                    return (
                      <Link
                        key={item.key}
                        to={item.path}
                        onClick={() => setIsDropdownOpen(false)}
                        className={`
                          flex items-center justify-between gap-4 w-full px-4 py-4 text-left transition-colors border-b border-white/5 last:border-0
                          ${isActive ? 'bg-white/5 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}
                        `}
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <div className={item.isSpecial ? "text-[var(--plan-theme)]" : ""}>
                            {item.icon}
                          </div>
                          <span className="text-[11px] font-bold tracking-widest uppercase truncate">{item.label}</span>
                        </div>
                        {typeof item.badge === 'number' && item.badge > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-black tabular-nums leading-none shrink-0">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* DESKTOP HORIZONTAL NAV */}
            <nav className="hidden md:flex items-center gap-1 sm:gap-2 h-full overflow-x-auto scrollbar-hide">
              {planNavItems.map((item) => {
                const isActive = item.path.includes('?tab=')
                  ? activeTab === item.path.split('=')[1]
                  : location.pathname === item.path && !activeTab;

                return (
                  <Link
                    key={item.key}
                    to={item.path}
                    className={`
                      relative h-10 px-3.5 flex items-center justify-center rounded-md text-[10px] font-bold tracking-widest uppercase transition-all duration-300 gap-2 whitespace-nowrap shrink-0
                      ${isActive 
                        ? (item.isSpecial ? 'bg-[var(--plan-theme)] text-white shadow-lg shadow-[var(--plan-theme)]/40' : 'text-white bg-zinc-800') 
                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'}
                    `}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                    {typeof item.badge === 'number' && item.badge > 0 && (
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-black tabular-nums leading-none border ${
                          isActive
                            ? 'bg-red-600 text-white border-red-500'
                            : 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </>
        )}
        
        {/* Placeholder title for Simulated Context */}
        {isSimulatedContext && (
            <div className="flex items-center gap-2 opacity-50">
               <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
               <span className="text-[10px] font-black text-white uppercase tracking-widest">Área de Simulados</span>
            </div>
        )}

        {/* Placeholder title for Courses Context */}
        {isCoursesContext && (
            <div className="flex items-center gap-2 opacity-50">
               <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
               <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Área de Cursos</span>
            </div>
        )}
      </div>

      {/* TIMERS (Always Visible) */}
      <div className="flex items-center gap-6 hidden md:flex">
        {/* Tempo no Plano */}
        <div className="flex flex-col items-end leading-none">
          <span className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest mb-1">Tempo no Plano</span>
          <div className="flex items-center gap-2 text-white">
            <Clock size={12} className="text-zinc-500" />
            <span className="text-xs font-mono font-bold tracking-wider tabular-nums">
                {formatMinutes(planMinutes)}
            </span>
          </div>
        </div>

        <div className="h-6 w-px bg-zinc-900"></div>

        {/* Tempo Total */}
        <div className="flex flex-col items-end leading-none">
          <span className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest mb-1">Tempo Total</span>
          <div className="flex items-center gap-2 text-[var(--plan-theme)]">
            <Timer size={12} />
            <span className="text-xs font-mono font-bold tracking-wider drop-shadow-[0_0_5px_var(--plan-theme)] tabular-nums">
                {formatMinutes(lifetimeMinutes)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentNavbar;