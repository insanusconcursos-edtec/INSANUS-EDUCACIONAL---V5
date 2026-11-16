import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';
import {
  AutentiqueFolder,
  AutentiqueClassSyncResult,
  AutentiqueSyncedContract,
} from '../types/autentique';

export const autentiqueAdminService = {
  fetchFolders: async (): Promise<{
    configured: boolean;
    folders: AutentiqueFolder[];
    warning: string | null;
  }> => {
    const res = await fetch('/api/admin/autentique/folders');
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Falha ao carregar pastas do Autentique.');
    }
    return {
      configured: Boolean(data.configured),
      folders: Array.isArray(data.folders) ? data.folders : [],
      warning: data.warning || null,
    };
  },

  syncClass: async (classId: string): Promise<AutentiqueClassSyncResult> => {
    const res = await fetch('/api/admin/autentique/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classId }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Falha ao sincronizar pasta no Autentique.');
    }
    return data.results?.[0];
  },

  syncAllClasses: async (): Promise<AutentiqueClassSyncResult[]> => {
    const res = await fetch('/api/admin/autentique/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Falha ao sincronizar turmas no Autentique.');
    }
    return Array.isArray(data.results) ? data.results : [];
  },

  fetchLogs: async (classId?: string): Promise<AutentiqueSyncedContract[]> => {
    try {
      const qs = classId ? `?classId=${encodeURIComponent(classId)}` : '';
      const res = await fetch(`/api/admin/autentique/logs${qs}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.logs)) {
          return data.logs;
        }
      }
    } catch (err) {
      console.warn('[autentiqueAdminService] Usando fallback direto no Firestore para logs:', err);
    }

    // Fallback direto via Firestore SDK do cliente (caso esteja autenticado como admin)
    const colRef = collection(db, 'autentique_synced_contracts');
    const q = classId ? query(colRef, where('classId', '==', classId)) : colRef;
    const snap = await getDocs(q);
    const items: AutentiqueSyncedContract[] = snap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() as Omit<AutentiqueSyncedContract, 'id'>),
    }));
    items.sort((a, b) => new Date(b.syncedAt || 0).getTime() - new Date(a.syncedAt || 0).getTime());
    return items;
  },
};
