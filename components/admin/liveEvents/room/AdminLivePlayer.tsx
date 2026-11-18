import React from 'react';
import { LiveEvent } from '../../../../types/liveEvent';
import { AlternativeYouTubePlayer } from '../../../shared/AlternativeYouTubePlayer';

interface AdminLivePlayerProps {
  event: LiveEvent;
}

export const AdminLivePlayer: React.FC<AdminLivePlayerProps> = ({ event }) => {
  const getSafeEmbedUrl = (rawInput?: string) => {
    if (!rawInput) return { url: '', videoId: null };

    // Caso o admin tenha colado um código <iframe src="..."> completo, extrai apenas o src
    const iframeSrcMatch = rawInput.match(/src=["']([^"']+)["']/i);
    const url = iframeSrcMatch ? iframeSrcMatch[1] : rawInput.trim();

    // Verifica se é um link do YouTube (padrão, live/, shorts/, encurtado ou já embutido)
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|live\/|shorts\/|watch\?v=|&v=)([^#&?/]*).*/;
      const match = url.match(regExp);
      const videoId = match && match[2].length === 11 ? match[2] : null;

      if (videoId) {
        return {
          url: `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&playsinline=1`,
          videoId,
        };
      }
    }

    // Se for um link do Panda Vídeo ou qualquer outro servidor, retorna a URL original
    return { url, videoId: null };
  };

  const effectiveVideoLink = event.videoLink || event.videoUrl;

  if (!effectiveVideoLink) {
    return (
      <div className="w-full aspect-video bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-center text-zinc-500">
        <p>Aguardando Link de Transmissão</p>
      </div>
    );
  }

  const { url: safeUrl, videoId } = getSafeEmbedUrl(effectiveVideoLink);

  // Se o evento estiver configurado para Player Alternativo E for um vídeo do YouTube
  if (event.useAlternativePlayer && videoId) {
    return (
      <div className="w-full h-full bg-black flex items-center justify-center p-1 md:p-2">
        <div className="w-full h-full max-w-full max-h-full flex items-center justify-center overflow-hidden">
          <div className="aspect-video w-full h-auto max-h-full max-w-full shadow-2xl">
            <AlternativeYouTubePlayer videoId={videoId} />
          </div>
        </div>
      </div>
    );
  }

  // Basic iframe rendering for YouTube or Panda
  return (
    <div className="w-full h-full bg-black flex items-center justify-center p-1 md:p-2">
      <div className="w-full h-full max-w-full max-h-full flex items-center justify-center overflow-hidden">
        <div className="aspect-video w-full h-auto max-h-full max-w-full shadow-2xl">
          <iframe
            src={safeUrl}
            title="Player de Transmissão"
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          ></iframe>
        </div>
      </div>
    </div>
  );
};
