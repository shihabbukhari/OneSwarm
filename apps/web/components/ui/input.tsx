import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-9 w-full rounded-chip border border-hair bg-void px-3 text-[14px] text-paper placeholder:text-smoke outline-none transition-colors duration-[120ms] ease-out focus:border-white/25 disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full resize-none rounded-chip border border-hair bg-void px-3 py-2 text-[14px] text-paper placeholder:text-smoke outline-none transition-colors duration-[120ms] ease-out focus:border-white/25",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("eyebrow block", className)} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-8 rounded-chip border border-hair bg-void px-2 text-[13px] text-paper outline-none focus:border-white/25",
        className,
      )}
      {...props}
    />
  );
}
