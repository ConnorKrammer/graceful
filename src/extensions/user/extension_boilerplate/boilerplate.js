/**
 * extension name
 *
 * Add your description here, list any dependencies (nice, but not
 * required), and maybe link to your GitHub repo.
 *
 * Note that you have access to all core extensions, as well as the
 * fully initialized graceful object. For more information, you might
 * want to look at the scripts/load.js file.
 *
 * Also, do take a look at how the core extensions are implemented,
 * if you'd like more information than listed below.
 */

!function(global) {
  'use strict';

  /**
   * Two ways to do things...
   * Just kidding, you can do whatever you want.
   * But I'm still going to show you two...
   */
  
/* =======================================================
 *                 Extension (namespace)
 *
 * Doing it this way is useful for when your extension
 * acts like a library to other extensions (including your
 * own). You are never meant to instantiate an instance.
 * ======================================================= */

  function Extension() {}

  Extension.log = function() {
    console.log("I'm an extension!");
    console.log("I am dependent on: " + dependency);
    console.log("This is now undefined: " + global.dependency);
  };

/* =======================================================
 *                   Extension (class)
 *
 * This method is meant for when you actually want
 * instances of your class to exist. Example usage would
 * be to create a new Editor pane type.
 * ======================================================= */

  function Extension_2() {
    console.log('Creating a new Extension_2 instance!');
    return this;
  };

  Extension_2.prototype.log = function() {
    console.log("I'm an extension instance!");
    console.log("I am dependent on: " + dependency);
    console.log("This is now undefined: " + global.dependency);
  };

/* =======================================================
 *                        Exports
 *
 * Here you can export global variables. You don't have to
 * export everything you define (that's exactly why the
 * extension exists in a restricted scope), and you don't
 * have to keep the names the same (though that would make
 * the most sense).
 *
 * It's recommended that you check for namespace conflicts
 * before exporting anything.
 * ======================================================= */

  if (typeof global.Extension === undefined || typeof global.Extension_2 === undefined) {
    throw new Error('Extension already exists.');
  }

  global.Extension   = Extension;
  global.Extension_2 = Extension_2;
}(this);

