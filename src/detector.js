const fs = require('fs');
const path = require('path');

/**
 * Automatically discovers Antigravity IDE installation directories
 * across Windows, macOS, and Linux platforms.
 *
 * @param {string|null} customPath - Optional user-specified installation path
 * @returns {object|null} Paths object containing root, workbenchDir, workbenchHtml, nodeModulesKatex
 */
function findAntigravityPaths(customPath = null) {
  const candidateRoots = [];

  if (customPath) {
    candidateRoots.push(path.resolve(customPath));
  }

  // Windows standard paths
  if (process.env.LOCALAPPDATA) {
    candidateRoots.push(
      path.join(process.env.LOCALAPPDATA, 'Programs', 'Antigravity IDE'),
      path.join(process.env.LOCALAPPDATA, 'antigravity-ide'),
      path.join(process.env.LOCALAPPDATA, 'Programs', 'antigravity')
    );
  }
  if (process.env.PROGRAMFILES) {
    candidateRoots.push(
      path.join(process.env.PROGRAMFILES, 'Antigravity IDE'),
      path.join(process.env.PROGRAMFILES, 'antigravity')
    );
  }

  // macOS standard paths
  if (process.platform === 'darwin') {
    candidateRoots.push(
      '/Applications/Antigravity IDE.app/Contents/Resources',
      path.join(process.env.HOME || '', 'Applications/Antigravity IDE.app/Contents/Resources')
    );
  }

  // Linux standard paths
  if (process.platform === 'linux') {
    candidateRoots.push(
      '/usr/share/antigravity-ide',
      '/opt/Antigravity IDE'
    );
  }

  for (const root of candidateRoots) {
    if (!fs.existsSync(root)) continue;

    // Locate the core app resources folder
    let appDir = root;
    if (fs.existsSync(path.join(root, 'resources', 'app'))) {
      appDir = path.join(root, 'resources', 'app');
    } else if (fs.existsSync(path.join(root, 'app'))) {
      appDir = path.join(root, 'app');
    }

    const workbenchDir = path.join(appDir, 'out', 'vs', 'code', 'electron-browser', 'workbench');
    const workbenchHtml = path.join(workbenchDir, 'workbench.html');
    const nodeModulesKatex = path.join(appDir, 'node_modules', 'katex');

    if (fs.existsSync(workbenchHtml)) {
      return {
        rootDir: root,
        appDir: appDir,
        workbenchDir: workbenchDir,
        workbenchHtml: workbenchHtml,
        nodeModulesKatex: nodeModulesKatex
      };
    }
  }

  return null;
}

module.exports = { findAntigravityPaths };
