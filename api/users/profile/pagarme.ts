import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminConfig } from '../../../src/backend/services/firebaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'PUT') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { uid, pagarmeRecipientId } = req.body || {};
    
    if (!uid || !pagarmeRecipientId) {
      return res.status(400).json({ success: false, error: 'UID e RecipientID são obrigatórios' });
    }

    const { dbAdmin } = getAdminConfig();
    const updateData = {
      pagarmeRecipientId: String(pagarmeRecipientId).trim(),
      updatedAt: new Date().toISOString()
    };

    await dbAdmin.collection('users').doc(uid).update(updateData);
    
    const coproRef = dbAdmin.collection('coproducers').doc(uid);
    const coproDoc = await coproRef.get();
    if (coproDoc.exists) {
      await coproRef.update(updateData);
    }

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error("[PROFILE_PAGARME] Erro:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
