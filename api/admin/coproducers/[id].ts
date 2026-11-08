import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminConfig } from '../../../src/backend/services/firebaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ success: false, error: 'ID do coprodutor é obrigatório' });
  }

  const { dbAdmin, authAdmin } = getAdminConfig();

  // PUT: Atualizar coprodutor
  if (req.method === 'PUT') {
    try {
      const { name, username, password, document, pagarmeRecipientId, isActive } = req.body || {};
      const domain = "@insanus.com.br";
      const updateData: any = {
        updatedAt: new Date().toISOString()
      };

      if (name) updateData.name = name;
      if (username) {
        updateData.username = username.toLowerCase().trim();
        updateData.email = `${updateData.username}${domain}`;
      }
      if (document) updateData.document = document;
      if (pagarmeRecipientId !== undefined) updateData.pagarmeRecipientId = pagarmeRecipientId;
      if (isActive !== undefined) updateData.isActive = isActive;

      if (username || password) {
        const docSnap = await dbAdmin.collection('coproducers').doc(id).get();
        const currentData = docSnap.data();
        const usernameToUse = username || currentData?.username;
        
        if (usernameToUse) {
          const emailToUse = `${usernameToUse.toLowerCase().trim()}${domain}`;

          try {
            const authUpdate: any = {};
            if (password) authUpdate.password = password;
            if (username) authUpdate.email = emailToUse;
            if (name) authUpdate.displayName = name;
            
            await authAdmin.updateUser(id, authUpdate);
          } catch (authError: any) {
            if (authError.code === 'auth/user-not-found') {
              if (password) {
                await authAdmin.createUser({
                  uid: id,
                  email: emailToUse,
                  password: password,
                  displayName: name || currentData?.name || 'Coprodutor'
                });
              }
            } else {
              throw authError;
            }
          }
        }
      }
      
      await dbAdmin.collection('coproducers').doc(id).update(updateData);
      
      await dbAdmin.collection('users').doc(id).set({
        ...updateData,
        uid: id,
        role: 'coprodutor'
      }, { merge: true });

      return res.status(200).json({ success: true });
    } catch (error: any) {
      console.error("[COPRODUCERS] Erro ao atualizar coprodutor:", error);
      return res.status(500).json({ success: false, error: error.message || "Erro ao atualizar coprodutor." });
    }
  }

  // DELETE: Excluir coprodutor
  if (req.method === 'DELETE') {
    try {
      await dbAdmin.collection('coproducers').doc(id).delete();
      return res.status(200).json({ success: true });
    } catch (error: any) {
      console.error("[COPRODUCERS] Erro ao excluir coprodutor:", error);
      return res.status(500).json({ success: false, error: "Erro ao excluir coprodutor." });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
