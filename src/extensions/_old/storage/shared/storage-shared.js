/**
 * graceful-storage
 *
 * Adds the Storage global namespace, responsible for wrapping commonly-used
 * PouchDB functions with promise capability.
 *
 * Note the use of the javascript promise library, q, for asynchronous code.
 * See here (https://github.com/kriskowal/q) for more on understanding async promises.
 */


!function(global) {
  'use strict';

  // We need this for Storage.databaseExists() to work.
  PouchDB.enableAllDbs = true;

  function Storage() {}

  /**
   * Returns a list of all created databases.
   *
   * @return {promise} A promise that will return a list of all databases.
   */
  Storage.getDatabaseList = function() {
    var deferred = Q.defer();
 
    PouchDB.allDbs(function(error, response) {
      if (error) {
        deferred.reject(error);
      } else {
        deferred.resolve(response);
      }
    });
 
    return deferred.promise;
  };

  /**
   * Utility function to check if a database exists with the given
   * name.
   *
   * @param {string} name The name of the database to check for.
   * @return {promise} A promise resolving to true if the database exists, else false.
   */
  Storage.databaseExists = function(name) {
    return Storage.getDatabaseList()
      .then(function(list) {
        return _.contains(list, name);
      });
  };

  /**
   * Returns the specified database.
   *
   * @param {string} name The name of the database.
   * @return {promise} A promise for the given database.
   */
  Storage.getDatabase = function(name) {
    var deferred = Q.defer();

    PouchDB(name, function(error, database) {
      if (error) {
        deferred.reject(error);
      } else {
        deferred.resolve(database);
      }
    });

    return deferred.promise;
  };

  /**
   * Destroys the specified database.
   *
   * @param {string} name The name of the database.
   * @return {promise} A promise returning information about the deletion.
   */
  Storage.destroyDatabase = function(name) {
    var deferred = Q.defer();

    PouchDB.destroy(name, function(error, response) {
      if (error) {
        deferred.reject(error);
      } else {
        deferred.resolve(response);
      }
    });

    return deferred.promise;
  };

  /**
   * Syncs the states of two databases. CouchDB databases are allowed.
   *
   * The source database does not need to be remote (ie. a CouchDB database), and the
   * target database need not be local. The databases will be synced from source to
   * target, no matter where they are located.
   *
   * Options specified should be in an object. The following properties are allowed:
   *
   *   filter:     {function} A filter function from a design document to selectively get updates.
   *   complete:   {function} A function to call when all changes have been processed.
   *   onChange:   {function} A function to call on each processed change.
   *   continuous: {boolean}  If true, starts subscribing to future changes in the source database and continue replicating them.
   *
   * @see http://pouchdb.com/api.html#replication (Unfortunately, the documentation is not terribly detailed.)
   *
   * @param {string} source String representing the source database.
   * @param {string} target String representing the target database.
   * @param {object} options Replication options.
   * @return {promise} A promise returning the replication response.
   */
  Storage.syncDatabase = function(source, target, options) {
    var deferred = Q.defer();

    PouchDB.replicate(source, target, options, function(error, response) {
      if (error) {
        deferred.reject(error);
      } else {
        deferred.resolve(response);
      }
    });

    return deferred.promise;
  };

  /**
   * Returns the app's synced database.
   *
   * @return {promise} A promise for the synced database.
   */
  Storage.getSyncedDB = function() {
    return Storage.getDatabase('synced_db');
  };

  /**
   * Returns the app's local database.
   *
   * @return {promise} A promise for the local database.
   */
  Storage.getLocalDB = function() {
    return Storage.getDatabase('local_db');
  };

  // Expose globals.
  global.Storage = Storage;
}(this);

