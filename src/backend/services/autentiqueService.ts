import crypto from 'crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminConfig } from './firebaseAdmin.js';
import { sendWelcomeEmail, sendAccessNotificationEmail } from './emailService.js';
import {
  AutentiqueFolder,
  AutentiqueClassSyncResult,
  AutentiqueProvisionAction,
  AutentiqueSyncedContract,
  AutentiqueTriggerSource,
} from '../../../types/autentique.js';

const AUTENTIQUE_GRAPHQL_URL = 'https://api.autentique.com.br/v2/graphql';
const DEFAULT_ACCESS_DAYS = 60;
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
    const data = await executeAutentiqueGraphQL<{ user?: { email?: string } }>(
      `query { user { id name email } }`
    );
    const ownerEmail = (data?.user?.email || '').trim().toLowerCase();
    cachedOwnerEmail = {
      email: ownerEmail,
      expiresAt: Date.now() + 10 * 60 * 1000,
    };
    return ownerEmail;
  } catch (err) {
    console.warn('[Autentique] Não foi possível consultar e-mail titular da conta:', err);
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
        // Fallback minimalista caso o plano não exponha path/context
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

const fetchDocumentsInFolder = async (folderId: string): Promise<AutentiqueDocumentNode[]> => {
  const safeFolderId = sanitizeFolderId(folderId);
  if (!safeFolderId) return [];

  const documents: AutentiqueDocumentNode[] = [];
  let page = 1;
  const maxPages = 25;

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
      // Fallback sem subcampo user caso algum nível de permissão restrinja
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
      if (doc?.id && !doc.deleted_at) {
        documents.push(doc);
      }
    }

    if (!data?.documentsByFolder?.has_more_pages || items.length === 0) {
      break;
    }
    page += 1;
  }

  return documents;
};

