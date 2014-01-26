/**
 * This is the user configuration file. Here you can set certain configuration values
 * on the global graceful object. Right now that's limited to user extensions.
 *
 * Since you also have access to the core extensions and all loaded vendor code, you
 * can also extend graceful's functionality from this file. However, while trivial feature
 * additions are fine here, it's best if you instead make them into extensions. Just copy
 * the extension-boilerplate directory (found in the user extensions folder) and get coding.
 *
 * Take a look at load.js to see what's available for use in this file.
 */

'use strict';

/** 
 * Define extensions to load from the extensions/user directory 
 * by specifying their folder names here.
 */
graceful.userExtensions = [

];

/**
 * Here you can define useful commands, as well as configure
 * the editor.
 *
 * link    -> link the pane with focus to the pane with the given index.
 * save    -> a test save commmand.
 * split_h -> opens a horizontal split pane.
 * split_v -> opens a vertical split pane.
 * dev     -> opens the debug window.
 * quit    -> quits the application.
 */
graceful.onLoad(function() {
  graceful.editor.defineCommand('link', 1, function(paneNumber) {
    paneNumber = parseInt(paneNumber, 10);
    graceful.editor.getFocusPane().linkToPane(graceful.editor.panes[paneNumber]);
  });

  graceful.editor.defineCommand('save', 1, function(name) {
    console.log('saved ' + name);
  });

  graceful.editor.defineCommand('split_h', 1, function(duplicate) {
    var focusPane = graceful.editor.getFocusPane();
    var buffer = duplicate ? focusPane.buffer : new Buffer('');
    var pane = graceful.editor.addPane(InputPane, [buffer, null], 'horizontal');

    // Does not currently work due to order of operations.
    // This focuses the new pane, but that focus is overriden at the end
    // of closeCommandBar().
    pane.focus();
  });

  graceful.editor.defineCommand('split_v', 1, function(duplicate) {
    var focusPane = graceful.editor.getFocusPane();
    var buffer = duplicate ? focusPane.buffer : new Buffer('');
    var pane = graceful.editor.addPane(InputPane, [buffer, null], 'vertical', focusPane);

    // Does not currently work due to order of operations.
    // This focuses the new pane, but that focus is overriden at the end
    // of closeCommandBar().
    pane.focus();
  });

  graceful.editor.defineCommand('dev', 0, function() {
    // Open up Chrome dev tools in a new window.
    appshell.app.showDeveloperTools();
  });

  graceful.editor.defineCommand('quit', 0, function() {
    // Quit debug window, if open.
    appshell.app.closeLiveBrowser();

    // Shut down the application.
    appshell.app.quit();
  });

  graceful.editor.defineCommand('close', 0, function() {
    var focusPane = graceful.editor.getFocusPane();
    graceful.editor.removePane(focusPane);
  });
});
