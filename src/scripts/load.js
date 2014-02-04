/**
 * Loads all the components of the graceful application.
 *
 * Loading order is as follows:
 *   + Core libraries, such as Lo-Dash and Q.
 *   + Core extensions.
 *     - First, the load.js files are loaded, and the paths
 *       for the needed files stored.
 *     - Then those files are loaded using yepnope.
 *   + main.js is loaded.
 *   + User extensions are loaded based on the user preference file.
 *     - First, the load.js files are loaded, and the paths for
 *       the needed files stored. (Exactly like core extensions.)
 *     - Then those files are loaded using yepnope.
 *   + Finally, user.config.js is loaded.
 *
 * Note that yepnope loads things asynchronously, but *does* preserve load order.
 *
 * If an extension requires some (asynchronous) setup before it can be used,
 * loading is paused until after that extension has finished setup.
 *
 * Below is an example of the great power of promises. Without them, yepnope's
 * loading would look like [callback hell](http://callbackhell.com/).
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
    'preferences',
    'editor',
    'minimap'
  ];

  var loader = graceful.loader;
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
          return loadAndWait(loader.files);
        })
        .then(function() {
          return loadAsync(graceful.mainFile);
        })
        .then(function() {
          graceful.userExtensions = Preferences.get('extensions.userExtensions') || '';
          user = buildFilepath(graceful.userExtensions, graceful.userExtensionDirectory, '/load.js');
          return loadAsync(user);
        })
        .then(function() {
          return loadAndWait(loader.files);
        })
        .then(function() {
          return loadAsync(graceful.configFile);
        })
        .then(function() {
          graceful.loadComplete();
        })
        .fail(function(error) {
          Utils.printFormattedError('Loading failed with error:', error);
        });
    }
  });

  /**
   * Prefixes a list of files with the given string and returns
   * the resulting array. Can optionally append a suffix.
   *
   * @param {String[]} files - The files to prefix.
   * @param {String} prefix - The prefix.
   * @param {String} [suffix] - An optional suffix.
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
   * @return {Promise} A promise that the files were loaded.
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

  /**
   * Takes the graceful loader object and reduces the files to
   * load down into a single promise. This is necessary in case
   * an asynchronous function needs to be executed before loading
   * should continue.
   *
   * Several groups of files may be bundled together as long as there
   * is no function in between to break them up. This allows as many
   * files as possible to load at the same time.
   *
   * Note that load order is preserved in all cases.
   *
   * @param {Object[]} collection - A collection of file/function pairs.
   * @param {String[]} collection.files - The files to iterate over.
   * @param {Function} [collection.func] - A promise-returning callback.
   * @return {Promise} A promise that the files were loaded.
   */
  function loadAndWait(collection) {
    var stored, chain, next;

    /**
     * Simply wraps a call to loadAsync() and then
     * executes the given function.
     *
     * @param {String|String[]} files - The files to load.
     * @param {Function} func - A function to execute after load.
     * @return {Promise} A promise that the files were loaded.
     */
    function load(files, func) {
      return loadAsync(files).then(func);
    }

    // Starting values.
    stored = [];
    chain = Q();

    // Reduce the files down into a promise.
    while (collection.length > 0) {
      next = collection.shift();
      stored = stored.concat(next.files);
      
      // If there's no function to wait on, just keep bundling the files.
      if (typeof next.func !== 'function') continue;

      // Load all the batched files, binding the correct values.
      chain  = chain.then(load.bind(null, stored, next.func));
      stored = [];
    }

    // Load any leftover batched files, and return.
    return chain.then(function() { return loadAsync(stored); });
  }
}(this);

