'use strict';

graceful.loader.loadExtension({
  shared: 'core/filesystem/shared/filesystem-shared.js',
  desktop: 'core/filesystem/desktop/filesystem-desktop.js',
  webapp: 'core/filesystem/webapp/filesystem-webapp.js'
});
