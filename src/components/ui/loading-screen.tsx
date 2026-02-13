"use client";

import { cn } from "@/lib/utils";

type LoadingScreenProps = {
  message?: string;
  className?: string;
};

export function LoadingScreen({
  message = "Carregando...",
  className,
}: LoadingScreenProps) {
  return (
    <main className={cn("min-h-screen bg-background flex items-center justify-center", className)}>
      <div className="flex flex-col items-center gap-4">
        <span className="inline-flex size-10 items-center justify-center rounded-full border-4 border-primary/20 border-t-primary text-primary animate-spin">
          <span className="sr-only">{message}</span>
        </span>
        <p className="text-sm text-muted-foreground animate-pulse">
          {message}
        </p>
      </div>
    </main>
  );
}
