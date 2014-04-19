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
   * @param {Integer) arg - The index of the pane to create the link with,
   *                        or the keyword 'break'.
   */
  graceful.editor.defineCommand({
    name: 'link',
    argCount: 1,
    func: function(pane, arg) {
      var paneNumber = parseInt(arg, 10);
      var targetPane, deferred, result;

      if (!arg) {
        throw new Error('No argument passed to command.');
      }

      if (arg === 'break' && pane.linkedPane) {
        result = pane.linkToPane(false);
        if (!result) return;
      }
      else if (!isNaN(paneNumber)) {
        if (paneNumber < 0 || paneNumber >= graceful.editor.panes.length) {
          throw new Error("Invalid pane number '" + paneNumber + "' specified.");
        }

        targetPane = graceful.editor.panes[paneNumber];

        if (targetPane === pane.linkedPane || (targetPane === pane && !pane.linkedPane)) {
          return;
        }
        else if (targetPane === pane) {
          pane.linkToPane(false, true);
        } 
        else {
          pane.linkToPane(targetPane);
        }
      }
      else {
        return;
      }

      if (!pane.linkManager.isShowingLink) return;

      deferred = Q.defer();

      // Allow linking animation to finish before resolving.
      pane.linkManager.containers.display.addEventListener('transitionend', function listener(event) {
        deferred.resolve();
        pane.linkManager.containers.display.removeEventListener('transitionend', listener);
      });

      return deferred.promise;
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

      if (paneNumber < 0 || paneNumber >= graceful.editor.panes.length) {
        throw new Error("Invalid pane number '" + paneNumber + "' specified.");
      }

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
    type = type ? type.toLowerCase() : '';

    // Set pane type.
    if      (type === 'input')   type = Editor.InputPane;
    else if (type === 'preview') type = Editor.PreviewPane;
    else                         type = Editor.InputPane;

    // Add the pane.
    var deferred = Q.defer();
    var newPane  = graceful.editor.addPane(type, new Editor.Buffer(), direction, pane);
    var property = direction === 'vertical' ? 'height' : 'width';

    // If no pane was added, just return.
    if (!newPane) return;

    // Link the pane.
    if (link) newPane.linkToPane(pane);

    // Allow the transition to finish before subsequent commands can start.
    newPane.wrapper.addEventListener('transitionend', function listener(event) {
      if (event.propertyName === property) {
        deferred.resolve();
        pane.wrapper.removeEventListener('transitionend', listener);
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
   * Begins managing the links on the specified panes, or
   * all the panes if none are specified.
   *
   * @param {Editor.Pane} pane - The current pane context (not used).
   * @param {Integer[]} targets - The panes to manage.
   */
  graceful.editor.defineCommand({
    name: 'manage',
    func: function(pane) {
      var deferred = Q.defer();

      if (!graceful.editor.isManagingLinks) {
        graceful.editor.manageLinks();
      } else {
        graceful.editor.endManageLinks();
      }

      // Which pane is used doesn't matter.
      pane.overlayElement.addEventListener('transitionend', function listener(event) {
        deferred.resolve();
        pane.linkManager.containers.display.removeEventListener('transitionend', listener);
      });

      return deferred.promise;
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
      var deferred = Q.defer();

      // Remove the pane.
      pane = paneNumber ? graceful.editor.panes[parseInt(paneNumber, 10)] : pane;
      graceful.editor.removePane(pane, function() { deferred.resolve(); });

      return deferred.promise;
    },
    focusFunc: function(editor) {
      return editor.getFocusPane() || editor.panes[0]; 
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
   * @param {Editor.Pane} pane - The pane to open the file in.
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
      var bufferList = pane.editor.bufferList;
      var buffer;

      // Resolve relative filepaths.
      path = getAbsolutePath(pane.buffer.filepath, path, true) || '';

      return FileSystem.pathType(path)
        .then(function(type) {
          if (type === 'file') {
            // If it's an existing file, open it.
            return FileSystem.readFile(path)
              .then(function(contents) {
                buffer = bufferList.find(path) || new Editor.Buffer(contents, path);
                pane.switchBuffer(buffer, true);
              });
          }
          else if (type === 'directory') {
            // If it's an existing directory, start the open dialogue there.
            return FileSystem.showOpenDialog(null, path)
              .then(function(selection) {
                return FileSystem.readFile(selection)
                  .then(function(contents) {
                    buffer = bufferList.find(selection) || new Editor.Buffer(contents, selection);
                    pane.switchBuffer(buffer, true);
                });
              });
          }
          else if (!type || !path) {
            // If there is no path, start the open dialogue at the last used location.
            return FileSystem.showOpenDialog()
              .then(function(selection) {
                return FileSystem.readFile(selection)
                  .then(function(contents) {
                    buffer = bufferList.find(selection) || new Editor.Buffer(contents, selection);
                    pane.switchBuffer(buffer, true);
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
   * @param {Editor.Pane} pane - The pane to open the file in.
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

  /**
   * Starts a 'ripple' animation around the cursor to help the user find it.
   *
   * @param {Editor.InputPane} pane - The pane to add the animation to.
   * @return {Promise} A promise for the animation's completion.
   */
  function pingCursor(pane) {
    var deferred = Q.defer();
    var ace = pane.ace;

    // Calculate positioning and offsets.
    var cursorElement   = ace.renderer.$cursorLayer.cursor;
    var cursorPosition  = cursorElement.getBoundingClientRect();
    var panePosition    = pane.wrapper.getBoundingClientRect();
    var inputPosition   = pane.inputWrapper.getBoundingClientRect();
    var cursorThickness = parseInt(getComputedStyle(cursorElement).borderLeftWidth, 10);
    var offsetLeft      = (cursorThickness || cursorPosition.width) / 2;
    var offsetTop       = cursorPosition.height / 2;

    // Create a new ping element.
    var pingElement = document.createElement('div');
    pingElement.className = 'ping';

    // Position the element.
    // inputPosition.top is used in the second calculation instead of panePosition.top
    // because panePosition.top ignores the interior border that offsets its contents.
    pingElement.style.left = (cursorPosition.left - panePosition.left + offsetLeft) + 'px';
    pingElement.style.top  = (cursorPosition.top  - inputPosition.top + offsetTop)  + 'px';

    // Add it to the DOM.
    pane.wrapper.appendChild(pingElement);

    pingElement.addEventListener('webkitAnimationEnd', function(event) {
      if (event.animationName === 'pingPlaceholder') {
        deferred.resolve();
        pane.wrapper.removeChild(pingElement); // Also removes this listener.
      }
    });

    return deferred.promise;
  }

  /**
   * Gets a percentage from natural english.
   * Returns the input if it can't be parsed.
   *
   * @param {String} input - The input to parse.
   * @return {String} The parsed input.
   */
  function parseNaturalLanguage(input) {
    if (input === 'start') {
      return '0';
    }
    else if (input === 'half' || input === 'middle') {
      return '50%';
    }
    else if (input === 'end'  || input === 'full') {
      return '100%';
    }
    else {
      return input;
    }
  }

  /**
   * Gets a percentage or number from a decimal value.
   * Returns the input if it can't be parsed.
   *
   * @param {String} input - The input to parse.
   * @return {String} The parsed input.
   */
  function parseDecimal(input) {
    var value = parseFloat(input, 10);

    // Handle decimals <= 1 as percents, and decimals > 1 as plain numbers.
    if (input.indexOf('.') !== -1 && input.indexOf('%') === -1) {
      input = (value > 1) ? Math.round(value) + '' : (value * 100) + '%';
    }

    return input;
  }

  /**
   * Jumps the editor to a given position line number or percent position.
   *
   * This will parse the following values:
   *
   *   Notation:
   *   {x}   - Jump to the given row/column.
   *   {x}%  - Jump to the given row/column by percent of total length.
   *   {x.x} - Jump to the given row/column by decimal of total length,
   *           equivalent to a percent in decimal notation. If the decimal
   *           is > 1.0, it is treated as a plain line number.
   *
   *   Any of the above can be prefixed with + or - to denote a relative jump. In the
   *   case of rows, the jump will be relative the current position, while columns will
   *   be determined normally for positive values, and relative the end for negative
   *   values. (So "jump 100 -5" jumps to row 100, 5 columns from the end.)
   *
   *   Using natural language:
   *   {start}       - Jump to the first row/column.
   *   {middle|half} - Jump to the middle row/column.
   *   {end|full}    - Jump to the last row/column.
   *
   * @todo Allow jumping to set positions, headers, or regex searches.
   *
   * @param {Editor.InputPane} pane - The pane to jump to the position in.
   * @param {String|Number} targetY - The row or vertical percent position to jump to.
   * @param {String|Number} targetX - The column or horizontal percent position to jump to.
   */
  graceful.editor.defineCommand({
    name: 'jump',
    argCount: 2,
    func: function(pane, targetY, targetX) {
      var ace, lineCount, currentRow, relativeY, relativeX, percent,
        lineContent, lineLength, row, column;

      // Handle invalid arguments.
      if (pane instanceof Editor.InputPane === false) return;
      if (typeof targetY === 'undefined') return;
      if (typeof targetX === 'undefined') targetX = '';

      ace        = pane.ace;
      lineCount  = ace.session.getLength();
      currentRow = ace.getCursorPosition().row;
      targetY    = targetY.toLowerCase();
      targetX    = targetX.toLowerCase();

      // Parse relative values.
      if (targetY[0] === '+') {
        relativeY = 1;
        targetY = targetY.substr(1);
      }
      else if (targetY[0] === '-') {
        relativeY = -1;
        targetY = targetY.substr(1);
      }
      else {
        relativeY = false;
      }

      if (targetX[0] === '-') {
        relativeX = -1;
        targetX = targetX.substr(1);
      } else {
        relativeX = false;
      }

      // Parse natural language arguments.
      var tempY = parseNaturalLanguage(targetY);
      var tempX = parseNaturalLanguage(targetX);

      if (tempY !== targetY) {
        relativeY = false;
        targetY = tempY;
      }

      if (tempX !== targetX) {
        relativeX = false;
        targetX = tempX;
      }

      // Parse decimal notation.
      targetY = parseDecimal(targetY);
      targetX = parseDecimal(targetX);

      // Parse the requested row.
      if (targetY.indexOf('%') !== -1) {
        percent = parseFloat(targetY) / 100;
        row = Math.round(lineCount * percent);
      } else {
        row = parseInt(targetY, 10);
      }

      // If the row couldn't be parsed, exit.
      if (isNaN(row)) return;

      // Move relative to current position.
      if (relativeY) row = currentRow + (row * relativeY);

      // Keep the row within the bounds of the document.
      if (row < 1) row = 1;
      else if (row > lineCount) row = lineCount;

      lineContent = ace.session.getLine(row - 1);
      lineLength  = lineContent.length;

      // Parse the requested column.
      if (targetX.length === 0) {
        // If column is unspecified, jump to the end of the row.
        column = lineLength;
      }
      else if (targetX.indexOf('%') !== -1) {
        percent = parseFloat(targetX) / 100;
        column = Math.round(lineLength * percent);
      } else {
        column = parseInt(targetX, 10);
      }

      // Make the column relative to the end.
      if (relativeX) column = lineLength - column;

      // If the column couldn't be parsed, default to the end of the line.
      if (isNaN(column)) column = lineLength;

      // Go to the requested line and force an update.
      ace.gotoLine(row, column, false);
      ace.renderer.updateFull(true);

      // Show the user where the cursor is.
      return pingCursor(pane);
    }
  });

  /**
   * Starts a 'ripple' animation around the cursor to help the user find it.
   *
   * @param {Editor.InputPane} pane - The pane to add the animation to.
   * @return {Promise} A promise for the animation's completion.
   */
  graceful.editor.defineCommand({
    name: 'ping',
    func: function(pane) {
      if (pane instanceof Editor.InputPane) {
        return pingCursor(pane);
      }
    }
  });

/* =======================================================
 *              Feel free to edit above here.
 * ======================================================= */

}(this);

