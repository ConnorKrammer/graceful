/*
 * graceful-minimap
 *
 * Defines a command for the editor that displays a minimap for the current pane.
 * Depends on the graceful-editor core extension.
 */

!function(global) {
  'use strict';

  /**
   * MiniMap constructor.
   *
   * Creates a minimap that displays the editor content and can be used
   * as a draggable scrollbar.
   *
   * @todo Allow the calling the mini command a second time to remove the
   *       minimap from the current pane.
   * @todo Clean up event listeners when removing a minimap, or when closing
   *       the minimap's pane.
   *
   * @constructor
   * @param {InputPane} pane - The pane to add the minimap to.
   * @return {MiniMap} The created minimap.
   */
  function MiniMap(pane) {
    var _this = this;
    var cm, minimap, inner, overlay, preview, regex, scale;

    // Exit early if it isn't an input pane.
    if (pane instanceof Editor.InputPane === false) return;

    // Get the wrapper and editor, and create the mini map components.
    cm      = pane.cm;
    minimap = document.createElement('div');
    inner   = document.createElement('pre');
    overlay = document.createElement('div');
    preview = document.createElement('pre');

    // Assign class names.
    minimap.className = 'minimap';
    inner.className   = 'minimap-inner';
    overlay.className = 'minimap-overlay';

    // Set the top margin of the overlay.
    overlay.style.marginTop = "0px";

    // Construct the map.
    pane.wrapper.appendChild(minimap);
    minimap.appendChild(inner);
    minimap.appendChild(overlay);
    overlay.appendChild(preview);

    // For calculating mini-map size.
    regex = /([0-9]+(?:\.[0-9]*)?)/; // Matches the first number.
    scale = parseFloat(getComputedStyle(minimap).webkitTransform.match(regex)[0]);

    // Update the display on resize.
    pane.on('resize', _.throttle(function() {
      _this.updateDisplay();
    }, 50));

    // Update the content when text changes.
    pane.cm.on('change', _.throttle(function() {
      _this.updateContent();
      _this.updateInnerContent();
    }, 10));

    // Update content when scrolling.
    pane.cm.on('scroll', _.throttle(function() { _this.updateContent(); }, 50));

    // Reset everything if the pane switches its buffer.
    pane.cm.on('swapDoc', function() {
      _this.updateContent();
      _this.updateInnerContent();
      _this.updateDisplay();
    });

    // Drag information.
    this.dragInfo = {
      dragHandler: _.throttle(function(event) {
        _this.dragHandler(event);
        _this.updateContent();
      }, 20),
      isDrag: false,
      lastY: 0,
      deltaY: 0
    };

    // Start the drag on mousedown.
    overlay.addEventListener('mousedown', function(event) {
      // Prevent the drag from selecting text.
      event.preventDefault();

      // Initialize drag variables.
      _this.dragInfo.isDrag = true;
      _this.dragInfo.lastY = event.screenY;
      _this.dragInfo.deltaY = 0;

      // Add the drag handler.
      document.addEventListener('mousemove', _this.dragInfo.dragHandler);
    });

    // Cancel the drag on mouseup.
    document.addEventListener('mouseup', function(event) {
      // Reset not needed if a drag wasn't triggered.
      if (!_this.dragInfo.isDrag) return;

      // Reset drag and cursor state.
      _this.dragInfo.isDrag = false;

      // Remove the drag handler.
      document.removeEventListener('mousemove', _this.dragInfo.dragHandler);
    });

    // Store references.
    this.pane    = pane;
    this.cm      = cm;
    this.minimap = minimap;
    this.inner   = inner;
    this.overlay = overlay;
    this.preview = preview;
    this.scale   = scale;

    // Update everything.
    this.updateContent();
    this.updateInnerContent();
    this.updateDisplay();

    // Start at opacity = 0, then trigger reflow.
    minimap.style.transition = 'none';
    minimap.style.opacity = 0;
    minimap.offsetHeight;

    // Fade in if the minimap is enabled.
    if (pane.wrapper.classList.contains('minimap-on')) {
      toggleTransition(minimap, 'opacity', 'opacity 0.5s ease-in', '');
      minimap.style.opacity = 1;
    } else {
      minimap.style.transition = '';
      minimap.style.opacity = '';
    }

    return this;
  }

  /**
   * Updates the minimap's position to match the editor's position.
   */
  MiniMap.prototype.updateScroll = function() {
    this.scrollToPosition(this.cm.getScrollInfo().top);
  };

  /**
   * Detects a drag and moves the minimap accordingly.
   *
   * @param {Event} event - A mousemove event.
   */
  MiniMap.prototype.dragHandler = function(event) {
    var currentTop, nextTop, scrollInfo, height, clientHeight, scrollPercent, scrollPosition;

    // Do nothing if this isn't a drag.
    if (!this.dragInfo.isDrag) return; 

    // Calculate the delta.
    this.dragInfo.deltaY = this.dragInfo.lastY - event.screenY;
    this.dragInfo.lastY = event.screenY;

    // Get the next position based on the mouse delta.
    currentTop = parseFloat(this.overlay.style.marginTop);
    nextTop    = currentTop - (this.dragInfo.deltaY / this.scale);

    // Get scroll information.
    scrollInfo   = this.cm.getScrollInfo();
    height       = scrollInfo.height;
    clientHeight = scrollInfo.clientHeight;

    // Get the percent scroll.
    if (clientHeight >= height) {
      scrollPercent = 0;
    }
    else if (clientHeight / this.scale > height) {
      scrollPercent = nextTop / (height - clientHeight);
    }
    else {
      scrollPercent = nextTop / (clientHeight / this.scale - clientHeight);
    }

    // Get the absolute scroll position based on the percent.
    scrollPosition = (height - clientHeight) * scrollPercent;

    // Scroll to the correct location.
    this.scrollToPosition(scrollPosition);
  };

  /**
   * Scrolls the editor and the minimap to the given position.
   *
   * @param {Number} scrollTop - The position to scroll the top of the editor to.
   */
  MiniMap.prototype.scrollToPosition = function(scrollTop) {
    var scrollInfo   = this.cm.getScrollInfo();
    var height       = scrollInfo.height;
    var clientHeight = scrollInfo.clientHeight;
    var scrollMax    = height - clientHeight;
    var scrollPercent;

    // Constrain values to scrollable space.
    scrollTop = Math.max(scrollTop, 0);
    scrollTop = Math.min(scrollTop, height - clientHeight);

    // Scroll to the position and calculate that percent.
    this.cm.scrollTo(null, scrollTop);
    scrollPercent = scrollTop / (scrollMax);

    // Position the overlay.
    if (clientHeight >= height) {
      this.overlay.style.marginTop = 0;
      this.inner.style.marginTop   = 0;
    }
    else if (clientHeight / this.scale > height) {
      this.overlay.style.marginTop = (scrollMax) * scrollPercent + "px";
      this.inner.style.marginTop = 0;
    }
    else {
      this.overlay.style.marginTop = (clientHeight / this.scale - clientHeight) * scrollPercent + "px";
      this.inner.style.marginTop   = (height - (clientHeight / this.scale)) * -scrollPercent + "px";
    }
  };

  /**
   * Updates the area of the minimap that contains the editor
   * viewport text (what is currently seen on screen).
   */
  MiniMap.prototype.updateContent = function() {
    // Get the text and calculate its offset.
    var range   = this.cm.getViewport();
    var text    = this.cm.doc.getRange({ line: range.from, ch: 0 }, { line: range.to, ch: 0 });
    var lines   = this.cm.getWrapperElement().getElementsByClassName('CodeMirror-code')[0];
    var scroll  = this.cm.getScrollerElement();
    var lineTop = lines.getBoundingClientRect().top - scroll.getBoundingClientRect().top;

    // Set and position the preview text.
    CodeMirror.runMode(text, this.cm.getOption('mode'), this.preview);
    this.preview.style.top = lineTop + 'px';

    // Update the scroll position.
    this.updateScroll();
  };

  /**
   * Shows the full content of the editor in the minimap.
   * This is more expensive than updating the overlay, so it
   * doesn't utilize CodeMirror's mode capabilities.
   */
  MiniMap.prototype.updateInnerContent = function() {
    var text = this.cm.doc.getValue();

    // If the last line is empty, append a space so that it renders.
    text += (text[text.length - 1] === '\n') ? ' ' : '';

    this.inner.textContent = text;
  };

  /**
   * Toggles the minimap based on whether it fits into the pane with the editor.
   * That the method of determining the pane's width is to find the percent width of
   * the pane and calculate the pixel width based on that. This is to avoid calculation
   * errors from ocurring in cases where a transition is in progress.
   */
  MiniMap.prototype.updateDisplay = function() {
    var wrapper         = this.pane.wrapper;
    var measureTarget   = !wrapper.parentElement.classList.contains('splitter') ? wrapper : wrapper.parentElement;
    var panePercent     = parseFloat(measureTarget.style.width, 10) / 100;
    var paneParentWidth = parseFloat(getComputedStyle(measureTarget.parentElement).width, 10);
    var paneWidth       = panePercent * paneParentWidth;
    var minimapWidth    = this.minimap.getBoundingClientRect().width;
    var editorWidth     = minimapWidth / this.scale;
    var padding         = 10;

    // If the mini-map fits, display it.
    if (editorWidth + minimapWidth + padding < paneWidth) {
      wrapper.classList.add('minimap-on');
      wrapper.classList.remove('minimap-off');
    } else {
      wrapper.classList.add('minimap-off');
      wrapper.classList.remove('minimap-on');
    }

    this.updateScroll();
  };

  /**
   * Sets a transition property on an element, then removes that transition
   * after it finishes.
   *
   * @param {Element} element - The element to operate on.
   * @param {String} property - The property to transition.
   * @param {String} transition - The transition to run.
   * @param {String|Number} afterValue - An optional value to set the property to
   *        after the transition is complete.
   */
  function toggleTransition(element, property, transition, afterValue) {
    function transitionEnd(event) {
      if (event.propertyName === property) {
        element.style.transition = '';
        element.removeEventListener('transitionend', transitionEnd, false);

        if (typeof(afterValue) !== undefined) {
          element.style[property] = afterValue;
        }
      }
    }

    element.style.transition = transition;
    element.addEventListener('transitionend', transitionEnd);
  }

  /**
   * When graceful is loaded, define the 'mini' command to
   * create a minimap on the current pane.
   * The command gives other commands priority.
   */
  graceful.onLoad(function() {
    graceful.editor.defineCommand({
      name: 'mini',
      forceLast: true,
      func: function(pane) {
        var minimap = new MiniMap(pane);
      }
    });
  });
}(this);

