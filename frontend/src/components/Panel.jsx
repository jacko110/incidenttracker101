import React from 'react';
export function Panel({ title, right, children, className = '' }) {
  return <div className={`nib-card flex flex-col ${className}`}>
    {title && <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
      <h3 className="text-[15px] font-semibold text-paper">{title}</h3>{right}
    </div>}{children}
  </div>;
}
export function StatCard({ label, value, icon: Icon, color }) {
  return <div className="nib-card flex items-center justify-between gap-3">
    <div><span className="text-xs font-medium text-muted">{label}</span>
    <div className="font-display text-3xl sm:text-4xl font-semibold tracking-tight tabular-nums mt-3">{value ?? 0}</div></div>
    <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ color: color || 'rgb(var(--paper))', backgroundColor: color ? `${color}12` : 'rgb(var(--panel2))' }}><Icon size={20} /></div>
  </div>;
}
