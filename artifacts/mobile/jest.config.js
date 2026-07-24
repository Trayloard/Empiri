module.exports = {
  preset: "jest-expo",
  testMatch: ["**/__tests__/**/*.test.{ts,tsx}"],
  // Mocks global.fetch so tests never hit the real network (401/404 noise in
  // CI) and documents which console.error lines are expected. See jest.setup.ts.
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
};
