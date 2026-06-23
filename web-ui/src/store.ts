import { create } from 'zustand';
import i18n from './i18n';

interface AppState {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  language: string;
  setLanguage: (lang: string) => void;
}

// Ensure initial dark mode matches localStorage or defaults to dark
const initialTheme = (localStorage.getItem('lexhub-theme') as 'light' | 'dark') || 'dark';
if (initialTheme === 'dark') {
  document.documentElement.classList.add('dark');
} else {
  document.documentElement.classList.remove('dark');
}

export const useAppStore = create<AppState>((set) => ({
  theme: initialTheme,
  toggleTheme: () => set((state) => {
    const next = state.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('lexhub-theme', next);
    if (next === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    return { theme: next };
  }),
  language: localStorage.getItem('lexhub-lang') || 'zh',
  setLanguage: (lang: string) => set(() => {
    localStorage.setItem('lexhub-lang', lang);
    i18n.changeLanguage(lang);
    return { language: lang };
  }),
}));
