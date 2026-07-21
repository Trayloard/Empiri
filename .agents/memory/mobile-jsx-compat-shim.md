---
name: Mobile typecheck JSX compat shim
description: How to fix widespread JSX component type errors from expo-blur, expo-linear-gradient, react-native-svg in the mobile artifact.
---

## The problem
`@types/react` v19 changed JSX compatibility rules; older library types (expo-blur's BlurView, expo-linear-gradient's LinearGradient, react-native-svg's Svg/Circle/Path/etc.) don't conform to the new `Component<any,any,any>` interface → TS2607 / TS2786 errors in every source file that uses them.

## The fix
1. `artifacts/mobile/tsconfig.json`: add `"skipLibCheck": true` to stop TypeScript from failing on mismatched .d.ts internals.
2. `artifacts/mobile/types/module-overrides.d.ts`: declare the problematic packages with `React.FC<Props>` types — these take precedence over the library's own declarations because they're user-space declarations.
3. `artifacts/mobile/types/node-global.d.ts`: `declare const global: typeof globalThis;` — fixes `TS2304: Cannot find name 'global'` in jest test files without needing `@types/node` installed.

**Why:** `@types/node` is not installed in the mobile package and `/// <reference types="node" />` fails with TS2688. The node-global.d.ts shim is the minimal fix.

**How to apply:** When you see TS2786/TS2607 on third-party RN/Expo components, add a `declare module "package-name" { export const Foo: React.FC<any>; }` to `types/module-overrides.d.ts`. Don't edit `expo-env.d.ts` — it's auto-generated and explicitly says not to edit it.
