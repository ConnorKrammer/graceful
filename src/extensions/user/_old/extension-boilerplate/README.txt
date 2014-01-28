# graceful-extension-boilerplate

*Add 'extension-boilerplate' to your user.config.js file to test the examples.*

This boilerplate is intended to make building Graceful extensions ridiculously easy. All you have to do is copy and drop it into the user extensions directory and you're good to go. Through this method, even someone unfamiliar to Javscript can make their own modifications to Graceful. And if someone wants to make it better, they can actually understand it.

This is in contrast to, you know, **vimscript**. \*Shudder\*

And if you think vimscript is a beautiful language, [read this](http://delvarworld.github.io/blog/2013/03/16/just-use-sublime-text/), you poor thing. (Not to say that Vim isn't great, but it has its drawbacks. The fifty year learning curve, for example.)

## Available libraries

This is a list of available 3rd party libraries for your extension to use as of Graceful 1.0.0. All libraries are guaranteed to be available by the time your extension is run.

Lo-Dash:    [Utility library](http://lodash.com/docs/)
jQuery:     [Html scripting](http://api.jquery.com/)
Keypress:   [Keypress handling](http://dmauro.github.io/Keypress/)
yepnope:    [File loading](http://yepnopejs.com/)
Foundation: [Front-end design framework](http://foundation.zurb.com/)

You can find a more up-to-date version of what's available by looking inside `scripts/load.js`.

## Folder structure

Here is an example layout for an extension. The folder structure is not set in stone, and can be changed, with one exception: The load.js file **must** be in the top-level directory.

```javascript
// Example extension folder structure.

extension/
|-- desktop/
|    |-- extension-desktop.css 
|    +-- extension-desktop.js  
|-- webapp/
|    |-- extension-webapp.css 
|    +-- extension-webapp.js  
|-- shared/ 
|    +-- extension-shared.js
+-- load.js
```

## load.js

The reason that layout doesn't matter is that the application structure is specified in your load.js file. Here's an example for the above listed application structure:

```javascript
// load.js

// Load paths are relative the extension directory.
graceful.loader.loadExtension({
  desktop: [
    'user/extension-boilerplate/desktop/extension-desktop.css',
    'user/extension-boilerplate/desktop/extension-desktop.js'
  ],
  webapp: [
    'user/extension-boilerplate/webapp/extension-webapp.css',
    'user/extension-boilerplate/webapp/extension-webapp.js'
  ],
  shared: [
    'user/extension-boilerplate/shared/extension-shared.js'
  ]
});
```

In each case, the load paths can be changed to account for diffent file structures. The supplied boilerplate's structure is used for convenience (it's easy to navigate and change), but other folder structures could be just as well be used. For example, a vendor/ directory could be added to house 3rd-party code.

Within `graceful.loader.loadExtension()`, files loaded in the following way:

1. Files within an array are loaded in the order specified, except for CSS files, which are always loaded last.
2. Files listed in the `desktop` array will only load if `graceful.mode === 'desktop'`, and files in `webapp` will only be loaded if `graceful.mode === 'webapp'`. Both sets of files will never be loaded at the same time.
3. The files in `shared` come before those in `desktop` or `webapp`, regardless of the order specified or which environment Graceful is loaded in.

## The graceful object

Graceful exposes some properties that are useful to developers.

`graceful.mode`
This specifies Graceful's current execution environment. Equal to either 'desktop' or 'webapp'.

`graceful.userExtensionDirectory`
The path to the user extension directory, relative index.html.

`graceful.coreExtensionDirectory`
The path to the core extension directory, relative index.html.

`graceful.editor`
The core editor instance. Lots of cool stuff here. (Try running `graceful.editor.toggleFullscreen(true, 'input')` or `graceful.editor.putText(text, start, length)` and see what happens. See the [graceful-editor-core](https://www.github.com/ConnorKrammer/graceful-editor-core) repo for more.

You can see more available properties and methods by checking out the [graceful](https://www.github.com/ConnorKrammer/graceful-application) docs.

