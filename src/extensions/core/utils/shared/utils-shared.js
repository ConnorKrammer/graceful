/**
 * graceful-utils
 *
 * Adds the Utils object to the global namespace, responsible for general-purpose
 * functions that don't fit better in another core extension.
 */


!function(global) {
  'use strict';

  /**
   * Define the Utils namespace.
   */
  function Utils() {}

  // Expose globals.
  global.Utils = Utils;
}(this);

