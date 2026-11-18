import React, { useMemo, useState } from 'react';
import { Check, Minus, Search, Pin, CheckCircle2, Clock, Link2, X } from 'lucide-react';
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
  ignoredEventIds?: Set<string>;
  otherSelectedKeysInForm?: Set<string>;
  selectedSlotKeys: string[];
  onChange: (nextKeys: string[]) => void;
}

interface SlotScheduleStatus {
  kind: 'COMPLETED' | 'PINNED' | 'AUTO_SCHEDULED';
  shortDate: string;
}

interface ModuleSlotGroup {
  moduleId: string;
  moduleName: string;
  units: CurriculumSlotUnit[];
  groupedModuleNames: string[];
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
  ignoredEventIds,
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
          ev.id !== currentEventId &&
          !ignoredEventIds?.has(ev.id)
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
  }, [existingEvents, slotUnits, subjectId, currentEventId, ignoredEventIds]);

  const selectedSet = useMemo(() => new Set(selectedSlotKeys), [selectedSlotKeys]);

  const getSecondaryGroupedModuleNames = (unit: CurriculumSlotUnit): string[] => {
    if (unit.modules.length <= 1) return [];
    const seenIds = new Set<string>();
    const names: string[] = [];
    unit.modules.slice(1).forEach(link => {
      if (seenIds.has(link.moduleId)) return;
      seenIds.add(link.moduleId);
      const topic = topics.find(t => t.id === link.topicId);
      const mod = topic?.modules?.find(m => m.id === link.moduleId);
      names.push(mod?.name || 'Módulo conjunto');
    });
    return names;
  };

  const filteredGroups = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const groupsMap = new Map<
      string,
      {
        topicId: string;
        topicName: string;
        units: CurriculumSlotUnit[];
        moduleGroups: ModuleSlotGroup[];
      }
    >();

    slotUnits.forEach(unit => {
      const groupedNames = getSecondaryGroupedModuleNames(unit);
      if (query) {
        const topicMatch = unit.primaryTopic.name.toLowerCase().includes(query);
        const modMatch = unit.primaryModule.name.toLowerCase().includes(query);
        const groupedMatch = groupedNames.some(n => n.toLowerCase().includes(query));
        const orderMatch = `#${unit.orderNumber}`.includes(query);
        if (!topicMatch && !modMatch && !groupedMatch && !orderMatch) return;
      }

      const tId = unit.primaryTopic.id;
      if (!groupsMap.has(tId)) {
        groupsMap.set(tId, {
          topicId: tId,
          topicName: unit.primaryTopic.name,
          units: [],
          moduleGroups: [],
        });
      }
      const topicEntry = groupsMap.get(tId)!;
      topicEntry.units.push(unit);

      const lastModGroup = topicEntry.moduleGroups[topicEntry.moduleGroups.length - 1];
      if (lastModGroup && lastModGroup.moduleId === unit.primaryModule.id) {
        lastModGroup.units.push(unit);
        groupedNames.forEach(gName => {
          if (!lastModGroup.groupedModuleNames.includes(gName)) {
            lastModGroup.groupedModuleNames.push(gName);
          }
        });
      } else {
        topicEntry.moduleGroups.push({
          moduleId: unit.primaryModule.id,
          moduleName: unit.primaryModule.name,
          units: [unit],
          groupedModuleNames: [...groupedNames],
        });
      }
    });

    return Array.from(groupsMap.values());
  }, [slotUnits, searchTerm, topics]);

  const emitOrderedSelection = (nextSet: Set<string>) => {
    const orderedKeys = slotUnits
      .filter(u => nextSet.has(u.slotKey))
      .map(u => u.slotKey);
    onChange(orderedKeys);
  };

  const toggleSlotKeysBatch = (keys: string[]) => {
    if (!keys.length) return;
    const nextSet = new Set(selectedSet);
    const allSelected = keys.every(k => nextSet.has(k));
    if (allSelected) {
      keys.forEach(k => nextSet.delete(k));
    } else {
      keys.forEach(k => nextSet.add(k));
    }
    emitOrderedSelection(nextSet);
  };

  const renderStatusBadge = (slotKey: string) => {
    const inOtherPeriod = Boolean(otherSelectedKeysInForm?.has(slotKey));
    const status = slotStatusMap.get(slotKey);

    if (inOtherPeriod) {
      return (
        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 whitespace-nowrap">
          Outro tempo
        </span>
      );
    }
    if (status?.kind === 'COMPLETED') {
      return (
        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 whitespace-nowrap tabular-nums">
          <CheckCircle2 className="w-2.5 h-2.5" />
          Concluído {status.shortDate}
        </span>
      );
    }
    if (status?.kind === 'PINNED') {
      return (
        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 flex items-center gap-1 whitespace-nowrap tabular-nums">
          <Pin className="w-2.5 h-2.5" />
          Fixado {status.shortDate}
        </span>
      );
    }
    if (status?.kind === 'AUTO_SCHEDULED') {
      return (
        <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 flex items-center gap-1 whitespace-nowrap tabular-nums">
          <Clock className="w-2.5 h-2.5" />
          Fila {status.shortDate}
        </span>
      );
    }
    return (
      <span className="text-[9px] font-semibold uppercase text-zinc-500 whitespace-nowrap">
        Na fila
      </span>
    );
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
              Selecione o assunto ou módulo abaixo (módulos de 2+ aulas já marcam todas as partes)
            </span>
          ) : (
            <span className="text-indigo-300 font-bold">
              {selectedSlotKeys.length}{' '}
              {selectedSlotKeys.length === 1
                ? 'tempo de aula selecionado'
                : 'tempos de aula selecionados'}
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

      <div className="max-h-64 overflow-y-auto space-y-2.5 pr-1 scrollbar-thin scrollbar-thumb-zinc-700">
        {filteredGroups.length === 0 ? (
          <div className="py-4 text-center text-xs text-zinc-500">
            Nenhum módulo encontrado para &ldquo;{searchTerm}&rdquo;.
          </div>
        ) : (
          filteredGroups.map(group => {
            const topicKeys = group.units.map(u => u.slotKey);
            const selectedInTopic = topicKeys.filter(k => selectedSet.has(k)).length;
            const isTopicAllSelected = selectedInTopic === topicKeys.length && topicKeys.length > 0;
            const isTopicPartiallySelected = selectedInTopic > 0 && !isTopicAllSelected;

            return (
              <div
                key={group.topicId}
                className="rounded-lg border border-zinc-800/90 bg-zinc-950/70 overflow-hidden"
              >
                {/* Cabeçalho clicável do Assunto: marca/desmarca todas as aulas do grupo de uma só vez */}
                <button
                  type="button"
                  onClick={() => toggleSlotKeysBatch(topicKeys)}
                  className={`w-full px-2.5 py-2 border-b border-zinc-800/80 flex items-center justify-between gap-2 text-left transition-colors ${
                    isTopicAllSelected
                      ? 'bg-indigo-950/60 hover:bg-indigo-950/75'
                      : 'bg-zinc-900/90 hover:bg-zinc-800/90'
                  }`}
                  title="Clique para selecionar todas as aulas deste assunto"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        isTopicAllSelected
                          ? 'bg-indigo-500 border-indigo-400 text-white'
                          : isTopicPartiallySelected
                            ? 'bg-indigo-500/30 border-indigo-400 text-indigo-200'
                            : 'border-zinc-600 bg-zinc-950 text-transparent'
                      }`}
                    >
                      {isTopicPartiallySelected ? (
                        <Minus className="w-3 h-3" />
                      ) : (
                        <Check className="w-3 h-3" />
                      )}
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-200 truncate">
                      {group.topicName}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] font-bold tabular-nums shrink-0 px-1.5 py-0.5 rounded border ${
                      isTopicAllSelected
                        ? 'bg-indigo-500/20 text-indigo-200 border-indigo-500/40'
                        : 'bg-zinc-950/80 text-zinc-400 border-zinc-800'
                    }`}
                  >
                    {group.units.length} {group.units.length === 1 ? 'aula' : 'aulas'}
                  </span>
                </button>

                <div className="divide-y divide-zinc-800/60">
                  {group.moduleGroups.map(modGroup => {
                    const modKeys = modGroup.units.map(u => u.slotKey);
                    const selectedInMod = modKeys.filter(k => selectedSet.has(k)).length;
                    const isModAllSelected = selectedInMod === modKeys.length && modKeys.length > 0;
                    const isModPartial = selectedInMod > 0 && !isModAllSelected;
                    const isMultiClassModule = modGroup.units.length > 1;
                    const firstUnit = modGroup.units[0];
                    const lastUnit = modGroup.units[modGroup.units.length - 1];

                    if (!isMultiClassModule) {
                      const unit = firstUnit;
                      const isChecked = selectedSet.has(unit.slotKey);

                      return (
                        <button
                          type="button"
                          key={unit.slotKey}
                          onClick={() => toggleSlotKeysBatch([unit.slotKey])}
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
                            </div>

                            {modGroup.groupedModuleNames.length > 0 && (
                              <div className="mt-1 flex items-start gap-1 text-[10px] text-amber-400/90">
                                <Link2 className="w-2.5 h-2.5 shrink-0 mt-0.5" />
                                <span className="leading-snug break-words">
                                  Conjunto com: {modGroup.groupedModuleNames.join(' • ')}
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="shrink-0 flex flex-col items-end gap-1">
                            {renderStatusBadge(unit.slotKey)}
                          </div>
                        </button>
                      );
                    }

                    // Módulo com 2+ aulas (ex: Parte 1/2 e Parte 2/2):
                    // Clicar no bloco principal seleciona TODAS as aulas do módulo automaticamente,
                    // e os botões individuais abaixo permitem marcar/desmarcar cada parte separadamente se necessário.
                    return (
                      <div
                        key={modGroup.moduleId}
                        className={`transition-colors ${
                          isModAllSelected
                            ? 'bg-indigo-950/35'
                            : isModPartial
                              ? 'bg-indigo-950/15'
                              : ''
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSlotKeysBatch(modKeys)}
                          className="w-full text-left px-2.5 pt-2 pb-1.5 flex items-start gap-2.5 hover:bg-zinc-900/60 transition-colors"
                        >
                          <div
                            className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                              isModAllSelected
                                ? 'bg-indigo-500 border-indigo-400 text-white'
                                : isModPartial
                                  ? 'bg-indigo-500/30 border-indigo-400 text-indigo-200'
                                  : 'border-zinc-700 bg-zinc-900 text-transparent'
                            }`}
                          >
                            {isModPartial ? (
                              <Minus className="w-3 h-3" />
                            ) : (
                              <Check className="w-3 h-3" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-extrabold text-zinc-500 tabular-nums">
                                #{firstUnit.orderNumber}–#{lastUnit.orderNumber}
                              </span>
                              <span
                                className={`text-xs font-medium leading-snug break-words ${
                                  isModAllSelected || isModPartial
                                    ? 'text-indigo-100 font-semibold'
                                    : 'text-zinc-200'
                                }`}
                              >
                                {modGroup.moduleName}
                              </span>
                              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 tabular-nums whitespace-nowrap">
                                {modGroup.units.length} aulas
                              </span>
                            </div>

                            {modGroup.groupedModuleNames.length > 0 && (
                              <div className="mt-1 flex items-start gap-1 text-[10px] text-amber-400/90">
                                <Link2 className="w-2.5 h-2.5 shrink-0 mt-0.5" />
                                <span className="leading-snug break-words">
                                  Conjunto com: {modGroup.groupedModuleNames.join(' • ')}
                                </span>
                              </div>
                            )}
                          </div>
                        </button>

                        {/* Chips individuais das partes (Parte 1/2, Parte 2/2...) */}
                        <div className="px-2.5 pb-2.5 pl-9 flex flex-wrap gap-1.5">
                          {modGroup.units.map(unit => {
                            const isPartChecked = selectedSet.has(unit.slotKey);
                            return (
                              <button
                                type="button"
                                key={unit.slotKey}
                                onClick={() => toggleSlotKeysBatch([unit.slotKey])}
                                className={`px-2 py-1 rounded-md border text-[10px] font-bold flex items-center gap-1.5 transition-all tabular-nums ${
                                  isPartChecked
                                    ? 'bg-indigo-600/30 border-indigo-400/70 text-indigo-100 shadow-sm'
                                    : 'bg-zinc-900/90 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                                }`}
                                title={`Selecionar ou desmarcar apenas a Parte ${unit.primaryIndexLabel}`}
                              >
                                <div
                                  className={`w-3 h-3 rounded-sm border flex items-center justify-center shrink-0 ${
                                    isPartChecked
                                      ? 'bg-indigo-500 border-indigo-300 text-white'
                                      : 'border-zinc-600 bg-zinc-950 text-transparent'
                                  }`}
                                >
                                  <Check className="w-2.5 h-2.5" />
                                </div>
                                <span>Parte {unit.primaryIndexLabel}</span>
                                <span className="opacity-90">{renderStatusBadge(unit.slotKey)}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
