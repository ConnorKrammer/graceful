/**
 * Defines the Graceful class.
 */

!function(global) {
  'use strict';

  /**
   * Graceful constructor.
   *
   * This is the main application object.
   *
   * @return {object} The constructed Graceful instance.
   */
  function Graceful() {
    var self = this;

    // These are all relative to the index.html file.
    this.vendorDirectory        = './vendor/';
    this.scriptDirectory        = './scripts/';
    this.extensionDirectory     = './extensions/';
    this.userExtensionDirectory = this.extensionDirectory + 'user/';
    this.coreExtensionDirectory = this.extensionDirectory + 'core/';
    this.mainFile               = this.scriptDirectory + 'main.js';
    this.configFile             = './user.config.js';

    // For loading extensions in the user config file.
    this.userExtensions = [];
    this.coreExtensions = [];

    // Array of functions to call upon load.
    this.onLoadListeners = [];
    this.isLoaded = false;

    // Helper object that allows extensions to set which files to load.
    this.loader = {
      files: [],
      loadExtension: function(files) {
        var fileList = [].concat(files);
        fileList = _.map(fileList, function(file) {
          return self.extensionDirectory + file;
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
   * Delay execution of the given function until after
   * the application has finished intializing.
   */
  Graceful.prototype.onLoad = function(func) {
    if (this.isLoaded) {
      func();
    } else {
      this.onLoadListeners.push(func);
    }
  };

  /**
   * Execute all the pending onLoad listeners.
   */
  Graceful.prototype.loadComplete = function() {
    _.forEach(this.onLoadListeners, function(func) {
      func();
    });

    // Clear the listeners and set the isLoaded flag.
    this.onLoadListeners = [];
    this.isLoaded = true;
  };

  global.Graceful = Graceful;
}(this);

