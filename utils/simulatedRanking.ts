import {
  ClassRankingConfig,
  RankingMode,
  RankingVacancies
} from '../services/simulatedService';

export interface RankingCategoryOption {
  id: string;
  label: string;
  immediate: number;
  reserve: number;
}

export type VacancyStatus = 'immediate' | 'reserve' | 'surplus' | 'none';

const sanitizeCount = (value: unknown): number => {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.floor(num);
};

export const createDefaultRankingConfig = (): ClassRankingConfig => ({
  mode: 'general',
  general: { immediate: 0, reserve: 0 },
  gender: {
    male: { immediate: 0, reserve: 0 },
    female: { immediate: 0, reserve: 0 }
  },
  regions: []
});

export const normalizeRankingConfig = (
  config?: ClassRankingConfig | null
): ClassRankingConfig => {
  const mode: RankingMode =
    config?.mode === 'gender' || config?.mode === 'regional'
      ? config.mode
      : 'general';

  return {
    mode,
    general: {
      immediate: sanitizeCount(config?.general?.immediate),
      reserve: sanitizeCount(config?.general?.reserve)
    },
    gender: {
      male: {
        immediate: sanitizeCount(config?.gender?.male?.immediate),
        reserve: sanitizeCount(config?.gender?.male?.reserve)
      },
      female: {
        immediate: sanitizeCount(config?.gender?.female?.immediate),
        reserve: sanitizeCount(config?.gender?.female?.reserve)
      }
    },
    regions: Array.isArray(config?.regions)
      ? config!.regions.map((region, idx) => ({
          id: region.id || `region_${idx + 1}`,
          name: (region.name || '').trim(),
          immediate: sanitizeCount(region.immediate),
          reserve: sanitizeCount(region.reserve)
        }))
      : []
  };
};

export const getRankingOptions = (
  config?: ClassRankingConfig | null
): RankingCategoryOption[] => {
  const normalized = normalizeRankingConfig(config);

  if (normalized.mode === 'gender') {
    return [
      {
        id: 'male',
        label: 'Masculino',
        immediate: normalized.gender?.male.immediate || 0,
        reserve: normalized.gender?.male.reserve || 0
      },
      {
        id: 'female',
        label: 'Feminino',
        immediate: normalized.gender?.female.immediate || 0,
        reserve: normalized.gender?.female.reserve || 0
      }
    ];
  }

  if (normalized.mode === 'regional') {
    return (normalized.regions || [])
      .filter((r) => r.name.trim().length > 0)
      .map((r) => ({
        id: r.id,
        label: r.name.trim(),
        immediate: r.immediate,
        reserve: r.reserve
      }));
  }

  return [];
};

export const getTotalVacancies = (
  config?: ClassRankingConfig | null
): RankingVacancies => {
  const normalized = normalizeRankingConfig(config);

  if (normalized.mode === 'gender') {
    const male = normalized.gender?.male || { immediate: 0, reserve: 0 };
    const female = normalized.gender?.female || { immediate: 0, reserve: 0 };
    return {
      immediate: male.immediate + female.immediate,
      reserve: male.reserve + female.reserve
    };
  }

  if (normalized.mode === 'regional') {
    return (normalized.regions || []).reduce(
      (acc, region) => ({
        immediate: acc.immediate + region.immediate,
        reserve: acc.reserve + region.reserve
      }),
      { immediate: 0, reserve: 0 }
    );
  }

  return {
    immediate: normalized.general?.immediate || 0,
    reserve: normalized.general?.reserve || 0
  };
};

export const getVacanciesForView = (
  config: ClassRankingConfig | null | undefined,
  viewId: 'general' | string
): RankingVacancies => {
  const normalized = normalizeRankingConfig(config);

  if (viewId === 'general') {
    return getTotalVacancies(normalized);
  }

  const options = getRankingOptions(normalized);
  const found = options.find((opt) => opt.id === viewId);
  if (found) {
    return { immediate: found.immediate, reserve: found.reserve };
  }

  return { immediate: 0, reserve: 0 };
};

export const getVacancyStatus = (
  approvedPosition: number,
  vacancies: RankingVacancies
): VacancyStatus => {
  const immediate = sanitizeCount(vacancies.immediate);
  const reserve = sanitizeCount(vacancies.reserve);

  if (immediate === 0 && reserve === 0) return 'none';
  if (approvedPosition <= immediate) return 'immediate';
  if (approvedPosition <= immediate + reserve) return 'reserve';
  return 'surplus';
};

export const getVacancyStatusMeta = (status: VacancyStatus) => {
  switch (status) {
    case 'immediate':
      return {
        label: 'Dentro das Vagas',
        shortLabel: 'Vaga Imediata',
        className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
      };
    case 'reserve':
      return {
        label: 'Cadastro Reserva',
        shortLabel: 'Cadastro Reserva',
        className: 'bg-amber-500/15 text-amber-400 border-amber-500/30'
      };
    case 'surplus':
      return {
        label: 'Excedente',
        shortLabel: 'Fora das Vagas',
        className: 'bg-zinc-800/80 text-zinc-400 border-zinc-700'
      };
    default:
      return null;
  }
};

export const getRankingModeLabel = (config?: ClassRankingConfig | null): string => {
  const normalized = normalizeRankingConfig(config);
  if (normalized.mode === 'gender') return 'Ranking por Gênero';
  if (normalized.mode === 'regional') return 'Ranking Regional';
  return 'Ranking Geral';
};
