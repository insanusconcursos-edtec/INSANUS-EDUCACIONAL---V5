import { VercelRequest, VercelResponse } from '@vercel/node';
import {
  addWatermarkToPdf,
  sanitizeDownloadFilename,
  WatermarkServiceError,
} from '../src/backend/services/pdfWatermarkService.js';
import { getAdminConfig } from '../src/backend/services/firebaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const authHeader = String(req.headers.authorization || '');
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Autenticação obrigatória para baixar materiais protegidos.',
      });
    }

    const idToken = authHeader.slice(7).trim();
    if (!idToken) {
      return res.status(401).json({ success: false, error: 'Token de sessão ausente.' });
    }

    let verifiedUid: string;
    try {
      const { authAdmin } = getAdminConfig();
      const decoded = await authAdmin.verifyIdToken(idToken);
      verifiedUid = decoded.uid;
    } catch (authError) {
      console.error('[PDF DOWNLOAD SERVERLESS] Auth verification failed:', authError);
      return res.status(401).json({
        success: false,
        fallbackClient: true,
        error: 'Sessão inválida ou serviço de autenticação indisponível.',
      });
    }

    const { source, filename } = req.body || {};
    if (!source || (source.type !== 'url' && source.type !== 'base64')) {
      return res.status(400).json({ success: false, error: 'Origem do PDF não informada.' });
    }

    const watermarkedPdfBuffer = await addWatermarkToPdf(source, verifiedUid);
    const safeFileName = sanitizeDownloadFilename(typeof filename === 'string' ? filename : undefined);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
    return res.status(200).send(watermarkedPdfBuffer);
  } catch (error: unknown) {
    if (error instanceof WatermarkServiceError) {
      return res.status(error.statusCode).json({
        success: false,
        fallbackClient: error.fallbackClient,
        error: error.message,
      });
    }
    const msg = error instanceof Error ? error.message : 'Falha ao gerar o PDF com marca d\'água.';
    console.error('[PDF DOWNLOAD SERVERLESS] Error:', error);
    return res.status(500).json({
      success: false,
      fallbackClient: true,
      error: msg,
    });
  }
}
