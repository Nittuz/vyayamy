module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Reanimated 4 split the worklets plugin into a separate package;
    // it must remain last in the plugins list.
    plugins: ['react-native-worklets/plugin'],
  };
};
