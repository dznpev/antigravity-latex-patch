const fs = require('fs');

/**
 * Manages atomic backups and restorations for target patched files.
 */
class BackupManager {
  /**
   * @param {string} filePath - Absolute path to the original file
   */
  constructor(filePath) {
    this.filePath = filePath;
    this.bakPath = `${filePath}.bak`;
  }

  /**
   * Checks if an existing backup file is present.
   * @returns {boolean}
   */
  hasBackup() {
    return fs.existsSync(this.bakPath);
  }

  /**
   * Creates an atomic backup copy of the target file.
   * If a backup already exists and force is false, the existing clean backup is preserved.
   *
   * @param {boolean} force - Whether to overwrite an existing backup
   * @returns {boolean} True if a new backup was created
   */
  createBackup(force = false) {
    if (!fs.existsSync(this.filePath)) {
      throw new Error(`Target file does not exist: ${this.filePath}`);
    }

    if (!this.hasBackup() || force) {
      fs.copyFileSync(this.filePath, this.bakPath);
      return true;
    }
    return false;
  }

  /**
   * Restores the original file from the backup and removes the backup file.
   * @returns {boolean} True if restored successfully
   */
  restoreBackup() {
    if (!this.hasBackup()) {
      return false;
    }
    fs.copyFileSync(this.bakPath, this.filePath);
    fs.unlinkSync(this.bakPath);
    return true;
  }

  /**
   * Removes the backup file without restoring.
   * @returns {boolean}
   */
  removeBackup() {
    if (this.hasBackup()) {
      fs.unlinkSync(this.bakPath);
      return true;
    }
    return false;
  }
}

module.exports = { BackupManager };
