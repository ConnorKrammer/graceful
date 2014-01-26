/**
 * This file runs all final initialization for graceful.
 */


!function(global) {
  'use strict';

  // Set up the global graceful object.
  graceful.editor = new Editor().init();

  // Execute all the graceful onLoad listeners.
  _.forEach(graceful.onLoadListeners, function(func) {
    func();
  });

  // Clear the listeners and set the isLoaded flag.
  graceful.onLoadListeners = [];
  graceful.isLoaded = true;
}(this);

