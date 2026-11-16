import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  isAutentiqueConfigured,
  syncClassAutentiqueFolder,
  syncAllActiveAutentiqueClasses,
  resendAutentiqueContractEmail,
  resendFailedClassContractEmails,
  revokeAutentiqueContractEnrollment,
} from '../../../src/backend/services/autentiqueService.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    const action = String(req.body?.action || '').trim();

    if (req.method === 'POST' && action === 'resend') {
      const logId = String(req.body?.logId || '').trim();
      if (!logId) {
        return res.status(400).json({ success: false, error: 'ID do registro é obrigatório.' });
      }
      const outcome = await resendAutentiqueContractEmail(logId);
      return res.status(200).json({ success: true, ...outcome });
    }

    if (req.method === 'POST' && action === 'resend_failed') {
      const classId = String(req.body?.classId || '').trim();
      if (!classId) {
        return res.status(400).json({ success: false, error: 'ID da turma é obrigatório.' });
      }
      const outcome = await resendFailedClassContractEmails(classId, 20);
      return res.status(200).json({ success: true, ...outcome });
    }

    if (req.method === 'POST' && action === 'revoke') {
      const logId = String(req.body?.logId || '').trim();
      const blockFutureEmail = Boolean(req.body?.blockFutureEmail);
      const reason =
        req.body?.reason === 'CONTRACT_REMOVED_FROM_FOLDER'
          ? 'CONTRACT_REMOVED_FROM_FOLDER'
          : 'MANUAL_ADMIN';
      if (!logId) {
        return res.status(400).json({ success: false, error: 'ID do registro é obrigatório.' });
      }
      const outcome = await revokeAutentiqueContractEnrollment(logId, {
        blockFutureEmail,
        reason,
      });
      return res.status(200).json({ success: true, ...outcome });
    }

    if (!isAutentiqueConfigured()) {
      return res.status(400).json({
        success: false,
        error: 'AUTENTIQUE_API_TOKEN não está configurado nas variáveis de ambiente do servidor.',
      });
    }

    const classId = String(req.body?.classId || req.query?.classId || '').trim();
    const maxNewProvisions = Number(req.body?.maxNewProvisions) || 25;

    if (classId) {
      const result = await syncClassAutentiqueFolder(classId, 'MANUAL_SYNC', maxNewProvisions);
      return res.status(200).json({
        success: true,
        results: [result],
      });
    }

    const results = await syncAllActiveAutentiqueClasses(
      req.method === 'GET' ? 'CRON' : 'MANUAL_SYNC',
      maxNewProvisions
    );
    return res.status(200).json({
      success: true,
      results,
    });
  } catch (error: any) {
    console.error('[Vercel API] Erro ao sincronizar Autentique:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Erro interno ao sincronizar contratos do Autentique.',
    });
  }
}
