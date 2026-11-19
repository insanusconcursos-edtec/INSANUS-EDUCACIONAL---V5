import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../services/firebase';
import { LiveEvent } from '../types/liveEvent';
import { checkUserHasFreePass } from '../src/utils/freePassUtils';

export interface StudentLiveAccessContext {
  isAdmin: boolean;
  hasFreePass: boolean;
  userEmail: string;
  plans: string[];
  courses: string[];
  classes: string[];
  simulated: string[];
  directLiveEvents: string[];
  scheduledLiveEventIds: string[];
}

export const EMPTY_STUDENT_LIVE_ACCESS: StudentLiveAccessContext = {
  isAdmin: false,
  hasFreePass: false,
  userEmail: '',
  plans: [],
  courses: [],
  classes: [],
  simulated: [],
  directLiveEvents: [],
  scheduledLiveEventIds: [],
};

const parseFlexibleExpirationDate = (raw: unknown): Date | null => {
  if (!raw) return null;
  if (typeof (raw as { toDate?: () => Date }).toDate === 'function') {
    const d = (raw as { toDate: () => Date }).toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === 'object' && raw !== null && 'seconds' in raw) {
    const secs = Number((raw as { seconds?: unknown }).seconds);
    if (!Number.isNaN(secs)) {
      const d = new Date(secs * 1000);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  if (typeof raw === 'string' || typeof raw === 'number') {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw;
  }
  return null;
};

export const isAccessRecordCurrentlyValid = (
  item: Record<string, unknown>,
  now: Date = new Date()
): boolean => {
  if (!item) return false;
  if (item.isActive === false || item.active === false) return false;

  const rawEnd =
    item.diaFim ??
    item.endDate ??
    item.expiresAt ??
    item.expires_at ??
    item.finishedAt ??
    null;

  const endDate = parseFlexibleExpirationDate(rawEnd);
  if (endDate && endDate < now) {
    return false;
  }
  return true;
};

interface LoadAccessOptions {
  uid: string;
  email?: string | null;
  authRole?: string | null;
  targetEventId?: string;
  includeAllClassSchedules?: boolean;
}

export const loadStudentLiveAccessContext = async ({
  uid,
  email,
  authRole,
  targetEventId,
  includeAllClassSchedules = false,
}: LoadAccessOptions): Promise<StudentLiveAccessContext> => {
  const normalizedAuthEmail = String(email || '').toLowerCase().trim();
  const normalizedAuthRole = String(authRole || '').toLowerCase().trim();

  const isAdminByAuth =
    normalizedAuthRole === 'admin' ||
    normalizedAuthEmail.includes('admin') ||
    normalizedAuthEmail === 'insanusconcursos@gmail.com';

  const plans = new Set<string>();
  const courses = new Set<string>();
  const classes = new Set<string>();
  const simulated = new Set<string>();
  const directLiveEvents = new Set<string>();
  const scheduledLiveEventIds = new Set<string>();

  const userDoc = await getDoc(doc(db, 'users', uid)).catch(() => null);
  const uData = userDoc?.exists() ? userDoc.data() : null;

  const resolvedEmail = String(uData?.email || normalizedAuthEmail || '')
    .toLowerCase()
    .trim();
  const resolvedRole = String(uData?.role || normalizedAuthRole || '')
    .toLowerCase()
    .trim();

  const isAdmin =
    isAdminByAuth ||
    resolvedRole === 'admin' ||
    resolvedEmail.includes('admin') ||
    resolvedEmail === 'insanusconcursos@gmail.com';

  const hasFreePass = isAdmin
    ? true
    : await checkUserHasFreePass(
        { uid, email: resolvedEmail, role: resolvedRole, access: uData?.access },
        uData
      ).catch(() => false);

  const now = new Date();

  if (Array.isArray(uData?.access)) {
    uData.access.forEach((rawItem: Record<string, unknown>) => {
      if (!isAccessRecordCurrentlyValid(rawItem, now)) return;
      const targetId = String(rawItem.targetId || '').trim();
      if (!targetId) return;

      const itemType = String(rawItem.type || '').trim();
      if (itemType === 'plan') plans.add(targetId);
      else if (itemType === 'course') courses.add(targetId);
      else if (itemType === 'presential_class') classes.add(targetId);
      else if (itemType === 'simulated_class') simulated.add(targetId);
      else if (
        itemType === 'isolated_product' ||
        itemType === 'live_event' ||
        itemType === 'live_events'
      ) {
        directLiveEvents.add(targetId);
      }
    });
  }

  // Matrículas legadas ou via course_enrollments
  if (Array.isArray(uData?.courses)) {
    uData.courses.forEach((rawCourse: Record<string, unknown>) => {
      if (!isAccessRecordCurrentlyValid(rawCourse, now)) return;
      const cId = String(rawCourse.courseId || '').trim();
      if (cId) courses.add(cId);
    });
  }

  try {
    const enrollmentsSnap = await getDocs(
      query(collection(db, 'course_enrollments'), where('userId', '==', uid))
    );
    enrollmentsSnap.forEach(enrDoc => {
      const enr = enrDoc.data();
      if (!isAccessRecordCurrentlyValid(enr, now)) return;
      const cId = String(enr.courseId || '').trim();
      if (cId) courses.add(cId);
    });
  } catch {
    // Ignora caso a coleção não esteja acessível para o perfil
  }

  // Herda turmas presenciais vinculadas em Planos ativos e Cursos Online ativos
  const [planDocs, courseDocs] = await Promise.all([
    Promise.all(
      Array.from(plans).map(pid => getDoc(doc(db, 'plans', pid)).catch(() => null))
    ),
    Promise.all(
      Array.from(courses).map(cid => getDoc(doc(db, 'courses', cid)).catch(() => null))
    ),
  ]);

  planDocs.forEach(pSnap => {
    if (!pSnap?.exists()) return;
    const pData = pSnap.data();
    const linkedClsId = pData?.linkedPresentialConfig?.enabled
      ? String(pData?.linkedPresentialConfig?.classId || '').trim()
      : '';
    if (linkedClsId) classes.add(linkedClsId);
  });

  courseDocs.forEach(cSnap => {
    if (!cSnap?.exists()) return;
    const cData = cSnap.data();
    const linkedClsId = String(cData?.linkedPresentialId || '').trim();
    if (linkedClsId) classes.add(linkedClsId);
  });

  // Resolve masterClassId e linkedCourseId das turmas presenciais acessíveis ao aluno
  if (classes.size > 0) {
    const classDocs = await Promise.all(
      Array.from(classes).map(clsId => getDoc(doc(db, 'classes', clsId)).catch(() => null))
    );
    classDocs.forEach(clSnap => {
      if (!clSnap?.exists()) return;
      const clData = clSnap.data();
      const mId = String(clData?.masterClassId || '').trim();
      if (mId) classes.add(mId);
      const linkedCourseId = String(clData?.linkedCourseId || '').trim();
      if (linkedCourseId) courses.add(linkedCourseId);
      const linkedSimId = String(clData?.linkedSimulatedId || '').trim();
      if (linkedSimId) simulated.add(linkedSimId);
    });
  }

  // Verifica vínculo direto pelo Cronograma de Aulas (class_schedules)
  if (targetEventId) {
    try {
      const schedSnap = await getDocs(
        query(collection(db, 'class_schedules'), where('liveEventId', '==', targetEventId))
      );
      const referencedClassIds = new Set<string>();
      schedSnap.forEach(sDoc => {
        const sData = sDoc.data();
        if (sData?.status === 'CANCELED') return;
        const cId = String(sData?.classId || '').trim();
        if (cId) referencedClassIds.add(cId);
      });

      if (referencedClassIds.size > 0) {
        if (isAdmin) {
          scheduledLiveEventIds.add(targetEventId);
        }

        // Se qualquer turma referenciada no cronograma pertencer às turmas acessíveis do aluno
        for (const refClassId of referencedClassIds) {
          if (classes.has(refClassId)) {
            scheduledLiveEventIds.add(targetEventId);
            break;
          }
        }

        // Caso inverso: cronograma salvo na turma filha e aluno matriculado na matriz (ou vice-versa)
        if (!scheduledLiveEventIds.has(targetEventId) && classes.size > 0) {
          const refClassDocs = await Promise.all(
            Array.from(referencedClassIds).map(cid =>
              getDoc(doc(db, 'classes', cid)).catch(() => null)
            )
          );
          for (const cSnap of refClassDocs) {
            if (!cSnap?.exists()) continue;
            const mId = String(cSnap.data()?.masterClassId || '').trim();
            if (mId && classes.has(mId)) {
              scheduledLiveEventIds.add(targetEventId);
              break;
            }
          }
        }
      }
    } catch (schedErr) {
      console.error('Erro ao verificar vínculo de cronograma da sala ao vivo:', schedErr);
    }
  }

  // Quando listando todos os eventos do aluno (aba Ao Vivo), coleta os eventos vinculados nos cronogramas das turmas do aluno
  if (includeAllClassSchedules && classes.size > 0) {
    try {
      const scheduleSnaps = await Promise.all(
        Array.from(classes).map(clsId =>
          getDocs(query(collection(db, 'class_schedules'), where('classId', '==', clsId))).catch(
            () => null
          )
        )
      );
      scheduleSnaps.forEach(snap => {
        if (!snap) return;
        snap.forEach(sDoc => {
          const sData = sDoc.data();
          if (sData?.status === 'CANCELED') return;
          const liveId = String(sData?.liveEventId || '').trim();
          if (sData?.isLiveEvent && liveId) {
            scheduledLiveEventIds.add(liveId);
          }
        });
      });
    } catch (err) {
      console.error('Erro ao carregar eventos ao vivo vinculados aos cronogramas do aluno:', err);
    }
  }

  return {
    isAdmin,
    hasFreePass,
    userEmail: resolvedEmail,
    plans: Array.from(plans),
    courses: Array.from(courses),
    classes: Array.from(classes),
    simulated: Array.from(simulated),
    directLiveEvents: Array.from(directLiveEvents),
    scheduledLiveEventIds: Array.from(scheduledLiveEventIds),
  };
};

export const canStudentAccessLiveEvent = (
  event: LiveEvent | null | undefined,
  ctx: StudentLiveAccessContext
): boolean => {
  if (!event) return false;

  // 1. Administrador sempre possui acesso irrestrito
  if (ctx.isAdmin) return true;

  // 2. Whitelist de rascunho / manutenção
  const whitelist = Array.isArray(event.draftWhitelist)
    ? event.draftWhitelist.map(e => String(e || '').toLowerCase().trim())
    : [];
  const isWhitelisted = Boolean(ctx.userEmail && whitelist.includes(ctx.userEmail));
  if (isWhitelisted) return true;

  // Se o evento estiver despublicado (rascunho) e o aluno não estiver na whitelist, bloqueia
  if (event.published === false) return false;

  // Se o evento estiver bloqueado por cadeado programado, bloqueia entrada direta
  if (event.isBlocked) return false;

  // 3. Evento público
  if (event.isPublic) return true;

  // 4. Evento referenciado no cronograma (class_schedules) de uma turma presencial acessível ao aluno
  if (event.id && ctx.scheduledLiveEventIds.includes(event.id)) {
    return true;
  }

  // 5. Liberação direta (produto isolado ou concessão avulsa de evento ao vivo)
  if (event.id && ctx.directLiveEvents.includes(event.id)) {
    return true;
  }

  // 6. Free Pass ativo (respeitando a flag excludeFromFreePass do evento)
  if (ctx.hasFreePass && !event.excludeFromFreePass) {
    return true;
  }

  // 7. Regras de controle de acesso do evento (Planos, Cursos Online, Turmas Presenciais, Simulados)
  const {
    plans = [],
    onlineCourses = [],
    presentialClasses = [],
    simulated = [],
  } = event.accessControl || {};

  if (
    plans.length === 0 &&
    onlineCourses.length === 0 &&
    presentialClasses.length === 0 &&
    simulated.length === 0
  ) {
    return false;
  }

  const hasPlanAccess = plans.some(id => ctx.plans.includes(id));
  const hasCourseAccess = onlineCourses.some(id => ctx.courses.includes(id));
  const hasClassAccess = presentialClasses.some(id => ctx.classes.includes(id));
  const hasSimulatedAccess = simulated.some(id => ctx.simulated.includes(id));

  return hasPlanAccess || hasCourseAccess || hasClassAccess || hasSimulatedAccess;
};
