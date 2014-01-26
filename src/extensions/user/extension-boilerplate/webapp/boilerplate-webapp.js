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
 * (Check out the desktop example as well.)
 */


!function(global) {
  'use strict';

  console.log("Welcome to webapp mode! That was pretty simple.");

  // Example of adding a pre-parser.
  // This will toggle bold on all occurrences of the word 'jello', using a case-insensitive match.
  graceful.editor.addParser('toggle_bold_on_jello', 'pre', 0, function(text) {
    return text.replace(/jello/gi, function(match) {
      return '**' + match + '**';
    });
  });

  // Insert a small text snippet on load to test the above parser.
  var text = '#### Parse the jello!\nJello jello, hello yellow! Only ' +
    'the first two words are bolded.\nNotice that words just *containing* a ' +
    'match will have only the \'jello\' substring bolded. Yellowjellohello.\n\n';

  // Utilize the graceful.editor object.
  graceful.editor.putText(text, 0, 0);
}(this);

