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
 * 1. Published / Draft status + Draft Whitelist
 * 2. Blocked status (visible with padlock)
 * 3. Exclude from Free Pass setting
 * 4. Regular access vs Free Pass
 */
export function canAccessResource(
  resource: SecurityResource,
  userEmail?: string,
  userRole?: string,
  hasFreePass?: boolean,
  hasDirectAccess?: boolean
): { allowed: boolean; visible: boolean; isBlocked?: boolean; unlockDate?: string; reason?: string } {
  // Admins always have access
  if (userRole === 'admin' || userEmail?.includes('admin')) {
    return { allowed: true, visible: true };
  }

  const isPublished = resource.published !== false && (resource as any).status !== 'draft';
  const isBlocked = (resource as any).status === 'blocked' || resource.blocked === true || (resource as any).isBlocked === true;
  const whitelist = resource.draftWhitelist || [];
  const isWhitelisted = userEmail ? whitelist.map(e => e.toLowerCase().trim()).includes(userEmail.toLowerCase().trim()) : false;

  // 1. Draft check: draft resources are not visible to non-whitelisted users
  if (!isPublished && !isWhitelisted) {
    return { allowed: false, visible: false, reason: 'Este recurso está em modo rascunho.' };
  }

  // 2. Check access
  let hasAccess = false;
  if (hasDirectAccess) {
    hasAccess = true;
  } else if (hasFreePass) {
    if (resource.excludeFromFreePass) {
      hasAccess = false;
    } else {
      hasAccess = true;
    }
  }

  if (!hasAccess && !isWhitelisted) {
    return { allowed: false, visible: false, reason: 'Você não possui acesso a este recurso.' };
  }

  // 3. Blocked check: student has access, but resource is blocked.
  // Visible with padlock/grayscale.
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
