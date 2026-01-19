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
      console.log("Switch handleChange chamado, checked:", e.target.checked, "disabled:", disabled);
      if (disabled) {
        e.preventDefault();
        return;
      }
      if (onCheckedChange) {
        console.log("Chamando onCheckedChange com:", e.target.checked);
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
            "relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/30 rounded-full peer transition-colors duration-200",
            "peer-checked:bg-primary",
            "after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all after:duration-200 after:shadow-sm",
            "peer-checked:after:translate-x-full peer-checked:after:border-white",
            "group-hover:bg-gray-300 peer-checked:group-hover:bg-primary/90",
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
