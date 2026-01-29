
export const getWeekId = (date: Date = new Date()): string => {
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  const weekNo = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  return `${target.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};

export const getPreviousWeekId = (currentWeekId: string): string => {
  const [year, week] = currentWeekId.split('-W').map(Number);
  const date = new Date(year, 0, 1 + (week - 1) * 7);
  date.setDate(date.getDate() - 7);
  return getWeekId(date);
};

export const getMonthAgoWeekId = (currentWeekId: string): string => {
  const [year, week] = currentWeekId.split('-W').map(Number);
  const date = new Date(year, 0, 1 + (week - 1) * 7);
  date.setDate(date.getDate() - 28); // Roughly 4 weeks
  return getWeekId(date);
};

export const getYearAgoWeekId = (currentWeekId: string): string => {
  const [year, week] = currentWeekId.split('-W').map(Number);
  return `${year - 1}-W${String(week).padStart(2, '0')}`;
};

export const getNextWeekId = (currentWeekId: string): string => {
  const [year, week] = currentWeekId.split('-W').map(Number);
  const date = new Date(year, 0, 1 + (week - 1) * 7);
  date.setDate(date.getDate() + 7);
  return getWeekId(date);
};

export const isPastWeek = (weekId: string, currentWeekId: string): boolean => {
  return weekId < currentWeekId; 
};

export const formatWeekDisplay = (weekId: string): string => {
  if (!weekId) return 'Unknown Week';
  return weekId.replace('-W', ' Week ');
};

export const formatDateShort = (timestamp: number): string => {
  return new Date(timestamp).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
};

export const parseDate = (dateString: string): Date | null => {
  if (!dateString) return null;
  const d = new Date(dateString);
  return isNaN(d.getTime()) ? null : d;
};
