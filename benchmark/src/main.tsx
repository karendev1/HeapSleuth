import { createRoot } from "react-dom/client";

import { App } from "./app/App.js";
import "./styles.css";

const rootElement = document.querySelector<HTMLElement>("#root");

if (rootElement === null) {
  throw new Error("The benchmark root element was not found.");
}

createRoot(rootElement).render(<App />);
