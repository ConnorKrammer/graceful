/**
 * graceful-dialog
 *
 * Defines the Dialog namespace, responsible for creating user
 * prompts and notifications. Wraps the Vex library, and extends it slightly.
 *
 * Requires: none
 */


!function(global) {
  'use strict';

  // Vex configuration.
  vex.defaultOptions.className = 'vex-theme-graceful';

/* =======================================================
 *                        Dialog
 * ======================================================= */

  // Define the Dialog namespace.
  function Dialog() {}

  /**
   * Opens a dialog with the configured options.
   *
   * @param {Object} [options] - An options object.
   */
  Dialog.open = function(options) {
    vec.dialog.open(options);
  };

  /**
   * Opens an alert with the given message.
   *
   * @param {String|Object} [options] - An options object, or a string to display to the user.
   */
  Dialog.alert = function(options) {
    options = options || {};

    if (options.title) {
      options.message = '<h1>' + options.title + '</h1>' + options.message;
    }

    vex.dialog.alert(options);
  };

  /**
   * Prompts the user for input.
   *
   * @param {Object} [options] - An options object.
   */
  Dialog.prompt = function(options) {
    options = options || {};

    if (options.title) {
      options.message = '<h1>' + options.title + '</h1>' + options.message;
    }

    vex.dialog.prompt(options);
  };

  /**
   * Asks the user to confirm an action.
   *
   * @param {Object} [options] - An options object.
   */
  Dialog.confirm = function(options) {
    options = options || {};

    if (options.title) {
      options.message = '<h1>' + options.title + '</h1>' + options.message;
    }

    vex.dialog.confirm(options);
  };

/* =======================================================
 *                        Exports
 * ======================================================= */

  global.Dialog = Dialog;
}(this);

