module.exports = function (api) {
  api.cache(true);
  const isTest = process.env.NODE_ENV === "test";
  return {
    presets: [
      [
        "babel-preset-expo",
        {
          unstable_transformImportMeta: true,
          worklets: isTest ? false : undefined,
          reanimated: isTest ? false : undefined,
        },
      ],
    ],
  };
};
