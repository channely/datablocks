/**
 * shadcn/ui Input with the former Chakra field look: transparent fill, translucent border,
 * primary focus ring. Sizes follow Chakra md/sm/xs.
 */
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const fieldVariants = cva(
  "relative w-full min-w-0 appearance-none border border-input bg-transparent text-inherit outline-none transition-[border-color,box-shadow] duration-200 hover:border-current focus-visible:z-[1] focus-visible:border-primary focus-visible:shadow-[0_0_0_1px_var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-40",
  {
    variants: {
      size: {
        default: "h-10 rounded-md px-4 text-md",
        sm: "h-8 rounded-xs px-3 text-sm",
        xs: "h-6 rounded-xs px-2 text-xs",
      },
    },
    defaultVariants: { size: "default" },
  },
);

function Input({ className, type, size = "default", ...props }) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(fieldVariants({ size }), className)}
      {...props}
    />
  );
}

export { Input };
