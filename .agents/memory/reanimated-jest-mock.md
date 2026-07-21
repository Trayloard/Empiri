---
name: Reanimated mock in Jest — worklets safety
description: The correct way to mock react-native-reanimated in Jest to avoid the WorkletsError that occurs when the native runtime is bootstrapped.
---

# Reanimated Jest mock — inline only, never require the bundled mock

## The rule
Never call `require("react-native-reanimated/mock")` inside a `jest.mock()` factory.  
It bootstraps the worklets native runtime, which throws `WorkletsError: Failed to create a worklet` in the Jest environment.

**Why:** `react-native-reanimated/mock` itself imports `react-native-worklets` at module load time. In Jest, the worklets runtime can't be initialized, causing the whole test suite to fail to run (no tests execute, all counted as failures).

## How to apply
Use a fully inline mock that covers every Reanimated export the module under test uses:

```ts
jest.mock("react-native-reanimated", () => {
  const { View } = require("react-native");
  const sv = (v: unknown) => ({ value: v });
  return {
    __esModule: true,
    default: { View },
    useSharedValue: sv,
    useAnimatedStyle: () => ({}),
    useReducedMotion: () => false,
    withTiming: (v: unknown) => v,
    withSpring: (v: unknown) => v,
    Easing: {
      linear: 0,
      inOut: () => () => 0,
      out: () => () => 0,
      cubic: () => 0,
      quad: () => 0,
    },
    Animated: { View },
  };
});
```

Do NOT use:
```ts
// ❌ This bootstraps the worklets runtime and throws in Jest
jest.mock("react-native-reanimated", () => {
  const official = require("react-native-reanimated/mock");
  return { ...official, useReducedMotion: () => false };
});
```

## Where this applies
Any test file that (directly or transitively) imports a component using `react-native-reanimated`. The Babel worklets transform (configured in `babel.config.js`) fixes worklets inside source files, but NOT inside jest.mock factory callbacks.
