import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch((error: unknown) => {
        console.warn("Offline caching could not be enabled in this browser.", error);
      });
  });
}

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root was not found.");

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);