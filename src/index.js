const { findAntigravityPaths } = require('./detector');
const { isPatched, applyPatch, removePatch } = require('./injector');
const { BackupManager } = require('./backup');

/**
 * Main API controller for Antigravity LaTeX Patcher
 */
class AntigravityLatexPatcher {
  /**
   * @param {string|null} customPath - Optional path to Antigravity IDE installation
   */
  constructor(customPath = null) {
    this.paths = findAntigravityPaths(customPath);
  }

  /**
   * Returns detected paths.
   * @returns {object|null}
   */
  getPaths() {
    return this.paths;
  }

  /**
   * Returns the current patch status.
   * @returns {object}
   */
  status() {
    if (!this.paths) {
      return {
        found: false,
        message: 'Antigravity IDE installation not found on system.'
      };
    }

    const patched = isPatched(this.paths);
    const htmlBackup = new BackupManager(this.paths.workbenchHtml);

    return {
      found: true,
      patched,
      paths: this.paths,
      hasBackup: htmlBackup.hasBackup(),
      message: patched
        ? 'LaTeX Patch IS INSTALLED and active in Workbench.'
        : 'LaTeX Patch is NOT installed.'
    };
  }

  /**
   * Installs or updates the LaTeX patch into Antigravity Workbench.
   *
   * @param {boolean} force - Force re-installation even if already patched
   * @returns {object}
   */
  install(force = true) {
    const st = this.status();
    if (!st.found) {
      throw new Error(st.message);
    }
    if (st.patched && !force) {
      return {
        success: true,
        alreadyPatched: true,
        message: 'LaTeX Patch is already installed.'
      };
    }

    applyPatch(this.paths);
    return {
      success: true,
      alreadyPatched: false,
      message: 'LaTeX Patch installed successfully into Antigravity IDE Workbench! Please reload window.'
    };
  }

  /**
   * Uninstalls the patch and reverts to original clean state.
   * @returns {object}
   */
  uninstall() {
    const st = this.status();
    if (!st.found) {
      throw new Error(st.message);
    }
    if (!st.patched && !st.hasBackup) {
      return {
        success: true,
        notPatched: true,
        message: 'No patch was installed.'
      };
    }

    const result = removePatch(this.paths);
    return {
      success: true,
      restoredFromBackup: result.restoredFromBackup,
      message: 'LaTeX Patch removed successfully! Workbench restored to original state.'
    };
  }
}

module.exports = {
  AntigravityLatexPatcher,
  findAntigravityPaths,
  isPatched,
  applyPatch,
  removePatch
};
