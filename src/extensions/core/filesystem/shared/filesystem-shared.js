/**
 * graceful-filesystem
 *
 * Adds the FileSystem object to the global namespace, responsible for all filesystem-related
 * methods and operations.
 *
 * In the desktop version, the OS filesystem is accessed through the application shell, while
 * in the webapp version it is emulated through PouchDB data storage.
 *
 * Note that for reading and writing files in the desktop version, only UTF-8 is supported.
 *
 * Note the use of the javascript promise library, q, for asynchronous code.
 * See here (https://github.com/kriskowal/q) for more on understanding async promises.
 */


!function(global) {
  'use strict';

  function FileSystem() {}

  /**
   * These are all implemented differently in the desktop and webapp versions,
   * but the common interface is shown here. There are slight differences between
   * the desktop and webapp versions of each function, but when called in your code
   * they are guaranteed to behave the same. 
   * 
   * Differences in webapp vs. desktop:
   *
   *   writeFileRecursive() just calls writeFile(),
   *   moveToTrash() and unlink() do the same thing,
   *   chmod() is not needed and just returns immediately.
   *
   * Common interface:
   *
   *   FileSystem.readFile           = function(path) {};
   *   FileSystem.writeFile          = function(path, data) {};
   *   FileSystem.writeFileRecursive = function(path, data) {};
   *   FileSystem.makeDirectory      = function(path) {};
   *   FileSystem.fileExists         = function(path) {};
   *   FileSystem.moveToTrash        = function(path) {};
   *   FileSystem.unlink             = function(path) {};
   *   FileSystem.copyFile           = function(source, destination) {};
   *   FileSystem.chmod              = function(path, mode) {};
   *   FileSystem.rename             = function(path, newPath) {};
  */

  // Expose globals.
  global.FileSystem = FileSystem;
}(this);

