import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** All controls are pills (DESIGN.md): light fill for the one primary action, dark fill, ghost. */
const buttonVariants = cva(
  "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium transition-[background-color,color,border-color,opacity] duration-[120ms] ease-out disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        light: "bg-paper text-obsidian hover:bg-white/85",
        dark: "border border-white/10 bg-charcoal text-paper hover:border-white/20 hover:bg-graphite",
        ghost: "text-fog hover:bg-lift-2 hover:text-paper",
        ember: "bg-ember text-paper hover:bg-ember/85",
        quiet: "text-ash hover:text-paper",
      },
      size: {
        sm: "h-7 px-3 text-[13px]",
        md: "h-[34px] px-5 text-[14px]",
        icon: "size-7",
        "icon-sm": "size-6",
      },
    },
    defaultVariants: { variant: "dark", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";
export { buttonVariants };
