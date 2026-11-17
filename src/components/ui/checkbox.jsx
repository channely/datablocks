/** shadcn/ui Checkbox (Radix) styled like Chakra's pink checkbox: 2px border, square box. */
import { CheckIcon } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

function Checkbox({ className, ...props }) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-xs border-2 border-current align-middle text-white outline-none transition-shadow focus-visible:shadow-[0_0_0_3px_rgb(255_0_114/0.4)] disabled:cursor-not-allowed disabled:opacity-40 data-[state=checked]:border-checkbox data-[state=checked]:bg-checkbox",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center"
      >
        <CheckIcon className="size-2.5" strokeWidth={4} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
