/**
 * This file runs all final initialization for the graceful object. By the time
 * this file loads, all of the core extensions have initialized, but none of the
 * user extensions have.
 */

!function(global) {
  'use strict';

  // Set up the global graceful object.
  graceful.editor = new Editor();
  graceful.editor.init();
}(this);
