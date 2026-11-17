/** Fixed-height panel/header strip used throughout the layout. */
import { cn } from "@/lib/utils";

const Panel = ({
  borderTop,
  borderRight,
  borderBottom,
  borderLeft,
  className,
  children,
  ...props
}) => (
  <div
    className={cn(
      "relative flex h-[30px] w-full shrink-0 grow-0 items-center overflow-visible border-bg-light p-2",
      borderTop && "border-t",
      borderRight && "border-r",
      borderBottom && "border-b",
      borderLeft && "border-l",
      className,
    )}
    {...props}
  >
    {children}
  </div>
);

export default Panel;
