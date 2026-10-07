import React from "react";

// Central status -> color mapping, matching the blended token system:
// amber = pending/review, thread(red) = critical/rejected, cyan = active,
// moss(green) = resolved. Reused everywhere a status badge appears so the
// meaning of each color stays consistent app-wide.
export const STATUS_COLOR = {
  "Under Review": "#D8B574",
  "In Progress": "#A5B4FC",
  Completed: "#89B8A0",
  Attempt: "#D8B574",
  Rejected: "#E58C91",
};

export function StatusPill({ status, className = "" }) {
  const color = STATUS_COLOR[status] || "#A4A9B5";
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-body text-xs font-medium px-2.5 py-1 rounded-full border ${className}`}
      style={{ color, borderColor: `${color}55`, backgroundColor: `${color}14` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      {status}
    </span>
  );
}

// A rejection carries its own label (SOC Admin / IR Analyst) rather than a
// status word, but should read visually consistent with StatusPill.
export function RejectedByPill({ label, className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded border ${className}`}
      style={{ color: "#E58C91", borderColor: "#E58C9155", backgroundColor: "#E58C9114" }}
    >
      rejected · {label}
    </span>
  );
}

// Monospace, tracked case-id treatment — the "instrument readout" detail
// that shows up next to every case reference across the app.
export function CaseId({ id, className = "" }) {
  return <span className={`font-mono text-[11px] text-muted tracking-wide ${className}`}>#{String(id).padStart(4, "0")}</span>;
}
