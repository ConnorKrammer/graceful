!function(global) {
  'use strict';

  /**
   * Returns an object with empty 'events' and 'ids' properties.
   * @return {Object} The object.
   */
  function getDefaults() {
    return { events: {}, ids: {} };
  }

  /**
   * Creates a new object inheriting from the Observable prototype.
   * @constructor
   */
  function Observable() {
    this.observable = getDefaults();

    return this;
  }

  /**
   * Mixes in Observable methods to an existing object.
   *
   * @param {Object} obj - The object to mixin to.
   * @return {Object} The mixed-in object.
   */
  Observable.mixin = function(obj) {
    obj.observable = getDefaults();

    obj.on      = this.prototype.on;
    obj.once    = this.prototype.once;
    obj.off     = this.prototype.off;
    obj.trigger = this.prototype.trigger;

    return obj;
  };

  /**
   * Adds a new event listener.
   *
   * @param {String} type - The type of event to listen for.
   * @param {Function} func - The function to call when the event triggers.
   * @param {Boolean} [once=false] - Whether the listener should be removed after one call.
   * @return {Object} An identifier that can be used to remove the listener.
   */
  Observable.prototype.on = function(types, func, once) {
    var type, id, ids;

    types = [].concat(types);
    once = once || false;
    ids = [];

    for (var i = 0; i < types.length; i++) {
      type = types[i];

      if (!this.observable.events[type]) {
        this.observable.events[type] = {};
        this.observable.ids[type] = 0;
      }

      id = ++this.observable.ids[type];
      this.observable.events[type][id] = {
        func: func,
        once: once
      };

      ids.push({ type: type, id: id });
    }

    return ids.length === 1 ? ids[0] : ids;
  };

  /**
   * Adds an event listener to be executed once.
   *
   * @param {String} type - The type of event to listen for.
   * @param {Function} func - The function to call when the event triggers.
   * @return {Object} An identifier that can be used to remove the listener.
   */
  Observable.prototype.once = function(types, func) {
    return this.on(types, func, true);
  };

  /**
   * Removes the event listener cooresponding to the given ids.
   * These ids will have been returned from Observable.on() or
   * Observable.once().
   *
   * @param {Object|Object[]} [ids] - An id or array of ids cooresponding to event
   *        listeners to remove. If not specified, all listeners will be removed.
   */
  Observable.prototype.off = function(ids) {
    var info, type, id;

    if (!ids) {
      this.observable = getDefaults();
      return;
    }

    ids = [].concat(ids);

    for (var i = 0; i < ids.length; i++) {
      info = ids[i];
      type = info.type;
      id   = info.id;

      delete this.observable.events[type][id];
    }
  };

  /**
   * Triggers an event.
   *
   * @param {String} type - The event type to trigger.
   * @param {*|Array} [args] - Arguments to pass to triggered event listeners.
   */
  Observable.prototype.trigger = function(type, args) {
    var event;
    var events = this.observable.events[type];

    args = [].concat(args);

    for (var id in events) {
      event = events[id];
      event.func.apply(null, args);

      if (event.once) delete events[id];
    }
  };

  global.Observable = Observable;
}(this);

