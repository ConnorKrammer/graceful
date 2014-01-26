/**
 * This file will be parsed automatically by Graceful, assuming the extension has
 * been added to user.config.js.
 *
 * Oh, and feel free to use your own names for your files. Just try to have
 * unique filenames -- ie. don't have three 'main.js' files. It makes debugging easier.
 */

'use strict';

// Load paths are relative the extension directory. Don't prefix them with slashes.
graceful.loader.loadExtension({
  desktop: [
    'user/extension-boilerplate/desktop/boilerplate-desktop.js',
    'user/extension-boilerplate/desktop/boilerplate-desktop.css'
  ],
  webapp: [
    'user/extension-boilerplate/webapp/boilerplate-webapp.js'
  ],
  shared: [
    'user/extension-boilerplate/shared/boilerplate-shared.css'
  ]
});
