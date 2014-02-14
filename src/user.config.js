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
  graceful.editor.defineCommand({
    name: 'link',
    argCount: 1,
    func: function(pane, paneNumber) {
      paneNumber = parseInt(paneNumber, 10);
      pane.linkToPane(graceful.editor.panes[paneNumber]);
    }
  });

  /**
   * Gives the pane with the specified pane focus.
   *
   * @todo Allow a more intuitive way to specify the focused pane.
   *
   * @param {Editor.Pane} pane - The pane to give focus to.
   * @param {Integer) paneNumber - The index of the pane to focus.
   */
  graceful.editor.defineCommand({
    name: 'focus',
    argCount: 1,
    func: function(pane, paneNumber) {
      paneNumber = parseInt(paneNumber, 10) || 0;
      graceful.editor.panes[paneNumber].focus();
    },
    focusFunc: function(editor) {
      return editor.getFocusPane();
    }
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
    newPane.wrapper.addEventListener('transitionend', function endListener(event) {
      if (event.propertyName === property) {
        deferred.resolve();
        pane.wrapper.removeEventListener('transitionend', endListener);
      }
    });

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
  graceful.editor.defineCommand({
    name: 'split_h',
    argCount: 2,
    func: function(pane, type, link) {
      return addSplit(pane, 'horizontal', type, link);
    }
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
  graceful.editor.defineCommand({
    name: 'split_v',
    argCount: 2,
    func: function(pane, type, link) {
      return addSplit(pane, 'vertical', type, link);
    }
  });

  /**
   * Open up the Chrome developer tools in a new window.
   */
  graceful.editor.defineCommand({
    name: 'dev',
    func: function() {
      appshell.app.showDeveloperTools();
    }
  });

  /**
   * Completely shuts down the application.
   * If the debug window is open, it will be closed as well.
   *
   * @todo Prompt user to save changes before closing.
   */
  graceful.editor.defineCommand({
    name: 'quit',
    func: function() {
      appshell.app.closeLiveBrowser();
      appshell.app.quit();
    }
  });

  /**
   * Closes the focused pane, or the specified pane.
   *
   * @param {Editor.Pane} pane - The pane to remove.
   * @param {Integer) paneNumber - The index of the pane to close.
   */
  graceful.editor.defineCommand({
    name: 'close',
    argCount: 1,
    func: function(pane, paneNumber) {
      pane = paneNumber ? graceful.editor.panes[parseInt(paneNumber, 10)] : pane;
      graceful.editor.removePane(pane);
    },
    focusFunc: function(editor) {
      return editor.getFocusPane(); 
    }
  });

  /**
   * Returns a new path absolute to the current path's directory.
   *
   * Examples:
   *
   *   getAbsolutePath('C:/dir/file.txt', './new.txt')         -> 'C:/dir/new.txt'
   *   getAbsolutePath('C:/dir/file.txt', '../new.txt')        -> 'C:/new.txt'
   *   getAbsolutePath('C:/dir/file.txt', 'new.txt')           -> false
   *   getAbsolutePath('C:/dir/file.txt', './newDir/new.txt')  -> 'C:/dir/newDir/new.txt'
   *   getAbsolutePath('C:/dir/file.txt', '../newDir/new.txt') -> 'C:/newDir/new.txt'
   *   getAbsolutePath('C:/dir/file.txt', 'newDir/new.txt')    -> false
   *
   * Note that the current path is assumed to be an absolute path itself, but
   * is not checked to actually be one.
   *
   * @param {String} currentPath - The current path.
   * @param {String} path - The relative path.
   * @param {Boolean} [fallback=false] - Whether to return the current path's directory
   *        if the path argument is invalid.
   * @return {String|False} The new, absolute path, or false if not possible.
   */
  function getAbsolutePath(currentPath, path, fallback) {
    var firstThreeChars, firstTwoChars, index;

    // Exit early if there is no current path.
    if (!currentPath) return false;

    // Either exit early or use the fallback.
    if (!path && !fallback) return false;
    else if (!path) path = './';

    firstThreeChars = path.substr(0, 3);
    firstTwoChars   = path.substr(0, 2);

    // If the path isn't relative, return false.
    if (firstThreeChars !== '../'
     && firstThreeChars !== '..\\' 
     && firstTwoChars   !== './'
     && firstTwoChars   !== '.\\') {
      if (!fallback) return false;
      path = firstThreeChars = firstTwoChars = './';
    }

    // Prepend './' to paths starting with parent folder references.
    if (firstThreeChars === '../' || firstThreeChars === '..\\') {
      path = './' + path;
      firstTwoChars = './';
    }

    // Replace './' or '.\' with the current filepath directory.
    if (firstTwoChars === './' || firstTwoChars === '.\\') {
      index = Math.max(currentPath.lastIndexOf('/'), currentPath.lastIndexOf('\\')) + 1;
      path = currentPath.substr(0, index) + path.substr(2);
    }

    return path;
  }

  /**
   * Opens a file into the given pane.
   * 
   * When calling this command on a pane that is linked to another pane,
   * the link will be broken. This is due to the one-way nature of the link.
   *
   * @todo Currently this only works with relative filepaths.
   *       When the python API is implemented it will allow a simple method
   *       of checking for absolute filepaths.
   *
   * @param {Editor.pane} pane - The pane to open the file in.
   * @param {String} path - The path to open. If not specified,
   *        the user will be prompted to choose a destination. If
   *        the buffer has a filepath associated with it, the path
   *        will default to that.
   *
   * @return {Promise} A promise for the open operation.
   */
  graceful.editor.defineCommand({
    name: 'open',
    argCount: 1,
    func: function(pane, path) {
      var buffer = pane.buffer;

      // Resolve relative filepaths.
      path = getAbsolutePath(buffer.filepath, path, true) || '';

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
    }
  });

  /**
   * Saves the content of the given pane.
   *
   * @todo Currently this only works with relative filepaths.
   *       When the python API is implemented it will allow a simple method
   *       of checking for absolute filepaths.
   * @todo When recursively creating a new directory, only the end directory
   *       is deleted again when cancelling. All created directories should be.
   *
   * @param {Editor.pane} pane - The pane to open the file in.
   * @param {String} path - The path to save to. If not specified,
   *        the user will be prompted to choose a destination. If
   *        the buffer has a filepath associated with it, the path
   *        will default to that.
   *
   * @return {Promise} A promise for the save operation.
   */
  graceful.editor.defineCommand({
    name: 'save',
    argCount: 1,
    func: function(pane, path) {
      var buffer = pane.buffer;
      var lastChar;

      // Resolve relative filepaths.
      path     = getAbsolutePath(buffer.filepath, path) || buffer.filepath || '';
      lastChar = path.slice(-1);

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
                    buffer.setFilepath(selection);
                  });
              });
          }
          else if (!type && path && (lastChar === '/' || lastChar === '\\')) {
            // If it's an uncreated directory, create it. If the user cancels, delete it again.
            return FileSystem.makeDirectory(path)
              .then(function() {
                return FileSystem.showSaveDialogue(null, path, buffer.title)
                  .then(function(selection) {
                    return FileSystem.writeFile(selection, buffer.text)
                      .then(function() {
                        buffer.setFilepath(selection);
                      });
                  })
                  .fail(function(error) {
                    FileSystem.unlink(path);
                  });
              });
          }
          else if (!type && path) {
            // If an uncreated file is specified, recursively create the filepath and save it.
            return FileSystem.writeFileRecursive(path, buffer.text)
              .then(function() {
                buffer.setFilepath(path);
              });
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
                    buffer.setFilepath(selection);
                  });
              });
          }
        });
    }
  });

/* =======================================================
 *              Feel free to edit above here.
 * ======================================================= */

}(this);

