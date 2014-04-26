/**
 * graceful-command_manager
 *
 * Acts as a global event handler for the graceful application.
 *
 * Based in small part upon the Brackets command manager:
 *   https://github.com/adobe/brackets/blob/master/src/command/CommandManager.js
 */


!function(global) {
  'use strict';

  /**
   * Matches command template arguments.
   *
   *   {             - match the starting brace
   *   (?:\.\.\.)?   - optionally match three periods
   *   \w+           - match one or more word characters
   *   \??           - optionally match a question mark
   *   (?::[\w<>]+)? - optionally match a colon followed by one or
   *                   more word characters
   *   }             - match the ending brace
   *
   * Try it out on RegExr here: http://regexr.com/38o1i
   * If changed, make sure to update the above.
   */
  var templateArgumentRegex = /{(?:\.\.\.)?\w+\??(?::[\w<>]+)?}/g;

  /**
   * Used for building template regexes. It holds a
   * number of regex building blocks (as strings) that
   * when used to form a regex will match for a given
   * type. These regexes are mainly significant in
   * buildTemplateMatcher().
   *
   * Note that because these are strings that will be used to build
   * regexes later, wherever you want a backslash in the actual regex
   * you need to put a double backslash in the string ('\\' instead of '\')
   * or the created regex won't be what you intended.
   */
  var regexTable = {
    number: '[\\d.]+?',
    string: '".+?"|\'.+?\'|[^\'"]+?',
    boolean: '[\\w]+?' // Matches single words - boolean type is enforced at typecast.
  };

  /**
   * Okay, this is a bit of a monster:
   *
   *  \[                - match the opening square bracket
   *  \s*?              - match leading whitespace
   *  (?:               - start a new, non-capturing group:
   *    (?:             - start another group within the outer one:
   *      (?:".+?"|'.+?'|[^'"\[\],\s]+?) - match any string for AT LEAST one character
   *      |             - OR
   *      (?:[\d.]+?)   - match any digit for AT LEAST one character
   *      (?:, ?)       - match a comma followed by an optional space
   *    )               - close the inner group
   *  )                 - close the outer group
   *  *?                - match the previous nonsense 0 or more times, as few times as possible
   *  (?:               - start a new, non-capturing group:
   *    (?:".+"|'.+'|[^'"\[\],\s]+) - match any string for AT LEAST one character
   *    |               - OR
   *    (?:[\d.]+)      - match any digit for AT LEAST one character
   *  )                 - close the group
   *  \s*               - match any trailing whitespace (but not any trailing commas!)
   *  \]                - match the closing square bracket
   *
   * NOTE: Nested arrays are disallowed.
   *
   * Try it out on RegExr here: http://www.regexr.com/38o10
   * If changed, make sure to update the above link and explanation.
   */
  regexTable.array = '\\[\\s*(?:(?:(?:".+?"|\'.+?\'|[^\'"\\[\\],\\s]+?)|(?:[\\d.]+?))(?:\\s*,\\s*))*?(?:(?:".+"|\'.+\'|[^\'"\\[\\],\\s]+)|(?:[\\d.]+))\\s*\\]';

  /**
   * The next two are similar to the above, but only allow a single type
   * inside the array.
   */
  regexTable['array<string>'] = '\\[\\s*(?:(?:".+?"|\'.+?\'|[^\'"\\[\\],\\s]+?)(?:\\s*,\\s*))*?(?:".+"|\'.+\'|[^\'"\\[\\],\\s]+)\\s*\\]';
  regexTable['array<number>'] = '\\[\\s*(?:(?:[\\d.]+?)(?:\\s*,\\s*))*?(?:[\\d.]+)\\s*\\]';

  /**
   * Escapes special characters for a regex.
   * Source: http://stackoverflow.com/a/2593661
   *
   * @param {String} string - The string to escape.
   * @return {String} The escaped string.
   */
  function escapeRegex(string) {
      return (string + '').replace(/([.?*+^$[\]\\\/(){}|-])/g, "\\$1");
  };

  /**
   * Parses the input string and returns it typecast to the
   * specified type.
   *
   * @param {String} input - The input string.
   * @param {String} type - The type to cast the input to.
   * @return {*} The newly cast value, or null on failure.
   */
  function typecast(input, type) {
    if (typeof input === 'undefined') return;

    if (type === 'number') {
      return parseFloat(input);
    }
    else if (type === 'string') {
      return /^'.*?'|".*?"$/.test(input) ? input.slice(1, -1) : input;
    }
    else if (type === 'boolean') {
      input = input.toLowerCase();

      if (/^true|yes|y$/.test(input)) {
        return true;
      }
      else if (/^false|no|n$/.test(input)) {
        return false;
      }
      else {
        return null;
      }
    }
    else if (type === 'array') {
      input = input.slice(1, -1)
        .split(',')
        .map(function(a) {
          a = a.trim();

          // Detect the type as best as possible.
          return typecast(a, 'number') || typecast(a, 'string');
        });

      if (input.indexOf(null) !== -1) return null;
      return input;
    }
    else if (type === 'array<string>') {
      input = input.slice(1, -1)
        .split(',')
        .map(function(a) {
          a = a.trim();
          return typecast(a.trim(), 'string');
        });

      if (input.indexOf(null) !== -1) return null;
      return input;
    }
    else if (type === 'array<number>') {
      input = input.slice(1, -1)
        .split(',')
        .map(function(a) {
          a = a.trim();
          return typecast(a.trim(), 'number');
        });

      if (input.indexOf(null) !== -1) return null;
      return input;
    }
    else {
      return null;
    }
  }

  /**
   * Throws an error.
   *
   * Used by getFailCommand() to construct a Command object that
   * fails in a manner expected by CommandManager.runCommand().
   *
   * @param {String} message - The error message.
   */
  function throwError(message) {
    throw new Error(message);
  }

  /**
   * Creates a command that throws an error with the specified message.
   *
   * @param {String} commandName - The name of the command.
   * @param {String} message - The error message.
   * @return {Command} The constructed command.
   */
  function getFailCommand(commandName, message) {
    return {
      command: new Command({
        name: commandName,
        func: throwError.bind(null, message)
      }),
      args: []
    };
  }

  /* =======================================================
   *                       Command
   * ======================================================= */

  /**
   * The Command class.
   *
   * Responsible for defining application commands, to be
   * executed by the CommandManager.
   *
   * A template does not need to be supplied for the given command,
   * but is needed to allow it to be invoked via a string from the
   * command bar. The supplied argument count is optional, and is
   * only used to help verify that the argument information parsed out
   * of the command template is correct.
   *
   * @constructor
   * @param {Object}   config           - The configuration object.
   * @param {String}   config.name      - The command's name.
   * @param {Function} config.func      - The command's function.
   * @param {String}  [config.template] - The command's template.
   * @param {Integer} [config.argCount] - The max number of arguments passed to the commmand.
   * @param {Boolean} [config.isInternal=false] - If true, this command cannot be invoked by
   *                                              the user.
   */
  function Command(config) {
    this.name       = config.name;
    this.func       = config.func;
    this.template   = config.template   || '';
    this.argCount   = config.argCount   || -1;
    this.isInternal = config.isInternal || false;

    if (this.isInternal) return;

    var template = parseCommandTemplate(this);
    this.template = template ? buildTemplateRegex(template) : template;
  }

  /**
   * Executes the command's function.
   *
   * If the function does not return a result, a new
   * one is created that resolves immediately.
   *
   * @return {Q.Promise} A promise inidicating that the command
   *                     either succeeded or failed.
   */
  Command.prototype.execute = function() {
    var result = this.func.apply(this, arguments);

    // Just resolve instantly if nothing is returned.
    if (!result) {
      var deferred = Q.defer();
      deferred.resolve();
      return deferred.promise;
    }

    return result;
  };

  /**
   * Parses argument information out of the command's template.
   *
   * @param {Command} command - The command whose template to parse.
   * @return {Object} A { string, args, trailingDelimeter } object.
   */
  function parseCommandTemplate(command) {
    var template = command.template;
    var matches = template.match(templateArgumentRegex);
    var indices = [0];
    var start, end;

    // Set defaults for an empty template.
    if (template === '') {
      return {
        string: template,
        args: []
      };
    }

    // Abort if the template looks broken.
    if (matches === null) {
      console.warn('Invalid template for command "' + command.name + '". Please double-check the template.'
          + '\n' + 'If you meant don\'t want to take any arguments, leave the template undefined.'
          + '\n' + 'If you don\'t want the user to be able to call your command, set command.isInternal to true.');
      return null;
    }

    // Raise a warning if the detected argument count isn't what was expected.
    if (command.argCount !== -1 && matches.length !== command.argCount) {
      console.warn('Template for command "' + command.name + '" may be invalid: '
            + 'Number of detected arguments did not match suggested value. (detected '
            + matches.length + ', should be ' + command.argCount + ')');
    }

    // Get the boundaries of each match.
    matches.forEach(function(match, index) {
      start = template.indexOf(match);

      // If the start of this match is the same as the end of
      // the last one, something's up.
      if (start === end) {
        console.warn('Invalid template for command "' + command.name
          + '": No delimeter given between arguments #' + index + ' and #' + (index + 1) + '.');
      }

      end = start + match.length;
      indices.push(start, end);
    });

    // Push the last index and remove duplicates.
    indices.push(template.length);
    indices = _.unique(indices, true);

    var segments = [];
    var prevIndex = 0;

    // Slice up the template on the boundary indices.
    for (var i = 1; i < indices.length; i++) {
      var index = indices[i];
      segments.push(template.slice(prevIndex, index));
      prevIndex = index;
    }

    var args = [];
    var delimeter = '';
    var hasOptional = false;
    var requiredArgs = 0;
    var segment, argCount, inner, name, type, optional,
      rest, trailingDelimeter;

    // Get information about the given argument.
    for (var n = 0; n < segments.length; n++) {
      segment = segments[n];
      argCount = matches.indexOf(segment);

      if (argCount !== -1) {
        inner = segment.slice(1, -1).split(':');
        name  = inner[0];
        type  = inner[1] || 'string';
        rest  = false;

        // Check if the type exists.
        if (!regexTable[type]) {
          console.warn('Invalid template for command "' + command.name + '": Argument #'
            + (argCount + 1) + ' is of unknown type "' + type + '". Defaulting to "string".');
        }

        // Check if the argument is optional.
        if (name[name.length - 1] === '?') {
          optional = true;
          name = name.slice(0, -1);
          hasOptional = true;
        } else {
          optional = false;
          requiredArgs++;

          if (hasOptional) {
            console.warn('Invalid template for command "' + command.name + '": Argument order has non-optional'
              + ' arguments after optional arguments. All optional args must come at the end of the template.');
          }
        }

        // Check if the argument is a rest argument, i.e. can expand
        // to include unlimited arguments. Raises a warning if it's a
        // rest argument but isn't the last arg in the template.
        if (name.slice(0, 3) === '...') {
          if (argCount === matches.length - 1) {
            rest = true;
            name = name.slice(3);
            delimeter = delimeter || ' ';
          } else {
            console.warn('Invalid template for command "' + command.name + '": Argument #' + (argCount + 1)
              + ' is a rest argument, but is not the last arg in the template.');
          }
        }

        // Put all the argument information into an object and
        // add it to the argument array.
        args.push({
          name: name,
          type: type,
          delimeter: delimeter,
          optional: optional,
          rest: rest
        });
      }
      else if (matches.length === args.length) {
        // It's the last segment, so add it as a trailing piece.
        trailingDelimeter = segment;
      }
      else {
        // It's a delimeter, not an argument, so keep track of that.
        delimeter = segment;

        // If the delimeter is overly long, raise a warning. A broken template
        // can go through parsing without raising errors, and the only sign is that
        // huge portions of it are being treated as part of a delimeter.
        if (delimeter.length > 4) {
          console.warn('Template for command "' + command.name + '" may be invalid: '
            + 'Parsing resulted in delimeters between arguments greater than two characters in length.');
        }
      }
    }

    // Return the gathered information.
    return {
      string: template,
      args: args,
      requiredArgs: requiredArgs,
      trailingDelimeter: trailingDelimeter
    };
  }

  /**
   * Extends a command's template to include a regex that matches
   * valid input to the template.
   *
   * @param {Object} template - The template to build the regex for.
   * @return {Object} The extended command template.
   */
  function buildTemplateRegex(template) {
    var regex = '^';
    var arg, restRegex, restDelimeter;

    // Create the regex incrementally, adding each piece
    // based on the individual template arguments.
    for (var i = 0; i < template.args.length; i++ ) {
      arg = template.args[i];

      // The capture group is slightly different for
      // a rest argument.
      if (arg.rest) {
        regex += '(';
      }

      // Start the match with the argument delimeter.
      regex += '(?:' + escapeRegex(arg.delimeter);

      // If the only argument is a rest argument, make the delimeter
      // optional for the regex.
      if (arg.rest && i === 0) regex += '?';

      // Start a new capture group. Notice that it's slightly
      // different for rest arguments.
      regex += arg.rest ? '(?:' : '(';

      // Append the next segment based on argument type.
      regex += regexTable[arg.type] || regexTable['string'];

      // If we're building a rest argument, create a regex
      // that will match its components of later use.
      if (arg.rest) {
        restRegex = '((?:(?:';
        restRegex += regexTable[arg.type] || regexTable['string'];
        restRegex += '))+?)';
        restRegex += escapeRegex(arg.delimeter);

        // Remember which delimeter was used.
        restDelimeter = arg.delimeter;
      }

      // Close the capture groups.
      regex += '))';

      // Based on whether or not the argument was optional and/or
      // a rest argument, close any leftover capture groups and
      // make the match optional.
      if      (arg.rest && !arg.optional) regex += '+?)';
      else if (arg.rest && arg.optional)  regex += '*?)';
      else if (arg.optional)              regex += '?';
    }

    // Add a match for the trailing delimeter.
    if (template.trailingDelimeter) {
      regex += '(?:' + escapeRegex(template.trailingDelimeter) + ')';
      if (arg.optional) regex += '?'; /* TODO: get rid of this? */
    }

    // Make the match run until the end of the string.
    regex += '$';

    // Extend the template.
    template.regex         = new RegExp(regex);
    template.restRegex     = restRegex ? new RegExp(restRegex, 'g') : null;
    template.restDelimeter = restDelimeter || null;

    return template;
  }

  /* =======================================================
   *                     Command Manager
   * ======================================================= */

  /**
   * The CommandManager.
   *
   * Responsible for handling all application-level
   * commands.
   */
  var CommandManager = Observable.mixin({
    commands: {},
    history: []
  });

  /**
   * Defines a new command.
   *
   * @param {Object}   config           - The configuration object.
   * @param {String}   config.name      - The command's name.
   * @param {Function} config.func      - The command's function.
   * @param {String}  [config.template] - The command's template.
   * @param {Integer} [config.argCount] - The max number of arguments passed to the commmand.
   * @return {Boolean} True if the command was added successfully, else false.
   */
  CommandManager.defineCommand = function(config) {
    if (!config || !config.name) {
      console.warn('Cannot define a command without a valid name');
      return false;
    } else {
      config.name = config.name.trim().toLowerCase();
    }

    if (!config.func) {
      console.warn('Cannot define command "' + config.name + '" without a valid function');
      return false;
    }

    if (this.commands[config.name]) {
      console.warn('Cannot define command "' + config.name +
                  '". A command with that name has already been defined');
      return false;
    }

    if (typeof config.template === 'string') {
      config.template = config.template.trim().toLowerCase();
    }

    this.commands[config.name] = new Command(config);

    return true;
  };

  /**
   * Parses a command and its arguments out of a supplied string.
   *
   * Will return a special failure command if the string cannot be
   * parsed.
   *
   * @param {String} string - The string to parse.
   * @return {Object} A { command, args } hash.
   */
  CommandManager.parseCommand = function(string) {
    if (typeof string !== 'string') return false;

    // Extract the name of the command and look it up in the command hash.
    var segments = string.trim().split(' ');
    var name = segments[0].trim().toLowerCase();
    var command = this.commands[name];

    // We can't do anything without a command.
    if (!command) {
      var message = 'Error: Command not recognized';
      return getFailCommand(name, message);
    }

    // Get the arguments passed to the command, and the command template.
    var argString = segments.slice(1).join(' ').trim();
    var template = command.template;
    var args = [];

    // This command can't be called as a string.
    if (command.isInternal) {
      var message = 'Command cannot be called as a string';
      return getFailCommand(name, message);
    }

    // Check if all arguments are missing when some are required.
    if (!argString && template.requiredArgs) {
      var message = 'Command invoked with insufficient arguments: Supplied 0, need '
        + template.requiredArgs;
      return getFailCommand(name, message);
    }

    // Parse arguments out of the input if the command takes any.
    if (template.args.length) {
      // Match the arguments to the template.
      var matches = template.regex.exec(argString);

      // We can't do anything without a match.
      if (!matches) {
        var message = 'Command invoked with incorrect arguments: "' + argString + '"'
          + '\n' + 'Command arguments must match template: "' + template.string + '"';
        return getFailCommand(name, message);
      }

      // Get the individual matches.
      matches = matches.slice(1, matches.length);

      // Parse out rest args and bundle them into an array.
      if (template.restRegex) {
        var subMatches = [];
        var lastIndex = matches.length -1;

        // Append the delimeter. (Makes regex's job easier.)
        var last = matches[lastIndex] + template.restDelimeter;
        matches[lastIndex] = [];

        // Match until there aren't any arguments left.
        while ((subMatches = template.restRegex.exec(last)) !== null) {
          if (subMatches[1] === '') continue;
          matches[lastIndex].push(subMatches[1]);
        }
      }

      // Cast each argument to the correct type.
      matches.forEach(function(match, index) {
        var arg = template.args[index];

        // If it's an array (from a rest variable), typecast each item.
        if (match instanceof Array) {
          match = match.map(function(a) {
            return typecast(a, arg.type);
          });

          if (match.indexOf(null) !== -1) {
            var message = 'Command invoked with incorrect arguments: "' + argString + '"'
              + '\n' + 'Command arguments must match template: "' + template.string + '"';
            return getFailCommand(name, message);
          }
        } else {
          match = typecast(match, arg.type);

          if (match === null) {
            var message = 'Command invoked with incorrect arguments: "' + argString + '"'
              + '\n' + 'Command arguments must match template: "' + template.string + '"';
            return getFailCommand(name, message);
          }
        }

        args.push(match);
      });
    }

    // Return the results.
    return { command: command, args: args };
  };

  /**
   * Runs the specified command or array of commands. Commands can
   * be passed in either string form, to be parsed, or as an array,
   * with the first element specifying the name of the command and the
   * following elements the arguments to pass.
   *
   * Each command will not execute until the one before it has returned
   * a resolved promise, and the chain will wait until the promise argument,
   * if present, has resolved. The return value will be for the resolution
   * of the entire chain of commands.
   *
   * Note that if one of the commands fail, any following commands will be
   * skipped. If there is a problem parsing one of the commands, none of them
   * will execute. This is for safety, so that commands relying upon their
   * predecessor's completion don't run and potentially break something.
   *
   * @param {Array[]|String[]} commands - The commands to execute.
   * @param {Q.Promise} [promise] - An optional promise to wait for before beginning.
   * @return {Q.Promise} A promise for the commands' completion.
   */
  CommandManager.runCommand = function(commands, promise) {
    commands = [].concat(commands);
    promise = promise || Q();

    var _this = this;
    var failHard = false;
    var copy = [];
    var historyItem = { time: new Date(), count: commands.length };

    // Track the commands.
    this.history.push(historyItem);

    // Convert all items into { command, args } hashes.
    commands.forEach(function(item) {
      if (typeof item === 'string') {
        item = item.split('\n')
          .filter(function(string) {
            return string.trim().length > 0;
          })
          .map(_this.parseCommand, _this);
      }
      else if (item instanceof Array) {
        item = {
          command: this.commands[item[0]],
          args: item.slice(1)
        };
      }

      copy = copy.concat(item);
    });

    // Restore the commands.
    commands = copy;

    /**
     * Records the reason for a command's failure and sets
     * the failHard flag to true.
     */
    function handleError(command, index, error) {
      // Record the reason for the command failure.
      if (command.func.name === 'throwError') {
        historyItem[index].status = 'Unrecognized';
      }
      else if (failHard) {
        historyItem[index].status = 'Skipped';
      }
      else {
        historyItem[index].status = 'Failed: ' + error.message;
      }

      // If the command was unrecognized or failed outright, log it.
      if (!failHard) {
        error.message = error.message.split('\n').map(function(string) {
          return string = '\t' + string;
        }).join('\n');

        console.error("Editor command '" + command.name
          + "' failed with error:\n" + error.message);
      }

      // Skip remaining commands.
      failHard = true;
    }

    // Chain the command promises together.
    promise = commands.reduce(function(promise, hash, index) {

      // Bind the command context to the error handler.
      var errorHandler = handleError.bind(null, hash.command, index);

      return Q.when(promise, function() {
        var command = hash.command;
        var args = hash.args;

        // Build a history item to track the command.
        historyItem[index] = {
          name: command.name,
          args: args,
          status: 'Pending'
        };

        // There was an error: skip remaining commands.
        if (failHard) throw new Error();

        // Notify listeners we're about to execute a command.
        _this.trigger('beforeExecuteCommand', command.name);

        // Execute the command.
        return command.execute.apply(command, args);
      })
      .then(function() {
        historyItem[index].status = 'Succeeded';
      })
      .fail(errorHandler);
    }, promise);

    return promise;
  };

/* =======================================================
 *                        Exports
 * ======================================================= */

  global.CommandManager = CommandManager;
}(this);

