/**
 * graceful-version-control
 *
 * Adds the VersionControl object to the global namespace, responsible for comparing
 * and patching files and strings.
 *
 * Note the use of the javascript promise library, q, for asynchronous code.
 * See here (https://github.com/kriskowal/q) for more on understanding async promises.
 */


!function(global) {
  'use strict';

  // Create a diff_match_patch object for internal use, so we
  // don't have to expose the whole API.
  var dmp = new diff_match_patch();

  // Set the diff timeout to unlimited.
  dmp.Diff_Timeout = 0;

  /**
   * NOTE: This is a form of diff_linesToChars modified to operate on words.
   *
   * Split two texts into an array of strings. Reduce the texts to a string of
   * hashes where each Unicode character represents one word.
   * @param {string} text1 First string.
   * @param {string} text2 Second string.
   * @return {{chars1: string, chars2: string, wordArray: !Array.<string>}}
   *     An object containing the encoded text1, the encoded text2 and
   *     the array of unique strings.
   *     The zeroth element of the array of unique strings is intentionally blank.
   * @private
   */
  diff_match_patch.diff_wordsToChars_ = function(text1, text2) {
    var wordArray = [];  // e.g. wordArray[4] == 'Hello\n'
    var wordHash = {};   // e.g. wordHash['Hello\n'] == 4

    // '\x00' is a valid character, but various debuggers don't like it.
    // So we'll insert a junk entry to avoid generating a null character.
    wordArray[0] = '';

    /**
     * Returns the index of the regex-matched text.
     *
     * @param {string} string The string to match with.
     * @param {regex} regex The regex to match for.
     * @param {integer} startpos The starting position to match from.
     * @return {integer} The index of the matching string.
     */
    function regexIndexOf(string, regex, startpos) {
      var indexOf = string.substring(startpos || 0).search(regex);
      return (indexOf >= 0) ? (indexOf + (startpos || 0)) : indexOf;
    }

    /**
     * Split a text into an array of strings.  Reduce the text to a string of
     * hashes where each Unicode character represents one word.
     * Modifies wordarray and wordhash through being a closure.
     * @param {string} text String to encode.
     * @return {string} Encoded string.
     * @private
     */
    function diff_wordsToCharsMunge_(text) {
      var chars = '';
      // Walk the text, pulling out a substring for each word.
      // text.split('\n') would would temporarily double our memory footprint.
      // Modifying text would create many large strings to garbage collect.
      var wordStart = 0;
      var wordEnd = -1;
      // Keeping our own length variable is faster than looking it up.
      var wordArrayLength = wordArray.length;
      while (wordEnd < text.length - 1) {
        wordEnd = regexIndexOf(text, /\s+/, wordStart);
        if (wordEnd === -1) {
          wordEnd = text.length - 1;
        }
        var whiteSpaceLength = text.match(/\s+/, wordStart).length;
        var word = text.substring(wordStart, wordEnd + whiteSpaceLength);
        wordStart = wordEnd + whiteSpaceLength;

        if (wordHash.hasOwnProperty ? wordHash.hasOwnProperty(word) 
            : (wordHash[word] !== undefined)) {
              chars += String.fromCharCode(wordHash[word]);
            } else {
              chars += String.fromCharCode(wordArrayLength);
              wordHash[word] = wordArrayLength;
              wordArray[wordArrayLength++] = word;
            }
      }
      return chars;
    }

    var chars1 = diff_wordsToCharsMunge_(text1);
    var chars2 = diff_wordsToCharsMunge_(text2);
    return { chars1: chars1, chars2: chars2, wordArray: wordArray };
  };

  /**
   * Define the VersionControl namespace.
   */
  function VersionControl() {}

  /**
   * Returns a diff of the two texts.
   *
   * @param {string} original The original text.
   * @param {string} modified The modified text.
   * @return {array} An array of diffs between the original and modified strings.
   */
  VersionControl.diff = function(original, modified) {
    return dmp.diff_main(original, modified);
  };

  /**
   * Computes a diff using words, not characters, as the atomic unit.
   *
   * @see http://code.google.com/p/google-diff-match-patch/wiki/LineOrWordDiffs
   *
   * @param {string} original The original text.
   * @param {string} modified The modified text.
   * @return {array} An array of diffs between the original and modified strings.
   */
  VersionControl.diffWords = function(original, modified) {
    var a = dmp.diff_wordsToChars_(original, modified);
    var wordText1 = a.chars1;
    var wordText2 = a.chars2;
    var wordArray = a.wordArray;

    var diffs = dmp.diff_main(wordText1, wordText2, false);

    // The function is named for lines, but it will work for words.
    dmp.diff_charsToLines_(diffs, wordArray);
    return diffs;
  }

  /**
   * Computes a diff using lines, not words or characters, as the atomic unit.
   *
   * @see http://code.google.com/p/google-diff-match-patch/wiki/LineOrWordDiffs
   *
   * @param {string} original The original text.
   * @param {string} modified The modified text.
   * @return {array} An array of diffs between the original and modified strings.
   */
  VersionControl.diffLines = function(original, modified) {
    var a = dmp.diff_linesToChars_(original, modified);
    var lineText1 = a.chars1;
    var lineText2 = a.chars2;
    var lineArray = a.lineArray;

    var diffs = dmp.diff_main(lineText1, lineText2, false);

    dmp.diff_charsToLines_(diffs, lineArray);
    return diffs;
  }

  /**
   * Cleans up a diff to be more human-readable.
   *
   * @param {array} diff An array of diffs to make readable.
   * @return {array} A more human-readable (though less compact) diff.
   */
  VersionControl.tidyDiff = function(diffs) {
    return dmp.diff_cleanupSemantic(diffs); 
  };

  /**
   * Makes a patch that can be used to apply changes to a text.
   *
   * This function takes several possible arguments. The combinations are:
   *
   * makePatch(original, modified) both are strings
   * makePatch(original, diffs)    the first is a string and the second is the array of diffs
   * makePatch(diffs)              an array of diffs
   *
   * The (original, diffs) format is optimal, if you have the information, but otherwise the 
   * missing pieces will be computed.
   *
   * If no diffs are passed in as arguments, then the diffs are computed using diffWords().
   * If this behaviour is undesired, then compute the diff yourself and pass that in as an argument.
   *
   * @param {array|string} first Either an array of diffs, or the original text.
   * @param {array|string} second Either an array of diffs, or the modified string.
   * @return {array|boolean} The array of patches, or false if the parameters are invalid.
   */
  VersionControl.makePatch = function(first, second) {
    if (typeof first === 'array') {
      return dmp.patch_make(first);
    }
    else if (typeof first === 'string' && typeof second === 'string') {
      return dmp.patch_make(first, VersionControl.diffWords(first, second));
    }
    else if (typeof first === 'string' && typeof second === 'array') {
      return dmp.patch_make(first, second);
    }

    return false;
  };

  /**
   * Applies a single patch onto a text and returns the result.
   *
   * @param {string} original The text to apply the patch to.
   * @param {array} patch The patch to apply.
   * @return {string} The patched string.
   */
  VersionControl.applyPatch = function(original, patch) {
    return dmp.patch_apply(patch, original)[0];
  };

  /**
   * Applies multiple patches onto a text and returns the result.
   *
   * @param {string} original The text to apply the patches to.
   * @param {array} patches The patches to apply.
   * @return {string} The patched string.
   */
  VersionControl.applyPatches = function(original, patches) {
    _.forEach(patches, function(patch) {
      original = VersionControl.applyPatch(original, patch);
    });

    return original;
  };

  /**
   * Creates a string from an array of patches.
   *
   * @param {array} patches The patches to make into a string.
   * @return {string} The patch in string form.
   */
  VersionControl.patchToText = function(patches) {
    return dmp.patch_toText(patches);
  };

  /**
   * Creates an array of patches from a string.
   *
   * @param {string} text The patch in string form.
   * @return {array} The patches to make into a string.
   */
  VersionControl.patchFromText = function(text) {
    return dmp.patch_fromText(text);
  };

  // Expose globals.
  global.VersionControl = VersionControl;
}(this);

