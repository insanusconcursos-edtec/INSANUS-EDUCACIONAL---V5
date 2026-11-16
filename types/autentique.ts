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
}

export interface AutentiqueClassSyncResult {
  classId: string;
  className: string;
  folderId: string;
  folderName?: string | null;
  accessDays: number;
  scannedDocuments: number;
  signedStudentContractsFound: number;
  newlyCreatedStudents: number;
  existingReleasedStudents: number;
  alreadySyncedSkipped: number;
  errors: string[];
}
