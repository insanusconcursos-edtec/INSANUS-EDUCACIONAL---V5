import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createPagarmeOrder } from '../../../src/backend/services/pagarmeService.js';
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
    const { dbAdmin } = getAdminConfig();
    const body = req.body || {};
    const productId = body.productId || body.metadata?.courseId;

    // 1. Coleta de Coprodutores para o Split
    let coproducers: any[] = [];
    if (productId) {
      try {
        const coproSnap = await dbAdmin.collection('coproducers')
          .where('courseId', '==', String(productId))
          .where('isActive', '==', true)
          .get();

        coproducers = coproSnap.docs.map(doc => {
          const data = doc.data();
          return {
            recipientId: data.pagarmeRecipientId || data.recipientId,
            percentage: Number(data.percentage) || 0
          };
        }).filter(c => c.recipientId && c.percentage > 0);
      } catch (err) {
        console.error('[SPLIT] Erro ao buscar coprodutores:', err);
      }
    }

    // 2. Execução via Service (Payload V5)
    const response = await createPagarmeOrder(body, coproducers);

    // Se o pagamento falhou imediatamente (ex: Cartão Recusado)
    if (response.status === 'failed' || response.status === 'refused') {
      return res.status(400).json({
        success: false,
        message: "O pagamento foi recusado pela operadora do cartão.",
        status: response.status,
        payment: response
      });
    }

    // 3. Resposta amigável para PIX (QR Code)
    if (body.payment_method === 'pix' && response.status === 'pending') {
      const charge = response.charges?.[0];
      const lastTransaction = charge?.last_transaction;

      if (lastTransaction && lastTransaction.qr_code) {
        return res.status(200).json({
          success: true,
          pix: {
            qr_code: lastTransaction.qr_code,
            qr_code_url: lastTransaction.qr_code_url,
            status: 'pending'
          },
          payment: response
        });
      }
    }

    return res.status(200).json({ success: true, payment: response });
  } catch (error: any) {
    console.error("❌ Erro Crítico Pagarme Route:", error.response?.data || error.message);
    const statusCode = error.response?.status || 400;
    return res.status(statusCode).json({
      success: false,
      message: error.response?.data?.message || error.message || "Erro ao processar pagamento na Pagar.me"
    });
  }
}
