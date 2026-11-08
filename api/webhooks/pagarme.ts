import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handlePagarmeWebhook } from '../../src/backend/services/pagarmeService.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-pagarme-signature');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const signature = (req.headers['x-pagarme-signature'] as string) || '';
  console.log('✅ [Webhook Pagar.me Vercel] Recebido:', req.body?.type, '| Signature:', signature ? 'Presente' : 'Ausente');

  try {
    // No Vercel/Serverless, aguardamos o processamento antes de responder
    await handlePagarmeWebhook(req.body, signature);

    return res.status(200).json({
      success: true,
      message: 'Webhook processed successfully'
    });
  } catch (error) {
    console.error("❌ Erro no processamento do Webhook Pagar.me na Vercel:", error);
    // Retornamos 200 para evitar retentativas infinitas se for erro lógico de dados
    return res.status(200).json({
      success: false,
      error: "Fulfillment failed but webhook acknowledged"
    });
  }
}
