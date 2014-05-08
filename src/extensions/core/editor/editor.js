/**
 * graceful-editor
 *
 * Defines the Editor class, as well as several namespaced classes (Editor.Buffer,
 * Editor.Pane, Editor.InputPane, etc.) that relate to text editing functionality.
 *
 * Requires: graceful-preferences
 */


!function(global) {
  'use strict';

/* =======================================================
 *                   UndoManagerProxy
 * ======================================================= */

  /**
   * The UndoManagerProxy class.
   *
   * Impersonates an UndoManager to allow two Ace Editor instances
   * to share a document history (undo/redo). Used by the Buffer
   * class when making linked copies of its root document.
   *
   * Copied wholesale from:
   *  https://github.com/ajaxorg/ace/blob/a4a30b6665da5f5ef9c3bd23d7bac01374bae450/lib/ace/split.js
   *
   * @constructor
   * @param {ace.UndoManager} undoManager - The UndoManager to impersonate.
   * @param {ace.EditSession} session - The editing session to impersonate.
   */
  function UndoManagerProxy(undoManager, session) {
    this.$u = undoManager;
    this.$doc = session;
  }

  /**
   * Impersonates an UndoManager's execute() method.
   */
  UndoManagerProxy.prototype.execute = function(options) {
    this.$u.execute(options);
  };

  /**
   * Impersonates an UndoManager's undo() method.
   */
  UndoManagerProxy.prototype.undo = function() {
    var selectionRange = this.$u.undo(true);
    if (selectionRange) {
      this.$doc.selection.setSelectionRange(selectionRange);
    }
  };

  /**
   * Impersonates an UndoManager's redo() method.
   */
  UndoManagerProxy.prototype.redo = function() {
    var selectionRange = this.$u.redo(true);
    if (selectionRange) {
      this.$doc.selection.setSelectionRange(selectionRange);
    }
  };

  /**
   * Impersonates an UndoManager's reset() method.
   */
  UndoManagerProxy.prototype.reset = function() {
    this.$u.reset();
  };

  /**
   * Impersonates an UndoManager's hasUndo() method.
   */
  UndoManagerProxy.prototype.hasUndo = function() {
    return this.$u.hasUndo();
  };

  /**
   * Impersonates an UndoManager's hasRedo() method.
   */
  UndoManagerProxy.prototype.hasRedo = function() {
    return this.$u.hasRedo();
  };


/* =======================================================
 *                         Buffer
 * ======================================================= */

  var Document = ace.require('./document').Document;
  var lang     = ace.require('./lib/lang');

  // Counter for buffer IDs.
  var currentBufferID = 0;

  /**
   * The Buffer class.
   *
   * This class is responsible for managing a file's contents
   * and syncing updates across all subscribing panes.
   *
   * @constructor
   * @param {String} [text=''] - The text to begin the document with.
   * @param {String} [filepath=null] - The filepath to associate the buffer with.
   * @param {Object} [history] - Any edit history to attach to the buffer.
   */
  function Buffer(text, filepath, history) {
    var _this = this;
    var index, undoManager;

    // Mix in event handling.
    Observable.mixin(this);

    // Get a unique ID.
    this.id = getBufferID();

    // Set the initial filepath.
    if (!filepath) {
      this.title = this.id > 0 ? 'new_' + this.id : 'new';
      this.filepath = '';
      this.filetype = Preferences.get(prefKeys.panes + '.defaultExtension');
      this.title += this.filetype;
    } else {
      this.setFilepath(filepath);
    }

    // Defaults.
    this.text = text = text || '';
    undoManager = new ace.UndoManager();

    // The master document.
    this.session = new ace.EditSession(text);
    this.session.setUndoManager(undoManager);

    if (history) {
      undoManager.$undoStack   = _.clone(history.$undoStack, true);
      undoManager.$redoStack   = _.clone(history.$redoStack, true);
      undoManager.dirtyCounter = _.clone(history.dirtyCounter, true);
    }

    // Start with a clean state.
    this.markClean();

    // Allow changes to the root document to trigger a change event.
    this.session.on('change', _.throttle(function() {
      _this.text = _this.session.getValue();
      _this.markClean(false);
      _this.trigger('change.content', _this);
    }, 50));

    return this;
  }

  /**
   * Sets the buffer's filepath.
   *
   * This will also update the buffer's title to whatever text comes after
   * the last directory delimeter character {'/' or '\').
   *
   * @param {String} filepath - The filepath to associate with the buffer.
   */
  Buffer.prototype.setFilepath = function(filepath) {
    var index, title, oldFiletype, filetype;

    // Don't do anything if the path didn't really change.
    if (filepath === this.filepath) return;

    // Sanitize the filepath.
    filepath = FileSystem.sanitizePath(filepath);

    // Remember what the old filetype was.
    oldFiletype = this.filetype;

    // This gets the text after the last delimeter character and sets it as the title.
    // If the string doesn't contain a slash, the title will be the whole path (since
    // lastIndexOf() returns -1 for no match, and string.slice(index + 1) when index === -1
    // returns the whole string).
    index = filepath.lastIndexOf('/');
    title = filepath.slice(index + 1);

    // Parse out the filetype.
    if (filepath.indexOf('.') !== -1) {
      index    = filepath.lastIndexOf('.');
      filetype = filepath.slice(index + 1);
    } else {
      filetype = 'default';
    }

    // Set the new filepath, filetype, and title.
    this.filepath = filepath;
    this.filetype = filetype;
    this.title    = title;

    // Notify listeners that the filepath changed.
    if (filetype !== oldFiletype) this.trigger('change.filetype', filetype);
    this.trigger('change.filepath', [filepath, title]);
  };

  /**
   * Sets the buffer contents. The buffer contents will also
   * be marked as clean, unless otherwise specified.
   *
   * @param {String} content - The new editor content.
   * @param {Boolean} [isClean] - Whether to set the editor contents as clean.
   */
  Buffer.prototype.setContent = function(content, isClean) {
    this.session.setValue(content);
    this.markClean(isClean);
  };

  /**
   * Mark the buffer as clean or dirty.
   * This is useful for tracking when to save a file.
   *
   * @param {Boolean} [isClean=true] Whether to mark the buffer as clean or not.
   */
  Buffer.prototype.markClean = function(isClean) {
    this.isClean = (isClean === false) ? false : true;
  };

  /**
   * Returns a synchronized Ace EditSession.
   *
   * See here for source:
   *  https://github.com/ajaxorg/ace/blob/a4a30b6665da5f5ef9c3bd23d7bac01374bae450/lib/ace/split.js
   *
   * @return {ace.EditSession} The linked document.
   */
  Buffer.prototype.getLink = function() {
    var session          = new ace.EditSession(this.session.getDocument(), this.session.getMode());
    var undoManagerProxy = new UndoManagerProxy(this.session.getUndoManager(), session);

    session.setUndoManager(undoManagerProxy);

    // Overwrite the default $informUndoManager function such that new delas
    // aren't added to the undo manager from the new and the old session.
    session.$informUndoManager = lang.delayedCall(function() { session.$deltas = []; });

    // Copy over 'settings' from the session.
    session.setTabSize(this.session.getTabSize());
    session.setUseSoftTabs(this.session.getUseSoftTabs());
    session.setOverwrite(this.session.getOverwrite());
    session.setBreakpoints(this.session.getBreakpoints());
    session.setUseWrapMode(this.session.getUseWrapMode());
    session.setUseWorker(this.session.getUseWorker());
    session.setWrapLimitRange(this.session.$wrapLimitRange.min, this.session.$wrapLimitRange.max);
    session.$foldData = this.session.$cloneFoldData();

    return session;
  };

  /**
   * Returns a unique buffer ID.
   */
  function getBufferID() {
    return currentBufferID++;
  }

/* =======================================================
 *                       BufferList
 * ======================================================= */

  /**
   * The BufferList class.
   *
   * Holds references to Buffer instances, ensuring that they
   * are not garbage-collected in cases where no pane is using them.
   *
   * Also disallows two buffers from pointing to the same file.
   *
   * @constructor
   */
  function BufferList() {
    this.buffers = [];

    return this;
  }

  /**
   * Adds the given buffer.
   *
   * @param {Buffer} buffer - The buffer to add.
   * @return {Boolean} True if succesful, or false if a buffer has already
   *                   been added that is associated with the same file.
   */
  BufferList.prototype.addBuffer = function(buffer) {
    // Only add the buffer if it's associated with a unique file.
    if (!this.isUnique(buffer)) return false;

    // Add the buffer.
    this.buffers.push(buffer);
    return true;
  };

  /**
   * Removes the given buffer.
   *
   * @param {Buffer} buffer - The buffer to remove.
   * @return {Boolean} True if the buffer exists, else false.
   */
  BufferList.prototype.removeBuffer = function(buffer) {
    var index = this.buffers.indexOf(buffer);

    // Return false if the buffer wasn't added to begin with.
    if (index === -1) return false;

    // Remove the buffer.
    this.buffers.splice(index, 1);
    return true;
  };

  /**
   * Checks whether the given buffer is held in the buffer list.
   *
   * Note the difference between this and BufferList.isUnique() - while
   * isUnique() will check if the buffer filepath is already associated
   * with a buffer in the buffer list, this function tests if it is the
   * _exact_ buffer.
   *
   * @param {Buffer} buffer - The buffer to check.
   * @return {Boolean} True if the buffer is held in the buffer list.
   */
  BufferList.prototype.hasBuffer = function(buffer) {
    return this.buffers.indexOf(buffer) !== -1;
  };

  /**
   * Finds a buffer with the given filepath.
   *
   * @param {String} filepath - The filepath to match against.
   * @return {Buffer|false} The matching buffer, or false.
   */
  BufferList.prototype.find = function(filepath) {
    return _.find(this.buffers, { filepath: filepath }) || false;
  };

  /**
   * Checks if the given buffer is unique compared to buffers already
   * added to the buffer list.
   *
   * @param {Buffer} buffer - The buffer to check.
   * @return {Boolean} True if the buffer is associated with a unique file, else false.
   */
  BufferList.prototype.isUnique = function(buffer) {
    // The title check is necessary because new buffers have null filepaths.
    return !_.any(this.buffers, { filepath: buffer.filepath, title: buffer.title });
  };

  /**
   * Returns all buffers that have been marked as dirty, or
   * false if all buffers are clean.
   *
   * @return {Buffer[]|false} An array of dirty buffers, or false.
   */
  BufferList.prototype.getDirty = function() {
    return _.filter(this.buffers, { dirty: true }) || false;
  };

/* =======================================================
 *                       LinkManager
 * ======================================================= */

  /**
   * The LinkManager class.
   *
   * Manages the visual aspects of linking two panes, namely the handlers on the click
   * and mousemove events, and the drawing of the link line to represent this action.
   *
   * Note that the link line is the line drawn when attempting to make a link, and the
   * link display line is the line drawn when showing an *existing* link.
   *
   * See here for the origin of the line drawing method:
   *   http://www.amaslo.com/2012/06/drawing-diagonal-line-in-htmlcssjs-with.html
   *
   * @todo Tidy up event handling.
   * @todo Rename event handlers to be more consistent.
   * @todo Move event handlers out of the constructor. Right now every instance gets its own
   *       copy of each handler. (Suggestions: Move to object prototype.)
   * @todo Simplify all the logic used to determine display/link states. (Idea: Implement a state
   *       machine to grab the start/end positions in showLink().)
   * 
   * @constructor
   * @param {Pane} pane - The pane to attach the status light to.
   */
  function LinkManager(pane) {
    var _this = this;
    var timer = null;
    var manageEnd = false;

    // Keep a reference to the pane.
    this.pane = pane;

    // For storing the link line's position.
    this.drawInfo = {
      link:    { origin: NaN, destination: NaN },
      display: { origin: NaN, destination: NaN },
    };

    // For storing hover states.
    this.hoverState = {
      start: false, // Not currently used.
      end: false,
      nexus: false
    };

    // Visiblility flag.
    this.isShowingLink = false;

    // Removal flag.
    this.isRemoving = false;

    // Linking flag.
    this.isLinking = false;

    // Display-link flag.
    this.isDisplayLinking = false;

    // Hover-preview flag.
    this.isPreviewingLink = false;

    // Create the containers.
    this.containers = {
      link: document.createElement('div'),
      display: document.createElement('div')
    };

    // Create the end nodes.
    this.nodes = {
      linkStart: document.createElement('div'),
      linkEnd: document.createElement('div'),
      displayStart: document.createElement('div'),
      displayEnd: document.createElement('div'),
      nexus: document.createElement('div')
    };

    // Set the class names.
    this.containers.link.className    = 'link-line-container link-container';
    this.containers.display.className = 'link-line-container display-container';
    this.nodes.linkEnd.className      = 'link-endpoint';
    this.nodes.nexus.className        = 'link-nexus';

    // Add the link elements.
    this.pane.editor.linkContainer.appendChild(this.containers.link);
    this.containers.link.appendChild(this.nodes.linkStart);
    this.containers.link.appendChild(this.nodes.linkEnd);

    // Add the display elements.
    this.pane.editor.linkContainer.appendChild(this.containers.display);
    this.pane.editor.linkContainer.appendChild(this.nodes.nexus);
    this.containers.display.appendChild(this.nodes.displayStart);
    this.containers.display.appendChild(this.nodes.displayEnd);

    // Keep track of what elements are being hovered over.
    document.addEventListener('mousemove', _.throttle(function(event) {
      var endRadius           = _this.nodes.displayEnd.offsetWidth / 2;
      var nexusRadius         = _this.nodes.nexus.offsetWidth / 2;
      var extendedNexusRadius = nexusRadius + endRadius;
      var oldNexusState       = _this.hoverState.nexus;
      var mousePosition       = { x: mouse.x, y: mouse.y };
      var extendedHoverState;

      // Check which elements are being hovered over.
      _this.hoverState.end   = pointInCircle(_this.drawInfo.display.destination, mousePosition, endRadius);
      _this.hoverState.nexus = pointInCircle(_this.drawInfo.display.origin, mousePosition, nexusRadius);

      // The same as the nexus hover state, but with a buffer region.
      extendedHoverState = _this.hoverState.nexus || pointInCircle(_this.drawInfo.display.origin, mousePosition, extendedNexusRadius);

      if (_this.pane.linkingPanes.length) {
        // If a linking pane's end node is hovered over and is within the
        // nexus buffer region, keep the nexus hover state set to true.
        if (extendedHoverState && !_this.hoverState.nexus) {
          _.forEach(_this.pane.linkingPanes, function(pane) {
            if (pane.linkManager.hoverState.end) _this.hoverState.nexus = true;
          });
        }

        // Update the displayed links if the nexus state toggles.
        if (oldNexusState !== _this.hoverState.nexus) {
          updateDisplayedLinks(_this.pane, true);
        }
      }
    }, 10));

    // Draw the link line on mouse move.
    this.drawLinkLineMoveHandler = function(event) {
      _this.drawLinkLine({ x: mouse.x, y: mouse.y });
    };

    // Start a link on mouse click.
    this.startLinkClickHandler = function(event) {
      _this.startLink(event);
    };

    // End a link on mouse click.
    this.endLinkClickHandler = function(event) {
      _this.endLink(true);
    };

    // End a link on ESC key press.
    this.endLinkKeyHandler = function(event) {
      if (event.keyCode !== 27 || !_this.isLinking) return;
      event.stopPropagation();
      _this.endLink(false);
    };

    // Display a link on mouse over.
    this.showLinkHoverHandler = function(event) {
      if (!_this.isShowingLink && !timer) {
        timer = window.setTimeout(function() {
          var pane = _this.pane;

          while (pane) {
            pane.linkManager.isPreviewingLink = true;
            pane = pane.linkedPane;
          }
            
          _this.showLink(true, true, false);
        }, 150);
      }
    }

    // Hide a link on mouse out.
    this.hideLinkHoverHandler = function(event) {
      var pane;

      if (timer) {
        window.clearTimeout(timer);
        timer = null;

        pane = _this.pane;
        while (pane) {
          pane.linkManager.isPreviewingLink = false;
          pane = pane.linkedPane;
        }

        _this.hideLink();
      }
    };

    this.breakLinkClickHandler = function(event) {
      var pane;

      // Stop this from triggering the end of a link.
      event.stopPropagation();

      pane = _this.pane;
      while (pane) {
        pane.linkManager.isPreviewingLink = false;
        pane = pane.linkedPane;
      }

      _this.hideLink(true);
      _this.pane.linkToPane(false);
    };
    
    // Draw the display line on mouse move.
    function followMouse(event) {
      // Abort if not showing the link.
      if (!_this.isShowingLink) {
        endManageLinks(false);
        return;
      }

      var mousePosition = { x: mouse.x, y: mouse.y };

      if (manageEnd) {
        _this.containers.display.style.transition = 'none';
        drawLine(_this.containers.display, _this.drawInfo.display.origin, mousePosition);
        _this.drawInfo.display.destination = mousePosition;

        var targetPane = _this.pane.editor.getPaneAtCoordinate(mousePosition);
        _this.nodes.displayEnd.classList.toggle('invalid-target', !_this.pane.canLinkToPane(targetPane));
      }
    }
    
    // Begin link management on mouse click.
    function startManageLinks(event) {
      if (!_this.isShowingLink) return;

      manageEnd = _this.hoverState.end;

      // Set event listeners if clicking on an end node.
      if (manageEnd) {
        _this.isDisplayLinking = true;
        _this.updateDisplayOrder();

        event.stopImmediatePropagation();
        document.removeEventListener('click', startManageLinks);
        document.addEventListener('click', endManageLinks);
        document.addEventListener('mousemove', followMouse);
      }
    }
    
    function endManageLinks(makeLink) {
      var targetPane, hasClass, mousePosition, endRadius, hoverEnd;
      if (typeof makeLink === 'undefined') makeLink = true;

      // Update state.
      _this.isDisplayLinking = false;

      // Remove the classname potentially added in followMouse(). Cache old state.
      hasClass = _this.nodes.displayEnd.classList.contains('invalid-target');
      _this.nodes.displayEnd.classList.remove('invalid-target');

      if (makeLink) {
        targetPane = _this.pane.editor.getPaneAtCoordinate(_this.drawInfo.display.destination);

        if (!targetPane) {
          _this.showLink(false);
        } else {
          // Necessary to see if the link should be ended or chained with another. (2nd condition)
          mousePosition = { x: mouse.x, y: mouse.y };
          endRadius = targetPane.linkManager.nodes.displayEnd.offsetWidth / 2;
          hoverEnd = pointInCircle(targetPane.linkManager.drawInfo.display.destination, mousePosition, endRadius);

          if (targetPane === _this.pane) {
            _this.pane.linkToPane(false, true);
          }
          else if (!targetPane.linkManager.isDisplayLinking && hoverEnd) {
            // Restore old state and exit without removing event listeners.
            _this.isDisplayLinking = true;
            _this.nodes.displayEnd.classList.toggle('invalid-target', hasClass);
            return;
          }
          else if (_this.pane.canLinkToPane(targetPane)) {
            _this.pane.linkToPane(targetPane);
          }
          else {
            _this.showLink(false);
          }
        }
      } else {
        _this.showLink(false);
      }

      document.addEventListener('click', startManageLinks);
      document.removeEventListener('click', endManageLinks);
      document.removeEventListener('mousemove', followMouse);

      // Restore an appropriate z-index.
      _this.updateDisplayOrder();
    }

    this.pane.on('resize', _.throttle(function() { 
      if (_this.isDisplayLinking) {
        var clientRect = _this.pane.wrapper.getBoundingClientRect();
        _this.drawInfo.display.destination = {
          x: mouse.x,
          y: mouse.y
        };
        _this.drawInfo.display.origin = {
          x: clientRect.left + clientRect.width  / 2,
          y: clientRect.top  + clientRect.height / 2
        }
        drawLine(_this.containers.display, _this.drawInfo.display.origin,
          _this.drawInfo.display.destination);
      } else {
        updateDisplayedLinks(_this.pane, false);
      }

      if (_this.isLinking && !_this.isRemoving) {
        _this.drawLinkLine(_this.drawInfo.link.destination);
      }
    }, 20));

    this.pane.on('link', function(linkedPane, oldPane) {
      if (!_this.isDisplayLinking || linkedPane) {
        updateDisplayedLinks(_this.pane, true, false);
      } else {
        _this.nodes.displayEnd.classList.toggle('link-endpoint', !linkedPane);
      }

      if (_this.isDisplayLinking && !_this.isRemoving && !(oldPane && oldPane.linkManager.isRemoving)) {
        endManageLinks(false);
      }
    });

    this.pane.on('remove.start', function() {
      _this.isRemoving = true;

      // Transition out the link lines.
      _this.containers.link.classList.add('closing');
      _this.containers.display.classList.add('closing');

      _this.endLink(false, true);
    });

    this.pane.on('remove.end', function() {
      _this.pane.editor.linkContainer.removeChild(_this.containers.display);
      _this.pane.editor.linkContainer.removeChild(_this.containers.link);
    });

    this.pane.on('add.start', function() {
      _this.containers.link.classList.add('opening');
      _this.containers.display.classList.add('opening');
    });

    this.pane.on('add.end', function() {
      _this.containers.link.classList.remove('opening');
      _this.containers.display.classList.remove('opening');
    });

    // Event listeners.
    document.addEventListener('click', startManageLinks);
    this.pane.statusLight.addEventListener('mouseup', this.startLinkClickHandler);
    this.pane.linkButton.addEventListener('mouseover', this.showLinkHoverHandler);
    this.pane.linkButton.addEventListener('mouseout', this.hideLinkHoverHandler);
    this.pane.linkButton.addEventListener('click', this.breakLinkClickHandler);

    return this;
  }

  /**
   * Starts the link process by adding a line element and attaching event listeners.
   *
   * @param {MouseEvent} event - The click event to handle.
   */
  LinkManager.prototype.startLink = function(event) {
    // Prevent this click from bubbling up to the document where it would trigger
    // the handler immediately. This also allows chaining several pane's links
    // (since a click on another status light won't trigger the end click
    // handler), which was unexpected but not unwelcome.
    event.stopPropagation();

    // Whether a link is in progress.
    this.isLinking = true;

    // Fade in the line.
    this.containers.link.style.transition = '';
    this.containers.link.style.opacity = 1;

    // Add the link line and add event listeners.
    document.addEventListener('mousemove', this.drawLinkLineMoveHandler);
    document.addEventListener('mouseup', this.endLinkClickHandler);
    document.addEventListener('keydown', this.endLinkKeyHandler);

    // Remove the start listener.
    this.pane.statusLight.removeEventListener('mouseup', this.startLinkClickHandler);
  };

  /**
   * Resets the link process and links the panes based upon the mouse position.
   *
   * If makeLink is false, then the link process will be ended without
   * linking any panes together.
   *
   * @param {Boolean} [makeLink=true] - Whether to link the panes, if possible.
   */
  LinkManager.prototype.endLink = function(makeLink) {
    if (typeof makeLink === 'undefined') makeLink = true;

    // Whether a link is in progress.
    this.isLinking = false;

    // Fade out the line.
    this.containers.link.style.transition = 'height 500ms ease, opacity 300ms ease';
    this.containers.link.style.height     = 0;
    this.containers.link.style.opacity    = 0;

    // Remove event listeners.
    document.removeEventListener('mousemove', this.drawLinkLineMoveHandler);
    document.removeEventListener('mouseup', this.endLinkClickHandler);
    document.removeEventListener('keydown', this.endLinkKeyHandler);

    // Add the start listener again.
    this.pane.statusLight.addEventListener('mouseup', this.startLinkClickHandler);

    // Look for a pane under the cursor and link to it.
    if (makeLink) {
      var targetPane = this.pane.editor.getPaneAtCoordinate(this.drawInfo.link.destination);
      if (targetPane) this.pane.linkToPane(targetPane);
    }
  };

  /**
   * Draws a link line between the status light and the center of the linked pane.
   * Utilizes drawLine().
   *
   * @param {Boolean} [recursive=true] - Whether to show links recursively.
   * @param {Boolean} [transition=true] - Whether to transition changes.
   * @param {Boolean} [animateEnd=true] - Whether to add the 'bounce' effect to the end node, if applicable.
   */
  LinkManager.prototype.showLink = function(recursive, transition, animateEnd) {
    var source, target, sourceClientRect, targetClientRect, origin, destination, isEndNode, isLinkNexus;

    // Set defaults.
    if (typeof recursive  === 'undefined') recursive  = true;
    if (typeof transition === 'undefined') transition = true;
    if (typeof animateEnd === 'undefined') animateEnd = true;

    isEndNode = !this.pane.linkedPane;
    isLinkNexus = this.pane.linkingPanes.length && this.hoverState.nexus;

    // Control end-node size and animation.
    if (!animateEnd) {
      this.nodes.displayEnd.classList.toggle('link-endpoint', isEndNode);
      this.nodes.displayEnd.style.transition = 'none';
      this.nodes.displayEnd.offsetHeight; // Trigger reflow.
      this.nodes.displayEnd.style.transition = '';
    }
    else if (!this.isShowingLink && isEndNode && !this.pane.wrapper.classList.contains('showing-link')) {
      this.nodes.displayEnd.classList.remove('link-endpoint');
      this.nodes.displayEnd.style.transition = 'none';
      this.nodes.displayEnd.offsetHeight; // Trigger reflow.
      this.nodes.displayEnd.style.transition = '';
      this.nodes.displayEnd.classList.add('link-endpoint');
    }
    else {
      this.nodes.displayEnd.classList.toggle('link-endpoint', isEndNode);
    }

    // Conditionally toggle classnames.
    this.nodes.nexus.classList.toggle('link-endpoint', isEndNode);
    this.nodes.nexus.classList.toggle('visible', isLinkNexus);

    // Set transition properties, and fade in the line.
    this.containers.display.style.transition = this.isShowingLink && transition
      ? 'opacity 400ms ease, height 250ms ease-out, -webkit-transform 250ms ease-out'
      : 'opacity 400ms ease';
    this.containers.display.style.opacity = 1;

    /* TODO: Fix a bug where the following command
     * sequence *may* cause the transition to be skipped. This
     * appears to occur because the transition is only set to
     * opacity (see above ternary conditional) when the link
     * is made, but is not always reproducible through the
     * following sequence of commands:
     *
     * > split_h
     * > manage on
     * > link 2
     *
     * Then:
     *
     * > close 2
     * > split_h
     * > link 2
     *
     * The link will (potentially) be made with no transition.
     */

    // Get the light element's position.
    source = this.pane.wrapper;
    sourceClientRect = source.getBoundingClientRect();

    if (!this.pane.linkedPane) {
      // Just show the node centered on the pane.
      target = source;
      targetClientRect = sourceClientRect;
    } else {
      // Show the node on the linked pane.
      target = this.pane.linkedPane.wrapper;
      targetClientRect = target.getBoundingClientRect();
    }

    // Calculate the source position.
    origin = {
      x: sourceClientRect.left + sourceClientRect.width  / 2,
      y: sourceClientRect.top  + sourceClientRect.height / 2
    };

    // Calculate the destination position.
    destination = {
      x: targetClientRect.left + targetClientRect.width  / 2,
      y: targetClientRect.top  + targetClientRect.height / 2
    };

    // Place the destination on a ring around the target pane's center.
    if (this.pane.linkedPane && this.pane.linkedPane.linkManager.hoverState.nexus) {
      destination = getClosestCirclePoint(origin, destination, 50);
    }

    // Position the nexus at the start node position.
    if (isLinkNexus) {
      this.nodes.nexus.style.webkitTransform = 'translate(' + origin.x + 'px, ' + origin.y + 'px)';
    }

    // Store position info.
    this.drawInfo.display.origin = origin;
    this.drawInfo.display.destination = destination;

    // Update z-index.
    this.updateDisplayOrder();

    // Position and size the line.
    drawLine(this.containers.display, origin, destination);

    // Set flag.
    this.isShowingLink = true;

    // Recursively show child links.
    if (recursive && this.pane.linkedPane) {
      this.pane.linkedPane.linkManager.showLink(recursive, transition, animateEnd);
    }
  };

  /**
   * Fades out the link line added in showLink().
   *
   * @param {Boolean} [recursive=true] - If true, shows links recursively.
   * @param {Boolean} [fadeOut=true] - Whether to transition changes.
   */
  LinkManager.prototype.hideLink = function(recursive, fadeOut) {
    var transition;

    // Set defaults.
    if (typeof recursive === 'undefined') recursive = true;
    if (typeof transition === 'undefined') fadeOut = true;

    // Fade out the line.
    if (!fadeOut) {
      transition = this.containers.display.style.transition;
      this.containers.display.style.transition = 'none';
    }

    this.containers.display.style.opacity = 0;

    if (!fadeOut) this.containers.display.style.transition = transition;

    // Unset flag.
    this.isShowingLink = false;

    // Recursively hide child links.
    if (recursive && this.pane.linkedPane) {
      this.pane.linkedPane.linkManager.hideLink(recursive, fadeOut);
    }
  };

  /**
   * Draws a link line between the status light and the mouse position.
   *
   * @param {Object} destination - The point to draw the link line to.
   * @param {Number} destination.x - The x position of the destination.
   * @param {Number} destination.y - The y position of the destination.
   */
  LinkManager.prototype.drawLinkLine = function(destination) {
    // Get the light element's position.
    var clientRect = this.pane.statusLight.getBoundingClientRect();

    // Calculate the source position.
    var origin = {
      x: clientRect.left + clientRect.width  / 2,
      y: clientRect.top  + clientRect.height / 2
    };

    // Store position info.
    this.drawInfo.link.origin = origin;
    this.drawInfo.link.destination = destination;

    // Draw the line.
    drawLine(this.containers.link, origin, destination);

    // Toggle the 'link-endpoint' class if hovering over a valid link target.
    var targetPane = this.pane.editor.getPaneAtCoordinate(destination);
    this.nodes.linkEnd.classList.toggle('link-endpoint', this.pane.canLinkToPane(targetPane));
  };

  /**
   * Resizes and rotates an element so that it stretches between the specified points.
   *
   * @param {Element} line - The element to use.
   * @param {Object} origin - The start point of the line in screen coordinates.
   * @param {Number} origin.x - The x position of the origin.
   * @param {Number} origin.y - The y position of the origin.
   * @param {Object} destination - The end point of the line in screen coordinates.
   * @param {Number} destination.x - The x position of the destination.
   * @param {Number} destination.y - The y position of the destination.
   */
  function drawLine(line, origin, destination) {
    // Get the length of the line.
    var length = Math.sqrt((destination.x - origin.x) * (destination.x - origin.x) +
                           (destination.y - origin.y) * (destination.y - origin.y));

    // Calculate the angle.
    var angle = length ? 180 / 3.1415 * Math.acos((destination.y - origin.y) / length) : 0;
    if (destination.x > origin.x) angle *= -1;

    // If the length is being set to zero, then don't transition angle changes.
    var oldAngle = line.style.webkitTransform.match(/rotate\((.*?)\)/);
    oldAngle = oldAngle ? parseFloat(oldAngle[1], 10) : angle;
    if (length === 0 && oldAngle) angle = oldAngle;

    // Cache the transition.
    var cachedTransition = line.style.transition;
    var cachedOpacity    = line.style.opacity;

    // Get the difference between the angles.
    var angleDifference = angle - oldAngle;
    var smallestDifference = (angleDifference + 180) % 360 - 180;

    // Make the angle transition travel through the smallest arc.
    // This means setting the rotation to a normalized value before transitioning.
    // Add 0.0001 to fix marginal issues with floating point numbers.
    if (length && angleDifference > smallestDifference + 0.0001) {
      line.style.webkitTransform = 'translate(' + origin.x + 'px, ' + origin.y + 'px)'
        + ' ' + 'rotate(' + oldAngle % 360 + 'deg)';
      line.style.opacity = getComputedStyle(line).opacity;

      line.style.transition = 'none';
      line.offsetHeight; // Trigger reflow.
      line.style.transition = cachedTransition;
      line.style.opacity    = cachedOpacity;

      // Normalize the angle.
      angle = oldAngle + smallestDifference;
      angle = angle % 360;
    }

    // Set the line's transformation.
    line.style.webkitTransform = 'translate(' + origin.x + 'px, ' + origin.y + 'px)'
      + ' ' + 'rotate(' + angle + 'deg)';

    // If the transformation is from zero to another position,
    // set the tranform instantaneously (fixes silly rotation issue).
    if (getComputedStyle(line).height === '0px') {
      line.style.opacity    = getComputedStyle(line).opacity;
      line.style.transition = 'none';
      line.offsetHeight; // Trigger reflow.
      line.style.transition = cachedTransition;
      line.style.opacity    = cachedOpacity;
    }

    // Set the line height.
    line.style.height = length + 'px';
  }

  /**
   * Updates the z-index of the display line.
   *
   * @todo Refactor other complicated link states into individual functions.
   *       Each should handle only a single aspect of the overall state,
   *       making everything easier to manage and understand.
   */
  LinkManager.prototype.updateDisplayOrder = function() {
    var isEndNode = !this.pane.linkedPane;

    if (this.isDisplayLinking) {
      // Put the currenly linking pane at the very top.
      this.containers.display.style.zIndex = 400;
    }
    else if (this.pane.linkedPane && this.pane.linkedPane.linkManager.hoverState.nexus) {
      // Put the node above the linked pane's nexus, so that it can be grabbed during hover.
      this.containers.display.style.zIndex = 200;
    }
    else if (this.hoverState.nexus || isEndNode) {
      // Stay on top of nexus, which also gets promoted under these circumstances
      // (see stylesheet for nexus rules).
      this.containers.display.style.zIndex = 300;
    }
    else {
      this.containers.display.style.zIndex = '';
    }
  };

  /**
   * Updates all shown links on panes directly connected to the given pane.
   *
   * @param {Pane} pane - The pane to update. Connected panes will have
   *                      their links updated as well.
   * @param {Boolean} [transition=true] - Whether to transition changes.
   * @param {Boolean} [updateLinking=true] - Whether to update linking panes as well.
   */
  function updateDisplayedLinks(pane, transition, updateLinking) {
    // Exit if the link shouldn't be shown.
    if (!pane.linkManager.isShowingLink || !pane.wrapper.classList.contains('showing-link')) return;

    // Set defaults.
    if (typeof updateLinking === 'undefined') updateLinking = true;
    if (typeof transition === 'undefined') transition = true;

    // Show the link.
    pane.linkManager.showLink(false, transition);

    // Update linking panes recursively.
    if (updateLinking) {
      _.forEach(pane.linkingPanes, function(linkingPane) {
        updateDisplayedLinks(linkingPane, transition, false);
      });
    }
  }

  /**
   * Checks whether a point is within a circle.
   *
   * @param {Object} point    - The point to check.
   * @param {Number} point.x  - The x position of the point.
   * @param {Number} point.y  - The y position of the point.
   * @param {Object} origin   - The origin of the circle.
   * @param {Number} origin.x - The x position of the origin.
   * @param {Number} origin.y - The y position of the origin.
   * @param {Number} radius   - The radius of the circle.
   * @return {Boolean} True if the point is within the circle.
   */
  function pointInCircle(point, origin, radius) {
    var dx = point.x - origin.x;
    var dy = point.y - origin.y;

    return (dx * dx) + (dy * dy) <= (radius * radius);
  }

  /**
   * Returns the closest point on a given circle to another point.
   *
   * @param {Object} point    - The point to get the nearest point to.
   * @param {Number} point.x  - The x position of the point.
   * @param {Number} point.y  - The y position of the point.
   * @param {Object} origin   - The origin of the circle.
   * @param {Number} origin.x - The x position of the origin.
   * @param {Number} origin.y - The y position of the origin.
   * @param {Number} radius   - The radius of the circle.
   * @return {Object} The nearest point lying on the circle.
   */
  function getClosestCirclePoint(point, origin, radius) {
    var p = {};
    var dx = point.x - origin.x;
    var dy = point.y - origin.y;
    var length = Math.sqrt(dx*dx + dy*dy);

    p.x = origin.x + (radius * dx / length);
    p.y = origin.y + (radius * dy / length);

    return p;
  }

/* =======================================================
 *                         Pane
 * ======================================================= */

  /**
   * The Pane base class.
   *
   * Panes are responsible for managing Buffer objects in various ways and displaying
   * them to the user.
   *
   * Note that all pane subclasses must take the buffer as the first argument and the
   * wrapper as the second in order to be usable by Editor.addPane(). Type should not
   * be publically set in the constructor.
   *
   * @todo Find a better way of setting the type property. Currently it is passed as
   *       an argument to the constructor, but that doesn't work for subclasses of
   *       subclasses, where that argument is omitted.
   *
   * @constructor
   * @param {Editor}  editor    - The editor that the pane belongs to.
   * @param {Buffer}  [buffer]  - The buffer to start with.
   * @param {Element} [wrapper] - The element to wrap the pane in.
   * @param {String}  [type='base'] - The type of pane. Parameter only used by subclasses.
   */
  function Pane(editor, buffer, wrapper, type) {
    var _this = this;
    var anchor, prevPane;

    // Mix in event handling.
    Observable.mixin(this);

    // Allows third parties to store data.
    this.data = {};

    // For tracking the position within the editor.
    this.index = {
      column: 0,
      row: 0
    };

    // Defaults.
    this.wrapper = wrapper || document.createElement('div');
    this.type    = type    || 'base';

    // Keep a reference to the editor.
    this.editor = editor;

    // Register focus and blur handlers for the pane.
    this.focuses = {};
    this.registerFocusHandlers();

    // The pane shouldn't be anchored by default.
    this.isAnchored = false;

    // Keep an array of all panes linked to this one.
    this.linkingPanes = [];

    // Save reference to wrapper.
    this.wrapper = wrapper;
    this.wrapper.className = 'pane ' + type;
    this.wrapper.setAttribute('tabIndex', 0);

    // Create the overlay.
    this.overlayElement = document.createElement('div');
    this.overlayElement.className = 'pane-overlay';
    this.wrapper.appendChild(this.overlayElement);

    // Create titlebar elements.
    this.infoBar       = document.createElement('div');
    this.numberElement = document.createElement('span');
    this.titleBar      = document.createElement('div');
    this.titleElement  = document.createElement('span');
    this.linkBar       = document.createElement('div');
    this.linkButton    = document.createElement('div');
    this.statusLight   = document.createElement('div');
    anchor = document.createElement('div');

    // Set class names.
    this.infoBar.className       = 'info-bar';
    this.numberElement.className = 'pane-number';
    this.titleBar.className      = 'title-bar';
    this.titleElement.className  = 'title';
    this.linkBar.className       = 'link-bar';
    this.linkButton.className    = 'link-button';
    this.statusLight.className   = 'status-light';
    anchor.className = 'anchor';

    // Add them all to the DOM.
    this.titleBar.appendChild(this.infoBar);
    this.titleBar.appendChild(this.titleElement);
    this.titleBar.appendChild(this.linkBar);
    this.titleBar.appendChild(anchor);
    this.linkBar.appendChild(this.linkButton);
    this.linkBar.appendChild(this.statusLight);
    this.wrapper.appendChild(this.numberElement);
    this.wrapper.appendChild(this.titleBar);

    // Make the info bar and the info bar the same width.
    this.infoBar.style.width = getComputedStyle(this.linkBar).width;

    // Switch to the buffer.
    this.switchBuffer(buffer || new Buffer());

    // Add the command bar and link manager.
    this.commandBar  = new CommandBar(this);
    this.linkManager = new LinkManager(this);

    // Track resize events on the window.
    window.addEventListener('resize', function() {
      _this.trigger('resize');
    });

    // Remove links if the pane is removed.
    this.on('remove.start', function() {
      if (_this.linkingPanes) _this.unlinkAllPanes(true);
      _this.linkToPane(false, true);
    });

    // Listens for scroll events.
    this.wrapper.addEventListener('scroll', function() {
      _this.trigger('scroll');
    });

    // Keep the number element updated.
    this.editor.on(['addPane', 'removePane', 'updatePaneIndices'], function() {
      _this.updateNumberElement();
    });

    this.on('link', function() {
      _this.updateNumberElement();
    });

    // Run any post-initialization.
    this.postInitialize();

    return this;
  }

  /**
   * Gets the index as a string in the form "column.row".
   *
   * @return {String} The stringified index.
   */
  Pane.prototype.getIndexAsString = function() {
    var index = '' + this.index.column;
    if (this.index.row) index += '.' + this.index.row;

    return index;
  };

  /**
   * Updates the number element.
   * 
   * The number element shows the pane's index, as well
   * as what pane (if any) it is linked to.
   */
  Pane.prototype.updateNumberElement = function() {
    var text = this.getIndexAsString();

    if (this.linkedPane) {
      text += '&thinsp;&rarr;&thinsp;' + this.linkedPane.getIndexAsString();
    }

    this.numberElement.innerHTML = text;
  };

  /**
   * A method meant to be overridden by subclasses.
   * Called after the Pane object has been completely initialized.
   */
  Pane.prototype.postInitialize = function() {};

  /**
   * Sets the focus state on the given focus trigger.
   *
   * @param {String} focus - The focus trigger to set.
   * @param {Boolean} isFocused - The state of the focus trigger.
   */
  Pane.prototype.setFocus = function(focus, isFocused) {
    this.focuses[focus] = isFocused;
    this.updateFocusState();
  }

  /**
   * Responsible for registering focus and blur handlers.
   * Meant to be overridden by subclasses.
   *
   * @todo Figure out why the wrapper's focus event gets called multiple times.
   */
  Pane.prototype.registerFocusHandlers = function() {
    var _this = this;

    // Track focus event.
    this.wrapper.addEventListener('focus', function() {
      _this.setFocus('paneFocus', true);
    });

    // Track blur event.
    this.wrapper.addEventListener('blur', function() {
      _this.setFocus('paneFocus', false);
    });
  };

  /**
   * Sets the isFocused property if any of the pane's focus
   * triggers are set. A focus or blur event will be dispatched
   * if the focus state changes.
   */
  Pane.prototype.updateFocusState = function() {
    var prevState = this.isFocused;

    // Check if any focus triggers are set to true.
    var focused = _.some(this.focuses, function(focus) {
      return focus;
    });

    // Set focus state.
    this.isFocused = focused;

    // Toggle the focus class as necessary.
    this.wrapper.classList.toggle('focus', focused);

    // Fire focus or blur events as appropriate.
    if (!prevState && focused) this.trigger('focus', this);
    else if (prevState && !focused) this.trigger('blur', this);
  };

  /**
   * An overrideable method to set focus on the pane.
   */
  Pane.prototype.focus = function() {
    this.wrapper.focus();
    // updateFocusState() is called by the wrapper's focus event listener.
  };

  /**
   * Switches the active buffer.
   *
   * This will trigger the changeBuffer event, passing the new
   * buffer in as an argument.
   *
   * @param {Buffer} buffer - The buffer to switch to.
   * @param {Boolean} [breakLink=false] - Whether any existing link should be broken.
   * @return {Buffer} The old buffer.
   */
  Pane.prototype.switchBuffer = function(buffer, breakLink) {
    var _this = this;

    // Keep track of the old buffer.
    var oldBuffer = this.buffer;

    // Break the link if requested.
    if (breakLink && this.linkedPane) this.linkToPane(false);

    // Set the new buffer.
    this.buffer = buffer;
    this.trigger('change.buffer', buffer);
    this.trigger('change.content');

    this.titleElement.textContent = buffer.title;

    // Stop tracking the old buffer's changes.
    if (oldBuffer) oldBuffer.off(this.titleChangeID);
    if (oldBuffer) oldBuffer.off(this.contentChangeID);

    // Track the new buffer's title changes.
    this.titleChangeID = buffer.on('change.filepath', function(filepath, title) {
      _this.titleElement.textContent = title;
    });

    // Track the new buffer's content changes.
    this.contentChangeID = buffer.on('change.content', function() {
      _this.trigger('change.content');
    });

    // Add the new buffer to the buffer list.
    this.editor.bufferList.addBuffer(buffer);

    // Return a reference to the old buffer.
    return oldBuffer;
  };

  /**
   * Keeps two panes synchronized.
   *
   * This means that both panes will share their contents, even if one of them switches
   * to a different buffer.
   *
   * @param {Pane|falsey} pane - The pane to link to. Passing a falsey value will remove all links.
   * @param {Boolean} [keepBuffer=false] - Whether to keep the current buffer in the pane, assuming
   *                                       that the pane parameter recieved a falsey argument.
   * @return {Boolean} False if a circular reference would be created, otherwise true.
   */
  Pane.prototype.linkToPane = function(pane, keepBuffer) {
    var oldPane = this.linkedPane;
    var _this = this;
    pane = pane || false;

    // Return early if the pane link is disallowed.
    if (pane && !this.canLinkToPane(pane)) return false;

    // Remove event handlers from old linked pane, and remove
    // this pane from the linked pane's list of linking panes.
    if (this.linkedPane) {
      this.linkedPane.off(this.linkID);
      this.linkedPane.removeLinkingPane(this);
    }

    if (pane) {
      // Anchor the pane.
      this.isAnchored = true;

      // Switch to the new buffer.
      this.switchBuffer(pane.buffer);

      // Add event handlers for the new linked pane.
      this.linkID = pane.on('change.buffer', function(newBuffer) {
        _this.switchBuffer(newBuffer);
      });

      // Let the pane know this pane is linking to it.
      pane.addLinkingPane(this);
    } else {
      // Make the pane cycleable again.
      this.isAnchored = false;

      // Switch to a new buffer.
      if (!keepBuffer) this.switchBuffer(new Buffer());
    }

    // Toggle the link based on whether the pane exists.
    this.wrapper.classList.toggle('has-link', pane);

    // Set the new link pane.
    this.linkedPane = pane;

    // Trigger a link event.
    this.trigger('link', [pane, oldPane]);

    return true;
  };

  /**
   * Returns true if the given pane can link with this one.
   *
   * Note that linkToPane() allows falsey values (to terminate
   * an existing link), but those values will not return true
   * from this function.
   *
   * @param {Pane} pane - The pane to test for linkability.
   * @return {Boolean} Whether or not a link is possible.
   */
  Pane.prototype.canLinkToPane = function(pane) {
    // Only link to panes or subclasses.
    if (pane instanceof Pane === false) return false;

    // Prevent linking to itself or the same same pane.
    if (pane === this || pane === this.linkedPane) return false;

    // Prevent circular links.
    if (pane.linkedPane) {
      for (var p = pane; p.linkedPane; p = p.linkedPane) {
        if (p.linkedPane === this) return false;
      }
    }

    return true;
  }

  /**
   * Unlinks all panes linked to this one.
   *
   * @param {Boolean} [keepBuffer=false] - Whether the linking panes' buffers
   *                                       should be kept when unlinking.
   */
  Pane.prototype.unlinkAllPanes = function(keepBuffer) {
    // Iterates over a copy, since the collection gets modified.
    _.forEach(this.linkingPanes.slice(), function(pane) {
      pane.linkToPane(false, keepBuffer);
    });
  };

  /**
   * Tracks the given pane as being linked to this one.
   *
   * @param {Pane} pane - The pane to track.
   * @return {Boolean} True, if successful.
   */
  Pane.prototype.addLinkingPane = function(pane) {
    var index = this.linkingPanes.indexOf(pane);
    if (index !== -1) return false;

    this.linkingPanes.push(pane);
    return true;
  };

  /**
   * Stops tracking the given pane as being linked to this one.
   *
   * @param {Pane} pane - The pane to stop tracking.
   * @return {Boolean} True, if successful.
   */
  Pane.prototype.removeLinkingPane = function(pane) {
    var index = this.linkingPanes.indexOf(pane);
    if (index === -1) return false;
    
    this.linkingPanes.splice(index, 1);
    return true;
  };

  /**
   * Returns the element housing the pane's contents that
   * is an immediate child of the editor container. 
   *
   * @return {Element} The outermost wrapping element.
   */
  Pane.prototype.getOuterWrapper = function() {
    var parentElement = this.wrapper.parentElement;
    return parentElement.classList.contains('vertical-splitter-pane') ? parentElement : this.wrapper;
  };


/* =======================================================
 *                       InputPane
 * ======================================================= */

  // Inherit from Pane.
  InputPane.prototype = Object.create(Pane.prototype);
  InputPane.prototype.constructor = Pane;

  /**
   * The InputPane class.
   *
   * Input panes allow the user to type into a buffer.
   *
   * @constructor
   * @param {Editor}  editor    - The editor that the pane belongs to.
   * @param {Buffer}  [buffer]  - The buffer to start with.
   * @param {Element} [wrapper] - The element to wrap the pane in.
   * @param {Object}  [options] - A set of options that will override user-set preferences.
   */
  function InputPane(editor, buffer, wrapper, options) {
    var _this = this;

    this.options = options || {};

    // For Ace, even though Pane() does this later.
    wrapper = wrapper || document.createElement('div');
    
    // Create the editor wrapper.
    this.inputWrapper = document.createElement('div');
    this.inputWrapper.className = 'input-area';
    wrapper.appendChild(this.inputWrapper);

    // Create the editor.
    this.ace = ace.edit(this.inputWrapper);

    this.ace.renderer.scrollBar.element.addEventListener('scroll', function() {
      _this.trigger('scroll');
    });

    // Inherit from Pane.
    return Pane.call(this, editor, buffer, wrapper, 'input');
  }

  /**
   * Override Pane.postInitialize.
   */
  InputPane.prototype.postInitialize = function() {
    var _this = this;

    // Make sure that the editor instance is refreshed upon resize,
    // without being called too often (causes animation lag.)
    this.on('resize', function() {
      _this.ace.resize();
    });

    Pane.prototype.postInitialize.call(this);
  }

  /**
   * Sets the editor's mode.
   *
   * @param {String} filetype - The filetype to get the mode of.
   */
  InputPane.prototype.setMode = function(filetype) {
    if (filetype[0] === '.') filetype = filetype.slice(1);

    var prefKey      = prefKeys.filetypes + '.' + filetype + '.input';
    var filePrefs    = Preferences.get(prefKey);
    var defaultPrefs = Preferences.get(prefKeys.defaultFiletype + '.input');
    var prefs        = _.merge(defaultPrefs, filePrefs, this.options);
    var className    = this.inputWrapper.className;
    var match        = className.match(/filetype-\w+/g);
    var fontSize, lineHeight;

    // Set a class on the input wrapper based on the file type.
    if (match) this.inputWrapper.classList.remove(match);
    this.inputWrapper.classList.add('filetype-' + filetype);
    this.inputWrapper.offsetHeight; // Force reflow.

    if (typeof prefs.animatedScroll        !== 'undefined') this.ace.setOption('animatedScroll', prefs.animatedScroll);
    if (typeof prefs.behavioursEnabled     !== 'undefined') this.ace.setOption('behavioursEnabled', prefs.behavioursEnabled);
    if (typeof prefs.displayIndentGuides   !== 'undefined') this.ace.setOption('displayIndentGuides', prefs.displayIndentGuides);
    if (typeof prefs.dragDelay             !== 'undefined') this.ace.setOption('dragDelay', prefs.dragDelay);
    if (typeof prefs.dragEnabled           !== 'undefined') this.ace.setOption('dragEnabled', prefs.dragEnabled);
    if (typeof prefs.enableMultiselect     !== 'undefined') this.ace.setOption('enableMultiselect', prefs.enableMultiselect);
    if (typeof prefs.fadeFoldWidgets       !== 'undefined') this.ace.setOption('fadeFoldWidgets', prefs.fadeFoldWidgets);
    if (typeof prefs.firstLineNumber       !== 'undefined') this.ace.setOption('firstLineNumber', prefs.firstLineNumber);
    if (typeof prefs.fixedWidthGutter      !== 'undefined') this.ace.setOption('fixedWidthGutter', prefs.fixedWidthGutter);
    if (typeof prefs.foldStyle             !== 'undefined') this.ace.setOption('foldStyle', prefs.foldStyle);
    if (typeof prefs.fontFamily            !== 'undefined') this.ace.setOption('fontFamily', prefs.fontFamily);
    if (typeof prefs.fontSize              !== 'undefined') this.ace.setOption('fontSize', prefs.fontSize);
    if (typeof prefs.highlightActiveLine   !== 'undefined') this.ace.setOption('highlightActiveLine', prefs.highlightActiveLine);
    if (typeof prefs.highlightGutterLine   !== 'undefined') this.ace.setOption('highlightGutterLine', prefs.highlightGutterLine);
    if (typeof prefs.highlightSelectedWord !== 'undefined') this.ace.setOption('highlightSelectedWord', prefs.highlightSelectedWord);
    if (typeof prefs.mode                  !== 'undefined') this.ace.setOption('mode', prefs.mode);
    if (typeof prefs.printMargin           !== 'undefined') this.ace.setOption('printMargin', prefs.printMargin);
    if (typeof prefs.printMarginColumn     !== 'undefined') this.ace.setOption('printMarginColumn', prefs.printMarginColumn);
    if (typeof prefs.scrollPastEnd         !== 'undefined') this.ace.setOption('scrollPastEnd', prefs.scrollPastEnd);
    if (typeof prefs.scrollSpeed           !== 'undefined') this.ace.setOption('scrollSpeed', prefs.scrollSpeed);
    if (typeof prefs.showFoldWidgets       !== 'undefined') this.ace.setOption('showFoldWidgets', prefs.showFoldWidgets);
    if (typeof prefs.showGutter            !== 'undefined') this.ace.setOption('showGutter', prefs.showGutter);
    if (typeof prefs.showInvisibles        !== 'undefined') this.ace.setOption('showInvisibles', prefs.showInvisibles);
    if (typeof prefs.showPrintMargin       !== 'undefined') this.ace.setOption('showPrintMargin', prefs.showPrintMargin);
    if (typeof prefs.smoothBlinking        !== 'undefined') this.ace.renderer.$cursorLayer.setSmoothBlinking(prefs.smoothBlinking);
    if (typeof prefs.tabSize               !== 'undefined') this.ace.setOption('tabSize', prefs.tabsSize);
    if (typeof prefs.useSoftTabs           !== 'undefined') this.ace.setOption('useSoftTabs', prefs.useSoftTabs);
    if (typeof prefs.wrap                  !== 'undefined') this.ace.setOption('wrap', prefs.wrap);
    if (typeof prefs.wrapBehavioursEnabled !== 'undefined') this.ace.setOption('wrapBehavioursEnabled', prefs.wrapBehavioursEnabled);
    if (typeof prefs.wrapMethod            !== 'undefined') this.ace.session.setOption('wrapMethod', prefs.wrapMethod);

    // String value = absolute line height.
    // Number value = line height relative to font size.
    if (typeof prefs.lineHeight !== 'undefined') {
      fontSize = this.ace.getOption('fontSize');
      lineHeight = (typeof prefs.lineHeight === 'string')
        ? parseInt(prefs.lineHeight, 10)
        : fontSize * prefs.lineHeight;

      // Set the line height.
      this.ace.renderer.lineHeight = lineHeight;

      // Keep text centered on the line.
      this.ace.renderer.$textLayer.element.style.setProperty('line-height', lineHeight + 'px', '!important');
      this.ace.renderer.$gutterLayer.element.style.lineHeight = lineHeight + 'px';
    }

    // Resize the editor in case the style was changed.
    this.ace.resize();

    // Notify listeners about the change.
    this.trigger('change.mode');
  };

  /**
   * Overrides Pane.registerFocusHandlers().
   */
  InputPane.prototype.registerFocusHandlers = function() {
    var _this = this;
    
    // Track focus event.
    this.ace.on('focus', function() {
      _this.setFocus('inputFocus', true);
    });

    // Track blur event.
    this.ace.on('blur', function() {
      _this.setFocus('inputFocus', false);
    });

    Pane.prototype.registerFocusHandlers.call(this);
  };

  /**
   * Overrides Pane.focus().
   */
  InputPane.prototype.focus = function() {
    this.ace.focus();
  };

  /**
   * Switches the active buffer.
   * Overrides Pane.switchBuffer().
   *
   * @param {Buffer} buffer - The buffer to switch to.
   * @param {Boolean} [breakLink=false] - Whether any existing link should be broken.
   * @return {Buffer} The old buffer.
   */
  InputPane.prototype.switchBuffer = function(buffer, breakLink) {
    var _this = this;

    // Remove old event listeners.
    if (this.buffer) this.buffer.off(this.filetypeChangeID);

    // Call Pane.switchBuffer() and cache the result.
    var result = Pane.prototype.switchBuffer.call(this, buffer, breakLink);

    // Set the pane's contents.
    this.doc = this.buffer.getLink();
    this.ace.setSession(this.doc);
    this.ace.resize();
    
    // Listen for filepath changes on the new buffer.
    this.filetypeChangeID = this.buffer.on('change.filetype', function(filetype) {
      _this.setMode(filetype);
    });

    // Set the mode.
    this.setMode(this.buffer.filetype);
    
    // Return the cached result.
    return result;
  };

/* =======================================================
 *                      PreviewPane
 * ======================================================= */

  // For storing parsing modes.
  PreviewPane.modes = {};

  /**
   * Registers a new parsing mode. The parsing function must take
   * a string as input and returns valid HTML as output.
   *
   * This is a class method, not an instance method.
   *
   * @param {String} name - The name of the mode.
   * @param {Function} func - The parsing func.
   * @return {Boolean} False if the mode name is already defined, else true.
   */
  PreviewPane.registerMode = function(name, func) {
    // Safety check.
    if (typeof this.modes[name] !== 'undefined') return false;

    // Set the mode.
    this.modes[name] = func;
    return true;
  };

  /**
   * Returns the function associated with a mode.
   *
   * @param {String} name - The name of the mode.
   * @return {Function|false} The parsing function, or false if the mode is not defined.
   */
  PreviewPane.getMode = function(name) {
    return (typeof this.modes[name] !== 'undefined') ? this.modes[name] : false;
  }

  // Inherit from Pane.
  PreviewPane.prototype = Object.create(Pane.prototype);
  PreviewPane.prototype.constructor = Pane;

  /**
   * The PreviewPane class.
   *
   * Preview panes are used to parse and display buffer contents.
   *
   * @constructor
   * @param {Editor}  editor    - The editor that the pane belongs to.
   * @param {Buffer}  [buffer]  - The buffer to start with.
   * @param {Element} [wrapper] - The element to wrap the pane in.
   * @param {Object}  [options] - A set of options that will override user-set preferences.
   */
  function PreviewPane(editor, buffer, wrapper, options) {
    // The preview function.
    this.options = options || {};

    // Add a preview area to the wrapper.
    this.previewArea = document.createElement('div');
    this.previewArea.className = 'preview-area';
    wrapper.appendChild(this.previewArea);

    // Inherit from Pane.
    return Pane.call(this, editor, buffer, wrapper, 'preview');
  }

  /**
   * Switch the active buffer.
   * Overrides Pane.switchBuffer().
   *
   * @param {Buffer} buffer - The buffer to switch to.
   * @param {Boolean} [breakLink=false] - Whether any existing link should be broken.
   * @return {Buffer} The old buffer.
   */
  PreviewPane.prototype.switchBuffer = function(buffer, breakLink) {
    var _this = this;

    // Stop tracking the old buffer's changes.
    if (this.buffer) this.buffer.off(this.filetypeChangeID);
    if (this.buffer) this.buffer.off(this.filepathChangeID);
    if (this.buffer) this.buffer.off(this.changeID);
    
    // Listen for filetype changes on the new buffer.
    this.filetypeChangeID = buffer.on('change.filetype', function(filetype) {
      _this.setMode(filetype);
    });

    // Listen for filepath changes on the new buffer.
    this.filepathChangeID = buffer.on('change.filepath', function(filepath, title) {
      _this.preview(buffer);
    });

    // Listen for content changes on the new buffer.
    this.changeID = buffer.on('change.content', function() { _this.preview(buffer); });

    // Set the parsing mode.
    this.setMode(buffer.filetype);

    // Preview the buffer.
    this.preview(buffer);

    return Pane.prototype.switchBuffer.call(this, buffer, breakLink);
  };

  /**
   * Sets the preview mode.
   *
   * @param {String} filetype - The filetype to get the mode of.
   */
  PreviewPane.prototype.setMode = function(filetype) {
    var prefKey      = prefKeys.filetypes + '.' + filetype + '.preview';
    var filePrefs    = Preferences.get(prefKey);
    var defaultPrefs = Preferences.get(prefKeys.defaultFiletype + '.preview');
    var prefs        = _.merge(defaultPrefs, filePrefs, this.options);

    this.parse = PreviewPane.getMode(prefs.mode);
  };

  /**
   * Parses buffer contents and displays them.
   *
   * @param {Buffer} buffer - The buffer to preview.
   */
  PreviewPane.prototype.preview = function(buffer) {
    this.previewArea.innerHTML = this.parse(buffer.text);
  };

/* =======================================================
 *                        Editor
 * ======================================================= */

  /**
   * The Editor class.
   *
   * The Editor class is responsible for managing Pane objects and presenting
   * a display to the user. It also has methods for running user-defineable commands
   * that can further extend functionality.
   *
   * @constructor
   */
  function Editor() {
    var _this = this;
    var timeout = null;

    // Get the editor's container and start with no panes.
    this.container = document.getElementById('editor');
    this.panes = [];
    this.bufferList = new BufferList();
    this.isManagingLinks = false;

    // For chaining commands.
    this.commandPromise = Q();

    // For holding link lines.
    this.linkContainer = document.createElement('div');
    this.linkContainer.className = 'link-line-wrapper';
    document.body.appendChild(this.linkContainer);

    // Mix in event handling.
    Observable.mixin(this);
    return this;
  }

  /**
   * Set up the editor.
   */
  Editor.prototype.init = function() {
    // Add the test panes.
    var input = this.addPane(InputPane, null, 'horizontal', null, true);
    //var preview = this.addPane(PreviewPane, null, 'horizontal', null, true);

    input.focus();
  };

  /**
   * Adds a new pane. If the type is set to 'vertical', then the pane will be
   * inserted into the same vertical compartment as parentPane.
   *
   * For a horizontal split, if parentPane is specified then the new
   * pane will be immediately adjacent to it. If not, it will be appended
   * to the editor container.
   *
   * Note that the editor parameter can be omitted from the arguments to pass to
   * the pane constructor, or can be stated explictly.
   *
   * @todo Contemplate whether or not to emulate vim's behaviour, in that a pane
   *       taking up approximately > 80% of the screen's width/height will be
   *       partitioned in half without effecting any other panes.
   *
   * @param {Function}     constructor         - The constructor of the pane type to add.
   * @param {Array}        args                - An array of arguments to be apply()'d to the constructor.
   * @param {String}       [type='horizontal'] - The orientation of the pane. 
   * @param {Pane}         [parentPane]        - A pane to add the new pane relative to.
   * @param {Boolean|null} [isInstant]         - Whether or not the addition should be instant.
   * @param {Function}     [callback]          - A callback to run after removing the pane.
   * @return {Pane} The newly added pane.
   */
  Editor.prototype.addPane = function(constructor, args, type, parentPane, isInstant, callback) {
    var _this = this;
    var container = this.container;
    var pane, factoryFunction, wrapper, focusPane, outerWrapper;

    // Animate based on set preferences.
    if (isInstant === null || typeof isInstant === 'undefined') {
      isInstant = !Preferences.get(prefKeys.panes + '.animateOpen');
    }

    // Get a safe default split type.
    if (!type || (!this.panes.length && type === 'vertical')) {
      type = 'horizontal';
    }

    // Get a default parent pane.
    if (!parentPane && this.panes.length) {
      parentPane = this.panes[this.panes.length - 1];
    }

    // Default args to an array.
    args = [].concat(args);

    // Keep a reference to the focus pane, since a vertical split could de-focus it.
    focusPane = this.getFocusPane();

    // Add the editor as the first argument if not passed.
    if (args[0] !== this) args.unshift(this);

    // Default the buffer.
    args[1] = args[1] || new Buffer();

    // The wrapper is needed before the pane is created, so get a smart default.
    wrapper = args[2] = args[2] || document.createElement('div');

    if (type === 'vertical' && parentPane) {
      if (parentPane.wrapper.parentNode.classList.contains('vertical-splitter-pane')) {
        // Grab the existing split container.
        container = parentPane.wrapper.parentNode;
      } else {
        // Create the new vertical split container.
        container = document.createElement('div');
        container.className = 'pane vertical-splitter-pane';

        // Put the container into the wrapper's spot and add the wrapper to it.
        this.container.insertBefore(container, parentPane.wrapper);
        container.appendChild(parentPane.wrapper);

        // Make the container's width the same as the wrapper's.
        container.style.transition = 'none';
        container.style.width = parentPane.wrapper.style.width;
        container.offsetHeight; // Trigger reflow.
        container.style.transition = '';
      }
    }

    // Don't allow too many panes.
    // The "* 2 - 1" is to account for splitters.
    var maxVertical   = (Preferences.get(prefKeys.panes + '.maxVertical') * 2) - 1;
    var maxHorizontal = (Preferences.get(prefKeys.panes + '.maxHorizontal') * 2) - 1;
    if ((type === 'vertical'   && container.children.length >= maxVertical) ||
        (type === 'horizontal' && container.children.length >= maxHorizontal)) {
      return false;
    }

    // Add the wrapper to the DOM.
    if (parentPane) {
      outerWrapper = type === 'horizontal'
        ? parentPane.getOuterWrapper()
        : parentPane.wrapper;

      container.insertBefore(wrapper, outerWrapper.nextElementSibling);
    } else {
      container.appendChild(wrapper);
    }

    // Add the splitter to the DOM (unless we're adding the first pane).
    if (this.panes.length) this.addSplitter(container, wrapper, type);
    
    // Add the constructor as the first argument to the factory function.
    args.unshift(constructor);

    // Create the pane.
    factoryFunction = constructor.bind.apply(constructor, args);
    pane = new factoryFunction();

    // Get the correct index and insert the pane.
    if (parentPane) {
      pane.index.column = parentPane.index.column;
      pane.index.row = parentPane.index.row;

      if (type === 'vertical') pane.index.row++;
      else pane.index.column++;

      var insertAfter = type === 'vertical' ? parentPane
        : this.getPaneByIndex(parentPane.index.column, -1);

      this.panes.splice(this.panes.indexOf(insertAfter) + 1, 0, pane);
      this.updatePaneIndices();
    } else {
      pane.index.column = 1;
      pane.index.row = 0;

      this.panes.push(pane);
      this.updatePaneIndices();
    }

    // Trigger the in-progress add event.
    pane.trigger('add.start');

    // Add a class.
    wrapper.classList.add('opening');

    // If adding the pane with a transition, zero out the pane size to avoid
    // unsightly reflows. (For an example, comment out the lines within the first
    // if statement and then add two horizontal splits. The second split will push
    // the first over, then disappear, then animate in again. Doesn't look nice.)
    if (!isInstant) {
      wrapper.classList.add('reset-layout');
      wrapper.offsetHeight; // Trigger reflow.
      wrapper.classList.remove('reset-layout');
    } else {
      wrapper.classList.add('resize-instant');
    }

    // Show the pane's link.
    if (this.isManagingLinks) {
      pane.linkManager.showLink(false);
      pane.wrapper.classList.add('showing-link');
    }

    // Size the panes appropriately.
    sizePanesEvenly(this, container, type, isInstant, null, function() {
      // Refocus the focus pane.
      if (focusPane && !focusPane.isFocused) focusPane.focus();

      // Remove the opening class.
      wrapper.classList.remove('opening');
      if (isInstant) wrapper.classList.remove('resize-instant');

      // Trigger the pane's added event.
      pane.trigger('add.end');

      // Trigger the callback.
      if (callback) callback();
    });

    // Track which pane was most recently focused.
    pane.data.focusOrder = 0;
    pane.on('focus', function() {
      _this.panes.forEach(function(pane) {
        pane.data.focusOrder++;
      });
      
      pane.data.focusOrder = 0;
    });

    // Let listeners know we added a pane.
    this.trigger('addPane', pane);

    return pane;
  };

  /**
   * Removes the specified pane.
   *
   * @param {Pane} pane - The pane to remove.
   * @param {Boolean|null} [isInstant] - Whether or not the addition should be instant.
   *                                     Pass null for default.
   * @param {Function} [callback] - A callback to run after removing the pane.
   */
  Editor.prototype.removePane = function(pane, isInstant, callback) {
    var container        = pane.wrapper.parentElement;
    var sibling          = pane.wrapper.previousElementSibling || pane.wrapper.nextElementSibling;
    var containerParent  = container.parentElement;
    var containerSibling = container.previousElementSibling || container.nextElementSibling;
    var wrapper, splitter, parentElement, direction, newFocus, interval;

    // Animate based on set preferences.
    if (isInstant === null || typeof isInstant === 'undefined') {
      isInstant = !Preferences.get(prefKeys.panes + '.animateClose');
    }

    // A separate case is needed for vertical split panes. For example, removing
    // the last pane in a vertical split should also remove the split container.
    var shouldRemovePane = sibling && sibling.classList.contains('splitter');
    var shouldRemoveParent = !sibling && containerSibling
      && container.classList.contains('vertical-splitter-pane')
      && containerSibling.classList.contains('splitter');

    // It's the last pane, so just give it a new buffer and return early.
    if (!shouldRemovePane && !shouldRemoveParent) {
      pane.switchBuffer(new Buffer());
      if (callback) callback();
      return false;
    }

    // Operate on the correct elements.
    if (shouldRemovePane) {
      parentElement = container;
      wrapper       = pane.wrapper;
      splitter      = sibling;
    } else {
      parentElement = containerParent;
      wrapper       = container;
      splitter      = containerSibling;
    }

    // Get the proper resize direction.
    direction = splitter.classList.contains('splitter-horizontal') ? 'horizontal' : 'vertical';

    // Clean up pane references.
    this.panes.splice(this.panes.indexOf(pane), 1);

    // Fix the pane content's size (prevents visual noise when transitioning out).
    var computedStyle = getComputedStyle(wrapper.firstChild);
    wrapper.firstChild.style.transition  = 'none';
    wrapper.firstChild.style.marginLeft  = computedStyle.marginLeft;
    wrapper.firstChild.style.width       = computedStyle.width;
    wrapper.firstChild.style.height      = computedStyle.height;
    wrapper.firstChild.offsetHeight; // Trigger reflow.

    // Trigger the in-progress remove event.
    pane.trigger('remove.start');

    // Transition out the panes.
    wrapper.classList.add('closing');
    splitter.classList.add('closing');
    if (isInstant) wrapper.classList.add('resize-instant');

    // Trigger resize events on an interval.
    interval = setInterval(function() {
      pane.trigger('resize');
    }, 10);

    // Remove the pane and resize the remaining panes.
    sizePanesEvenly(this, parentElement, direction, isInstant, wrapper, function() {
      parentElement.removeChild(splitter);
      parentElement.removeChild(wrapper);
      clearInterval(interval);

      // Trigger the pane's removed event.
      pane.trigger('remove.end');

      // Trigger the callback.
      if (callback) callback();
    });

    // Update pane indices and focus another pane.
    this.updatePaneIndices();
    this.focusPane();

    // Let listeners know we removed a pane.
    this.trigger('removePane');
  };

  /**
   * Inserts a splitter into a container.
   * Splitters are used to resize panes.
   *
   * @todo Refactor this into its own class. Right now it's over
   *       200 lines of code long, and the separate drag handlers
   *       could probably be combined (each being 50 lines by
   *       themselves).
   * @todo Factor out the drag detection into a utility class so that
   *       it can be used elsewhere without code duplication.
   * @todo Move the constant terms used to calculate the minimum width
   *       and height into a public property on the editor object (since
   *       it is also used to calculate the maximum number of panes).
   *
   * @param {Element} container - The element to insert the splitter into.
   * @param {Element} child - The element after which the splitter should be inserted.
   * @param {String} type - The direction the splitter should move in.
   */
  Editor.prototype.addSplitter = function(container, child, type) {
    var splitter = document.createElement('div');
    var isDrag   = false;
    var _this    = this;
    var lastX, lastY, deltaX, deltaY, dragHandler, resizePanes, prev, next;

    splitter.className = 'splitter splitter-' + type;
    container.insertBefore(splitter, child);

    if (type === 'horizontal') {
      dragHandler = function(event) {
        var totalWidth, parentWidth, prevWidth, nextWidth, maxHorizontalSplits, minWidth;

        // Do nothing if this isn't a drag.
        if (!isDrag) return; 

        // Calculate the delta.
        deltaX = lastX - event.screenX;
        lastX = event.screenX;

        // Get the panes' combined width.
        totalWidth = prev.offsetWidth + next.offsetWidth;

        // Get all the panes' cumulative width.
        parentWidth = splitter.parentNode.offsetWidth;

        // Get new width.
        prevWidth = prev.offsetWidth - deltaX;
        nextWidth = next.offsetWidth + deltaX;

        // The minimum width.
        maxHorizontalSplits = Preferences.get(prefKeys.panes + '.maxHorizontal');
        minWidth = parentWidth / (maxHorizontalSplits * 2);

        // Don't allow the dimensions to break the min.
        if (prevWidth < minWidth) {
          lastX += Math.round(minWidth - prevWidth);
          prevWidth = minWidth;
          nextWidth = totalWidth - prevWidth;
        }
        else if (nextWidth < minWidth) {
          lastX -= Math.round(minWidth - nextWidth);
          nextWidth = minWidth;
          prevWidth = totalWidth - nextWidth;
        }

        /* // Debugging
        console.log('parent:', parentWidth);
        console.log('total:', totalWidth);
        console.log('next:', nextWidth);
        console.log('prev:', prevWidth);
        console.log('------------------');
        */

        // Set the new width in percent.
        prev.style.width = ((prevWidth / parentWidth) * 100) + '%';
        next.style.width = ((nextWidth / parentWidth) * 100) + '%';

        // Trigger resize events on the affected panes.
        _.forEach(resizePanes, function(pane) {
          pane.trigger('resize');
        });
      };
    }
    else if (type === 'vertical') {
      dragHandler = function(event) {
        var totalHeight, parentHeight, prevHeight, nextHeight, maxVerticalSplits, minHeight;

        // Do nothing if this isn't a drag.
        if (!isDrag) return; 

        // Calculate the delta.
        deltaY = lastY - event.screenY;
        lastY = event.screenY;

        // Get the panes' combined height.
        totalHeight = prev.offsetHeight + next.offsetHeight;

        // Get all the panes' cumulative width.
        parentHeight = splitter.parentNode.offsetHeight;

        // Get new heights.
        prevHeight = prev.offsetHeight - deltaY;
        nextHeight = next.offsetHeight + deltaY;

        // Minimum height.
        maxVerticalSplits = Preferences.get(prefKeys.panes + '.maxVertical');
        minHeight = parentHeight / (maxVerticalSplits * 2);

        // Don't allow the dimensions to break the min.
        if (prevHeight < minHeight) {
          lastY += Math.round(minHeight - prevHeight);
          prevHeight = minHeight;
          nextHeight = totalHeight - prevHeight;
        }
        else if (nextHeight < minHeight) {
          lastY -= Math.round(minHeight - nextHeight);
          nextHeight = minHeight;
          prevHeight = totalHeight - nextHeight;
        }

        /* // Debugging
        console.log('parent:', parentHeight);
        console.log('total:', totalHeight);
        console.log('next:', nextHeight);
        console.log('prev:', prevHeight);
        console.log('------------------');
        */

        // Set the new heights in percent.
        prev.style.height = ((prevHeight / parentHeight) * 100) + '%';
        next.style.height = ((nextHeight / parentHeight) * 100) + '%';

        // Trigger resize events on the affected panes.
        _.forEach(resizePanes, function(pane) {
          pane.trigger('resize');
        });
      };
    }

    // Start the drag on mousedown.
    splitter.addEventListener('mousedown', function(event) {
      var children = [];

      // Prevent the drag from selecting text.
      event.preventDefault();

      // Initialize drag variables.
      isDrag = true;
      lastX  = event.screenX;
      lastY  = event.screenY;
      deltaX = deltaY = 0;
      prev   = splitter.previousElementSibling;
      next   = splitter.nextElementSibling;

      // This will hold all pane that need to receive
      // the resize event.
      resizePanes = [];

      // Get the pane, or its sub-panes if applicable.
      if (prev.classList.contains('vertical-splitter-pane')) {
        children = children.concat(Array.prototype.slice.call(prev.children));
      } else {
        children.push(prev);
      }

      // Get the pane, or its sub-panes if applicable.
      if (next.classList.contains('vertical-splitter-pane')) {
        children = children.concat(Array.prototype.slice.call(next.children));
      } else {
        children.push(next);
      }

      // Filter out any splitters.
      children = _.filter(children, function(child) {
        return !child.classList.contains('splitter');
      });

      // Store the panes for later.
      _.forEach(children, function(child) {
        resizePanes.push(_this.getPaneByElement(child));
      });

      // Disable transitioning during the drag.
      prev.classList.add('disable-transition');
      next.classList.add('disable-transition');

      // Allow styling based on resize state.
      if (type === 'horizontal') {
        prev.classList.add('resize', 'resize-x');
        next.classList.add('resize', 'resize-x');
        _this.container.classList.add('resize', 'resize-x');
      } else {
        prev.classList.add('resize', 'resize-y');
        next.classList.add('resize', 'resize-y');
        _this.container.classList.add('resize', 'resize-y');
      }

      // Add the drag handler.
      document.addEventListener('mousemove', dragHandler);
    });

    // Cancel the drag on mouseup.
    document.addEventListener('mouseup', function(event) {
      // Reset not needed if a drag wasn't triggered.
      if (!isDrag) return;

      // Reset drag state.
      isDrag = false;
      
      // Re-enable transitions.
      prev.classList.remove('disable-transition');
      next.classList.remove('disable-transition');

      // Allow styling based on resize state.
      prev.classList.remove('resize', 'resize-x', 'resize-y');
      next.classList.remove('resize', 'resize-x', 'resize-y');
      _this.container.classList.remove('resize', 'resize-x', 'resize-y');

      // Remove the drag handler.
      document.removeEventListener('mousemove', dragHandler);
    });
  };

  /**
   * Cycles the pane's buffers in order without changing the panes'
   * positions. Skips over panes that are anchored in place.
   *
   * @todo Sort panes in a logical (probably physical) order, not
   *       by order added.
   */
  Editor.prototype.cyclePaneBuffers = function() {
    var panes  = _.filter(this.panes, { 'isAnchored': false });
    var length = panes.length;
    var temp   = panes[0].switchBuffer(panes[length - 1].buffer);

    for (var i = 1; i < length; i++) {
      temp = panes[i].switchBuffer(temp);
    }
  };

  /**
   * Starts link management mode.
   */
  Editor.prototype.manageLinks = function() {
    _.forEach(this.panes, function(pane) {
      pane.linkManager.showLink(false, true, false);
      pane.wrapper.classList.add('showing-link');
    });

    this.isManagingLinks = true;
    this.container.classList.add('managing-links');
  };

  /**
   * Ends link management mode.
   */
  Editor.prototype.endManageLinks = function() {
    _.forEach(this.panes, function(pane) {
      pane.linkManager.hideLink(false);
      pane.wrapper.classList.remove('showing-link');
    });

    this.isManagingLinks = false;
    this.container.classList.remove('managing-links');
  };

  /**
   * Returns the focused pane.
   *
   * @return {Pane|false} The focused pane, or false if no pane has focus.
   */
  Editor.prototype.getFocusPane = function() {
    return _.find(this.panes, 'isFocused') || false;
  };

  /**
   * Focuses a new pane, if needed.
   *
   * @todo Come up with a new name for this less likely
   *       to cause confusion with getFocusPane().
   *
   * @return {Pane} The newly focused pane.
   */
  Editor.prototype.focusPane = function() {
    // Because Array.sort() changes the array in place.
    var copy = this.panes.slice();

    // The currently focused pane.
    var current = this.getFocusPane();
    if (current) return current;

    // The most recently focused input pane.
    var recent = copy.filter(function(pane) {
      return pane instanceof InputPane;
    })
    .sort(function(pane) {
      return pane.data.focusOrder;
    })[0];

    if (recent) {
      recent.focus();
      return recent;
    }

    // The most recently focused pane of any type.
    var fallback = copy.sort(function(pane) {
      return pane.data.focusOrder;
    })[0];

    fallback.focus();
    return fallback;
  };

  /**
   * Returns the pane with the specified element as a wrapper.
   *
   * @param {Element} element - The wrapper element to find the pane of.
   * @return {Pane|false} The pane with the given wrapper, or false if not found.
   */
  Editor.prototype.getPaneByElement = function(element) {
    return _.find(this.panes, function(pane) {
      return pane.wrapper === element;
    }) || false;
  };

  /**
   * Returns the pane at the given screen position.
   *
   * @param {Object} point - The position to check for a pane.
   * @param {Number} point.x - The horizontal position to check.
   * @param {Number} point.y - The vertical position to check.
   * @return {Pane|false} The pane at the given position, or false if none exists.
   */
  Editor.prototype.getPaneAtCoordinate = function(point) {
    var target = document.elementFromPoint(point.x, point.y);
    var paneElement = ancestorWithClass(target, 'pane');

    return paneElement ? this.getPaneByElement(paneElement) : false;
  };

  /**
   * Returns the pane at the given column and row.
   *
   * Passing negative numbers will return the nth last column/row.
   *
   * @param {Integer|String} column - The column of the pane, or the full index as a string.
   * @param {Integer} row - The row of the pane.
   * @return {Pane|false} The pane with the given index, or false if not found.
   */
  Editor.prototype.getPaneByIndex = function(column, row) {
    // Parse the index from a string, using just the first argument.
    if (typeof column === 'string') {
      var index = column.split('.');
      column    = parseInt(index[0], 10);
      row       = parseInt(index[1], 10) || 0;
    }

    // Find the pane by checking for a column and row match.
    if (column < 0) {
      var maxColumn = this.panes[this.panes.length - 1].index.column;
      column = maxColumn + (column + 1);
    }

    if (row < 0) {
      var maxRow = _(this.panes).filter(function(pane) {
        return pane.index.column === column;
      })
      .max(function(pane) {
        return pane.index.row;
      })
      .value().index.row;

      row = maxRow + (row + 1);
    }

    return _.find(this.panes, function(pane) {
      return pane.index.column === column && pane.index.row === row;
    }) || false;
  };

  /**
   * Makes sure that the pane indices follow each other, i.e. 1.1 follows
   * 1.0, and not another 1.1 because of how they're added.
   * 
   * Pane indices increase by 1 for every column, and by .1 for every row. This
   * means that the pane in the 3rd column and 5th row would have an index of
   * 3.5. Note that the numbers won't roll over to each other -- it's perfectly
   * possible to have a pane at an index of, say, 2.11, though not without
   * changing the maximum row count in the editor's preferences.
   */
  Editor.prototype.updatePaneIndices = function() {
    if (!this.panes.length) return;

    // Start with the first pane: index 1.0.
    var last = this.panes[0];
    var lastWrapper = last.getOuterWrapper();
    last.index.column = 1;
    last.index.row = 0;
    last.numberElement.textContent = 1;

    // Increase index by 1 for every column, and by .1 for every row.
    for (var i = 1; i < this.panes.length; i++) {
      var current = this.panes[i];
      var currentWrapper = current.getOuterWrapper();

      if (currentWrapper === lastWrapper && currentWrapper !== this.container) {
        current.index.column = last.index.column;
        current.index.row = last.index.row + 1;
      } else {
        current.index.column = last.index.column + 1;
        current.index.row = 0;
      }

      last = current;
      lastWrapper = currentWrapper;
    }

    // Notify listeners.
    this.trigger('updatePaneIndices');
  }


  /**
   * Divides up the space evenly among panes in the given direction.
   *
   * A pane's size is assumed to be zero if it is listed in 'exclusions'.
   *
   * @param {Editor} editor - The editor to resize panes from.
   * @param {Element} container - The element containing the panes.
   * @param {String} direction - The direction to resize the panes in.
   * @param {Boolean} [isInstant=false] - Whether to apply the resize without a transition. 
   * @param {Element|Element[]} [exclusions] - Any pane wrappers to exclude.
   * @param {Function} [callback] - A callback to run after resizing the panes.
   */
  function sizePanesEvenly(editor, container, direction, isInstant, exclusions, callback) {
    var children      = container.children;
    var paneCount     = (children.length + 1) / 2;
    var property      = (direction === 'horizontal') ? 'width' : 'height';
    var otherProperty = (direction === 'horizontal') ? 'height' : 'width';
    var child, size, interval;

    // Don't count exclusions.
    exclusions = [].concat(exclusions || []);
    paneCount -= exclusions.length;
    size = 1 / paneCount * 100;

    // Iterate by 2's to avoid splitters.
    for (var i = 0; i < children.length; i += 2) {
      child = children[i];

      // Skip ahead if child is excluded.
      if (exclusions.indexOf(child) !== -1) continue;

      // Disable transition.
      if (isInstant) child.classList.add('disable-transition');

      child.classList.add('resizing');

      // Set the new size.
      child.style[property] = size + '%';
      child.style[otherProperty] = '';
      child.offsetHeight; // Trigger reflow.

      // Re-enable transitions.
      if (isInstant) child.classList.remove('disable-transition');
    }

    // Triggers a resize on all affected panes.
    function triggerResize() {
      _.forEach(editor.panes, function(pane) {
        pane.trigger('resize');
      });
    }

    // Finshes off the resize.
    function finish() {
      triggerResize();

      for (var i = 0; i < children.length; i += 2) {
        children[i].classList.remove('resizing');
      }

      if (callback) callback();
    }

    // If instant, finish without waiting for a transition.
    if (isInstant) {
      finish();
      return;
    }

    // Trigger resize events on an interval.
    interval = setInterval(triggerResize, 10);

    // Just use the last child, since the timing is the same for all of them.
    child.addEventListener('transitionend', function listen(event) {
      if (event.propertyName === property) {
        clearInterval(interval);
        finish();
        child.removeEventListener('transitionend', listen);
      }
    });
  }

  /**
   * Returns the ancestor element that has the specified class.
   * @see http://stackoverflow.com/a/16863971/1270419
   *
   * @param {Element} element - The element to start with.
   * @param {String} className - The class to check for.
   * @return {Element|false} The ancestor with the given class, or
   *                         false if not found.
   */
  function ancestorWithClass(element, className) {
    if (element.classList && element.classList.contains(className)) return element;
    return element.parentNode && ancestorWithClass(element.parentNode, className);
  }

/* =======================================================
 *                      CommandBar
 * ======================================================= */

  /**
   * The CommandBar class.
   *
   * This class is responsible for accepting typed commands
   * from a user and parsing the into Command objects and a
   * set of matching arguments.
   *
   * @constructor
   * @param {Pane} pane - The pane to add this command bar to.
   */
  function CommandBar(pane) {
    var element = document.createElement('div');
    var _this = this;

    // Set the class name and make its contents editable.
    element.className = 'command-bar';
    element.setAttribute('contentEditable', true);

    // Make the contentEditable div act like a resizable textarea.
    element.addEventListener('keydown', function(event) {
      // Create the <br> element and get the selection and range.
      var newline   = document.createElement('br');
      var selection = window.getSelection();
      var range     = selection.getRangeAt(0);

      // Insert <br> instead of <div></div> on enter press.
      if (event.keyCode === 13) {
        event.preventDefault();

        // Clear the range.
        range.deleteContents();

        // Insert the newline before the cursor.
        range.insertNode(newline);
        range.selectNode(newline);
        range.collapse(false);

        // Reset the range.
        selection.removeAllRanges();
        selection.addRange(range);
      }

      // Keep a <br> element at the end of the command bar. Fixes a problem where
      // the enter key needs to be hit twice to insert a newline when the cursor is 
      // at the end of the input.
      if (element.lastChild && element.lastChild.nodeName !== 'BR') {
        element.appendChild(document.createElement('br'));
      }
    });

    // Set focus trigger.
    element.addEventListener('focus', function() {
      _this.focus();
    });

    // Close on blur if no content has been entered.
    element.addEventListener('blur', function() {
      if (!_this.hasText()) _this.close();
      else _this.blur();
    });

    // Toggle the command bar with ESC.
    pane.wrapper.addEventListener('keydown', function(event) {
      if (event.keyCode !== 27 || !pane.isFocused || pane.linkManager.isLinking) return;
      event.stopPropagation();

      /**
       * Events proceed in this order:
       * 1) If unopened, open the bar.
       * 2) If opened and unfocused, focus the bar.
       * 3) If opened and focused, run commands and close.
       */

      if (!_this.isOpen) {
        _this.open();
      }
      else if (!pane.focuses['commandBarFocus']) {
        _this.focus();
      }
      else {
        _this.runCommands();
        _this.close();
      }
    });

    // Keep references.
    this.pane    = pane;
    this.element = element;

    return this;
  }

  /**
   * Opens up the command bar in the given pane.
   */
  CommandBar.prototype.open = function() {
    // Exit if already open.
    if (this.isOpen) return;
    this.isOpen = true;

    // Add the command bar element.
    this.pane.wrapper.appendChild(this.element);
    this.focus();
  };

  /**
   * Removes the command bar.
   */
  CommandBar.prototype.close = function() {
    // Exit if already closed.
    if (!this.isOpen) return;
    this.isOpen = false;

    // Close the command bar and refocus the pane if needed.
    this.pane.wrapper.removeChild(this.element);
    this.blur();
  };

  /**
   * Toggles the command bar.
   */
  CommandBar.prototype.toggle = function() {
    if (this.isOpen) this.close();
    else this.open();
  };

  /**
   * Focuses the command bar and moves the cursor to the end of the
   * input area.
   */
  CommandBar.prototype.focus = function() {
    var range, selection;

    // Only do this if the command bar is open.
    if (!this.isOpen) return;

    // Focus the bar.
    this.element.focus();

    // Keep the focus on the pane.
    this.pane.setFocus('commandBarFocus', true);

    // Moves the cursor to the end of the input.
    range = document.createRange();
    range.selectNodeContents(this.element);
    range.collapse(false);
    selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  };

  /**
   * Blurs the command bar and returns focus to the pane.
   */
  CommandBar.prototype.blur = function() {
    var isFocused = this.pane.isFocused;
    this.pane.setFocus('commandBarFocus', false);
    if (isFocused) this.pane.focus();
  };

  /**
   * Runs the contents of the command bar as commands.
   */
  CommandBar.prototype.runCommands = function() {
    // Exit if there isn't any text entered.
    if (!this.hasText()) return;

    // Get the text content and clear the input.
    var text = this.element.innerText;
    this.element.innerText = '';

    // Run entered text as a command.
    var promise = this.pane.editor.commandPromise;
    if (!promise.isPending()) promise = Q();
    promise = CommandManager.runCommand(text, promise);
  };

  /**
   * Returns whether there is text entered in the input area or not.
   * Whitespace is not counted.
   *
   * @return {Boolean} Whether or not the command bar contains text.
   */
  CommandBar.prototype.hasText = function() {
    return this.element.textContent.replace(/\s+/g, '') !== '';
  };

/* =======================================================
 *                       Preferences
 * ======================================================= */

  // Preference keys.
  var prefKeys = {
    root:            'extensions.editor',
    panes:           'extensions.editor.panes',
    filetypes:       'extensions.editor.filetypes',
    defaultFiletype: 'extensions.editor.filetypes.default'
  };

  Preferences.set(prefKeys.panes, {
    maxHorizontal: 3,
    maxVertical: 4,
    animateOpen: true,
    animateClose: true,
    defaultExtension: '.mkd'
  });

  Preferences.set(prefKeys.defaultFiletype, {
    input: {
      animatedScroll:        false,
      behavioursEnabled:     true,
      displayIndentGuides:   true,
      dragDelay:             150,
      dragEnabled:           true,
      enableMultiselect:     true,
      fadeFoldWidgets:       true,
      firstLineNumber:       1,
      fixedWidthGutter:      true,
      foldStyle:             undefined,
      fontFamily:            'Cousine',
      fontSize:              16,
      highlightActiveLine:   false,
      highlightGutterLine:   false,
      highlightSelectedWord: true,
      lineHeight:            1.2, /* Pixel value or multipler of text (just like CSS). */
      mode:                  'ace/mode/plain_text',
      printMargin:           false,
      printMarginColumn:     80,
      scrollPastEnd:         true,
      scrollSpeed:           1.3,
      showFoldWidgets:       true,
      showGutter:            true,
      showInvisibles:        false,
      showPrintMargin:       false,
      smoothBlinking:        true,
      tabSize:               4,
      useSoftTabs:           true,
      wrap:                  true, /* (true|'free') | (false|'off') | (-1|'printMargin') | (Integer) */
      wrapBehavioursEnabled: true,
      wrapMethod:            'auto' /* 'code'|'text'|'auto' */
    },
    preview: {
      mode: 'plain_text'
    }
  });

  Preferences.set(prefKeys.filetypes + '.js', {
    input: {
      mode: 'ace/mode/javascript',
      fontFamily: 'Consolas',
      fontSize: 14
    }
  });

  Preferences.set(prefKeys.filetypes + '.mkd', {
    input: {
      mode: 'ace/mode/markdown',
      showGutter:          false,
      displayIndentGuides: false,
      lineHeight:          1.6
    },
    preview: {
      mode: 'markdown'
    }
  });

  PreviewPane.registerMode('plain_text', function(input) {
    return input;
  });

  /**
   * Defines a mode that parses markdown into HTML.
   *
   * @todo Get rid of this and implement parsing using
   *       Pandoc (http://johnmacfarlane.net/pandoc/). Doing
   *       so will require writing a C++ binding to run scripts
   *       on the command line.
   */
  PreviewPane.registerMode('markdown', function(input) {
    return marked(input, {
      gfm: true,
      tables: true,
      breaks: true,
      pedantic: false,
      sanitize: false,
      smartLists: true,
      smartypants: false,
      langPrefix: 'lang-'
    });
  });

/* =======================================================
 *                        Exports
 * ======================================================= */

  global.Editor             = Editor;
  global.Editor.Buffer      = Buffer;
  global.Editor.Pane        = Pane;
  global.Editor.InputPane   = InputPane;
  global.Editor.PreviewPane = PreviewPane;
}(this);

