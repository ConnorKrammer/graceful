# Mouse
Mouse provides an interface that represents the mouse itself as an object with state. This allows you to reverse the normal approach of binding to specific elements. New events for 'grab', 'drag', and 'drop' are also provided, as well as binding and tracking of multiple button states.

# 30 second example
`window.Mouse` points to the constructor, `window.mouse` points to the mouse instance.

The follow is an example of a right mouse button drag+drop that works for everything on the page. This shows the power of binding events to the mouse itself, allowing one set of handlers to work with *everything*.

The following example can be seen in action packaged as a bookmarklet here: http://bbenvie.com/examples/drag-anything.html

```javascript
(function moveAnything(){
  var style, x, y;

  mouse.on('down', 'right', function(e){
    // prevent default text selection
    e.preventDefault();
  });

  mouse.on('grab', 'right', function(e){
    // `e.target` is the element the mouse is acting on
    var computed = getComputedStyle(e.target);
    style = e.target.style;

    // `this` refers to the mouse itself
    x = (parseFloat(computed.left) || 0) - this.x;
    y = (parseFloat(computed.top) || 0) - this.y;

    if (computed.position === 'static') {
      style.position = 'relative';
    }
  });

  mouse.on('drag', 'right', function(e){
    // update position
    style.left = (this.x + x) + 'px';
    style.top = (this.y + y) + 'px';
  });

  mouse.on('drop', 'right', function(e){
    // free reference and prevent context menu
    style = null;
    e.preventDefault();
  });
})();
```

# Event Handling
`window.mouse` provides existing mouse events as well as normalizing some and adding new ones.

* __down__: mousedown
* __up__: mouseup
* __move__: mousemove
* __click__: click and contextmenu
* __dblclick__: dblclick
* __leave__: when the mouse leaves the window entirely
* __enter__: when the mouse enters the window from outside
* __wheel__: mousewheel and wheel events
* __grab__: first move after a button is pressed and held
* __drag__: while any button is held and dragged, each move event becomes both a move and a drag event
* __drop__: first button release after grab + drag

# API
The following functions are provided to allow management of listeners. `types` is a string of event names separated by spaces for multiple events. `buttons` is an optional parameter that will pre-filter what events you're notified of. Buttons can be one of:

* string like "left" or "left+right"
* a bitmask where `left === 1`, `middle === 2`, and `right === 4` (so left | right is 5)
* an object like `{ left: true, right: true }`.

If button filter is omitted then the callback becomes the second param and events aren't filtered.

* __mouse.on(types, [buttons], callback)__: add callback as listener for each type in types
* __mouse.off(types, [buttons], callback)__: remove callback from listeners for each type in types
* __mouse.once(types, [buttons], callback)__: add callback as listener for the first time each type in types fires, then removes it
* __mouse.emit(evt)__: takes MouseEvent object and runs the event through the callbacks the same as when a native event is received. Type is determined from the event object
* __new Mouse(view)__: initializes mouse instance for given view. This is done automatically for main window, but this could be run on, for example, an iframe's window to provide a mouse object scope to the iframe.

# Button handling

Mouse button state is tracked MouseEvent instances are augmented in two ways:

* __buttons__: The buttons as per the W3C spec (only first 3 buttons currently). That is logical combination of the button states. left is 1, middle is 2, right is 4. All through would be 7, etc.
* __buttonStates__: is a frozen object that maps the bitmask out to an object, like `{ left: true/false, middle: true/false, right: true/false }`. Performance is maintained because there's only 8 variations so the same frozen objects are simply reused
