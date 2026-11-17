/**
 * Application bootstrap. Vendor CSS is imported before `index.css` so the unlayered overrides
 * there win; flow persistence is initialized before the first render.
 */
import { createRoot } from "react-dom/client";
import "./layers.css";
import "@xyflow/react/dist/style.css";
import "react-virtualized/styles.css";
import "./index.css";
import App from "./App";
import { initPersistence } from "./store";

initPersistence();

createRoot(document.getElementById("root")).render(<App />);
