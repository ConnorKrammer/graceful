/**
 * graceful-dialog
 *
 * Defines the Dialog namespace, responsible for creating user
 * prompts and notifications. Wraps the Vex library.
 *
 * Requires: none
 */


!function(global) {
  'use strict';

  // Vex configuration.
  vex.defaultOptions.className = 'vex-theme-os';

/* =======================================================
 *                        Dialog
 * ======================================================= */

  // Define the Dialog namespace.
  function Dialog() {}

  /**
   * Opens a dialog with the configured options.
   *
   * @param {Object} options - An options object.
   */
  Dialog.open = function(options) {
    vec.dialog.open(options);
  };

  /**
   * Opens an alert with the given message.
   *
   * @param {String|Object} options - An options object, or a string to display to the user.
   */
  Dialog.alert = function(options) {
    vex.dialog.alert(options);
  };

  /**
   * Prompts the user for input.
   *
   * @param {Object} options - An options object.
   */
  Dialog.prompt = function(options) {
    vex.dialog.prompt(options);
  };

  /**
   * Asks the user to confirm an action.
   *
   * @param {Object} options - An options object.
   */
  Dialog.confirm = function(options) {
    vex.dialog.confirm(options);
  };

/* =======================================================
 *                        Exports
 * ======================================================= */

  global.Dialog = Dialog;
}(this);

