import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminConfig } from '../../src/backend/services/firebaseAdmin.js';

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { userId, userEmail, lat, lon, accuracy, fingerprint, sessionId } = req.body || {};
    if (!userId) {
      return res.status(400).json({ success: false, error: "userId é obrigatório" });
    }

    const ipRaw = (req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || '').split(',')[0].trim();
    const ip = ipRaw.startsWith('::ffff:') ? ipRaw.substring(7) : ipRaw;
    const userAgent = (req.headers['user-agent'] as string) || 'unknown';

    let geoData: any = {};
    try {
      if (ip && ip !== '::1' && ip !== '127.0.0.1') {
        const geoRes = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query`, {
          signal: AbortSignal.timeout(3000)
        });
        if (geoRes.ok) {
          const data = await geoRes.json();
          if (data.status === 'success') {
            geoData = data;
          }
        }
      }
    } catch (geoError) {
      // Falha silenciosa em caso de timeout de IP
    }

    const { dbAdmin } = getAdminConfig();
    const now = new Date();

    const currentLat = lat || geoData.lat;
    const currentLon = lon || geoData.lon;

    const userRef = dbAdmin.collection('users').doc(userId);
    const userSnap = await userRef.get();
    let isStudent = false;

    if (userSnap.exists) {
      const udata = userSnap.data();
      if ((udata?.role || '').toLowerCase() === 'student') {
        isStudent = true;
      }

      // Se estiver bloqueado previamente, verifica se expirou ou retorna erro
      if (udata?.blocked) {
        if (udata.suspendedUntil) {
          const untilDate = new Date(udata.suspendedUntil);
          if (now > untilDate) {
            await userRef.update({ blocked: false, blockReason: '', suspendedUntil: null });
          } else {
            const formattedDate = untilDate.toLocaleString('pt-BR', { 
              day: '2-digit', month: '2-digit', year: 'numeric', 
              hour: '2-digit', minute: '2-digit' 
            });
            return res.status(403).json({ 
              success: false, 
              blocked: true, 
              blockReason: 'suspension', 
              blockDetails: `Sua conta está suspensa temporariamente até ${formattedDate}.` 
            });
          }
        } else {
          return res.status(403).json({ success: false, blocked: true, blockReason: udata.blockReason });
        }
      }

      if (isStudent && sessionId && !udata?.isException) {
        // --- PREVENÇÃO CONTRA ACESSOS SIMULTÂNEOS ---
        const activeSessions: string[] = Array.isArray(udata?.activeSessionIds) ? [...udata.activeSessionIds] : [];

        if (!activeSessions.includes(sessionId)) {
          if (activeSessions.length >= 2) {
            activeSessions.shift();
          }
          activeSessions.push(sessionId);
          await userRef.update({ activeSessionIds: activeSessions });
        }

        // --- GEOFENCING (BLOQUEIO POR DISTÂNCIA) ---
        if (currentLat && currentLon) {
          const lastSessions = await dbAdmin.collection('user_sessions')
            .where('userId', '==', userId)
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();

          if (!lastSessions.empty) {
            const lastSession = lastSessions.docs[0].data();
            const currentIsGps = !!(lat && lon);
            const lastLat = lastSession.browserGeo?.lat || lastSession.geo?.lat;
            const lastLon = lastSession.browserGeo?.lon || lastSession.geo?.lon;
            const lastIsGps = !!(lastSession.browserGeo?.lat);

            const sameFingerprint = fingerprint && lastSession.fingerprint === fingerprint;
            const sameIp = ip && lastSession.ip === ip;

            if (lastLat && lastLon && !sameFingerprint && !sameIp) {
              const distanceKm = calculateDistance(lastLat, lastLon, currentLat, currentLon);
              const lastTime = lastSession.createdAt?.toDate ? lastSession.createdAt.toDate().getTime() : new Date(lastSession.createdAt).getTime();
              const timeDiffHours = (now.getTime() - lastTime) / (1000 * 60 * 60);

              if (timeDiffHours > 0.05) { 
                const speed = distanceKm / timeDiffHours;
                let speedLimit = 800; // km/h
                let minDistance = 150; // km

                if (currentIsGps !== lastIsGps) {
                  speedLimit = 1200;
                  minDistance = 900;
                }

                if (speed > speedLimit && distanceKm > minDistance && timeDiffHours < 4) {
                  await userRef.update({ 
                    blocked: true, 
                    blockReason: 'geofencing',
                    blockDetails: `Fontes: ${currentIsGps ? 'GPS' : 'IP'} vs ${lastIsGps ? 'GPS' : 'IP'}. Distância: ${distanceKm.toFixed(2)}km em ${timeDiffHours.toFixed(2)}h (${speed.toFixed(2)}km/h). IP: ${ip}.` 
                  });
                  return res.status(403).json({ success: false, blocked: true, blockReason: 'geofencing' });
                }
              }
            }
          }
        }
      }
    }

    await dbAdmin.collection('user_sessions').add({
      userId,
      userEmail: userEmail || null,
      sessionId: sessionId || null,
      ip,
      userAgent,
      geo: geoData,
      browserGeo: lat && lon ? { lat, lon, accuracy } : null,
      fingerprint: fingerprint || null,
      timestamp: now.toISOString(),
      createdAt: now
    });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error("[SESSION LOG] Erro:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