const isInternalOrExcludedSigner = (
  sig: AutentiqueSignatureNode,
  ownerEmail: string,
  extraIgnoredEmails: string[]
): boolean => {
  const actionName = (sig.action?.name || 'SIGN').toUpperCase();
  // Ignorar testemunhas, aprovadores ou reconhecedores — apenas partes contratantes (SIGN)
  if (actionName !== 'SIGN') {
    return true;
  }

  const email = (sig.email || sig.user?.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return true;
  }

  if (ownerEmail && email === ownerEmail) {
    return true;
  }

  if (
    email.endsWith('@insanus.com.br') ||
    email.endsWith('@portal-insanus.com') ||
    email.endsWith('@insanuseducacional.com.br') ||
    email === (process.env.SMTP_USER || '').trim().toLowerCase()
  ) {
    return true;
  }

  if (extraIgnoredEmails.includes(email)) {
    return true;
  }

  return false;
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
  // Tenta extrair nome após hífen no título do contrato se houver (ex: "Contrato - João da Silva")
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

const provisionStudentForSignedContract = async (params: {
  classId: string;
  className: string;
  folderId: string;
  folderName?: string | null;
  accessDays: number;
  doc: AutentiqueDocumentNode;
  sig: AutentiqueSignatureNode;
  triggerSource: AutentiqueTriggerSource;
}): Promise<{ status: 'SKIPPED_ALREADY_SYNCED' | AutentiqueProvisionAction }> => {
  const { dbAdmin, authAdmin } = getAdminConfig();
  const normalizedEmail = (params.sig.email || params.sig.user?.email || '').trim().toLowerCase();
  const syncDocId = buildSyncDocId(params.classId, params.doc.id, normalizedEmail);
  const syncRef = dbAdmin.collection(SYNC_LOGS_COLLECTION).doc(syncDocId);

  const existingSync = await syncRef.get();
  if (existingSync.exists) {
    return { status: 'SKIPPED_ALREADY_SYNCED' };
  }

  const studentName = resolveDisplayName(
    params.sig.name || params.sig.user?.name,
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

  // 1. Verificar se o aluno já possui cadastro (no Firebase Auth ou na coleção users)
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

  if (!uid) {
    // CASO 1: ALUNO NÃO CADASTRADO -> Criar no Auth + Firestore + Liberar Turma + Enviar E-mail com Senha
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

    await sendWelcomeEmail(studentName, normalizedEmail, tempPassword, params.className);
    actionTaken = 'CREATED_AND_RELEASED';
  } else {
    // CASO 2: ALUNO JÁ CADASTRADO -> Manter conta/senha atual e liberar a turma presencial
    // Garantir que existe no Firebase Auth caso estivesse apenas no Firestore legado
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
      if (createdFallbackPassword) {
        await sendWelcomeEmail(recipientName, normalizedEmail, createdFallbackPassword, params.className);
      } else {
        await sendAccessNotificationEmail(recipientName, normalizedEmail, params.className);
      }

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
  };

  await syncRef.set(logRecord);

  return { status: actionTaken };
};

export const syncClassAutentiqueFolder = async (
  classId: string,
  triggerSource: AutentiqueTriggerSource = 'MANUAL_SYNC'
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

  const ownerEmail = await getAutentiqueAccountOwnerEmail();
  const extraIgnoredEmails: string[] = Array.isArray(classData.autentiqueIgnoreEmails)
    ? classData.autentiqueIgnoreEmails.map((e: string) => String(e).trim().toLowerCase()).filter(Boolean)
    : [];

  const documents = await fetchDocumentsInFolder(folderId);

  const summary: AutentiqueClassSyncResult = {
    classId,
    className,
    folderId,
    folderName: classData.autentiqueFolderName || null,
    accessDays,
    scannedDocuments: documents.length,
    signedStudentContractsFound: 0,
    newlyCreatedStudents: 0,
    existingReleasedStudents: 0,
    alreadySyncedSkipped: 0,
    errors: [],
  };

  for (const doc of documents) {
    const signatures = Array.isArray(doc.signatures) ? doc.signatures : [];

    for (const sig of signatures) {
      // REGRA 1: Liberar assim que o aluno assinar sua parte (signed.created_at presente)
      if (!sig?.signed?.created_at) {
        continue;
      }

      if (isInternalOrExcludedSigner(sig, ownerEmail, extraIgnoredEmails)) {
        continue;
      }

      summary.signedStudentContractsFound += 1;

      try {
        const res = await provisionStudentForSignedContract({
          classId,
          className,
          folderId,
          folderName: classData.autentiqueFolderName || null,
          accessDays,
          doc,
          sig,
          triggerSource,
        });

        if (res.status === 'SKIPPED_ALREADY_SYNCED') {
          summary.alreadySyncedSkipped += 1;
        } else if (res.status === 'CREATED_AND_RELEASED') {
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
  }

  await classRef.update({
    autentiqueLastSyncedAt: new Date().toISOString(),
  });

  return summary;
};

export const syncAllActiveAutentiqueClasses = async (
  triggerSource: AutentiqueTriggerSource = 'MANUAL_SYNC'
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
      const res = await syncClassAutentiqueFolder(docSnap.id, triggerSource);
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
        signedStudentContractsFound: 0,
        newlyCreatedStudents: 0,
        existingReleasedStudents: 0,
        alreadySyncedSkipped: 0,
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
    snap = await dbAdmin.collection(SYNC_LOGS_COLLECTION).limit(200).get();
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
    // Se AUTENTIQUE_WEBHOOK_SECRET não estiver definido, aceita o gatilho
    // (a validação real dos contratos ocorre consultando diretamente a API GraphQL oficial com AUTENTIQUE_API_TOKEN)
    return true;
  }

  // 1. Suporte ao modo "Autenticação (Pro) -> Bearer token" do painel Autentique
  if (authorizationHeader) {
    const bearerValue = authorizationHeader.replace(/^Bearer\s+/i, '').trim();
    if (bearerValue && bearerValue === secret) {
      return true;
    }
  }

  // 2. Suporte a assinatura HMAC SHA-256 (caso enviada via header de assinatura)
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
      // ignora erro de tamanho de buffer diferente
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

  // Aceita eventos de assinatura aceita (signature.accepted) e eventos de documento (document.finished / document.updated)
  const relevantEvents = [
    'SIGNATURE_ACCEPTED',
    'SIGNATURE.ACCEPTED',
    'DOCUMENT_FINISHED',
    'DOCUMENT.FINISHED',
    'DOCUMENT_UPDATED',
    'DOCUMENT.UPDATED',
  ];

  if (eventType !== 'UNKNOWN' && !relevantEvents.some((ev) => eventType.includes(ev))) {
    return {
      processed: false,
      eventType,
      results: [],
    };
  }

  // Varre todas as turmas presenciais com automação Autentique ativa junto à API oficial (fonte da verdade),
  // garantindo segurança contra falsificação de payload e identificando exatamente em qual pasta o contrato está.
  const results = await syncAllActiveAutentiqueClasses('WEBHOOK');

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

  const INTERVAL_MS = 5 * 60 * 1000; // A cada 5 minutos varre contratos movidos para pastas vinculadas
  setInterval(async () => {
    if (!isAutentiqueConfigured()) return;
    try {
      await syncAllActiveAutentiqueClasses('CRON');
    } catch (err) {
      console.error('[Autentique Cron] Erro na varredura periódica:', err);
    }
  }, INTERVAL_MS);
};
