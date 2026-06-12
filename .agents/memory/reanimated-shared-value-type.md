---
name: Reanimated SharedValue type (Expo mobile)
description: How to type a shared value passed as a prop in react-native-reanimated v4
---

When you pass a reanimated shared value as a component prop and need to type it,
import the `SharedValue` type directly from `react-native-reanimated`:

```ts
import Animated, { type SharedValue } from "react-native-reanimated";
// prop type: pulse: SharedValue<number>
```

**Why:** In reanimated v4 (the version Empiri's Expo app uses), `Animated.SharedValue<T>`
does NOT exist — tsc fails with `Namespace 'Animated' has no exported member 'SharedValue'`.
The `Animated` default export is only the animated-components namespace; the value/worklet
types are top-level named exports.

**How to apply:** Any time you lift a `useSharedValue` into a parent and pass it down
(e.g. one shared pulse driving many children's `useAnimatedStyle`), type the prop with the
named `SharedValue` import, not `Animated.SharedValue`.
