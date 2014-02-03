'use strict';

graceful.loader.loadExtension('core/preferences/preferences.js', function() {
  return Preferences.load();
});
