/**
 * shadcn/ui Slider (Radix), single-thumb variant. As in Radix the value is an array:
 * `value={[x]}` with `onValueChange={([x]) => ...}`.
 */
import { Slider as SliderPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

function Slider({ className, min = 0, max = 100, ...props }) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      min={min}
      max={max}
      className={cn(
        "relative flex h-4 w-full touch-none items-center select-none data-[disabled]:opacity-40",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative h-1 w-full grow overflow-hidden rounded-xs bg-bg-light"
      >
        <SliderPrimitive.Range data-slot="slider-range" className="absolute h-full bg-block" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        data-slot="slider-thumb"
        className="block size-3.5 shrink-0 cursor-pointer rounded-full bg-white shadow-sm outline-none focus-visible:shadow-[0_0_0_3px_rgb(255_0_114/0.4)]"
      />
    </SliderPrimitive.Root>
  );
}

export { Slider };
