"use client";
import {
  Check,
  CalendarX2,
  CircleX,
  CalendarClock,
  type LucideIcon,
} from "lucide-react";
import { attendanceLabels } from "@/lib/call-options";
import type { Attendance } from "@/lib/types";
const icons: Record<Attendance, LucideIcon> = {
  attended: Check,
  no_show: CalendarX2,
  cancelled: CircleX,
  rescheduled: CalendarClock,
};
export function AttendanceSelector({
  value,
  onChange,
}: {
  value: Attendance | null;
  onChange: (value: Attendance) => void;
}) {
  return (
    <section className="form-section outcome-section">
      <div className="section-heading">
        <span className="step">02</span>
        <h2>Attendance</h2>
      </div>
      <div className="outcome-options" role="group" aria-label="Attendance">
        {(Object.keys(attendanceLabels) as Attendance[]).map((option) => {
          const Icon = icons[option];
          return (
            <button
              type="button"
              key={option}
              aria-pressed={value === option}
              className={`outcome-option ${value === option ? "selected" : ""}`}
              onClick={() => onChange(option)}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{attendanceLabels[option]}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
