import crypto from 'crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminConfig } from './firebaseAdmin.js';
import { sendWelcomeEmail, sendAccessNotificationEmail } from './emailService.js';
import {
  AutentiqueFolder,
  AutentiqueClassSyncResult,
  AutentiqueFolderXRay,
  AutentiquePendingDocItem,
  AutentiqueProvisionAction,
  AutentiqueRevokeReason,
  AutentiqueSyncedContract,
  AutentiqueTriggerSource,
} from '../../../types/autentique.js';

const AUTENTIQUE_GRAPHQL_URL = 'https://api.autentique.com.br/v2/graphql';
const DEFAULT_ACCESS_DAYS = 60;
const DEFAULT_MAX_NEW_PROVISIONS_PER_BATCH = 25;
const SYNC_LOGS_COLLECTION = 'autentique_synced_contracts';

interface AutentiqueSignatureNode {
  public_id?: string;
  name?: string | null;
  email?: string | null;
  action?: { name?: string | null } | null;
  user?: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  signed?: {
    created_at?: string | null;
  } | null;
}

interface AutentiqueDocumentNode {
  id: string;
  name: string;
  created_at?: string | null;
  deleted_at?: string | null;
  signatures?: AutentiqueSignatureNode[];
}

let cachedOwnerEmail: { email: string; expiresAt: number } | null = null;

export const isAutentiqueConfigured = (): boolean => {
  return Boolean(process.env.AUTENTIQUE_API_TOKEN && process.env.AUTENTIQUE_API_TOKEN.trim().length > 0);
};

const generateRandomPassword = (length: number = 8): string => {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let result = '';
  const randomBytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += charset[randomBytes[i] % charset.length];
  }
  return result;
};

