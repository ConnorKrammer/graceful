/**
 * graceful-utils
 *
 * Adds the Utils object to the global namespace, responsible for general-purpose
 * functions that don't fit better in another core extension.
 *
 * @todo Refactor debugging utilities into their own extension.
 *
 * Requires: graceful-preferences
 */


!function(global) {
  'use strict';

/* =======================================================
 *                         Utils
 * ======================================================= */

  // Define the Utils namespace.
  function Utils() {}

  /**
   * Maps appshell errors codes to more descriptive error messages.
   *
   * @param {integer} errorCode - The error code returned.
   * @return {string} A message describing the error code.
   */
  Utils.getShellErrorMessage = function(errorCode) {
    switch (errorCode) {
      case appshell.fs.NO_ERROR:
      case appshell.app.NO_ERROR:
        return 'No error occurred.';
        break;
      case appshell.fs.ERR_UNKNOWN:
        return 'An unknown error occurred.';
        break;
      case appshell.fs.ERR_INVALID_PARAMS:
        return 'Invalid parameters passed.';
        break;
      case appshell.fs.ERR_NOT_FOUND:
        return 'The specified file or directory could not be found.';
        break;
      case appshell.fs.ERR_CANT_READ:
        return 'The specified file or directory could not be read.';
        break;
      case appshell.fs.ERR_UNSUPPORTED_ENCODING:
        return 'An unsupported encoding was used.';
        break;
      case appshell.fs.ERR_CANT_WRITE:
        return 'The specified file could not be written.';
        break;
      case appshell.fs.ERR_OUT_OF_SPACE:
        return 'The target directory is out of space. The file could not be written.';
        break;
      case appshell.fs.ERR_NOT_FILE:
        return 'The specified path does not point to a file.';
        break;
      case appshell.fs.ERR_NOT_DIRECTORY:
        return 'The specified path does not point to a directory.';
        break;
      case appshell.fs.ERR_FILE_EXISTS:
        return 'The specified file already exists.';
        break;
      case appshell.fs.ERR_BROWSER_NOT_INSTALLED:
        return 'The required browser is not installed.';
        break;
      case appshell.app.ERR_NODE_NOT_YET_STARTED:
        return 'The Node server has not yet launched. Try again in a second.';
        break;
      case appshell.app.ERR_NODE_PORT_NOT_YET_SET:
        return 'The Node server is in the process of launching but is not finished.';
        break;
      case appshell.app.ERR_NODE_FAILED:
        return 'The Node server encountered a fatal error while launching or running. It cannot be restarted.';
        break;
      default:
        return 'Invalid error code given.';
    }
  }

  /**
   * Controls whether debugging tools will print to the console.
   */
  Utils.DEBUG_ON = true;

  /**
   * Controls the verbosity of debugging tools.
   */
  Utils.DEBUG_VERBOSE = false;

  /**
   * Outputs an error message to the console, with the given
   * description in bold and the error message printed after
   * a newline.
   *
   * Will print a stack trace if DEBUG_VERBOSE is true.
   * Will not run if DEBUG_ON is set to false.
   *
   * @param {String} description - A description of what the error affects.
   * @param {Error} error - The error.
   */
  Utils.printFormattedError = function(description, error) {
    var message;

    if (this.DEBUG_ON) {
      message = this.DEBUG_VERBOSE ? error.stack : error.message;
      console.log('%c' + description + '\n%c' + message,
          'font-weight: bold;', 'font-weight: normal;');
    }
  };

  /**
   * Set default preferences and load in preferences.
   */
  graceful.onLoad(function() {
    Preferences.default('extensions.core.utils.debug', {
      enabled: true,
      verbose: false
    });

    Utils.DEBUG_VERBOSE = Preferences.get('extensions.core.utils.debug.enabled');
    Utils.DEBUG_VERBOSE = Preferences.get('extensions.core.utils.debug.verbose');
  });

/* =======================================================
 *                        Exports
 * ======================================================= */

  // Expose globals.
  global.Utils = Utils;
}(this);

