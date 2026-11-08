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
    const secretKey = (process.env.PAGARME_SECRET_KEY || '').trim();
    if (!secretKey) {
      return res.status(500).json({ success: false, error: 'PAGARME_SECRET_KEY não configurada no ambiente.' });
    }

    const auth = Buffer.from(`${secretKey}:`).toString('base64');
    const headers = {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    const response = await axios.get(`${PAGARME_BASE_URL}/recipients`, { headers, timeout: 10000 });
    const data = response.data;

    return res.status(200).json({
      success: true,
      recipients: data.data || data
    });
  } catch (error: any) {
    console.error("[RECIPIENTS] Erro ao listar recebedores:", error.response?.data || error.message);
    const statusCode = error.response?.status || 500;
    return res.status(statusCode).json({
      success: false,
      error: error.response?.data?.message || error.message || 'Erro ao listar recebedores'
    });
  }
}
