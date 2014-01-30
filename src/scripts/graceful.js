/**
 * graceful
 *
 * Defines the Graceful class, a representation of the Graceful application.
 * Note that this barely does anything by itself except expose some loading
 * functionality. The entire app is built on the concept of extensions.
 */

!function(global) {
  'use strict';

  /**
   * The Graceful class.
   *
   * This is the main application object.
   *
   * @constructor
   * @return {object} The constructed Graceful instance.
   */
  function Graceful() {
    var _this = this;

    // These are all relative to the index.html file.
    this.vendorDirectory        = './vendor/';
    this.scriptDirectory        = './scripts/';
    this.extensionDirectory     = './extensions/';
    this.coreExtensionDirectory = this.extensionDirectory + 'core/';
    this.userExtensionDirectory = this.extensionDirectory + 'user/';
    this.mainFile               = this.scriptDirectory + 'main.js';
    this.configFile             = './user.config.js';

    // For loading extensions.
    this.userExtensions = [];
    this.coreExtensions = [];
    this.coreLibraries  = [];

    // Loading variables.
    this.onLoadListeners = [];
    this.isLoaded = false;

    // Define a helper object that allows extensions to set which files to load.
    this.loader = {
      files: [],
      loadExtension: function(files) {
        var fileList = [].concat(files);
        fileList = _.map(fileList, function(file) {
          return _this.extensionDirectory + file;
        });

        this.files = this.files.concat(fileList);
      },
      clear: function() {
        this.files = [];
      }
    };

    return this;
  }

  /**
   * Delays execution of the given function until after the application
   * has finished intializing. If used after graceful has successfully
   * initialized, the function will be called immediately.
   *
   * @param {Function} func - The function to delay.
   */
  Graceful.prototype.onLoad = function(func) {
    if (this.isLoaded) {
      func();
    } else {
      this.onLoadListeners.push(func);
    }
  };

  /**
   * Execute all the pending onLoad listeners and flag the application
   * as having loaded.
   */
  Graceful.prototype.loadComplete = function() {
    _.forEach(this.onLoadListeners, function(func) {
      func();
    });

    // Clear the listeners and set the isLoaded flag.
    this.onLoadListeners = [];
    this.isLoaded = true;
  };

  // Expose globals.
  global.Graceful = Graceful;
}(this);

