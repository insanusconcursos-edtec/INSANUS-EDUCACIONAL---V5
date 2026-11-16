import type { VercelRequest, VercelResponse } from '@vercel/node';
import { listAutentiqueFolders } from '../../../src/backend/services/autentiqueService.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    const result = await listAutentiqueFolders();
    return res.status(200).json({
      success: true,
      configured: result.configured,
      folders: result.folders,
      warning: result.error || null,
    });
  } catch (error: any) {
    console.error('[Vercel API] Erro ao listar pastas do Autentique:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Erro interno ao consultar pastas do Autentique.',
    });
  }
}
