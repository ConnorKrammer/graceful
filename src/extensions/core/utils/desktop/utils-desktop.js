/**
 * graceful-utils
 */


!function(global) {
  'use strict';

  /**
   * Maps application shell errors codes to more descriptive error messages.
   *
   * @param {integer} The error code returned.
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
}(this);

