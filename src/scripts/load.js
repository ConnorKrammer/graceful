/**
 * Loads all the required javascript and css files. This includes 3rd-party
 * libraries, as well as core extensions. When all this is finished, it also
 * loads main.js to finish initialization of the application.
 */

!function(global) {
  'use strict';

  var graceful = new Graceful();
  global.graceful = graceful;

  // Order here matters. Extensions depending
  // on others should be loaded later.
  graceful.coreExtensions = [
    'utils',
    'filesystem',
    'editor',
    'minimap'
  ];

  // Helper to resolve extension folder names into full paths.
  function getExtensionFiles(extensions, prefix) {
    return _.map(extensions, function(extension) {
      return prefix + extension + '/load.js';
    });
  }

  // Load base libraries and setup the editor.
  yepnope({
    load: [
      graceful.vendorDirectory + 'jquery/jquery.min.js',
      graceful.vendorDirectory + 'lodash/dist/lodash.min.js',
      graceful.vendorDirectory + 'Keypress/keypress.js',
      graceful.vendorDirectory + 'q/q.js',
      graceful.vendorDirectory + 'JSON-js/cycle.js',
      graceful.vendorDirectory + 'pouchdb/pouchdb-nightly.min.js',
      graceful.vendorDirectory + 'observable/lib/observable.js'
    ],
    complete: function() {
      var coreDirectory = graceful.coreExtensionDirectory;
      var userDirectory = graceful.userExtensionDirectory;
      var files;

      /**
       * Because yepnope requires function calls to be nested, in this situation we
       * end up with a rapidly-expanding pyramid of callbacks. I've flattened this into
       * a chain of functions for readability's (and sanity's) sake:
       *
       *   loadExtensions -> loadCoreExtensionFiles -> getUserExtensionFiles -> loadUserExtensionFiles
       *
       * And after that it's (thankfully) done.
       *
       * This kind of scenario is, by the way, why the Q promise library is included.
       */

      // Gets all the files required by core extensions.
      function loadExtensions() {
        files = getExtensionFiles(graceful.coreExtensions, coreDirectory);

        yepnope({
          load: files, 
          complete: loadCoreExtensionFiles
        });
      }

      // Load in the core extension files, plus the main and config files.
      function loadCoreExtensionFiles() {
        yepnope({
          load: graceful.loader.files.concat([graceful.mainFile, graceful.configFile]),
          complete: getUserExtensionFiles
        });
      }

      // Gets all the files required by user extensions.
      function getUserExtensionFiles() {
        // Clear the loader for the user extensions.
        graceful.loader.clear();

        files = getExtensionFiles(graceful.userExtensions, userDirectory);

        yepnope({
          load: files, 
          complete: loadUserExtensionFiles
        });
      }

      // Load in the user extension files then tell graceful
      // loading is complete.
      function loadUserExtensionFiles() {
        yepnope({
          load: graceful.loader.files,
          complete: graceful.loadComplete
        });
      }

      // Start off the chain.
      loadExtensions();
    }
  });
}(this);

