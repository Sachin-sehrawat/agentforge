import React, { useEffect, useRef, useState } from 'react';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS   = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function parseIso(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toIso(date) {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDisplay(iso) {
  if (!iso) return '';
  const d = parseIso(iso);
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

export default function CalendarPicker({ value, onChange, placeholder = 'Pick a date', minDate, maxDate }) {
  const [open, setOpen]         = useState(false);
  const [viewYear, setViewYear] = useState(null);
  const [viewMonth, setViewMonth] = useState(null);
  const ref = useRef(null);

  const selected = parseIso(value);
  const today    = new Date();

  // Initialise view to selected date or today
  useEffect(() => {
    const base = selected || today;
    setViewYear(base.getFullYear());
    setViewMonth(base.getMonth());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const prevMonth = () => {
    setViewMonth((m) => { if (m === 0) { setViewYear((y) => y - 1); return 11; } return m - 1; });
  };
  const nextMonth = () => {
    setViewMonth((m) => { if (m === 11) { setViewYear((y) => y + 1); return 0; } return m + 1; });
  };

  const pickDay = (day) => {
    const picked = new Date(viewYear, viewMonth, day);
    onChange(toIso(picked));
    setOpen(false);
  };

  const clear = (e) => {
    e.stopPropagation();
    onChange('');
  };

  const isDisabled = (day) => {
    const d = new Date(viewYear, viewMonth, day);
    if (minDate && d < parseIso(minDate)) return true;
    if (maxDate && d > parseIso(maxDate)) return true;
    return false;
  };

  const isSelected = (day) => {
    if (!selected) return false;
    return selected.getFullYear() === viewYear && selected.getMonth() === viewMonth && selected.getDate() === day;
  };

  const isToday = (day) => {
    return today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === day;
  };

  const totalDays  = viewYear != null ? daysInMonth(viewYear, viewMonth) : 0;
  const startDay   = viewYear != null ? firstDayOfMonth(viewYear, viewMonth) : 0;
  const cells      = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);
  // pad to full rows
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="cal-wrap" ref={ref}>
      <button
        type="button"
        className={`cal-trigger field-input${open ? ' cal-trigger--open' : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        <svg className="cal-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <span className={value ? '' : 'cal-placeholder'}>
          {value ? formatDisplay(value) : placeholder}
        </span>
        {value && (
          <span className="cal-clear" onClick={clear} role="button" aria-label="Clear date">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </span>
        )}
      </button>

      {open && viewYear != null && (
        <div className="cal-dropdown">
          {/* Header */}
          <div className="cal-header">
            <button type="button" className="cal-nav" onClick={prevMonth} aria-label="Previous month">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span className="cal-month-label">{MONTHS[viewMonth]} {viewYear}</span>
            <button type="button" className="cal-nav" onClick={nextMonth} aria-label="Next month">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>

          {/* Day-of-week headers */}
          <div className="cal-grid">
            {DAYS.map((d) => (
              <div key={d} className="cal-dow">{d}</div>
            ))}

            {/* Day cells */}
            {cells.map((day, i) => (
              <button
                key={i}
                type="button"
                className={[
                  'cal-day',
                  !day ? 'cal-day--empty' : '',
                  day && isSelected(day) ? 'cal-day--selected' : '',
                  day && isToday(day) && !isSelected(day) ? 'cal-day--today' : '',
                  day && isDisabled(day) ? 'cal-day--disabled' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => day && !isDisabled(day) && pickDay(day)}
                disabled={!day || isDisabled(day)}
                tabIndex={day ? 0 : -1}
              >
                {day || ''}
              </button>
            ))}
          </div>

          {/* Footer — today shortcut */}
          <div className="cal-footer">
            <button type="button" className="cal-today-btn" onClick={() => { onChange(toIso(today)); setOpen(false); }}>
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
