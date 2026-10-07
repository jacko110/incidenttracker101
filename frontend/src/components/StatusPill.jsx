import React from "react";

// Central status -> color mapping, matching the blended token system:
// amber = pending/review, thread(red) = critical/rejected, cyan = active,
// moss(green) = resolved. Reused everywhere a status badge appears so the
// meaning of each color stays consistent app-wide.
export const STATUS_COLOR = {
  "Under Review": "#946000",
  "In Progress": "#45483F",
  Completed: "#217A58",
  Attempt: "#946000",
  Rejected: "#C43D51",
};

export function StatusPill({ status, className = "" }) {
  const color = STATUS_COLOR[status] || "#62615C";
  return (
    <span
      className={`status-pill inline-flex items-center gap-1.5 font-body text-xs font-medium px-2.5 py-1 rounded-full border ${className}`}
      data-status={status}
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
      className={`rejection-pill inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded border ${className}`}
      style={{ color: "#C43D51", borderColor: "#C43D5155", backgroundColor: "#C43D5114" }}
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
