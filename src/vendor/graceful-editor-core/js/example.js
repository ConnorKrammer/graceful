'use strict';

/* global hljs */
/* global Editor */
/* global Graceful */

$(document).ready(function () {
  var opts = {
    parserOptions: {
      highlight: function (code, lang) {
        return lang && hljs.LANGUAGES.hasOwnProperty(lang.toLowerCase())
          ? hljs.highlight(lang, code).value
          : hljs.highlightAuto(code).value;
      }
    }
  };

  var editor = new Editor(opts).init();
});
