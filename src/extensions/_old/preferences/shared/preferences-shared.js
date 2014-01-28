/**
 * graceful-preferences
 *
 * Adds the Preferences object to the global namespace. This is used to get and set
 * application and extension preferences (basically interfacing with the Storage extension)
 * in a cloud-enabled manner.
 *
 * Note the use of the javascript promise library, q, for asynchronous code.
 * See here (https://github.com/kriskowal/q) for more on understanding async promises.
 */


!function(global) {
  'use strict';

  function Preferences() {}

  /**
   * Sets a preference.
   *
   * If the preference is not being created for the first
   * time, the preference argument should originate from a
   * call to Preferences.get(). This is because CouchDB needs
   * a _rev property set on the object so that it knows how to
   * handle conflicts. Preferences.get() handles this automatically.
   *
   * Alternatively, you can pay attention to the rev and id properties
   * sent back in the operation response and use those.
   *
   * If the preference arg has an _id property, then the id attribute is ignored.
   *
   * @param {object} preference A preference object to store.
   * @param {string} id The _id parameter to store on the preference.
   * @return {promise} A promise returning the operation response.
   */
  Preferences.set = function(preference, id) {
    preference._id = preference._id || id;
    
    return Storage.getDatabase('preferences')
      .then(function(database) {
        var deferred = Q.defer();

        if (!preference._id) {
          deferred.reject(new Error("Preference requires an _id property."));
          return deferred.promise;
        }

        database.put(preference, function(error, response) {
          if (error) {
            deferred.reject(error);
          } else {
            deferred.resolve(response);
          }
        });

        return deferred.promise;
      });
  };

  /**
   * Sets a preference.
   *
   * This will return the preference with the specified ID.
   * It will possess a _rev property, which is needed when the
   * preference is passed back to Preferences.set() with any changes.
   *
   * @param {string} id The ID fo the preference to get.
   * @return {promise} A promise for the preference object.
   */
  Preferences.get = function(id) {
    return Storage.getDatabase('preferences')
      .then(function(database) {
        var deferred = Q.defer();

        if (!id) {
          deferred.reject(new Error("Could not fetch preference. An ID is required."));
          return deferred.promise;
        }

        database.get(id, function(error, preference) {
          if (error) {
            deferred.reject(error);
          } else {
            deferred.resolve(preference);
          }
        });

        return deferred.promise;
      });
  };

  // Expose globals.
  global.Preferences = Preferences;
}(this);

