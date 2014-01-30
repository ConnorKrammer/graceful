/**
 * Loads all the components of the graceful application.
 *
 * Loading order is as follows:
 *   + Core libraries, such as Lo-Dash and Q.
 *   + Core extensions.
 *     - First, the load.js files are loaded and the paths
 *       for the needed files stored.
 *     - Then those files are loaded by yepnope.
 *   + main.js is loaded, along with user.config.js.
 *   + Finally, user extensions are loaded.
 *     - First, the load.js files are loaded and the paths for
 *       the needed files stored. (Exactly like core extensions.)
 *     - Then those files are loaded by yepnope.
 *
 * Note that yepnope loads things asynchronously, but *does* preserve load order.
 *
 * Below is an example of the great power of promises. Without them, yepnope's
 * loading looks like hell--the 'complete' callbacks end up nested 7(!!!) deep.
 */

!function(global) {
  'use strict';

  // Start Graceful!
  var graceful = global.graceful = new Graceful();

  graceful.coreLibraries = [
    'lodash/dist/lodash.min.js',
    'q/q.js',
    'observable/lib/observable.js'
  ];

  graceful.coreExtensions = [
    'utils',
    'filesystem',
    'editor',
    'minimap'
  ];

  var libs = buildFilepath(graceful.coreLibraries, graceful.vendorDirectory);
  var core = buildFilepath(graceful.coreExtensions, graceful.coreExtensionDirectory, '/load.js');
  var user;

  yepnope({
    load: libs,
    complete: function() {
      loadAsync(core)
        .then(function() {
          return loadAsync(core);
        })
        .then(function() {
          return loadAsync(graceful.loader.files);
        })
        .then(function() {
          graceful.loader.clear();
          return loadAsync([graceful.mainFile, graceful.configFile]);
        })
        .then(function() {
          user = buildFilepath(graceful.userExtensions, graceful.userExtensionDirectory, '/load.js');
          return loadAsync(user);
        })
        .then(function() {
          return loadAsync(graceful.loader.files);
        })
        .then(function() {
          graceful.loader.clear();
          graceful.loadComplete();
        });
    }
  });

  /**
   * Prefixes a list of files with the given string and returns
   * the resulting array. Can optionally append a suffix.
   *
   * @param {String[]} files - The files to prefix.
   * @param {string} prefix - The prefix.
   * @param {string} [suffix] - An optional suffix.
   * @return {String[]} An array of the newly mapped strings.
   */
  function buildFilepath(files, prefix, suffix) {
    var mapped = [];
    suffix = suffix || '';

    for (var i = 0; i < files.length; i++) {
      mapped[i] = prefix + files[i] + suffix;
    }

    return mapped;
  }

  /**
   * Allows chaining together calls to yepnope.
   * 
   * Can only be called after the Q library has loaded.
   *
   * @param {String|String[]} files - The files to load.
   * @return {Promise} A promise for the operation's completion.
   */
  function loadAsync(files) {
    var deferred = Q.defer();

    // Load the files and resolve the promise when done.
    yepnope({
      load: files,
      complete: function() { deferred.resolve(); }
    });

    // Continue, even if there's nothing to load.
    if (!files.length) deferred.resolve();

    // Return the promise.
    return deferred.promise;
  }
}(this);

