const path = require("path");
const jestExpoPreset = require("jest-expo/jest-preset");

const EXPO_MODULES_CORE = path.resolve(
  __dirname,
  "../../node_modules/.pnpm/expo-modules-core@3.0.30_react-native@0.81.5_@babel+core@7.29.0_@types+react@19.1.17_react@19.1.0__react@19.1.0/node_modules/expo-modules-core"
);

module.exports = {
  ...jestExpoPreset,
  testMatch: ["**/__tests__/**/*.test.{ts,tsx}"],
  moduleNameMapper: {
    ...jestExpoPreset.moduleNameMapper,
    "^expo-modules-core$": EXPO_MODULES_CORE,
    "^expo-modules-core/(.*)$": `${EXPO_MODULES_CORE}/$1`,
  },
};
