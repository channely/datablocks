/**
 * Header dropdown menu (shadcn/ui DropdownMenu). Notifies the store while open so the canvas can
 * block interactions beneath the menu layer.
 */
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import useStore from "../store";

/** Stable test id for a menu item label, for example "Export flow" -> "menuitem-export-flow". */
const itemTestId = (label) =>
  `menuitem-${String(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")}`;

const Dropdown = ({ items = [], label = "Dropdown", triggerClassName, testId }) => {
  const setDropDownOpen = useStore((state) => state.setDropDownOpen);
  return (
    <DropdownMenu onOpenChange={setDropDownOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          className={cn(
            "dropdown-label bg-transparent px-2 text-center focus:outline-none",
            triggerClassName,
          )}
          data-testid={testId}
        >
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {items.map((item) => (
          <DropdownMenuItem
            onSelect={item.onSelect}
            key={item.label}
            data-testid={itemTestId(item.label)}
          >
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default Dropdown;
