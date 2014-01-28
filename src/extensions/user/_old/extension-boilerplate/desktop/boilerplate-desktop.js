/**
 * graceful-extension-boilerplate
 *
 * If you've never read a style guide before, try this one: https://github.com/airbnb/javascript
 * You don't have to follow it to the letter. (I don't).
 *
 * Major points:
 *   2 space indent,
 *   keep your code inside modules,
 *   start modules with a 'use strict' statement,
 *   declare variables as high up within scope as possible,
 *   and use descriptive variables!
 *
 * And if that drives you up the wall, it's working just about right.
 * Your future self will thank you (and people will be more likely to contribute,
 * if your extension is open source).
 *
 * Breakdance!
 * (Check out the webapp example as well.)
 */


!function(global) {
  'use strict';

  console.log("Welcome to desktop mode! Wasn't that easy?");

  // Add a post-parser.
  graceful.editor.addParser('add_signature', 'post', 0, function(text) {
    return text + '<div class="signature"><p>Made by __name__.</p><p class="tiny">(Double click me for awesome!)</p></div>';
  });

  // Remember all the cool things you can do in desktop mode!
  graceful.editor.previewPane.on('dblclick', '.signature', function() {
    appshell.app.openURLInDefaultBrowser('http://www.youtube.com/watch?v=a0jZzBEKIMc');
  });
}(this);

