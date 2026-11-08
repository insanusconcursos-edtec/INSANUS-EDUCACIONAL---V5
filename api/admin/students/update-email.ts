import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminConfig } from '../../../src/backend/services/firebaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { uid, novoEmail } = req.body || {};

    if (!uid || !novoEmail) {
      return res.status(400).json({ success: false, error: "UID e novo e-mail são obrigatórios." });
    }

    const emailTrimmed = String(novoEmail).trim().toLowerCase();
    const { dbAdmin, authAdmin } = getAdminConfig();

    // 1. Atualizar no Firebase Authentication primeiro
    try {
      await authAdmin.updateUser(uid, {
        email: emailTrimmed
      });
    } catch (authError: any) {
      console.error("[UPDATE_EMAIL] Erro no Firebase Auth:", authError);
      if (authError.code === 'auth/email-already-exists' || (authError.message && authError.message.includes('already exists'))) {
        return res.status(400).json({ success: false, error: "Este e-mail já está em uso por outro usuário." });
      }
      return res.status(400).json({ success: false, error: authError.message || "Erro no sistema de autenticação." });
    }

    // 2. Se a atualização no Authentication for bem-sucedida, atualizar Firestore
    await dbAdmin.collection('users').doc(uid).update({
      email: emailTrimmed
    });

    return res.status(200).json({
      success: true,
      message: "E-mail atualizado com sucesso no Auth e Firestore."
    });
  } catch (error: any) {
    console.error("[UPDATE_EMAIL] Erro inesperado:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Erro interno do servidor ao atualizar e-mail."
    });
  }
}
