import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Botão do Abastex. `default` é o primário (um por tela), `outline`/`secondary`
 * o contornado, `accent` a menta de confirmar em diálogo, `danger` o vermelho só
 * de texto das ações de linha, `destructive` o cheio do "Excluir" num diálogo.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent text-sm font-semibold cursor-pointer transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:translate-y-px focus-visible:outline-none disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-[18px] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-glow hover:bg-primary-hover",
        accent: "bg-mint text-on-mint hover:brightness-95",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        danger: "bg-transparent text-danger hover:bg-danger-soft",
        outline:
          "border-line-strong bg-surface text-ink hover:border-brand hover:bg-surface-hover hover:text-brand",
        secondary:
          "border-line-strong bg-surface text-ink hover:border-brand hover:bg-surface-hover hover:text-brand",
        ghost: "text-ink-muted hover:bg-surface-hover hover:text-brand",
        link: "text-brand underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3 text-[13px] [&_svg]:size-4",
        lg: "h-11 px-6",
        icon: "size-10",
        "icon-sm": "size-8 [&_svg]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
