import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminConfig } from '../../../../src/backend/services/firebaseAdmin.js';

interface CourseAccess {
  id?: string | number;
  type: string;
  targetId: string;
  isActive?: boolean;
  isScholarship?: boolean;
  diaFim?: any;
  diaInicio?: any;
}

interface UserProfile {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userPhone: string;
  userCpf: string;
  userAvatar: string;
  enrollmentType?: string;
  accessOrigin?: string;
  expiresAt?: string | null;
  releasedAt?: string | null;
  diaInicio?: string | null;
  diaFim?: string | null;
  active?: boolean;
  createdAt?: any;
}

interface Enrollment {
  id: string;
  userId?: string;
  enrollmentType?: string;
  isScholarship?: boolean;
  expiresAt?: any;
  diaFim?: any;
  releasedAt?: any;
  diaInicio?: any;
  createdAt?: any;
  active?: boolean;
}

const normalizeDate = (val: any): string | null => {
  if (!val) return null;
  if (typeof val?.toDate === 'function') {
    return val.toDate().toISOString();
  }
  if (typeof val === 'object' && typeof val.seconds === 'number') {
    return new Date(val.seconds * 1000).toISOString();
  }
  return String(val);
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const rawCourseId = req.query.courseId;
    const courseId = Array.isArray(rawCourseId) ? rawCourseId[0] : rawCourseId;

    if (!courseId || typeof courseId !== 'string') {
      return res.status(400).json({ success: false, error: 'ID do curso inválido' });
    }

    const { dbAdmin } = getAdminConfig();

    // 1. Busca Matrículas Diretas (Coleção course_enrollments)
    const directEnrollmentsSnap = await dbAdmin.collection('course_enrollments')
      .where('courseId', '==', courseId)
      .get();

    const directEnrollments = directEnrollmentsSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // 2. Busca Alunos para verificar acesso via Combo (Coleção users -> array access)
    const studentsSnap = await dbAdmin.collection('users')
      .where('role', '==', 'student')
      .get();

    const studentMap = new Map<string, UserProfile>();

    // Parte A: Processar alunos que ganharam acesso via Combo/Produto
    studentsSnap.docs.forEach(doc => {
      const userData = doc.data();
      const accessArray: CourseAccess[] = userData.access || [];

      const courseAccess = accessArray.find((acc: CourseAccess) =>
        acc.type === 'course' &&
        acc.targetId === courseId &&
        acc.isActive === true
      );

      if (courseAccess) {
        const isMig = Boolean(courseAccess.id && String(courseAccess.id).startsWith('mig_'));
        const enrollmentType = isMig
          ? 'MIGRACAO'
          : courseAccess.isScholarship
          ? 'BOLSISTA'
          : 'REGULAR';

        const expiresAt = normalizeDate(courseAccess.diaFim);
        const releasedAt = normalizeDate(courseAccess.diaInicio) || normalizeDate(userData.createdAt);

        studentMap.set(doc.id, {
          id: doc.id,
          userId: doc.id,
          userName: userData.name || userData.displayName || 'Sem Nome',
          userEmail: userData.email || '',
          userPhone: userData.phone || userData.whatsapp || userData.contact || '',
          userCpf: userData.cpf || '',
          userAvatar: userData.photoURL || '',
          enrollmentType,
          accessOrigin: isMig ? 'MIGRATION' : 'COMBO',
          expiresAt,
          releasedAt,
          diaInicio: releasedAt,
          diaFim: expiresAt,
          active: courseAccess.isActive !== false
        });
      }
    });

    // Parte B: Processar Matrículas Diretas (Sobrescrevendo ou complementando)
    for (const rawEnrollment of directEnrollments) {
      const enrollment = rawEnrollment as Enrollment;
      const userId = enrollment.userId;
      if (!userId) continue;

      let userProfile = studentMap.get(userId);

      if (!userProfile) {
        const userDoc = studentsSnap.docs.find(d => d.id === userId);
        if (userDoc) {
          const userData = userDoc.data();
          userProfile = {
            id: userDoc.id,
            userId: userDoc.id,
            userName: userData.name || userData.displayName || 'Sem Nome',
            userEmail: userData.email || '',
            userPhone: userData.phone || userData.whatsapp || userData.contact || '',
            userCpf: userData.cpf || '',
            userAvatar: userData.photoURL || '',
            createdAt: userData.createdAt
          };
        } else {
          const docRef = await dbAdmin.collection('users').doc(userId).get();
          if (docRef.exists) {
            const userData = docRef.data() || {};
            userProfile = {
              id: docRef.id,
              userId: docRef.id,
              userName: userData.name || userData.displayName || 'Sem Nome',
              userEmail: userData.email || '',
              userPhone: userData.phone || userData.whatsapp || userData.contact || '',
              userCpf: userData.cpf || '',
              userAvatar: userData.photoURL || '',
              createdAt: userData.createdAt
            };
          }
        }
      }

      if (userProfile) {
        const expiresAt = normalizeDate(enrollment.diaFim || enrollment.expiresAt);
        const releasedAt =
          normalizeDate(enrollment.diaInicio || enrollment.releasedAt) ||
          normalizeDate(enrollment.createdAt) ||
          normalizeDate(userProfile.createdAt);

        studentMap.set(userId, {
          ...userProfile,
          enrollmentType: enrollment.enrollmentType || (enrollment.isScholarship ? 'BOLSISTA' : 'REGULAR'),
          accessOrigin: 'DIRECT',
          expiresAt,
          releasedAt,
          diaInicio: releasedAt,
          diaFim: expiresAt,
          active: enrollment.active !== false
        });
      }
    }

    const aggregatedStudents = Array.from(studentMap.values());

    return res.status(200).json({ success: true, students: aggregatedStudents });
  } catch (error: any) {
    console.error("Erro ao buscar alunos do curso:", error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Erro interno ao buscar alunos'
    });
  }
}
