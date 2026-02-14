"use client";

import type { TemplateComponent, TemplateButton } from "@/lib/waba/schemas";

type TemplatePreviewProps = {
  components: TemplateComponent[];
  /** Map of variable placeholders to filled values, e.g. {"1": "João"} */
  variableValues?: Record<string, string>;
};

const renderText = (
  text: string | undefined,
  variableValues?: Record<string, string>,
): string => {
  if (!text) return "";
  if (!variableValues) return text;
  return text.replace(/\{\{(\d+)\}\}/g, (match, num) => {
    return variableValues[num] || match;
  });
};

const ButtonPreview = ({ button }: { button: TemplateButton }) => (
  <div className="flex items-center justify-center gap-1.5 border-t border-[#e0e0e0] dark:border-white/10 py-2 text-xs font-medium text-[#00a5f4]">
    {button.type === "URL" && (
      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
    )}
    {button.type === "PHONE_NUMBER" && (
      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
      </svg>
    )}
    {button.type === "QUICK_REPLY" && (
      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
      </svg>
    )}
    <span>{button.text}</span>
  </div>
);

export const TemplatePreview = ({
  components,
  variableValues,
}: TemplatePreviewProps) => {
  const header = components.find((c) => c.type === "HEADER");
  const body = components.find((c) => c.type === "BODY");
  const footer = components.find((c) => c.type === "FOOTER");
  const buttons = components.find((c) => c.type === "BUTTONS");

  return (
    <div className="mx-auto max-w-[320px]">
      {/* WhatsApp-style bubble */}
      <div className="rounded-lg bg-[#e7fed6] dark:bg-[#025144] shadow-sm overflow-hidden">
        <div className="px-3 py-2 space-y-1">
          {/* Header */}
          {header && header.text && (
            <p className="text-sm font-semibold text-[#111b21] dark:text-[#e9edef]">
              {renderText(header.text, variableValues)}
            </p>
          )}
          {header && header.format && header.format !== "TEXT" && (
            <div className="flex items-center justify-center h-20 rounded bg-black/5 dark:bg-white/5 text-xs text-muted-foreground">
              [{header.format}]
            </div>
          )}

          {/* Body */}
          {body && body.text && (
            <p className="text-sm text-[#111b21] dark:text-[#e9edef] whitespace-pre-wrap">
              {renderText(body.text, variableValues)}
            </p>
          )}

          {/* Footer */}
          {footer && footer.text && (
            <p className="text-[11px] text-[#667781] dark:text-[#8696a0]">
              {footer.text}
            </p>
          )}
        </div>

        {/* Buttons */}
        {buttons?.buttons && buttons.buttons.length > 0 && (
          <div className="divide-y divide-[#e0e0e0] dark:divide-white/10">
            {buttons.buttons.map((btn, idx) => (
              <ButtonPreview key={idx} button={btn} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
