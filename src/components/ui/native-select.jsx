/**
 * shadcn/ui NativeSelect with the shared field look. Used inside canvas nodes instead of a
 * Radix Select so no popup is portaled outside the zoomed React Flow viewport.
 * `className` styles the <select>; `wrapperClassName` the positioned wrapper.
 */
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { fieldVariants } from "./input";

function NativeSelect({ className, wrapperClassName, size = "default", ...props }) {
  return (
    <div
      className={cn("relative w-full has-[select:disabled]:opacity-40", wrapperClassName)}
      data-slot="native-select-wrapper"
    >
      <select
        data-slot="native-select"
        data-size={size}
        className={cn(
          fieldVariants({ size }),
          "cursor-pointer pr-8 pb-px leading-normal",
          className,
        )}
        {...props}
      />
      <ChevronDownIcon
        className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 select-none"
        aria-hidden="true"
        data-slot="native-select-icon"
      />
    </div>
  );
}

function NativeSelectOption({ className, ...props }) {
  return (
    <option
      data-slot="native-select-option"
      className={cn("bg-bg-grey text-text", className)}
      {...props}
    />
  );
}

export { NativeSelect, NativeSelectOption };
