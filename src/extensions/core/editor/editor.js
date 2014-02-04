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
    this.trigger('changeFilepath', this);
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
   * The StatusLight class.
   *
   * Manages the visual aspects of linking two panes, namely the handlers on the click
   * and mousemove events, and the drawing of the link line to represent this action.
   *
   * For line drawing method, see {@link http://www.amaslo.com/2012/06/drawing-diagonal-line-in-htmlcssjs-with.html|here}.
   * 
   * @constructor
   * @param {Pane} pane - The pane to attach the status light to.
   */
  function StatusLight(pane) {
    var _this = this;
    var timer;

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
      this.style.transition = '';
      this.style.height     = '';
      this.style.opacity    = '';
      document.body.removeChild(this);
    };
    this.showLinkHoverHandler = function(event) {
      timer = window.setTimeout(_this.showLink.bind(_this), 150, event);
    }
    this.unShowLinkHoverHandler = function(event) {
      if (timer) {
        window.clearTimeout(timer);
        timer = null;
        _this.unShowLink();
      }
    };
    this.unLinkClickHandler = function(event) {
      // Stop this from triggering the end of a link.
      event.stopPropagation();

      // Break the link.
      _this.pane.linkToPane(null);
    };

    // Create the link line element.
    this.linkLine = document.createElement('div');
    this.linkLine.className = 'link-line';

    // Create the link display element.
    this.linkDisplayLine = document.createElement('div');
    this.linkDisplayLine.className = 'link-line';

    // Create the link bar.
    this.linkBar = document.createElement('div');
    this.linkBar.className = 'link-bar';

    // Create the link button.
    this.linkButton = document.createElement('div');
    this.linkButton.className = 'link-button';
    this.linkButton.addEventListener('mouseover', this.showLinkHoverHandler);
    this.linkButton.addEventListener('mouseout', this.unShowLinkHoverHandler);
    this.linkButton.addEventListener('click', this.unLinkClickHandler);

    // Create the status light.
    this.linkLight = document.createElement('div');
    this.linkLight.className = 'status-light';
    this.linkLight.addEventListener('click', this.startLinkClickHandler);

    // Add elements to the DOM.
    pane.infoBar.appendChild(this.linkBar);
    this.linkBar.appendChild(this.linkButton);
    this.linkBar.appendChild(this.linkLight);

    return this;
  }

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
    line.style.height = length - 8 + 'px';
    line.style.top    = origin.y + 'px';
    line.style.left   = origin.x + 'px';
    line.style.webkitTransform = 'rotate(' + angle + 'deg)';
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
    document.body.appendChild(this.linkLine);
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

    // If noLink is true, don't link the panes.
    if (makeLink) {
      // Get the element under the mouse when the link ended.
      var linkDestination = document.elementFromPoint(this.destinationX, this.destinationY);

      // Dispatch a link event.
      var linkEvent = new Event('link', { bubbles: true });
      linkEvent.linkOrigin = this.pane;
      linkDestination.dispatchEvent(linkEvent);
    }
  };

  /**
   * Draws a link line between the status light and the center of the linked pane.
   *
   * Utilizees drawLine().
   */
  StatusLight.prototype.showLink = function() {
    // Add the link line to the document body.
    // This is done first so that offsetWidth can be accessed.
    fadeIn(document.body, this.linkDisplayLine, 200, 'ease-in');

    // Get the light element's position.
    var target    = this.pane.linkedPane.wrapper;
    var position1 = this.linkLight.getBoundingClientRect();
    var position2 = target.getBoundingClientRect();

    // Calculate the source position.
    var origin = {
      x: position1.left + this.linkLight.offsetWidth  / 2 - this.linkDisplayLine.offsetWidth / 2,
      y: position1.top  + this.linkLight.offsetHeight / 2
    };

    // Calculate the destination position.
    var destination = {
      x: position2.left + target.offsetWidth  / 2 - this.linkDisplayLine.offsetWidth / 2,
      y: position2.top  + target.offsetHeight / 2
    };

    // Position and size the line.
    drawLine(this.linkDisplayLine, origin, destination);
  };

  /**
   * Fades out the link line added in showLink().
   */
  StatusLight.prototype.unShowLink = function() {
    // Remove the display line.
    fadeOut(this.linkDisplayLine, 200, 'ease-in');
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

    drawLine(this.linkLine, { x: originX, y: originY }, { x: mouseX, y: mouseY });
  };

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
   * @param {Buffer} [buffer=new Buffer()] - The buffer to start with.
   * @param {Element} [wrapper=document.createElement('div')] - The element to wrap the pane in.
   * @param {String} [type='base'] - The type of pane. Parameter only used by subclasses.
   */
  function Pane(buffer, wrapper, type) {
    var _this = this;

    // Mix in event handling.
    Observable(this);

    // Defaults.
    buffer = buffer || new Buffer();
    wrapper = wrapper || document.createElement('div');
    type = type || 'base';

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

    // Set the buffer.
    this.switchBuffer(buffer);

    // The pane shouldn't be anchored by default.
    this.isAnchored = false;

    // Allow pane linking.
    this.wrapper.addEventListener('link', this.linkHandler.bind(this));

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
   * Responsible for registering focus and blur handlers.
   * Meant to be overridden by subclasses.
   *
   * @todo Figure out why the wrapper's focus event gets called multiple times.
   */
  Pane.prototype.registerFocusHandlers = function() {
    var _this = this;

    // Set initial focus to false.
    this.focuses.paneFocus = false;

    this.wrapper.addEventListener('focus', function() {
      _this.focuses.paneFocus = true;
      _this.updateFocusState();
    });

    this.wrapper.addEventListener('blur', function() {
      _this.focuses.paneFocus = false;
      _this.updateFocusState();
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
   * On overrideable method to set focus on the pane.
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

    this.titleElement.innerText = buffer.title;

    // Stop tracking the old buffer's title changes.
    if (typeof this.titleChangeID !== 'undefined') {
      oldBuffer.off(this.titleChangeID);
    }

    // Track the new buffer's title.
    this.titleChangeID = buffer.on('changeFilepath', function() {
      _this.titleElement.innerText = buffer.title;
    });

    // Return a reference to the old buffer.
    return oldBuffer;
  };

  /**
   * Handles the link event.
   *
   * Note that the call to linkToPane() is on event.linkOrigin, not
   * this pane, because direction matters in a link. (Mostly for when
   * it's broken, and because the link icon on the pane's title bar
   * only lights up on the pane that started the link. In other words,
   * the pane that receives the link event is the *parent* pane.)
   *
   * @param {Event} event - The link event.
   * @param {Pane} event.linkOrigin - The pane that requested the link.
   */
  Pane.prototype.linkHandler = function(event) {
    event.linkOrigin.linkToPane(this);
  };

  /**
   * Keeps two panes synchronized.
   *
   * This means that both panes will share their contents, even if one of them switches
   * to a different buffer.
   *
   * @param {Pane} pane - The pane to link to. Passing a falsey value will remove all links.
   * @return {Boolean} False if a circular reference would be created, otherwise true.
   */
  Pane.prototype.linkToPane = function(pane) {
    // Prevent linking to self.
    if (pane === this) return false;

    // Prevent circular event loops.
    if (pane && pane.linkedPane) {
      for (var p = pane; p.linkedPane; p = p.linkedPane) {
        if (p.linkedPane.buffer === this.buffer) return false;
      }
    }

    // Remove event handlers from old linked pane.
    if (this.linkedPane) {
      this.linkedPane.off(this.linkID);
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

  // Inherit from Pane.
  InputPane.prototype = new Pane();
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
   * @param {Buffer} [buffer=new Buffer()] - The buffer to start with.
   * @param {Element} [wrapper=document.createElement('div')] - The element to wrap the pane in.
   * @param {Object} [editorConfig] - A configuration object to pass to the CodeMirror constructor.
   */
  function InputPane(buffer, wrapper, editorConfig) {
    // Merge in defaults with the supplied configuration.
    editorConfig = _.merge({
      lineWrapping: true,
      undoDepth: 1000
    }, editorConfig);

    // For CodeMirror, even though Pane() handles this later.
    wrapper = wrapper || document.createElement('div');
    
    // Create the editor.
    this.editor = CodeMirror(wrapper, editorConfig);

    // Inherit from Pane.
    return Pane.call(this, buffer, wrapper, 'input');
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
    this.editor.setOption('mode', mode);
  };

  /**
   * Overrides Pane.registerFocusHandlers().
   */
  InputPane.prototype.registerFocusHandlers = function() {
    var _this = this;
    
    // Set initial focus to false.
    this.focuses.inputFocus = false;

    this.editor.on('focus', function() {
      _this.focuses.inputFocus = true;
      _this.updateFocusState();
    });

    this.editor.on('blur', function() {
      _this.focuses.inputFocus = false;
      _this.updateFocusState();
    });

    Pane.prototype.registerFocusHandlers.call(this);
  };

  /**
   * Overrides Pane.focus().
   */
  InputPane.prototype.focus = function() {
    this.editor.focus();
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
    this.editor.swapDoc(this.doc);
    this.editor.refresh();

    // Remove old event listeners.
    if (typeof this.filetypeChangeID !== 'undefined') {
      this.buffer.off(this.filetypeChangeID);
    }
    
    // Listen for filepath changes on the new buffer.
    this.filetypeChangeID = buffer.on('changeFilepath', function(buffer) {
      _this.setMode(detectMode(buffer.filepath, inputModeKey));
    });

    // Detect and set a mode.
    this.setMode(detectMode(buffer.filepath, inputModeKey));
    
    return Pane.prototype.switchBuffer.call(this, buffer, breakLink);
  };

  // Inherit from Pane.
  PreviewPane.prototype = new Pane();
  PreviewPane.prototype.constructor = Pane;

  /**
   * The PreviewPane class.
   *
   * Preview panes are used to parse and display buffer contents.
   *
   * @constructor
   * @param {Buffer} [buffer=new Buffer()] - The buffer to start with.
   * @param {Element} [wrapper=document.createElement('div')] - The element to wrap the pane in.
   * @param {Function} [parse] - The parsing function, which accepts a string as input and returns it parsed.
   */
  function PreviewPane(buffer, wrapper, parse) {
    // The preview function.
    this.parse = parse || detectMode(buffer.filepath, previewModeKey);

    // Add a preview area to the wrapper.
    this.previewArea = document.createElement('div');
    this.previewArea.className = 'preview-area';
    wrapper.appendChild(this.previewArea);

    // Inherit from Pane.
    return Pane.call(this, buffer, wrapper, 'preview');
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
    this.filetypeChangeID = buffer.on('changeFilepath', function(buffer) {
      _this.parse = detectMode(buffer.filepath, previewModeKey);
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

  /**
   * The Editor class.
   *
   * The Editor class is responsible for managing Pane objects and presenting
   * a display to the user. It also has methods for running user-defineable commands
   * that can extend functionality further.
   *
   * @constructor
   * @param {String} containerID - The id of the element to insert the editor into.
   */
  function Editor(containerID) {
    var _this = this;

    // Get the container and start with 
    this.container = document.getElementById('editor');
    this.panes = [];

    // Command-related properties.
    this.commands = [];
    this.commandHistory = [];

    // Toggle the command bar with ESC.
    this.container.addEventListener('keydown', function(event) {
      // Only proceed on ESC keypress.
      if (event.keyCode !== 27) return;

      // Create the command bar if it doesn't exist.
      if (!_this.commandBar) {
        _this.openCommandBar();
      } else {
        _this.closeCommandBar();
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
    var input = this.addPane(InputPane, new Buffer(), 'horizontal');
    var preview = this.addPane(PreviewPane, new Buffer(), 'horizontal');
  };

  /**
   * Adds a new pane. If the type is set to 'vertical', then the pane will be
   * inserted into the same vertical compartment as parentPane.
   *
   * @todo Add the new pane immediately after the parent pane.
   * @todo Contemplate whether or not to emulate vim's behaviour, in that a pane
   *       taking up approximately > 80% of the screen's width/height will be
   *       partitioned in half without effecting any other panes.
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

    // The wrapper is needed before the pane is created, so get a smart default.
    wrapper = args[1] = args[1] || document.createElement('div');

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
        if (pane.type === 'input') {
          pane.editor.refresh();
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

    // Separate cases are needed for cases including vertical splitters.
    // For example, removing the last pane in a vertical split should also remove the split.
    var shouldRemovePane = sibling && sibling.classList.contains('splitter');
    var shouldRemoveParent = !sibling && containerSibling
      && container.classList.contains('vertical-splitter-pane')
      && containerSibling.classList.contains('splitter');

    if (shouldRemovePane) {
      container.removeChild(pane.wrapper);
      container.removeChild(sibling);
      this.panes.splice(this.panes.indexOf(pane), 1);

      if (sibling.classList.contains('horizontal')) {
        sizePanesEvenly(this, container, 'horizontal');
      } else {
        sizePanesEvenly(this, container, 'vertical');
      }
    }
    else if (shouldRemoveParent) {
      containerParent.removeChild(container);
      containerParent.removeChild(containerSibling);
      this.panes.splice(this.panes.indexOf(pane), 1);

      sizePanesEvenly(this, containerParent, 'horizontal');
    }
    else {
      pane.switchBuffer(new Buffer());
    }
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
      if (prev.classList.contains('splitter-pane')) {
        children = children.concat(Array.prototype.slice.call(prev.children));
      } else {
        children.push(prev);
      }

      // Get the pane, or its sub-panes if applicable.
      if (next.classList.contains('splitter-pane')) {
        children = children.concat(Array.prototype.slice.call(next.children));
      } else {
        children.push(next);
      }

      // Filter out any splitters.
      children = _.filter(children, function(child) {
        return child.classList.contains('splitter');
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
   * The Command class.
   *
   * Commands define a function and a method for parsing arguments
   * out of a string to be passed to that function.
   *
   * @constructor
   * @param {String} name - The name of the command.
   * @param {Integer} argCount - The number of arguments the command function accepts.
   * @param {Function} func - The function the command invokes.
   * @param {String} delimeter - The delimeter between function arguments.
   * @param {Boolean} forceLast - Whether the command should be pushed to the end
   *        of the call list when several commands are run sequentially.
   */
  function Command(name, argCount, func, delimeter, forceLast) {
    this.name      = name;
    this.func      = func;
    this.argCount  = argCount;
    this.delimeter = delimeter || ' ';
    this.forceLast = forceLast || false;

    return this;
  }

  /**
   * Defines a command. The parameters are just passed on to the Command constructor.
   *
   * @param {String} name - The name of the command.
   * @param {Integer} argCount - The number of arguments the command function accepts.
   * @param {Function} func - The function the command invokes.
   * @param {String} delimeter - The delimeter between function arguments.
   * @param {Boolean} forceLast - Whether the command should be pushed to the end
   *        of the call list when several commands are run sequentially.
   */
  Editor.prototype.defineCommand = function(name, argCount, func, delimeter, forceLast) {
    this.commands[name] = new Command(name, argCount, func, delimeter, forceLast);
  };

  /**
   * Function that throws an error for an unrecognized command.
   */
  function failCommand() {
    throw new Error('Command not recognized.'); 
  }

  /**
   * Parses the name and arguments for a command out of a string and
   * fetches the command from the editor's command hash.
   *
   * @param {String} input - The input command string.
   * @return {Array|False} An array with a Command instance in the first
   *         index, and an array of arguments to pass to the command
   *         in the second. A special command is returned if the input
   *         is unrecognized, and false is returned on blank input.
   */
  Editor.prototype.parseCommand = function(input) {
    var name, command, args, index, ret, error;

    // Do nothing if the command is blank.
    if (input.trim() === '') return false;

    // Parse out the name;
    name = input.split(' ', 1).toString();

    // Return a failing command if command is unknown.
    if (typeof this.commands[name] === 'undefined') {
      return [new Command(name, 0, failCommand), null];
    }

    // Parse out the arguments.
    index   = input.indexOf(' ');
    input   = index !== -1 ? input.substr(index + 1) : '';
    command = this.commands[name];
    args    = input.split(command.delimeter);

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

    // Return the command.
    return [command, args];
  };

  /**
   * Run the specified command or array of commands. Commands can
   * be passed in as either a string to be parsed (as from the
   * command bar) or as an array of such strings.
   *
   * Note that if one of the commands fail, any following commands will be skipped.
   *
   * @todo Allow the specification of the target pane. The target pane should be
   *       passed as the first argument to the command's function.
   *
   * @param {String|String[]} list - A command string to parse, or an array of command strings.
   * @param {boolean} [saveToHistory=false] - Whether to keep a record of the command(s) run.
   */
  Editor.prototype.runCommand = function(list, saveToHistory) {
    // Parse out an array of commands from the list.
    var commands = _([].concat(list))
      .map(   function(string)  { return this.parseCommand(string); }, this)
      .filter(function(results) { return typeof results[0] !== 'undefined'; })
      .sortBy(function(results) { return results[0].forceLast ? 1 : 0; })
      .value();

    // Create an item to track command results.
    var historyItem = { time: new Date() };

    // Setting this to true within the _.reduce() call will skip remaining commands.
    var failHard = false;

    // Save a record of the commands if requested.
    if (saveToHistory || false) this.commandHistory.push(historyItem);
      
    // Run through the commands in order.
    _.reduce(commands, function(promiseChain, commandInfo, index) {
      var command = commandInfo[0];
      var args = commandInfo[1];

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
  };

  /**
   * Opens up a command bar in the currently focused pane.
   *
   * @todo Refactor command bar methods into a CommandBar class.
   */
  Editor.prototype.openCommandBar = function() {
    var pane       = this.getFocusPane();
    var commandBar = document.createElement('div');

    // Do nothing if no pane is focused.
    if (!pane) return;

    // Set the class name and make its contents editable.
    commandBar.className = 'command-bar';
    commandBar.setAttribute('contentEditable', true);

    // Add the command bar.
    pane.wrapper.appendChild(commandBar);
    commandBar.focus();

    // Maintain the focus on the pane.
    pane.focuses.commandBarFocus = true;
    pane.updateFocusState();

    // Make the contentEditable div act like a resizable textarea.
    commandBar.addEventListener('keydown', function(event) {
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
      if (commandBar.lastChild && commandBar.lastChild.nodeName !== 'BR') {
        commandBar.appendChild(document.createElement('br'));
      }
    });

    // Keep a reference to the command bar.
    this.commandBar = commandBar;
    this.commandPane = pane;
  };

  /**
   * Closes the open command bar.
   *
   * @todo Fix edge case where any pane with a command bar still
   *       has the 'focus' class even if the command bar isn't
   *       focused.
   *
   * @todo Refactor command bar methods into a CommandBar class.
   */
  Editor.prototype.closeCommandBar = function() {
    var commandList, pane;

    // Exit if the command bar is not open.
    if (!this.commandBar) return;

    // Get the command bar text, and the focused pane.
    commandList = this.commandBar.innerText.split(/\n+/);

    // Remove the command bar.
    this.commandBar.parentElement.removeChild(this.commandBar);
    this.commandBar = null;

    // Remove the command bar focus state and then refocus the pane.
    this.commandPane.focuses.commandBarFocus = false;
    this.commandPane.focus();

    // Run all the commands.
    this.runCommand(commandList, true);
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

  // Expose globals.
  global.Editor             = Editor;
  global.Editor.Buffer      = Buffer;
  global.Editor.Pane        = Pane;
  global.Editor.InputPane   = InputPane;
  global.Editor.PreviewPane = PreviewPane;
}(this);

