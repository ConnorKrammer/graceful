/**
 * Defines basic editor commands.
 */

!function(global) {
  'use strict';

  /**
   * Link the current pane to the pane with the given index.
   *
   * @todo Allow a more intuitive way to specify the linked pane.
   *
   * @param {Integer|String) arg - The index of the pane to create the
   *                         link with, or the keyword 'break'.
   */
  CommandManager.defineCommand({
    name: 'link',
    template: '{arg:string}',
    argCount: 1,
    func: function(arg) {
      var pane = graceful.editor.focusPane();
      var targetPane = graceful.editor.getPaneByIndex(arg);
      var deferred, result;

      if (arg === 'break' && pane.linkedPane) {
        result = pane.linkToPane(false);
        if (!result) return;
      }
      else if (targetPane) {
        if (targetPane === pane.linkedPane || (targetPane === pane && !pane.linkedPane)) {
          return;
        }
        else if (targetPane === pane) {
          pane.linkToPane(false, true);
        }
        else {
          result = pane.linkToPane(targetPane);
          if (!result) return;
        }
      }
      else {
        throw new Error('Invalid pane index "' + arg + '" specified.');
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
   * @param {Integer) paneNumber - The index of the pane to focus.
   */
  CommandManager.defineCommand({
    name: 'focus',
    template: '{index:string}',
    argCount: 1,
    func: function(index) {
      var pane = graceful.editor.getPaneByIndex(index);

      if (!pane) {
        throw new Error("Invalid pane index '" + index + "' specified.");
      }

      pane.focus();
    }
  });

  /**
   * Add a split pane to the editor.
   *
   * @todo Allow specifying pane type in a way that allows extensions
   *       to add new pane types without modifying this function.
   *
   * @param {Editor.Pane} pane - The pane to use for the command.
   * @param {String} direction - The direction to make the split in.
   * @param {String} type - The type of pane to add.
   * @param {Boolean} link - Whether to link the new pane to the current one.
   * @return {Q.Promise} A promise that the added pane has finished its animation.
   */
  function addSplitPane(pane, direction, type, link) {
    type = type ? type.toLowerCase() : '';

    // Set pane type.
    if      (type === 'input')   type = Editor.InputPane;
    else if (type === 'preview') type = Editor.PreviewPane;
    else                         type = Editor.InputPane;

    // Add the pane.
    var deferred = Q.defer();
    var newPane  = graceful.editor.addPane(type, new Editor.Buffer(), direction, pane, null, function() {
      deferred.resolve();
    });

    // If no pane was added, just return.
    if (!newPane) return;

    // Link the pane.
    if (link) newPane.linkToPane(pane);

    return deferred.promise;
  }

  /**
   * Open up a new horizontal split pane.
   *
   * @param {String} type - The type of pane to add.
   * @param {Boolean} link - Whether to link the new pane to the current one.
   * @return {Q.Promise} A promise that the added pane has finished its animation.
   */
  CommandManager.defineCommand({
    name: 'split_h',
    template: '{type?:string} {link?:boolean}',
    argCount: 2,
    func: function(type, link) {
      var pane = graceful.editor.focusPane();
      return addSplitPane(pane, 'horizontal', type, link);
    }
  });

  /**
   * Open up a new vertical split pane.
   *
   * @param {String} type - The type of pane to add.
   * @param {Boolean} link - Whether to link the new pane to the current one.
   * @return {Q.Promise} A promise that the added pane has finished its animation.
   */
  CommandManager.defineCommand({
    name: 'split_v',
    template: '{type?:string} {link?:boolean}',
    argCount: 2,
    func: function(type, link) {
      var pane = graceful.editor.focusPane();
      return addSplitPane(pane, 'vertical', type, link);
    }
  });

  /**
   * Toggles pane management mode, which allows the user to manipulate
   * pane links via the UI.
   *
   * @param {String} [forcedState] - Turns management on/off if passed true/false,
   *                 otherwise toggles management mode like normal.
   * @return {Q.Promise} A promise that the transition has finished.
   */
  CommandManager.defineCommand({
    name: 'manage',
    template: '{forcedState?:string}',
    argCount: 1,
    func: function(forcedState) {
      var deferred = Q.defer();
      var isManaging = graceful.editor.isManagingLinks;
      forcedState = (forcedState || '').toLowerCase();

      if (!isManaging && (forcedState === 'on' || forcedState !== 'off')) {
        graceful.editor.manageLinks();
      }
      else if (isManaging && (forcedState === 'off' || forcedState !== 'on')) {
        graceful.editor.endManageLinks();
      }

      if (graceful.editor.isManagingLinks !== isManaging) {
        // Which pane is used doesn't matter.
        var pane = graceful.editor.panes[0];
        pane.overlayElement.addEventListener('transitionend', function listener(event) {
          deferred.resolve();
          pane.linkManager.containers.display.removeEventListener('transitionend', listener);
        });
      } else {
        deferred.resolve();
      }

      return deferred.promise;
    }
  });

  /**
   * Open up the Chrome developer tools in a new window.
   */
  CommandManager.defineCommand({
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
  CommandManager.defineCommand({
    name: 'quit',
    func: function() {
      appshell.app.closeLiveBrowser();
      appshell.app.quit();
    }
  });

  /**
   * Closes panes based upon the following rules:
   *
   * 1) If no panes are specified, close the focused pane.
   * 2) If the keywords 'all but' are used, close all panes but
   *    those specified. If no panes are specified, close all but
   *    the focused one.
   * 3) If the keyword 'all' is used, close all panes.
   * 4) Otherwise, close the specified panes.
   *
   * @param {Integer[]|String} panes - The indices of the panes to remove, or a keyword.
   * @return {Q.Promise} A promise that the panes have finished being removed.
   */
  CommandManager.defineCommand({
    name: 'close',
    template: '{...panes?:string}',
    argCount: 1,
    func: function(panes) {
      var promise    = Q();
      var editor     = graceful.editor;
      var focusPane  = editor.focusPane();

      if (panes.indexOf('this') !== -1) {
        panes.push(focusPane.getIndexAsString());
      }

      if (!panes.length) {
        panes.push(focusPane);
      }
      else if (panes[0] && panes[1] && (panes[0] + ' ' + panes[1]).toLowerCase() === 'all but') {
        var keepFocus = !panes[2];

        panes = editor.panes.filter(function(pane) {
          if (keepFocus && pane === focusPane) return false;
          return panes.indexOf(pane.getIndexAsString()) === -1;
        });
      }
      else if (panes[0] && panes[0].toLowerCase() === 'all') {
        panes = editor.panes.filter(function(pane) {
          return pane !== focusPane;
        });

        // Close the focused pane last.
        panes.push(focusPane);
      }
      else {
        panes = editor.panes.filter(function(pane) {
          return panes.indexOf(pane.getIndexAsString()) !== -1;
        });
      }

      panes.forEach(function(pane) {
        promise = Q.when(promise, function() {
          var deferred = Q.defer();

          if (graceful.editor.panes.indexOf(pane) === -1) {
            deferred.resolve();
          } else {
            graceful.editor.removePane(pane, null, function() {
              deferred.resolve();
            });
          }

          return deferred.promise;
        });
      });

      return promise.then(function() {
        editor.focusPane();
      });
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
   * @param {Boolean} [fallback=false] - Whether to return the current path's
   *                  directory if the path argument is invalid.
   * @return {String|false} The new, absolute path, or false if not possible.
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
   * @param {String} path - The path to open. If not specified,
   *                 the user will be prompted to choose a destination. If
   *                 the buffer has a filepath associated with it, the path
   *                 will default to that.
   * @return {Q.Promise} A promise for the open operation.
   */
  CommandManager.defineCommand({
    name: 'open',
    template: '{path?:string}',
    argCount: 1,
    func: function(path) {
      var pane = graceful.editor.focusPane();
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
                    console.log(contents);
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
   * @param {String} path - The path to save to. If not specified,
   *                 the user will be prompted to choose a destination. If
   *                 the buffer has a filepath associated with it, the path
   *                 will default to that.
   * @return {Q.Promise} A promise for the save operation.
   */
  CommandManager.defineCommand({
    name: 'save',
    template: '{path?:string}',
    argCount: 1,
    func: function(path) {
      var pane = graceful.editor.focusPane();
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
   * @return {Q.Promise} A promise for the animation's completion.
   */
  function pingCursor(pane) {
    var deferred = Q.defer();
    var ace = pane.ace;

    // Calculate positioning and offsets.
    var cursorElement   = ace.renderer.$cursorLayer.cursor;
    var cursorPosition  = cursorElement.getBoundingClientRect();
    var panePosition    = pane.wrapper.getBoundingClientRect();
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
    pingElement.style.top  = (cursorPosition.top  - panePosition.top + offsetTop)  + 'px';

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
   * Starts a 'ripple' animation around the cursor to help the user find it.
   *
   * @param {Editor.InputPane} pane - The pane to add the animation to.
   * @return {Q.Promise} A promise for the animation's completion.
   */
  CommandManager.defineCommand({
    name: 'ping',
    func: function() {
      var pane = graceful.editor.focusPane();
      if (pane instanceof Editor.InputPane) {
        return pingCursor(pane);
      }
    }
  });

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
   * @param {String|Number} positionY - The row or vertical percent position to jump to.
   * @param {String|Number} positionX - The column or horizontal percent position to jump to.
   */
  CommandManager.defineCommand({
    name: 'jump',
    template: '{positionY} {positionX?}',
    argCount: 2,
    func: function(positionY, positionX) {
      var pane = graceful.editor.focusPane();
      var ace, lineCount, currentRow, relativeY, relativeX, percent,
        lineContent, lineLength, row, column;

      // Handle invalid arguments.
      if (pane instanceof Editor.InputPane === false) return;
      if (typeof positionY === 'undefined') return;
      if (typeof positionX === 'undefined') positionX = '';

      ace        = pane.ace;
      lineCount  = ace.session.getLength();
      currentRow = ace.getCursorPosition().row;
      positionY    = positionY.toLowerCase();
      positionX    = positionX.toLowerCase();

      // Parse relative values.
      if (positionY[0] === '+') {
        relativeY = 1;
        positionY = positionY.substr(1);
      }
      else if (positionY[0] === '-') {
        relativeY = -1;
        positionY = positionY.substr(1);
      }
      else {
        relativeY = false;
      }

      if (positionX[0] === '-') {
        relativeX = -1;
        positionX = positionX.substr(1);
      } else {
        relativeX = false;
      }

      // Parse natural language arguments.
      var tempY = parseNaturalLanguage(positionY);
      var tempX = parseNaturalLanguage(positionX);

      if (tempY !== positionY) {
        relativeY = false;
        positionY = tempY;
      }

      if (tempX !== positionX) {
        relativeX = false;
        positionX = tempX;
      }

      // Parse decimal notation.
      positionY = parseDecimal(positionY);
      positionX = parseDecimal(positionX);

      // Parse the requested row.
      if (positionY.indexOf('%') !== -1) {
        percent = parseFloat(positionY) / 100;
        row = Math.round(lineCount * percent);
      } else {
        row = parseInt(positionY, 10);
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
      if (positionX.length === 0) {
        // If column is unspecified, jump to the end of the row.
        column = lineLength;
      }
      else if (positionX.indexOf('%') !== -1) {
        percent = parseFloat(positionX) / 100;
        column = Math.round(lineLength * percent);
      } else {
        column = parseInt(positionX, 10);
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
}(this);

