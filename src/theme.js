/**
 * Chakra theme. Colors, font sizes, and component overrides are tuned to match the reference
 * demo; node handles and edge controls rely on the `bg`, `handle`, and `violet*` scales.
 */
import { extendTheme } from "@chakra-ui/react";

const colors = {
  text: "#f8f8f2",
  primary: "#FF0072",
  bg: {
    black: "#000",
    dark: "#1A192B",
    grey: "#222138",
    light: "#333154",
    lighter: "#4C497E",
  },
  handle: "#403f69",
  handleHover: "#6866AC",
  block: "#7371b5",
  silver: "#EEF0F2",
  silverDarken15: "#C5CBD2",
  silverDarken30: "#9CA8B3",
  comment: "#6272a4",
  violetLighten15: "#2c2b45",
  violetLighten30: "#3c3a63",
  violetLighten85: "#d4d3e8",
  gray: "#8f8f8f",
};

const theme = extendTheme({
  colors,
  fonts: {
    body: '"IBM Plex Sans",system-ui,sans-serif',
    mono: '"Source Code Pro", monospace',
  },
  fontSizes: {
    xs: "10px",
    sm: "11px",
    md: "12px",
  },
  styles: {
    global: {
      html: { fontSize: "12px" },
      body: {
        bg: "bg.black",
        color: "text",
        fontSize: "12px",
        fontFamily: "body",
      },
      ".react-flow__attribution": { display: "none" },
      ".js-handle": {
        left: "-22px",
        height: "20px",
        width: "20px",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "#403f69",
        border: "none",
        borderRadius: "10px 0 0 10px",
      },
      ".codejar-editor": {
        lineHeight: 1.2,
        overflowY: "visible !important",
        cursor: "default",
        minHeight: "1.2em",
        outline: "none",
      },
    },
  },
  components: {
    Button: {
      baseStyle: {
        borderRadius: 0,
        bg: "whiteAlpha.200",
        _hover: { bg: "bg.lighter" },
        _active: { bg: "bg.lighter" },
        _focus: { boxShadow: "none" },
      },
      variants: {
        solid: {
          bg: "whiteAlpha.200",
          _hover: { bg: "bg.lighter" },
          _active: { bg: "bg.lighter" },
        },
        ghost: {
          bg: "whiteAlpha.200",
          _hover: { bg: "bg.lighter" },
          _active: { bg: "bg.lighter" },
        },
      },
      sizes: {
        sm: { h: 8, minW: 8, fontSize: "0.875rem", px: 2 },
      },
      defaultProps: { variant: "solid", colorScheme: "gray", size: "md" },
    },
    Input: {
      baseStyle: {
        field: { bg: "transparent", border: "1px solid", borderColor: "whiteAlpha.300" },
      },
      variants: { outline: { field: { borderColor: "whiteAlpha.300", bg: "transparent" } } },
      defaultProps: { focusBorderColor: "primary" },
    },
    Select: {
      baseStyle: {
        field: { bg: "transparent", border: "1px solid", borderColor: "whiteAlpha.300" },
      },
      variants: { outline: { field: { borderColor: "whiteAlpha.300", bg: "transparent" } } },
      defaultProps: { focusBorderColor: "primary" },
    },
    Textarea: {
      baseStyle: { bg: "transparent", border: "1px solid", borderColor: "whiteAlpha.300" },
      variants: { outline: { borderColor: "whiteAlpha.300", bg: "transparent" } },
      defaultProps: { focusBorderColor: "primary" },
    },
    Checkbox: {
      defaultProps: { colorScheme: "pink" },
    },
    Menu: {
      baseStyle: {
        list: { bg: "bg.grey", borderColor: "bg.light" },
        item: { bg: "bg.grey", _hover: { bg: "bg.light" }, _focus: { bg: "bg.light" } },
      },
    },
  },
});

export default theme;
