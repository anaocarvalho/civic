// Client-side calendar exports: .ics files (with a 1-day-before alarm) and Google Calendar links.
import { parseDay, toYmd } from './util.js';

const compact = (ymd) => ymd.replace(/-/g, '');
const nextDay = (ymd) => { const d = parseDay(ymd); d.setDate(d.getDate() + 1); return toYmd(d); };

function escText(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// RFC 5545 lines must be folded at 75 octets.
function fold(line) {
  const out = [];
  while (line.length > 74) { out.push(line.slice(0, 74)); line = ` ${line.slice(74)}`; }
  out.push(line);
  return out.join('\r\n');
}

export function buildIcs(events, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//VoteHub//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${compact(e.date)}-${e.id}@votehub`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(e.date)}`,
      `DTEND;VALUE=DATE:${compact(nextDay(e.date))}`,
      `SUMMARY:${escText(e.title)}`,
      `DESCRIPTION:${escText(e.note || '')}`,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escText(`Tomorrow: ${e.title}`)}`,
      'TRIGGER:-P1D',
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

export function downloadIcs(events, filename) {
  const blob = new Blob([buildIcs(events)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function googleCalendarUrl(e) {
  const params = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates: `${compact(e.date)}/${compact(nextDay(e.date))}`, details: e.note || '' });
  return `https://calendar.google.com/calendar/render?${params}`;
}
