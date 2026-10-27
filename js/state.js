/*
 * Estado unico de la aplicacion.
 *
 * Persistencia: localStorage con esquema v2. Si existe un proyecto v1 se migra
 * automaticamente y se conserva la clave anterior como respaldo. Los assets se
 * guardan embebidos como data URL para que el proyecto sea portable.
 */
(function (global) {
  'use strict';

  var CONFIG = global.MS.CONFIG;
  var Schema = global.MS.Schema;

  var listeners = [];
  var statusHandler = function () {};
  var saveTimer = null;
  var storageOk = true;
  var undoStack = [];
  var redoStack = [];
  var undoBytes = 0;
  var redoBytes = 0;
  var MAX_HISTORY = 20;
  var MAX_HISTORY_BYTES = 24 * 1024 * 1024;

  var state = load();

  function load() {
    try {
      var rawV2 = global.localStorage.getItem(CONFIG.STORAGE_KEY);
      if (rawV2) {
        try {
          return Schema.normalize(JSON.parse(rawV2));
        } catch (error) {
          global.console.warn('El proyecto v2 no se pudo leer; se intentara la migracion v1.', error);
        }
      }

      var rawV1 = global.localStorage.getItem(CONFIG.STORAGE_KEY_V1);
      if (rawV1) {
        var migrated = Schema.normalize(JSON.parse(rawV1));
        try {
          global.localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(migrated));
        } catch (error) {
          /* Si falla la escritura, el estado migrado sigue en memoria. */
        }
        return migrated;
      }
    } catch (error) {
      if (error && error.name === 'SecurityError') storageOk = false;
    }
    return Schema.defaultState();
  }

  function emit(reason) {
    listeners.slice().forEach(function (listener) {
      try {
        listener(reason || 'change');
      } catch (error) {
        global.console.error('Error en listener de estado:', error);
      }
    });
  }

  function saveNow() {
    if (saveTimer) {
      global.clearTimeout(saveTimer);
      saveTimer = null;
    }
    try {
      state.meta.updated = new Date().toISOString();
      global.localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(state));
      storageOk = true;
      statusHandler('saved');
    } catch (error) {
      storageOk = false;
      statusHandler('error');
    }
  }

  function save() {
    statusHandler('saving');
    if (saveTimer) global.clearTimeout(saveTimer);
    saveTimer = global.setTimeout(saveNow, 300);
  }

  function snapshot() {
    return JSON.stringify({ shirt: state.shirt, views: state.views });
  }

  function trimUndo() {
    while (undoStack.length > MAX_HISTORY || undoBytes > MAX_HISTORY_BYTES) {
      undoBytes -= undoStack.shift().length;
    }
  }

  function trimRedo() {
    while (redoStack.length > MAX_HISTORY || redoBytes > MAX_HISTORY_BYTES) {
      redoBytes -= redoStack.shift().length;
    }
  }

  function checkpoint() {
    var snap = snapshot();
    undoStack.push(snap);
    undoBytes += snap.length;
    trimUndo();
    redoStack = [];
    redoBytes = 0;
  }

  function restore(serialized) {
    var parsed = JSON.parse(serialized);
    state.shirt = parsed.shirt;
    state.views = parsed.views;
  }

  function undo() {
    if (!undoStack.length) return false;
    var current = snapshot();
    redoStack.push(current);
    redoBytes += current.length;
    trimRedo();
    var previous = undoStack.pop();
    undoBytes -= previous.length;
    restore(previous);
    saveNow();
    emit('design');
    return true;
  }

  function redo() {
    if (!redoStack.length) return false;
    var current = snapshot();
    undoStack.push(current);
    undoBytes += current.length;
    trimUndo();
    var next = redoStack.pop();
    redoBytes -= next.length;
    restore(next);
    saveNow();
    emit('design');
    return true;
  }

  function commit(reason) {
    save();
    emit(reason || 'design');
  }

  function touch(reason) {
    save();
    emit(reason || 'techpack');
  }

  function live() {
    emit('live');
  }

  function exportProject() {
    return JSON.stringify({
      app: 'mockup-studio',
      version: Schema.version,
      exportedAt: new Date().toISOString(),
      state: state
    }, null, 2);
  }

  function importProject(parsed) {
    if (!parsed || typeof parsed !== 'object') return false;
    var candidate = parsed.state || parsed;
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false;
    if (!candidate.designs && !candidate.views && !candidate.shirt && !candidate.project) return false;

    state = Schema.normalize(candidate);
    undoStack = [];
    redoStack = [];
    undoBytes = 0;
    redoBytes = 0;
    saveNow();
    emit('load');
    return true;
  }

  function reset() {
    state = Schema.defaultState();
    undoStack = [];
    redoStack = [];
    undoBytes = 0;
    redoBytes = 0;
    saveNow();
    emit('reset');
  }

  global.addEventListener('pagehide', saveNow);

  global.MS.State = {
    get: function () { return state; },
    subscribe: function (listener) {
      listeners.push(listener);
      return function () {
        listeners = listeners.filter(function (fn) { return fn !== listener; });
      };
    },
    setStatusHandler: function (fn) { statusHandler = fn; },
    storageOk: function () { return storageOk; },
    save: save,
    saveNow: saveNow,
    commit: commit,
    touch: touch,
    live: live,
    checkpoint: checkpoint,
    undo: undo,
    redo: redo,
    canUndo: function () { return undoStack.length > 0; },
    canRedo: function () { return redoStack.length > 0; },
    exportProject: exportProject,
    importProject: importProject,
    reset: reset
  };
})(window);
