"use client";

import { useState, useRef, useEffect } from "react";
import { Braces } from "lucide-react";
import { AVAILABLE_VARIABLES } from "@/lib/documents/types";

type VariableInsertMenuProps = {
  onInsert: (variable: string) => void;
};

export function VariableInsertMenu({ onInsert }: VariableInsertMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title="Inserir variável"
        data-editor-btn=""
        data-active={open ? "amber" : undefined}
        className={`flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium transition-colors ${
          open
            ? "bg-amber-100 dark:bg-amber-900/30"
            : "hover:bg-muted"
        }`}
      >
        <Braces className="h-4 w-4" />
        <span className="hidden sm:inline">Variável</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 max-h-80 overflow-y-auto bg-popover border border-border rounded-lg shadow-lg z-50">
          {AVAILABLE_VARIABLES.map((group) => (
            <div key={group.group}>
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/50 sticky top-0">
                {group.group}
              </div>
              {group.variables.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => {
                    onInsert(v.key);
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors flex items-center justify-between"
                >
                  <span className="text-foreground">{v.label}</span>
                  <code className="text-[10px] text-muted-foreground font-mono">
                    {`{{${v.key}}}`}
                  </code>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