const executeAutentiqueGraphQL = async <T = any>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> => {
  const token = (process.env.AUTENTIQUE_API_TOKEN || '').trim();
  if (!token) {
    throw new Error('AUTENTIQUE_API_TOKEN não está configurado nas variáveis de ambiente do servidor.');
  }

  const response = await fetch(AUTENTIQUE_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(variables ? { query, variables } : { query }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Autentique API HTTP ${response.status}: ${text || response.statusText}`);
  }

  const json = (await response.json()) as { data?: T; errors?: Array<{ message?: string }> };
  if (json.errors && json.errors.length > 0 && !json.data) {
    throw new Error(`Autentique GraphQL Error: ${json.errors.map((e) => e.message).join('; ')}`);
  }

  return (json.data || {}) as T;
};

const getAutentiqueAccountOwnerEmail = async (): Promise<string> => {
  if (cachedOwnerEmail && Date.now() < cachedOwnerEmail.expiresAt) {
    return cachedOwnerEmail.email;
  }

  try {
    // Na API GraphQL v2 do Autentique, o titular autenticado é retornado pela query raiz `me`
    const data = await executeAutentiqueGraphQL<{ me?: { id?: string; name?: string; email?: string } }>(
      `query { me { id name email } }`
    );
    const ownerEmail = (data?.me?.email || '').trim().toLowerCase();
    cachedOwnerEmail = {
      email: ownerEmail,
      expiresAt: Date.now() + 10 * 60 * 1000,
    };
    return ownerEmail;
  } catch (err) {
    console.warn('[Autentique] Aviso ao consultar query `me` do titular da conta:', err);
    cachedOwnerEmail = {
      email: '',
      expiresAt: Date.now() + 2 * 60 * 1000,
    };
    return '';
  }
};

const sanitizeFolderId = (folderId: string): string => {
  return String(folderId || '').replace(/[^a-zA-Z0-9_-]/g, '');
};

export const listAutentiqueFolders = async (): Promise<{
  configured: boolean;
  folders: AutentiqueFolder[];
  error?: string;
}> => {
  if (!isAutentiqueConfigured()) {
    return {
      configured: false,
      folders: [],
      error: 'Variável AUTENTIQUE_API_TOKEN ainda não configurada no servidor.',
    };
  }

  try {
    const allFolders: AutentiqueFolder[] = [];
    let page = 1;
    const maxPages = 10;

    while (page <= maxPages) {
      let resultData: {
        folders?: {
          data?: Array<{ id: string; name: string; path?: string | null; context?: string | null }>;
          has_more_pages?: boolean;
        };
      };

      try {
        resultData = await executeAutentiqueGraphQL(
          `query ListFolders($limit: Int!, $page: Int!) {
            folders(limit: $limit, page: $page) {
              total
              has_more_pages
              data {
                id
                name
                path
                context
              }
            }
          }`,
          { limit: 60, page }
        );
      } catch {
        resultData = await executeAutentiqueGraphQL(
          `query ListFoldersBasic($limit: Int!, $page: Int!) {
            folders(limit: $limit, page: $page) {
              has_more_pages
              data {
                id
                name
              }
            }
          }`,
          { limit: 60, page }
        );
      }

      const pageItems = resultData?.folders?.data || [];
      for (const item of pageItems) {
        if (item?.id && item?.name) {
          allFolders.push({
            id: item.id,
            name: item.name,
            path: item.path || null,
            context: item.context || null,
          });
        }
      }

      if (!resultData?.folders?.has_more_pages || pageItems.length === 0) {
        break;
      }
      page += 1;
    }

    allFolders.sort((a, b) => (a.path || a.name).localeCompare(b.path || b.name, 'pt-BR'));

    return {
      configured: true,
      folders: allFolders,
    };
  } catch (error: any) {
    console.error('[Autentique] Erro ao listar pastas:', error);
    return {
      configured: true,
      folders: [],
      error: error?.message || 'Falha ao consultar pastas no Autentique.',
    };
  }
};

const fetchDocumentsInFolder = async (
  folderId: string
): Promise<{
  activeDocuments: AutentiqueDocumentNode[];
  deletedDocumentIds: Set<string>;
}> => {
  const safeFolderId = sanitizeFolderId(folderId);
  if (!safeFolderId) {
    return { activeDocuments: [], deletedDocumentIds: new Set<string>() };
  }

  const activeDocuments: AutentiqueDocumentNode[] = [];
  const deletedDocumentIds = new Set<string>();
  let page = 1;
  const maxPages = 30;

  while (page <= maxPages) {
    let data: {
      documentsByFolder?: {
        data?: AutentiqueDocumentNode[];
        has_more_pages?: boolean;
      };
    };

    try {
      data = await executeAutentiqueGraphQL(
        `query {
          documentsByFolder(folder_id: "${safeFolderId}", limit: 60, page: ${page}) {
            has_more_pages
            data {
              id
              name
              created_at
              deleted_at
              signatures {
                public_id
                name
                email
                action { name }
                user { id name email phone }
                signed { created_at }
              }
            }
          }
        }`
      );
    } catch {
      data = await executeAutentiqueGraphQL(
        `query {
          documentsByFolder(folder_id: "${safeFolderId}", limit: 60, page: ${page}) {
            has_more_pages
            data {
              id
              name
              created_at
              deleted_at
              signatures {
                public_id
                name
                email
                action { name }
                signed { created_at }
              }
            }
          }
        }`
      );
    }

    const items = data?.documentsByFolder?.data || [];
    for (const doc of items) {
      if (!doc?.id) continue;
      if (doc.deleted_at) {
        deletedDocumentIds.add(doc.id);
      } else {
        activeDocuments.push(doc);
      }
    }

    if (!data?.documentsByFolder?.has_more_pages || items.length === 0) {
      break;
    }
    page += 1;
  }

  return { activeDocuments, deletedDocumentIds };
};

const isInternalEmail = (
  email: string,
  ownerEmail: string,
  extraIgnoredEmails: string[]
): boolean => {
  if (!email) return false;
  if (ownerEmail && email === ownerEmail) return true;
  if (
    email.endsWith('@insanus.com.br') ||
    email.endsWith('@portal-insanus.com') ||
    email.endsWith('@insanuseducacional.com.br') ||
    email.startsWith('insanusconcursos@') ||
    email === (process.env.SMTP_USER || '').trim().toLowerCase()
  ) {
    return true;
  }
  if (extraIgnoredEmails.includes(email)) return true;
  return false;
};

type SignerClassification =
  | 'INTERNAL_OR_NON_SIGN'
  | 'UNSIGNED_STUDENT'
  | 'SIGNED_MISSING_EMAIL'
  | 'SIGNED_STUDENT';

const classifySigner = (
  sig: AutentiqueSignatureNode,
  ownerEmail: string,
  extraIgnoredEmails: string[]
): SignerClassification => {
  const actionName = (sig.action?.name || 'SIGN').toUpperCase();
  // Ignora testemunhas, aprovadores ou reconhecedores
  if (actionName !== 'SIGN') {
    return 'INTERNAL_OR_NON_SIGN';
  }

  const email = (sig.email || sig.user?.email || '').trim().toLowerCase();
  if (email && isInternalEmail(email, ownerEmail, extraIgnoredEmails)) {
    return 'INTERNAL_OR_NON_SIGN';
  }

  const hasSigned = Boolean(sig.signed?.created_at);
  if (!hasSigned) {
    return 'UNSIGNED_STUDENT';
  }

  if (!email || !email.includes('@')) {
    return 'SIGNED_MISSING_EMAIL';
  }

  return 'SIGNED_STUDENT';
};

const buildSyncDocId = (classId: string, documentId: string, normalizedEmail: string): string => {
  const emailHash = crypto.createHash('sha256').update(normalizedEmail).digest('hex').slice(0, 20);
  const safeDocId = String(documentId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  const safeClassId = String(classId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  return `${safeClassId}_${safeDocId}_${emailHash}`;
};

const resolveDisplayName = (rawName: string | null | undefined, email: string, docName: string): string => {
  const cleaned = (rawName || '').trim();
  if (cleaned.length >= 2) {
    return cleaned;
  }
  const parts = docName.split(/[-–—]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const candidate = parts[parts.length - 1].replace(/\.pdf$/i, '').trim();
    if (candidate.length >= 3 && !/contrato|turma|insanus|\d{4}/i.test(candidate)) {
      return candidate;
    }
  }
  const localPart = email.split('@')[0] || 'Aluno';
  return localPart
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase());
};

const resolvePendingSignerName = (sig: AutentiqueSignatureNode, docName: string): string => {
  const explicitName = (sig.user?.name || sig.name || '').trim();
  if (explicitName.length >= 2) {
    return explicitName;
  }
  const parts = docName
    .replace(/\.pdf$/i, '')
    .split(/[-–—_]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    const candidate = parts[parts.length - 1];
    if (
      candidate.length >= 3 &&
      !/contrato|turma|presencial|pc\.?ac|insanus|\d{4}/i.test(candidate)
    ) {
      return `${candidate} (identificado pelo título)`;
    }
  }
  return 'Signatário sem nome preenchido (link)';
};

const isTimestampStillValid = (val: any): boolean => {
  if (!val) return false;
  let dateObj: Date | null = null;
  if (typeof val.toDate === 'function') {
    dateObj = val.toDate();
  } else if (val._seconds || val.seconds) {
    dateObj = new Date((val._seconds || val.seconds) * 1000);
  } else {
    const parsed = new Date(val);
    if (!isNaN(parsed.getTime())) dateObj = parsed;
  }
  return Boolean(dateObj && dateObj.getTime() > Date.now());
};

export const revokeAutentiqueContractEnrollment = async (
  logId: string,
  blockFutureEmailOrOptions:
    | boolean
    | {
        blockFutureEmail?: boolean;
        reason?: AutentiqueRevokeReason;
        skipUserAccessRevoke?: boolean;
        deleteLogDoc?: boolean;
      } = false
): Promise<{
  revoked: boolean;
  accessRevokedFromUser: boolean;
  userDeleted: boolean;
  studentEmail: string;
  studentName: string;
}> => {
  const opts =
    typeof blockFutureEmailOrOptions === 'boolean'
      ? { blockFutureEmail: blockFutureEmailOrOptions }
      : blockFutureEmailOrOptions || {};

  const blockFutureEmail = Boolean(opts.blockFutureEmail);
  const reason: AutentiqueRevokeReason = opts.reason || 'MANUAL_ADMIN';
  const skipUserAccessRevoke = Boolean(opts.skipUserAccessRevoke);
  const deleteLogDoc = Boolean(opts.deleteLogDoc);

  const { dbAdmin } = getAdminConfig();
  const logRef = dbAdmin.collection(SYNC_LOGS_COLLECTION).doc(logId);
  const logSnap = await logRef.get();

  if (!logSnap.exists) {
    throw new Error('Registro de contrato não encontrado.');
  }

  const logData = logSnap.data() as Omit<AutentiqueSyncedContract, 'id'>;
  const classId = String(logData.classId || '').trim();
  const documentId = String(logData.documentId || '').trim();
  const studentUid = String(logData.studentUid || '').trim();
  const studentEmail = String(logData.studentEmail || '').trim().toLowerCase();
  const studentName = String(logData.studentName || studentEmail || 'Usuário');

  let targetUid: string | null = null;
  let userData: Record<string, any> | null = null;

  if (studentUid) {
    const userDoc = await dbAdmin.collection('users').doc(studentUid).get();
    if (userDoc.exists) {
      targetUid = userDoc.id;
      userData = userDoc.data() || null;
    }
  }

  if (!targetUid && studentEmail) {
    const snapByEmail = await dbAdmin
      .collection('users')
      .where('email', '==', studentEmail)
      .limit(1)
      .get();
    if (!snapByEmail.empty) {
      targetUid = snapByEmail.docs[0].id;
      userData = snapByEmail.docs[0].data() || null;
    }
  }

  let accessRevokedFromUser = false;

  // IMPORTANTE: Nunca exclui o cadastro/conta do aluno no portal; revoga estritamente o recurso da turma liberado pelo contrato!
  if (!skipUserAccessRevoke && targetUid && userData) {
    const currentAccess: any[] = Array.isArray(userData.access) ? userData.access : [];
    const remainingAccess = currentAccess.filter((acc: any) => {
      const matchesClass = acc?.targetId === classId || acc?.classId === classId;
      if (!matchesClass) return true;
      if (acc?.autentiqueDocumentId && documentId) {
        return acc.autentiqueDocumentId !== documentId;
      }
      if (acc?.origin === 'AUTENTIQUE') {
        return false;
      }
      return true;
    });

    if (remainingAccess.length !== currentAccess.length) {
      await dbAdmin.collection('users').doc(targetUid).update({
        access: remainingAccess,
        updatedAt: FieldValue.serverTimestamp(),
      });
      accessRevokedFromUser = true;
    }
  }

  if (blockFutureEmail && classId && studentEmail) {
    await dbAdmin
      .collection('classes')
      .doc(classId)
      .update({
        autentiqueIgnoreEmails: FieldValue.arrayUnion(studentEmail),
      })
      .catch(() => {});
  }

  const nowIso = new Date().toISOString();
  if (deleteLogDoc) {
    await logRef.delete();
  } else {
    await logRef.update({
      accessRevoked: true,
      missingFromFolder:
        reason === 'CONTRACT_REMOVED_FROM_FOLDER' ? true : Boolean(logData.missingFromFolder),
      missingDetectedAt:
        reason === 'CONTRACT_REMOVED_FROM_FOLDER'
          ? logData.missingDetectedAt || nowIso
          : logData.missingDetectedAt || null,
      revokedAt: nowIso,
      revokeReason: reason,
    });
  }

  return {
    revoked: true,
    accessRevokedFromUser,
    userDeleted: false,
    studentEmail,
    studentName,
  };
};

const provisionStudentForSignedContract = async (params: {
  syncDocId: string;
  classId: string;
  className: string;
  folderId: string;
  folderName?: string | null;
  accessDays: number;
  doc: AutentiqueDocumentNode;
  sig: AutentiqueSignatureNode;
  triggerSource: AutentiqueTriggerSource;
}): Promise<{
  status: AutentiqueProvisionAction;
  emailSent: boolean;
  emailError?: string;
}> => {
  const { dbAdmin, authAdmin } = getAdminConfig();
  const normalizedEmail = (params.sig.email || params.sig.user?.email || '').trim().toLowerCase();
  const syncRef = dbAdmin.collection(SYNC_LOGS_COLLECTION).doc(params.syncDocId);

  const studentName = resolveDisplayName(
    params.sig.user?.name || params.sig.name,
    normalizedEmail,
    params.doc.name
  );
  const nameParts = studentName.split(' ').filter(Boolean);
  const firstName = nameParts[0] || studentName;
  const lastName = nameParts.slice(1).join(' ');
  const cleanPhone = (params.sig.user?.phone || '').replace(/\D/g, '');

  const days = params.accessDays > 0 ? params.accessDays : DEFAULT_ACCESS_DAYS;
  const now = new Date();
  const expirationDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const newAccessEntry = {
    id: `aut_${params.doc.id.slice(0, 10)}_${Date.now()}`,
    type: 'presential_class',
    targetId: params.classId,
    classId: params.classId,
    externalId: `autentique_${params.doc.id}`,
    title: params.className,
    days,
    isScholarship: false,
    isActive: true,
    origin: 'AUTENTIQUE',
    autentiqueDocumentId: params.doc.id,
    diaInicio: Timestamp.fromDate(now),
    diaFim: Timestamp.fromDate(expirationDate),
    startDate: Timestamp.fromDate(now),
    endDate: Timestamp.fromDate(expirationDate),
  };

  let uid: string | null = null;
  let existingUserDocData: Record<string, any> | null = null;

  try {
    const authUser = await authAdmin.getUserByEmail(normalizedEmail);
    uid = authUser.uid;
  } catch (err: any) {
    if (err?.code !== 'auth/user-not-found') {
      throw err;
    }
  }

  if (uid) {
    const userDoc = await dbAdmin.collection('users').doc(uid).get();
    if (userDoc.exists) {
      existingUserDocData = userDoc.data() || null;
    }
  } else {
    const userByEmailSnap = await dbAdmin
      .collection('users')
      .where('email', '==', normalizedEmail)
      .limit(1)
      .get();

    if (!userByEmailSnap.empty) {
      const matchedDoc = userByEmailSnap.docs[0];
      uid = matchedDoc.id;
      existingUserDocData = matchedDoc.data();
    }
  }

  let actionTaken: AutentiqueProvisionAction = 'CREATED_AND_RELEASED';
  let emailSent = true;
  let emailError: string | undefined;

  if (!uid) {
    // CASO 1: ALUNO NÃO CADASTRADO -> Criar no Auth + Firestore + Liberar Turma + E-mail individual com senha exclusiva
    const tempPassword = generateRandomPassword(8);
    const createdAuth = await authAdmin.createUser({
      email: normalizedEmail,
      password: tempPassword,
      displayName: studentName,
    });
    uid = createdAuth.uid;

    await dbAdmin.collection('users').doc(uid).set({
      uid,
      name: studentName,
      firstName,
      lastName,
      email: normalizedEmail,
      cpf: '',
      whatsapp: cleanPhone,
      phone: cleanPhone,
      role: 'student',
      status: 'active',
      origin: 'AUTENTIQUE',
      photoUrl: null,
      access: [newAccessEntry],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const mailRes = await sendWelcomeEmail(studentName, normalizedEmail, tempPassword, params.className);
    emailSent = mailRes.sent;
    emailError = mailRes.error;
    actionTaken = 'CREATED_AND_RELEASED';
  } else {
    // CASO 2: ALUNO JÁ CADASTRADO -> Preservar senha atual e liberar a turma presencial
    let createdFallbackPassword: string | null = null;
    try {
      await authAdmin.getUser(uid);
    } catch (authErr: any) {
      if (authErr?.code === 'auth/user-not-found') {
        createdFallbackPassword = generateRandomPassword(8);
        await authAdmin.createUser({
          uid,
          email: normalizedEmail,
          password: createdFallbackPassword,
          displayName: existingUserDocData?.name || studentName,
        });
      }
    }

    const currentAccess: any[] = Array.isArray(existingUserDocData?.access)
      ? [...existingUserDocData!.access]
      : [];

    const existingClassIdx = currentAccess.findIndex(
      (acc: any) =>
        (acc.type === 'presential_class' || acc.classId === params.classId) &&
        (acc.targetId === params.classId || acc.classId === params.classId)
    );

    const alreadyActiveAndValid =
      existingClassIdx >= 0 &&
      currentAccess[existingClassIdx]?.isActive !== false &&
      isTimestampStillValid(
        currentAccess[existingClassIdx]?.diaFim || currentAccess[existingClassIdx]?.endDate
      );

    if (alreadyActiveAndValid) {
      actionTaken = 'ALREADY_HAD_ACCESS';
      emailSent = true;
    } else {
      if (existingClassIdx >= 0) {
        currentAccess[existingClassIdx] = {
          ...currentAccess[existingClassIdx],
          ...newAccessEntry,
        };
      } else {
        currentAccess.push(newAccessEntry);
      }

      const updatePayload: Record<string, any> = {
        uid,
        email: normalizedEmail,
        status: 'active',
        access: currentAccess,
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (!existingUserDocData) {
        updatePayload.name = studentName;
        updatePayload.firstName = firstName;
        updatePayload.lastName = lastName;
        updatePayload.role = 'student';
        updatePayload.cpf = '';
        updatePayload.whatsapp = cleanPhone;
        updatePayload.phone = cleanPhone;
        updatePayload.createdAt = FieldValue.serverTimestamp();
      } else if (cleanPhone && !existingUserDocData.whatsapp && !existingUserDocData.phone) {
        updatePayload.whatsapp = cleanPhone;
        updatePayload.phone = cleanPhone;
      }

      await dbAdmin.collection('users').doc(uid).set(updatePayload, { merge: true });

      const recipientName = existingUserDocData?.name || studentName;
      const mailRes = createdFallbackPassword
        ? await sendWelcomeEmail(recipientName, normalizedEmail, createdFallbackPassword, params.className)
        : await sendAccessNotificationEmail(recipientName, normalizedEmail, params.className);

      emailSent = mailRes.sent;
      emailError = mailRes.error;
      actionTaken = 'EXISTING_USER_RELEASED';
    }
  }

  const logRecord: Omit<AutentiqueSyncedContract, 'id'> = {
    classId: params.classId,
    className: params.className,
    folderId: params.folderId,
    folderName: params.folderName || null,
    documentId: params.doc.id,
    documentName: params.doc.name || 'Contrato sem título',
    signerPublicId: params.sig.public_id || null,
    studentUid: uid,
    studentName: existingUserDocData?.name || studentName,
    studentEmail: normalizedEmail,
    studentPhone: cleanPhone || existingUserDocData?.whatsapp || existingUserDocData?.phone || '',
    accessDays: days,
    signedAt: params.sig.signed?.created_at || new Date().toISOString(),
    syncedAt: new Date().toISOString(),
    triggerSource: params.triggerSource,
    actionTaken,
    emailSent,
    emailError: emailError || null,
    missingFromFolder: false,
    missingDetectedAt: null,
    accessRevoked: false,
    revokedAt: null,
    revokeReason: null,
  };

  await syncRef.set(logRecord);

  return { status: actionTaken, emailSent, emailError };
};

export const syncClassAutentiqueFolder = async (
  classId: string,
  triggerSource: AutentiqueTriggerSource = 'MANUAL_SYNC',
  maxNewProvisions: number = DEFAULT_MAX_NEW_PROVISIONS_PER_BATCH
): Promise<AutentiqueClassSyncResult> => {
  const { dbAdmin } = getAdminConfig();
  const classRef = dbAdmin.collection('classes').doc(classId);
  const classSnap = await classRef.get();

  if (!classSnap.exists) {
    throw new Error('Turma presencial não encontrada.');
  }

  const classData = classSnap.data() || {};
  const folderId = String(classData.autentiqueFolderId || '').trim();
  const className = String(classData.name || 'Turma Presencial');
  const accessDays =
    Number(classData.autentiqueAccessDays) > 0
      ? Number(classData.autentiqueAccessDays)
      : DEFAULT_ACCESS_DAYS;

  if (!folderId) {
    throw new Error(`A turma "${className}" não possui uma pasta do Autentique vinculada.`);
  }

  if (!isAutentiqueConfigured()) {
    throw new Error('AUTENTIQUE_API_TOKEN não está configurado nas variáveis de ambiente do servidor.');
  }

  const [ownerEmail, folderFetchResult, existingLogsSnap] = await Promise.all([
    getAutentiqueAccountOwnerEmail(),
    fetchDocumentsInFolder(folderId),
    dbAdmin.collection(SYNC_LOGS_COLLECTION).where('classId', '==', classId).get(),
  ]);

  const { activeDocuments: documents } = folderFetchResult;

  // Set em memória com os contratos ativos já processados (contratos revogados por saída da pasta podem ser reativados se voltarem à pasta)
  const syncedIdsSet = new Set<string>();
  existingLogsSnap.docs.forEach((d) => {
    const dData = d.data();
    const wasAutoRevokedByFolderRemoval =
      dData?.accessRevoked === true && dData?.revokeReason === 'CONTRACT_REMOVED_FROM_FOLDER';
    if (!wasAutoRevokedByFolderRemoval) {
      syncedIdsSet.add(d.id);
    }
  });

  const extraIgnoredEmails: string[] = Array.isArray(classData.autentiqueIgnoreEmails)
    ? classData.autentiqueIgnoreEmails.map((e: string) => String(e).trim().toLowerCase()).filter(Boolean)
    : [];

  // Autocorreção para e-mail titular da conta ou e-mails corporativos ignorados
  let purgedInvalidEnrollments = 0;
  for (const existingDoc of existingLogsSnap.docs) {
    const logData = existingDoc.data();
    const logEmail = String(logData?.studentEmail || '').trim().toLowerCase();

    if (logEmail && isInternalEmail(logEmail, ownerEmail, extraIgnoredEmails)) {
      try {
        const revokeRes = await revokeAutentiqueContractEnrollment(existingDoc.id, {
          deleteLogDoc: true,
        });
        if (revokeRes.revoked) {
          syncedIdsSet.delete(existingDoc.id);
          purgedInvalidEnrollments += 1;
          console.log(`[Autentique] Acesso interno removido automaticamente: ${logEmail}`);
        }
      } catch (purgeErr) {
        console.warn(`[Autentique] Aviso ao limpar registro interno ${existingDoc.id}:`, purgeErr);
      }
    }
  }

  const unsignedItems: AutentiquePendingDocItem[] = [];
  const missingEmailItems: AutentiquePendingDocItem[] = [];
  const activeSignedDocIds = new Set<string>();
  const activeSignedStudentEmails = new Set<string>();

  const summary: AutentiqueClassSyncResult = {
    classId,
    className,
    folderId,
    folderName: classData.autentiqueFolderName || null,
    accessDays,
    scannedDocuments: documents.length,
    unsignedDocuments: 0,
    missingEmailSigners: 0,
    signedStudentContractsFound: 0,
    activeSignedDocumentIds: [],
    missingFromFolderCount: 0,
    autoRevokedContracts: 0,
    unsignedItems,
    missingEmailItems,
    purgedInvalidEnrollments,
    newlyCreatedStudents: 0,
    existingReleasedStudents: 0,
    alreadySyncedSkipped: 0,
    remainingPendingToSync: 0,
    hasMoreToSync: false,
    emailFailures: 0,
    errors: [],
  };

  let newProvisionsProcessed = 0;
  const safeBatchLimit = maxNewProvisions > 0 ? maxNewProvisions : DEFAULT_MAX_NEW_PROVISIONS_PER_BATCH;

  for (const doc of documents) {
    const signatures = Array.isArray(doc.signatures) ? doc.signatures : [];
    const signedStudentSigs: AutentiqueSignatureNode[] = [];
    const signedMissingEmailSigs: AutentiqueSignatureNode[] = [];
    const unsignedStudentSigs: AutentiqueSignatureNode[] = [];

    for (const sig of signatures) {
      const classification = classifySigner(sig, ownerEmail, extraIgnoredEmails);
      if (classification === 'SIGNED_STUDENT') {
        signedStudentSigs.push(sig);
      } else if (classification === 'SIGNED_MISSING_EMAIL') {
        signedMissingEmailSigs.push(sig);
      } else if (classification === 'UNSIGNED_STUDENT') {
        unsignedStudentSigs.push(sig);
      }
    }

    // Classificação estritamente por DOCUMENTO (soma exata: Assinados c/ E-mail + Assinados Sem E-mail + Aguardando = Total na Pasta)
    if (signedStudentSigs.length > 0) {
      summary.signedStudentContractsFound += 1;
      activeSignedDocIds.add(doc.id);

      for (const sig of signedStudentSigs) {
        const normalizedEmail = (sig.email || sig.user?.email || '').trim().toLowerCase();
        if (normalizedEmail) {
          activeSignedStudentEmails.add(normalizedEmail);
        }
        const syncDocId = buildSyncDocId(classId, doc.id, normalizedEmail);

        if (syncedIdsSet.has(syncDocId)) {
          summary.alreadySyncedSkipped += 1;
          continue;
        }

        // Controle de lote anti-timeout da Vercel
        if (newProvisionsProcessed >= safeBatchLimit) {
          summary.remainingPendingToSync += 1;
          continue;
        }

        newProvisionsProcessed += 1;
        syncedIdsSet.add(syncDocId);

        try {
          const res = await provisionStudentForSignedContract({
            syncDocId,
            classId,
            className,
            folderId,
            folderName: classData.autentiqueFolderName || null,
            accessDays,
            doc,
            sig,
            triggerSource,
          });

          if (!res.emailSent) {
            summary.emailFailures += 1;
          }

          if (res.status === 'CREATED_AND_RELEASED') {
            summary.newlyCreatedStudents += 1;
          } else if (res.status === 'EXISTING_USER_RELEASED' || res.status === 'ALREADY_HAD_ACCESS') {
            summary.existingReleasedStudents += 1;
          }
        } catch (err: any) {
          const signerEmail = sig.email || sig.user?.email || 'desconhecido';
          console.error(`[Autentique] Erro ao provisionar aluno (${signerEmail}) no doc ${doc.id}:`, err);
          summary.errors.push(`${signerEmail}: ${err?.message || 'Erro ao liberar acesso'}`);
        }
      }
    } else if (signedMissingEmailSigs.length > 0) {
      summary.missingEmailSigners += 1;
      missingEmailItems.push({
        documentId: doc.id,
        documentName: doc.name || 'Contrato sem título',
        createdAt: doc.created_at || null,
        signedAt: signedMissingEmailSigs[0]?.signed?.created_at || null,
        signers: signedMissingEmailSigs.map((s) => ({
          name: resolvePendingSignerName(s, doc.name || ''),
          email: null,
          phone: (s.user?.phone || '').trim() || null,
          signedAt: s.signed?.created_at || null,
        })),
      });
    } else {
      summary.unsignedDocuments += 1;
      unsignedItems.push({
        documentId: doc.id,
        documentName: doc.name || 'Contrato sem título',
        createdAt: doc.created_at || null,
        signedAt: null,
        signers:
          unsignedStudentSigs.length > 0
            ? unsignedStudentSigs.map((s) => ({
                name: resolvePendingSignerName(s, doc.name || ''),
                email: (s.email || s.user?.email || '').trim().toLowerCase() || null,
                phone: (s.user?.phone || '').trim() || null,
                signedAt: null,
              }))
            : [
                {
                  name: 'Aguardando assinatura do aluno',
                  email: null,
                  phone: null,
                  signedAt: null,
                },
              ],
      });
    }
  }

  missingEmailItems.sort((a, b) => a.documentName.localeCompare(b.documentName, 'pt-BR'));
  unsignedItems.sort((a, b) => a.documentName.localeCompare(b.documentName, 'pt-BR'));

  summary.hasMoreToSync = summary.remainingPendingToSync > 0;

  const nowIso = new Date().toISOString();
  const activeSignedDocumentIds = Array.from(activeSignedDocIds);
  summary.activeSignedDocumentIds = activeSignedDocumentIds;

  // Revoga automaticamente o acesso à turma presencial para contratos removidos/cancelados na pasta do Autentique (mantendo a conta do aluno intacta)
  let missingFromFolderCount = 0;
  let autoRevokedContracts = 0;

  for (const existingDoc of existingLogsSnap.docs) {
    const logData = existingDoc.data();
    const logEmail = String(logData?.studentEmail || '').trim().toLowerCase();
    if (logEmail && isInternalEmail(logEmail, ownerEmail, extraIgnoredEmails)) {
      continue;
    }

    const logDocId = String(logData?.documentId || '').trim();
    const isMissingNow = Boolean(logDocId && !activeSignedDocIds.has(logDocId));

    if (isMissingNow) {
      missingFromFolderCount += 1;
      if (logData?.accessRevoked !== true) {
        try {
          // Se o mesmo aluno possuir outro contrato assinado ativo na pasta, mantém o acesso e apenas marca este contrato antigo como revogado
          const hasAnotherActiveContract = Boolean(
            logEmail && activeSignedStudentEmails.has(logEmail)
          );
          await revokeAutentiqueContractEnrollment(existingDoc.id, {
            reason: 'CONTRACT_REMOVED_FROM_FOLDER',
            skipUserAccessRevoke: hasAnotherActiveContract,
          });
          autoRevokedContracts += 1;
          console.log(
            `[Autentique] Acesso da turma revogado automaticamente por remoção/cancelamento do contrato (${logEmail})`
          );
        } catch (revErr) {
          console.error(`[Autentique] Falha ao revogar acesso do contrato removido ${existingDoc.id}:`, revErr);
        }
      }
    } else if (logData?.missingFromFolder === true && logData?.accessRevoked !== true) {
      await existingDoc.ref
        .update({
          missingFromFolder: false,
          missingDetectedAt: null,
        })
        .catch(() => {});
    }
  }

  summary.missingFromFolderCount = missingFromFolderCount;
  summary.autoRevokedContracts = autoRevokedContracts;

  const xraySnapshot: AutentiqueFolderXRay = {
    scannedDocuments: summary.scannedDocuments,
    signedStudentContractsFound: summary.signedStudentContractsFound,
    unsignedDocuments: summary.unsignedDocuments,
    missingEmailSigners: summary.missingEmailSigners,
    activeSignedDocumentIds: activeSignedDocumentIds.slice(0, 1000),
    unsignedItems: unsignedItems.slice(0, 500),
    missingEmailItems: missingEmailItems.slice(0, 500),
    updatedAt: nowIso,
  };

  await classRef.update({
    autentiqueLastSyncedAt: nowIso,
    autentiqueLastXRay: xraySnapshot,
  });

  return summary;
};

export const resendAutentiqueContractEmail = async (
  logId: string
): Promise<{ sent: boolean; mode: 'WELCOME_NEW_PASSWORD' | 'ACCESS_NOTIFICATION'; error?: string }> => {
  const { dbAdmin, authAdmin } = getAdminConfig();
  const logRef = dbAdmin.collection(SYNC_LOGS_COLLECTION).doc(logId);
  const logSnap = await logRef.get();

  if (!logSnap.exists) {
    throw new Error('Registro de contrato não encontrado.');
  }

  const logData = logSnap.data() as Omit<AutentiqueSyncedContract, 'id'>;
  const email = (logData.studentEmail || '').trim().toLowerCase();
  const name = logData.studentName || 'Aluno';
  const className = logData.className || 'Turma Presencial';

  if (!email) {
    throw new Error('E-mail do aluno inválido no registro.');
  }

  let authUser: any = null;
  try {
    authUser = logData.studentUid
      ? await authAdmin.getUser(logData.studentUid)
      : await authAdmin.getUserByEmail(email);
  } catch {
    authUser = await authAdmin.getUserByEmail(email);
  }

  const neverSignedIn = !authUser?.metadata?.lastSignInTime;

  if (neverSignedIn && logData.actionTaken === 'CREATED_AND_RELEASED') {
    const freshPassword = generateRandomPassword(8);
    await authAdmin.updateUser(authUser.uid, { password: freshPassword });
    const res = await sendWelcomeEmail(name, email, freshPassword, className);

    await logRef.update({
      emailSent: res.sent,
      emailError: res.error || null,
      lastEmailResentAt: new Date().toISOString(),
    });

    return { sent: res.sent, mode: 'WELCOME_NEW_PASSWORD', error: res.error };
  } else {
    const res = await sendAccessNotificationEmail(name, email, className);

    await logRef.update({
      emailSent: res.sent,
      emailError: res.error || null,
      lastEmailResentAt: new Date().toISOString(),
    });

    return { sent: res.sent, mode: 'ACCESS_NOTIFICATION', error: res.error };
  }
};

export const resendFailedClassContractEmails = async (
  classId: string,
  maxBatch: number = 20
): Promise<{ resentSuccess: number; resentFailed: number; remainingFailed: number }> => {
  const { dbAdmin } = getAdminConfig();
  const snap = await dbAdmin
    .collection(SYNC_LOGS_COLLECTION)
    .where('classId', '==', classId)
    .get();

  const failedDocs = snap.docs.filter((d) => d.data()?.emailSent === false);
  const batch = failedDocs.slice(0, maxBatch);

  let resentSuccess = 0;
  let resentFailed = 0;

  for (const docSnap of batch) {
    try {
      const outcome = await resendAutentiqueContractEmail(docSnap.id);
      if (outcome.sent) {
        resentSuccess += 1;
      } else {
        resentFailed += 1;
      }
    } catch (err) {
      console.error(`[Autentique] Falha ao reenviar e-mail do log ${docSnap.id}:`, err);
      resentFailed += 1;
    }
  }

  return {
    resentSuccess,
    resentFailed,
    remainingFailed: Math.max(0, failedDocs.length - batch.length) + resentFailed,
  };
};

export const syncAllActiveAutentiqueClasses = async (
  triggerSource: AutentiqueTriggerSource = 'MANUAL_SYNC',
  maxNewProvisionsPerClass: number = DEFAULT_MAX_NEW_PROVISIONS_PER_BATCH
): Promise<AutentiqueClassSyncResult[]> => {
  if (!isAutentiqueConfigured()) {
    return [];
  }

  const { dbAdmin } = getAdminConfig();
  const classesSnap = await dbAdmin
    .collection('classes')
    .where('autentiqueEnabled', '==', true)
    .get();

  const results: AutentiqueClassSyncResult[] = [];

  for (const docSnap of classesSnap.docs) {
    const data = docSnap.data();
    if (!data?.autentiqueFolderId) continue;

    try {
      const res = await syncClassAutentiqueFolder(
        docSnap.id,
        triggerSource,
        maxNewProvisionsPerClass
      );
      results.push(res);
    } catch (err: any) {
      console.error(`[Autentique] Falha ao sincronizar turma ${docSnap.id}:`, err);
      results.push({
        classId: docSnap.id,
        className: data?.name || 'Turma Presencial',
        folderId: data.autentiqueFolderId,
        folderName: data.autentiqueFolderName || null,
        accessDays: Number(data.autentiqueAccessDays) > 0 ? Number(data.autentiqueAccessDays) : DEFAULT_ACCESS_DAYS,
        scannedDocuments: 0,
        unsignedDocuments: 0,
        missingEmailSigners: 0,
        signedStudentContractsFound: 0,
        unsignedItems: [],
        missingEmailItems: [],
        purgedInvalidEnrollments: 0,
        newlyCreatedStudents: 0,
        existingReleasedStudents: 0,
        alreadySyncedSkipped: 0,
        remainingPendingToSync: 0,
        hasMoreToSync: false,
        emailFailures: 0,
        errors: [err?.message || 'Erro inesperado na sincronização'],
      });
    }
  }

  return results;
};

export const getAutentiqueSyncLogs = async (classId?: string): Promise<AutentiqueSyncedContract[]> => {
  const { dbAdmin } = getAdminConfig();
  let snap;

  if (classId) {
    snap = await dbAdmin
      .collection(SYNC_LOGS_COLLECTION)
      .where('classId', '==', classId)
      .get();
  } else {
    snap = await dbAdmin.collection(SYNC_LOGS_COLLECTION).limit(300).get();
  }

  const logs: AutentiqueSyncedContract[] = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<AutentiqueSyncedContract, 'id'>),
  }));

  logs.sort((a, b) => new Date(b.syncedAt || 0).getTime() - new Date(a.syncedAt || 0).getTime());
  return logs;
};

export const verifyAutentiqueWebhookAuth = (
  rawBody: string,
  signatureHeader?: string,
  authorizationHeader?: string
): boolean => {
  const secret = (process.env.AUTENTIQUE_WEBHOOK_SECRET || '').trim();
  if (!secret) {
    return true;
  }

  if (authorizationHeader) {
    const bearerValue = authorizationHeader.replace(/^Bearer\s+/i, '').trim();
    if (bearerValue && bearerValue === secret) {
      return true;
    }
  }

  if (signatureHeader) {
    if (signatureHeader.trim() === secret) {
      return true;
    }
    const cleanHeader = signatureHeader.replace(/^sha256=/i, '').trim();
    const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    try {
      if (crypto.timingSafeEqual(Buffer.from(cleanHeader), Buffer.from(computed))) {
        return true;
      }
    } catch {
      // ignore buffer mismatch
    }
  }

  return false;
};

export const handleAutentiqueWebhook = async (
  payload: any,
  signatureHeader?: string,
  authorizationHeader?: string
): Promise<{
  processed: boolean;
  eventType: string;
  results: AutentiqueClassSyncResult[];
}> => {
  const rawString = typeof payload === 'string' ? payload : JSON.stringify(payload || {});
  if (!verifyAutentiqueWebhookAuth(rawString, signatureHeader, authorizationHeader)) {
    throw new Error('Autenticação do Webhook Autentique inválida.');
  }

  const body = typeof payload === 'string' ? JSON.parse(payload) : payload || {};
  const eventType = String(body?.event?.type || body?.type || 'UNKNOWN').toUpperCase();

  const relevantEvents = [
    'SIGNATURE_ACCEPTED',
    'SIGNATURE.ACCEPTED',
    'SIGNATURE_REJECTED',
    'SIGNATURE.REJECTED',
    'DOCUMENT_FINISHED',
    'DOCUMENT.FINISHED',
    'DOCUMENT_UPDATED',
    'DOCUMENT.UPDATED',
    'DOCUMENT_DELETED',
    'DOCUMENT.DELETED',
  ];

  if (eventType !== 'UNKNOWN' && !relevantEvents.some((ev) => eventType.includes(ev))) {
    return {
      processed: false,
      eventType,
      results: [],
    };
  }

  const results = await syncAllActiveAutentiqueClasses('WEBHOOK', 15);

  return {
    processed: true,
    eventType,
    results,
  };
};

let autentiqueCronStarted = false;

export const initAutentiqueSyncCron = (): void => {
  if (autentiqueCronStarted) return;
  autentiqueCronStarted = true;

  const INTERVAL_MS = 5 * 60 * 1000;
  setInterval(async () => {
    if (!isAutentiqueConfigured()) return;
    try {
      await syncAllActiveAutentiqueClasses('CRON', 25);
    } catch (err) {
      console.error('[Autentique Cron] Erro na varredura periódica:', err);
    }
  }, INTERVAL_MS);
};
