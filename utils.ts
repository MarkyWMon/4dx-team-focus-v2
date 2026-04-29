// Day of week the WIG cycle starts on (0=Sun..6=Sat). 1=Monday matches ISO weeks.
let WIG_DAY_OF_WEEK = 1;

export const setWigDayOfWeek = (day: number | undefined | null) => {
  if (typeof day !== 'number' || day < 0 || day > 6) return;
  WIG_DAY_OF_WEEK = day;
};

export const getWigDayOfWeek = () => WIG_DAY_OF_WEEK;

export const getWeekId = (date: Date = new Date()): string => {
  // Shift the date back by (configured day - Monday) so the WIG day acts as the week start.
  const shift = ((WIG_DAY_OF_WEEK - 1) + 7) % 7;
  const adjusted = new Date(date.valueOf());
  adjusted.setDate(adjusted.getDate() - shift);

  const target = new Date(adjusted.valueOf());
  const dayNr = (adjusted.getDay() + 6) % 7;
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
