import { db } from '../../services/firebase';
import { doc, getDoc } from 'firebase/firestore';

export interface SecurityResource {
  published?: boolean;
  draftWhitelist?: string[];
  excludeFromFreePass?: boolean;
  status?: string;
  blocked?: boolean;
  releaseDate?: string;
  unlockDate?: string;
}

/**
 * Checks if a user has active Free Pass.
 */
export async function checkUserHasFreePass(currentUser: any, userData?: any): Promise<boolean> {
  if (!currentUser && !userData) return false;
  
  const role = userData?.role || currentUser?.role;
  const email = userData?.email || currentUser?.email;
  if (role === 'admin' || email?.includes('admin')) {
    return true;
  }

  if (userData?.freePass || userData?.isFreePass || currentUser?.freePass || currentUser?.isFreePass) {
    return true;
  }

  const accesses = userData?.access || currentUser?.access || [];
  const productsList = userData?.products || currentUser?.products || [];
  
  const allItems = [...(Array.isArray(accesses) ? accesses : []), ...(Array.isArray(productsList) ? productsList : [])];
  if (allItems.length === 0) return false;

  for (const item of allItems) {
    if (item.isActive === false) continue;
    if (item.isFreePass || item.freePass || item.type === 'free_pass') return true;

    const productId = item.productId || item.targetId || (item.type === 'product' ? item.targetId : null);
    
    if (productId) {
      try {
        // Try ticto_products first
        const prodRef = doc(db, 'ticto_products', String(productId));
        const prodSnap = await getDoc(prodRef);
        if (prodSnap.exists()) {
          const prodData = prodSnap.data();
          if (prodData.isFreePass || prodData.freePass) return true;
        }

        // Fallback to products
        const prodRef2 = doc(db, 'products', String(productId));
        const prodSnap2 = await getDoc(prodRef2);
        if (prodSnap2.exists()) {
          const prodData2 = prodSnap2.data();
          if (prodData2.isFreePass || prodData2.freePass) return true;
        }
      } catch (e) {
        // Ignore fetch errors
      }
    }
  }

  return false;
}

/**
 * Validates whether a user can access a specific resource based on:
/**
 * Validates whether a user can access a specific resource based on:
 * 1. Admin bypass (always has full access)
 * 2. RASCUNHO (Draft) status:
 *    - Se estiver em RASCUNHO, fica totalmente OCULTO, inclusive para quem possui acesso liberado!
 *    - Só aparece para o Administrador ou para quem estiver na WhiteList da turma.
 * 3. PUBLICADO:
 *    - Volta a aparecer normalmente para os alunos que possuem acesso liberado (direto ou via Free Pass).
 * 4. BLOQUEADO:
 *    - Exibe com cadeado e data de liberação para os alunos com acesso.
 */
export function canAccessResource(
  resource: SecurityResource,
  userEmail?: string,
  userRole?: string,
  hasFreePass?: boolean,
  hasDirectAccess?: boolean
): { allowed: boolean; visible: boolean; isBlocked?: boolean; unlockDate?: string; reason?: string } {
  // 1. Administrador tem acesso irrestrito
  if (userRole === 'admin' || userEmail?.includes('admin')) {
    return { allowed: true, visible: true };
  }

  const isPublished = resource.published !== false && (resource as any).status !== 'draft';
  const isBlocked = (resource as any).status === 'blocked' || resource.blocked === true || (resource as any).isBlocked === true;
  const whitelist = resource.draftWhitelist || [];
  const isWhitelisted = userEmail ? whitelist.map(e => e.toLowerCase().trim()).includes(userEmail.toLowerCase().trim()) : false;

  // 2. REGRA DO RASCUNHO (DRAFT / MANUTENÇÃO):
  // Se o recurso estiver em RASCUNHO, ele fica TOTALMENTE OCULTO para os alunos,
  // mesmo que o aluno tenha acesso liberado no seu cadastro!
  // Apenas o Administrador e usuários adicionados na WhiteList da respectiva turma podem visualizar.
  if (!isPublished && !isWhitelisted) {
    return { allowed: false, visible: false, reason: 'Este recurso está em modo rascunho.' };
  }

  // 3. Checagem de Acesso (Recurso PUBLICADO ou usuário na WhiteList):
  let hasAccess = false;

  if (hasDirectAccess || isWhitelisted) {
    // Aluno possui acesso/matrícula direta liberada no seu cadastro
    hasAccess = true;
  } else if (hasFreePass) {
    // Aluno possui Free Pass (e o recurso não está marcado como 'excludeFromFreePass')
    if (!resource.excludeFromFreePass) {
      hasAccess = true;
    }
  }

  // Se não tem acesso direto nem via Free Pass, fica invisível
  if (!hasAccess) {
    return { allowed: false, visible: false, reason: 'Você não possui acesso a este recurso.' };
  }

  // 4. Checagem de Bloqueio (Cadeado / Liberação Programada):
  // O aluno possui acesso, mas o recurso está com cadeado e data de liberação futura.
  if (isBlocked) {
    return {
      allowed: false,
      visible: true,
      isBlocked: true,
      unlockDate: resource.releaseDate || resource.unlockDate || (resource as any).unlock_date,
      reason: 'Este recurso está bloqueado temporariamente.'
    };
  }

  return { allowed: true, visible: true };
}
