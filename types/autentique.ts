export interface AutentiqueFolder {
  id: string;
  name: string;
  path?: string | null;
  context?: string | null;
}

export type AutentiqueProvisionAction =
  | 'CREATED_AND_RELEASED'
  | 'EXISTING_USER_RELEASED'
  | 'ALREADY_HAD_ACCESS';

export type AutentiqueTriggerSource = 'WEBHOOK' | 'MANUAL_SYNC' | 'CRON';

export type AutentiqueRevokeReason =
  | 'CONTRACT_REMOVED_FROM_FOLDER'
  | 'MANUAL_ADMIN';

export interface AutentiqueSyncedContract {
  id: string;
  classId: string;
  className: string;
  folderId: string;
  folderName?: string | null;
  documentId: string;
  documentName: string;
  signerPublicId?: string | null;
  studentUid: string;
  studentName: string;
  studentEmail: string;
  studentPhone?: string;
  accessDays: number;
  signedAt: string;
  syncedAt: string;
  triggerSource: AutentiqueTriggerSource;
  actionTaken: AutentiqueProvisionAction;
  emailSent?: boolean;
  emailError?: string | null;
  lastEmailResentAt?: string | null;
  missingFromFolder?: boolean;
  missingDetectedAt?: string | null;
  accessRevoked?: boolean;
  revokedAt?: string | null;
  revokeReason?: AutentiqueRevokeReason | null;
}

export interface AutentiquePendingSigner {
  name: string;
  email?: string | null;
  phone?: string | null;
  signedAt?: string | null;
}

export interface AutentiquePendingDocItem {
  documentId: string;
  documentName: string;
  createdAt?: string | null;
  signedAt?: string | null;
  signers: AutentiquePendingSigner[];
}

export interface AutentiqueFolderXRay {
  scannedDocuments: number;
  signedStudentContractsFound: number;
  unsignedDocuments: number;
  missingEmailSigners: number;
  activeSignedDocumentIds?: string[];
  unsignedItems: AutentiquePendingDocItem[];
  missingEmailItems: AutentiquePendingDocItem[];
  updatedAt: string;
}

export interface AutentiqueClassSyncResult {
  classId: string;
  className: string;
  folderId: string;
  folderName?: string | null;
  accessDays: number;
  scannedDocuments: number;
  unsignedDocuments: number;
  missingEmailSigners: number;
  signedStudentContractsFound: number;
  activeSignedDocumentIds?: string[];
  missingFromFolderCount?: number;
  autoRevokedContracts?: number;
  unsignedItems?: AutentiquePendingDocItem[];
  missingEmailItems?: AutentiquePendingDocItem[];
  purgedInvalidEnrollments?: number;
  newlyCreatedStudents: number;
  existingReleasedStudents: number;
  alreadySyncedSkipped: number;
  remainingPendingToSync: number;
  hasMoreToSync: boolean;
  emailFailures: number;
  errors: string[];
}
