export function readTheme() {
  return "light";
}

export function applyTheme() {
  document.documentElement.dataset.theme = "light";
  window.localStorage.removeItem("godwit-theme");
  return "light";
}
