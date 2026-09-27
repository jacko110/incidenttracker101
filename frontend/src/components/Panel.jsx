import React from "react";

export function Panel({ title, right, children, className = "" }) {
  return (
    <div className={`bg-panel border border-line rounded-md p-4 flex flex-col ${className}`}>
      {title && (
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-[15px] font-semibold text-paper tracking-wide">{title}</h3>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function StatCard({ label, value, delta, icon: Icon, color }) {
  return (
    <div className="bg-panel border border-line rounded-md p-4 flex items-start gap-3">
      <div
        className="w-9 h-9 rounded flex items-center justify-center shrink-0 border"
        style={{ backgroundColor: `${color}14`, borderColor: `${color}33` }}
      >
        <Icon size={16} style={{ color }} />
      </div>
      <div className="min-w-0">
        <div className="font-mono text-[10px] tracking-widest uppercase text-muted">{label}</div>
        <div className="flex items-baseline gap-2 mt-0.5">
          <span className="font-display text-[28px] font-semibold text-paper leading-none">{value}</span>
          {delta && <span className="font-mono text-[10px] text-faint">{delta}</span>}
        </div>
      </div>
    </div>
  );
}
