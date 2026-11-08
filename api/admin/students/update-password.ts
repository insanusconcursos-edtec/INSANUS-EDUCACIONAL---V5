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
    const { uid, novaSenha } = req.body || {};

    if (!uid || !novaSenha) {
      return res.status(400).json({ success: false, error: "UID e nova senha são obrigatórios." });
    }

    if (String(novaSenha).length < 6) {
      return res.status(400).json({ success: false, error: "A senha deve ter no mínimo 6 caracteres." });
    }

    const { authAdmin, dbAdmin } = getAdminConfig();

    try {
      await authAdmin.updateUser(uid, {
        password: String(novaSenha)
      });
      // Limpar sessões ativas antigas para permitir reconexão limpa e sem bloqueios
      try {
        await dbAdmin.collection('users').doc(uid).update({
          activeSessionIds: []
        });
      } catch (sessionErr) {
        console.warn("[UPDATE_PASSWORD] Falha ao limpar activeSessionIds:", sessionErr);
      }
    } catch (authError: any) {
      console.error("[UPDATE_PASSWORD] Erro no Firebase Auth:", authError);
      return res.status(400).json({
        success: false,
        error: authError.message || "Erro ao atualizar a senha no sistema de autenticação."
      });
    }

    return res.status(200).json({
      success: true,
      message: "Senha atualizada com sucesso no Auth."
    });
  } catch (error: any) {
    console.error("[UPDATE_PASSWORD] Erro inesperado:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Erro interno do servidor ao atualizar a senha."
    });
  }
}
