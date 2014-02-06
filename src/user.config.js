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

!function(global) {
  'use strict';

/* =======================================================
 *              Feel free to edit below here.
 * ======================================================= */

  /**
   * Link the current pane to the specified pane. (Determined by index.)
   *
   * @todo Allow a more intuitive way to specify the linked pane.
   *
   * @param {Editor.Pane} pane - The pane to link.
   * @param {Integer) paneNumber - The index of the pane to create the link with.
   */
  graceful.editor.defineCommand('link', 1, function(pane, paneNumber) {
    paneNumber = parseInt(paneNumber, 10);
    pane.linkToPane(graceful.editor.panes[paneNumber]);
  });

  /**
   * Add a split pane to the editor.
   *
   * @param {Editor.Pane} pane - The pane to use for the command.
   * @param {String} direction - The direction to make the split in.
   * @param {String} type - The type of pane to add.
   * @param {Boolean} link - Whether to link the new pane to
   *        the pane executing the command.
   * @return {Promise} A promise for the split.
   */
  function addSplit(pane, direction, type, link) {
    type = type.toLowerCase();

    // Set pane type.
    if      (type === 'input')   type = Editor.InputPane;
    else if (type === 'preview') type = Editor.PreviewPane;
    else                         type = Editor.InputPane;

    // Add the pane.
    var deferred = Q.defer();
    var newPane  = graceful.editor.addPane(type, new Editor.Buffer(), direction, pane);
    var property = direction === 'vertical' ? 'height' : 'width';

    // Link the pane.
    if (link) newPane.linkToPane(pane);

    // Allow the transition to finish before subsequent commands can start.
    pane.wrapper.addEventListener('transitionend', function endListener(event) {
      if (event.propertyName === property) {
        deferred.resolve();
        pane.wrapper.removeEventListener('transitionend', endListener);
      }
    });

    // Re-focus the pane.
    pane.focus();

    return deferred.promise;
  }

  /**
   * Open up a new horizontal split pane.
   *
   * @param {Editor.Pane} pane - The pane to use for the command.
   * @param {String} type - The type of pane to add.
   * @param {Boolean} link - Whether to link the new pane to
   *        the pane executing the command.
   * @return {Promise} A promise for the split.
   */
  graceful.editor.defineCommand('split_h', 2, function(pane, type, link) {
    return addSplit(pane, 'horizontal', type, link);
  });

  /**
   * Open up a new vertical split pane.
   *
   * @param {Editor.Pane} pane - The pane to use for the command.
   * @param {String} type - The type of pane to add.
   * @param {Boolean} link - Whether to link the new pane to
   *        the pane executing the command.
   * @return {Promise} A promise for the split.
   */
  graceful.editor.defineCommand('split_v', 2, function(pane, type, link) {
    return addSplit(pane, 'vertical', type, link);
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
   *
   * @param {Editor.Pane} pane - The pane to use remove.
   */
  graceful.editor.defineCommand('close', 0, function(pane) {
    graceful.editor.removePane(pane);
  });

  /**
   * Opens a file into the given pane.
   * 
   * When calling this command on a pane that is linked to another pane,
   * the link will be broken. This is due to the one-way nature of the link.
   *
   * @param {Editor.pane} pane - The pane to open the file in.
   * @param {String} path - The path to open. If not specified,
   *        the user will be prompted to choose a destination. If
   *        the buffer has a filepath associated with it, the path
   *        will default to that.
   *
   * @return {Promise} A promise for the open operation.
   */
  graceful.editor.defineCommand('open', 1, function(pane, path) {
    var buffer = pane.buffer;
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
          pane.switchBuffer(new Editor.Buffer(contents, path), true);
        });
        }
        else if (type === 'directory') {
          // If it's an existing directory, start the open dialogue there.
          return FileSystem.showOpenDialog(null, path)
        .then(function(selection) {
          return FileSystem.readFile(selection)
          .then(function(contents) {
            pane.switchBuffer(new Editor.Buffer(contents, selection), true);
          });
        })
        }
        else if (!type || !path) {
          // If there is no path, start the open dialogue at the last used location.
          return FileSystem.showOpenDialog()
            .then(function(selection) {
              return FileSystem.readFile(selection)
              .then(function(contents) {
                pane.switchBuffer(new Editor.Buffer(contents, selection), true);
              });
            });
        }
      });
  });

  /**
   * Saves the content of the given pane.
   *
   * @param {Editor.pane} pane - The pane to open the file in.
   * @param {String} path - The path to save to. If not specified,
   *        the user will be prompted to choose a destination. If
   *        the buffer has a filepath associated with it, the path
   *        will default to that.
   *
   * @return {Promise} A promise for the save operation.
   */
  graceful.editor.defineCommand('save', 1, function(pane, path) {
    var buffer     = pane.buffer;
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
          buffer.setFilepath(path);
        });
        }
        else if (type === 'directory') {
          // If it's an existing directory, open the save dialogue there.
          return FileSystem.showSaveDialogue(null, path, buffer.title)
        .then(function(selection) {
          return FileSystem.writeFile(selection, buffer.text)
          .then(function() {
            buffer.setFilepath(path);
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
                  buffer.setFilepath(path);
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
                buffer.setFilepath(path);
              });
            });
        }
      });
  });

/* =======================================================
 *              Feel free to edit above here.
 * ======================================================= */

}(this);

