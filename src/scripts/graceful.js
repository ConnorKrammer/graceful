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

    // Check run mode by testing for the desktop shell's global variable.
    this.mode = (typeof appshell !== 'undefined') ? 'desktop' : 'webapp';

    // Array of functions to call upon load.
    this.onLoadListeners = [];
    this.isLoaded = false;

    // Helper object that allows extensions to set which files to load.
    this.loader = {
      files: [],
      loadExtension: function(files) {
        var conditionalFiles = files[self.mode];
        var fileList = files.shared;

        if (fileList && conditionalFiles) {
          // So we can avoid all that string concatenation nonsense.
          fileList = [].concat(fileList).concat(conditionalFiles);
        }
        else if (fileList || conditionalFiles) {
          fileList = [].concat(fileList || conditionalFiles);
        }
        else {
          return;
        }

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

  global.Graceful = Graceful;
}(this);

