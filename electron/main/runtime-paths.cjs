const os = require('os');
const path = require('path');

function getAppConfigRootDir(app) {
    if (process.platform === 'linux') {
        return path.join(os.homedir(), '.config');
    }

    return app.getPath('userData');
}

function getAppCacheRootDir(app) {
    if (process.platform === 'linux') {
        return path.join(os.homedir(), '.cache');
    }

    return app.getPath('cache');
}

function getAppLocalRootDir(app) {
    if (process.platform === 'linux') {
        return path.join(os.homedir(), '.local', 'share');
    }

    return app.getPath('appData');
}

function resolveElectronRuntimeMode() {
    const runtimeMode = process.env.ACE_RUNTIME_MODE;
    if (runtimeMode === 'desktop' || runtimeMode === 'background') {
        return runtimeMode;
    }

    return 'desktop';
}

module.exports = {
    getAppConfigRootDir,
    getAppCacheRootDir,
    getAppLocalRootDir,
    resolveElectronRuntimeMode,
};