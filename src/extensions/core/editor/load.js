'use strict';

graceful.loader.loadExtension({
  shared: [
    'core/editor/shared/vendor/codemirror/codemirror.js',
    'core/editor/shared/vendor/codemirror/codemirror.css',
    'core/editor/shared/vendor/codemirror/addon/mode/overlay.js',
    'core/editor/shared/vendor/codemirror/addon/runmode/runmode.js',
    'core/editor/shared/vendor/codemirror/mode/xml/xml.js',
    'core/editor/shared/vendor/codemirror/mode/markdown/markdown.js',
    'core/editor/shared/vendor/codemirror/custom/markdown-lite.js',
    'core/editor/shared/vendor/highlight/highlight.pack.js',
    'core/editor/shared/vendor/highlight/styles/default.css',
    'core/editor/shared/vendor/marked/marked.js',
    'core/editor/shared/editor-shared.js',
    'core/editor/shared/editor-shared.css'
  ]
});
