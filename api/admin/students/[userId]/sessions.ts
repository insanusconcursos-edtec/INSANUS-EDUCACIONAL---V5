import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminConfig } from '../../../../src/backend/services/firebaseAdmin.js';

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
    const { userId } = req.query;
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ success: false, error: 'userId é obrigatório' });
    }

    const { dbAdmin } = getAdminConfig();
    const snapshot = await dbAdmin.collection('user_sessions')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    const sessions = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json({ success: true, sessions });
  } catch (error: any) {
    console.error("[ADMIN SESSIONS] Erro:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
