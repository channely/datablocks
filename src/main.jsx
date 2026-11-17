/**
 * Application bootstrap. Vendor CSS is imported before app modules so component styles win;
 * flow persistence is initialized before the first render.
 */
import React from "react";
import ReactDOM from "react-dom";
import { ChakraProvider } from "@chakra-ui/react";
import "react-flow-renderer/dist/style.css";
import "react-flow-renderer/dist/theme-default.css";
import "react-virtualized/styles.css";
import "mapbox-gl/dist/mapbox-gl.css";
import App from "./App";
import theme from "./theme";
import { initPersistence } from "./store";

initPersistence();

ReactDOM.render(
  <ChakraProvider theme={theme}>
    <App />
  </ChakraProvider>,
  document.getElementById("root"),
);
