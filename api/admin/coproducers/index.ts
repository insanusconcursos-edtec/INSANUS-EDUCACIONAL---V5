import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminConfig } from '../../../src/backend/services/firebaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { dbAdmin, authAdmin } = getAdminConfig();

  // GET: Listar coprodutores
  if (req.method === 'GET') {
    try {
      const snapshot = await dbAdmin.collection('coproducers').orderBy('name', 'asc').get();
      const coproducers = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      return res.status(200).json({ success: true, coproducers });
    } catch (error: any) {
      console.error("[COPRODUCERS] Erro ao listar coprodutores:", error);
      return res.status(500).json({ success: false, error: "Erro ao listar coprodutores." });
    }
  }

  // POST: Criar coprodutor
  if (req.method === 'POST') {
    try {
      const { name, username, password, document, pagarmeRecipientId } = req.body || {};
      const now = new Date().toISOString();

      if (!username) {
        return res.status(400).json({ success: false, error: "Usuário é obrigatório." });
      }

      const domain = "@insanus.com.br";
      const email = `${username.toLowerCase().trim()}${domain}`;
      
      let uid: string;
      try {
        const userRecord = await authAdmin.createUser({
          email,
          password,
          displayName: name,
        });
        uid = userRecord.uid;
      } catch (authError: any) {
        if (authError.code === 'auth/email-already-in-use') {
          const existingUser = await authAdmin.getUserByEmail(email);
          uid = existingUser.uid;
        } else {
          throw authError;
        }
      }

      await dbAdmin.collection('users').doc(uid).set({
        uid,
        name,
        email,
        username: username.toLowerCase().trim(),
        role: 'coprodutor',
        pagarmeRecipientId: pagarmeRecipientId || null,
        document: document || null,
        status: 'active',
        createdAt: now,
        updatedAt: now
      }, { merge: true });

      await dbAdmin.collection('coproducers').doc(uid).set({
        id: uid,
        name,
        username: username.toLowerCase().trim(),
        email,
        document,
        pagarmeRecipientId,
        isActive: true,
        createdAt: now,
        updatedAt: now
      });

      return res.status(201).json({ success: true, id: uid });
    } catch (error: any) {
      console.error("[COPRODUCERS] Erro ao criar coprodutor:", error);
      return res.status(500).json({ success: false, error: error.message || "Erro ao criar coprodutor." });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
