/**
 * graceful-filesystem
 */


!function(global) {
  'use strict';

  /**
   * Reads a file from disk and returns a promise for its contents.
   *
   * Only supports UTF-8 encoding.
   *
   * @param {string} path The path on disk to read from.
   * @return {promise} A promise returning the contents of the file.
   */
  FileSystem.readFile = function(path) {
    var deferred = Q.defer();

    appshell.fs.readFile(path, 'utf8', function(error, data) {
      if (error === appshell.fs.NO_ERROR) {
        deferred.resolve(data);
      } else {
        deferred.reject(new Error(Utils.getShellErrorMessage(error)));
      }
    });

    return deferred.promise;
  };

  /**
   * Writes data to disk and returns a promise.
   *
   * Only supports UTF-8 encoding.
   *
   * @param {string} path The path to save to.
   * @param {string} data The data to save.
   * @return {promise} A promise for the operation.
   */
  FileSystem.writeFile = function(path, data) {
    var deferred = Q.defer();

    appshell.fs.writeFile(path, data, 'utf8', function(error) {
      if (error === appshell.fs.NO_ERROR) {
        deferred.resolve();
      } else {
        deferred.reject(new Error(Utils.getShellErrorMessage(error)));
      }
    });

    return deferred.promise;
  };

  /**
   * Writes data to a file, creating any needed folders along the way, and returns a promise.
   *
   * Only supports UTF-8 encoding.
   *
   * @param {string} path The path to save to.
   * @param {string} data The data to save.
   * @return {promise} A promise for the operation.
   */
  FileSystem.writeFileRecursive = function(path, data) {
    var deferred = Q.defer();
    var fileNameIndex = path.lastIndexOf("/") + 1;
    var fileName = path.substr(fileNameIndex);
    var directoryPath = path.substr(0, fileNameIndex - 1);

    if (!fileName) deferred.reject(new Error("No filename specified in path."));

    var promise = FileSystem.pathExists(directoryPath)
      .then(function(doesExist) { 
        if (!doesExist) return FileSystem.makeDirectory(directoryPath);
      })
      .then(function() {
        return FileSystem.writeFile(path, data);
      })
      .fail(function(error) {
        deferred.reject(error);
      });

    return deferred.promise;
  };

  /**
   * Creates the given directory.
   *
   * @param {string} path The path to the directory.
   * @return {promise} A promise for the operation.
   */
  FileSystem.makeDirectory = function(path) {
    var deferred = Q.defer();

    appshell.fs.makedir(path, parseInt('0777', 8), function(error) {
      if (error === appshell.fs.NO_ERROR) {
        deferred.resolve();
      } else {
        deferred.reject(new Error(Utils.getShellErrorMessage(error)));
      }
    });

    return deferred.promise;
  }

  /**
   * Checks if a file exists.
   *
   * @param {string} path The path of the file to check.
   * @return {promise} A promise for the operation.
   */
  FileSystem.fileExists = function(path) {
    var deferred = Q.defer();

    appshell.fs.readFile(path, "utf8", function(error, data) {
      if (error === appshell.fs.NO_ERROR) {
        deferred.resolve(true);
      }
      else if (error === appshell.fs.ERR_NOT_FOUND) {
        deferred.resolve(false);
      }
      else {
        deferred.reject(new Error(Utils.getShellErrorMessage(error)));
      }
    });

    return deferred.promise;
  };

  /**
   * Moves a file or directory to the trash folder. This allows non-permanent deletion.
   *
   * @param {string} path The path of the file or directory to move to trash.
   * @return {promise} A promise for the operation.
   */
  FileSystem.moveToTrash = function(path) {
    var deferred = Q.defer();

    appshell.fs.moveToTrash(path, function(error) {
      if (error === appshell.fs.NO_ERROR) {
        deferred.resolve();
      } else {
        deferred.reject(new Error(Utils.getShellErrorMessage(error)));
      }
    });

    return deferred.promise;
  };

  /**
   * Deletes a file or directory permanently.
   *
   * @param {string} path The path of the file or directory to delete.
   * @return {promise} A promise for the operation.
   */
  FileSystem.unlink = function(path) {
    var deferred = Q.defer();

    appshell.fs.unlink(path, function(error) {
      if (error === appshell.fs.NO_ERROR) {
        deferred.resolve();
      } else {
        deferred.reject(new Error(Utils.getShellErrorMessage(error)));
      }
    });

    return deferred.promise;
  };

  /**
   * Copies a file from one location to another.
   *
   * @param {string} source The path of the file or directory to copy.
   * @param {string} destination The destination of the copied file.
   * @return {promise} A promise for the operation.
   */
  FileSystem.copyFile = function(source, destination) {
    var deferred = Q.defer();

    if (source === destination) {
      deferred.reject(new Error("Source and destination cannot be the same."));
    } else {
      appshell.fs.copyFile(source, destination, function(error) {
        if (error === appshell.fs.NO_ERROR) {
          deferred.resolve();
        } else {
          deferred.reject(new Error(Utils.getShellErrorMessage(error)));
        }
      });
    }

    return deferred.promise;
  };

  /**
   * Sets file permissions.
   *
   * @param {string} path The path of the file or directory to change permissions of.
   * @param {integer} mode The permission level to set on the file. Defaults to 0777.
   * @return {promise} A promise for the operation.
   */
  FileSystem.chmod = function(path, mode) {
    var deferred = Q.defer();
    mode = mode || parseInt("0777", 8);

    appshell.fs.chmod(path, mode, function(error) {
      if (error === appshell.fs.NO_ERROR) {
        deferred.resolve();
      } else {
        deferred.reject(new Error(Utils.getShellErrorMessage(error)));
      }
    });

    return deferred.promise;
  };

  /**
   * Renames a file or directory.
   *
   * @param {string} path The path to change.
   * @return {promise} A promise for the operation.
   */
  FileSystem.rename = function(path, newPath) {
    var deferred = Q.defer();

    appshell.fs.rename(path, newPath, function(error) {
      if (error === appshell.fs.NO_ERROR) {
        deferred.resolve();
      } else {
        deferred.reject(new Error(Utils.getShellErrorMessage(error)));
      }
    });

    return deferred.promise;
  };

}(this);

