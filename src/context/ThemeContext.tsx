// src/context/ThemeContext.tsx
import React, { createContext, useContext, useState, useEffect } from 'react';

export type Theme = 'light' | 'dark';
export type DesignSystem = 'restaurant-pos' | 'classic-slate';
export type AccentColor = 'cream' | 'orange' | 'red' | 'violet' | 'blue' | 'green';
export type FontSize = 'compact' | 'normal' | 'large' | 'xlarge';
export type ContrastMode = 'normal' | 'high';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  glassEnabled: boolean;
  setGlassEnabled: (enabled: boolean) => void;
  toggleGlass: () => void;
  accentColor: AccentColor;
  setAccentColor: (accent: AccentColor) => void;
  fontSize: FontSize;
  setFontSize: (size: FontSize) => void;
  contrast: ContrastMode;
  setContrast: (contrast: ContrastMode) => void;
  designSystem: DesignSystem;
  setDesignSystem: (ds: DesignSystem) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'dark';
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return 'dark';
  });

  const [glassEnabled, setGlassEnabledState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem('foodiepos_glass_enabled');
    if (saved === 'false') return false;
    return true;
  });

  const [accentColor, setAccentColorState] = useState<AccentColor>(() => {
    if (typeof window === 'undefined') return 'cream';
    const saved = localStorage.getItem('foodiepos_accent_color') as AccentColor | null;
    if (saved && ['cream', 'orange', 'red', 'violet', 'blue', 'green'].includes(saved)) {
      return saved;
    }
    return 'cream';
  });

  const [fontSize, setFontSizeState] = useState<FontSize>(() => {
    if (typeof window === 'undefined') return 'normal';
    const saved = localStorage.getItem('foodiepos_font_size') as FontSize | null;
    if (saved && ['compact', 'normal', 'large', 'xlarge'].includes(saved)) {
      return saved;
    }
    return 'normal';
  });

  const [contrast, setContrastState] = useState<ContrastMode>(() => {
    if (typeof window === 'undefined') return 'normal';
    const saved = localStorage.getItem('foodiepos_contrast') as ContrastMode | null;
    if (saved && ['normal', 'high'].includes(saved)) {
      return saved;
    }
    return 'normal';
  });

  const [designSystem, setDesignSystemState] = useState<DesignSystem>(() => {
    if (typeof window === 'undefined') return 'restaurant-pos';
    const saved = localStorage.getItem('foodiepos_design_system');
    if (saved === 'restaurant-pos') return saved;
    return 'restaurant-pos';
  });

  useEffect(() => {
    const root = document.documentElement;
    localStorage.setItem('theme', theme);
    localStorage.setItem('foodiepos_glass_enabled', String(glassEnabled));
    localStorage.setItem('foodiepos_accent_color', accentColor);
    localStorage.setItem('foodiepos_font_size', fontSize);
    localStorage.setItem('foodiepos_contrast', contrast);
    localStorage.setItem('foodiepos_design_system', designSystem);

    root.dataset.accent = accentColor;
    root.dataset.fontSize = fontSize;
    root.dataset.contrast = contrast;
    root.dataset.designSystem = designSystem;

    // Modern Web Guidance: sincroniza color-scheme nativo para inputs, barras de desplazamiento y datepickers
    root.style.colorScheme = theme === 'dark' ? 'dark' : 'light';

    if (theme === 'dark') {
      root.classList.add('dark');
      root.dataset.theme = glassEnabled ? 'glass' : 'dark';
    } else {
      root.classList.remove('dark');
      root.dataset.theme = 'light';
    }

    root.dataset.glass = glassEnabled ? 'true' : 'false';
    root.dataset.effects = glassEnabled ? 'full' : 'reduced';
  }, [theme, glassEnabled, accentColor, fontSize, contrast, designSystem]);

  const setTheme = (nextTheme: Theme) => {
    setThemeState(nextTheme);
  };

  const toggleTheme = () => {
    setThemeState((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const setGlassEnabled = (enabled: boolean) => {
    setGlassEnabledState(enabled);
  };

  const toggleGlass = () => {
    setGlassEnabledState((prev) => !prev);
  };

  const setAccentColor = (accent: AccentColor) => {
    setAccentColorState(accent);
  };

  const setFontSize = (size: FontSize) => {
    setFontSizeState(size);
  };

  const setContrast = (nextContrast: ContrastMode) => {
    setContrastState(nextContrast);
  };

  const setDesignSystem = (ds: DesignSystem) => {
    setDesignSystemState(ds);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        toggleTheme,
        glassEnabled,
        setGlassEnabled,
        toggleGlass,
        accentColor,
        setAccentColor,
        fontSize,
        setFontSize,
        contrast,
        setContrast,
        designSystem,
        setDesignSystem,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

const FALLBACK_THEME_CONTEXT: ThemeContextType = {
  theme: 'dark',
  setTheme: (nextTheme: Theme) => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', nextTheme === 'dark');
      document.documentElement.dataset.theme = nextTheme;
    }
  },
  toggleTheme: () => {},
  glassEnabled: true,
  setGlassEnabled: (enabled: boolean) => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.glass = enabled ? 'true' : 'false';
      document.documentElement.dataset.effects = enabled ? 'full' : 'reduced';
    }
  },
  toggleGlass: () => {},
  accentColor: 'cream',
  setAccentColor: (accent: AccentColor) => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.accent = accent;
    }
  },
  fontSize: 'normal',
  setFontSize: (size: FontSize) => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.fontSize = size;
    }
  },
  contrast: 'normal',
  setContrast: (contrast: ContrastMode) => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.contrast = contrast;
    }
  },
  designSystem: 'restaurant-pos',
  setDesignSystem: (ds: DesignSystem) => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.designSystem = ds;
    }
  },
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  return context || FALLBACK_THEME_CONTEXT;
};
