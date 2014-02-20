'use strict';

/**
 * This file **must** be named load.js and reside in the root directory
 * of your extension's file structure!
 *
 * Note that files are loaded asynchronously and will run in the order
 * listed. After all files have finished loading the passed callback will fire.
 */
graceful.loader.loadExtension([
  'user/extension_boilerplate/boilerplate.js',
  'user/extension_boilerplate/boilerplate.css'
]);

