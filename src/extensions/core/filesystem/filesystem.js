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

    path = FileSystem.sanitizePath(path);

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

    path = FileSystem.sanitizePath(path);

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
    path = FileSystem.sanitizePath(path);

    var deferred      = Q.defer();
    var index         = path.lastIndexOf('/');
    var fileName      = path.slice(0, index + 1);
    var directoryPath = path.slice(0, index);

    if (!fileName) {
      deferred.reject(new Error('No filename specified in path.'));
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

    path = FileSystem.sanitizePath(path);

    appshell.fs.makedir(path, parseInt('0777', 8), function(error) {
      if (error === appshell.fs.NO_ERROR) {
        deferred.resolve();
      } else {
        deferred.reject(new Error(Utils.getShellErrorMessage(error)));
      }
    });

    return deferred.promise;
  };

  /**
   * Returns a list of all files in the given directory.
   *
   * @param {String} path - The path of the directory to read.
   * @return {Q.Promise} A promise for the directory's contents.
   */
  FileSystem.readDirectory = function(path) {
    var deferred = Q.defer();

    path = FileSystem.sanitizePath(path);

    appshell.fs.readdir(path, function(error, files) {
      if (error === appshell.fs.NO_ERROR) {
        deferred.resolve(files);
      } else {
        deferred.reject(new Error(Utils.getShellErrorMessage(error)));
      }
    });

    return deferred.promise;
  };

  /**
   * Checks if a file exists at the given location.
   *
   * @param {String} path - The path of the file to check.
   * @return {Q.Promise} A promise for whether the file exists.
   */
  FileSystem.fileExists = function(path) {
    var deferred = Q.defer();

    FileSystem.pathType(path)
      .then(function(type) {
        deferred.resolve(type === 'file');
      })
      .fail(function() {
        deferred.reject(new Error(Utils.getShellErrorMessage(appshell.fs.ERR_UNKNOWN)));
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

    path = FileSystem.sanitizePath(path);

    FileSystem.pathType(path)
      .then(function(type) {
        deferred.resolve(type === 'directory');
      })
      .fail(function(error) {
        deferred.reject(new Error(Utils.getShellErrorMessage(appshell.fs.ERR_UNKNOWN)));
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

    FileSystem.pathType(path)
      .then(function(type) {
        deferred.resolve(type === 'file' || type === 'directory');
      })
      .fail(function(error) {
        deferred.reject(new Error(Utils.getShellErrorMessage(appshell.fs.ERR_UNKNOWN)));
      });

    return deferred.promise;
  };

  /**
   * Returns the component of the given path that is real (exists
   * on disk).
   *
   * @param {String} path - The path to get the real component of.
   * @return {Q.Promise} A promise for the real component of the path.
   */
  FileSystem.getRealPathComponent = function(path) {
    var deferred = Q.defer();
    var promise = Q();
    var regex = /(\/*[^\/]+)\/?/g;
    var subPaths = [];
    var match;

    path = FileSystem.sanitizePath(path);
    var lastIndex = 0;
    var index, subPath;

    while ((match = regex.exec(path)) !== null) {
      index     = lastIndex + match[0].length;
      subPath   = path.slice(lastIndex, index);
      lastIndex = index;

      subPaths.unshift((subPaths[0] || '') + match[0]);
    }

    subPaths.forEach(function(path) {
      promise = Q.when(promise, function() {
        return FileSystem.pathExists(path)
          .then(function(exists) {
            if (exists) deferred.resolve(path);
          });
      });
    });

    // Resolve to nothing if no real component is found.
    promise.then(function() {
      deferred.resolve('');
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

    path = FileSystem.sanitizePath(path);

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

    path = FileSystem.sanitizePath(path);

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

    path = FileSystem.sanitizePath(path);

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
   * @param {Integer|String} [mode=0777] - The permission level to set on the file, in base 8.
   *        Note that octal literals are disallowed in strict mode. To get around this, in strict
   *        mode either pass in the argument as a string (which will be parsed from base 8), or as
   *        a decimal representation of the number.
   * @return {Q.Promise} A promise for the operation's completion.
   */
  FileSystem.chmod = function(path, mode) {
    var deferred = Q.defer();
    path = FileSystem.sanitizePath(path);
    mode = mode || '0777';

    if (typeof mode === 'string') {
      mode = parseInt(mode, 8);
    }

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

    path = FileSystem.sanitizePath(path);

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
   * @param {String} [initialPath] - The starting path to open the dialogue to.
   *        Setting this to null or '' will open the last chosen path.
   *
   * @param {String} [title='Open file'] - The title of the dialogue's window.
   *
   * @param {String[]|String} [fileTypes] - A single file type or
   *        array of file types to restrict the file list to. When
   *        specifying these, do not include the '.' character. For
   *        example, if you only want to display .js files, pass
   *        either 'js' or ['js'].
   *
   * @return {Q.Promise} A promise for the user selection.
   */
  FileSystem.showOpenDialog = function(initialPath, title, fileTypes) {
    var deferred = Q.defer();

    title = title || 'Open file';
    initialPath = FileSystem.sanitizePath(initialPath);

    appshell.fs.showOpenDialog(false, false, title, initialPath, fileTypes, function(error, filepath) {
      if (error === appshell.fs.NO_ERROR) {
        if (filepath.length === 0) {
          deferred.reject(new Error('Open action cancelled'));
        } else {
          deferred.resolve(FileSystem.sanitizePath(filepath[0]));
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
   * @param {String} [initialPath] - The starting path to open the dialogue to.
   *        Setting this to null or '' will open the last chosen path.
   *
   * @param {String} [proposedName] - The initial name to set for the new file. This
   *        can be changed by the user in the dialogue window.
   *
   * @param {String} [title='Save file'] - The title of the dialogue's window.
   *
   * @return {Q.Promise} A promise for the saved file's path.
   */
  FileSystem.showSaveDialogue = function(initialPath, proposedName, title) {
    var deferred = Q.defer();

    title = title || 'Save file';
    initialPath = FileSystem.sanitizePath(initialPath);

    appshell.fs.showSaveDialog(title, initialPath, proposedName, function(error, filepath) {
      if (error === appshell.fs.NO_ERROR) {
        if (filepath.length === 0) {
          deferred.reject(new Error('Save action cancelled.'));
        } else {
          deferred.resolve(FileSystem.sanitizePath(filepath));
        }
      } else {
        deferred.reject(new Error(Utils.getShellErrorMessage(error)));
      }
    });

    return deferred.promise;
  };

  /**
   * Standardizes a path to use forward slashes for cross-system
   * compatibility.
   *
   * @param {String} path - The path to normalize.
   * @return {String} The path, with all slashes normalized.
   */
  FileSystem.normalizeSlashes = function(path) {
    return path.replace(/\\/g, '/');
  };

  /**
   * Sanitizes the given filepath. This means removing redundant
   * slashes, collapsing parent folder references, etc.
   *
   * For the source of the algorithm used here, see
   * http://stackoverflow.com/a/21421753/1270419
   *
   * @todo Detect the operating system this program is running in,
   *       and sanitize more specifically based on the OS. For example,
   *       Windows disallows characters that are allowed in Unix systems
   *       (Linux, Mac OS). When this is implemented, the function
   *       should return null on an invalid path. (Consider a separate
   *       function: FileSystem.isValidPath(), for example.)
   *
   * @param {String} path - The path to sanitize.
   * @return {String} The sanitized path.
   */
  FileSystem.sanitizePath = function(path) {
    if (!path) return '';

    // Normalize slashes.
    path = FileSystem.normalizeSlashes(path);

    // Run the algorithm until nothing more can change.
    var lastPath;
    do {
      lastPath = path;

      // Collapse runs of slashes, but allow two leading ones.
      if (path.slice(0, 2) === '//') {
        path = '/' + path.replace(/\/+/g, '/');
      } else {
        path = path.replace(/\/+/g, '/');
      }

      // Resolve "./" segments.
      if (path.indexOf('./') !== -1) {
        path = path.replace(/^\.\//g, '');   // Leading
        path = path.replace(/\/\.\/$/g, ''); // Trailing
        path = path.replace(/\/\.\//g, '/'); // Middle
      }

      // Resolve "../" segments. Note the lack of the 'g' flag.
      if (path.indexOf('../') !== -1) {
        path = path.replace(/^([^\/]+?\/)\.\.\//, '$1'); // Leading
        path = path.replace(/\/[^\/]+?\/\.\.\//, '/'); // Middle and trailing
      }
    } while (path !== lastPath);

    return path;
  };

  /**
   * Checks if the given path is absolute.
   *
   * @param {String} path - The path to check.
   * @return {Boolean} Whether the path is absolute.
   */
  FileSystem.isAbsolute = function(path) {
    path = FileSystem.normalizeSlashes(path);

    if (path.slice(0, 2) === './' || path.slice(0, 3) === '../') {
      return false;
    }

    path = FileSystem.sanitizePath(path);

    if (path[0] === '/' || path[1] === ':') {
      return true; 
    }

    return false;
  };

  /**
   * Makes a relative path into an absolute one, using an
   * existing absolute path as its reference.
   *
   * Returns false if the absolute path is not, in fact, absolute,
   * or if the relative path is already absolute.
   *
   * Note that the absolute path is assumed to end in a directory. Ending
   * it in a file will cause unexpected results.
   *
   * @param {String} rootPath - An absolute path to resolve the relative path against.
   * @param {String} path - The relative path to resolve.
   * @return {String|false} The resolved absolute path, or false if the
   *         input was invalid.
   */
  FileSystem.makeAbsolutePath = function(rootPath, path) {
    rootPath = FileSystem.sanitizePath(rootPath);

    if (!rootPath || !FileSystem.isAbsolute(rootPath)) return false;
    else if (!path || FileSystem.isAbsolute(path)) return false;

    return FileSystem.sanitizePath(rootPath + '/' + path);
  };

/* =======================================================
 *                        Exports
 * ======================================================= */

  global.FileSystem = FileSystem;
}(this);

