/** shadcn/ui Textarea with the shared field look (Chakra md size: 80px min height). */
import { cn } from "@/lib/utils";
import { fieldVariants } from "./input";

function Textarea({ className, ...props }) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        fieldVariants({ size: "default" }),
        "h-auto min-h-20 py-2 leading-[1.375]",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
