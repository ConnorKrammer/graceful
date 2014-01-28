/**
 * graceful-editor-core is a text editor with parser and multi-edit functionality. It
 * supplies the core editor abilities to the graceful editor project (wait, how'd you guess?),
 * but, is designed to be modular and usable in any project. Its current implementation
 * utilizes the marked markdown parser to produce HTML, but any other input/output pair can also
 * be generated. All you need to do is pass the Editor() function a configuration object with
 * a parse property of the form function(input, options), and graceful-editor-core will do the
 * rest for you. You can even extend an existing parser's functionality by adding pre- and post-parse
 * functions to the parsing pipeline. Feel free to fork the project and build something of your own with
 * it!
 *
 * Dependencies: Lo-Dash:         lodash.com/docs
 *               jQuery:          http://api.jquery.com/
 *               observable:      https://github.com/js-coder/observable
 *
 * Developed by Connor Krammer:
 *   (https://www.github.com/ConnorKrammer/graceful-editor-core)
 */


!function(global) {
  'use strict';

  /* ============================
   * The Buffer class.
   * ============================ */

  /**
   * The Buffer class.
   *
   * This class is responsible for managing a file's contents
   * and syncing updates across all subscribing panes.
   *
   * @constructor
   * @param {string} text - The text to begin the document with.
   * @param {object} mode - The mode to use for the document.
   * @param {object} history - (optional) The document history.
   */
  function Buffer(text, filepath, mode, history) {
    var _this = this;

    // Mix in event handling.
    Observable(this);

    // The master document.
    this.rootDoc = mode ? CodeMirror.Doc(text || '', mode) 
      : CodeMirror.Doc(text || '');

    // Set the document history, if it exists.
    if (history) {
      this.rootDoc.setHistory(history);
    }

    // Allow easy access to document text.
    this.text = text || '';

    // Set the temporary filepath.
    this.title = 'new';
    this.filepath = null;

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
   * Note that this doesn't strictly have to be a file *path*, but makes sense
   * in most contexts. It can alternatively be used as a general identifier.
   *
   * @param {string} filename The identifier for this buffer's contents.
   */
  Buffer.prototype.setFilepath = function(filepath) {
    // This gets the text after the last delimeter character and sets it as the title.
    // If the string doesn't contain either '/' or '\', index will equal zero.
    var index = Math.max(filepath.lastIndexOf('/'), filepath.lastIndexOf('\\')) + 1;
    var title = filepath.substr(index);

    // Set the new filename and title.
    this.filepath = filepath;
    this.title = title;

    // Notify listeners that the filepath changed.
    this.trigger('changeFilepath', this);
  };

  /**
   * Sets the buffer contents. The buffer contents will also
   * be marked as clean, unless otherwise specified.
   *
   * @param {string} content The new editor content.
   * @param {boolean} isClean Whether to set the editor contents
   *        as clean. Defaults to true.
   */
  Buffer.prototype.setContent = function(content, isClean) {
    this.rootDoc.setValue(content);
    this.markClean(isClean);
  };

  /**
   * Mark the buffer as clean or dirty.
   * This is useful for tracking when to save a file.
   *
   * @param {boolean} isClean Whether to mark the buffer as clean or not.
   *        Defaults to clean if not specified.
   */
  Buffer.prototype.markClean = function(isClean) {
    this.isClean = (isClean === false) ? false : true;
  };

  /**
   * Line drawing from: http://www.amaslo.com/2012/06/drawing-diagonal-line-in-htmlcssjs-with.html
   */
  function StatusLight(pane, color) {
    var _this = this;

    // Keep a reference to the parent pane.
    this.pane = pane;

    // Event handlers.
    this.drawLinkLineMoveHandler = _.throttle(this.drawLinkLine.bind(this), 10); 
    this.startLinkClickHandler = this.startLink.bind(this);
    this.endLinkClickHandler = this.endLink.bind(this);
    this.endLinkKeyHandler = function(event) {
      if (event.keyCode === 27) {
        _this.resetLink();
      }
    };
    this.transitionEndHandler = function(event) {
      this.style.transition = '';
      this.style.height     = '';
      this.style.opacity    = '';
      document.body.removeChild(this);
    };

    var timer;
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

  function finishFadeIn(event) {
    this.style.opacity = '';
    this.style.transition = '';
    this.removeEventListener('transitionend', finishFadeIn);
  }

  function finishFadeOut(event) {
    this.style.opacity = '';
    this.style.transition = '';
    this.parentNode.removeChild(this);
    this.removeEventListener('transitionend', finishFadeOut);
  }

  function fadeIn(parentElement, element, duration, easing) {
    element.style.opacity = 0;
    element.style.transition = 'opacity ' + duration + 'ms ' + easing;
    
    parentElement.appendChild(element);

    // Allow the transition to take before animating.
    window.setTimeout(function() {
      element.style.opacity = 1;
    }, 0);

    element.removeEventListener('transitionend', finishFadeOut);
    element.addEventListener('transitionend', finishFadeIn);
  }

  function fadeOut(element, duration, easing) {
    element.style.opacity = 0;
    element.style.transition = 'opacity ' + duration + 'ms ' + easing;

    element.removeEventListener('transitionend', finishFadeIn);
    element.addEventListener('transitionend', finishFadeOut);
  }

  StatusLight.prototype.showLink = function(event) {
    // Add the line.
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

  StatusLight.prototype.unShowLink = function() {
    // Remove the display line.
    fadeOut(this.linkDisplayLine, 200, 'ease-in');
  };

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

    this.linkLight.removeEventListener('click', this.startLinkClickHandler);

    document.body.className += ' link-in-progress';
  };

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

  StatusLight.prototype.endLink = function(noLink) {
    this.resetLink();

    // Get the element under the mouse when the link ended.
    var linkDestination = document.elementFromPoint(this.destinationX, this.destinationY);

    // Dispatch a link event.
    var linkEvent = new Event('link', { bubbles: true });
    linkEvent.linkOrigin = this.pane;
    linkDestination.dispatchEvent(linkEvent);
  };

  StatusLight.prototype.resetLink = function() {
    this.linkLine.style.transition = 'height 0.3s ease, opacity 0.2s ease';
    this.linkLine.style.height     = '0px';
    this.linkLine.style.opacity    = 0;
    this.linkLine.addEventListener('transitionend', this.transitionEndHandler);

    // Remove event listeners.
    document.removeEventListener('mousemove', this.drawLinkLineMoveHandler);
    document.removeEventListener('click', this.endLinkClickHandler);
    document.removeEventListener('keydown', this.endLinkKeyHandler);

    this.linkLight.addEventListener('click', this.startLinkClickHandler);

    document.body.className = document.body.className.replace(' link-in-progress', '');
  };

  /**
   * Assigns an object a linked copy of the root document.
   *
   * @return {CodeMirror.Doc} The linked document.
   */
  Buffer.prototype.getLink = function() {
    return this.rootDoc.linkedDoc({ sharedHist: true });
  };

  /* ============================
   * The base Pane class.
   * ============================ */

  /**
   * The Pane base class.
   *
   * Panes are responsible for managing a Buffer objects in various ways.
   * Note that the wrapper argument is not actually utlized by this base class,
   * but is in every subclass.
   *
   * @constructor
   * @param {object|falsey} buffer - The buffer to start with.
   * @param {element} wrapper - The parent element of this pane.
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

  Pane.prototype.postInitialize = function() {

  };

  /**
   * Responsible for registering focus and blur handlers.
   *
   * Only called once, on pane creation.
   */
  Pane.prototype.registerFocusHandlers = function() {
    var _this = this;

    // Set initial focus to false.
    this.focuses.paneFocus = false;

    // TODO: (FIX) Focus gets called multiple times, for some reason.
    this.wrapper.addEventListener('focus', function() {
      _this.focuses.paneFocus = true;
      _this.updateFocusState();
    });

    this.wrapper.addEventListener('blur', function() {
      _this.focuses.paneFocus = false;
      _this.updateFocusState();
    });
  };

  Pane.prototype.updateFocusState = function() {
    // Check if any focuse triggers are set to true.
    var focused = _.some(this.focuses, function(focus) {
      return focus;
    });

    // Set focus state.
    this.isFocused = focused;

    // Toggle the focus class as necessary.
    if (focused && this.wrapper.className.indexOf(' focus') === -1) {
      this.wrapper.className += ' focus';
    }
    else if (!focused) {
      this.wrapper.className = this.wrapper.className.replace(' focus', '');
    }
  };

  Pane.prototype.focus = function() {
    this.wrapper.focus();
  };

  /**
   * Switches the active buffer.
   *
   * This will trigger the changeBuffer event, passing the new
   * buffers in as an argument.
   *
   * @param {object|falsey} buffer - The new buffer.
   */
  Pane.prototype.switchBuffer = function(buffer) {
    var _this = this;

    // Keep track of the old buffer.
    var oldBuffer = this.buffer;

    // Set the new buffer.
    this.buffer = buffer || new Buffer();
    this.trigger('changeBuffer', [buffer]);

    this.titleElement.innerText = buffer.title;

    // Stop tracking the old buffer's title changes.
    if (this.titleChangeID) oldBuffer.off(this.titleChangeID);

    // Track the new buffer's title.
    this.titleChangeID = buffer.on('changeFilepath', function() {
      _this.titleElement.innerText = buffer.title;
    });

    // Return a reference to the old buffer.
    return oldBuffer;
  };

  Pane.prototype.linkHandler = function(event) {
    event.linkOrigin.linkToPane(this);
  };

  /**
   * Keeps buffers synchronized with another pane.
   *
   * This means it will always preview the linked pane's buffer contents,
   * even if the other pane's buffer is changed.
   *
   * @param {object} pane - The pane to link to. Passing a falsey value will remove all links.
   * @return {boolean} False if a circular reference would be created, otherwise true.
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

    // This pane shouldn't be cycle-able.
    this.isAnchored = true;

    // Remove event handlers from old linked pane.
    if (this.linkedPane) {
      this.linkedPane.off(this.linkID);
    }

    if (pane) {
      // Switch to the new buffer.
      this.switchBuffer(pane.buffer);

      // Add event handlers for the new linked pane.
      var _this = this;
      this.linkID = pane.on('changeBuffer', function(newBuffer) {
        _this.switchBuffer(newBuffer);
      });

      // Add a class to both pane's wrappers.
      if (this.wrapper.className.indexOf('has-link') === -1) {
        this.wrapper.className += ' has-link';
      }
    } else {
      // Switch to a new buffer.
      this.switchBuffer(new Buffer());

      // Remove the link class.
      this.wrapper.className = this.wrapper.className.replace(' has-link', '');
    }

    // Set the new link pane.
    this.linkedPane = pane;

    return true;
  };


  /* ============================
   * The InputPane class.
   * ============================ */

  // Inherit from Pane.
  InputPane.prototype = new Pane();
  InputPane.prototype.constructor = Pane;

  /**
   * Input panes are used to manipulate buffer contents.
   *
   * Utilizes a CodeMirror instance.
   *
   * @constructor
   * @param {object|falsey} buffer - The buffer to start with.
   * @param {element} wrapper - The parent element of the input pane.
   * @param {object} editorConfig - (optional) A configuration object to pass to the CodeMirror constructor.
   */
  function InputPane(buffer, wrapper, editorConfig) {
    // Merge in defaults with the supplied configuration.
    editorConfig = _.merge({
      lineWrapping: true,
      undoDepth: 1000
    }, editorConfig);
    
    // Create the editor.
    this.editor = CodeMirror(wrapper, editorConfig);

    // Inherit from Pane.
    return Pane.call(this, buffer, wrapper, 'input');
  }

  /**
   * Sets the editor mode.
   *
   * @param {string|object} mode The mode for the editor.
   */
  InputPane.prototype.setMode = function(mode) {
    this.editor.setOption('mode', mode);
  };

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

  InputPane.prototype.focus = function() {
    this.editor.focus();
  };

  /**
   * Switch the active buffer.
   *
   * @param {object} buffer The buffer to switch to.
   */
  InputPane.prototype.switchBuffer = function(buffer) {
    this.doc = buffer.getLink();
    this.editor.swapDoc(this.doc);
    return Pane.prototype.switchBuffer.call(this, buffer);
  };

  /* ============================
   * The PreviewPane class.
   * ============================ */

  // Inherit from Pane.
  PreviewPane.prototype = new Pane();
  PreviewPane.prototype.constructor = Pane;

  /**
   * Preview panes are used to parse and display buffer contents.
   *
   * @constructor
   * @param {object|falsey} buffer - The buffer to start with.
   * @param {element} wrapper - The parent element of the input pane.
   * @param {function} parse - The parsing function, which takes a string and returns it parsed.
   */
  function PreviewPane(buffer, wrapper, parse) {
    // The preview function.
    this.parse = parse;

    // Add a preview area to the wrapper.
    this.previewArea = document.createElement('div');
    this.previewArea.className = 'preview-area';
    wrapper.appendChild(this.previewArea);

    // Inherit from Pane.
    return Pane.call(this, buffer, wrapper, 'preview');
  }

  /**
   * Switch the active buffer.
   *
   * @param {object} buffer The buffer to switch to.
   */
  PreviewPane.prototype.switchBuffer = function(buffer) {
    if (this.changeID !== undefined) {
      this.buffer.off(this.changeID);
    }

    this.changeID = buffer.on('change', this.preview.bind(this));
    this.preview(buffer);

    return Pane.prototype.switchBuffer.call(this, buffer);
  };

  /**
   * Parses buffer contents and displays them.
   *
   * @param {object} buffer The buffer to preview.
   */
  PreviewPane.prototype.preview = function(buffer) {
    this.previewArea.innerHTML = this.parse(buffer.text);
  };

  function Editor(containerID) {
    var _this = this;

    this.container = document.getElementById('editor');
    this.panes = [];

    this.commands = [];
    this.commandHistory = [];

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

  Editor.prototype.init = function() {
    var previewFunction = function(text) {
      return marked(text, {
        gfm: true,
        tables: true,
        breaks: true,
        pedantic: false,
        sanitize: false,
        smartLists: true,
        smartypants: false,
        langPrefix: 'lang-'
      });
    };

    // Setup some test panes.
    var modeConfig = {
      name: 'markdown-lite',
      highlightFormatting: true,
      fencedCodeBlocks: true,
      taskLists: true
    };
    var input   = this.addPane(InputPane, [new Buffer('', 'new', modeConfig), null], 'horizontal');
    //var input2  = this.addPane(InputPane, [new Buffer(''), null], 'horizontal');
    //var preview = this.addPane(PreviewPane, [new Buffer(''), null, previewFunction], 'vertical', input2);

    return this;
  };

  Editor.prototype.addPane = function(constructor, args, type, parentPane) {
    var container = this.container;
    var pane, factoryFunction, wrapper, focusPane;

    // Keep a reference to the focus pane, since a vertical split will
    // de-focus it.
    focusPane = this.getFocusPane();

    // The wrapper.
    args[1] = args[1] || document.createElement('div');
    wrapper = args[1];

    if (type === 'vertical' && parentPane) {
      if (parentPane.wrapper.parentNode.className.match('vertical-splitter-pane')) {
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
        pane.editor.refresh();
      });
    }

    // Refocus the focus pane.
    if (focusPane) focusPane.focus();

    return pane;
  };

  Editor.prototype.removePane = function(pane) {
    var container        = pane.wrapper.parentElement;
    var sibling          = pane.wrapper.previousElementSibling || pane.wrapper.nextElementSibling;
    var containerParent  = container.parentElement;
    var containerSibling = container.previousElementSibling || container.nextElementSibling;

    var shouldRemovePane   = sibling && sibling.className.indexOf('splitter') !== -1;
    var shouldRemoveParent = !sibling && containerSibling
      && container.className.indexOf('vertical-splitter-pane') !== -1
      && containerSibling.className.indexOf('splitter') !== -1;

    if (shouldRemovePane) {
      container.removeChild(pane.wrapper);
      container.removeChild(sibling);
      this.panes.splice(this.panes.indexOf(pane), 1);

      if (sibling.className.indexOf('horizontal') !== -1) {
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

        // Trigger resize events.
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

        // Trigger resize events.
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
      if (prev.className.indexOf('splitter-pane') !== -1) {
        children = children.concat(Array.prototype.slice.call(prev.children));
      } else {
        children.push(prev);
      }

      // Get the pane, or its sub-panes if applicable.
      if (next.className.indexOf('splitter-pane') !== -1) {
        children = children.concat(Array.prototype.slice.call(next.children));
      } else {
        children.push(next);
      }

      // Filter out any splitters.
      children = _.filter(children, function(child) {
        return child.className.indexOf('splitter') === -1;
      });

      // Store the panes for later.
      _.forEach(children, function(child) {
        resizePanes.push(_this.getPaneByElement(child));
      });

      // Disable transitioning during the drag.
      prev.className += ' disable-transition';
      next.className += ' disable-transition';

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
      prev.className = prev.className.replace(' disable-transition', '');
      next.className = next.className.replace(' disable-transition', '');

      // Remove the drag handler.
      document.removeEventListener('mousemove', dragHandler);
    });
  };

  Editor.prototype.cyclePaneBuffers = function() {
    var panes  = _.filter(this.panes, { 'isAnchored': false });
    var length = panes.length;
    var temp   = panes[0].switchBuffer(panes[length - 1].buffer);

    // TODO: Sort panes by physical order, not order added.
    for (var i = 1; i < length; i++) {
      temp = panes[i].switchBuffer(temp);
    }
  };

  function Command(name, argCount, func, delimeter, forceLast) {
    this.name      = name;
    this.func      = func;
    this.argCount  = argCount;
    this.delimeter = delimeter || ' ';
    this.forceLast = forceLast || false;

    return this;
  }

  Editor.prototype.defineCommand = function(name, argCount, func, delimeter, forceLast) {
    this.commands[name] = new Command(name, argCount, func, delimeter, forceLast);
  };

  Editor.prototype.parseCommand = function(input) {
    var name, command, args, index, ret, error;

    // If input is actually a command object.
    if (input instanceof Command) return input;

    // Do nothing if the command is blank.
    if (input.trim() === '') return false;

    // Parse out the name;
    name = input.split(' ', 1).toString();

    // Exit if command is unknown.
    if (typeof(this.commands[name]) === 'undefined') {
      console.log("Command '" + name + "' not recognized.");
      return false;
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

    // Set the args.
    command.args = args;

    // Return the command.
    return command;
  };

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
  };

  Editor.prototype.closeCommandBar = function() {
    var commandList = this.commandBar.innerText.split(/\n+/);
    var pane        = this.getFocusPane();

    // Remove the command bar.
    this.commandBar.parentElement.removeChild(this.commandBar);
    this.commandBar = null;

    // Remove the command bar focus state and then refocus the pane.
    pane.focuses.commandBarFocus = false;
    pane.focus();

    // Run all the commands.
    this.runCommand(commandList);
  };

  /**
   * Outputs an error message for debugging.
   *
   * @param {Error} error The error to use for the message.
   * @param {Command} command The command causing the error.
   */
  function handleCommandError(error, command) {
    console.log("%cEditor command '" 
      + command.name + "' failed with error:\n%c" 
      + error.message, "font-weight: bold;", "font-weight: normal;");
    console.log(error.stack);
  }

  /**
   * Run the specified command or array of commands. Commands can
   * be passed in as either a string to be parsed (as from the
   * command bar) or as a Command object.
   *
   * @param {array|string|Command} list The command(s) to run.
   * @param {boolean} saveToHistory Whether to keep a record of the commands run.
   */
  Editor.prototype.runCommand = function(list, saveToHistory) {
    // Parse out an array of commands from the list.
    var commands = _([].concat(list))
      .map(   function(command) { return this.parseCommand(command); }, this)
      .filter(function(command) { return command; })
      .sortBy(function(command) { return command.forceLast ? 1 : 0; })
      .value();

    // Create an item to track command results.
    var historyItem = { time: new Date() };

    if (saveToHistory) {
      this.commandHistory.push(historyItem);
    }
      
    // Run through the commands, waiting for promises to resolve
    // before continuing to the next one.
    _.reduce(commands, function(promiseChain, command, index) {
      return Q.when(promiseChain, function() {
        historyItem[index] = {
          name: command.name,
          result: 'Success'
        };
        return command.func.apply(null, command.args);
      })
      .fail(function(error) {
        historyItem[index].result = 'Failure: ' + error.message;
        handleCommandError(error, command);
      });
    }, null);
  };

  Editor.prototype.getFocusPane = function() {
    return _.find(this.panes, 'isFocused');
  };

  Editor.prototype.getPaneByElement = function(element) {
    return _.find(this.panes, function(pane) {
      return pane.wrapper === element;
    });
  };


  global.Editor             = Editor;
  global.Editor.Buffer      = Buffer;
  global.Editor.Pane        = Pane;
  global.Editor.InputPane   = InputPane;
  global.Editor.PreviewPane = PreviewPane;
}(this);

