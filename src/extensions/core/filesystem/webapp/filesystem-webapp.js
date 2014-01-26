/**
 * graceful-filesystem
 */


!function(global) {
  'use strict';

  // The filesystem database.
  var db;

  /**
   * Returns the filesystem database, used for storing Document objects.
   *
   * @return {promise} A promise returning the filesystem database.
   */
  function getDatabase() {
    var deferred = Q.defer();

    // Lazy-instantiation. If we've done this before, we 
    // get to exit early. Otherwise, fetch the database.
    if (db) {
      deferred.resolve(db);
      return deferred.promise;
    }

    deferred.resolve(Storage.getDatabase('filesystem')
      .then(function(database) {
        db = database;
        return database;
      }));

    return deferred.promise;
  }

  /**
   * Reads a file to storage and returns its contents in a promise.
   *
   * @param {string} path The file identifier to read.
   * @return {promise} A promise returning the contents of the file.
   */
  FileSystem.readFile = function(path) {
    return getDatabase()
      .then(function(database) {
        var deferred = Q.defer();

        database.get(path, function(error, doc) {
          if (error) {
            deferred.reject(error);
          } else {
            deferred.resolve(doc.text);
          }
        });

        return deferred.promise;
      })
  };

  /**
   * Writes a file to storage.
   *
   * @param {string} path The document identifier, in storage.
   * @param {string} data The file contents.
   * @return {promise} A promise for the operation.
   */
  FileSystem.writeFile = function(path, data) {
    return getDatabase()
      .then(function(database) {
        var deferred = Q.defer();

        // We need to do this so we have the most up-to-date
        // _rev property for the document.
        database.get(path, function(error, doc) {
          if (error) {
            // Resolve with just the _id set.
            deferred.resolve({ _id: path });
          } else {
            // Resolve with the _rev property set.
            deferred.resolve(doc);
          }
        });

        // Nested for access to the database object.
        return deferred.promise
          .then(function(doc) {
            var deferred = Q.defer();

            // Update the doc with the right text.
            doc.text = data;

            // Write the document. It'll be created if needed.
            database.put(doc, function(error, response) {
              if (error) {
                deferred.reject(error);
              } else {
                deferred.resolve();
              }
            });

            return deferred.promise;
          });
      });
  };

  /**
   * Aliased to writeFile in webapp mode.
   *
   * @param {string} path The document identifier, in storage.
   * @param {string} data The file contents.
   * @return {promise} A promise for the operation.
   */
  FileSystem.writeFileRecursive = function(path, data) {
    return FileSystem.writeFile(path, data);
  };

  /**
   * This function is unecessary in webapp mode, and just returns cleanly.
   *
   * I'm not actually sure how wise this is, just for the sake of keeping
   * the FileSystem interface the same in both modes. TODO: think this over.
   *
   * @param {string} path The path of the directory to create.
   * @return {promise} A promise that resolves immediately.
   */
  FileSystem.makeDirectory = function(path) {
    var deferred = Q.defer();
    deferred.resolve();

    return deferred.promise;
  };

  /**
   * Checks for the existance of a document in storage.
   *
   * @param {string} path The document identifier, in storage.
   * @return {promise} A promise returning true if the file exists.
   */
  FileSystem.fileExists = function(path) {
    return FileSystem.readFile(path)
      .then(function() {
        return true;
      })
      .fail(function() {
        return false;
      });
  };

  /**
   * Aliased to unlink in webapp mode.
   *
   * @param {string} path The document identifier, in storage.
   * @return {promise} A promise for the operation.
   */
  FileSystem.moveToTrash = function(path) {
    return FileSystem.unlink(path);
  };

  /**
   * Deletes a file from storage.
   *
   * @param {string} path The document identifier, in storage.
   * @return {promise} A promise for the operation.
   */
  FileSystem.unlink = function(path) {
    return getDatabase()
      .then(function(database) {
        var deferred = Q.defer();

        // We can stack get and remove without error checks in
        // between because remove's error handles get's error automatically.
        database.get(path, function(error, doc) {
          database.remove(doc, function(error2, results) {
            if (error2) {
              deferred.reject(error2);
            } else {
              deferred.resolve();
            }
          });
        });

        return deferred.promise;
      });
  };

  /**
   * Copies one file in storage to another location.
   *
   * @param {string} source The source document identifier.
   * @param {string} destination The destination document's storage identifier.
   * @return {promise} A promise for the operation.
   */
  FileSystem.copyFile = function(source, destination) {
    return getDatabase()
      .then(function(database) {
        var deferred = Q.defer();

        database.get(path, function(error, doc) {
          if (error) {
            deferred.reject(error);
          } else {
            deferred.resolve(FileSystem.writeFile(destination, doc.text));
          }
        });

        return deferred.promise;
      });
  };

  /**
   * This function is unecessary in webapp mode, and just returns cleanly.
   *
   * I'm not actually sure how wise this is, just for the sake of keeping
   * the FileSystem interface the same in both modes. TODO: think this over.
   *
   * @param {string} path The path of the directory to change permissions on.
   * @return {promise} A promise that resolves immediately.
   */
  FileSystem.chmod = function(path, mode) {
    var deferred = Q.defer();
    deferred.resolve();

    return deferred.promise;
  };

  /**
   * Renames a document.
   *
   * This is just a copy then a delete, chained together.
   *
   * @param {string} path The identifer of the document to rename.
   * @param {string} newPath The document's new name.
   * @return {promise} A promise for the operation.
   */
  FileSystem.rename = function(path, newPath) {
    return FileSystem.copyFile(path, newPath)
      .then(function() {
        return FileSystem.unlink(path);
      });
  };

}(this);

