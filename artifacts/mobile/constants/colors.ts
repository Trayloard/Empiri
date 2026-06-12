/**
 * Semantic design tokens for Empiri — a living, Apple-Intelligence-style presence.
 *
 * Concept: "a living light." The companion is a soft, iridescent presence made
 * of light that is always gently breathing. The palette is luminous and
 * premium: deep, near-black surfaces in dark mode and a soft luminous wash in
 * light mode, both lit by the same Siri-style spectrum (blue → purple → pink →
 * orange). Surfaces are translucent "glass"; accents come from the spectrum.
 */

const SPECTRUM = ["#5B8CFF", "#A855F7", "#EC4899", "#FB923C"] as const;

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: "#16131F",
    tint: "#7C3AED",

    // Core surfaces
    background: "#F4F3FB",
    foreground: "#16131F",

    // Cards / elevated surfaces (translucent glass)
    card: "rgba(255,255,255,0.62)",
    cardForeground: "#16131F",

    // Primary action color
    primary: "#7C3AED",
    primaryForeground: "#FFFFFF",

    // Secondary / less-emphasis interactive surfaces
    secondary: "rgba(255,255,255,0.7)",
    secondaryForeground: "#16131F",

    // Muted / subdued elements
    muted: "rgba(22,19,31,0.05)",
    mutedForeground: "#6A6478",

    // Accent highlights
    accent: "#4F7DF9",
    accentForeground: "#FFFFFF",

    // Destructive actions / errors
    destructive: "#E0594C",
    destructiveForeground: "#FFFFFF",

    // Borders and input outlines
    border: "rgba(22,19,31,0.10)",
    input: "rgba(22,19,31,0.10)",

    // --- Living-presence tokens ---
    glass: "rgba(255,255,255,0.62)",
    glassStrong: "rgba(255,255,255,0.82)",
    glassBorder: "rgba(255,255,255,0.85)",
    blurTint: "light" as const,
    statusAccent: "#7C3AED",
    spectrum: SPECTRUM,
    presenceCore: "#FFFFFF",
    ambient: ["#5B8CFF", "#A855F7", "#EC4899"] as const,
    userBubble: ["#5B8CFF", "#A855F7"] as const,
    userBubbleBorder: "rgba(124,58,237,0.0)",
    userBubbleText: "#FFFFFF",
  },

  dark: {
    text: "#FFFFFF",
    tint: "#C4B5FD",

    background: "#0A0A0C",
    foreground: "#FFFFFF",

    card: "rgba(255,255,255,0.05)",
    cardForeground: "rgba(255,255,255,0.92)",

    primary: "#A855F7",
    primaryForeground: "#FFFFFF",

    secondary: "rgba(255,255,255,0.08)",
    secondaryForeground: "#FFFFFF",

    muted: "rgba(255,255,255,0.05)",
    mutedForeground: "rgba(255,255,255,0.5)",

    accent: "#5B8CFF",
    accentForeground: "#FFFFFF",

    destructive: "#F2655E",
    destructiveForeground: "#FFFFFF",

    border: "rgba(255,255,255,0.10)",
    input: "rgba(255,255,255,0.10)",

    // --- Living-presence tokens ---
    glass: "rgba(255,255,255,0.05)",
    glassStrong: "rgba(255,255,255,0.09)",
    glassBorder: "rgba(255,255,255,0.12)",
    blurTint: "dark" as const,
    statusAccent: "#C4B5FD",
    spectrum: SPECTRUM,
    presenceCore: "#FFFFFF",
    ambient: ["#5B8CFF", "#A855F7", "#EC4899"] as const,
    userBubble: ["rgba(91,140,255,0.30)", "rgba(168,85,247,0.30)"] as const,
    userBubbleBorder: "rgba(140,170,255,0.45)",
    userBubbleText: "#FFFFFF",
  },

  // Border radius (in px) for cards, buttons, inputs.
  radius: 24,
};

export default colors;
