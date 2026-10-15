import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles.css";

if (import.meta.env.DEV) {
  void fetch("/__fourqa_local_token")
    .then((res) => (res.ok ? res.text() : ""))
    .then((token) => {
      const value = token.trim();
      if (value) localStorage.setItem("fourqa_token", value);
    })
    .catch(() => undefined);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
