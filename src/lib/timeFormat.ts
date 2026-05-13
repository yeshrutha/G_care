export interface TimeParts12Hour {
  hour: string;
  minute: string;
  period: 'AM' | 'PM';
}

export function to12HourParts(time24: string): TimeParts12Hour {
  const [hourString = '0', minuteString = '0'] = time24.split(':');
  const hour24 = Number(hourString);
  const safeHour = Number.isNaN(hour24) ? 0 : hour24;
  const period = safeHour >= 12 ? 'PM' : 'AM';
  const hour12 = safeHour % 12 || 12;

  return {
    hour: String(hour12).padStart(2, '0'),
    minute: minuteString.padStart(2, '0'),
    period,
  };
}

export function from12HourParts(parts: TimeParts12Hour) {
  const hour12 = Number(parts.hour);
  const minute = Number(parts.minute);
  const normalizedHour = Number.isNaN(hour12) ? 12 : hour12;
  const normalizedMinute = Number.isNaN(minute) ? 0 : minute;
  const hour24 =
    parts.period === 'PM'
      ? normalizedHour === 12
        ? 12
        : normalizedHour + 12
      : normalizedHour === 12
        ? 0
        : normalizedHour;

  return `${String(hour24).padStart(2, '0')}:${String(normalizedMinute).padStart(2, '0')}`;
}

export function formatTime12Hour(time24: string) {
  const parts = to12HourParts(time24);
  return `${Number(parts.hour)}:${parts.minute} ${parts.period}`;
}
