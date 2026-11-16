import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';
import {
  AutentiqueFolder,
  AutentiqueClassSyncResult,
  AutentiqueSyncedContract,
} from '../types/autentique';

const parseJsonSafe = async (res: Response) => {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      res.status === 504
        ? 'O servidor atingiu o tempo limite neste lote. Clique novamente para continuar de onde parou.'
        : `Resposta inesperada do servidor (HTTP ${res.status}).`
    );
  }
};

export const autentiqueAdminService = {
  fetchFolders: async (): Promise<{
    configured: boolean;
    folders: AutentiqueFolder[];
    warning: string | null;
  }> => {
    const res = await fetch('/api/admin/autentique/folders');
    const data = await parseJsonSafe(res);
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Falha ao carregar pastas do Autentique.');
    }
    return {
      configured: Boolean(data.configured),
      folders: Array.isArray(data.folders) ? data.folders : [],
      warning: data.warning || null,
    };
  },

  syncClass: async (
    classId: string,
    maxNewProvisions: number = 25
  ): Promise<AutentiqueClassSyncResult> => {
    const res = await fetch('/api/admin/autentique/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classId, maxNewProvisions }),
    });
    const data = await parseJsonSafe(res);
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Falha ao sincronizar pasta no Autentique.');
    }
    return data.results?.[0];
  },

  syncAllClasses: async (maxNewProvisions: number = 25): Promise<AutentiqueClassSyncResult[]> => {
    const res = await fetch('/api/admin/autentique/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxNewProvisions }),
    });
    const data = await parseJsonSafe(res);
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Falha ao sincronizar turmas no Autentique.');
    }
    return Array.isArray(data.results) ? data.results : [];
  },

  resendSingleEmail: async (
    logId: string
  ): Promise<{ sent: boolean; mode: string; error?: string }> => {
    const res = await fetch('/api/admin/autentique/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resend', logId }),
    });
    const data = await parseJsonSafe(res);
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Falha ao reenviar e-mail de acesso.');
    }
    return {
      sent: Boolean(data.sent),
      mode: data.mode || 'ACCESS_NOTIFICATION',
      error: data.error,
    };
  },

  resendFailedEmails: async (
    classId: string
  ): Promise<{ resentSuccess: number; resentFailed: number; remainingFailed: number }> => {
    const res = await fetch('/api/admin/autentique/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resend_failed', classId }),
    });
    const data = await parseJsonSafe(res);
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Falha ao reenviar e-mails pendentes.');
    }
    return {
      resentSuccess: Number(data.resentSuccess) || 0,
      resentFailed: Number(data.resentFailed) || 0,
      remainingFailed: Number(data.remainingFailed) || 0,
    };
  },

  revokeContract: async (
    logId: string,
    blockFutureEmail: boolean = false
  ): Promise<{
    revoked: boolean;
    accessRevokedFromUser: boolean;
    userDeleted: boolean;
    studentEmail: string;
    studentName: string;
  }> => {
    const res = await fetch('/api/admin/autentique/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'revoke', logId, blockFutureEmail }),
    });
    const data = await parseJsonSafe(res);
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Falha ao revogar acesso do contrato.');
    }
    return {
      revoked: Boolean(data.revoked),
      accessRevokedFromUser: Boolean(data.accessRevokedFromUser),
      userDeleted: Boolean(data.userDeleted),
      studentEmail: data.studentEmail || '',
      studentName: data.studentName || '',
    };
  },

  fetchLogs: async (classId?: string): Promise<AutentiqueSyncedContract[]> => {
    try {
      const qs = classId ? `?classId=${encodeURIComponent(classId)}` : '';
      const res = await fetch(`/api/admin/autentique/logs${qs}`);
      if (res.ok) {
        const data = await parseJsonSafe(res);
        if (data.success && Array.isArray(data.logs)) {
          return data.logs;
        }
      }
    } catch (err) {
      console.warn('[autentiqueAdminService] Usando fallback direto no Firestore para logs:', err);
    }

    try {
      const colRef = collection(db, 'autentique_synced_contracts');
      const q = classId ? query(colRef, where('classId', '==', classId)) : colRef;
      const snap = await getDocs(q);
      const items: AutentiqueSyncedContract[] = snap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<AutentiqueSyncedContract, 'id'>),
      }));
      items.sort((a, b) => new Date(b.syncedAt || 0).getTime() - new Date(a.syncedAt || 0).getTime());
      return items;
    } catch {
      return [];
    }
  },
};
