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
    <main className={cn("min-h-screen bg-white py-8 dark:bg-zinc-900", className)}>
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4">
        <div className="flex flex-col items-center justify-center rounded-xl border bg-card/60 py-16 shadow-sm dark:bg-card/40">
          <div className="mb-6 flex items-center justify-center">
            <span className="inline-flex size-14 items-center justify-center rounded-full border-4 border-primary/20 border-t-primary text-primary animate-spin">
              <span className="sr-only">{message}</span>
            </span>
          </div>
          <p className="text-center text-base text-muted-foreground animate-pulse">
            {message}
          </p>
        </div>
      </div>
    </main>
  );
}
