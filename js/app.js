/*
 * Orquestacion de la aplicacion: vistas, proyecto, atajos y estado visual.
 * Los modulos Editor, Exporter y Techpack no se comunican entre si; App es el
 * unico punto que reacciona a los cambios de State y decide que repintar.
 */
(function (global) {
  'use strict';

  var State = global.MS.State;
  var util = global.MS.util;

  var storageErrorShown = false;

  function toast(message, type, timeout) {
    var container = document.getElementById('toasts');
    if (!container) return;

    var node = document.createElement('div');
    node.className = 'toast ' + (type || 'info');
    node.textContent = message;
    container.appendChild(node);

    while (container.children.length > 4) {
      container.removeChild(container.firstChild);
    }

    global.setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
    }, timeout || 4200);
  }

  function updateStatus(kind) {
    var el = document.getElementById('save-status');
    if (!el) return;

    if (kind === 'saving') {
      el.textContent = 'Guardando...';
      el.className = 'save-status';
    } else if (kind === 'saved') {
      el.textContent = 'Guardado';
      el.className = 'save-status saved';
    } else if (kind === 'error') {
      el.textContent = 'Sin autoguardado';
      el.className = 'save-status error';
      if (!storageErrorShown) {
        storageErrorShown = true;
        toast('No se pudo autoguardar. Exporta el proyecto para no perder los cambios.', 'error');
      }
    } else {
      el.textContent = 'Listo';
      el.className = 'save-status';
    }
  }

  function showStorageWarning() {
    var warn = document.getElementById('storage-warn');
    if (warn) warn.hidden = false;
  }

  function updateHistoryButtons() {
    var undo = document.getElementById('btn-undo');
    var redo = document.getElementById('btn-redo');
    if (undo) undo.disabled = !State.canUndo();
    if (redo) redo.disabled = !State.canRedo();
  }

  function syncProjectInputs() {
    var state = State.get();
    var code = document.getElementById('project-code');
    var name = document.getElementById('project-name');
    if (code) code.value = state.project.code || '';
    if (name) name.value = state.project.name || '';
  }

  function showTab(target) {
    var views = document.querySelectorAll('.view');
    Array.prototype.forEach.call(views, function (view) {
      view.classList.toggle('active', view.id === 'view-' + target);
    });

    var tabs = document.querySelectorAll('.tab');
    Array.prototype.forEach.call(tabs, function (tab) {
      tab.classList.toggle('active', tab.dataset.target === target);
    });

    if (target === 'techpack') {
      global.MS.Techpack.refresh();
    }
  }

  function onStateChange(reason) {
    if (reason === 'live') {
      global.MS.Editor.sync();
      global.MS.Exporter.sync();
      return;
    }

    var skipEditor = reason === 'techpack' || reason === 'project';
    if (!skipEditor) {
      global.MS.Editor.render();
      global.MS.Exporter.sync();
    }

    if (reason === 'load' || reason === 'reset') {
      syncProjectInputs();
    }

    global.MS.Techpack.onStateChange(reason);
    updateHistoryButtons();
  }

  function bindTabs() {
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (tab) {
      tab.addEventListener('click', function () { showTab(tab.dataset.target); });
    });
  }

  function bindProject() {
    var code = document.getElementById('project-code');
    var name = document.getElementById('project-name');

    if (code) {
      code.addEventListener('input', function () {
        State.get().project.code = code.value;
        State.touch('project');
      });
    }
    if (name) {
      name.addEventListener('input', function () {
        State.get().project.name = name.value;
        State.touch('project');
      });
    }

    var fileInput = document.getElementById('project-file');
    var importButton = document.getElementById('btn-import-project');
    if (importButton && fileInput) {
      importButton.addEventListener('click', function () { fileInput.click(); });
      fileInput.addEventListener('change', function () {
        var file = fileInput.files && fileInput.files[0];
        fileInput.value = '';
        if (!file) return;

        file.text().then(function (text) {
          var parsed = JSON.parse(text);
          if (!State.importProject(parsed)) {
            throw new Error('El archivo no tiene un proyecto válido.');
          }
          syncProjectInputs();
          toast('Proyecto importado.', 'success');
        }).catch(function () {
          toast('No se pudo importar el proyecto. Verifica el archivo JSON.', 'error');
        });
      });
    }

    var exportButton = document.getElementById('btn-export-project');
    if (exportButton) {
      exportButton.addEventListener('click', function () {
        var state = State.get();
        var filename = util.slug([state.project.code, state.project.name].filter(Boolean).join('-')) + '.mockup.json';
        var blob = new Blob([State.exportProject()], { type: 'application/json;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        global.setTimeout(function () { URL.revokeObjectURL(url); }, 1200);
        toast('Proyecto exportado.', 'success');
      });
    }

    var newButton = document.getElementById('btn-new');
    if (newButton) {
      newButton.addEventListener('click', function () {
        var confirmed = global.confirm('Se borrará el proyecto actual de este navegador. Expórtalo antes si quieres conservarlo. ¿Continuar?');
        if (!confirmed) return;
        State.reset();
        syncProjectInputs();
        toast('Proyecto nuevo.', 'info');
      });
    }
  }

  function bindHistory() {
    var undo = document.getElementById('btn-undo');
    var redo = document.getElementById('btn-redo');
    if (undo) undo.addEventListener('click', function () { State.undo(); });
    if (redo) redo.addEventListener('click', function () { State.redo(); });
  }

  function isTypingTarget(target) {
    if (!target) return false;
    var tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  function bindShortcuts() {
    global.document.addEventListener('keydown', function (event) {
      var modifier = event.ctrlKey || event.metaKey;
      if (!modifier) return;
      if (isTypingTarget(event.target)) return;

      var key = event.key.toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) State.redo();
        else State.undo();
      } else if (key === 'y') {
        event.preventDefault();
        State.redo();
      }
    });
  }

  function init() {
    State.setStatusHandler(updateStatus);

    global.MS.Editor.init();
    global.MS.Exporter.init();
    global.MS.Techpack.init();

    bindTabs();
    bindProject();
    bindHistory();
    bindShortcuts();

    State.subscribe(onStateChange);

    global.MS.Exporter.sync();
    updateHistoryButtons();
    syncProjectInputs();

    if (!State.storageOk()) {
      showStorageWarning();
      updateStatus('error');
    }
  }

  global.addEventListener('DOMContentLoaded', init);

  global.MS.App = {
    toast: toast,
    showTab: showTab,
    updateStatus: updateStatus,
    syncProjectInputs: syncProjectInputs
  };
})(window);
