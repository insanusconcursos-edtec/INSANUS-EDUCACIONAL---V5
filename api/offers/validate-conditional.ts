import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminConfig } from '../../src/backend/services/firebaseAdmin.js';

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
    const { email, cpf, requiredProductId, requiredProductIds, exceptionList, offerId, productId } = req.body || {};
    const { dbAdmin } = getAdminConfig();

    if (!email || !cpf) {
      return res.status(400).json({ success: false, message: 'Dados insuficientes para validação.' });
    }

    const cleanCpf = cpf.replace(/\D/g, '');
    let isEligible = false;

    // 1. Verificar Lista de Exceção (Acesso Direto)
    if (exceptionList && Array.isArray(exceptionList)) {
      isEligible = exceptionList.some((exc: any) => {
        const excCpf = (exc.cpf || '').replace(/\D/g, '');
        const excEmail = (exc.email || '').toLowerCase().trim();
        return excEmail === email.toLowerCase().trim() || excCpf === cleanCpf;
      });
    }

    // 2. Verificar se o usuário possui algum dos produtos requisitados
    if (!isEligible) {
      const allRequiredIds = [...(requiredProductIds || [])];
      if (requiredProductId) allRequiredIds.push(requiredProductId);

      if (allRequiredIds.length > 0) {
        const [snapEmail, snapCpf] = await Promise.all([
          dbAdmin.collection('enrollments')
            .where('userEmail', '==', email)
            .where('status', '==', 'active')
            .get(),
          dbAdmin.collection('enrollments')
            .where('userCpf', '==', cleanCpf)
            .where('status', '==', 'active')
            .get()
        ]);

        const userProductIds = new Set([
          ...snapEmail.docs.map(doc => doc.data().productId),
          ...snapCpf.docs.map(doc => doc.data().productId)
        ]);

        isEligible = allRequiredIds.some(id => userProductIds.has(id));
      } else {
        isEligible = false;
      }
    }

    if (!isEligible) {
      return res.json({ 
        success: false, 
        message: 'Você não atende aos requisitos para liberar esta oferta especial.' 
      });
    }

    // 3. Verificar se já usou ESTA oferta (uniqueness check)
    if (offerId) {
      const usedOfferQuery = await dbAdmin.collection('enrollments')
        .where('offerId', '==', offerId)
        .get();

      const hasUsedOffer = usedOfferQuery.docs.some(doc => {
        const data = doc.data();
        const docCpf = (data.userCpf || data.cpf || '').replace(/\D/g, '');
        const docEmail = (data.userEmail || data.email || '').toLowerCase().trim();
        return docEmail === email.toLowerCase().trim() || docCpf === cleanCpf;
      });

      if (hasUsedOffer) {
        return res.json({ 
          success: false, 
          message: 'Você já utilizou esta oferta especial. Cada oferta condicional só pode ser usada uma única vez.' 
        });
      }
    }

    // 4. Verificar se já possui o produto que está tentando comprar
    if (productId) {
      const [targetSnapEmail, targetSnapCpf] = await Promise.all([
        dbAdmin.collection('enrollments')
          .where('productId', '==', productId)
          .where('userEmail', '==', email)
          .where('status', '==', 'active')
          .limit(1)
          .get(),
        dbAdmin.collection('enrollments')
          .where('productId', '==', productId)
          .where('userCpf', '==', cleanCpf)
          .where('status', '==', 'active')
          .limit(1)
          .get()
      ]);

      if (!targetSnapEmail.empty || !targetSnapCpf.empty) {
        return res.json({ 
          success: false, 
          message: 'Você já possui acesso a este produto.' 
        });
      }
    }

    return res.json({ success: true, message: 'Oferta liberada!' });
  } catch (error) {
    console.error('Erro ao validar oferta condicional na Vercel:', error);
    return res.status(500).json({ success: false, message: 'Erro interno ao validar oferta.' });
  }
}
