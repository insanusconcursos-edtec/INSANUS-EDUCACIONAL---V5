import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Check,
  Trophy,
  Clock,
  DoorOpen,
  Lock,
  Play,
  Flag,
  AlertTriangle,
  Loader2,
  FileText,
} from 'lucide-react';
import { Class } from '../../../../../../types/class';
import { ClassScheduleEvent } from '../../../../../../types/schedule';
import {
  getExams,
  getSimulatedClassById,
  SimulatedClass,
  SimulatedExam,
} from '../../../../../../services/simulatedService';

interface AddSimuladoAppointmentModalProps {
  selectedDate: string;
  classData: Class;
  linkedSimulatedClassId: string;
  eventToEdit?: ClassScheduleEvent | null;
  onClose: () => void;
  onSave: (simuladoAppointment: Partial<ClassScheduleEvent>) => void;
}

export const formatSimuladoDuration = (minutes?: number): string => {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  if (total === 0) return '0 min';
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0 && m > 0) return `${h}h ${String(m).padStart(2, '0')}min`;
  if (h > 0) return `${h}h`;
  return `${m} min`;
};

const timeToMinutes = (timeStr: string): number | null => {
  if (!timeStr || !timeStr.includes(':')) return null;
  const [hStr, mStr] = timeStr.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

const addMinutesToTime = (
  startTime: string,
  durationMinutes: number
): { endTime: string; crossesMidnight: boolean } => {
  const startTotal = timeToMinutes(startTime);
  if (startTotal === null) {
    return { endTime: '', crossesMidnight: false };
  }
  const rawEnd = startTotal + Math.max(0, Math.round(durationMinutes));
  const crossesMidnight = rawEnd >= 24 * 60;
  const normalized = ((rawEnd % (24 * 60)) + 24 * 60) % (24 * 60);
  const endH = Math.floor(normalized / 60);
  const endM = normalized % 60;
  return {
    endTime: `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`,
    crossesMidnight,
  };
};

const inferShiftFromExamStart = (timeStr: string): 'MORNING' | 'AFTERNOON' | 'NIGHT' => {
  const mins = timeToMinutes(timeStr);
  if (mins === null) return 'MORNING';
  if (mins < 12 * 60) return 'MORNING';
  if (mins < 18 * 60) return 'AFTERNOON';
  return 'NIGHT';
};

const getPresetTimesByShift = (shift?: string) => {
  if (shift === 'AFTERNOON') {
    return { gatesOpen: '13:00', gatesClose: '13:45', examStart: '14:00' };
  }
  if (shift === 'NIGHT') {
    return { gatesOpen: '18:00', gatesClose: '18:45', examStart: '19:00' };
  }
  return { gatesOpen: '07:00', gatesClose: '07:45', examStart: '08:00' };
};

export const AddSimuladoAppointmentModal: React.FC<AddSimuladoAppointmentModalProps> = ({
  selectedDate,
  classData,
  linkedSimulatedClassId,
  eventToEdit = null,
  onClose,
  onSave,
}) => {
  const isEditing = Boolean(eventToEdit);
  const effectiveDate = eventToEdit?.date || selectedDate;
  const dateObj = new Date(`${effectiveDate}T12:00:00`);
  const dayOfWeek = dateObj.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  const initialPreset = useMemo(() => {
    if (eventToEdit) {
      return {
        gatesOpen: eventToEdit.gatesOpenTime || eventToEdit.startTime || '07:00',
        gatesClose: eventToEdit.gatesCloseTime || eventToEdit.examStartTime || '07:45',
        examStart: eventToEdit.examStartTime || eventToEdit.startTime || '08:00',
      };
    }
    // Em finais de semana, simulados normalmente ocorrem pela manhã por padrão; em dias úteis seguem o turno da turma
    return getPresetTimesByShift(isWeekend ? 'MORNING' : classData.shift);
  }, [eventToEdit, isWeekend, classData.shift]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [simulatedClass, setSimulatedClass] = useState<SimulatedClass | null>(null);
  const [exams, setExams] = useState<SimulatedExam[]>([]);

  const [selectedExamId, setSelectedExamId] = useState<string>(
    eventToEdit?.simulatedExamId || ''
  );
  const [gatesOpenTime, setGatesOpenTime] = useState<string>(initialPreset.gatesOpen);
  const [gatesCloseTime, setGatesCloseTime] = useState<string>(initialPreset.gatesClose);
  const [examStartTime, setExamStartTime] = useState<string>(initialPreset.examStart);
  const [fallbackDurationMinutes, setFallbackDurationMinutes] = useState<number>(
    eventToEdit?.durationMinutes && eventToEdit.durationMinutes > 0
      ? eventToEdit.durationMinutes
      : 240
  );

  useEffect(() => {
    let cancelled = false;
    const loadSimulatedData = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [simClassData, examsList] = await Promise.all([
          getSimulatedClassById(linkedSimulatedClassId),
          getExams(linkedSimulatedClassId),
        ]);
        if (cancelled) return;
        setSimulatedClass(simClassData);
        setExams(examsList);

        if (eventToEdit?.simulatedExamId) {
          setSelectedExamId(eventToEdit.simulatedExamId);
        } else if (examsList.length === 1 && examsList[0].id) {
          setSelectedExamId(examsList[0].id);
        }
      } catch (err) {
        console.error('Erro ao carregar simulados da turma vinculada:', err);
        if (!cancelled) {
          setLoadError('Não foi possível carregar os simulados da turma vinculada.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadSimulatedData();
    return () => {
      cancelled = true;
    };
  }, [linkedSimulatedClassId, eventToEdit?.simulatedExamId]);

  const selectedExam = useMemo(
    () => exams.find((ex) => ex.id === selectedExamId) || null,
    [exams, selectedExamId]
  );

  const hasRegisteredDuration = Boolean(
    selectedExam && Number(selectedExam.duration) > 0
  );

  const effectiveDurationMinutes = useMemo(() => {
    if (selectedExam && Number(selectedExam.duration) > 0) {
      return Number(selectedExam.duration);
    }
    if (eventToEdit && !selectedExam && Number(eventToEdit.durationMinutes) > 0) {
      return Number(eventToEdit.durationMinutes);
    }
    return Math.max(15, Number(fallbackDurationMinutes) || 240);
  }, [selectedExam, eventToEdit, fallbackDurationMinutes]);

  const { endTime: calculatedExamEndTime, crossesMidnight } = useMemo(
    () => addMinutesToTime(examStartTime, effectiveDurationMinutes),
    [examStartTime, effectiveDurationMinutes]
  );

  const inferredShift = useMemo(
    () => inferShiftFromExamStart(examStartTime),
    [examStartTime]
  );

  const timeValidationError = useMemo(() => {
    const openMins = timeToMinutes(gatesOpenTime);
    const closeMins = timeToMinutes(gatesCloseTime);
    const startMins = timeToMinutes(examStartTime);

    if (openMins === null || closeMins === null || startMins === null) {
      return 'Preencha todos os horários de aplicação.';
    }
    if (openMins > closeMins) {
      return 'A abertura dos portões não pode ocorrer após o fechamento dos portões.';
    }
    if (closeMins > startMins) {
      return 'O fechamento dos portões deve ocorrer antes ou no exato horário de início da prova.';
    }
    return null;
  }, [gatesOpenTime, gatesCloseTime, examStartTime]);

  const applyShiftPreset = (targetShift: 'MORNING' | 'AFTERNOON' | 'NIGHT') => {
    const preset = getPresetTimesByShift(targetShift);
    setGatesOpenTime(preset.gatesOpen);
    setGatesCloseTime(preset.gatesClose);
    setExamStartTime(preset.examStart);
  };

  const isSaveDisabled =
    loading ||
    !selectedExamId ||
    Boolean(timeValidationError) ||
    !calculatedExamEndTime ||
    effectiveDurationMinutes <= 0;

  const handleSave = () => {
    if (isSaveDisabled) return;

    const examTitle =
      selectedExam?.title || eventToEdit?.simulatedTitle || 'Simulado Oficial';
    const questionCount =
      selectedExam?.questionCount ?? eventToEdit?.simulatedQuestionCount;
    const examType = selectedExam?.type ?? eventToEdit?.simulatedExamType;

    const payload: Partial<ClassScheduleEvent> = {
      id:
        eventToEdit?.id ||
        `simulado-${effectiveDate}-${Math.random().toString(36).substring(2, 10)}`,
      classId: classData.id,
      date: effectiveDate,
      startTime: gatesOpenTime,
      endTime: calculatedExamEndTime,
      shift: inferredShift,
      eventType: 'SIMULADO',
      subjectId: '',
      topicId: '',
      moduleId: '',
      teacherId: '',
      isSubstitute: false,
      status: eventToEdit?.status || 'SCHEDULED',
      meetingNumber: 0,
      classOrderIndex: 0,
      isOverflow: false,
      isLiveEvent: false,
      simulatedClassId: linkedSimulatedClassId,
      simulatedExamId: selectedExamId,
      simulatedTitle: examTitle,
      simulatedQuestionCount: questionCount,
      simulatedExamType: examType,
      durationMinutes: effectiveDurationMinutes,
      gatesOpenTime,
      gatesCloseTime,
      examStartTime,
      examEndTime: calculatedExamEndTime,
    };

    onSave(payload);
  };

  const shiftLabel =
    inferredShift === 'MORNING'
      ? 'Manhã'
      : inferredShift === 'AFTERNOON'
        ? 'Tarde'
        : 'Noite';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg rounded-xl overflow-hidden bg-gradient-to-b from-[#15120a] via-[#0b0b0d] to-[#120f08] border border-amber-500/40 shadow-2xl animate-in zoom-in-95 duration-150">
        {/* Top metallic gold sheen */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/80 to-transparent" />

        {/* Header */}
        <div className="p-4 border-b border-amber-500/20 flex items-center justify-between gap-3 bg-black/40">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-400/25 via-amber-500/15 to-amber-700/10 border border-amber-400/40 flex items-center justify-center shrink-0">
              <Trophy className="w-5 h-5 text-amber-300" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-amber-50 truncate">
                {isEditing ? 'Editar Agendamento de Simulado' : 'Agendar Simulado Oficial'}
              </h3>
              <p className="text-xs text-amber-200/70 truncate">
                {simulatedClass?.title
                  ? `Turma de Simulados: ${simulatedClass.title}`
                  : 'Aplicação oficial vinculada à turma'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-amber-200 transition-colors p-1 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto scrollbar-thin scrollbar-thumb-amber-500/30">
          {/* Date & Inferred Shift */}
          <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-black/50 border border-amber-500/20">
            <div className="min-w-0">
              <span className="text-[11px] font-semibold text-amber-300/70 block">
                Data de Aplicação
              </span>
              <span className="text-sm font-semibold text-zinc-100 capitalize block truncate">
                {dateObj.toLocaleDateString('pt-BR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
            </div>
            <div className="text-right shrink-0">
              <span className="text-[11px] font-semibold text-amber-300/70 block">
                Turno no Cronograma
              </span>
              <span className="text-xs font-bold text-amber-300 whitespace-nowrap">
                {shiftLabel}
              </span>
            </div>
          </div>

          {loading ? (
            <div className="py-10 flex flex-col items-center justify-center gap-3 text-amber-200/80">
              <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
              <span className="text-xs">Buscando simulados cadastrados na turma vinculada...</span>
            </div>
          ) : loadError ? (
            <div className="p-4 rounded-lg bg-red-950/40 border border-red-500/40 text-red-200 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{loadError}</span>
            </div>
          ) : exams.length === 0 ? (
            <div className="p-6 rounded-lg bg-zinc-950/80 border border-amber-500/20 text-center space-y-2">
              <FileText className="w-7 h-7 text-amber-400/60 mx-auto" />
              <p className="text-sm font-semibold text-zinc-200">
                Nenhum simulado cadastrado nesta turma de simulados
              </p>
              <p className="text-xs text-zinc-400">
                Cadastre ao menos um simulado no módulo de Simulados para poder agendá-lo no cronograma presencial.
              </p>
            </div>
          ) : (
            <>
              {/* Exam Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-amber-200/80 block">
                  Simulado da Turma
                </label>
                <select
                  value={selectedExamId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setSelectedExamId(nextId);
                    const found = exams.find((ex) => ex.id === nextId);
                    if (found?.duration && found.duration > 0) {
                      setFallbackDurationMinutes(found.duration);
                    }
                  }}
                  className="w-full bg-zinc-950 border border-amber-500/30 rounded-lg px-3 py-2.5 text-sm text-amber-50 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none"
                >
                  <option value="">Selecione qual simulado será aplicado...</option>
                  {exams.map((exam) => {
                    const durText = exam.duration
                      ? formatSimuladoDuration(exam.duration)
                      : 'Sem duração definida';
                    const statusSuffix = exam.status === 'draft' ? ' [Rascunho]' : '';
                    return (
                      <option key={exam.id} value={exam.id}>
                        {exam.title} — {durText} ({exam.questionCount} questões){statusSuffix}
                      </option>
                    );
                  })}
                </select>

                {selectedExam && (
                  <div className="flex items-center justify-between gap-2 pt-1 text-xs text-zinc-400 tabular-nums">
                    <span>
                      {selectedExam.questionCount} questões ·{' '}
                      {selectedExam.type === 'true_false'
                        ? 'Certo ou Errado'
                        : 'Múltipla Escolha'}
                      {selectedExam.status === 'draft' ? ' · Em rascunho' : ''}
                    </span>
                    <span className="text-amber-300 font-semibold whitespace-nowrap">
                      Duração: {formatSimuladoDuration(effectiveDurationMinutes)}
                    </span>
                  </div>
                )}
              </div>

              {/* Fallback Duration Input ONLY if selected exam has no duration registered */}
              {selectedExam && !hasRegisteredDuration && (
                <div className="p-3 rounded-lg bg-amber-950/25 border border-amber-500/30 space-y-2">
                  <div className="flex items-start gap-2 text-xs text-amber-200">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>
                      Este simulado ainda não possui duração cadastrada. Informe a duração (em minutos) para calcular o término da prova:
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={15}
                      max={720}
                      step={5}
                      value={fallbackDurationMinutes}
                      onChange={(e) =>
                        setFallbackDurationMinutes(
                          Math.max(15, Math.min(720, Number(e.target.value) || 240))
                        )
                      }
                      className="w-28 bg-zinc-950 border border-amber-500/40 rounded-lg px-3 py-1.5 text-sm text-white tabular-nums focus:border-amber-400 outline-none"
                    />
                    <span className="text-xs text-amber-300 font-medium tabular-nums">
                      minutos ({formatSimuladoDuration(fallbackDurationMinutes)})
                    </span>
                  </div>
                </div>
              )}

              {/* Quick Shift Presets + 3 Gate/Exam Time Inputs */}
              <div className="space-y-3 pt-2 border-t border-amber-500/15">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-amber-200/80">
                    Horários Oficiais de Aplicação
                  </span>
                  <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
                    <button
                      type="button"
                      onClick={() => applyShiftPreset('MORNING')}
                      className={`px-2 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                        inferredShift === 'MORNING'
                          ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Manhã (08h)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyShiftPreset('AFTERNOON')}
                      className={`px-2 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                        inferredShift === 'AFTERNOON'
                          ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Tarde (14h)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyShiftPreset('NIGHT')}
                      className={`px-2 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                        inferredShift === 'NIGHT'
                          ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Noite (19h)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-zinc-950/90 border border-zinc-800 space-y-1.5">
                    <label className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1.5 whitespace-nowrap">
                      <DoorOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      Abertura Portões
                    </label>
                    <input
                      type="time"
                      value={gatesOpenTime}
                      onChange={(e) => setGatesOpenTime(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-2.5 py-1.5 text-sm font-semibold text-white tabular-nums focus:border-amber-400 outline-none"
                    />
                  </div>

                  <div className="p-3 rounded-lg bg-zinc-950/90 border border-zinc-800 space-y-1.5">
                    <label className="text-[11px] font-semibold text-amber-300 flex items-center gap-1.5 whitespace-nowrap">
                      <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      Fechamento Portões
                    </label>
                    <input
                      type="time"
                      value={gatesCloseTime}
                      onChange={(e) => setGatesCloseTime(e.target.value)}
                      className="w-full bg-zinc-900 border border-amber-500/35 rounded-md px-2.5 py-1.5 text-sm font-semibold text-amber-100 tabular-nums focus:border-amber-400 outline-none"
                    />
                  </div>

                  <div className="p-3 rounded-lg bg-zinc-950/90 border border-amber-500/40 space-y-1.5">
                    <label className="text-[11px] font-semibold text-amber-200 flex items-center gap-1.5 whitespace-nowrap">
                      <Play className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      Início da Prova
                    </label>
                    <input
                      type="time"
                      value={examStartTime}
                      onChange={(e) => setExamStartTime(e.target.value)}
                      className="w-full bg-zinc-900 border border-amber-500/50 rounded-md px-2.5 py-1.5 text-sm font-bold text-white tabular-nums focus:border-amber-400 outline-none"
                    />
                  </div>
                </div>

                {timeValidationError && (
                  <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>{timeValidationError}</span>
                  </div>
                )}

                {/* Auto-calculated End Time Summary */}
                <div className="p-3.5 rounded-lg bg-gradient-to-r from-[#1b1508] via-[#131008] to-[#1e1709] border border-amber-500/35 flex items-center justify-between gap-4 tabular-nums">
                  <div className="space-y-0.5 min-w-0">
                    <span className="text-[11px] font-semibold text-amber-300/80 flex items-center gap-1.5">
                      <Flag className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      Término Calculado da Prova
                    </span>
                    <p className="text-xs text-zinc-400">
                      Início às <strong className="text-zinc-200">{examStartTime || '--:--'}</strong> +{' '}
                      <strong className="text-amber-300">
                        {formatSimuladoDuration(effectiveDurationMinutes)}
                      </strong>{' '}
                      de duração do simulado
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-bold text-amber-300 flex items-center justify-end gap-1.5 whitespace-nowrap">
                      <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>{calculatedExamEndTime || '--:--'}</span>
                    </div>
                    {crossesMidnight && (
                      <span className="text-[10px] text-amber-400/80 block">
                        Encerra no dia seguinte
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-amber-500/20 bg-black/50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaveDisabled}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-400 text-zinc-950 hover:from-amber-400 hover:to-yellow-300 shadow-lg shadow-amber-500/15 transition-all disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
          >
            <Check className="w-4 h-4 shrink-0" />
            {isEditing ? 'Salvar Alterações' : 'Agendar Simulado'}
          </button>
        </div>
      </div>
    </div>
  );
};
