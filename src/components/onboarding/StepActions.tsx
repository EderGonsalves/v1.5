"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWizard } from "react-use-wizard";

type StepActionsProps = {
  isSubmitting?: boolean;
  submitLabel: string;
  showBack?: boolean;
};

export const StepActions = ({
  isSubmitting,
  submitLabel,
  showBack = true,
}: StepActionsProps) => {
  const { previousStep, isFirstStep } = useWizard();

  return (
    <div
      className={cn(
        "flex flex-col gap-3 pt-6",
        showBack && "sm:flex-row sm:items-center sm:justify-between",
        !showBack && "sm:flex-row sm:justify-end",
      )}
    >
      {showBack ? (
        <Button
          type="button"
          variant="outline"
          onClick={previousStep}
          disabled={isFirstStep || isSubmitting}
        >
          Voltar
        </Button>
      ) : null}

      <Button
        type="submit"
        className={cn(showBack ? "" : "sm:ml-auto")}
        disabled={isSubmitting}
      >
        {isSubmitting ? "Salvando..." : submitLabel}
      </Button>
    </div>
  );
};
