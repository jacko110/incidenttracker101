import React from 'react';
export function Panel({ title, right, children, className = '' }) {
  return <div className={`nib-card flex flex-col ${className}`}>
    {title && <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
      <h3 className="text-[15px] font-semibold text-paper">{title}</h3>{right}
    </div>}{children}
  </div>;
}
export function StatCard({ label, value, icon: Icon }) {
  return <div className="nib-card flex flex-col gap-5">
    <div className="flex items-center justify-between gap-2"><span className="text-sm text-muted">{label}</span><Icon size={18} className="text-faint" /></div>
    <div className="text-3xl sm:text-4xl font-semibold tracking-tight tabular-nums">{value ?? 0}</div>
  </div>;
}
