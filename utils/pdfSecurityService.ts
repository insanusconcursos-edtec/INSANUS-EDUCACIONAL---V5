import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';
import { toast } from 'react-hot-toast';
import { auth } from '../services/firebase';

export interface UserWatermarkData {
  uid?: string;
  name?: string;
  email: string;
  cpf?: string;
}

export interface OpenWatermarkedPdfOptions {
  fileName?: string;
  silent?: boolean;
}

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

function formatNonClickableEmail(email: string): string {
  return sanitizeForWinAnsi(email)
    .toLowerCase()
    .replace(/@/g, ' @ ')
    .replace(/\bwww\./gi, 'www . ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isLikelyPdfUrl(url?: string | null, fileName?: string | null): boolean {
  const combined = `${fileName || ''} ${url || ''}`.toLowerCase();
  if (combined.includes('.pdf')) return true;
  if (/\.(docx?|xlsx?|pptx?|zip|rar|png|jpe?g|webp|mp4|mp3)(\?|#|$)/i.test(combined)) {
    return false;
  }
  // Firebase Storage URLs uploaded via PDF slots sometimes omit extension in query
  if (url && url.includes('firebasestorage.googleapis.com') && combined.includes('pdf')) {
    return true;
  }
  return false;
}

export function derivePdfFileName(pdfUrl: string, customName?: string): string {
  if (customName && customName.trim()) {
    const cleaned = customName
      .trim()
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, ' ');
    if (cleaned) {
      return cleaned.toLowerCase().endsWith('.pdf') ? cleaned : `${cleaned}.pdf`;
    }
  }

  try {
    const parsed = new URL(pdfUrl);
    const decodedPath = decodeURIComponent(parsed.pathname);
    const lastSegment = decodedPath.split('/').filter(Boolean).pop() || '';
    // Strip leading timestamp prefix (e.g., 1795217052141_arquivo.pdf)
    const stripped = lastSegment.replace(/^\d{10,14}_/, '').trim();
    if (stripped) {
      return stripped.toLowerCase().endsWith('.pdf') ? stripped : `${stripped}.pdf`;
    }
  } catch {
    // Fallback below
  }

  return `material_insanus_${Date.now()}.pdf`;
}

function hasPdfSignature(bytes: Uint8Array): boolean {
  if (!bytes || bytes.length < 5) return false;
  return (
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d // -
  );
}

/**
 * Applies Option 1 anti-piracy watermark (header + footer + soft diagonal stamps + forensic metadata)
 * in memory without altering any original hosted PDF file.
 */
export const applyWatermarkToPdf = async (
  existingPdfBytes: ArrayBuffer | Uint8Array,
  userData: UserWatermarkData
): Promise<Uint8Array> => {
  const bytesView =
    existingPdfBytes instanceof Uint8Array ? existingPdfBytes : new Uint8Array(existingPdfBytes);

  if (!hasPdfSignature(bytesView)) {
    throw new Error('O arquivo baixado não possui assinatura válida de PDF.');
  }

  const pdfDoc = await PDFDocument.load(bytesView, {
    ignoreEncryption: true,
    updateMetadata: false,
  });

  const resolvedName =
    userData.name?.trim() ||
    auth.currentUser?.displayName?.trim() ||
    'ALUNO';
  const resolvedEmail =
    userData.email?.trim() ||
    auth.currentUser?.email?.trim() ||
    'E-MAIL NAO INFORMADO';
  const resolvedUid = userData.uid || auth.currentUser?.uid || '';

  const safeName = sanitizeForWinAnsi(resolvedName).toUpperCase() || 'ALUNO';
  const safeEmail = sanitizeForWinAnsi(resolvedEmail).toLowerCase();
  const displayEmail = formatNonClickableEmail(safeEmail);
  const safeCpf = formatCpfDisplay(userData.cpf);
  const timestamp = formatBrazilTimestamp();

  const headerLine = sanitizeForWinAnsi(
    `MATERIAL LICENCIADO PARA: ${safeName} | ${displayEmail} | CPF: ${safeCpf} | ${timestamp}`
  );
  const footerLine = sanitizeForWinAnsi(
    `USO INDIVIDUAL E INTRANSFERIVEL - PROIBIDA REPRODUCAO | ${safeName} | CPF: ${safeCpf} | ${displayEmail}`
  );
  const diagonalPrimary = sanitizeForWinAnsi(`${safeName} | CPF: ${safeCpf}`);
  const diagonalSecondary = sanitizeForWinAnsi(`${displayEmail} | USO INDIVIDUAL (${timestamp})`);

  try {
    pdfDoc.setAuthor(`${safeName} (${safeCpf})`);
    pdfDoc.setSubject(`Material licenciado exclusivamente para ${safeName} - ${safeEmail} - CPF ${safeCpf}`);
    pdfDoc.setKeywords([safeName, safeEmail, safeCpf, resolvedUid, timestamp]);
    pdfDoc.setProducer('Insanus Educacional - Material Protegido');
    pdfDoc.setCreator('Insanus Educacional');
  } catch {
    // Ignore metadata write failures on restrictive legacy PDFs
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

    // 1. Header strip
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

    // 2. Footer strip
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

    // 3. Soft Diagonal Watermark
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

    drawCenteredDiagonalStamp(centerX, centerY, 0.12);

    if (height > 520) {
      drawCenteredDiagonalStamp(centerX, boxY + height * 0.76, 0.08);
      drawCenteredDiagonalStamp(centerX, boxY + height * 0.24, 0.08);
    }
  }

  return await pdfDoc.save();
};

/**
 * Generates a watermarked PDF Blob using a safe hybrid pipeline:
 * 1) Server-side authenticated stamping via /api/download-watermarked-pdf (authoritative user data)
 * 2) Client-side in-memory stamping via pdf-lib (handles large PDFs > 4MB or non-Storage URLs)
 */
export const getWatermarkedPdfBlob = async (
  pdfUrl: string,
  userData: UserWatermarkData,
  customFileName?: string
): Promise<{ blob: Blob; fileName: string; watermarked: boolean }> => {
  if (!pdfUrl) {
    throw new Error('URL do documento não fornecida.');
  }

  const fileName = derivePdfFileName(pdfUrl, customFileName);

  // Layer 1: Authenticated Backend Stamping
  try {
    const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : null;
    if (idToken) {
      const response = await fetch('/api/download-watermarked-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          source: { type: 'url', url: pdfUrl },
          filename: fileName,
        }),
      });

      const contentType = response.headers.get('content-type') || '';
      if (response.ok && contentType.includes('application/pdf')) {
        const blob = await response.blob();
        if (blob.size > 0) {
          return { blob, fileName, watermarked: true };
        }
      }
    }
  } catch (serverErr) {
    console.warn('[PDF_SECURITY] Servidor indisponível, tentando carimbo em memória no cliente:', serverErr);
  }

  // Layer 2: Client-side In-Memory Stamping (handles large files & preview environments)
  const response = await fetch(pdfUrl, { mode: 'cors' });
  if (!response.ok) {
    throw new Error(`Falha ao carregar arquivo (${response.status}).`);
  }

  const rawBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(rawBuffer);

  if (!hasPdfSignature(bytes)) {
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    return {
      blob: new Blob([rawBuffer], { type: contentType }),
      fileName,
      watermarked: false,
    };
  }

  const watermarkedBytes = await applyWatermarkToPdf(bytes, userData);
  const blob = new Blob([watermarkedBytes], { type: 'application/pdf' });
  return { blob, fileName, watermarked: true };
};

