import type { VercelRequest, VercelResponse } from '@vercel/node';

interface PandaFolder {
  id: string;
  name: string;
  title?: string;
  parent_id?: string | null;
  parent_folder_id?: string | null;
  parentId?: string | null;
}

interface PandaVideo {
  id: string;
  video_id?: string;
  title: string;
  name?: string;
  folder_id?: string | null;
  folderId?: string | null;
  video_player?: string | null;
  video_player_url?: string | null;
  embed_url?: string | null;
  external_id?: string | null;
  video_external_id?: string | null;
  playback_id?: string | null;
  length?: number;
  duration?: number;
  status?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
}

const getFolderParentId = (f: PandaFolder): string | null => {
  const raw = f.parent_folder_id || f.parent_id || f.parentId || null;
  if (!raw || raw === 'null' || raw === '') return null;
  return String(raw);
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const apiKey = process.env.PANDA_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ success: false, error: "PANDA_API_KEY não configurada no ambiente." });
    }

    const folderId = req.query.folderId as string | undefined;
    const isRoot = !folderId || folderId === 'root' || folderId === 'null' || folderId === '';

    const foldersUrl = 'https://api-v2.pandavideo.com.br/folders';
    let videosUrl = 'https://api-v2.pandavideo.com.br/videos?limit=1000';

    if (!isRoot && folderId) {
      videosUrl += `&folder_id=${encodeURIComponent(folderId)}`;
    }

    const headers = {
      'Authorization': apiKey,
      'Accept': 'application/json'
    };

    const [foldersRes, videosRes] = await Promise.all([
      fetch(foldersUrl, { method: 'GET', headers }),
      fetch(videosUrl, { method: 'GET', headers })
    ]);

    if (!foldersRes.ok || !videosRes.ok) {
      throw new Error(`Erro na API do Panda: F:${foldersRes.status} V:${videosRes.status}`);
    }

    const foldersData = await foldersRes.json();
    const videosData = await videosRes.json();

    const foldersArray: PandaFolder[] = foldersData.folders || (Array.isArray(foldersData) ? foldersData : []);
    const videosArray: PandaVideo[] = [...(videosData.videos || (Array.isArray(videosData) ? videosData : []))];

    // Se o Panda paginar vídeos dentro da pasta (ex: mais de 100 vídeos na pasta), busca páginas restantes
    const totalPages = Number(videosData.pages || 1);
    if (!isRoot && folderId && totalPages > 1) {
      const maxPages = Math.min(totalPages, 10);
      const extraPromises: Promise<PandaVideo[]>[] = [];
      for (let page = 2; page <= maxPages; page++) {
        const pageUrl = `${videosUrl}&page=${page}`;
        extraPromises.push(
          fetch(pageUrl, { method: 'GET', headers })
            .then(r => (r.ok ? r.json() : { videos: [] }))
            .then(d => d.videos || (Array.isArray(d) ? d : []))
            .catch(() => [])
        );
      }
      const extraPages = await Promise.all(extraPromises);
      const seenIds = new Set(videosArray.map(v => v.id));
      for (const pageVideos of extraPages) {
        for (const v of pageVideos) {
          if (v?.id && !seenIds.has(v.id)) {
            seenIds.add(v.id);
            videosArray.push(v);
          }
        }
      }
    }

    // Montar breadcrumbs e validar existência da pasta alvo
    const folderMap = new Map<string, PandaFolder>();
    for (const f of foldersArray) {
      if (f?.id) folderMap.set(String(f.id), f);
    }

    let folderNotFound = false;
    let currentFolder: { id: string; name: string; parentId: string | null } | null = null;
    const breadcrumbs: Array<{ id: string; name: string }> = [];

    if (!isRoot && folderId) {
      const targetObj = folderMap.get(String(folderId));
      if (!targetObj) {
        folderNotFound = true;
      } else {
        currentFolder = {
          id: String(targetObj.id),
          name: targetObj.name || targetObj.title || 'Pasta sem nome',
          parentId: getFolderParentId(targetObj)
        };
        const visited = new Set<string>();
        let cursor: PandaFolder | undefined = targetObj;
        while (cursor && !visited.has(String(cursor.id))) {
          visited.add(String(cursor.id));
          breadcrumbs.unshift({
            id: String(cursor.id),
            name: cursor.name || cursor.title || 'Pasta sem nome'
          });
          const pId = getFolderParentId(cursor);
          cursor = pId ? folderMap.get(pId) : undefined;
        }
      }
    }

    const strictFolders = foldersArray.filter((folder: PandaFolder) => {
      const parentId = getFolderParentId(folder);
      if (isRoot) {
        return !parentId;
      } else {
        return String(parentId) === String(folderId);
      }
    });

    strictFolders.sort((a, b) =>
      (a.name || a.title || '').localeCompare(b.name || b.title || '', 'pt-BR', { numeric: true, sensitivity: 'base' })
    );

    const folders = strictFolders.map((f) => ({
      id: f.id,
      name: f.name || f.title || 'Pasta sem nome',
      parentId: getFolderParentId(f)
    }));

    // Filtro estrito: SOMENTE vídeos diretamente na pasta selecionada (exclui subpastas)
    const strictVideos = videosArray.filter((video: PandaVideo) => {
      const rawFolderId = video.folder_id || video.folderId || null;
      const videoFolderId = !rawFolderId || rawFolderId === 'null' || rawFolderId === '' ? null : String(rawFolderId);
      if (isRoot) {
        return !videoFolderId;
      } else {
        return videoFolderId === String(folderId);
      }
    });

    strictVideos.sort((a, b) =>
      (a.title || a.name || '').localeCompare(b.title || b.name || '', 'pt-BR', { numeric: true, sensitivity: 'base' })
    );

    const videos = strictVideos.map((v: PandaVideo) => ({
      id: v.id,
      video_id: v.video_id || v.id,
      panda_id: v.video_id || v.id,
      external_id: v.external_id || v.video_external_id || null,
      video_external_id: v.video_external_id || v.external_id || null,
      playback_id: v.playback_id || null,
      title: v.title || v.name || 'Sem título',
      video_player: v.video_player || null,
      video_player_url: v.video_player_url || v.embed_url || v.video_player || null,
      length: v.length || v.duration || 0,
      status: v.status || null,
      created_at: v.created_at || v.createdAt || null,
      folder_id: v.folder_id || v.folderId || null
    }));

    return res.status(200).json({
      success: true,
      folders,
      videos,
      breadcrumbs,
      currentFolder,
      folderNotFound
    });
  } catch (error) {
    console.error("Erro no Explorer do Panda:", error);
    return res.status(500).json({ success: false, error: "Falha ao navegar no Panda Video." });
  }
}
