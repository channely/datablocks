/**
 * shadcn/ui Dialog (Radix), laid out like the former Chakra modal: top-aligned (3.75rem margin),
 * `bg.grey` panel, inside scrolling, and a "Close" button in the top-right corner.
 * Every DialogContent needs a DialogTitle (Radix logs an error otherwise).
 */
import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

function Dialog(props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogClose(props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-[1400] bg-black/48 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({ className, children, showCloseButton = true, ...props }) {
  return (
    <DialogPrimitive.Portal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        aria-describedby={undefined}
        className={cn(
          "fixed top-[3.75rem] left-1/2 z-[1400] flex max-h-[calc(100%-7.5rem)] w-[calc(100%-2rem)] -translate-x-1/2 flex-col rounded-md bg-bg-grey text-text shadow-lg outline-none duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            aria-label="Close"
            className="absolute top-2 right-3 inline-flex size-8 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-black/6 focus-visible:shadow-[0_0_0_3px_rgb(255_0_114/0.4)] focus-visible:outline-none"
          >
            <XIcon className="size-[16px]" strokeWidth={2} />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** Scrollable body area (Chakra ModalBody: 1.5rem horizontal, 0.5rem vertical padding). */
function DialogBody({ className, ...props }) {
  return (
    <div
      data-slot="dialog-body"
      className={cn("flex-1 overflow-auto px-6 py-2", className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-2xl font-bold", className)}
      {...props}
    />
  );
}

export { Dialog, DialogBody, DialogClose, DialogContent, DialogOverlay, DialogTitle };
