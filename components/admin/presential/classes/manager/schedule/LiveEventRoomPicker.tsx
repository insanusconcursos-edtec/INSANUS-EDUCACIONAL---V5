import React, { useMemo, useState } from 'react';
import {
  Radio,
  Search,
  Calendar,
  Clock,
  Check,
  X,
  Link2Off,
  Loader2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { LiveEvent } from '../../../../../../types/liveEvent';

interface LiveEventRoomPickerProps {
  liveEvents: LiveEvent[];
  loading?: boolean;
  classId: string;
  targetDate?: string;
  selectedLiveEventId: string;
  onChange: (liveEventId: string, liveEventTitle: string) => void;
}

const formatDisplayDate = (isoDate?: string): string => {
  if (!isoDate) return '--/--/----';
  const parts = isoDate.split('-');
  if (parts.length < 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

export const LiveEventRoomPicker: React.FC<LiveEventRoomPickerProps> = ({
  liveEvents,
  loading = false,
  classId,
  targetDate,
  selectedLiveEventId,
  onChange,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showEnded, setShowEnded] = useState(false);

  const endedCount = useMemo(
    () => liveEvents.filter(ev => ev.status === 'ended').length,
    [liveEvents]
  );

  const sortedAndFilteredEvents = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    const filtered = liveEvents.filter(ev => {
      if (!ev.id) return false;
      const isSelected = ev.id === selectedLiveEventId;
      if (!showEnded && ev.status === 'ended' && !isSelected) {
        return false;
      }

      if (query) {
        const titleMatch = ev.title?.toLowerCase().includes(query);
        const subMatch = ev.subtitle?.toLowerCase().includes(query);
        const dateMatch =
          ev.eventDate?.includes(query) || formatDisplayDate(ev.eventDate).includes(query);
        if (!titleMatch && !subMatch && !dateMatch) return false;
      }

      return true;
    });

    return filtered.sort((a, b) => {
      // 1. Selecionado atualmente vem sempre no topo
      if (a.id === selectedLiveEventId && b.id !== selectedLiveEventId) return -1;
      if (b.id === selectedLiveEventId && a.id !== selectedLiveEventId) return 1;

      // 2. Mesma data do encontro agendado
      const aSameDate = Boolean(targetDate && a.eventDate === targetDate);
      const bSameDate = Boolean(targetDate && b.eventDate === targetDate);
      if (aSameDate !== bSameDate) return aSameDate ? -1 : 1;

      // 3. Eventos ao vivo agora primeiro, depois agendados, depois encerrados
      const statusRank = (s: LiveEvent['status']) =>
        s === 'live' ? 0 : s === 'scheduled' ? 1 : 2;
      if (statusRank(a.status) !== statusRank(b.status)) {
        return statusRank(a.status) - statusRank(b.status);
      }

      // 4. Já vinculados a esta turma presencial
      const aInClass = Boolean(a.accessControl?.presentialClasses?.includes(classId));
      const bInClass = Boolean(b.accessControl?.presentialClasses?.includes(classId));
      if (aInClass !== bInClass) return aInClass ? -1 : 1;

      // 5. Data/horário mais próximos
      const dateCmp = (a.eventDate || '').localeCompare(b.eventDate || '');
      if (dateCmp !== 0) return dateCmp;
      return (a.startTime || '').localeCompare(b.startTime || '');
    });
  }, [liveEvents, searchTerm, showEnded, selectedLiveEventId, targetDate, classId]);

  const selectedEventObj = useMemo(
    () => liveEvents.find(ev => ev.id === selectedLiveEventId),
    [liveEvents, selectedLiveEventId]
  );

  if (loading) {
    return (
      <div className="p-4 rounded-lg bg-zinc-950/70 border border-zinc-800 flex items-center justify-center gap-2 text-xs text-zinc-400">
        <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
        <span>Carregando salas de eventos ao vivo...</span>
      </div>
    );
  }

  if (liveEvents.length === 0) {
    return (
      <div className="p-3 rounded-lg bg-zinc-950/70 border border-zinc-800 text-xs text-zinc-400 leading-relaxed">
        Nenhum Evento Ao Vivo cadastrado ainda no menu <strong className="text-zinc-200">Eventos Ao Vivo</strong>.
        Você pode salvar o encontro normalmente e vincular a sala depois em{' '}
        <strong className="text-zinc-200">Gerenciar Encontro</strong>.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[11px] text-zinc-400">
          {selectedEventObj ? (
            <span className="text-sky-300 font-semibold">
              Sala vinculada: <strong>{selectedEventObj.title}</strong>
            </span>
          ) : (
            <span>Selecione a sala de transmissão para liberar o botão no cronograma do aluno</span>
          )}
        </span>

        {endedCount > 0 && (
          <button
            type="button"
            onClick={() => setShowEnded(prev => !prev)}
            className="text-[10px] font-bold text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition-colors"
          >
            {showEnded ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {showEnded ? 'Ocultar encerrados' : `Mostrar encerrados (${endedCount})`}
          </button>
        )}
      </div>

      {liveEvents.length > 3 && (
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar evento ao vivo por título ou data..."
            className="w-full bg-zinc-950 border border-zinc-800 focus:border-sky-500 rounded-lg pl-8 pr-7 py-1.5 text-xs text-white placeholder:text-zinc-500 outline-none transition-colors"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin scrollbar-thumb-zinc-700">
        {/* Opção explícita para deixar sem vínculo direto */}
        <button
          type="button"
          onClick={() => onChange('', '')}
          className={`w-full text-left px-3 py-2 rounded-lg border transition-all flex items-center justify-between gap-2 ${
            !selectedLiveEventId
              ? 'bg-zinc-800/90 border-zinc-600 text-zinc-100'
              : 'bg-zinc-950/60 border-zinc-800/90 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Link2Off className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <span className="text-xs font-medium truncate">
              Sem sala específica vinculada (definir depois)
            </span>
          </div>
          {!selectedLiveEventId && <Check className="w-3.5 h-3.5 text-zinc-300 shrink-0" />}
        </button>

        {sortedAndFilteredEvents.length === 0 ? (
          <div className="py-4 text-center text-xs text-zinc-500">
            Nenhum evento ao vivo encontrado com os filtros atuais.
          </div>
        ) : (
          sortedAndFilteredEvents.map(ev => {
            const evId = ev.id!;
            const isSelected = evId === selectedLiveEventId;
            const isSameDate = Boolean(targetDate && ev.eventDate === targetDate);
            const isAuthorizedForClass = Boolean(
              ev.accessControl?.presentialClasses?.includes(classId)
            );

            return (
              <button
                type="button"
                key={evId}
                onClick={() => onChange(evId, ev.title)}
                className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all flex items-start justify-between gap-2.5 ${
                  isSelected
                    ? 'bg-sky-950/45 border-sky-500/70 ring-1 ring-sky-500/40'
                    : 'bg-zinc-950/75 border-zinc-800 hover:bg-zinc-900/80 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <div
                    className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                      isSelected
                        ? 'bg-sky-500 border-sky-300 text-white'
                        : 'border-zinc-700 bg-zinc-900 text-transparent'
                    }`}
                  >
                    <Check className="w-2.5 h-2.5" />
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`text-xs font-bold leading-snug break-words ${
                          isSelected ? 'text-sky-100' : 'text-zinc-100'
                        }`}
                      >
                        {ev.title}
                      </span>

                      {ev.status === 'live' ? (
                        <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-red-600 text-white animate-pulse flex items-center gap-1 whitespace-nowrap">
                          <Radio className="w-2.5 h-2.5" />
                          Ao Vivo Agora
                        </span>
                      ) : ev.status === 'scheduled' ? (
                        <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/35 whitespace-nowrap">
                          Agendado
                        </span>
                      ) : (
                        <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 whitespace-nowrap">
                          Encerrado
                        </span>
                      )}

                      {isSameDate && (
                        <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/35 whitespace-nowrap">
                          Mesma Data
                        </span>
                      )}

                      {isAuthorizedForClass && (
                        <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/35 whitespace-nowrap">
                          Turma Vinculada
                        </span>
                      )}
                    </div>

                    {ev.subtitle && (
                      <p className="text-[10px] text-zinc-400 truncate">{ev.subtitle}</p>
                    )}

                    <div className="flex items-center gap-3 text-[10px] text-zinc-400 tabular-nums">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-zinc-500" />
                        {formatDisplayDate(ev.eventDate)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-zinc-500" />
                        {ev.startTime || '--:--'}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {selectedEventObj && !selectedEventObj.accessControl?.presentialClasses?.includes(classId) && (
        <p className="text-[10px] text-sky-300/90 bg-sky-950/30 border border-sky-500/25 rounded-md px-2.5 py-1.5 leading-relaxed">
          Ao salvar o cronograma definitivo, esta turma presencial terá o acesso à sala{' '}
          <strong>&ldquo;{selectedEventObj.title}&rdquo;</strong> liberado automaticamente.
        </p>
      )}
    </div>
  );
};
