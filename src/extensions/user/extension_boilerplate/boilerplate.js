/**
 * <name>
 *   extension-boilerplate
 *
 * <description> 
 *   An extension starting point for developers.
 *
 * <required extensions>
 *   Requires: none
 *
 * @todo Consider asking developers to include an extension metadata file
 *       holding the above, as well as compatibility information (kind of
 *       like a bower.json file). This opens up interesting possibilities
 *       for automatic dependency downloads for a package manager, or
 *       alerting developers when their extensions break.
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

/* =======================================================
 *             Method #1 (The namespace method)
 *
 * Doing it this way is useful for when your extension
 * acts like a library to other extensions (including your
 * own). You are never meant to instantiate an instance.
 * ======================================================= */

  function Extension() {}

  Extension.log = function() {
    console.log("I'm an extension!");
  };

/* =======================================================
 *               Method #2 (The class method)
 *
 * This method is meant for when you actually want
 * instances of some class to exist. An example would be
 * to create a new Editor pane type.
 * ======================================================= */

  function Extension_2() {
    console.log('Creating a new Extension_2 instance!');
    return this;
  };

  Extension_2.prototype.log = function() {
    console.log("I'm an extension instance!");
  };

/* =======================================================
 *                       Preferences
 *
 * Now you can set any preferences that you like, assuming
 * that you need to set any at all. It's recommended that
 * if you do, you keep an object to track key names with
 * so that they are easy to reuse.
 * ======================================================= */

  // Preference keys.
  var prefKeys = {
    root:        'extensions.extension_boilerplate',
    examplePref: 'extensions.extension_boilerplate.examplePref',
    anotherPref: 'extensions.extension_boilerplate.anotherPref'
  };

  /**
   * We're not actually going to set anything, but here's what it'd look like:
   *
   *     // Set defaults.
   *     Preferences.default(prefKeys.examplePref, 'test value');
   *     Preferences.default(prefKeys.anotherPref, 'another value');
   *
   *     // Get value.
   *     Preferences.get(prefKeys.examplePref);
   *
   *     // Override default.
   *     Preferences.set(prefKeys.anotherPref, 'a new value');
   */

/* =======================================================
 *                        Exports
 *
 * Here you can export anything you want available in the
 * global scope. Try not to modify anything that already
 * exists unless you own it.
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

