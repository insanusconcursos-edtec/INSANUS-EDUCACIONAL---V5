import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';
import axios from 'axios';
import { getAdminConfig } from './firebaseAdmin.js';

const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB safety cap
const VERCEL_SAFE_RESPONSE_BYTES = 4 * 1024 * 1024; // ~4 MB safe serverless payload cap

const ALLOWED_STORAGE_HOSTS = new Set([
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
]);

export class WatermarkServiceError extends Error {
  statusCode: number;
  fallbackClient: boolean;

  constructor(message: string, statusCode = 500, fallbackClient = false) {
    super(message);
    this.name = 'WatermarkServiceError';
    this.statusCode = statusCode;
    this.fallbackClient = fallbackClient;
  }
}

/**
 * Validates that a remote PDF URL points only to trusted HTTPS storage hosts
 * and never to loopback, private networks, or link-local metadata endpoints.
 */
export function validatePdfSourceUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new WatermarkServiceError('URL do PDF inválida.', 400, false);
  }

  if (parsed.protocol !== 'https:') {
    throw new WatermarkServiceError('Apenas URLs HTTPS são permitidas.', 400, false);
  }

  if (parsed.username || parsed.password || (parsed.port && parsed.port !== '443')) {
    throw new WatermarkServiceError('Origem de arquivo não permitida.', 403, false);
  }

  const host = parsed.hostname.toLowerCase();

  // Block localhost, IP literals, and private/metadata hostnames
  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
    host.includes(':')
  ) {
    throw new WatermarkServiceError('Origem de arquivo não permitida.', 403, false);
  }

  const isAllowedHost =
    ALLOWED_STORAGE_HOSTS.has(host) ||
    host.endsWith('.firebasestorage.app');

  if (!isAllowedHost) {
    throw new WatermarkServiceError(
      'Domínio de origem fora da lista de armazenamento autorizada.',
      403,
      true
    );
  }

  return parsed;
}

/**
 * Sanitizes text for pdf-lib StandardFonts (WinAnsi encoding) while preserving
 * Portuguese accented letters and preventing encoding crashes on emojis/special symbols.
 */
function sanitizeForWinAnsi(input: string): string {
  if (!input) return '';
  const replaced = input
    .replace(/[•·]/g, '|')
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  let out = '';
  for (let i = 0; i < replaced.length; i++) {
    const code = replaced.charCodeAt(i);
    if ((code >= 32 && code <= 126) || (code >= 160 && code <= 255)) {
      out += replaced[i];
    }
  }
  return out.trim();
}

function formatCpfDisplay(rawCpf?: string | null): string {
  if (!rawCpf) return 'CPF NAO INFORMADO';
  const digits = String(rawCpf).replace(/\D/g, '');
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }
  const cleaned = sanitizeForWinAnsi(String(rawCpf));
  return cleaned || 'CPF NAO INFORMADO';
}

function formatBrazilTimestamp(date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
      .format(date)
      .replace(', ', ' ');
  } catch {
    return date.toISOString().slice(0, 16).replace('T', ' ');
  }
}

/**
 * Formats an e-mail address so it remains 100% legible in a single PDF text run
 * (zero character overlap across OS font substitutions) while breaking auto-link
 * detection (mailto: / URL) in Chrome, Edge, Adobe Acrobat, Firefox, and Preview.
 */
