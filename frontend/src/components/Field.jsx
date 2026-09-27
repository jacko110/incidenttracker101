import React from "react";
import { HelpCircle } from "lucide-react";

export default function Field({ label, help, children, className = "" }) {
  return (
    <div className={className}>
      <label className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted mb-2">
        <span className="text-thread">*</span>
        <span>{label}</span>
        {help && <HelpCircle size={12} className="text-faint" />}
      </label>
      {children}
    </div>
  );
}
