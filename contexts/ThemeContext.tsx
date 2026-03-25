import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import { updateUserProfile } from "../services/userService";
import type { FontScale } from "../types";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  fontScale: FontScale;
  toggleTheme: () => void;
  setFontScale: (scale: FontScale) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = "sfast_trucklog_theme";
const FONT_SCALE_STORAGE_KEY = "sfast_trucklog_font_scale";
const isValidFontScale = (value: string | null): value is FontScale =>
  value === "normal" || value === "large";

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { user, userProfile, loading } = useAuth();
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === "dark" || stored === "light") {
        return stored;
      }
    }
    return "light";
  });
  const [fontScale, setFontScaleState] = useState<FontScale>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(FONT_SCALE_STORAGE_KEY);
      if (isValidFontScale(stored)) {
        return stored;
      }
    }
    return "normal";
  });
  const skipNextProfileSyncRef = useRef(false);

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    const root = document.documentElement;
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (theme === "dark") {
      root.classList.add("dark");
      root.classList.remove("light");
      root.style.colorScheme = "dark";
      metaThemeColor?.setAttribute("content", "#1a1b26");
    } else {
      root.classList.add("light");
      root.classList.remove("dark");
      root.style.colorScheme = "light";
      metaThemeColor?.setAttribute("content", "#f0f4f8");
    }
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    localStorage.setItem(FONT_SCALE_STORAGE_KEY, fontScale);
    root.dataset.fontScale = fontScale;
    root.classList.toggle("font-scale-large", fontScale === "large");
    root.classList.toggle("font-scale-normal", fontScale === "normal");
  }, [fontScale]);

  useEffect(() => {
    if (loading || !user) return;
    if (!userProfile?.fontScale || userProfile.fontScale === fontScale) return;

    skipNextProfileSyncRef.current = true;
    setFontScaleState(userProfile.fontScale);
  }, [fontScale, loading, user, userProfile?.fontScale]);

  useEffect(() => {
    if (loading || !user) return;

    if (skipNextProfileSyncRef.current) {
      skipNextProfileSyncRef.current = false;
      return;
    }

    if (userProfile?.fontScale === fontScale) return;

    void updateUserProfile(user.uid, {
      fontScale,
      profileUpdatedAt: Date.now(),
    }).catch((error) => {
      console.error("Failed to sync font scale preference:", error);
    });
  }, [fontScale, loading, user, userProfile?.fontScale]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  const setFontScale = (scale: FontScale) => {
    setFontScaleState(scale);
  };

  return (
    <ThemeContext.Provider value={{ theme, fontScale, toggleTheme, setFontScale }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};

export default ThemeContext;
