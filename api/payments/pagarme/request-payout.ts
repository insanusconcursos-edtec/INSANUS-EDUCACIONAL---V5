import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

const PAGARME_BASE_URL = 'https://api.pagar.me/core/v5';

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
    const { recipientId, amount } = req.body || {};
    if (!recipientId || !amount) {
      return res.status(400).json({ success: false, error: 'recipientId e amount são obrigatórios' });
    }

    const secretKey = (process.env.PAGARME_SECRET_KEY || '').trim();
    if (!secretKey) {
      return res.status(500).json({ success: false, error: 'PAGARME_SECRET_KEY não encontrada no ambiente.' });
    }

    const auth = Buffer.from(`${secretKey}:`).toString('base64');
    const headers = {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    const response = await axios.post(
      `${PAGARME_BASE_URL}/recipients/${recipientId}/transfers`,
      { amount },
      { headers, timeout: 15000 }
    );

    return res.status(200).json({ success: true, transfer: response.data });
  } catch (error: any) {
    console.error("[REQUEST_PAYOUT] Erro ao solicitar transferência na Pagar.me:", error.response?.data || error.message);
    const statusCode = error.response?.status || 500;
    return res.status(statusCode).json({
      success: false,
      error: error.response?.data?.message || error.message || 'Erro ao solicitar saque Pagar.me'
    });
  }
}
