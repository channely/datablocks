/** Uppercase section heading used in panels and the library. */
import { cn } from "@/lib/utils";

const SectionLabel = ({ children, className, ...props }) => (
  <div
    className={cn("text-[11px] leading-none font-bold tracking-[0.13em] uppercase", className)}
    {...props}
  >
    {children}
  </div>
);

export default SectionLabel;
