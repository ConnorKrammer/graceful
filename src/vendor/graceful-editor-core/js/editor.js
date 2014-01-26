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
 *               jquery-autosize: http://www.jacklmoore.com/autosize/
 *
 * Developed by Connor Krammer:
 *   (https://www.github.com/ConnorKrammer/graceful-editor-core)
 *
 * Initially forked from Philippe Masset's online editor:
 *   (https://github.com/pioul/MinimalistOnlineMarkdownEditor)
 */


!function(global) {
  'use strict';

  /**
   * Creates a new Editor instance with the given options.
   *
   * Configures options for the editor and applies defaults where
   * necessary. The constructor is guaranteed not to manipulate the DOM
   * in any way.
   *
   * Valid options:
   *
   *   containerId:
   *     {string} default: "markdown-editor"
   *     The #id of the editor's container.
   *
   *   placeholder: 
   *     {string} default: "Write Markdown"
   *     The text placeholder when the input pane is empty. 
   *
   *   parser:
   *     {object} default: { 
   *       parse: marked,
   *       options: {
   *         gfm: true,
   *         tables: true,
   *         breaks: true,
   *         pedantic: false,
   *         sanitize: false,
   *         smartLists: true,
   *         smartypants: false,
   *         langPrefix: 'lang-'
   *       }
   *     }
   *     The primary parser in the parser pipeline, and the options to pass
   *     to it. The first argument of the function should be the text to parse,
   *     and the second should be any available options. The options object can
   *     be anything that the parse function can handle as an options argument.
   *
   *   autosaveInterval:
   *     {integer} default: 1000
   *     The minimum number of elapsed milliseconds between autosaves, if a change has occurred.
   *
   *   allowFullscreen:
   *     {boolean} default: true
   *     Whether to allow a pane to expand to fill the entire window.
   *     NOTE: Setting this to false while in fullscreen will not exit fullscreen.
   *
   *   allowLocalStorage:
   *     {boolean} default: true
   *     Whether to allow instant backups to be saved to browser localStorage.
   *
   *   defaultLocalStorageKey:
   *     {string} default: "markdown"
   *     The default key used for localStorage saving.
   *
   * @constructor
   * @param {object} options The editor's configuration options.
   * @return {object} The editor object.
   */
  function Editor(options) {
    var defaults = {
      containerId: "editor",
      placeholder: "Write Markdown",
      parser: {
        parse: (typeof marked === 'function') ? marked : null,
        options: (typeof marked === 'function') ? {
          gfm: true,
          tables: true,
          breaks: true,
          pedantic: false,
          sanitize: false,
          smartLists: true,
          smartypants: false,
          langPrefix: 'lang-'
        } : null
      },
      autosaveInterval: 1000,
      allowFullscreen: true,
      allowLocalStorage: true,
      defaultLocalStorageKey: "markdown",
    };

    // Merge the the default and configured options.
    $.extend(true, this, defaults, options);

    return this;
  };

  /**
   * Initializes the editor instance.
   *
   * Builds the editor within the configured container and sets it up for use.
   * This will throw an error if the specified container doesn't exist.
   */
  Editor.prototype.init = function() {
    var parser;

    // Get a reference to the editor container.
    this.container = $("#" + this.containerId);

    // Throw an error if not available.
    if (!this.container) {
      throw new Error("Editor cannot be created in non-existant container #" + this.containerId + ".");
    }

    // For the loading transition effect.
    this.onloadEffect(0);

    // The editor shouldn't start in fullscreen by default.
    this.isFullscreen = false;

    // Check for localStorage support.
    this.supportsLocalStorage = (this.allowLocalStorage && "localStorage" in window && window.localStorage !== null);

    // Build the editor layout.
    var layout =
      '<div class="wrapper wrapper-input">' +
      '</div>' +
      '<div class="wrapper wrapper-preview">' +
      '<div></div>' +
      '</div>' +
      '<div class="wrapper wrapper-output">' +
      '<textarea></textarea>' +
      '</div>' +
      '<div class="clearfix"></div>';

    // Set the layout.
    this.container.html(layout);

    // Create a reference to the input wrapper.
    this.inputWrapper = $('.wrapper-input');

    // Create a hash table of all added inputs.
    // Format: id => input
    this.inputs = {};

    // Get references to the editor panes.
    // The input pane will be set later by loadSession().
    this.inputPane = {};
    this.previewPane = $('.wrapper-preview > div');
    this.outputPane = $('.wrapper-output > textarea');

    // Set up autosizing on the output pane.
    this.outputPane.autosize();

    // Create parser pipeline variables.
    this.parsers = {
      pre: {},
      main: {},
      post: {}
    };

    // Get the parser configuration and clear it from the global object.
    parser = this.parser;
    delete this.parser;

    // Add the primary text parser.
    this.addParser('primary', 'main', 0, function(text) {
      return parser.parse(text, parser.options);
    });

    // Parse out script tags. This prevents javascript 
    // from being run every time the input is parsed.
    this.addParser('sanitize_scripts', 'post', 100, function(text) {
      text = text.bold();
      text = $(text).find('script').remove().end().html();  

      return text;
    });

    // Load any potentially saved sessions.
    this.loadSession();

    // Create an initial time to track autosaves from.
    this.lastAutosaveTime = new Date().getTime();

    // Set up event handlers.
    this.bind();

    // Fade in.
    this.onloadEffect(1);

    return this;
  };

  /**
   * Binds necessary events for use by the editor.
   */
  Editor.prototype.bind = function() {
    var self = this;

    // Parse input, and save changes if enough time has passed.
    this.container.on("change.editor", function() {
      var currentTime = new Date().getTime();
      if (currentTime - self.lastAutosaveTime > self.autosaveInterval) {
        self.lastAutosaveTime = currentTime;
        self.saveSession();
      }
      self.parseInput();
    });

    // Keep panes sized correctly when toggling fullscreen.
    this.container.on('fullscreen.enter fullscreen.exit', function() {
      self.autosize();
    });

    // Adjust panes to fit loaded content.
    this.container.on('loadSession.success', function() {
      self.autosize();
    });

    // Keep clicked links from navigating away from the app.
    this.previewPane.on("click", "a", function(event) {
      var href = $(this).attr('href');

      // Only open it in a new window if it's not an anchor link.
      if (href.substr(0, 1) != '#') {
        event.preventDefault();
        window.open($(this).attr('href'));
      }
    });

    // Save the session if leaving or refreshing page.
    $(window).on('beforeunload', function() {
      self.saveSession();
    });
  };

  /**
   * Keeps the input and output panes at the correct size for their contents.
   */
  Editor.prototype.autosize = function() {
    _.forEach(this.inputs, function(input) {
      input.trigger('autosize.resize');
    });

    this.outputPane.trigger('autosize.resize');
  };

  /**
   * Saves the input to browser localStorage.
   *
   * An exception will be thrown if localStorage exists but is
   * not enabled, or if the quota is exceeded. In such a scenario
   * the exception is caught, and localStorage saving disabled for
   * this session.
   *
   * @param {string} key The key of the item to save in localStorage. Defaults to "markdown".
   * @return {boolean} True on success, else false.
   */
  Editor.prototype.saveSession = function(key) {
    key = key || this.defaultLocalStorageKey;

    if (!this.supportsLocalStorage) {
      return false;
    }

    // Try to save the session. If that fails, disable localStorage saving.
    try {
      var session = this.getSessionData();
      localStorage.setItem(key, JSON.stringify(session));
    }
    catch (error) {
      console.log(error.stack);
      this.supportsLocalStorage = false;
      this.container.trigger('saveSession.failure');
      return false;
    }

    this.container.trigger('saveSession.success');
    return true;
  };

  /**
   * Loads saved text from browser localStorage into the input pane.
   *
   * An exception will be thrown if localStorage exists but is
   * not enabled. In such a scenario the exception is caught, and
   * localStorage saving disabled for this session.
   *
   * @param {string} key The key of the item to retrieve from localStorage. Defaults to "markdown".
   * @return {boolean} True on success, else false.
   */
  Editor.prototype.loadSession = function(key) {
    key = key || this.defaultLocalStorageKey;

    if (!this.supportsLocalStorage) {
      return false;
    }

    // Try to load the session. If that fails, disable localStorage saving.
    try {
      var session = JSON.parse(localStorage.getItem(key));
      var success = this.loadSessionData(session);

      // No session existed with that key.
      if (!success) {
        this.addInputPane('default');
        this.switchToInput('default');
      }
    }
    catch (error) {
      console.log(error.stack);
      this.supportsLocalStorage = false;
      this.container.trigger('loadSession.failure');
      return false;
    }

    this.container.trigger('loadSession.success');
    return true;
  };

  /**
   * Returns information about the current session.
   *
   * @return {object} An object containing the current session information.
   */
  Editor.prototype.getSessionData = function() {
    // Save open inputs and current selection information.
    var session = {
      inputData: {},
      focusedInputID: this.inputPane.attr('id'),
      selection: this.getSelection()
    };

    _.forEach(this.inputs, function(input, id) {
      session.inputData[id] = input.val();
    });

    return session;
  };

  /**
   * Loads a session based upon previous session data.
   *
   * @param {object} sessionData The session information.
   * @return {boolean} True on sucess, else false.
   */
  Editor.prototype.loadSessionData = function(sessionData) {
    if (!sessionData) {
      return false;
    }

    // Restore input panes.
    _.forEach(sessionData.inputData, function(contents, id) {
      this.addInputPane(id).val(contents);
    }, this);

    // Restore cursor state.
    var selection = sessionData.selection;
    this.switchToInput(sessionData.focusedInputID);
    this.selectRange(selection.start, selection.length);

    return true;
  }

  /**
   * Adds an input pane to the input list.
   *
   * This does not automatically set the input pane to active. Also note that
   * the textarea's ID in the DOM will have all runs of whitespace collapsed and
   * replaced with a single hyphen. This same replacement will not be applied to
   * the ID inside the inputs hash.
   *
   * @param {string} id The ID to assign to the input pane.
   * @param {string} placeholder The textarea placeholder. Defaults to the configured one.
   * @return {jQuery|boolean} The added input pane, or false on failure.
   */
  Editor.prototype.addInputPane = function(id, placeholder) {
    var input = this.getInputPane(id);
    var wrapper, self;

    if (!input) {
      placeholder = placeholder || this.placeholder;
      input = $('<textarea id="' + ("" + id).replace(/\s+/g, "-") + '" placeholder="' + placeholder + '"></textarea>');
      wrapper = $('<div class="inner-wrapper"></div>');

      // Add the textarea to the DOM and reference it in the input hash.
      // If there are no existing inputs, set inputPane to it.
      wrapper.appendTo(this.inputWrapper);
      input.appendTo(wrapper);

      if (_.isEmpty(this.inputs)) {
        this.inputPane = input;
      }

      this.inputs[id] = input;

      // Keep a reference while within the event handler.
      self = this;

      // Register editor changes.
      input.on('input', function() {
        self.container.trigger("change.editor");
      });

      // Show the input's preview when focused.
      input.on('focus', function() {
        self.switchToInput(id, false);
      });

      // Keep the input pane the correct size.
      input.autosize();
      return input;
    }

    return false;
  };

  /**
   * Removes an input pane from the input list.
   *
   * This will automatically focus another input pane, if one is available.
   * If the input pane removed is the last one, a blank one will be inserted
   * and focused.
   *
   * @param {string} id The ID of the input pane to remove.
   * @return {boolean} True on success, else false;
   */
  Editor.prototype.removeInputPane = function(id) {
    var input = this.getInputPane(id);

    if (!input) {
      return false;
    }

    input.parent().remove();
    delete this.inputs[id];

    // If there are no more inputs left, add one.
    if (_.isEmpty(this.inputs)) {
      this.addInputPane('default');
    }

    // This will automatically switch to the input.
    this.inputWrapper.children(':first-child').focus();

    return true;
  };

  /**
   * Hides an input pane.
   *
   * @param {string} id The ID of the input pane to hide;
   * @return {jQuery|boolean} The hidden input pane, or false on failure.
   */
  Editor.prototype.hideInputPane = function(id) {
    var input = this.getInputPane(id);

    if (!input) {
      return false;
    }

    input.parent().hide();
    return input;
  };

  /**
   * Shows an input pane.
   *
   * @param {string} id The ID of the input pane to show.
   * @return {jQuery|boolean} The shown input pane, or false on failure.
   */
  Editor.prototype.showInputPane = function(id) {
    var input = this.getInputPane(id);

    if (!input) {
      return false;
    }

    input.parent().show();
    return input;
  };

  /**
   * Toggles the visiblility of an input pane.
   *
   * @param {string} id The ID of the input pane to toggle.
   * @return {jQuery|boolean} The toggled input pane, or false on failure.
   */
  Editor.prototype.toggleShowInputPane = function(id, isVisible) {
    return isVisible ? this.showInputPane(id) : this.hideInputPane(id);
  };

  /**
   * Returns the input pane with the specified ID.
   *
   * @param {string} id The ID of the input pane to set.
   * @return {jQuery|boolean} The input pane, or false if no such input exists.
   */
  Editor.prototype.getInputPane = function(id) {
    return (typeof this.inputs[id] !== 'undefined') ? this.inputs[id] : false;
  };

  /**
   * Returns the content of the input pane with the specified ID.
   *
   * @param {string} id The ID of the input pane to set.
   * @return {string|boolean} The input pane contents, or false if no such input exists.
   */
  Editor.prototype.getInputText = function(id) {
    var input = this.getInputPane(id);
    return input ? input.val() : false;
  };

  /**
   * Sets the current input pane.
   *
   * @param {string} id The ID of the input pane to set.
   * @param {boolean} shouldFocus Whether to focus the given input pane.
   * @return {jQuery|boolean} The input pane, or false if no such input exists.
   */
  Editor.prototype.switchToInput = function(id, shouldFocus) {
    var input = this.getInputPane(id);

    if (!input) {
      return false;
    }

    // Whether to focus or not.
    if (typeof shouldFocus === 'undefined') shouldFocus = true;
    if (shouldFocus) input.focus();

    // Set the active input pane and update the preview.
    this.inputPane.parent().removeClass('active');
    input.parent().addClass('active');
    this.inputPane = input;
    this.parseInput();

    return true;
  };

  /**
   * Adds a parser to the parsing pipeline.
   *
   * Note that this will not render changes until parseInput() is called,
   * either manually or through an event trigger.
   *
   * @param {string} id A unique id identifying the parser.
   * @param {string} type The type of parser.
   * @param {integer} priority The parser priority. Higher numbers go first.
   * @param {function} parse The parsing function. Must accept and return a string.
   * @return {boolean} True on success, else false.
   */
  Editor.prototype.addParser = function(id, type, priority, parse) {
    var collection = this.getParserCollection(type);
    var parser = this.getParser(id, type);

    if (!collection || parser) {
      return false;
    }

    collection[id] = {
      parse: parse,
      priority: priority,
      isEnabled: true
    };

    return true;
  };

  /**
   * Removes a parser from the parsing pipeline.
   *
   * Note that this will not render changes until parseInput() is called,
   * either manually or through an event trigger.
   *
   * @param {string} id A unique id identifying the parser.
   * @param {string} type The type of parser. Either 'pre' or 'post'.
   * @return {boolean} True on success, else false.
   */
  Editor.prototype.removeParser = function(id, type) {
    var collection = this.getParserCollection(type);
    var parser = this.getParser(id, type);

    if (!collection || !parser) {
      return false;
    }

    delete collection[id];
    return true;
  };

  /**
   * Toggles a parser's state on or off within the parsing pipeline.
   *
   * @param {string} id A unique id identifying the parser.
   * @param {string} type The type of parser.
   * @param {boolean} isEnabled The state to set the parser to.
   * @return {boolean} True on success, else false.
   */
  Editor.prototype.toggleParser = function(id, type, isEnabled) {
    var parser = this.getParser(id, type);

    if (!parser) {
      return false;
    }

    parser.isEnabled = isEnabled;
    return true;
  };

  /**
   * Retrieves a parser object from the specified collection.
   *
   * @param {string} id The ID of the parser to retrieve.
   * @param {string} type The type of parser to retrieve.
   * @param {string|object} collection
   */
  Editor.prototype.getParser = function(id, type) {
    var collection = this.getParserCollection(type);
    return (typeof collection[id] !== 'undefined') ? collection[id] : false;
  };

  /**
   * Creates a new parser type.
   *
   * @param {string} type The type of parser collection to create.
   * @return {boolean} True on success, or false if it already exists.
   */
  Editor.prototype.addParserCollection = function(type) {
    if (!this.parsers[type]) {
      return false;
    }

    this.parsers[type] = [];
    return true;
  };

  /**
   * Removes a parser collection.
   *
   * @param {string} type The type of parser collection to remove.
   * @return {boolean} True on success, or false if it doesn't exist.
   */
  Editor.prototype.removeParserCollection = function(type) {
    if (this.parsers[type]) {
      return false;
    }

    delete this.parsers[type];
    return true;
  };

  /**
   * Returns a parser collection of the specified type.
   *
   * @param {string} type The collection type to retrieve.
   * @return {array|boolean} The parser collection, or false if it doesn't exist.
   */
  Editor.prototype.getParserCollection = function(type) {
    return (typeof this.parsers[type] !== 'undefined') ? this.parsers[type] : false;
  };

  /**
   * Parses text with the specified parsing pipeline and renders it
   * to the preview pane and output pane.
   *
   * Text will be run through the pipeline in the order given, and through
   * the parsers within each stage in order of their set priority.
   *
   * @param {array|string} pipeline The parser pipeline to use, or a single stage in the pipeline.
   * @return {string} The processed text.
   */
  Editor.prototype.parseText = function(text, pipeline) {
    var collection;

    // Avoid any nonsense if a string is passed.
    pipeline = [].concat(pipeline);

    // Order parsers by priority and apply the pipeline.
    _.forEach(pipeline, function(type) {
      collection = this.getParserCollection(type);

      _(collection)
        .toArray()
        .sortBy(collection, 'priority')
        .forEach(function(parser) {
          text = parser.parse(text);
        });

    }, this);

    return text;
  };

  /**
   * Parses text with the specified parsing pipeline and renders it
   * to the preview pane and output pane.
   *
   * @param {array} pipeline The parser pipeline. Defaults to ['pre', 'main', 'post'].
   */
  Editor.prototype.parseInput = function(pipeline) {
    pipeline = pipeline || ['pre', 'main', 'post'];
    var output = this.parseText(this.inputPane.val(), pipeline);

    // Update the panes.
    this.outputPane.val(output);
    this.previewPane.html(output);
  };

  /**
   * Insert text at the given cursor position.
   *
   * This function supports browser under/redo functionality.
   * If length !== 0, then a selection ranging from start to start + length
   * will be made, and any text there will be overwritten.
   *
   * @see http://stackoverflow.com/a/3308539/1270419 for bits of this.
   *
   * @param {string} text The text to input.
   * @param {integer} start The cursor position.
   * @param {integer} length The number of characters to overwrite.
   */
  Editor.prototype.putText = function(text, start, length) {
    var details = this.getSelection();
    var textarea = this.inputPane[0];
    var value = textarea.value;
    var endIndex, range, event;

    // Defaults.
    if (typeof start === 'undefined') {
      start = details.start;
      length = details.length;
    } else {
      length = length || 0;
      this.selectRange(start, length);
    }

    // Fire a textInput event, allowing the browser to use under/redo.
    // If that's not possible (I'm looking at you, Firefox!), fall back to older methods.
    if (typeof TextEvent !== 'undefined') {
      event = document.createEvent('TextEvent');
      event.initTextEvent('textInput', true, true, null, text);
      textarea.dispatchEvent(event);
    }
    else if (typeof textarea.selectionStart !== 'undefined' && typeof textarea.selectionEnd !== 'undefined') {
      endIndex = textarea.selectionEnd;
      textarea.value = value.slice(0, textarea.selectionStart) + text + value.slice(endIndex);
      textarea.selectionStart = textarea.selectionEnd = endIndex + text.length;
    }
    else if (typeof document.selection !== 'undefined' && typeof document.selection.createRange !== 'undefined') {
      range = document.selection.createRange();
      range.collapse(false);
      range.text = text;
      range.select();
    }
    else {
      // Well, whoops.
      throw new Error("Add better support to the putText() function!");
    }

    // Finish and adjust pane sizes.
    this.container.trigger("change.editor");
    this.autosize();
  };

  /**
   * Selects the given range of text.
   *
   * @see http://stackoverflow.com/a/4876790
   *
   * @param {integer} start The cursor position.
   * @param {integer} length The length of the selection.
   */
  Editor.prototype.selectRange = function(start, length) {
    var textarea = this.inputPane[0];
    var end = start + length;
    var range;

    // Allow negative lengths.
    if (length < 0) {
      end = start;
      start -= length;
    }

    // Focus the input pane.
    textarea.focus();

    // Create the selection.
    if (textarea.setSelectionRange !== 'undefined') { 
      textarea.setSelectionRange(start, end);
    } 
    else if (textarea.createTextRange !== 'undefined') { 
      range = textarea.createTextRange(); 
      range.collapse(true);
      range.moveEnd('character', end);
      range.moveStart('character', start); 
      range.select();
    } 
    else {
      // Well, whoops.
      throw new Error("Add better support to the selectRange() function!");
    }
  };

  /**
   * Selects all text in the input pane. 
   */
  Editor.prototype.selectAll = function() {
    this.selectRange(0, this.inputPane.val().length);
  };

  /**
   * Set the cursor position.
   *
   * @param {integer} position The cursor position.
   */
  Editor.prototype.setCursor = function(position) {
    this.selectRange(position, 0);
  };

  /**
   * Returns an object describing the current selection.
   *
   * The object returned contains the start, end, length, and value
   * contained by the selection.
   * @see http://stackoverflow.com/a/12194504
   *
   * @return {start, end, length, value} An object describing the selection.
   */
  Editor.prototype.getSelection = function() {
    var textarea = this.inputPane[0];
    var start = 0;
    var end = 0;
    var normalizedValue, range, textInputRange, length, endRange;

    // Get the selection start and end.
    if (typeof textarea.selectionStart === 'number' && typeof textarea.selectionEnd === 'number') {
      start = textarea.selectionStart;
      end = textarea.selectionEnd;
    } else {
      range = document.selection.createRange();

      if (range && range.parentElement() === textarea) {
        length = textarea.value.length;
        normalizedValue = textarea.value.replace(/\r\n/g, "\n");

        // Create a working TextRange that lives only in the input.
        textInputRange = textarea.createTextRange();
        textInputRange.moveToBookmark(range.getBookmark());

        // Check if the start and end of the selection are at the very end
        // of the input, since moveStart/moveEnd doesn't return what we want
        // in those cases.
        endRange = textarea.createTextRange();
        endRange.collapse(false);

        if (textInputRange.compareEndPoints("StartToEnd", endRange) > -1) {
          start = end = length;
        } else {
          start = -textInputRange.moveStart("character", -length);
          start += normalizedValue.slice(0, start).split("\n").length - 1;

          if (textInputRange.compareEndPoints("EndToEnd", endRange) > -1) {
            end = length;
          } else {
            end = -textInputRange.moveEnd("character", -length);
            end += normalizedValue.slice(0, end).split("\n").length - 1;
          }
        }
      }
    }

    return {
      start: start,
      end: end,
      length: end - start,
      value: textarea.value.substring(textarea.selectionStart, textarea.selectionEnd)
    };
  };

  /**
   * Toggles fullscreen on the specified pane.
   *
   * @param {boolean} on True if fullscreen should be on, else false.
   * @param {string|object} pane Identifier for the pane to make fullscreen. Defaults to 'input'.
   */
  Editor.prototype.toggleFullscreen = function(on, pane) {
    if (!this.isFullscreen && !this.allowFullscreen) return;

    // Set the active pane.
    pane = this.getPane(pane || this.inputPane);
    this.getPanes().parents().filter('.fullscreen-target').removeClass('fullscreen-target');

    // Toggle fullscreen.
    if (on) {
      this.container.addClass('fullscreen');
      pane.parents().filter('.wrapper').addClass('fullscreen-target');
      this.container.trigger('fullscreen.enter');
    } else {
      this.container.removeClass('fullscreen');
      this.container.trigger('fullscreen.exit');
    }

    this.isFullscreen = !this.isFullscreen;
  };

  /**
   * Returns the specified pane.
   *
   * Resolves selectors into jQuery objects if neccessary, and ensures
   * that the specified object is actually an editor pane.
   *
   * @param {string|object} pane A jQuery object or string identifying a pane.
   * @return {jQuery} The selected pane, or false on failure.
   */
  Editor.prototype.getPane = function(pane) {
    if (pane instanceof jQuery) {
      return pane;
    }
    else if (pane instanceof String || typeof pane === 'string') {
      var identifier = pane.toLowerCase();
      if (identifier === 'input'  ) return this.inputPane;
      if (identifier === 'preview') return this.previewPane;
      if (identifier === 'output' ) return this.outputPane;
    }

    return false;
  };

  /**
   * Returns a jQuery object containing all the panes.
   *
   * Note that only the active input pane will be included. In 
   * other words, this is an easy way to get the current references
   * to inputPane, outputPane, and previewPane, all at once.
   *
   * @return {jQuery} All the panes.
   */
  Editor.prototype.getPanes = function() {
    return this.inputPane.add(this.previewPane).add(this.outputPane);
  };

  /**
   * Runs the loading fade-in effect.
   *
   * Note that this only looks good on a similar-coloured background.
   *
   * @param {int} step The step of the animation. 0 is the start, and 1 is the finish.
   */
  Editor.prototype.onloadEffect = function(step) {
    if (step === 0) this.container.fadeTo(0, 0);
    else if (step === 1) this.container.fadeTo(1000, 1);
  };

  // Expose global constructor.
  global.Editor = Editor;
}(this);

