CodeMirror.defineMode("markdown", function(cmCfg, modeCfg) {

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

  // Should underscores in words open/close em/strong?
  if (modeCfg.underscoresBreakWords === undefined)
    modeCfg.underscoresBreakWords = true;

  // Turn on fenced code blocks? ("```" to start/end)
  if (modeCfg.fencedCodeBlocks === undefined) modeCfg.fencedCodeBlocks = false;

  // Turn on task lists? ("- [ ] " and "- [x] ")
  if (modeCfg.taskLists === undefined) modeCfg.taskLists = false;

  var codeDepth = 0;

  var header1          = 'header-1'
  ,   header2          = 'header-2'
  ,   header3          = 'header-3'
  ,   header4          = 'header-4'
  ,   header5          = 'header-5'
  ,   header6          = 'header-6'
  ,   headerUnderline  = 'header-underline'
  ,   code             = 'code'
  ,   codeInline       = 'code-inline'
  ,   quote1           = 'quote-1'
  ,   quote2           = 'quote-2'
  ,   list1            = 'list-1'
  ,   list2            = 'list-2'
  ,   list3            = 'list-3'
  ,   hr               = 'hr'
  ,   image            = 'image'
  ,   linkinline       = 'link-inline'
  ,   linkemail        = 'link-email'
  ,   linktext         = 'link-text'
  ,   linkhref         = 'link-href'
  ,   linktitle        = 'link-title'
  ,   em               = 'emphasis'
  ,   strong           = 'strong'
  ,   strikeThrough    = 'strikethrough'
  ,   specialCharacter = 'special-character'
  ,   taskOpen         = 'task-open'
  ,   taskClosed       = 'task-'
  ,   open             = '-open'
  ,   close            = '-close';

  var hrRE       = /^([*\-=_])(?:\s*\1){2,}\s*$/
  ,   ulRE       = /^[*\-+]\s+/
  ,   olRE       = /^[0-9]+\.\s+/
  ,   taskListRE = /^\[(\w| )\](?=\s)/ // Must follow ulRE or olRE
  ,   header1RE  = /^(?:={1,})[ \t]*$/
  ,   header2RE  = /^(?:-{1,})[ \t]*$/
  ,   textRE     = /^[^!\[\]*_\\<>` "'(~]+/;

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
    // Reset linkTitle state
    state.linkTitle = false;
    // Reset linkHref state
    state.linkHref = false;
    // Reset EM state
    state.em = false;
    // Reset STRONG state
    state.strong = false;
    // Reset format stack state
    state.formatStack = [];
    // Reset strikeThrough state
    state.strikeThrough = false;
    // Reset special character state
    state.specialCharacter = false;
    // Reset image staet.
    state.image = false;
    // Reset state.quote
    state.quote = 0;
    if (!htmlFound && state.f == htmlBlock) {
      state.f = inlineNormal;
      state.block = blockNormal;
    }
    // Reset state.trailingSpace
    state.trailingSpace = 0;
    state.trailingSpaceNewLine = false;
    // Mark this line as blank
    state.thisLineHasContent = false;
    return null;
  }

  function blockNormal(stream, state) {
    state.specialCharacter = false;
    var prevLineIsList = (state.list !== false);
    if (state.list !== false && state.indentationDiff >= 0) { // Continued list
      if (state.indentationDiff < 4) { // Only adjust indentation if *not* a code block
        state.indentation -= state.indentationDiff;
      }
      state.list = null;
    }
    else if (state.list !== false && state.indentation > 0) {
      state.list = null;
      state.listDepth = Math.floor(state.indentation / 4);
    }
    else if (state.list !== false) { // No longer a list
      state.list = false;
      state.listDepth = 0;
    }

    if (state.indentationDiff >= 4) {
      state.indentation -= 4;
      stream.skipToEnd();
      return code + ' ' + 'code-indented';
    }
    else if (stream.eatSpace()) {
      return null;
    }
    else if (stream.peek() === '#') {
      var match = stream.match(/^(#*)/, false)[0];
      state.header = match.length;
    }
    else if (state.prevLineHasContent && stream.match(header1RE, true)) {
      state.header = 1;
      state.headerUnderline = true;
    }
    else if (state.prevLineHasContent && stream.match(header2RE, true)) {
      state.header = 2;
      state.headerUnderline = true;
    }
    else if (stream.eat('>')) {
      state.indentation++;
      state.quote = 1;
      stream.eatSpace();
      while (stream.eat('>')) {
        stream.eatSpace();
        state.quote++;
      }
    }
    else if (stream.peek() === '[') {
      return switchInline(stream, state, footnoteLink);
    }
    else if (stream.match(hrRE, true)) {
      return hr;
    }
    else if ((!state.prevLineHasContent || prevLineIsList) && (stream.match(ulRE, true) || stream.match(olRE, true))) {
      state.indentation += 4;
      state.list = true;
      state.listDepth++;
      if (modeCfg.taskLists && stream.match(taskListRE, false)) {
        state.taskList = true;
      }
    }
    else if (modeCfg.fencedCodeBlocks && stream.match(/^```([\w+#]*)/, true)) {
      if (stream.match(/^[ \t]+[\w]/, true)) {
        return null;
      }

      // try switching mode
      state.localMode = getMode(RegExp.$1);
      if (state.localMode) state.localState = state.localMode.startState();
      switchBlock(stream, state, local);
      return code + ' ' + specialCharacter + ' ' + code + open;
    }

    return switchInline(stream, state, state.inline);
  }

  function htmlBlock(stream, state) {
    var style = htmlMode.token(stream, state.htmlState);
    if (htmlFound && style === 'tag' && state.htmlState.type !== 'openTag' && !state.htmlState.context) {
      state.f = inlineNormal;
      state.block = blockNormal;
    }
    if (state.md_inside && stream.current().indexOf(">")!=-1) {
      state.f = inlineNormal;
      state.block = blockNormal;
      state.htmlState.context = undefined;
    }
    return style;
  }

  function local(stream, state) {
    if (stream.sol() && stream.match(/^```/, true)) {
      state.localMode = state.localState = null;
      state.f = inlineNormal;
      state.block = blockNormal;
      return code + ' ' + specialCharacter + ' ' + code + close;
    }
    else if (state.localMode) {
      return state.localMode.token(stream, state.localState) + ' ' + code;
    }
    else {
      stream.skipToEnd();
      return code;
    }
  }

  // Inline
  function getType(state) {
    var styles = [];

    if (state.taskOpen)   { return taskOpen; }
    if (state.taskClosed) { return taskClosed + state.taskClosed; }

    if (state.strong)        { styles.push(strong); }
    if (state.em)            { styles.push(em); }
    if (state.strikeThrough) { styles.push(strikeThrough); }
    
    if (state.specialCharacter) { styles.push(specialCharacter); }

    if (state.linkText)  { styles.push(linktext); }
    if (state.linkHref)  { styles.push(linkhref); }
    if (state.linkTitle) { styles.push(linktitle); }

    if (state.image) { styles.push(image); }

    if (state.code) { styles.push(code); }
    else if (state.codeInline) { styles.push(codeInline); }

    if (state.headerUnderline)   { styles.push(headerUnderline); }
    if (state.header === 1)      { styles.push(header1); }
    else if (state.header === 2) { styles.push(header2); }
    else if (state.header === 3) { styles.push(header3); }
    else if (state.header === 4) { styles.push(header4); }
    else if (state.header === 5) { styles.push(header5); }
    else if (state.header >=  6) { styles.push(header6); }
    
    if (state.quote) { styles.push(state.quote % 2 ? quote1 : quote2); }

    if (state.list !== false) {
      var listMod = (state.listDepth - 1) % 3;
      if (!listMod) {
        styles.push(list1);
      }
      else if (listMod === 1) {
        styles.push(list2);
      }
      else {
        styles.push(list3);
      }
    }

    if (state.trailingSpaceNewLine) {
      styles.push("trailing-space-new-line");
    }
    else if (state.trailingSpace) {
      styles.push("trailing-space-" + (state.trailingSpace % 2 ? "a" : "b"));
    }

    return styles.length ? styles.join(' ') : null;
  }

  function handleText(stream, state) {
    if (stream.match(textRE, true)) {
      state.specialCharacter = false;
      return getType(state);
    }
    return undefined;
  }

  function inlineNormal(stream, state) {
    var style = state.text(stream, state);
    if (typeof style !== 'undefined')
      return style;

    if (state.list) { // List marker (*, +, -, 1., etc)
      state.list = null;
      return getType(state);
    }

    if (state.taskList) {
      var taskCharacter = stream.match(taskListRE, true)[1];

      if      (taskCharacter === ' ') { state.taskOpen   = true; }
      else if (taskCharacter === 'x') { state.taskClosed = 'closed'; }
      else                            { state.taskClosed = taskCharacter; }

      state.taskList = false;
      return getType(state);
    }

    state.taskOpen = false;
    state.taskClosed = false;

    var ch = stream.next();

    if (ch === '\\') {
      stream.next();
      return getType(state);
    }

    // Matches link titles present on next line
    /*
    if (state.linkTitle) {
      state.linkTitle = false;
      var matchCh = ch;
      if (ch === '(') {
        matchCh = ')';
      }
      matchCh = (matchCh+'').replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1");
      var regex = '^\\s*(?:[^' + matchCh + '\\\\]+|\\\\\\\\|\\\\.)' + matchCh;
      if (stream.match(new RegExp(regex), true)) {
        return linkhref;
      }
    }
    */

    // If this block is changed, it may need to be updated in GFM mode
    if (ch === '`') {
      var before = stream.pos;
      stream.eatWhile('`');
      var difference = 1 + stream.pos - before;

      if (!state.codeInline) {
        codeDepth = difference;
        state.codeInline = true;
        state.specialCharacter = true;
        return getType(state);
      }
      else if (difference === codeDepth) { // Must be exact
        state.specialCharacter = true;
        var t = getType(state);
        state.codeInline = false;
        state.specialCharacter = false;
        return t;
      }
      else {
        state.specialCharacter = false;
        return getType(state);
      }
    }
    else if (state.codeInline) {
      state.specialCharacter = false;
      return getType(state);
    }

    if (ch === '!' && stream.match(/\[[^\]]*\] ?(?:\(|\[)/, false)) {
      state.specialCharacter = true;
      state.image = true;
      stream.eat('[');
      return getType(state);
    }

    if (ch === ']' && state.image) {
      state.specialCharacter = true;
      var type = getType(state);
      state.specialCharacter = false;
      state.image = false;
      state.inline = state.f = linkHref;
      return type;
    }

    if (ch === '[' && stream.match(/.*\](\(| ?\[)/, false)) {
      state.specialCharacter = true;
      state.linkText = true;
      return getType(state);
    }

    if (ch === ']' && state.linkText) {
      state.specialCharacter = true;
      var type = getType(state);
      state.specialCharacter = false;
      state.linkText = false;
      state.inline = state.f = linkHref;
      return type;
    }

    if (ch === '<' && stream.match(/^(https?|ftps?):\/\/(?:[^\\>]|\\.)+>/, false)) {
      return switchInline(stream, state, inlineElement(linkinline, '>'));
    }

    if (ch === '<' && stream.match(/^[^> \\]+@(?:[^\\>]|\\.)+>/, false)) {
      return switchInline(stream, state, inlineElement(linkemail, '>'));
    }

    if (ch === '<' && stream.match(/^\w/, false)) {
      if (stream.string.indexOf(">")!=-1) {
        var atts = stream.string.substring(1,stream.string.indexOf(">"));
        if (/markdown\s*=\s*('|"){0,1}1('|"){0,1}/.test(atts)) {
          state.md_inside = true;
        }
      }
      stream.backUp(1);
      return switchBlock(stream, state, htmlBlock);
    }

    if (ch === '<' && stream.match(/^\/\w*?>/, true)) {
      state.md_inside = false;
      return "tag";
    }

    var ignoreUnderscore = false;
    if (!modeCfg.underscoresBreakWords) {
      if (ch === '_' && stream.peek() !== '_' && stream.match(/(\w)/, false)) {
        var prevPos = stream.pos - 2;
        if (prevPos >= 0) {
          var prevCh = stream.string.charAt(prevPos);
          if (prevCh !== '_' && prevCh.match(/(\w)/, false)) {
            ignoreUnderscore = true;
          }
        }
      }
    }

    if (ch == '~') {
      state.specialCharacter = true;
      var t = getType(state);

      if (!state.strikeThrough && stream.eat('~')) { // Add strikethrough
        state.strikeThrough = true;
        return getType(state);
      }
      if (state.strikeThrough && stream.eat('~')) { // Remove strikethrough
        state.strikeThrough = false;
        return t;
      }
    }

    if (ch === '*' || (ch === '_' && !ignoreUnderscore)) {
      stream.backUp(1);

      state.specialCharacter = true;
      var t = getType(state);

      var regex        = (ch === '*') ? /^(\*+)/ : /^(_+)/;
      var match        = stream.match(regex, true);
      var formatTokens = match[1].match(/.{1,2}/g);
      var stackLength  = state.formatStack.length;
      var oldStrong    = state.strong;
      var oldEm        = state.em;
      var last         = formatTokens[formatTokens.length -1];
      var formatToken, lastToken, chosen;

      /*
      // Debugging.
      var stateSnapshot = state.formatStack.slice(0);
      var tokenSnapshot = formatTokens.slice(0);
      */

      /**
       * Solves the problem where ***bold italic*** refuses
       * to be parsed.
       *
       * We never know if we're looking at opening or closing
       * characters, so '***' gets added to the stack as ['**', '*']
       * even if it should be removing characters instead. ***text*** results
       * in a stack of ['**', '*', '**', '*'], when it really should be
       * empty.
       */
      if (last === '*' || last === '_') {
        if (last === state.formatStack[stackLength - 1]) {
          formatTokens.pop();
          state.formatStack.pop();
          stackLength--;
        }
      }

      /**
       * Operate this like a stack. Pushing an em-triggering character
       * will set state.em to true, and pushing another on top of it will
       * pop the last one and set it to false. Strong-triggering characters
       * are likewise.
       *
       * In other words, push characters until the new character and the
       * last character on the stack are the same, in which case pop off the last
       * character. Continue and set state appropriately until finished.
       *
       * Uncomment the debugging lines and you'll understand how it works.
       */
      for (var i = 0; i < formatTokens.length; i++) {
        formatToken = formatTokens[i];
        lastToken = state.formatStack[stackLength - 1];

        if (formatToken === lastToken) {
          state.formatStack.pop();
          stackLength--;
        }
        else {
          stackLength = state.formatStack.push(formatToken);
        }
      }

      state.strong = state.formatStack.indexOf('**') > -1 ||
                     state.formatStack.indexOf('__') > -1;

      state.em = state.formatStack.indexOf('*') > -1 ||
                 state.formatStack.indexOf('_') > -1;

      /**
       * Please don't change this. I already had to sacrifice my
       * firstborn to get it right once.
       *
       * getType(state) return table:
       *
       *    ARGS   |   strong === 1  | strong === 0
       * ----------|-----------------|-------------
       *  em === 1 | strong emphasis | emphasis
       *  em === 0 | strong          | null
       *
       * t will always equal the last return value of getType().
       *
       * if (oldStrong && oldEm) { choose t;         }
       * else if (strong && em)  { choose getType(); }
       * else                    { choose non-null;  }
       */

      // Take advantage of typecasting.
      var oldCount = oldStrong + oldEm;
      var newCount = state.strong + state.em;

      // This is slightly obfuscated, but if you uncomment
      // the debug lines and look at the console log, you'll understand.
      chosen = newCount > oldCount ? getType(state) : t;
      
      /*
      // Debugging.
      console.log('-----------');
      console.log('stack:   ', stateSnapshot, '+', tokenSnapshot, '=', state.formatStack);
      console.log('state:   ', '(' + oldStrong + ' ' + oldEm + ') => (' + state.strong + ' ' + state.em + ')');
      console.log('choices: ', '(' + getType(state) + ' or ' + t + ') => ' + chosen);
      */

      return chosen;
    }

    if (ch === ' ') {
      if (stream.match(/ +$/, false)) {
        state.trailingSpace++;
      }
      else if (state.trailingSpace) {
        state.trailingSpaceNewLine = true;
      }
    }

    return getType(state);
  }

  function linkHref(stream, state) {
    // Check if space, and return NULL if so (to avoid marking the space)
    if(stream.eatSpace()){
      return null;
    }
    var ch = stream.next();
    if (ch === '(' || ch === '[') {
      return switchInline(stream, state, inlineElement(linkhref, ch === '(' ? ')' : ']'));
    }
    return 'error';
  }

  function footnoteLink(stream, state) {
    if (stream.eat('[')) {
      state.linkText = true;
      state.specialCharacter = true;
      return getType(state);
    }
    else if (stream.match(']:', true)) {
      state.specialCharacter = true;
      var type = getType(state);
      state.specialCharacter = false;
      state.linkText = false;
      state.f = footnoteUrl;
      return type;
    }
    else if (stream.match(/^[^\]]*\]:/, true)) {
      stream.backUp(2);
      state.specialCharacter = false;
      return getType(state);
    }

    return switchInline(stream, state, inlineNormal);
  }

  function footnoteUrl(stream, state) {

    // [hello]: www.google.com "title"

    // Check if space, and return NULL if so (to avoid marking the space)
    if (stream.eatSpace()) {
      return null;
    }

    // Match URL
    if (!state.linkHref && stream.match(/^[^\s]+/, true)) {
      state.linkHref = true;
      var type = getType(state);

      if (!stream.peek()) {
        state.linkHref = false;
        state.f = state.inline = inlineNormal;
      }

      return type;
    }

    // Match link title
    if (!state.linkTitle && stream.match(/^(?:(?:"(?:[^"\\]|\\\\|\\.)+"|'(?:[^'\\]|\\\\|\\.)+'|\((?:[^)\\]|\\\\|\\.)+\)))?/, true)) {
      state.linkTitle = true;
      state.linkHref = false;

      var type = getType(state);

      if (!stream.peek()) {
        state.linkTitle = false;
        state.f = state.inline = inlineNormal;
      } else {
        state.linkHref = true;
      }

      return type;
    }

    state.linkHref = false;
    state.linkTitle = false;

    state.f = state.inline = inlineNormal;
    return getType(state);

/*
    // Check for link title
    if (stream.peek() === undefined) { // End of line, set flag to check next line
      state.linkTitle = true;
    }
    else { // More content on line, check if link title
      stream.match(/^(?:\s+(?:"(?:[^"\\]|\\\\|\\.)+"|'(?:[^'\\]|\\\\|\\.)+'|\((?:[^)\\]|\\\\|\\.)+\)))?/, true);
    }
    */
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

  function inlineElement(type, endChar, next) {
    next = next || inlineNormal;
    return function(stream, state) {
      stream.match(inlineRE(endChar), true);
      state.inline = state.f = next;
      return type;
    };
  }

  return {
    startState: function() {
      return {
        f: blockNormal,

        prevLineHasContent: false,
        thisLineHasContent: false,

        block: blockNormal,
        htmlState: CodeMirror.startState(htmlMode),
        indentation: 0,

        inline: inlineNormal,
        text: handleText,

        linkText: false,
        linkHref: false,
        linkTitle: false,
        em: false,
        strong: false,
        formatStack: [],
        strikeThrough: false,
        specialCharacter: false,
        header: false,
        headerUnderline: false,
        taskList: false,
        list: false,
        listDepth: 0,
        image: false,
        quote: 0,
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
        htmlState: CodeMirror.copyState(htmlMode, s.htmlState),
        indentation: s.indentation,

        localMode: s.localMode,
        localState: s.localMode ? CodeMirror.copyState(s.localMode, s.localState) : null,

        inline: s.inline,
        text: s.text,
        linkHref: s.linkHref,
        linkTitle: s.linkTitle,
        em: s.em,
        strong: s.strong,
        formatStack: s.formatStack.slice(0),
        strikeThrough: s.strikeThrough,
        specialCharacter: s.specialCharacter,
        header: s.header,
        headerUnderline: s.headerUnderline,
        taskList: s.taskList,
        list: s.list,
        listDepth: s.listDepth,
        image: s.image,
        quote: s.quote,
        trailingSpace: s.trailingSpace,
        trailingSpaceNewLine: s.trailingSpaceNewLine,
        md_inside: s.md_inside
      };
    },

    token: function(stream, state) {
      if (stream.sol()) {
        if (stream.match(/^\s*$/, true)) {
          state.prevLineHasContent = false;
          return blankLine(state);
        }
        else {
          state.prevLineHasContent = state.thisLineHasContent;
          state.thisLineHasContent = true;
        }

        // Reset state.header
        state.header = false;

        // Reset state.headerUnderline
        state.headerUnderline = false;

        // Reset state.taskList
        state.taskList = false;

        // Reset state.code
        state.code = false;

        // Reset state.codeInline
        state.codeInline = false;

        // Reset state.trailingSpace
        state.trailingSpace = 0;
        state.trailingSpaceNewLine = false;

        state.f = state.block;
        var indentation = stream.match(/^\s*/, true)[0].replace(/\t/g, '    ').length;
        var difference = Math.floor((indentation - state.indentation) / 4) * 4;
        if (difference > 4) difference = 4;
        var adjustedIndentation = state.indentation + difference;
        state.indentationDiff = adjustedIndentation - state.indentation;
        state.indentation = adjustedIndentation;
        if (indentation > 0) return null;
      }
      return state.f(stream, state);
    },

    blankLine: blankLine,

    getType: getType
  };

}, "xml");

CodeMirror.defineMIME("text/x-markdown", "markdown");

