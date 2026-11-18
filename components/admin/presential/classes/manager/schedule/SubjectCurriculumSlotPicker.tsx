import React, { useMemo, useState } from 'react';
import { Check, Search, Pin, CheckCircle2, Clock, Link2, X } from 'lucide-react';
import { Topic } from '../../../../../../types/curriculum';
import { ClassScheduleEvent } from '../../../../../../types/schedule';
import {
  buildSubjectSlotUnits,
  CurriculumSlotUnit,
  getSlotKeysCoveredByEvent,
} from '../../../../../../utils/scheduler/ContentResolver';

interface SubjectCurriculumSlotPickerProps {
  subjectId: string;
  topics: Topic[];
  existingEvents?: ClassScheduleEvent[];
  currentEventId?: string;
  otherSelectedKeysInForm?: Set<string>;
  selectedSlotKeys: string[];
  onChange: (nextKeys: string[]) => void;
}

interface SlotScheduleStatus {
  kind: 'COMPLETED' | 'PINNED' | 'AUTO_SCHEDULED';
  shortDate: string;
}

const formatShortDayMonth = (isoDate?: string): string => {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length < 3) return isoDate;
  return `${parts[2]}/${parts[1]}`;
};

export const SubjectCurriculumSlotPicker: React.FC<SubjectCurriculumSlotPickerProps> = ({
  subjectId,
  topics,
  existingEvents = [],
  currentEventId,
  otherSelectedKeysInForm,
  selectedSlotKeys,
  onChange,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const slotUnits = useMemo(
    () => buildSubjectSlotUnits(subjectId, topics, true),
    [subjectId, topics]
  );

  const slotStatusMap = useMemo(() => {
    const map = new Map<string, SlotScheduleStatus>();
    if (!existingEvents.length || !slotUnits.length) return map;

    const relevantEvents = existingEvents
      .filter(
        ev =>
          ev.eventType !== 'SIMULADO' &&
          ev.subjectId === subjectId &&
          ev.status !== 'CANCELED' &&
          ev.id !== currentEventId
      )
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

    relevantEvents.forEach(ev => {
      const coveredKeys = getSlotKeysCoveredByEvent(ev, slotUnits);
      const shortDate = formatShortDayMonth(ev.date);
      coveredKeys.forEach(key => {
        const prev = map.get(key);
        if (ev.status === 'COMPLETED') {
          map.set(key, { kind: 'COMPLETED', shortDate });
        } else if (!prev || prev.kind !== 'COMPLETED') {
          map.set(key, {
            kind: ev.allocationMode === 'MANUAL_PIN' ? 'PINNED' : 'AUTO_SCHEDULED',
            shortDate,
          });
        }
      });
    });

    return map;
  }, [existingEvents, slotUnits, subjectId, currentEventId]);

  const selectedSet = useMemo(() => new Set(selectedSlotKeys), [selectedSlotKeys]);

  const filteredGroups = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const groupsMap = new Map<
      string,
      { topicId: string; topicName: string; units: CurriculumSlotUnit[] }
    >();

    slotUnits.forEach(unit => {
      if (query) {
        const topicMatch = unit.primaryTopic.name.toLowerCase().includes(query);
        const modMatch = unit.primaryModule.name.toLowerCase().includes(query);
        const orderMatch = `#${unit.orderNumber}`.includes(query);
        if (!topicMatch && !modMatch && !orderMatch) return;
      }

      const tId = unit.primaryTopic.id;
      if (!groupsMap.has(tId)) {
        groupsMap.set(tId, {
          topicId: tId,
          topicName: unit.primaryTopic.name,
          units: [],
        });
      }
      groupsMap.get(tId)!.units.push(unit);
    });

    return Array.from(groupsMap.values());
  }, [slotUnits, searchTerm]);

  const toggleSlotKey = (slotKey: string) => {
    const nextSet = new Set(selectedSet);
    if (nextSet.has(slotKey)) {
      nextSet.delete(slotKey);
    } else {
      nextSet.add(slotKey);
    }

    // Mantém a ordem didática cadastrada para exibição limpa dos módulos na aula
    const orderedKeys = slotUnits
      .filter(u => nextSet.has(u.slotKey))
      .map(u => u.slotKey);

    onChange(orderedKeys);
  };

  const getSecondaryGroupedModuleNames = (unit: CurriculumSlotUnit): string[] => {
    if (unit.modules.length <= 1) return [];
    return unit.modules.slice(1).map(link => {
      const topic = topics.find(t => t.id === link.topicId);
      const mod = topic?.modules?.find(m => m.id === link.moduleId);
      return mod?.name || 'Módulo conjunto';
    });
  };

  if (slotUnits.length === 0) {
    return (
      <div className="p-3 rounded-lg bg-zinc-950/70 border border-zinc-800 text-xs text-zinc-400 text-center">
        Nenhum assunto/módulo presencial ativo cadastrado para esta disciplina.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {slotUnits.length > 4 && (
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Filtrar assunto ou módulo..."
            className="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded-lg pl-8 pr-7 py-1.5 text-xs text-white placeholder:text-zinc-500 outline-none transition-colors"
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

      <div className="flex items-center justify-between gap-2 text-[11px] tabular-nums">
        <span className="text-zinc-400">
          {selectedSlotKeys.length === 0 ? (
            <span className="text-amber-400 font-semibold">
              Selecione ao menos 1 módulo/aula abaixo
            </span>
          ) : (
            <span className="text-indigo-300 font-bold">
              {selectedSlotKeys.length}{' '}
              {selectedSlotKeys.length === 1
                ? 'aula/módulo selecionado'
                : 'aulas/módulos selecionados'}
            </span>
          )}
        </span>
        {selectedSlotKeys.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            Limpar
          </button>
        )}
      </div>

      <div className="max-h-56 overflow-y-auto space-y-2.5 pr-1 scrollbar-thin scrollbar-thumb-zinc-700">
        {filteredGroups.length === 0 ? (
          <div className="py-4 text-center text-xs text-zinc-500">
            Nenhum módulo encontrado para &ldquo;{searchTerm}&rdquo;.
          </div>
        ) : (
          filteredGroups.map(group => (
            <div
              key={group.topicId}
              className="rounded-lg border border-zinc-800/90 bg-zinc-950/70 overflow-hidden"
            >
              <div className="px-2.5 py-1.5 bg-zinc-900/90 border-b border-zinc-800/80 flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-300 truncate">
                  {group.topicName}
                </span>
                <span className="text-[10px] text-zinc-500 tabular-nums shrink-0">
                  {group.units.length} {group.units.length === 1 ? 'aula' : 'aulas'}
                </span>
              </div>

              <div className="divide-y divide-zinc-800/60">
                {group.units.map(unit => {
                  const isChecked = selectedSet.has(unit.slotKey);
                  const inOtherPeriod = Boolean(otherSelectedKeysInForm?.has(unit.slotKey));
                  const status = slotStatusMap.get(unit.slotKey);
                  const [, totalPartsStr] = unit.primaryIndexLabel.split('/');
                  const hasMultipleParts = Number(totalPartsStr) > 1;
                  const groupedNames = getSecondaryGroupedModuleNames(unit);

                  return (
                    <button
                      type="button"
                      key={unit.slotKey}
                      onClick={() => toggleSlotKey(unit.slotKey)}
                      className={`w-full text-left px-2.5 py-2 flex items-start gap-2.5 transition-colors ${
                        isChecked
                          ? 'bg-indigo-950/45 hover:bg-indigo-950/60'
                          : 'hover:bg-zinc-900/70'
                      }`}
                    >
                      <div
                        className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                          isChecked
                            ? 'bg-indigo-500 border-indigo-400 text-white'
                            : 'border-zinc-700 bg-zinc-900 text-transparent'
                        }`}
                      >
                        <Check className="w-3 h-3" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-extrabold text-zinc-500 tabular-nums">
                            #{unit.orderNumber}
                          </span>
                          <span
                            className={`text-xs font-medium leading-snug break-words ${
                              isChecked ? 'text-indigo-100 font-semibold' : 'text-zinc-200'
                            }`}
                          >
                            {unit.primaryModule.name}
                          </span>
                          {hasMultipleParts && (
                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-amber-300 border border-zinc-700 tabular-nums">
                              Parte {unit.primaryIndexLabel}
                            </span>
                          )}
                        </div>

                        {groupedNames.length > 0 && (
                          <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-400/85">
                            <Link2 className="w-2.5 h-2.5 shrink-0" />
                            <span className="truncate">
                              Conjunto com: {groupedNames.join(', ')}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="shrink-0 flex flex-col items-end gap-1">
                        {inOtherPeriod ? (
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 whitespace-nowrap">
                            Outro tempo
                          </span>
                        ) : status?.kind === 'COMPLETED' ? (
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 whitespace-nowrap tabular-nums">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            Concluído {status.shortDate}
                          </span>
                        ) : status?.kind === 'PINNED' ? (
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 flex items-center gap-1 whitespace-nowrap tabular-nums">
                            <Pin className="w-2.5 h-2.5" />
                            Fixado {status.shortDate}
                          </span>
                        ) : status?.kind === 'AUTO_SCHEDULED' ? (
                          <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 flex items-center gap-1 whitespace-nowrap tabular-nums">
                            <Clock className="w-2.5 h-2.5" />
                            Fila {status.shortDate}
                          </span>
                        ) : (
                          <span className="text-[9px] font-semibold uppercase text-zinc-500 whitespace-nowrap">
                            Na fila
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
