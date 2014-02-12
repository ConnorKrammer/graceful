/**
 * graceful-editor
 *
 * Defines the Editor class, as well as several namespaced classes (Editor.Buffer, Editor.Pane,
 * Editor.InputPane, etc.) that relate to text editing functionality.
 */


!function(global) {
  'use strict';

  var inputModeKey = 'inputmode';
  var previewModeKey = 'previewmode';

  /**
   * Initial test of the Preferences extension.
   */
  Preferences.default(['filetypes.mkd.inputmode', 'filetypes.default.inputmode'], { name: 'markdown-lite' });
  Preferences.default(['filetypes.mkd.previewmode', 'filetypes.default.previewmode'], parseMarkdown);

  /**
   * Parses markdown into HTML.
   *
   * @todo Get rid of this and implement parsing using
   *       Pandoc (http://johnmacfarlane.net/pandoc/). Doing
   *       so will require writing a C++ binding to run scripts
   *       on the command line.
   */
  function parseMarkdown(input) {
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
  }

/* =======================================================
 *                         Buffer
 * ======================================================= */

  /**
   * The Buffer class.
   *
   * This class is responsible for managing a file's contents
   * and syncing updates across all subscribing panes.
   *
   * @constructor
   * @param {String} [text=''] - The text to begin the document with.
   * @param {String} [filepath=null] - The filepath to associate the buffer with.
   * @param {Object|String} [mode] - The CodeMirror mode to use for the document.
   * @param {Object} [history] - Any edit history to attach to the buffer.
   */
  function Buffer(text, filepath, mode, history) {
    var _this = this;
    var index, filetype;

    // Mix in event handling.
    Observable(this);

    // Set the initial filepath.
    if (!filepath) {
      this.title = 'new';
      this.filepath = null;
    } else {
      this.setFilepath(filepath);
    }

    // Set default and allow easy access to document text.
    this.text = text = text || '';

    // Get the mode default.
    mode = mode || detectMode(this.filepath, inputModeKey);

    // The master document.
    this.rootDoc = CodeMirror.Doc(text, mode);

    // Set the document history, if specified.
    if (history) this.rootDoc.setHistory(history);

    // Start with a clean state.
    this.markClean();

    // Allow changes to the root document to trigger a change event.
    this.rootDoc.on('change', _.throttle(function(doc, change) {
      _this.text = doc.getValue();
      _this.markClean(false);
      _this.trigger('change', [_this]);
    }, 20));

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
    // This gets the text after the last delimeter character and sets it as the title.
    // If the string doesn't contain either '/' or '\', index will equal zero, and
    // title will equal the whole string.
    var index = Math.max(filepath.lastIndexOf('/'), filepath.lastIndexOf('\\')) + 1;
    var title = filepath.substr(index);

    // Set the new filepath and title.
    this.filepath = filepath;
    this.title = title;

    // Notify listeners that the filepath changed.
    this.trigger('changeFilepath', [filepath, title]);
  };

  /**
   * Sets the buffer contents. The buffer contents will also
   * be marked as clean, unless otherwise specified.
   *
   * @param {String} content - The new editor content.
   * @param {Boolean} [isClean] - Whether to set the editor contents as clean.
   */
  Buffer.prototype.setContent = function(content, isClean) {
    this.rootDoc.setValue(content);
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
   * Returns a linked CodeMirror document.
   *
   * @return {CodeMirror.Doc} The linked document.
   */
  Buffer.prototype.getLink = function() {
    return this.rootDoc.linkedDoc({ sharedHist: true });
  };

  /**
   * Detects a suitable mode from a filepath.
   *
   * If unable to detect a mode, the default is fetched from
   * application preferences.
   *
   * @param {String} filepath - The path to detect the mode from.
   * @param {String} key - The preference key to fetch the mode from.
   * @return {Object} The detected mode object.
   */
   function detectMode(filepath, key) {
    var index, filetype;

    if (filepath) {
      index    = filepath.lastIndexOf('.');
      filetype = filepath.substr(index + 1);
    } else {
      filetype = 'default';
    }

    return Preferences.get('filetypes.' + filetype + '.' + key) ||
      Preferences.get('filetypes.default.' + key);
  };

/* =======================================================
 *                       StatusLight
 * ======================================================= */

  /**
   * The StatusLight class.
   *
   * Manages the visual aspects of linking two panes, namely the handlers on the click
   * and mousemove events, and the drawing of the link line to represent this action.
   *
   * Note that the link line is the line drawn when attempting to make a link, and the
   * link display line is the line drawn when showing an *existing* link.
   *
   * For line drawing method, see {@link http://www.amaslo.com/2012/06/drawing-diagonal-line-in-htmlcssjs-with.html|here}.
   *
   * @todo Tidy up event handling.
   * @todo Allow rearrangement of linking order by dragging around the nodes
   *       on the ends of link lines.
   * 
   * @constructor
   * @param {Pane} pane - The pane to attach the status light to.
   */
  function StatusLight(pane) {
    var _this = this;
    var timer = null;

    // Keep a reference to the pane.
    this.pane = pane;

    // Event handlers.
    this.drawLinkLineMoveHandler = _.throttle(this.drawLinkLine.bind(this), 10); 
    this.startLinkClickHandler = this.startLink.bind(this);
    this.endLinkClickHandler = this.endLink.bind(this);
    this.endLinkKeyHandler = function(event) {
      if (event.keyCode === 27) {
        _this.endLink(false);
      }
    };
    this.transitionEndHandler = function(event) {
      if (event.propertyName === 'opacity') {
        // Reset property values.
        this.style.transition = '';
        this.style.height     = '';
        this.style.opacity    = '';

        // Remove the link-endpoint class if present.
        event.target.classList.remove('link-endpoint');

        // Remove the line.
        _this.pane.editor.linkLineContainer.removeChild(event.target);
      }
    };
    this.showLinkHoverHandler = function(event) {
      if (!_this.isShowingLink) {
        timer = window.setTimeout(_this.showLink.bind(_this), 150, event);
      }
    }
    this.hideLinkHoverHandler = function(event) {
      if (!_this.isShowingLink && timer) {
        window.clearTimeout(timer);
        timer = null;
        _this.hideLink();
      }
    };
    this.breakLinkClickHandler = function(event) {
      // Stop this from triggering the end of a link.
      event.stopPropagation();

      // Break the link and update displayed links.
      _this.hideLink(false);
      _this.pane.linkToPane(false);
      updateDisplayedLinks(_this.pane);
    };

    // Create the link line element.
    this.linkLine = document.createElement('div');
    this.linkLine.className = 'link-line';

    // Create the link display element.
    this.linkDisplayLine = document.createElement('div');
    this.linkDisplayLine.className = 'link-line link-line-display';

    // Create the link bar.
    this.linkBar = document.createElement('div');
    this.linkBar.className = 'link-bar';

    // Create the link button.
    this.linkButton = document.createElement('div');
    this.linkButton.className = 'link-button';
    this.linkButton.addEventListener('mouseover', this.showLinkHoverHandler);
    this.linkButton.addEventListener('mouseout', this.hideLinkHoverHandler);
    this.linkButton.addEventListener('click', this.breakLinkClickHandler);

    // Create the status light.
    this.linkLight = document.createElement('div');
    this.linkLight.className = 'status-light';
    this.linkLight.addEventListener('click', this.startLinkClickHandler);

    // Add elements to the DOM.
    pane.infoBar.appendChild(this.linkBar);
    this.linkBar.appendChild(this.linkButton);
    this.linkBar.appendChild(this.linkLight);

    // Update displayed links on pane resize.
    pane.on('resize', function() { updateDisplayedLinks(pane); });

    return this;
  }

  /**
   * Starts the link process by adding a line element and attaching event listeners.
   *
   * @param {MouseEvent} event - The click event to handle.
   */
  StatusLight.prototype.startLink = function(event) {
    // Prevent this click from bubbling up to the document where it would trigger
    // the handler immediately. This also allows chaining of several pane's
    // links (since a click on another status light won't trigger the end click
    // handler), which was unexpected but not unwelcome.
    event.stopPropagation();

    // Add the link line and add event listeners.
    this.pane.editor.linkLineContainer.appendChild(this.linkLine);
    document.addEventListener('mousemove', this.drawLinkLineMoveHandler);
    document.addEventListener('click', this.endLinkClickHandler);
    document.addEventListener('keydown', this.endLinkKeyHandler);

    // Remove the start listener.
    this.linkLight.removeEventListener('click', this.startLinkClickHandler);
  };

  /**
   * Resets the link process and links the panes based upon the mouse position.
   *
   * @param {Boolean} [makeLink=true] - Whether to link the panes, if possible.
   */
  StatusLight.prototype.endLink = function(makeLink) {
    makeLink = makeLink || (typeof makeLink === 'undefined') ? true : false;

    // Reset the link line's state.
    this.linkLine.style.transition = 'height 0.3s ease, opacity 0.2s ease';
    this.linkLine.style.height     = '0px';
    this.linkLine.style.opacity    = 0;
    this.linkLine.addEventListener('transitionend', this.transitionEndHandler);

    // Remove event listeners.
    document.removeEventListener('mousemove', this.drawLinkLineMoveHandler);
    document.removeEventListener('click', this.endLinkClickHandler);
    document.removeEventListener('keydown', this.endLinkKeyHandler);

    // Add the start listener again.
    this.linkLight.addEventListener('click', this.startLinkClickHandler);

    // Look for a pane under the cursor and link to it.
    if (makeLink) {
      var targetPane = this.pane.editor.getPaneAtCoordinate(this.destinationX, this.destinationY);
      if (targetPane) this.pane.linkToPane(targetPane);

      if (this.pane.editor.container.classList.contains('showing-links')) {
        updateDisplayedLinks(this.pane);
      }
    }
  };

  /**
   * Draws a link line between the status light and the center of the linked pane.
   * Utilizes drawLine().
   *
   * @param {Boolean} [recursive=true] If true, shows links recursively.
   */
  StatusLight.prototype.showLink = function(recursive) {
    if (typeof recursive === 'undefined') recursive = true;

    // Don't show the link if it doesn't exist.
    if (!this.pane.linkedPane) return;

    // Set flag.
    this.isShowingLink = true;

    // Add the link line to the document body.
    // This is done first so that offsetWidth can be accessed.
    if (!this.linkDisplayLine.parentElement) {
      fadeIn(this.pane.editor.linkLineContainer, this.linkDisplayLine, 200, 'ease-in');
    }

    // Get the light element's position.
    var source    = this.pane.wrapper;
    var target    = this.pane.linkedPane.wrapper;
    var position1 = source.getBoundingClientRect();
    var position2 = target.getBoundingClientRect();

    // Calculate the source position.
    var origin = {
      x: position1.left + source.offsetWidth  / 2 - this.linkDisplayLine.offsetWidth / 2,
      y: position1.top  + source.offsetHeight / 2 - this.linkDisplayLine.offsetWidth / 2
    };

    // Calculate the destination position.
    var destination = {
      x: position2.left + target.offsetWidth  / 2 - this.linkDisplayLine.offsetWidth / 2,
      y: position2.top  + target.offsetHeight / 2 - this.linkDisplayLine.offsetWidth / 2
    };

    // Position and size the line.
    drawLine(this.linkDisplayLine, origin, destination);

    // Show the line with an endpoint.
    this.linkDisplayLine.classList.toggle('link-endpoint', !this.pane.linkedPane.linkedPane);

    // Recursively show child links.
    if (recursive) this.pane.linkedPane.statusLight.showLink();
  };

  /**
   * Fades out the link line added in showLink().
   *
   * @param {Boolean} [recursive=true] If true, shows links recursively.
   */
  StatusLight.prototype.hideLink = function(recursive) {
    if (typeof recursive === 'undefined') recursive = true;

    // Unset flag.
    this.isShowingLink = false;

    // Remove the display line.
    fadeOut(this.linkDisplayLine, 200, 'ease-in');

    // Recursively hide child links.
    if (recursive && this.pane.linkedPane) {
      this.pane.linkedPane.statusLight.hideLink();
    }
  };

  /**
   * Draws a link line between the status light and the mouse position.
   *
   * @param {MouseEvent} event - The mousemove event to handle.
   */
  StatusLight.prototype.drawLinkLine = function(event) {
    // Get the light element's position.
    var position = this.linkLight.getBoundingClientRect();

    // Calculate the source position.
    var originX = position.left + this.linkLight.offsetWidth  / 2 - this.linkLine.offsetWidth / 2;
    var originY = position.top  + this.linkLight.offsetHeight / 2;

    // Calculate the destination position.
    var mouseX = this.destinationX = event.pageX - this.linkLine.offsetWidth / 2;
    var mouseY = this.destinationY = event.pageY;

    // Draw the line.
    drawLine(this.linkLine, { x: originX, y: originY }, { x: mouseX, y: mouseY });

    // Toggle the 'inlink-endpoint' class if not hovering over a valid link target.
    // Look for a pane under the cursor and link to it.
    var targetPane = this.pane.editor.getPaneAtCoordinate(this.destinationX, this.destinationY);

    if (targetPane) {
      this.linkLine.classList.toggle('link-endpoint', this.pane.canLinkToPane(targetPane));
    } else {
      this.linkLine.classList.remove('link-endpoint');
    }
  };

  /**
   * Adds an element to another element and fades it in from transparent.
   * The fade will be for the given duration, and with the specified easing
   * function. Note that the easing function must be CSS-compliant.
   *
   * @param {Element} parentElement - The element to add the transitioned element to.
   * @param {Element} element - The element to fade in.
   * @param {Number} duration - The duration, in milliseconds, of the fade.
   * @param {String} easing - The easing function to use for the transition.
   */
  function fadeIn(parentElement, element, duration, easing) {
    element.style.opacity = 0;
    element.style.transition = 'opacity ' + duration + 'ms ' + easing;
    
    parentElement.appendChild(element);
    element.offsetHeight; // Force reflow.
    element.style.opacity = 1;

    element.removeEventListener('transitionend', finishFadeOut);
    element.addEventListener('transitionend', finishFadeIn);
  }

  /**
   * Completes the fade-in effect started by fadeIn().
   *
   * @param {TransitionEvent} event - The transitionend event to handle.
   */
  function finishFadeIn(event) {
    var target = event.target;

    target.style.opacity = '';
    target.style.transition = '';
    target.removeEventListener('transitionend', finishFadeIn);
  }

  /**
   * Fades an element out for the given duration, with the specified
   * easing. Note that the easing function must be CSS-compliant.
   *
   * @param {Element} element - The element to fade out.
   * @param {Number} duration - The duration, in milliseconds, of the fade.
   * @param {String} easing - The easing function to use for the transition.
   */
  function fadeOut(element, duration, easing) {
    element.style.opacity = 0;
    element.style.transition = 'opacity ' + duration + 'ms ' + easing;

    element.removeEventListener('transitionend', finishFadeIn);
    element.addEventListener('transitionend', finishFadeOut);
  }

  /**
   * Completes the fade-out effect started by fadeOut(), and removes
   * the element.
   *
   * @param {TransitionEvent} event - The transitionend event to handle.
   */
  function finishFadeOut(event) {
    var target = event.target;

    target.style.opacity = '';
    target.style.transition = '';
    target.parentNode.removeChild(target);
    target.removeEventListener('transitionend', finishFadeOut);
  }

  /**
   * Resizes and rotates an element so that it stretches between the specified points.
   *
   * @param {Element} line - The element to use.
   *
   * @param {Object} origin - The start point of the line in screen coordinates.
   * @param {Number} origin.x - The x position of the origin.
   * @param {Number} origin.y - The y position of the origin.
   *
   * @param {Object} destination - The end point of the line in screen coordinates.
   * @param {Number} destination.x - The x position of the destination.
   * @param {Number} destination.y - The y position of the destination.
   */
  function drawLine(line, origin, destination) {
    // Get the length of the line.
    var length = Math.sqrt((destination.x - origin.x) * (destination.x - origin.x) +
                           (destination.y - origin.y) * (destination.y - origin.y));

    // Calculate the angle.
    var angle = 180 / 3.1415 * Math.acos((destination.y - origin.y) / length);
    if (destination.x > origin.x) angle *= -1;

    // Draw the line from the source to the destination.
    line.style.height = length + 'px';
    line.style.top    = origin.y + 'px';
    line.style.left   = origin.x + 'px';
    line.style.webkitTransform = 'rotate(' + angle + 'deg)';
  }

  /**
   * Updates all shown links on panes directly connected to the given pane.
   *
   * @param {Pane} pane - The pane to update. Connected panes will have
   *        their links updated as well.
   */
  function updateDisplayedLinks(pane) {
    var show = pane.editor.container.classList.contains('showing-links');

    // Update pane.
    if (show) pane.statusLight.showLink(false);

    // Update connected panes as well.
    _.forEach(pane.linkingPanes, function(linkingPane) {
      if (show) linkingPane.statusLight.showLink(false);
    });
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
   * @param {Editor} editor - The editor that the pane belongs to.
   * @param {Buffer} [buffer=new Buffer()] - The buffer to start with.
   * @param {Element} [wrapper=document.createElement('div')] - The element to wrap the pane in.
   * @param {String} [type='base'] - The type of pane. Parameter only used by subclasses.
   */
  function Pane(editor, buffer, wrapper, type) {
    var _this = this;

    // Mix in event handling.
    Observable(this);

    // Defaults.
    buffer  = buffer  || new Buffer();
    wrapper = wrapper || document.createElement('div');
    type    = type    || 'base';

    // Keep a reference to the editor.
    this.editor = editor;

    // Set type.
    this.type = type;

    // Define an object to hold focus triggers.
    this.focuses = {};

    // Save reference to wrapper.
    this.wrapper = wrapper;
    this.wrapper.className = 'pane ' + type;
    this.wrapper.setAttribute('tabIndex', 0);

    // Create the info bar.
    this.infoBar = document.createElement('div');
    this.infoBar.className = 'infobar';

    // Add a title to the info bar.
    this.titleElement = document.createElement('span');
    this.titleElement.className = 'title';
    this.infoBar.appendChild(this.titleElement);

    // Add a status light to the info bar.
    this.statusLight = new StatusLight(this);

    // Add the anchor icon.
    var anchor = document.createElement('div');
    anchor.className = 'anchor';
    this.infoBar.appendChild(anchor);

    // Add the info bar to the wrapper.
    this.wrapper.appendChild(this.infoBar);

    // Add the command bar.
    this.commandBar = new CommandBar(this);

    // Toggle the command bar with ESC. Opens it if it's closed,
    // focuses it if it's unfocused, and runs the commands otherwise.
    this.wrapper.addEventListener('keydown', function(event) {
      // Only proceed on ESC keypress.
      if (event.keyCode !== 27) return;
      event.stopPropagation();

      if (!_this.commandBar.isOpen) {
        _this.commandBar.toggle();
      } else {
        if (!_this.focuses['commandBarFocus']) {
          _this.commandBar.focus();
        } else {
          _this.commandBar.runCommands();
          _this.commandBar.toggle();
        }
      }
    });

    // Set the buffer.
    this.switchBuffer(buffer);

    // The pane shouldn't be anchored by default.
    this.isAnchored = false;

    // Keep an array of all panes linked to this one.
    this.linkingPanes = [];

    // Register focus and blur handlers for the pane.
    this.registerFocusHandlers();

    // Track resize events.
    window.addEventListener('resize', function() {
      _this.trigger('resize');
    });

    // Run any post-initialization.
    this.postInitialize();

    return this;
  }

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

    // Check if any focuse triggers are set to true.
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

    // Break the link if requested.
    if (breakLink && this.linkedPane) this.linkToPane(false);

    // Keep track of the old buffer.
    var oldBuffer = this.buffer;

    // Set the new buffer.
    this.buffer = buffer;
    this.trigger('changeBuffer', [buffer]);

    this.titleElement.textContent = buffer.title;

    // Stop tracking the old buffer's title changes.
    if (typeof this.titleChangeID !== 'undefined') {
      oldBuffer.off(this.titleChangeID);
    }

    // Track the new buffer's title.
    this.titleChangeID = buffer.on('changeFilepath', function(filepath, title) {
      _this.titleElement.textContent = title;
    });

    // Return a reference to the old buffer.
    return oldBuffer;
  };

  /**
   * Keeps two panes synchronized.
   *
   * This means that both panes will share their contents, even if one of them switches
   * to a different buffer.
   *
   * @param {Pane|False} pane - The pane to link to. Passing a falsey value will remove all links.
   * @return {Boolean} False if a circular reference would be created, otherwise true.
   */
  Pane.prototype.linkToPane = function(pane) {
    // Return early if the pane link is disallowed.
    if (pane && !this.canLinkToPane(pane)) return false;

    // Remove event handlers from old linked pane, and remove
    // this pane from the linked pane's list of linking panes.
    if (this.linkedPane) {
      this.linkedPane.off(this.linkID);
      this.linkedPane.removeLinkingPane(this);
    }

    if (pane) {
      // This pane shouldn't be cycle-able.
      this.isAnchored = true;

      // Switch to the new buffer.
      this.switchBuffer(pane.buffer);

      // Add event handlers for the new linked pane.
      var _this = this;
      this.linkID = pane.on('changeBuffer', function(newBuffer) {
        _this.switchBuffer(newBuffer);
      });

      // Let the pane know this pane is linking to it.
      pane.addLinkingPane(this);
    } else {
      // Make the pane cycleable again.
      this.isAnchored = true;

      // Switch to a new buffer.
      this.switchBuffer(new Buffer());
    }

    // Toggle the link based on whether the pane exists.
    this.wrapper.classList.toggle('has-link', pane);

    // Set the new link pane.
    this.linkedPane = pane;

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

    // Prevent linking to self or the same pane.
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
   */
  Pane.prototype.unlinkAllPanes = function() {
    _.forEach(this.linkingPanes, function(pane) {
      pane.linkToPane(false);
    });
  };

  /**
   * Tracks the given pane as being linked to this one.
   *
   * @param {Pane} pane - The pane to track.
   */
  Pane.prototype.addLinkingPane = function(pane) {
    this.linkingPanes.push(pane);
  };

  /**
   * Stops tracking the given pane as being linked to this one.
   *
   * @param {Pane} pane - The pane to stop tracking.
   */
  Pane.prototype.removeLinkingPane = function(pane) {
    this.linkingPanes.splice(this.linkingPanes.indexOf(this), 1);
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
   * For a description of valid values for the editorConfig parameter,
   * see {@link http://codemirror.net//doc/manual.html#config|here}.
   *
   * @constructor
   * @param {Editor} editor - The editor that the pane belongs to.
   * @param {Buffer} [buffer=new Buffer()] - The buffer to start with.
   * @param {Element} [wrapper=document.createElement('div')] - The element to wrap the pane in.
   * @param {Object} [editorConfig] - A configuration object to pass to the CodeMirror constructor.
   */
  function InputPane(editor, buffer, wrapper, editorConfig) {
    // Merge in defaults with the supplied configuration.
    editorConfig = _.merge({
      lineWrapping: true,
      undoDepth: 1000
    }, editorConfig);

    // For CodeMirror, even though Pane() handles this later.
    wrapper = wrapper || document.createElement('div');
    
    // Create the editor.
    this.cm = CodeMirror(wrapper, editorConfig);

    // Inherit from Pane.
    return Pane.call(this, editor, buffer, wrapper, 'input');
  }

  /**
   * Sets the editor's mode.
   *
   * For a description of valid values for the mode parameter,
   * see {@link http://codemirror.net//doc/manual.html#option_mode|here}.
   *
   * @param {String|Object} mode The mode for the editor.
   */
  InputPane.prototype.setMode = function(mode) {
    this.cm.setOption('mode', mode);
  };

  /**
   * Overrides Pane.registerFocusHandlers().
   */
  InputPane.prototype.registerFocusHandlers = function() {
    var _this = this;
    
    // Track focus event.
    this.cm.on('focus', function() {
      _this.setFocus('inputFocus', true);
    });

    // Track blur event.
    this.cm.on('blur', function() {
      _this.setFocus('inputFocus', false);
    });

    Pane.prototype.registerFocusHandlers.call(this);
  };

  /**
   * Overrides Pane.focus().
   */
  InputPane.prototype.focus = function() {
    this.cm.focus();
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

    this.doc = buffer.getLink();
    this.cm.swapDoc(this.doc);
    this.cm.refresh();

    // Remove old event listeners.
    if (typeof this.filetypeChangeID !== 'undefined') {
      this.buffer.off(this.filetypeChangeID);
    }
    
    // Listen for filepath changes on the new buffer.
    this.filetypeChangeID = buffer.on('changeFilepath', function(filepath, title) {
      _this.setMode(detectMode(filepath, inputModeKey));
    });

    // Detect and set a mode.
    this.setMode(detectMode(buffer.filepath, inputModeKey));
    
    return Pane.prototype.switchBuffer.call(this, buffer, breakLink);
  };

/* =======================================================
 *                      PreviewPane
 * ======================================================= */

  // Inherit from Pane.
  PreviewPane.prototype = Object.create(Pane.prototype);
  PreviewPane.prototype.constructor = Pane;

  /**
   * The PreviewPane class.
   *
   * Preview panes are used to parse and display buffer contents.
   *
   * @constructor
   * @param {Editor} editor - The editor that the pane belongs to.
   * @param {Buffer} [buffer=new Buffer()] - The buffer to start with.
   * @param {Element} [wrapper=document.createElement('div')] - The element to wrap the pane in.
   * @param {Function} [parse] - The parsing function, which accepts a string as input and returns it parsed.
   */
  function PreviewPane(editor, buffer, wrapper, parse) {
    // The preview function.
    this.parse = parse || detectMode(buffer.filepath, previewModeKey);

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

    // Remove old event listeners.
    if (typeof this.filetypeChangeID !== 'undefined') {
      this.buffer.off(this.filetypeChangeID);
    }
    
    // Listen for filepath changes on the new buffer.
    this.filetypeChangeID = buffer.on('changeFilepath', function(filepath, title) {
      _this.parse = detectMode(filepath, previewModeKey);
    });

    // Detect and set a mode.
    this.parse = detectMode(buffer.filepath, previewModeKey);

    if (typeof this.changeID !== 'undefined') {
      this.buffer.off(this.changeID);
    }

    this.changeID = buffer.on('change', this.preview.bind(this));
    this.preview(buffer);

    return Pane.prototype.switchBuffer.call(this, buffer, breakLink);
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
   * that can extend functionality further.
   *
   * @todo After creating a key combination class, move the show/hide links
   *       functionality over to it.
   * @todo Use a better key than CTRL. Right now it conflicts badly with other
   *       common key combinations. (Though using a timeout does help.)
   *
   * @constructor
   * @param {String} containerID - The id of the element to insert the editor into.
   */
  function Editor(containerID) {
    var _this = this;
    var timeout = null;

    // Get the editor's container and start with no panes.
    this.container = document.getElementById('editor');
    this.panes = [];

    // Command-related properties.
    this.commandDictionary = {};
    this.commandHistory = [];

    // For holding link lines.
    this.linkLineContainer = document.createElement('div');
    this.linkLineContainer.className = 'link-line-container';
    document.body.appendChild(this.linkLineContainer);

    // On CTRL press, show all pane links.
    this.container.addEventListener('keydown', function(event) {
      // Only proceed on CTRL keypress.
      if (event.keyCode !== 17) return;

      // Execute the function after a timeout.
      timeout = setTimeout(function() {
        // Add a class to display state.
        _this.container.classList.add('showing-links');

        // Show all links.
        _.forEach(_this.panes, function(pane) {
          pane.statusLight.showLink(false);
        });
      }, 500);
    });

    // On CTRL release, hide all links again.
    this.container.addEventListener('keyup', function(event) {
      // Only proceed on CTRL keypress.
      if (event.keyCode !== 17) return;

      if (timeout) {
        // Clear the timeout.
        clearTimeout(timeout);

        // Remove the class.
        _this.container.classList.remove('showing-links');

        // Hide all links.
        _.forEach(_this.panes, function(pane) {
          pane.statusLight.hideLink(false);
        });
      }
    });

    return this;
  }

  /**
   * Outdated function that is currently being used for setup.
   *
   * @todo Get rid of this.
   */
  Editor.prototype.init = function() {
    // Add the test panes.
    var input = this.addPane(InputPane, null, 'horizontal');
    //var preview = this.addPane(PreviewPane, null, 'horizontal');
  };

  /**
   * Adds a new pane. If the type is set to 'vertical', then the pane will be
   * inserted into the same vertical compartment as parentPane.
   *
   * Note that the editor parameter can be omitted from the arguments to pass to
   * the pane constructor, or can be stated explictly.
   *
   * @todo Add the new pane immediately after the parent pane.
   * @todo Contemplate whether or not to emulate vim's behaviour, in that a pane
   *       taking up approximately > 80% of the screen's width/height will be
   *       partitioned in half without effecting any other panes.
   * @todo Create a cleaner method for passing in the arguments to the pane's
   *       constructor.
   *
   * @param {Function} constructor - The constructor of the pane type to add.
   * @param {Array} args - An array of arguments, to be passed in order to the constructor.
   * @param {String} type - The orientation of the pane. Passing 'vertical' will
   *        create the split vertically, while 'horizontal' splits it in the horizontal
   *        direction.
   */
  Editor.prototype.addPane = function(constructor, args, type, parentPane) {
    var container = this.container;
    var pane, factoryFunction, wrapper, focusPane;

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
    // The addition is to account for splitters.
    if ((type === 'vertical' && container.children.length >= 5 + 4) ||
        (type === 'horizontal' && container.children.length >= 3 + 2)) {
      return false;
    }

    // Add the wrapper to the DOM.
    if (this.panes.length) this.addSplitter(container, type);
    container.appendChild(wrapper);
    
    // Add the constructor as the first argument to the factory function.
    args.unshift(constructor);

    // Create the pane.
    factoryFunction = constructor.bind.apply(constructor, args);
    pane = new factoryFunction();

    // Add the pane to the pane list.
    this.panes.push(pane);
    sizePanesEvenly(this, container, type);

    // Vertical splits cause display issues.
    if (type === 'vertical') {
      _.forEach(this.panes, function(pane) {
        if (pane instanceof InputPane) {
          pane.cm.refresh();
        }
      });
    }

    // Refocus the focus pane.
    if (focusPane) focusPane.focus();

    return pane;
  };

  /**
   * Remove the specified pane.
   *
   * @param {Pane} pane - The pane to remove.
   */
  Editor.prototype.removePane = function(pane) {
    var container        = pane.wrapper.parentElement;
    var sibling          = pane.wrapper.previousElementSibling || pane.wrapper.nextElementSibling;
    var containerParent  = container.parentElement;
    var containerSibling = container.previousElementSibling || container.nextElementSibling;
    var newFocus;

    // Separate cases are needed for cases including vertical splitters.
    // For example, removing the last pane in a vertical split should also remove the split.
    var shouldRemovePane = sibling && sibling.classList.contains('splitter');
    var shouldRemoveParent = !sibling && containerSibling
      && container.classList.contains('vertical-splitter-pane')
      && containerSibling.classList.contains('splitter');

    if (shouldRemovePane) {
      // Remove the pane.
      container.removeChild(pane.wrapper);
      container.removeChild(sibling);
      this.panes.splice(this.panes.indexOf(pane), 1);

      // Unlink all linking panes.
      if (pane.linkingPanes) pane.unlinkAllPanes();

      // Resize the remaining panes.
      if (sibling.classList.contains('splitter-horizontal')) {
        sizePanesEvenly(this, container, 'horizontal');
      } else {
        sizePanesEvenly(this, container, 'vertical');
      }
    }
    else if (shouldRemoveParent) {
      // Remove the vertical split housing the pane.
      containerParent.removeChild(container);
      containerParent.removeChild(containerSibling);
      this.panes.splice(this.panes.indexOf(pane), 1);

      // Unlink all linking panes.
      if (pane.linkingPanes) pane.unlinkAllPanes();

      // Resize the remaining panes.
      sizePanesEvenly(this, containerParent, 'horizontal');
    }
    else {
      // It's the last pane, so just give it a new buffer.
      pane.switchBuffer(new Buffer());
    }

    // Focus another pane.
    newFocus = _.find(this.panes, { 'type': 'input' }) || this.panes[0];
    newFocus.focus();
  };

  /**
   * Inserts a splitter into a container.
   * Splitters are used to resize panes.
   *
   * @todo Refactor this into its own class. Right now it's over
   *       200 lines of code long, and the separate drag handlers
   *       could probably be combined (each being 50 lines by
   *       themselves).
   * @todo Add an argument specifying after which child the splitter
   *       should be added.
   * @todo Factor out the drag detection into a utility class so that
   *       it can be used elsewhere without code duplication.
   * @todo Move the constant terms used to calculate the minimum width
   *       and height into a public property on the editor object (since
   *       it is also used to calculate the maximum number of panes).
   *
   * @param {Element} container - The element to insert the splitter into.
   * @param {String} type - The direction the splitter should move in.
   */
  Editor.prototype.addSplitter = function(container, type) {
    var splitter = document.createElement('div');
    var isDrag   = false;
    var _this    = this;
    var lastX, lastY, deltaX, deltaY, dragHandler, resizePanes, prev, next;

    splitter.className = 'splitter splitter-' + type;
    container.appendChild(splitter);

    if (type === 'horizontal') {
      dragHandler = function(event) {
        var prevWidth, prevMinWidth, prevMaxWidth,
          nextWidth, nextMinWidth, nextMaxWidth, totalWidth, parentWidth;

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

        // Don't allow the dimensions to break the min.
        if (prevWidth < parentWidth / 5) {
          prevWidth = prevMinWidth;
          nextWidth = totalWidth - prevWidth;
        }

        // Don't allow the dimensions to break the min.
        if (nextWidth < parentWidth / 5) {
          nextWidth = nextMinWidth;
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

        // Use a resize cursor for the duration of the drag.
        document.body.style.cursor = 'e-resize';
      };
    }
    else if (type === 'vertical') {
      dragHandler = function(event) {
        var prevHeight, prevMinHeight, prevMaxHeight,
          nextHeight, nextMinHeight, nextMaxHeight, totalHeight, parentHeight;

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

        // Don't allow the dimensions to break the min.
        if (prevHeight < parentHeight / 10) {
          prevHeight = prevMinHeight;
          nextHeight = totalHeight - prevHeight;
        }

        // Don't allow the dimensions to break the min.
        if (nextHeight < parentHeight / 10) {
          nextHeight = nextMinHeight;
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

        // Use a resize cursor for the duration of the drag.
        document.body.style.cursor = 'n-resize';
      };
    }

    // Prevent lag from over-use.
    dragHandler = _.throttle(dragHandler, 20);

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

      // Add the drag handler.
      document.addEventListener('mousemove', dragHandler);
    });

    // Cancel the drag on mouseup.
    document.addEventListener('mouseup', function(event) {
      // Reset not needed if a drag wasn't triggered.
      if (!isDrag) return;

      // Reset drag and cursor state.
      document.body.style.cursor = '';
      isDrag = false;
      
      // Re-enable transitions.
      prev.classList.remove('disable-transition');
      next.classList.remove('disable-transition');

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
   * Returns the focused pane.
   *
   * @return {Pane|False} The focused pane, or false if no pane has focus.
   */
  Editor.prototype.getFocusPane = function() {
    return _.find(this.panes, 'isFocused') || false;
  };

  /**
   * Returns the pane with the specified element as a wrapper.
   *
   * @param {Element} element - The wrapper element to find the pane of.
   * @return {Pane|False} The pane with the given wrapper, or false if no
   *         pane has the wrapper specified.
   */
  Editor.prototype.getPaneByElement = function(element) {
    return _.find(this.panes, function(pane) {
      return pane.wrapper === element;
    }) || false;
  };

  /**
   * Returns the pane at the given screen position.
   *
   * @param {Number} x - The horizontal position to check.
   * @param {Number} y - The vertical position to check.
   * @return {Pane|False} The pane at the given position, or false if none exists.
   */
  Editor.prototype.getPaneAtCoordinate = function(x, y) {
    var target = document.elementFromPoint(x, y);
    var paneElement = ancestorWithClass(target, 'pane');

    return paneElement ? this.getPaneByElement(paneElement) : false;
  };

  /**
   * Defines a command.
   *
   * @param {String}   name      - The name of the command.
   * @param {Integer}  argCount  - The number of arguments the command function accepts.
   * @param {Function} func      - The function the command invokes.
   * @param {String}   delimeter - The delimeter between function arguments.
   * @param {Boolean}  forceLast - Whether the command should be pushed to the end
   *                               of the call list when several commands are run
   *                               sequentially.
   * @return {Boolean} Returns false if the command already exists or contains
   *         whitespace, otherwise true.
   */
  Editor.prototype.defineCommand = function(name, argCount, func, delimeter, forceLast) {
    // Trim whitespace.
    name = name.trim();

    // Don't allow whitespace in name.
    if (/\s/g.test(name)) {
      console.log("Command '" + name + "' cannot contain whitepace in name.");
      return false;
    }

    // Don't overwrite an existing command.
    if (this.commandDictionary[name]) {
      console.log("Command '" + name + "' already exists!");
      return false;
    }

    // Define the command.
    this.commandDictionary[name] = new Command({
      name: name,
      argCount: argCount,
      func: func,
      delimeter: delimeter,
      forceLast: forceLast
    });

    return true;
  };

  /**
   * Aliases a command.
   *
   * Arguments passed to an aliased command will be inserted into the
   * alias string at positions specified by format markers: {0}, {1}, {2}, etc.
   *
   * For example, aliasing 'split_v {0} true' to 'sv' will allow you to run the
   * command 'sv preview', which would be parsed into 'split_v preview true'.
   *
   * Such format markers can be reused. An alias could be created like this:
   * 'sb' -> 'split_v null {0} \n split_h null {0}' and calling 'sb true' would
   * result in two commands being run: 'split_v null true' and 'split_h null true',
   * both with the passed argument in the position of the {0} marker.
   *
   * Any format markers that are not used when calling an alias are cut out of the
   * resulting command.
   *
   * @param {String} string - The command to alias, and any arguments.
   * @param {String} alias  - The name of the alias.
   * @return {Boolean} Returns false if the command already exists or contains
   *         whitespace, otherwise true.
   */
  Editor.prototype.aliasCommand = function(alias, string) {
    // Trim whitespace.
    alias = alias.trim();
    string = string.trim();

    // Don't allow whitespace in name.
    if (/\s/g.test(alias)) {
      console.log("Alias '" + alias + "' cannot contain whitepace in name.");
      return false;
    }

    // Don't overwrite an existing alias.
    if (this.commandDictionary[alias]) {
      console.log("Alias '" + alias + "' already exists!");
      return false;
    }

    // Get the number of arguments, passed in the string as {0}, {1}, {2}, etc.
    var match    = string.match(/{\d}/g);
    var argCount = match ? match.length : 0;

    this.commandDictionary[alias] = new Command({
      name: alias,
      argCount: argCount,
      aliasOf: string
    });
  };

  /**
   * Run the specified command or array of commands. Commands can be passed in as
   * either a string to be parsed (as from the command bar) or as an array of such strings.
   *
   * Note that if one of the commands fail, any following commands will be skipped.
   *
   * @todo Allow the pane to be changed dynamically by certain commands (important for ones
   *       that might add or remove panes). Implementation should take the pane argument
   *       as a function that would return the proper pane to execute on.
   * @todo Emphasize somewhere that there must be a focused pane at all times.
   *
   * @param {String|String[]} list - A command string to parse, or an array of command strings.
   * @param {Pane} pane - The pane to run the commands on.
   * @return {Promise} A promise chain for all the commands.
   */
  Editor.prototype.runCommand = function(list, pane) {
    var deferred = Q.defer();

    // If no pane is specified, reject the promise.
    if (!pane) {
      deferred.reject(new Error('Editor.runCommand() requires a pane to operate on.'));
      return deferred.promise;
    }

    // Get command definitions.
    var dictionary = this.commandDictionary;

    // Parse out an array of commands from the list.
    var commands = _([].concat(list))
      .map(function(string) { return parseCommand(string, dictionary); }).flatten()
      .sortBy(function(results) { return results.command.forceLast ? 1 : 0; })
      .value();

    // Create an item to track command results.
    var historyItem = { time: new Date() };

    // Setting this to true within the _.reduce() call will skip remaining commands.
    var failHard = false;

    // Save a record of the commands.
    this.commandHistory.push(historyItem);

    // Run through the commands in order.
    var promise = _.reduce(commands, function(promiseChain, commandInfo, index) {
      var command = commandInfo.command;
      var args = [pane].concat(commandInfo.args);

      // Wait for any returned promises to resolve before continuing.
      return Q.when(promiseChain, function() {
        historyItem[index] = {
          name: command.name,
          result: 'Succeeded'
        };

        // There was an error: skip remaining commands.
        if (failHard) throw new Error();

        return command.func.apply(null, args);
      })
      .fail(function(error) {
        if (command.func === failCommand) {
          historyItem[index].result = 'Unrecognized';
        }
        else if (failHard) {
          historyItem[index].result = 'Skipped';
        }
        else {
          historyItem[index].result = 'Failed: ' + error.message;
        }

        if (!failHard) {
          Utils.printFormattedError("Editor command '" + command.name
            + "' failed with error:", error);
        }

        // Skip remaining commands.
        failHard = true;
      });
    }, null);

    // Resolve the promise and return.
    deferred.resolve(promise);
    return deferred.promise;
  };

  /**
   * Divides up the space evenly among panes in the given direction.
   *
   * @param {Editor} editor - The editor to resize panes from.
   * @param {Element} container - The element containing the panes.
   * @param {String} direction - The direction to resize the panes in.
   */
  function sizePanesEvenly(editor, container, direction) {
    var children = container.children;
    var paneCount = (children.length + 1) / 2;
    var child;

    // Iterate by 2's to avoid splitters.
    for (var i = 0; i < children.length; i += 2) {
      child = children[i];
      if (direction === 'horizontal') {
        child.style.width = (1 / paneCount * 100) + '%';
        child.style.height = '';
      } else {
        child.style.height = (1 / paneCount * 100) + '%';
        child.style.width = '';
      }
    }

    // Trigger a resize event.
    _.forEach(editor.panes, function(pane) {
      pane.trigger('resize');
    });

    // Just use the last child, since the timing is the same for all of them.
    child.addEventListener('transitionend', function(event) {
      var property = (direction === 'horizontal') ? 'width' : 'height';
      if (event.propertyName === property) {
        _.forEach(editor.panes, function(pane) {
          pane.trigger('resize');
        });
      }
    });
  }

  /**
   * Returns the ancestor element that has the specified class.
   * @see http://stackoverflow.com/a/16863971/1270419
   *
   * @param {Element} element - The element to start with.
   * @param {String} className - The class to check for.
   * @return {Element|False} The ancestor with the given class, or
   *         false if not found.
   */
  function ancestorWithClass(element, className) {
    if (element.classList && element.classList.contains(className)) return element;
    return element.parentNode && ancestorWithClass(element.parentNode, className);
  }

/* =======================================================
 *                        Command
 * ======================================================= */

  /**
   * The Command class.
   *
   * Commands define a function and a method for parsing arguments
   * out of a string to be passed to that function.
   *
   * @constructor
   * @param {Object}   config           - A configuration object.
   * @param {String}   config.name      - The name of the command.
   * @param {Integer}  config.argCount  - The number of arguments the command function accepts.
   * @param {Function} config.func      - The function the command invokes.
   * @param {String}   config.delimeter - The delimeter between function arguments.
   * @param {Boolean}  config.forceLast - Whether the command should be pushed to the end
   *                                      of the call list when several commands are run sequentially.
   * @param {String}   config.aliasOf   - A string to alias the command to.
   */
  function Command(config) {
    this.name = config.name;
    this.argCount  = config.argCount;
    this.delimeter = config.delimeter || ' ';
    this.forceLast = config.forceLast || false;

    if (config.aliasOf) this.aliasOf = config.aliasOf;
    else this.func = config.func;

    return this;
  }

  /**
   * Throws an error.
   *
   * Used by parseCommand() to construct a Command object that
   * fails in a manner expected by runCommand(), for cases where
   * the supplied string can't be parsed.
   */
  function failCommand() {
    throw new Error('Command not recognized.'); 
  }

  /**
   * Parses the name and arguments for a command out of a string and
   * fetches the command from the editor's command hash. Aliases are
   * resolved recursively (meaning that nested aliases are possible).
   *
   * @param {String} string - The input command string.
   * @param {Object} dictionary - A hash table mapping command names to Command objects.
   * @param {String[]} recursionChain - A list of the commands that have been recursed through.
   *        This is used internally to prevent circular aliases.
   *
   * @return {Array[]|False} An array of command arrays, each array
   *         with a Command instance in the first index, and an array of
   *         arguments to pass to the command in the second. A special
   *         command is returned if the input is unrecognized, and false
   *         will be returned.
   */
  function parseCommand(string, dictionary, recursionChain) {
    // Initialize recursion chain.
    recursionChain = recursionChain || [];

    // Split the string on newlines and start parsing!
    var value = _(string.split('\n'))
      .map(function(input) {
        var name, command, aliasedCommand, args, index, ret, error;

        // Trim whitespace.
        input = input.trim();

        // Return false if the input is blank.
        if (input === '') return false;

        // Get the command.
        name = input.split(' ', 1).toString();
        command = dictionary[name];

        // Return a failing command if command is unknown.
        if (typeof command === 'undefined') {
          return {
            command: new Command({
              name: name,
              func: failCommand
            }),
            args: null
          };
        }

        // Throw an error if an alias references itself in a circular manner.
        if (recursionChain.indexOf(name) !== -1) {
          error = new Error("Aliased command '" + recursionChain[0] + "' causes circular reference.\n"
            + 'Command chain: ' + '[' + recursionChain.concat(name).join('] -> [') + ']');
          Utils.printFormattedError('Command parsing failed due to error:', error);
          throw error;
        }

        // Parse out the arguments.
        index = input.indexOf(' ');
        input = index !== -1 ? input.substr(index + 1) : '';
        args  = input.split(command.delimeter);

        // If arguments are requested, add the remainder of the command
        // string to the final argument. If argCount < 0 then unlimited
        // arguments are allowed, and are passed as a single array.
        if (command.argCount === 0) {
          args = [];
        }
        else if (command.argCount < 0) {
          args = [args];
        }
        else if (command.argCount > 0 && args.length > command.argCount) {
          ret = args.splice(0, command.argCount);
          ret.push(ret.pop() + command.delimeter + args.join(command.delimeter));
          args = ret;
        }

        if (command && command.aliasOf) {
          // Replace argument markers with the corresponding arguments.
          // If not enough arguments are passed to replace all markers, then unused
          // ones are removed.
          aliasedCommand = command.aliasOf.replace(/{(\d+)}/g, function(match, number) { 
            return (typeof args[number] !== 'undefined') ? args[number] : '';
          });

          // Recursively resolve aliased commands.
          return parseCommand(aliasedCommand, dictionary, recursionChain.concat(name));
        }

        // Return the command.
        return {
          command: command,
          args: args
        };
      })
      .compact()
      .flatten()
      .value();

    return value.length ? value : false;
  };

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
      pane.setFocus('commandBarFocus', true);
    });

    // Close on blur if no content has been entered.
    element.addEventListener('blur', function() {
      if (!_this.hasText()) _this.close();
      else pane.setFocus('commandBarFocus', false);
    });

    // Keep references.
    this.pane       = pane;
    this.element    = element;

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
    this.element.focus();

    // Keep the focus on the pane.
    this.pane.setFocus('commandBarFocus', true);
  };

  /**
   * Removes the command bar.
   */
  CommandBar.prototype.close = function() {
    var isFocused;

    // Exit if already closed.
    if (!this.isOpen) return;
    this.isOpen = false;

    // Close the command bar and refocus the pane if needed.
    isFocused = this.pane.isFocused;
    this.pane.wrapper.removeChild(this.element);
    this.pane.setFocus('commandBarFocus', false);
    if (isFocused) this.pane.focus();
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

    // Moves the cursor to the end of the input.
    range = document.createRange();
    range.selectNodeContents(this.element);
    range.collapse(false);
    selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
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
    this.pane.editor.runCommand(text, this.pane);
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

  // Expose globals.
  global.Editor             = Editor;
  global.Editor.Buffer      = Buffer;
  global.Editor.Pane        = Pane;
  global.Editor.InputPane   = InputPane;
  global.Editor.PreviewPane = PreviewPane;
}(this);

