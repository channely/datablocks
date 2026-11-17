/**
 * shadcn/ui Button, restyled to the former Chakra theme: square corners, translucent fill,
 * `bg.lighter` hover, and Chakra's md/sm/xs sizes (30/24/18px at the 12px base).
 */
import { cva } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center rounded-none align-middle leading-[1.2] font-semibold whitespace-nowrap outline-none select-none transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-white/8 hover:bg-bg-lighter active:bg-bg-lighter",
        ghost: "bg-transparent hover:bg-bg-lighter active:bg-bg-lighter",
      },
      size: {
        default: "h-10 min-w-10 px-4 text-md",
        sm: "h-8 min-w-8 px-2 text-[0.875rem]",
        xs: "h-6 min-w-6 px-2 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({ className, variant = "default", size = "default", asChild = false, ...props }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