function formatNonClickableEmail(email: string): string {
  return sanitizeForWinAnsi(email)
    .toLowerCase()
    .replace(/@/g, ' @ ')
    .replace(/\bwww\./gi, 'www . ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sanitizeDownloadFilename(rawName?: string): string {
  const base = sanitizeForWinAnsi(rawName || '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 120);

  if (!base) return `material_insanus_${Date.now()}.pdf`;
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

export async function stampPdfBufferWithWatermark(
  pdfBytes: Uint8Array | Buffer,
  user: { uid: string; name: string; email: string; cpf: string }
): Promise<Buffer> {
  if (!pdfBytes || pdfBytes.length < 5) {
    throw new WatermarkServiceError('O arquivo baixado está vazio ou corrompido.', 422, false);
  }

  const headerSlice = Buffer.from(pdfBytes.subarray(0, 5)).toString('ascii');
  if (headerSlice !== '%PDF-') {
    throw new WatermarkServiceError('O arquivo solicitado não é um PDF válido.', 422, true);
  }

  const safeName = sanitizeForWinAnsi(user.name || 'ALUNO').toUpperCase() || 'ALUNO';
  const safeEmail = sanitizeForWinAnsi(user.email || 'E-MAIL NAO INFORMADO').toLowerCase();
  const displayEmail = formatNonClickableEmail(safeEmail);
  const safeCpf = formatCpfDisplay(user.cpf);
  const timestamp = formatBrazilTimestamp();

  const headerLine = sanitizeForWinAnsi(
    `MATERIAL LICENCIADO PARA: ${safeName} | ${displayEmail} | CPF: ${safeCpf} | ${timestamp}`
  );
  const footerLine = sanitizeForWinAnsi(
    `USO INDIVIDUAL E INTRANSFERIVEL - PROIBIDA REPRODUCAO | ${safeName} | CPF: ${safeCpf} | ${displayEmail}`
  );
  const diagonalPrimary = sanitizeForWinAnsi(`${safeName} | CPF: ${safeCpf}`);
  const diagonalSecondary = sanitizeForWinAnsi(`${displayEmail} | USO INDIVIDUAL (${timestamp})`);

  const pdfDoc = await PDFDocument.load(pdfBytes, {
    ignoreEncryption: true,
    updateMetadata: false,
  });

  // Forensic metadata embedded inside PDF properties
  try {
    pdfDoc.setAuthor(`${safeName} (${safeCpf})`);
    pdfDoc.setSubject(`Material licenciado exclusivamente para ${safeName} - ${safeEmail} - CPF ${safeCpf}`);
    pdfDoc.setKeywords([safeName, safeEmail, safeCpf, user.uid || '', timestamp]);
    pdfDoc.setProducer('Insanus Educacional - Material Protegido');
    pdfDoc.setCreator('Insanus Educacional');
  } catch {
    // Never abort watermarking if a legacy PDF rejects metadata setters
  }

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages = pdfDoc.getPages();

  const edgeColor = rgb(0.68, 0.08, 0.08);
  const diagonalColor = rgb(0.55, 0.08, 0.08);

  for (const page of pages) {
    const cropBox = page.getCropBox();
    const fallbackSize = page.getSize();
    const boxX = Number.isFinite(cropBox?.x) ? cropBox.x : 0;
    const boxY = Number.isFinite(cropBox?.y) ? cropBox.y : 0;
    const width = cropBox?.width && cropBox.width > 0 ? cropBox.width : fallbackSize.width;
    const height = cropBox?.height && cropBox.height > 0 ? cropBox.height : fallbackSize.height;

    const usableWidth = Math.max(width - 28, 120);

    // 1. Discreet Header (top of every page)
    let headerSize = 7.5;
    let headerWidth = fontBold.widthOfTextAtSize(headerLine, headerSize);
    if (headerWidth > usableWidth) {
      headerSize = Math.max(5.5, (headerSize * usableWidth) / headerWidth);
      headerWidth = fontBold.widthOfTextAtSize(headerLine, headerSize);
    }

    page.drawText(headerLine, {
      x: boxX + Math.max(14, (width - headerWidth) / 2),
      y: boxY + height - 14,
      size: headerSize,
      font: fontBold,
      color: edgeColor,
      opacity: 0.55,
    });

    // 2. Discreet Footer (bottom of every page)
    let footerSize = 7;
    let footerWidth = fontRegular.widthOfTextAtSize(footerLine, footerSize);
    if (footerWidth > usableWidth) {
      footerSize = Math.max(5.2, (footerSize * usableWidth) / footerWidth);
      footerWidth = fontRegular.widthOfTextAtSize(footerLine, footerSize);
    }

    page.drawText(footerLine, {
      x: boxX + Math.max(14, (width - footerWidth) / 2),
      y: boxY + 9,
      size: footerSize,
      font: fontRegular,
      color: edgeColor,
      opacity: 0.55,
    });

    // 3. Soft Diagonal Watermark (center + light secondary stamps on tall pages)
    const angleDeg = 35;
    const angleRad = (angleDeg * Math.PI) / 180;
    const maxDiagSpan = Math.min(width, height) * 0.92;

    let diagPrimarySize = Math.min(18, Math.max(10, width * 0.028));
    let diagPrimaryWidth = fontBold.widthOfTextAtSize(diagonalPrimary, diagPrimarySize);
    if (diagPrimaryWidth > maxDiagSpan) {
      diagPrimarySize = Math.max(8, (diagPrimarySize * maxDiagSpan) / diagPrimaryWidth);
      diagPrimaryWidth = fontBold.widthOfTextAtSize(diagonalPrimary, diagPrimarySize);
    }

    let diagSecondarySize = Math.max(7.5, diagPrimarySize * 0.72);
    let diagSecondaryWidth = fontRegular.widthOfTextAtSize(diagonalSecondary, diagSecondarySize);
    if (diagSecondaryWidth > maxDiagSpan) {
      diagSecondarySize = Math.max(6.5, (diagSecondarySize * maxDiagSpan) / diagSecondaryWidth);
      diagSecondaryWidth = fontRegular.widthOfTextAtSize(diagonalSecondary, diagSecondarySize);
    }

    const drawCenteredDiagonalStamp = (centerX: number, centerY: number, opacity: number) => {
      const pX = centerX - (diagPrimaryWidth / 2) * Math.cos(angleRad);
      const pY = centerY - (diagPrimaryWidth / 2) * Math.sin(angleRad);

      page.drawText(diagonalPrimary, {
        x: pX,
        y: pY,
        size: diagPrimarySize,
        font: fontBold,
        color: diagonalColor,
        opacity,
        rotate: degrees(angleDeg),
      });

      const lineOffset = diagPrimarySize * 1.45;
      const sCenterX = centerX + lineOffset * Math.sin(angleRad);
      const sCenterY = centerY - lineOffset * Math.cos(angleRad);
      const sX = sCenterX - (diagSecondaryWidth / 2) * Math.cos(angleRad);
      const sY = sCenterY - (diagSecondaryWidth / 2) * Math.sin(angleRad);

      page.drawText(diagonalSecondary, {
        x: sX,
        y: sY,
        size: diagSecondarySize,
        font: fontRegular,
        color: diagonalColor,
        opacity: opacity * 0.9,
        rotate: degrees(angleDeg),
      });
    };

    const centerX = boxX + width / 2;
    const centerY = boxY + height / 2;

    // Main center diagonal stamp (~12% opacity)
    drawCenteredDiagonalStamp(centerX, centerY, 0.12);

    // Subtle upper & lower anti-crop stamps on taller pages (e.g. A4 portrait)
    if (height > 520) {
      drawCenteredDiagonalStamp(centerX, boxY + height * 0.76, 0.08);
      drawCenteredDiagonalStamp(centerX, boxY + height * 0.24, 0.08);
    }
  }

  const modifiedPdfBytes = await pdfDoc.save();
  return Buffer.from(modifiedPdfBytes);
}

export async function addWatermarkToPdf(
  inputSource: { type: 'url'; url: string } | { type: 'base64'; base64: string },
  uid: string
): Promise<Buffer> {
  const { dbAdmin, authAdmin } = getAdminConfig();

  // 1. Fetch authoritative User Data from Firestore / Firebase Auth
  let userData: Record<string, unknown> | null = null;
  try {
    const userDoc = await dbAdmin.collection('users').doc(uid).get();
    if (userDoc.exists) {
      userData = (userDoc.data() as Record<string, unknown>) || null;
    }
  } catch (err) {
    console.error('[PDF_WATERMARK] Error fetching user doc from Firestore:', err);
  }

  if (!userData || !userData.email || !userData.name) {
    try {
      const userRecord = await authAdmin.getUser(uid);
      userData = {
        name: userData?.name || userData?.displayName || userRecord.displayName || 'ALUNO',
        email: userData?.email || userRecord.email || '',
        cpf: userData?.cpf || userData?.document || '',
      };
    } catch {
      if (!userData) {
        userData = { name: 'ALUNO', email: '', cpf: '' };
      }
    }
  }

  const name = String(userData?.name || userData?.displayName || 'ALUNO');
  const email = String(userData?.email || '');
  const cpf = String(userData?.cpf || userData?.document || '');

  // 2. Load the original PDF (read-only, never modifies storage)
  let pdfBytes: Buffer;

  if (inputSource.type === 'url') {
    if (!inputSource.url) {
      throw new WatermarkServiceError('URL do PDF não fornecida.', 400, false);
    }

    const validatedUrl = validatePdfSourceUrl(inputSource.url);

    try {
      const response = await axios.get<ArrayBuffer>(validatedUrl.toString(), {
        responseType: 'arraybuffer',
        timeout: 45000,
        maxContentLength: MAX_PDF_BYTES,
        maxBodyLength: MAX_PDF_BYTES,
        maxRedirects: 0,
        headers: {
          Accept: 'application/pdf,application/octet-stream,*/*',
        },
      });
      pdfBytes = Buffer.from(response.data);
    } catch (error: unknown) {
      const errObj = error as { message?: string; response?: { status?: number } };
      throw new WatermarkServiceError(
        `Falha ao baixar PDF original (${errObj.response?.status || 'N/A'}): ${errObj.message || 'Erro de rede'}`,
        502,
        true
      );
    }
  } else {
    try {
      const base64Data = inputSource.base64.replace(/^data:application\/pdf;base64,/, '');
      pdfBytes = Buffer.from(base64Data, 'base64');
      if (pdfBytes.length > MAX_PDF_BYTES) {
        throw new WatermarkServiceError('PDF excede o tamanho máximo suportado no servidor.', 413, true);
      }
    } catch (error: unknown) {
      if (error instanceof WatermarkServiceError) throw error;
      throw new WatermarkServiceError('Erro ao decodificar conteúdo do PDF.', 400, false);
    }
  }

  // On Vercel serverless, responses larger than ~4.5 MB fail at platform level.
  // Signal client to apply the exact same watermark locally in memory.
  if (process.env.VERCEL && pdfBytes.length > VERCEL_SAFE_RESPONSE_BYTES) {
    throw new WatermarkServiceError(
      'Arquivo grande detectado; delegando carimbo em memória para o navegador.',
      413,
      true
    );
  }

  try {
    return await stampPdfBufferWithWatermark(pdfBytes, { uid, name, email, cpf });
  } catch (error: unknown) {
    if (error instanceof WatermarkServiceError) throw error;
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    throw new WatermarkServiceError(`Erro ao processar estrutura do PDF: ${msg}`, 422, true);
  }
}
