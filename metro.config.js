const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const { transformer, resolver } = config;

config.transformer = transformer;
config.resolver = {
  ...resolver,
  assetExts: [...resolver.assetExts, 'txt'],
};

module.exports = config;
