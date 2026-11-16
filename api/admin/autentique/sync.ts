import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  isAutentiqueConfigured,
  syncClassAutentiqueFolder,
  syncAllActiveAutentiqueClasses,
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

  if (!isAutentiqueConfigured()) {
    return res.status(400).json({
      success: false,
      error: 'AUTENTIQUE_API_TOKEN não está configurado nas variáveis de ambiente do servidor.',
    });
  }

  try {
    const classId = (req.body?.classId || req.query?.classId || '') as string;

    if (classId && classId.trim()) {
      const result = await syncClassAutentiqueFolder(classId.trim(), 'MANUAL_SYNC');
      return res.status(200).json({
        success: true,
        results: [result],
      });
    }

    const results = await syncAllActiveAutentiqueClasses(
      req.method === 'GET' ? 'CRON' : 'MANUAL_SYNC'
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
