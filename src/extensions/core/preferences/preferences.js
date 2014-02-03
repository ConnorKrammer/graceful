/**
 * graceful-preferences
 *
 * Defines the Preferences global object, responsible for managing
 * application preferences.
 */


!function(global) {
  'use strict';

  // Define the Preferences namespace.
  function Preferences() {}

  // Preference storage objects.
  var prefs;
  var userPrefs;

  /**
   * Loads saved preferences from file.
   *
   * @return {Promise} A promise that the preferences have loaded.
   */
  Preferences.load = function() {
    return FileSystem.fileExists(graceful.preferenceFile)
      .then(function(doesExist) {
        if (!doesExist) {
          console.log("preferences.json not found. New file created.");
          return FileSystem.writeFile(graceful.preferenceFile, '');
        }
      })
      .then(function() {
        return FileSystem.readFile(graceful.preferenceFile);
      })
      .then(function(contents) {
        prefs = contents ? JSON.parse(contents) : {};
      })
      .then(function() {
        return FileSystem.fileExists(graceful.userPreferenceFile)
      })
      .then(function(doesExist) {
        if (doesExist) return FileSystem.readFile(graceful.userPreferenceFile);
      })
      .then(function(contents) {
        userPrefs = contents ? JSON.parse(contents) : {};
      })
      .fail(function(error) {
        Utils.printFormattedError('Preferences failed to load with error:', error);
      });
  };
  
  /**
   * Sets the given preference, creating it from scratch if needed.
   *
   * Conditions:
   * Key..............Preference set using key.
   * Key and subkey...Preference set using subkey.
   * Neither..........Does nothing.
   *
   * Example of key: "User.Editor.FontSize"
   *
   * @param {String|String[]} [key] - The main preference key, with
   *        subkeys denoted using '.' object notation. If an array is
   *        passed, the same value will be set on all keys.
   * @param {*} data - The data to set.
   */
  Preferences.set = function(key, data) {
    var pref, last;

    // Do nothing if the key is empty.
    if (!key) return;

    // Set the value on all passed keys.
    _.forEach([].concat(key), function() {
      // Split the key into subkeys.
      key  = key.split('.');
      last = key.pop();

      // Find the correct pref to set, creating intermediate prefs.
      pref = _.reduce(key, function(accumulator, subkey) {
        if (typeof accumulator[subkey] !== 'object') {
          accumulator[subkey] = {};
        }

        return accumulator[subkey];
      }, prefs);

      // Set the preference.
      pref[last] = data;
    });

    // Save preferences.
    FileSystem.writeFile(graceful.preferenceFile, JSON.stringify(prefs, null, 4));
  };

  /**
   * Returns the value of the given preference.
   * User preferences override application preferences.
   *
   * Conditions:
   * Key..............Preference fetched from key.
   * Key and subkey...Preference fetched from subkey.
   * Neither..........Entire preference object fetched.
   *
   * Example of key: "User.Editor.FontSize"
   *
   * @param {String} [key] - The main preference key, with
   *        subkeys denoted using '.' object notation.
   * @param {Boolean} [ignoreUser=false] - Whether to ignore
   *        user-set preferences when fetching the value.
   * @return {*} The data set on the key combination, or
   *         undefined if an invalid key is used.
   */
  Preferences.get = function(key, ignoreUser) {
    var userValue, appValue;

    // Set defaults.
    ignoreUser = ignoreUser || false;

    // Return the full object if the key is empty.
    if (!key) return ignoreUser ? prefs : _.merge(prefs, userPrefs);

    // Get the user preference.
    if (!ignoreUser) userValue = reducePreference(key, userPrefs);

    // Get the application preference.
    appValue = reducePreference(key, prefs);

    // Return the preference.
    return userValue || appValue;
  };

  /**
   * Helper function that fetches a property off of an
   * object based on the passed key. If the key is invalid
   * (ie. doesn't point to a property) then undefined will
   * be returned.
   *
   * @param {String} key - The main preference key, with
   *        subkeys denoted using '.' object notation.
   * @param {Object} object - The object to reduce.
   * @return {*} The data set on the key combination, or
   *         undefined if an invalid key is used.
   */
  function reducePreference(key, object) {
    // Split the key into subkeys.
    key = key.split('.');

    // Get the preference.
    return _.reduce(key, function(accumulator, subkey) {
      return (typeof accumulator !== 'undefined')
      ? accumulator[subkey]
      : accumulator;
    }, object);
  }

  // Expose globals.
  global.Preferences = Preferences;
}(this);