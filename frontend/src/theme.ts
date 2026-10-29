export type ThemeName = "light" | "dark";

export const THEME_KEY = "fourqa-theme";

export function readTheme(): ThemeName {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export function applyTheme(theme: ThemeName) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
}

export function toggleTheme(current: ThemeName): ThemeName {
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}
