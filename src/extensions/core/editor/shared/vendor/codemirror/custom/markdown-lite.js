CodeMirror.defineMode("markdown-lite", function(cmCfg, modeCfg) {

  var htmlFound = CodeMirror.modes.hasOwnProperty("xml");
  var htmlMode = CodeMirror.getMode(cmCfg, htmlFound ? {name: "xml", htmlMode: true} : "text/plain");
  var aliases = {
    html: "htmlmixed",
    js: "javascript",
    json: "application/json",
    c: "text/x-csrc",
    "c++": "text/x-c++src",
    java: "text/x-java",
    csharp: "text/x-csharp",
    "c#": "text/x-csharp",
    scala: "text/x-scala"
  };

  var getMode = (function () {
    var i, modes = {}, mimes = {}, mime;

    var list = [];
    for (var m in CodeMirror.modes)
      if (CodeMirror.modes.propertyIsEnumerable(m)) list.push(m);
    for (i = 0; i < list.length; i++) {
      modes[list[i]] = list[i];
    }
    var mimesList = [];
    for (var m in CodeMirror.mimeModes)
      if (CodeMirror.mimeModes.propertyIsEnumerable(m))
        mimesList.push({mime: m, mode: CodeMirror.mimeModes[m]});
    for (i = 0; i < mimesList.length; i++) {
      mime = mimesList[i].mime;
      mimes[mime] = mimesList[i].mime;
    }

    for (var a in aliases) {
      if (aliases[a] in modes || aliases[a] in mimes)
        modes[a] = aliases[a];
    }

    return function (lang) {
      return modes[lang] ? CodeMirror.getMode(cmCfg, modes[lang]) : null;
    };
  }());

  var codeDepth = 0;

  var formatting = 'formatting'
  ,   header     = 'header'
  ,   em         = 'em'
  ,   strong     = 'strong';

  var atxHeaderRE = /^#+/
  ,   setextHeaderRE = /^(?:\={3,}|-{3,})$/
  ,   textRE = /^[^#!\[\]*_\\<>` "'(]+/;

  function switchInline(stream, state, f) {
    state.f = state.inline = f;
    return f(stream, state);
  }

  function switchBlock(stream, state, f) {
    state.f = state.block = f;
    return f(stream, state);
  }


  // Blocks

  function blankLine(state) {
    // Reset EM state
    state.em = false;
    // Reset STRONG state
    state.strong = false;
    // Reset state.trailingSpace
    state.trailingSpace = 0;
    state.trailingSpaceNewLine = false;
    // Mark this line as blank
    state.thisLineHasContent = false;
    return null;
  }

  function blockNormal(stream, state) {
    var sol            = stream.sol();
    var match          = null;

    if (stream.eatSpace()) {
      return null;
    } else if (match = stream.match(atxHeaderRE)) {
      state.header = match[0].length <= 6 ? match[0].length : 6;
      state.formatting =  true;
      state.f = state.inline;
      return getType(state);
    } else if (state.prevLineHasContent && (match = stream.match(setextHeaderRE))) {
      state.header = 'underline-' + (match[0].charAt(0) == '=' ? 1 : 2);
      state.formatting = true;
      state.f = state.inline;
      return getType(state);
    }

    return switchInline(stream, state, state.inline);
  }

  // Inline
  function getType(state) {
    var styles = [];

    if (state.formatting) { styles.push(formatting); }

    if (state.strong) { styles.push(strong); }
    if (state.em) { styles.push(em); }
    if (state.header) { styles.push(header); styles.push(header + '-' + state.header); }

    if (state.trailingSpaceNewLine) {
      styles.push("trailing-space-new-line");
    } else if (state.trailingSpace) {
      styles.push("trailing-space-" + (state.trailingSpace % 2 ? "a" : "b"));
    }

    return styles.length ? styles.join(' ') : null;
  }

  function handleText(stream, state) {
    if (stream.match(textRE, true)) {
      return getType(state);
    }
    return undefined;
  }

  function inlineNormal(stream, state) {
    var style = state.text(stream, state);
    if (typeof style !== 'undefined')
      return style;

    if (state.header && stream.match(/^#+$/, true)) {
      return getType(state);
    }

    // Get sol() value now, before character is consumed
    var sol = stream.sol();
    var ch  = stream.next();

    if (state.escape) {
      state.escape = false;
      return getType(state);
    }

    if (ch === '\\') {
      state.escape = true;
      return getType(state);
    }

    var ignoreUnderscore = false;
    if (ch === '_' && stream.peek() !== '_' && stream.match(/(\w)/, false)) {
      var prevPos = stream.pos - 2;
      if (prevPos >= 0) {
        var prevCh = stream.string.charAt(prevPos);
        if (prevCh !== '_' && prevCh.match(/(\w)/, false)) {
          ignoreUnderscore = true;
        }
      }
    }

    if (ch === '*' || (ch === '_' && !ignoreUnderscore)) {
      if (sol && stream.peek() === ' ') {
        // Do nothing, surrounded by newline and space
      } else if (state.strong === ch && stream.eat(ch)) { // Remove STRONG
        state.formatting = true;
        var t = getType(state);
        state.strong = false;
        return t;
      } else if (!state.strong && stream.eat(ch)) { // Add STRONG
        state.strong = ch;
        state.formatting = true;
        return getType(state);
      } else if (state.em === ch) { // Remove EM
        state.formatting = true;
        var t = getType(state);
        state.em = false;
        return t;
      } else if (!state.em) { // Add EM
        state.em = ch;
        state.formatting = true;
        return getType(state);
      }
    } else if (ch === ' ') {
      if (stream.eat('*') || stream.eat('_')) { // Probably surrounded by spaces
        if (stream.peek() === ' ') { // Surrounded by spaces, ignore
          return getType(state);
        } else { // Not surrounded by spaces, back up pointer
          stream.backUp(1);
        }
      }
    }

    if (ch === ' ') {
      if (stream.match(/ +$/, false)) {
        state.trailingSpace++;
      } else if (state.trailingSpace) {
        state.trailingSpaceNewLine = true;
      }
    }

    return getType(state);
  }

  var savedInlineRE = [];
  function inlineRE(endChar) {
    if (!savedInlineRE[endChar]) {
      // Escape endChar for RegExp (taken from http://stackoverflow.com/a/494122/526741)
      endChar = (endChar+'').replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1");
      // Match any non-endChar, escaped character, as well as the closing
      // endChar.
      savedInlineRE[endChar] = new RegExp('^(?:[^\\\\]|\\\\.)*?(' + endChar + ')');
    }
    return savedInlineRE[endChar];
  }

  var mode = {
    startState: function() {
      return {
        f: blockNormal,

        prevLineHasContent: false,
        thisLineHasContent: false,

        block: blockNormal,

        inline: inlineNormal,
        text: handleText,

        escape: false,
        em: false,
        strong: false,
        header: 0,
        trailingSpace: 0,
        trailingSpaceNewLine: false
      };
    },

    copyState: function(s) {
      return {
        f: s.f,

        prevLineHasContent: s.prevLineHasContent,
        thisLineHasContent: s.thisLineHasContent,

        block: s.block,

        inline: s.inline,
        text: s.text,
        escape: false,
        em: s.em,
        strong: s.strong,
        header: s.header,
        trailingSpace: s.trailingSpace,
        trailingSpaceNewLine: s.trailingSpaceNewLine,
        md_inside: s.md_inside
      };
    },

    token: function(stream, state) {

      state.formatting = false;

      if (stream.sol()) {
        var forceBlankLine = stream.match(/^\s*$/, true) || state.header;

        // Reset state.header
        state.header = 0;

        if (forceBlankLine) {
          state.prevLineHasContent = false;
          return blankLine(state);
        } else {
          state.prevLineHasContent = state.thisLineHasContent;
          state.thisLineHasContent = true;
        }

        // Reset state.escape
        state.escape = false;

        // Reset state.trailingSpace
        state.trailingSpace = 0;
        state.trailingSpaceNewLine = false;

        state.f = state.block;
      }
      return state.f(stream, state);
    },

    blankLine: blankLine,

    getType: getType
  };
  return mode;
}, "xml");

CodeMirror.defineMIME("text/x-markdown", "markdown");
