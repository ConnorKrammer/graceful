/**
 * This is the user configuration file. Here you can set certain configuration values
 * on the global graceful object.
 *
 * Since you also have access to the core extensions and all loaded vendor code, you
 * can also extend graceful's functionality from this file. However, while trivial feature
 * additions are fine here, it's best if you instead make them into extensions. Just copy
 * the extension-boilerplate directory (found in the user extensions folder) and get coding.
 *
 * Note that *preferences* should be set in user.preferences.json.
 *
 * @todo Move command definitions out of this file.
 */

'use strict';

/** 
 * Define extensions to load from the extensions/user directory 
 * by specifying their folder names here.
 *
 * @todo Consider moving the user extensions into a preference. This
 *       would eliminate the need to wrap everything in an onLoad() call
 *       (and would actually deprecate the onLoad() function).
 */
graceful.userExtensions = [

];

/**
 * While all the core functions are loaded before this file, it's best to wrap
 * things in an onLoad() call to ensure that everything is available. This is 
 * necessary for user extensions.
 */
graceful.onLoad(function() {

  /**
   * Link the current pane to the specified pane. (Determined by index.)
   *
   * @todo Allow a more intuitive way to specify the linked pane.
   *
   * @param {Integer) paneNumber - The index of the pane to create the link with.
   */
  graceful.editor.defineCommand('link', 1, function(paneNumber) {
    paneNumber = parseInt(paneNumber, 10);
    graceful.editor.getFocusPane().linkToPane(graceful.editor.panes[paneNumber]);
  });

  /**
   * Add a split pane to the editor.
   *
   * @param {String} direction - The direction to make the split in.
   * @param {String} type - The type of pane to add.
   * @param {Boolean} duplicate - Whether to link the new pane to
   *        the pane executing the command.
   * @return {Promise} A promise for the split.
   */
  function addSplit(direction, type, duplicate) {
    type = type.toLowerCase();

    // Set pane type.
    if      (type === 'input')   type = Editor.InputPane;
    else if (type === 'preview') type = Editor.PreviewPane;
    else                         type = Editor.InputPane;

    // Add the pane.
    var deferred  = Q.defer();
    var focusPane = graceful.editor.getFocusPane();
    var buffer    = duplicate ? focusPane.buffer : new Editor.Buffer();
    var pane      = graceful.editor.addPane(type, buffer, direction, focusPane);
    var property  = direction === 'vertical' ? 'height' : 'width';

    // Allow the transition to finish before subsequent commands can start.
    focusPane.wrapper.addEventListener('transitionend', function endListener(event) {
      if (event.propertyName === property) {
        deferred.resolve();
        focusPane.wrapper.removeEventListener('transitionend', endListener);
      }
    });

    return deferred.promise;
  }

  /**
   * Open up a new horizontal split pane.
   *
   * @param {String} type - The type of pane to add.
   * @param {Boolean} duplicate - Whether to link the new pane to
   *        the pane executing the command.
   * @return {Promise} A promise for the split.
   */
  graceful.editor.defineCommand('split_h', 2, function(type, duplicate) {
    return addSplit('horizontal', type, duplicate);
  });

  /**
   * Open up a new vertical split pane.
   *
   * @param {String} type - The type of pane to add.
   * @param {Boolean} duplicate - Whether to link the new pane to
   *        the pane executing the command.
   * @return {Promise} A promise for the split.
   */
  graceful.editor.defineCommand('split_v', 2, function(type, duplicate) {
    return addSplit('vertical', type, duplicate);
  });

  /**
   * Open up the Chrome developer tools in a new window.
   */
  graceful.editor.defineCommand('dev', 0, function() {
    appshell.app.showDeveloperTools();
  });

  /**
   * Completely shuts down the application.
   * If the debug window is open, it will be closed as well.
   *
   * @todo Prompt user to save changes before closing.
   */
  graceful.editor.defineCommand('quit', 0, function() {
    appshell.app.closeLiveBrowser();
    appshell.app.quit();
  });
  
  /**
   * Closes the focused pane.
   */
  graceful.editor.defineCommand('close', 0, function() {
    var focusPane = graceful.editor.getFocusPane();
    graceful.editor.removePane(focusPane);
  });

  /**
   * Define an open command.
   * 
   * When calling this command on a pane that is linked to another pane,
   * the link will be broken. This is due to the one-way nature of the link.
   *
   * @param {String} path - The path to open. If not specified,
   *        the user will be prompted to choose a destination. If
   *        the buffer has a filepath associated with it, the path
   *        will default to that.
   *
   * @return {Promise} A promise for the open operation.
   */
  graceful.editor.defineCommand('open', 1, function(path) {
    var focusPane  = graceful.editor.getFocusPane();
    var buffer     = focusPane.buffer;
    var firstChars;

    // Make non-absolute filepaths relative to the buffer's filepath.
    if (buffer.filepath) {
      path       = path || './';
      firstChars = path.substr(0, 3);

      if (path.indexOf('/') === -1 && path.indexOf('\\') === -1) {
        path = './' + path;
      }

      if (firstChars === '../' || firstChars === '..\\') {
        path = './' + path;
      }

      firstChars = path.substr(0, 2);

      if (firstChars === './' || firstChars === '.\\') {
        path = buffer.filepath.substr(0, buffer.filepath.lastIndexOf(buffer.title))
             + path.substr(2);
      }
    }

    return FileSystem.pathType(path)
      .then(function(type) {
        if (type === 'file') {
          // If it's an existing file, open it.
          return FileSystem.readFile(path)
            .then(function(contents) {
              focusPane.switchBuffer(new Editor.Buffer(contents, path), true);
            });
        }
        else if (type === 'directory') {
          // If it's an existing directory, start the open dialogue there.
          return FileSystem.showOpenDialog(null, path)
            .then(function(selection) {
              return FileSystem.readFile(selection)
                .then(function(contents) {
                  focusPane.switchBuffer(new Editor.Buffer(contents, selection), true);
                });
            })
        }
        else if (!type || !path) {
          // If there is no path, start the open dialogue at the last used location.
          return FileSystem.showOpenDialog()
            .then(function(selection) {
              return FileSystem.readFile(selection)
                .then(function(contents) {
                  focusPane.switchBuffer(new Editor.Buffer(contents, selection), true);
                });
            });
        }
      });
  });

  /**
   * Define a save command.
   *
   * @param {String} path - The path to save to. If not specified,
   *        the user will be prompted to choose a destination. If
   *        the buffer has a filepath associated with it, the path
   *        will default to that.
   *
   * @return {Promise} A promise for the save operation.
   */
  graceful.editor.defineCommand('save', 1, function(path) {
    var focusPane  = graceful.editor.getFocusPane();
    var buffer     = focusPane.buffer;
    var firstChars = path.substr(0, 2);
    var lastChar   = path.substr(-1);

    // Make non-absolute filepaths relative to the buffer's filepath.
    if (buffer.filepath) {
      path       = path || './';
      firstChars = path.substr(0, 3);

      if (path.indexOf('/') === -1 && path.indexOf('\\') === -1) {
        path = './' + path;
      }

      if (firstChars === '../' || firstChars === '..\\') {
        path = './' + path;
      }

      firstChars = path.substr(0, 2);

      if (firstChars === './' || firstChars === '.\\') {
        path = buffer.filepath.substr(0, buffer.filepath.lastIndexOf(buffer.title))
             + path.substr(2);
      }
    }

    return FileSystem.pathType(path)
      .then(function(type) {
        if (type === 'file') {
          // If it's an existing file, overwrite it.
          return FileSystem.writeFile(path, buffer.text)
            .then(function() {
              buffer.filepath = path;
            });
        }
        else if (type === 'directory') {
          // If it's an existing directory, open the save dialogue there.
          return FileSystem.showSaveDialogue(null, path, buffer.title)
            .then(function(selection) {
              return FileSystem.writeFile(selection, buffer.text)
                .then(function() {
                  buffer.filepath = selection;
                });
            });
        }
        else if (!type && path && (lastChar === '/' || lastChar === '\\')) {
          // If it's an uncreated directory, create it. If the user cancels, delete it again.
          return FileSystem.makeDirectory(path)
            .then(function() {
              FileSystem.showSaveDialogue(null, path, buffer.title)
                .then(function(selection) {
                  return FileSystem.writeFile(selection, buffer.text)
                    .then(function() {
                      buffer.filepath = selection;
                    });
                })
                .fail(function(error) {
                  FileSystem.unlink(path);
                });
            });
        }
        else if (!type && path) {
          // If an uncreated file is specified, recursively create the filepath and save it.
          return FileSystem.writeFileRecursive(path, buffer.text);
        }
        else if (!path && buffer.filepath) {
          // If no path was specified but the buffer is associated with a filepath, save it there.
          return FileSystem.writeFile(buffer.filepath, buffer.text);
        }
        else if (!path) {
          // If no path is specified, open the save dialogue at the last used location.
          return FileSystem.showSaveDialogue(null, null, buffer.title)
            .then(function(selection) {
              return FileSystem.writeFile(selection, buffer.text)
                .then(function() {
                  buffer.filepath = selection;
                });
            });
        }
      });
  });
});

