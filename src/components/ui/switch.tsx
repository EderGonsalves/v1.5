"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface SwitchProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  onCheckedChange?: (checked: boolean) => void;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, onCheckedChange, checked, disabled, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled) {
        e.preventDefault();
        return;
      }
      if (onCheckedChange) {
        onCheckedChange(e.target.checked);
      }
      if (props.onChange) {
        props.onChange(e);
      }
    };

    return (
      <label className={cn(
        "relative inline-flex items-center cursor-pointer group",
        disabled && "cursor-not-allowed opacity-50"
      )}>
        <input
          type="checkbox"
          className="sr-only peer"
          ref={ref}
          checked={checked ?? false}
          disabled={disabled}
          {...props}
          onChange={handleChange}
        />
        <div
          className={cn(
            "relative w-11 h-6 rounded-full peer transition-colors duration-200",
            "bg-[#7E99B5] dark:bg-[#354F6D]",
            "peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/30",
            "peer-checked:bg-emerald-500 dark:peer-checked:bg-emerald-500",
            "after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all after:duration-200 after:shadow-sm",
            "peer-checked:after:translate-x-full peer-checked:after:border-white",
            "group-hover:opacity-90",
            disabled && "opacity-50 cursor-not-allowed",
            className
          )}
        />
      </label>
    );
  }
);
Switch.displayName = "Switch";

export { Switch };
