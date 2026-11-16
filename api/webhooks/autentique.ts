import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleAutentiqueWebhook } from '../../src/backend/services/autentiqueService.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, x-autentique-signature, x-webhook-signature, signature'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  const signature =
    (req.headers['x-autentique-signature'] as string) ||
    (req.headers['x-webhook-signature'] as string) ||
    (req.headers['signature'] as string) ||
    '';

  const authorization = (req.headers['authorization'] as string) || '';

  try {
    const outcome = await handleAutentiqueWebhook(
      req.body,
      signature || undefined,
      authorization || undefined
    );
    return res.status(200).json({
      success: true,
      ...outcome,
    });
  } catch (error: any) {
    console.error('[Webhook Autentique Vercel] Erro no processamento:', error);
    return res.status(200).json({
      success: false,
      error: error?.message || 'Erro ao processar webhook Autentique',
    });
  }
}
