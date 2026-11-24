import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles.css";

async function bootAccess(): Promise<void> {
  const legacy = localStorage.getItem("fourqa_token")?.trim();
  if (legacy) {
    localStorage.removeItem("fourqa_token");
    await fetch("/api/session", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: legacy }),
    }).catch(() => undefined);
  }
  if (import.meta.env.DEV) {
    await fetch("/__fourqa_local_token", { credentials: "same-origin" }).catch(() => undefined);
  }
}

void bootAccess();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
