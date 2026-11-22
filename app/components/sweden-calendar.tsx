import type {ReactNode} from 'react';

/** ISO 8601: Monday first; week 1 contains the first Thursday of the year. */
export function isoWeekNumber(date: Date): number {
  const thursday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  thursday.setUTCDate(thursday.getUTCDate() + 3 - ((thursday.getUTCDay() + 6) % 7));
  const weekYear = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(weekYear, 0, 4));
  firstThursday.setUTCDate(firstThursday.getUTCDate() + 3 - ((firstThursday.getUTCDay() + 6) % 7));
  return 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / 604800000);
}

function calendarWeeks(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) return [];
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const leading = (first.getUTCDay() + 6) % 7;
  const count = Math.ceil((leading + daysInMonth) / 7);
  return Array.from({length: count}, (_, index) => {
    const monday = new Date(Date.UTC(year, monthNumber - 1, 1 - leading + index * 7));
    const weekNumber = isoWeekNumber(monday);
    const days = Array.from({length: 7}, (_, dayIndex) => {
      const date = new Date(monday);
      date.setUTCDate(monday.getUTCDate() + dayIndex);
      const inMonth = date.getUTCFullYear() === year && date.getUTCMonth() === monthNumber - 1;
      return {date: date.toISOString().slice(0, 10), day: date.getUTCDate(), inMonth};
    });
    return {weekNumber, days};
  });
}

/** Swedish calendar with Vecka column and ISO week numbers. */
export default function SwedishCalendar({month, renderDay}: {month: string; renderDay: (date: string, day: number) => ReactNode}) {
  return <div className="calendargrid swedish-calendar" aria-label={`Календарь ${month}, недели ISO 8601`}>
    <div className="calendar-week-heading" title="Номер недели по ISO 8601">v.</div>
    {['Mån','Tis','Ons','Tor','Fre','Lör','Sön'].map(day => <div className="calendar-week-heading" key={day}>{day}</div>)}
    {calendarWeeks(month).map(week => <div className="calendar-week-row" key={`${month}-${week.days[0].date}`}>
      <div className="calendar-week-number" title={`Vecka ${week.weekNumber}`}>v.{week.weekNumber}</div>
      {week.days.map(day => day.inMonth
        ? <div className="calendar-day-slot" key={day.date}>{renderDay(day.date, day.day)}</div>
        : <div className="calendar-day-outside" aria-hidden="true" key={day.date}>{day.day}</div>)}
    </div>)}
  </div>;
}
