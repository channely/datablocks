/**
 * Class name helper used by the shadcn/ui components. tailwind-merge is taught the project's
 * custom `text-md` size so it is not mistaken for a text color and dropped during merging.
 */
import { clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["md"],
    },
  },
});

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
