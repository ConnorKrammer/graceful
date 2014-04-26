/**
 * graceful-filesystem
 *
 * Adds the FileSystem object to the global namespace, responsible for all
 * filesystem-related methods and operations.
 *
 * Requires: none
 */


!function(global) {
  'use strict';

/* =======================================================
 *                       FileSystem
 * ======================================================= */

  // Define the FileSystem namespace.
  function FileSystem() {}

  /**
   * Reads a file from disk and returns a promise for its contents.
   * Only supports UTF-8 encoding.
   *
   * @param {String} path - The path on disk to read from.
   * @return {Q.Promise} A promise for the contents of the file.
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
   * Only supports UTF-8 encoding.
   *
   * If the data parameter is omitted then the document will
   * be created but left empty.
   *
   * @param {String} path - The path to write to.
   * @param {String} [data] - The data to write.
   * @return {Q.Promise} A promise for the operation's completion.
   */
  FileSystem.writeFile = function(path, data) {
    var deferred = Q.defer();

    appshell.fs.writeFile(path, data || '', 'utf8', function(error) {
      if (error === appshell.fs.NO_ERROR) {
        deferred.resolve();
      } else {
        deferred.reject(new Error(Utils.getShellErrorMessage(error)));
      }
    });

    return deferred.promise;
  };

  /**
   * Writes data to a file, recursively creating any needed folders
   * along the way. Only supports UTF-8 encoding.
   *
   * If the data parameter is omitted then the document will
   * be created but left empty.
   *
   * @param {String} path - The path to write to.
   * @param {String} [data] - The data to write.
   * @return {Q.Promise} A promise for the operation's completion.
   */
  FileSystem.writeFileRecursive = function(path, data) {
    var deferred      = Q.defer();
    var fileNameIndex = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1;
    var fileName      = path.substr(fileNameIndex);
    var directoryPath = path.substr(0, fileNameIndex - 1);

    if (!fileName) {
      deferred.reject(new Error('No ' + (filename ? 'filename' : 'directory') + ' specified in path.'));
      return deferred.promise;
    }

    FileSystem.directoryExists(directoryPath)
      .then(function(doesExist) { 
        if (!doesExist) return FileSystem.makeDirectory(directoryPath);
      })
      .then(function() {
        deferred.resolve(FileSystem.writeFile(path, data));
      })
      .fail(function(error) {
        deferred.reject(error);
      });

    return deferred.promise;
  };

  /**
   * Creates the given directory, creating any intermediate directories
   * as necessary.
   *
   * @param {String} path - The directory path to create.
   * @return {Q.Promise} A promise for the operation's completion.
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
   * Checks if a file exists at the given location.
   *
   * @param {String} path - The path of the file to check.
   * @return {Q.Promise} A promise for whether the file exists.
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
   * Checks if a directory exists at the given location.
   *
   * @param {String} path - The path of the directory to check.
   * @return {Q.Promise} A promise for whether the directory exists.
   */
  FileSystem.directoryExists = function(path) {
    var deferred = Q.defer();

    appshell.fs.readdir(path, function(error, data) {
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
   * Checks if a path exists, regardless of whether it is a file or directory.
   * It does this by first checking if the given path exists as a file, and
   * if not, then by checking it it exists as a directory. If neither are
   * true, then the path does not exist.
   *
   * @param {String} path - The path to check.
   * @return {Q.Promise} A promise for whether the path exists.
   */
  FileSystem.pathExists = function(path) {
    var deferred = Q.defer();

    FileSystem.fileExists(path)
      .then(function(doesExist) {
        if (doesExist) {
          deferred.resolve(true);
        } else {
          deferred.resolve(FileSystem.directoryExists(path));
        }
      })
      .fail(function(error) {
        deferred.reject(error);
      });

    return deferred.promise;
  };

  /**
   * Checks whether the path points to a file or a directory.
   *
   * The promise resolves to 'file' if a file, 'directory' if a
   * directory, false if not to a real destination, or to an error.
   *
   * @param {String} path - The path to test.
   * @return {Q.Promise} A promise for the type of destination the path points to.
   */
  FileSystem.pathType = function(path) {
    var deferred = Q.defer();

    // Resolve immediately to false if there's no path.
    if (!path) {
      deferred.resolve(false);
      return deferred.promise;
    }

    // Check for the path's type by attempting to read it as both a file and a directory.
    appshell.fs.readFile(path, "utf8", function(error, data) {
      appshell.fs.readdir(path, function(error2, data2) {
        if (error === appshell.fs.NO_ERROR) {
          deferred.resolve('file');
        }
        else if (error2 === appshell.fs.NO_ERROR) {
          deferred.resolve('directory');
        }
        else if (error === appshell.fs.ERR_NOT_FOUND && error2 === appshell.fs.ERR_NOT_FOUND) {
          deferred.resolve(false);
        }
        else {
          deferred.reject(new Error('Path type could not be determined.'));
        }
      });
    });

    return deferred.promise;
  };

  /**
   * Moves a file or directory to the trash folder. This allows non-permanent deletion.
   *
   * @param {String} path - The path of the file or directory to move to trash.
   * @return {Q.Promise} A promise for the operation's completion.
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
   * @param {String} path - The path of the file or directory to delete.
   * @return {Q.Promise} A promise for the operation's completion.
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
   * @param {String} source - The path of the file or directory to copy.
   * @param {String} destination - The destination of the copied file.
   * @return {Q.Promise} A promise for the operation's completion.
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
   * @param {String} path - The path of the file or directory to change permissions of.
   * @param {Integer} [mode=0777] - The permission level to set on the file, in base 8.
   * @return {Q.Promise} A promise for the operation's completion.
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
   * @param {String} path - The path of the file or directory to rename.
   * @return {Q.Promise} A promise for the operation's completion.
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

  /**
   * Shows the default open file dialogue and prompts the user to select
   * a file. The promise resolves to the selected filepath.
   *
   * @param {String} [title='Open file'] - The title of the dialogue's window.
   *
   * @param {String} [initialPath] - The starting path to open the dialogue to.
   *        Setting this to null or '' will open the last chosen path.
   *
   * @param {String[]|String} [fileTypes] - A single file type or
   *        array of file types to restrict the file list to. When
   *        specifying these, do not include the '.' character. For
   *        example, if you only want to display .js files, pass
   *        either 'js' or ['js'].
   *
   * @return {Q.Promise} A promise for the user selection.
   */
  FileSystem.showOpenDialog = function(title, initialPath, fileTypes) {
    var deferred = Q.defer();

    // Set defaults.
    title = title || 'Open file';

    appshell.fs.showOpenDialog(false, false, title, initialPath, fileTypes, function(error, filepath) {
      if (error === appshell.fs.NO_ERROR) {
        if (filepath.length === 0) {
          deferred.reject(new Error('Open action cancelled'));
        } else {
          deferred.resolve(filepath[0]);
        }
      } else {
        deferred.reject(new Error(Utils.getShellErrorMessage(error)));
      }
    });

    return deferred.promise;
  };

  /**
   * Shows the default save file dialogue and prompts the user to select
   * a location. The promise resolves to the selected filepath.
   *
   * @param {String} [title='Save file'] - The title of the dialogue's window.
   *
   * @param {String} [initialPath] - The starting path to open the dialogue to.
   *        Setting this to null or '' will open the last chosen path.
   *
   * @param {String} [filename] - The initial name to set for the new file. This
   *        can be changed by the user in the dialogue window.
   *
   * @return {Q.Promise} A promise for the saved file's path.
   */
  FileSystem.showSaveDialogue = function(title, initialPath, proposedName) {
    var deferred = Q.defer();

    // Set defaults.
    title = title || 'Save file';

    appshell.fs.showSaveDialog(title, initialPath, proposedName, function(error, filepath) {
      if (error === appshell.fs.NO_ERROR) {
        if (filepath.length === 0) {
          deferred.reject(new Error('Save action cancelled.'));
        } else {
          deferred.resolve(filepath);
        }
      } else {
        deferred.reject(new Error(Utils.getShellErrorMessage(error)));
      }
    });

    return deferred.promise;
  };

/* =======================================================
 *                        Exports
 * ======================================================= */

  global.FileSystem = FileSystem;
}(this);

