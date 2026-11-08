import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

const PAGARME_BASE_URL = 'https://api.pagar.me/core/v5';

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
    const recipientId = (req.query.recipientId as string || '').trim();
    if (!recipientId) {
      return res.status(400).json({ success: false, error: 'recipientId é obrigatório' });
    }

    const secretKey = (process.env.PAGARME_SECRET_KEY || '').trim();
    if (!secretKey) {
      console.error("[RECIPIENT_BALANCE] PAGARME_SECRET_KEY não configurada no ambiente.");
      return res.status(500).json({ success: false, error: 'PAGARME_SECRET_KEY não encontrada no ambiente da Vercel.' });
    }

    const auth = Buffer.from(`${secretKey}:`).toString('base64');
    const headers = {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    const url = `${PAGARME_BASE_URL}/recipients/${recipientId}/balance`;
    console.log(`[RECIPIENT_BALANCE] Consultando saldo de recebedor: ${recipientId}`);

    const response = await axios.get(url, { headers, timeout: 10000 });
    const data = response.data;

    const available = data.available?.amount ?? data.available_amount ?? 0;
    const waiting_funds = data.waiting_funds?.amount ?? data.waiting_funds_amount ?? 0;
    const transferred = data.transferred?.amount ?? data.transferred_amount ?? 0;

    return res.status(200).json({
      success: true,
      balance: {
        available,
        waiting_funds,
        transferred,
        recipient_name: data.recipient?.name || ''
      }
    });
  } catch (error: any) {
    console.error("[RECIPIENT_BALANCE] Erro ao buscar saldo do recebedor na Vercel:", error.response?.data || error.message);
    const statusCode = error.response?.status || 500;
    return res.status(statusCode).json({
      success: false,
      error: error.response?.data?.message || error.message || 'Erro ao consultar saldo do recebedor Pagar.me'
    });
  }
}
