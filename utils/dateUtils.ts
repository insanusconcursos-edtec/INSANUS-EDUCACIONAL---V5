export const toLocalISODate = (date: Date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const parseSafeLocalDate = (dateString: string | undefined | null): Date | null => {
  if (!dateString) return null;
  const datePart = dateString.split('T')[0];
  const [year, month, day] = datePart.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 12, 0, 0);
};

export const formatSafeDateLocal = (dateString: string | undefined | null): string => {
  if (!dateString) return '';
  try {
    // Pega apenas a parte da data (YYYY-MM-DD) ignorando o tempo (T00:00:00Z)
    const datePart = dateString.split('T')[0];
    const [year, month, day] = datePart.split('-');
    
    if (year && month && day) {
      return `${day}/${month}/${year}`;
    }
    return dateString;
  } catch {
    return dateString || '';
  }
};

