/** shadcn/ui Label (Radix) with Chakra FormLabel spacing: block, medium weight, mb-2 / mr-3. */
import { Label as LabelPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

function Label({ className, ...props }) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "mr-3 mb-2 block text-start text-md font-medium select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
