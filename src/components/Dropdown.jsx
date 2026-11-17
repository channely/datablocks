/**
 * Header dropdown menu. Notifies the store while open so the canvas can block interactions
 * beneath the menu layer.
 */
import React from "react";
import { Button, Menu, MenuButton, MenuItem, MenuList } from "@chakra-ui/react";
import useStore from "../store";

/** Stable test id for a menu item label, for example "Export flow" -> "menuitem-export-flow". */
const itemTestId = (label) =>
  `menuitem-${String(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")}`;

const Dropdown = ({ items = [], label = "Dropdown", menuButtonProps = {}, testId }) => {
  const setDropDownOpen = useStore((state) => state.setDropDownOpen);
  return (
    <Menu onOpen={() => setDropDownOpen(true)} onClose={() => setDropDownOpen(false)}>
      <MenuButton
        as={Button}
        bg="transparent"
        _active={{ outline: "none" }}
        _focus={{ outline: "none" }}
        className="dropdown-label"
        textAlign="center"
        px={2}
        data-testid={testId}
        {...menuButtonProps}
      >
        {label}
      </MenuButton>
      <MenuList zIndex={1000}>
        {items.map((item) => (
          <MenuItem onClick={item.onSelect} key={item.label} data-testid={itemTestId(item.label)}>
            {item.label}
          </MenuItem>
        ))}
      </MenuList>
    </Menu>
  );
};

export default Dropdown;
