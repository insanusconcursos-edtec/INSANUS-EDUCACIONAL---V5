
/**
 * Panda Video Utilities
 */

export interface PandaExplorerFolder {
  id: string;
  name: string;
  parentId?: string | null;
}

export interface PandaExplorerBreadcrumb {
  id: string;
  name: string;
}

export interface PandaVideo {
  id: string;
  video_id?: string;
  panda_id?: string;
  title?: string;
  name?: string;
  playback_id?: string | null;
  video_external_id?: string | null;
  external_id?: string | null;
  video_player?: string | null;
  video_player_url?: string | null;
  embed_url?: string | null;
  video_external_url?: string | null;
  video_hls?: string | null;
  url?: string | null;
  length?: number;
  duration?: number;
  status?: string | null;
  created_at?: string | null;
  folder_id?: string | null;
  [key: string]: unknown;
}

/**
 * Extracts the correct Playback ID from a Panda Video object.
 * Prioritizes the standard ID fields returned by the API.
 */
export const extractPandaVideoId = (video: PandaVideo): string | null => {
  if (!video) return null;

  // 1. Prioridade Máxima: Campos de ID direto (disponíveis no objeto detalhado ou listagem v2)
  if (video.playback_id && typeof video.playback_id === 'string') {
    return video.playback_id;
  }
  if (video.video_external_id && typeof video.video_external_id === 'string') {
    return video.video_external_id;
  }
  if (video.external_id && typeof video.external_id === 'string') {
    return video.external_id;
  }

  // 2. Array com os campos seguros que contêm a URL pública do Panda
  const possibleUrls = [
    video.video_player,      // Campo do objeto detalhado / v2
    video.video_player_url,  // Campo comum
    video.embed_url,         // Campo comum
    video.video_external_url,
    video.video_hls,
    video.url
  ];

  // 3. Extração rigorosa (Parser de URL)
  for (const url of possibleUrls) {
    if (url && typeof url === 'string' && url.includes('?v=')) {
      return url.split('?v=')[1].split('&')[0];
    }
  }

  // 4. Retorna null se nenhum Playback ID for encontrado via URL (Fallback para ID interno proibido)
  return null;
};

/**
 * Extracts a Panda Playback ID from a stored embed URL (e.g. CourseContent.videoUrl).
 */
export const extractPandaIdFromEmbedUrl = (videoUrl?: string | null): string | null => {
  if (!videoUrl || typeof videoUrl !== 'string') return null;
  if (videoUrl.includes('?v=')) {
    return videoUrl.split('?v=')[1].split('&')[0].trim() || null;
  }
  return null;
};

/**
 * Builds or retrieves the best specific Embed URL for a given Panda Video.
 */
export const getPandaEmbedUrl = (video: PandaVideo, playbackId: string): string => {
  if (video.video_player && typeof video.video_player === 'string' && video.video_player.includes('?v=')) {
    return video.video_player;
  }
  if (video.video_player_url && typeof video.video_player_url === 'string' && video.video_player_url.includes('?v=')) {
    return video.video_player_url;
  }
  
  // Fallback para construção manual se necessário
  return `https://player-vz-226f9de3-772.tv.pandavideo.com.br/embed/?v=${playbackId}`;
};

/**
 * Builds the specific Ticto Embed URL for a given Panda Video ID (Legacy/Fallback).
 */
export const buildPandaEmbedUrl = (videoId: string): string => {
  return `https://player-vz-226f9de3-772.tv.pandavideo.com.br/embed/?v=${videoId}`;
};
