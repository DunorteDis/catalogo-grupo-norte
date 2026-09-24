import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/** Switch do Abastex: trilho roxo ligado, e o check no botão para não depender só da cor. */
const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45 data-[state=checked]:bg-primary data-[state=unchecked]:bg-line-strong",
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb className="group pointer-events-none grid size-[18px] place-items-center rounded-full bg-white text-primary shadow-sm transition-transform duration-150 data-[state=checked]:translate-x-[19px] data-[state=unchecked]:translate-x-[3px]">
      <Check className="hidden size-3 [stroke-width:3] group-data-[state=checked]:block" />
    </SwitchPrimitives.Thumb>
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
