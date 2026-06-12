/**
 * Semantic design tokens for Empiri — a warm, friendly companion app.
 *
 * Concept: "a little glowing orb that lives in your phone." The palette is
 * warm and inviting — coral and amber on soft cream — so the companion always
 * feels alive and caring.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: "#2B2018",
    tint: "#FF7A59",

    // Core surfaces
    background: "#FFF7F0",
    foreground: "#2B2018",

    // Cards / elevated surfaces
    card: "#FFFFFF",
    cardForeground: "#2B2018",

    // Primary action color
    primary: "#FF7A59",
    primaryForeground: "#FFFFFF",

    // Secondary / less-emphasis interactive surfaces
    secondary: "#FFE9DE",
    secondaryForeground: "#7A4A33",

    // Muted / subdued elements
    muted: "#F4E7DC",
    mutedForeground: "#A08A7A",

    // Accent highlights (the warm glow)
    accent: "#FFC375",
    accentForeground: "#5A3A1E",

    // Destructive actions / errors
    destructive: "#E0594C",
    destructiveForeground: "#FFFFFF",

    // Borders and input outlines
    border: "#F0E1D5",
    input: "#F0E1D5",
  },

  dark: {
    text: "#F6EDE5",
    tint: "#FF8E70",

    background: "#191512",
    foreground: "#F6EDE5",

    card: "#241E1A",
    cardForeground: "#F6EDE5",

    primary: "#FF8E70",
    primaryForeground: "#241712",

    secondary: "#3A2C24",
    secondaryForeground: "#FFD9C7",

    muted: "#2C2420",
    mutedForeground: "#A7958A",

    accent: "#F0B266",
    accentForeground: "#2A1B0C",

    destructive: "#F26F62",
    destructiveForeground: "#241712",

    border: "#332923",
    input: "#332923",
  },

  // Border radius (in px) for cards, buttons, inputs.
  radius: 22,
};

export default colors;
