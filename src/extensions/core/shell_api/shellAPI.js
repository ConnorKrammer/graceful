/**
 * graceful-shell_api
 *
 * Allows Graceful to receive messages from the native shell.
 * Basically, the shell looks for the existence of a shellAPI object on
 * the appshell instance, and if found uses it to send messages to the app.
 *
 * This is based upon the Brackets shell API found here:
 * https://github.com/adobe/brackets/blob/0f196f37753429c2061d7168b810835d64fce5f7/src/utils/ShellAPI.js
 *
 * Also see here for the native-side implementation:
 * https://github.com/adobe/brackets-shell/blob/c4d8fb753d386ee77ffc35b29920cf4a6913dee3/appshell/client_handler.cpp
 */

!function(global) {
  'use strict';

/* =======================================================
 *                      Shell API
 * ======================================================= */

  // Define the ShellAPI namespace.
  var ShellAPI = {};

  /**
   * Relays a command from the application shell to the rest
   * of the application, then notifies the application of
   * whether the command should proceed.
   *
   * @param {String} id - The id of the command.
   * @return {Boolean} True if the command should be cancelled at the
   *                   application level.
   */
  ShellAPI.executeCommand = function(id) {
    var promise = CommandManager.execute(id);
    return !(promise && promise.isRejected());
  };

/* =======================================================
 *                        Exports
 * ======================================================= */

  global.appshell.shellAPI = ShellAPI;
}(this);

