const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

const existingBlockList = config.resolver.blockList;
const webviewSrcBlock = /react-native-webview[/\\]src[/\\].*/;
config.resolver.blockList = existingBlockList
  ? [existingBlockList, webviewSrcBlock].flat()
  : webviewSrcBlock;

function sourceFile(relativePath) {
  return {
    type: 'sourceFile',
    filePath: path.resolve(projectRoot, relativePath),
  };
}

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'firebase/app' || moduleName === '@firebase/app') {
    return sourceFile('node_modules/@firebase/app/dist/index.cjs.js');
  }

  if (moduleName === 'firebase/auth' || moduleName === '@firebase/auth') {
    if (platform === 'web') {
      return sourceFile('node_modules/firebase/auth/dist/index.cjs.js');
    }
    return sourceFile('node_modules/@firebase/auth/dist/rn/index.js');
  }

  if (moduleName === 'react-native-webview') {
    return sourceFile('node_modules/react-native-webview/index.js');
  }

  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
