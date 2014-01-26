/**
 * This file runs all final initialization for graceful.
 */


!function(global) {
  'use strict';

  // Use highlight.js for code blocks.
  function highlight(code, lang) {
    var value = lang && hljs.LANGUAGES.hasOwnProperty(lang.toLowerCase())
      ? hljs.highlight(lang, code).value 
      : hljs.highlightAuto(code).value;
    return value;
  }
  // Editor configuration.
  var opts = { parser: { options: { highlight: highlight } } };

  // Set up the global graceful object.
  graceful.editor = new Editor(opts);
  graceful.editor.init();
  graceful.documentManager = new DocumentManager(graceful.editor);

  // Execute all the graceful onLoad listeners.
  _.forEach(graceful.onLoadListeners, function(func) {
    func();
  });

  // Clear the listeners and set the isLoaded flag.
  graceful.onLoadListeners = [];
  graceful.isLoaded = true;

}(this);

