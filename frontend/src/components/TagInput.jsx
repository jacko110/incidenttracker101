import React, { useState } from "react";
import { X, ChevronDown } from "lucide-react";

export default function TagInput({ value = [], onChange, placeholder }) {
  const [draft, setDraft] = useState("");

  function commit() {
    const v = draft.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setDraft("");
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  function remove(tag) {
    onChange(value.filter((t) => t !== tag));
  }

  return (
    <div
      className="w-full bg-panel2 border border-line rounded px-3 py-2 text-sm text-paper outline-none focus-within:border-amber flex items-center gap-1.5 flex-wrap min-h-[38px] transition-colors"
      onClick={(e) => e.currentTarget.querySelector("input")?.focus()}
    >
      {value.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 bg-cyan/15 text-cyan font-mono text-xs rounded px-2 py-0.5"
        >
          {tag}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              remove(tag);
            }}
            className="hover:text-paper"
          >
            <X size={11} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
        placeholder={value.length ? "" : placeholder}
        className="bg-transparent outline-none flex-1 min-w-[100px] placeholder:text-faint"
      />
      <ChevronDown size={14} className="text-faint shrink-0" />
    </div>
  );
}
