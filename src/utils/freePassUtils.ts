import { db } from '../services/firebase';
import { doc, getDoc } from 'firebase/firestore';

export interface SecurityResource {
  published?: boolean;
  draftWhitelist?: string[];
  excludeFromFreePass?: boolean;
}

/**
 * Checks if a user has active Free Pass.
 */
export async function checkUserHasFreePass(currentUser: any, userData?: any): Promise<boolean> {
  if (!currentUser) return false;
  if (currentUser.role === 'admin' || currentUser.email?.includes('admin') || userData?.role === 'admin') {
    return true;
  }
  if (userData?.freePass || userData?.isFreePass) {
    return true;
  }

  const accesses = userData?.access || currentUser.access || [];
  if (!Array.isArray(accesses) || accesses.length === 0) return false;

  for (const acc of accesses) {
    if (!acc.isActive) continue;
    if (acc.isFreePass || acc.type === 'free_pass') return true;

    if (acc.productId) {
      try {
        const prodRef = doc(db, 'products', acc.productId);
        const prodSnap = await getDoc(prodRef);
        if (prodSnap.exists()) {
          const prodData = prodSnap.data();
          if (prodData.isFreePass) return true;
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
 * 1. Published / Draft status + Draft Whitelist
 * 2. Exclude from Free Pass setting
 * 3. Regular access vs Free Pass
 */
export function canAccessResource(
  resource: SecurityResource,
  userEmail?: string,
  userRole?: string,
  hasFreePass?: boolean,
  hasDirectAccess?: boolean
): { allowed: boolean; reason?: string } {
  // Admins always have access
  if (userRole === 'admin' || userEmail?.includes('admin')) {
    return { allowed: true };
  }

  const isPublished = resource.published !== false; // default true if undefined
  const whitelist = resource.draftWhitelist || [];
  const isWhitelisted = userEmail ? whitelist.map(e => e.toLowerCase().trim()).includes(userEmail.toLowerCase().trim()) : false;

  // 1. Draft check
  if (!isPublished && !isWhitelisted) {
    return { allowed: false, reason: 'Este recurso está em modo rascunho.' };
  }

  // 2. Direct access always grants access
  if (hasDirectAccess) {
    return { allowed: true };
  }

  // 3. Free Pass check
  if (hasFreePass) {
    if (resource.excludeFromFreePass) {
      return { allowed: false, reason: 'Este recurso está excluído do Passe Livre (Free Pass).' };
    }
    return { allowed: true };
  }

  return { allowed: false, reason: 'Você não possui acesso a este recurso.' };
}
