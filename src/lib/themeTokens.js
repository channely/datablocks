/**
 * Design tokens for code that needs raw values (Vega configs, React Flow minimap, inline handle
 * styles). The same values are declared as CSS variables in `src/index.css`; a unit test keeps
 * both copies in sync, so change them together.
 */
export const colors = {
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

export const fonts = {
  body: '"IBM Plex Sans", system-ui, sans-serif',
  mono: '"Source Code Pro", monospace',
};

/** CSS custom property name for each flat token, e.g. `bg.dark` -> `--color-bg-dark`. */
export const cssVariableName = (path) =>
  `--color-${path
    .replace(/\./g, "-")
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase()}`;

/** Flattens `colors` into `[path, value]` pairs (`["bg.dark", "#1A192B"]`, ...). */
export const flatColors = () =>
  Object.entries(colors).flatMap(([key, value]) =>
    typeof value === "string"
      ? [[key, value]]
      : Object.entries(value).map(([child, childValue]) => [`${key}.${child}`, childValue]),
  );
