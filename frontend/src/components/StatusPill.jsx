import React from "react";

// Central status -> color mapping, matching the blended token system:
// amber = pending/review, thread(red) = critical/rejected, cyan = active,
// moss(green) = resolved. Reused everywhere a status badge appears so the
// meaning of each color stays consistent app-wide.
export const STATUS_COLOR = {
  "Under Review": "#D9A244",
  "In Progress": "#4A93A8",
  Completed: "#5C9068",
  Attempt: "#D9A244",
  Rejected: "#C1443A",
};

export function StatusPill({ status, className = "" }) {
  const color = STATUS_COLOR[status] || "#8B8981";
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border ${className}`}
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
      className={`inline-flex items-center gap-1.5 font-stamp text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border ${className}`}
      style={{ color: "#C1443A", borderColor: "#C1443A55", backgroundColor: "#C1443A14" }}
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