function triggerAnchorDownload(href: string, downloadName?: string) {
  const link = document.createElement('a');
  link.href = href;
  if (downloadName) {
    link.download = downloadName;
  } else {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Downloads a PDF stamped on every page with the student's Name, Email, and CPF.
 * Never modifies original hosted files and gracefully falls back if an external/legacy
 * document cannot be processed, ensuring student access never breaks.
 */
export const openWatermarkedPdf = async (
  pdfUrl: string,
  userData: UserWatermarkData,
  options?: OpenWatermarkedPdfOptions
): Promise<void> => {
  if (!pdfUrl) {
    toast.error('Link do documento não encontrado.');
    return;
  }

  const shouldNotify = !options?.silent;
  const toastId = shouldNotify
    ? toast.loading("Preparando PDF protegido com sua marca d'água...")
    : undefined;

  try {
    const { blob, fileName } = await getWatermarkedPdfBlob(pdfUrl, userData, options?.fileName);
    const objectUrl = URL.createObjectURL(blob);

    triggerAnchorDownload(objectUrl, fileName);

    window.setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 60000);

    if (toastId) {
      toast.success('Download iniciado!', { id: toastId, duration: 2500 });
    }
  } catch (error) {
    console.warn('[PDF_SECURITY] Fallback seguro para abertura direta do arquivo:', error);
    if (toastId) {
      toast.dismiss(toastId);
    }
    // Safe fallback: never block student access if a legacy/external PDF cannot be fetched/parsed
    triggerAnchorDownload(pdfUrl);
  }
};
