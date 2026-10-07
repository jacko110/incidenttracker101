import React, { createContext, useContext, useState } from 'react';

const ThemeContext = createContext(null);
function savedTheme() {
  try { return localStorage.getItem('nib_theme') === 'dark' ? 'dark' : 'light'; }
  catch { return 'light'; }
}
// Apply before React renders to avoid flashing the wrong theme on refresh.
const initialTheme = savedTheme();
document.documentElement.dataset.theme = initialTheme;

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(initialTheme);
  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('nib_theme', next); } catch { /* Theme still works without storage. */ }
    setTheme(next);
  }
  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}
export const useTheme = () => useContext(ThemeContext);
