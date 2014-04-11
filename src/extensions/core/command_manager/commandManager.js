/**
 * graceful-command_manager
 *
 * Acts as a global event handler for the graceful application.
 *
 * Based upon the Brackets command manager:
 *   https://github.com/adobe/brackets/blob/master/src/command/CommandManager.js
 */


!function(global) {
  'use strict';

  var commands = {};

  var noop = new Command('', function() {
    var deferred = Q.defer();
    deferred.reject();
    return deferred.promise;
  });

/* =======================================================
 *                       Command
 * ======================================================= */

  /**
   * The Command class.
   *
   * This class is used by CommandManager to execute application-level
   * global commands.
   *
   * @constructor
   * @param {String} id - A unique identifier for the command.
   * @param {Function} func - The function to associate with the command.
   */
  function Command(id, func) {
    this.id = id;
    this.func = func;

    return this;
  }

  /**
   * Executes the command. Arguments will be passed on the command function.
   *
   * @return {Promise} A promise that will resolve when the command completes.
   */
  Command.prototype.execute = function() {
    var result = this.func.apply(this, arguments);
    var deferred;

    if (!result) {
      deferred = Q.defer();
      deferred.resolve();
      return deferred.promise;
    }

    return result;
  };

/* =======================================================
 *                    Command Manager
 * ======================================================= */

  // The CommandManager.
  var CommandManager = new Observable();

  /**
   * Registers a command.
   *
   * @param {String} id - A unique identifier for the command.
   * @param {Function} func - The function to associate with the command.
   * @return {Command|false} The created command object, or false if it could not be created.
   */
  CommandManager.register = function(id, func) {
    if (!id) {
      console.log('Cannot register a command without a valid id.');
      return false;
    }
    if (!func) {
      console.log('Cannot register command with it "' + id + '" without a command function.');
      return false;
    }
    if (commands[id]) {
      console.log('Cannot register command with id "' + id + '". It has already been registered.');
      return false;
    }
   
    return (commands[id] = new Command(id, func));
  };

  /**
   * Executes the command with the given id. Additional arguments will be passed
   * on to the command function.
   *
   * @param {String} id - The command id.
   * @return {Promise} A promise that will resolve when the command completes.
   */
  CommandManager.execute = function(id) {
    var command = commands[id] || noop;
    var args    = Array.prototype.slice.call(arguments, 1);

    this.trigger('beforeExecuteCommand', id);

    return command.execute.apply(command, args);
  };

/* =======================================================
 *                        Exports
 * ======================================================= */

  global.CommandManager = CommandManager;
}(this);

