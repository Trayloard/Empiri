declare module "expo-blur" {
  import type React from "react";
  import type { StyleProp, ViewStyle } from "react-native";
  export interface BlurViewProps {
    intensity?: number;
    tint?: "light" | "dark" | "default" | "prominent" | "extraLight" | "regular";
    experimentalBlurMethod?: string;
    blurReductionFactor?: number;
    style?: StyleProp<ViewStyle>;
    children?: React.ReactNode;
    [key: string]: unknown;
  }
  export const BlurView: React.FC<BlurViewProps>;
}

declare module "expo-linear-gradient" {
  import type React from "react";
  import type { StyleProp, ViewStyle } from "react-native";
  export interface LinearGradientProps {
    colors: readonly string[];
    start?: { x: number; y: number };
    end?: { x: number; y: number };
    locations?: readonly number[];
    style?: StyleProp<ViewStyle>;
    children?: React.ReactNode;
    [key: string]: unknown;
  }
  export const LinearGradient: React.FC<LinearGradientProps>;
}

declare module "react-native-svg" {
  import type React from "react";
  interface SvgCommonProps {
    style?: unknown;
    children?: React.ReactNode;
    [key: string]: unknown;
  }
  export const Svg: React.FC<SvgCommonProps & { width?: number | string; height?: number | string; viewBox?: string }>;
  export const Defs: React.FC<SvgCommonProps>;
  export const RadialGradient: React.FC<SvgCommonProps & { id?: string; cx?: string; cy?: string; r?: string }>;
  export const LinearGradient: React.FC<SvgCommonProps & { id?: string; x1?: string; y1?: string; x2?: string; y2?: string }>;
  export const Stop: React.FC<SvgCommonProps & { offset?: string | number; stopColor?: string; stopOpacity?: number }>;
  export const Circle: React.FC<SvgCommonProps & { cx?: number | string; cy?: number | string; r?: number | string; fill?: string; stroke?: string; strokeWidth?: number }>;
  export const Path: React.FC<SvgCommonProps & { d?: string; fill?: string; stroke?: string; strokeWidth?: number }>;
  export const Line: React.FC<SvgCommonProps & { x1?: number | string; y1?: number | string; x2?: number | string; y2?: number | string; stroke?: string; strokeWidth?: number }>;
  const SvgDefault: React.FC<SvgCommonProps & { width?: number | string; height?: number | string; viewBox?: string }>;
  export default SvgDefault;
}
