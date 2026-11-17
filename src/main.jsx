/**
 * Application bootstrap. Vendor CSS is imported before app modules so component styles win;
 * flow persistence is initialized before the first render.
 */
import { createRoot } from "react-dom/client";
import { ChakraProvider } from "@chakra-ui/react";
import "@xyflow/react/dist/style.css";
import "react-virtualized/styles.css";
import App from "./App";
import theme from "./theme";
import { initPersistence } from "./store";

initPersistence();

createRoot(document.getElementById("root")).render(
  <ChakraProvider theme={theme}>
    <App />
  </ChakraProvider>,
);
