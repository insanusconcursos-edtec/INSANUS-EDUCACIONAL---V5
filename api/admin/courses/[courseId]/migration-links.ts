import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminConfig } from '../../../../src/backend/services/firebaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const rawCourseId = req.query.courseId;
  const courseId = Array.isArray(rawCourseId) ? rawCourseId[0] : rawCourseId;
  if (!courseId || typeof courseId !== 'string') {
    return res.status(400).json({ success: false, error: 'ID do curso inválido' });
  }

  let db: ReturnType<typeof getAdminConfig>['dbAdmin'];
  try {
    db = getAdminConfig().dbAdmin;
  } catch (err: any) {
    console.error("Erro no Firebase Admin em migration-links:", err);
    return res.status(500).json({ success: false, error: err?.message || 'Erro de configuração no servidor' });
  }

  // 1. GET: Retornar todos os links de migração do curso
  if (req.method === 'GET') {
    try {
      const snapshot = await db.collection('MigrationLinks')
        .where('courseId', '==', courseId)
        .get();

      const links = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Ordenar por data de criação decrescente
      links.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

      return res.status(200).json({ success: true, links });
    } catch (error) {
      console.error("Erro ao buscar links de migração:", error);
      return res.status(500).json({ success: false, error: 'Erro ao buscar links' });
    }
  }

  // 2. POST: Criar um novo link de migração
  if (req.method === 'POST') {
    try {
      const { expiresAt, accessDurationDays, authorizedEmails } = req.body;

      // Tratar e-mails autorizados
      const cleanEmails = Array.isArray(authorizedEmails)
        ? authorizedEmails.map((email: string) => ({
            email: email.trim().toLowerCase(),
            status: 'pending',
            completedAt: null,
            completedUid: null
          }))
        : [];

      const newLink = {
        courseId,
        expiresAt,
        accessDurationDays: Number(accessDurationDays),
        active: true,
        createdAt: new Date().toISOString(),
        authorizedEmails: cleanEmails
      };

      const docRef = await db.collection('MigrationLinks').add(newLink);

      return res.status(201).json({
        success: true,
        id: docRef.id,
        link: `/migracao/${docRef.id}`
      });
    } catch (error) {
      console.error("Erro ao gerar link de migração:", error);
      return res.status(500).json({ success: false, error: 'Erro ao gerar link de migração' });
    }
  }

  // 3. PUT: Atualizar status ou deletar link
  if (req.method === 'PUT') {
    try {
      const { linkId, action } = req.body;
      if (!linkId) {
        return res.status(400).json({ success: false, error: 'ID do link é obrigatório' });
      }

      const docRef = db.collection('MigrationLinks').doc(linkId);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        return res.status(404).json({ success: false, error: 'Link de migração não encontrado' });
      }

      const linkData = docSnap.data();
      if (linkData?.courseId !== courseId) {
        return res.status(403).json({ success: false, error: 'Não autorizado para este curso' });
      }

      if (action === 'toggle') {
        const currentActive = linkData?.active !== false;
        await docRef.update({ active: !currentActive });
        return res.status(200).json({ success: true, active: !currentActive });
      }

      if (action === 'delete') {
        await docRef.delete();
        return res.status(200).json({ success: true, message: 'Link excluído com sucesso' });
      }

      if (action === 'edit') {
        const { expiresAt, accessDurationDays, authorizedEmails } = req.body;
        const updates: any = {};
        
        if (expiresAt !== undefined) {
          updates.expiresAt = expiresAt;
        }
        if (accessDurationDays !== undefined) {
          updates.accessDurationDays = Number(accessDurationDays);
        }
        if (authorizedEmails !== undefined) {
          const existingEmails = Array.isArray(linkData?.authorizedEmails) ? linkData.authorizedEmails : [];
          const existingMap = new Map<string, any>();
          existingEmails.forEach((item: any) => {
            if (item && item.email) {
              existingMap.set(item.email.trim().toLowerCase(), item);
            }
          });

          const cleanEmails = Array.isArray(authorizedEmails)
            ? authorizedEmails.map((email: string) => {
                const normalized = email.trim().toLowerCase();
                if (existingMap.has(normalized)) {
                  return existingMap.get(normalized);
                } else {
                  return {
                    email: normalized,
                    status: 'pending',
                    completedAt: null,
                    completedUid: null
                  };
                }
              })
            : [];
          updates.authorizedEmails = cleanEmails;
        }

        await docRef.update(updates);
        
        // Fetch updated doc to return to frontend
        const updatedSnap = await docRef.get();
        return res.status(200).json({ 
          success: true, 
          message: 'Link atualizado com sucesso', 
          link: { id: updatedSnap.id, ...updatedSnap.data() } 
        });
      }

      return res.status(400).json({ success: false, error: 'Ação inválida' });
    } catch (error) {
      console.error("Erro ao atualizar link de migração:", error);
      return res.status(500).json({ success: false, error: 'Erro ao processar alteração' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
