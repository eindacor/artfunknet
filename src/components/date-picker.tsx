"use client";

import { useState } from "react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type DateParts = { year: string; month: string; day: string };
type DatePickerProps = {
  label: string;
  name: string;
  min: string;
  max: string;
  required?: boolean;
  disabled?: boolean;
  autoComplete?: "bday";
};

export default function DatePicker({ label, name, min, max, required, disabled, autoComplete }: DatePickerProps) {
  const [parts, setParts] = useState<DateParts>({ year: "", month: "", day: "" });
  const firstYear = Number(min.slice(0, 4));
  const lastYear = Number(max.slice(0, 4));
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, index) => String(lastYear - index));

  function monthsFor(year: string) {
    if (!year) return [];
    return MONTHS.map((label, index) => ({ label, value: String(index + 1).padStart(2, "0") }))
      .filter(month => `${year}-${month.value}` >= min.slice(0, 7) && `${year}-${month.value}` <= max.slice(0, 7));
  }

  function daysFor(year: string, month: string) {
    if (!year || !month) return [];
    const count = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
    return Array.from({ length: count }, (_, index) => String(index + 1).padStart(2, "0"))
      .filter(day => `${year}-${month}-${day}` >= min && `${year}-${month}-${day}` <= max);
  }

  function selectPart(part: keyof DateParts, value: string) {
    setParts(current => {
      const next = { ...current, [part]: value };
      if (!monthsFor(next.year).some(month => month.value === next.month)) next.month = "";
      if (!daysFor(next.year, next.month).includes(next.day)) next.day = "";
      return next;
    });
  }

  const value = parts.year && parts.month && parts.day ? `${parts.year}-${parts.month}-${parts.day}` : "";
  const selectClassName = "min-w-0 w-full rounded-md border border-white/20 bg-[var(--background)] px-3 py-2 disabled:cursor-not-allowed disabled:opacity-70";
  return <fieldset className="grid min-w-0 gap-2" disabled={disabled}>
    <legend className="mb-2 font-semibold">{label}</legend>
    <input type="hidden" name={name} value={value} />
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <label className="grid min-w-0 gap-2"><span>Year</span>
        <select className={selectClassName} value={parts.year} required={required}
          autoComplete={autoComplete ? `${autoComplete}-year` : undefined}
          onChange={event => selectPart("year", event.target.value)}>
          <option value="">Select year</option>
          {years.map(year => <option key={year} value={year}>{year}</option>)}
        </select>
      </label>
      <label className="grid min-w-0 gap-2"><span>Month</span>
        <select className={selectClassName} value={parts.month} required={required} disabled={!parts.year}
          autoComplete={autoComplete ? `${autoComplete}-month` : undefined}
          onChange={event => selectPart("month", event.target.value)}>
          <option value="">Select month</option>
          {monthsFor(parts.year).map(month => <option key={month.value} value={month.value}>{month.label}</option>)}
        </select>
      </label>
      <label className="grid min-w-0 gap-2"><span>Day</span>
        <select className={selectClassName} value={parts.day} required={required} disabled={!parts.year || !parts.month}
          autoComplete={autoComplete ? `${autoComplete}-day` : undefined}
          onChange={event => selectPart("day", event.target.value)}>
          <option value="">Select day</option>
          {daysFor(parts.year, parts.month).map(day => <option key={day} value={day}>{Number(day)}</option>)}
        </select>
      </label>
    </div>
  </fieldset>;
}
