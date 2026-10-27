/*
 * Editor de zonas y capas.
 *
 * Cada capa guarda su centro relativo al centro de su zona. La posicion en la
 * mesa se obtiene sumando zone.center + layer.(xCm|yCm). Asi cambiar de zona o
 * reutilizar una capa no depende del zoom ni de coordenadas de pantalla.
 */
(function (global) {
  'use strict';

  var CONFIG = global.MS.CONFIG;
  var util = global.MS.util;
  var State = global.MS.State;
  var Shirt = global.MS.Shirt;
  var Catalog = global.MS.Catalog;
  var Schema = global.MS.Schema;

  var canvas;
  var stage;
  var stageScroll;
  var zoomLabel;
  var drag = null;
  var zoom = 1;
  var BASE_WIDTH = 620;

  function toast(message, type, timeout) {
    if (global.MS.App && global.MS.App.toast) global.MS.App.toast(message, type, timeout);
  }

  function esc(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escAttr(value) {
    return esc(value);
  }

  function sideLabel(side) {
    return side === 'back' ? 'Espalda' : 'Frente';
  }

  function viewState() {
    var state = State.get();
    return state.views[state.shirt.side];
  }

  function activeZoneId() {
    var view = viewState();
    return view ? view.activeZone : Catalog.defaultZone(State.get().shirt.side);
  }

  function activeZoneDef() {
    return Catalog.byId(activeZoneId()) || Catalog.byId(Catalog.defaultZone(State.get().shirt.side));
  }

  function zoneStateById(zoneId) {
    var view = viewState();
    return view && view.zones ? view.zones[zoneId] : null;
  }

  function activeZoneState() {
    return zoneStateById(activeZoneId());
  }

  function activeLayers() {
    var zone = activeZoneState();
    return zone && Array.isArray(zone.layers) ? zone.layers : [];
  }

  function findLayer(layerId) {
    var view = viewState();
    var found = null;
    if (!view) return null;
    Catalog.forView(State.get().shirt.side).some(function (zone) {
      var zoneState = view.zones[zone.id];
      if (!zoneState) return false;
      var layer = zoneState.layers.filter(function (item) { return item.id === layerId; })[0];
      if (layer) {
        found = { zone: zone, zoneState: zoneState, layer: layer };
        return true;
      }
      return false;
    });
    return found;
  }

  function ensureActiveLayer() {
    var zone = activeZoneState();
    if (!zone) return null;
    var exists = zone.layers.some(function (layer) { return layer.id === zone.activeLayerId; });
    if (!exists) {
      zone.activeLayerId = zone.layers.length ? zone.layers[zone.layers.length - 1].id : null;
    }
    return zone.layers.filter(function (layer) { return layer.id === zone.activeLayerId; })[0] || null;
  }

  function activeLayer() {
    return ensureActiveLayer();
  }

  function boardCenter(zoneDef, layer) {
    return {
      x: zoneDef.center.x + layer.xCm,
      y: zoneDef.center.y + layer.yCm
    };
  }

  function guideMarkup(zoneDef, guides) {
    var x = zoneDef.rect.xCm * CONFIG.CM_PX;
    var y = zoneDef.rect.yCm * CONFIG.CM_PX;
    var w = zoneDef.rect.wCm * CONFIG.CM_PX;
    var h = zoneDef.rect.hCm * CONFIG.CM_PX;
    var margin = zoneDef.safe * CONFIG.CM_PX;
    var small = zoneDef.maxW < 14 || zoneDef.maxH < 10;
    var fontSize = small ? 10 : 13;
    var parts = [];

    if (guides.zone && !zoneDef.free) {
      parts.push(
        '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="8" ' +
          'fill="rgba(79,111,208,0.06)" stroke="#4f6fd0" stroke-width="2" stroke-dasharray="9 7"/>'
      );
      parts.push(
        '<text class="guide-text" x="' + (x + 2) + '" y="' + (y + h + (small ? 12 : 20)) + '" ' +
          'font-size="' + fontSize + '">' +
          esc(zoneDef.label + ' · ' + zoneDef.maxW + ' x ' + zoneDef.maxH + ' cm') +
        '</text>'
      );
    }

    if (guides.safe && !zoneDef.free && zoneDef.maxW > zoneDef.safe * 2 && zoneDef.maxH > zoneDef.safe * 2) {
      parts.push(
        '<rect x="' + (x + margin) + '" y="' + (y + margin) + '" ' +
          'width="' + (w - margin * 2) + '" height="' + (h - margin * 2) + '" ' +
          'fill="none" stroke="rgba(79,111,208,0.55)" stroke-width="1.5" stroke-dasharray="4 6"/>'
      );
    }

    if (guides.center) {
      parts.push(
        '<line x1="' + (x + w / 2) + '" y1="' + y + '" x2="' + (x + w / 2) + '" y2="' + (y + h) + '" ' +
          'stroke="rgba(79,111,208,0.45)" stroke-width="1.5" stroke-dasharray="3 5"/>'
      );
      parts.push(
        '<line x1="' + x + '" y1="' + (y + h / 2) + '" x2="' + (x + w) + '" y2="' + (y + h / 2) + '" ' +
          'stroke="rgba(79,111,208,0.45)" stroke-width="1.5" stroke-dasharray="3 5"/>'
      );
    }

    return '<g id="guides" pointer-events="none">' + parts.join('') + '</g>';
  }

  function layerMarkup(layer, zoneDef, selected) {
    if (!layer.visible || layer.type === 'text') return '';
    var center = boardCenter(zoneDef, layer);
    var scale = CONFIG.CM_PX;
    var w = layer.widthCm * scale;
    var h = w / layer.aspect;
    var transform = 'translate(' + (center.x * scale) + ' ' + (center.y * scale) + ') ' +
      'rotate(' + util.toNumber(layer.rotation, 0) + ') ' +
      'scale(' + (layer.flipX ? -1 : 1) + ' 1)';
    var classes = 'layer-group' + (selected ? ' selected' : '') + (layer.locked ? ' locked' : '');

    return '<g class="' + classes + '" data-layer-id="' + escAttr(layer.id) + '" ' +
        'data-zone-id="' + escAttr(zoneDef.id) + '" transform="' + transform + '" ' +
        'opacity="' + layer.opacity + '">' +
      '<image class="design-image" x="' + (-w / 2) + '" y="' + (-h / 2) + '" ' +
        'width="' + w + '" height="' + h + '" href="' + escAttr(layer.src) + '" ' +
        'preserveAspectRatio="xMidYMid meet"/>' +
    '</g>';
  }

  function selectionMarkup(layer, zoneDef) {
    if (!layer || !layer.visible || layer.type === 'text') return '';
    var center = boardCenter(zoneDef, layer);
    var scale = CONFIG.CM_PX;
    var w = layer.widthCm * scale;
    var h = w / layer.aspect;
    var transform = 'translate(' + (center.x * scale) + ' ' + (center.y * scale) + ') ' +
      'rotate(' + util.toNumber(layer.rotation, 0) + ') ' +
      'scale(' + (layer.flipX ? -1 : 1) + ' 1)';
    var handles = layer.locked ? '' :
      '<line class="rotate-line" x1="0" y1="' + (-h / 2) + '" x2="0" y2="' + (-h / 2 - 28) + '"/>' +
      '<circle class="handle handle-rotate" data-handle="rotate" cx="0" cy="' + (-h / 2 - 28) + '" r="9"/>' +
      '<circle class="handle handle-resize" data-handle="resize" cx="' + (w / 2) + '" cy="' + (h / 2) + '" r="9"/>';

    return '<g id="selection" transform="' + transform + '">' +
      '<rect class="selection" x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h + '"/>' +
      handles +
    '</g>';
  }

  function placeholderMarkup(zoneDef) {
    var x = zoneDef.rect.xCm * CONFIG.CM_PX;
    var y = zoneDef.rect.yCm * CONFIG.CM_PX;
    var w = zoneDef.rect.wCm * CONFIG.CM_PX;
    var h = zoneDef.rect.hCm * CONFIG.CM_PX;
    var fontSize = util.clamp(zoneDef.maxW * 1.4, 11, 20);
    var small = zoneDef.maxW < 14 || zoneDef.maxH < 10;

    return '<g id="placeholder" pointer-events="none">' +
      '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="14" ' +
        'fill="rgba(255,255,255,0.35)" stroke="rgba(79,111,208,0.5)" stroke-width="2" stroke-dasharray="10 8"/>' +
      '<text x="' + (x + w / 2) + '" y="' + (y + h / 2 - (small ? 0 : 6)) + '" text-anchor="middle" ' +
        'font-family="system-ui, sans-serif" font-size="' + fontSize + '" font-weight="600" fill="#46566f">' +
        (small ? 'Añadir' : 'Añade una capa') +
      '</text>' +
      (small ? '' :
        '<text x="' + (x + w / 2) + '" y="' + (y + h / 2 + 20) + '" text-anchor="middle" ' +
          'font-family="system-ui, sans-serif" font-size="14" fill="#63738c">SVG, PNG o JPG</text>') +
    '</g>';
  }

  function renderSwatches() {
    var container = document.getElementById('color-swatches');
    if (!container) return;
    container.innerHTML = '';
    CONFIG.COLORS.forEach(function (color) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'swatch';
      button.dataset.color = color.hex;
      button.title = color.name + ' ' + color.hex;
      button.setAttribute('aria-label', color.name + ' ' + color.hex);
      button.style.background = color.hex;
      button.addEventListener('click', function () {
        State.checkpoint();
        State.get().shirt.color = color.hex;
        State.commit('design');
        checkContrast();
      });
      container.appendChild(button);
    });
  }

  function renderZones() {
    var container = document.getElementById('zone-list');
    if (!container) return;
    var view = viewState();
    var zones = Catalog.forView(State.get().shirt.side);
    container.innerHTML = zones.map(function (zone) {
      var zoneState = view.zones[zone.id];
      var count = zoneState && zoneState.layers ? zoneState.layers.length : 0;
      return '<button type="button" class="zone-btn' + (zone.id === view.activeZone ? ' active' : '') + '" ' +
        'data-zone="' + escAttr(zone.id) + '" title="Máximo ' + zone.maxW + ' x ' + zone.maxH + ' cm">' +
        '<span class="zone-name">' + esc(zone.label) + '</span>' +
        '<span class="zone-count">' + count + '</span>' +
      '</button>';
    }).join('');
  }

  function renderLayers() {
    var list = document.getElementById('layer-list');
    if (!list) return;
    var zone = activeZoneState();
    var layers = zone && Array.isArray(zone.layers) ? zone.layers : [];
    var selectedId = zone ? zone.activeLayerId : null;

    if (!layers.length) {
      list.innerHTML = '<p class="empty-state">Sin capas en esta zona.</p>';
      return;
    }

    list.innerHTML = layers.slice().reverse().map(function (layer) {
      var state = [];
      if (!layer.visible) state.push('oculta');
      if (layer.locked) state.push('bloqueada');
      return '<div class="layer-row' + (layer.id === selectedId ? ' active' : '') + '">' +
        '<button type="button" class="layer-select" data-layer-select="' + escAttr(layer.id) + '">' +
          '<span class="layer-name">' + esc(layer.name) + '</span>' +
          '<span class="layer-state">' + (state.length ? state.join(' · ') : 'visible') + '</span>' +
        '</button>' +
        '<button type="button" class="layer-eye" data-layer-visible="' + escAttr(layer.id) + '" ' +
          'title="' + (layer.visible ? 'Ocultar capa' : 'Mostrar capa') + '">' +
          (layer.visible ? 'Ocultar' : 'Mostrar') +
        '</button>' +
      '</div>';
    }).join('');
  }

  function updateTransformControls(layer) {
    var widthRange = document.getElementById('width-range');
    var widthNumber = document.getElementById('width-number');
    var widthOut = document.getElementById('width-out');
    var rotRange = document.getElementById('rot-range');
    var rotNumber = document.getElementById('rot-number');
    var rotOut = document.getElementById('rot-out');
    if (!widthRange || !widthNumber || !rotRange || !rotNumber) return;

    if (!layer) {
      widthOut.textContent = '20 cm';
      rotOut.textContent = '0°';
      return;
    }

    var maxWidth = Math.min(CONFIG.MAX_DESIGN_WIDTH_CM, CONFIG.MAX_DESIGN_HEIGHT_CM * layer.aspect);
    widthRange.max = String(util.round(maxWidth, 1));
    widthNumber.max = String(util.round(maxWidth, 1));
    widthRange.value = String(layer.widthCm);
    widthNumber.value = String(util.round(layer.widthCm, 1));
    widthOut.textContent = util.formatCm(layer.widthCm) + ' cm';

    rotRange.value = String(layer.rotation);
    rotNumber.value = String(util.round(layer.rotation, 1));
    rotOut.textContent = util.round(layer.rotation, 0) + '°';
  }

  function updateControls() {
    var state = State.get();
    var layer = ensureActiveLayer();
    var zoneDef = activeZoneDef();
    var hasLayer = Boolean(layer);
    var editable = hasLayer && !layer.locked;

    Array.prototype.forEach.call(document.querySelectorAll('#side-toggle [data-side]'), function (button) {
      button.classList.toggle('active', button.dataset.side === state.shirt.side);
    });

    var colorInput = document.getElementById('shirt-color');
    var colorHex = document.getElementById('shirt-color-hex');
    if (colorInput && colorInput.value.toLowerCase() !== state.shirt.color.toLowerCase()) {
      colorInput.value = state.shirt.color;
    }
    if (colorHex) colorHex.textContent = state.shirt.color.toUpperCase();

    Array.prototype.forEach.call(document.querySelectorAll('#color-swatches .swatch'), function (button) {
      button.classList.toggle('active', button.dataset.color.toUpperCase() === state.shirt.color.toUpperCase());
    });

    renderZones();
    renderLayers();

    var meta = document.getElementById('design-meta');
    if (meta) {
      if (layer) {
        var heightCm = layer.widthCm / layer.aspect;
        var extra = [];
        if (!layer.visible) extra.push('oculta');
        if (layer.locked) extra.push('bloqueada');
        meta.innerHTML = '<strong>' + esc(layer.name) + '</strong><br>' +
          util.formatCm(layer.widthCm) + ' x ' + util.formatCm(heightCm) + ' cm &middot; ' +
          esc(layer.vector ? 'vector' : (layer.mime || 'imagen')) +
          (extra.length ? ' &middot; ' + esc(extra.join(' · ')) : '');
      } else {
        meta.textContent = 'Sin capas en ' + zoneDef.label + '.';
      }
    }

    var dropTitle = document.getElementById('dropzone-title');
    if (dropTitle) dropTitle.textContent = activeLayers().length ? 'Agregar otra capa' : 'Arrastra tu diseño';

    var widthRange = document.getElementById('width-range');
    var widthNumber = document.getElementById('width-number');
    var rotRange = document.getElementById('rot-range');
    var rotNumber = document.getElementById('rot-number');
    [widthRange, widthNumber, rotRange, rotNumber].forEach(function (input) {
      if (input) input.disabled = !editable;
    });
    updateTransformControls(layer);

    ['btn-flip', 'btn-center', 'btn-remove'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.disabled = !editable;
    });
    ['btn-layer-up', 'btn-layer-down', 'btn-duplicate'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.disabled = !editable;
    });
    var lockButtonEl = document.getElementById('btn-lock');
    if (lockButtonEl) lockButtonEl.disabled = !hasLayer;
    var lockButton = document.getElementById('btn-lock');
    if (lockButton) lockButton.textContent = hasLayer && layer.locked ? 'Desbloquear' : 'Bloquear';

    var side = document.getElementById('stage-side');
    if (side) side.textContent = sideLabel(state.shirt.side);
    var zoneLabel = document.getElementById('stage-zone');
    if (zoneLabel) {
      var count = activeLayers().length;
      zoneLabel.textContent = zoneDef.label + (count ? ' · ' + count + (count === 1 ? ' capa' : ' capas') : '');
    }

    var guideZone = document.getElementById('guide-zone');
    var guideSafe = document.getElementById('guide-safe');
    var guideCenter = document.getElementById('guide-center');
    if (guideZone) guideZone.checked = state.guides.zone;
    if (guideSafe) guideSafe.checked = state.guides.safe;
    if (guideCenter) guideCenter.checked = state.guides.center;
  }

  function render() {
    var state = State.get();
    var zoneDef = activeZoneDef();
    var zoneState = activeZoneState();
    var selected = ensureActiveLayer();
    var parts = [];

    Catalog.forView(state.shirt.side).forEach(function (zone) {
      var current = state.views[state.shirt.side].zones[zone.id];
      if (!current || !Array.isArray(current.layers)) return;
      current.layers.forEach(function (layer) {
        parts.push(layerMarkup(layer, zone, selected && selected.id === layer.id));
      });
    });

    var placeholder = zoneState && zoneState.layers.length ? '' : placeholderMarkup(zoneDef);
    canvas.setAttribute('viewBox', CONFIG.SHIRT.viewBox);
    canvas.innerHTML =
      Shirt.markup(state.shirt.side, state.shirt.color) +
      guideMarkup(zoneDef, state.guides) +
      placeholder +
      parts.join('') +
      selectionMarkup(selected, zoneDef);
    updateControls();
  }

  function sync() {
    var layer = activeLayer();
    if (!layer) return;
    var zoneDef = activeZoneDef();
    var center = boardCenter(zoneDef, layer);
    var scale = CONFIG.CM_PX;
    var w = layer.widthCm * scale;
    var h = w / layer.aspect;
    var transform = 'translate(' + (center.x * scale) + ' ' + (center.y * scale) + ') ' +
      'rotate(' + util.toNumber(layer.rotation, 0) + ') ' +
      'scale(' + (layer.flipX ? -1 : 1) + ' 1)';

    var group = canvas.querySelector('[data-layer-id="' + layer.id + '"]');
    if (group) {
      group.setAttribute('transform', transform);
      var image = group.querySelector('image');
      if (image) {
        image.setAttribute('x', String(-w / 2));
        image.setAttribute('y', String(-h / 2));
        image.setAttribute('width', String(w));
        image.setAttribute('height', String(h));
      }
    }

    var selection = canvas.querySelector('#selection');
    if (selection) {
      selection.setAttribute('transform', transform);
      var rect = selection.querySelector('.selection');
      if (rect) {
        rect.setAttribute('x', String(-w / 2));
        rect.setAttribute('y', String(-h / 2));
        rect.setAttribute('width', String(w));
        rect.setAttribute('height', String(h));
      }
      var line = selection.querySelector('.rotate-line');
      if (line) {
        line.setAttribute('y1', String(-h / 2));
        line.setAttribute('y2', String(-h / 2 - 28));
      }
      var rotateHandle = selection.querySelector('.handle-rotate');
      if (rotateHandle) rotateHandle.setAttribute('cy', String(-h / 2 - 28));
      var resizeHandle = selection.querySelector('.handle-resize');
      if (resizeHandle) {
        resizeHandle.setAttribute('cx', String(w / 2));
        resizeHandle.setAttribute('cy', String(h / 2));
      }
    }

    updateTransformControls(layer);
  }

  function clientToCm(event) {
    var point = canvas.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    var matrix = canvas.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    var local = point.matrixTransform(matrix.inverse());
    return { x: local.x / CONFIG.CM_PX, y: local.y / CONFIG.CM_PX };
  }

  function onPointerDown(event) {
    if (event.button !== 0) return;
    var target = event.target;
    var handle = target.closest ? target.closest('[data-handle]') : null;
    var layerEl = target.closest ? target.closest('[data-layer-id]') : null;
    var found = null;

    if (layerEl) {
      found = findLayer(layerEl.getAttribute('data-layer-id'));
      if (found) {
        var state = State.get();
        var view = viewState();
        var changed = view.activeZone !== found.zone.id || found.zoneState.activeLayerId !== found.layer.id;
        if (changed) {
          view.activeZone = found.zone.id;
          found.zoneState.activeLayerId = found.layer.id;
          State.commit('design');
        }
      }
    } else if (handle) {
      found = { zone: activeZoneDef(), zoneState: activeZoneState(), layer: activeLayer() };
    }

    if (!found || !found.layer) return;
    if (found.layer.locked) return;

    event.preventDefault();
    var point = clientToCm(event);
    var layer = found.layer;
    var center = boardCenter(found.zone, layer);
    var mode = handle ? handle.getAttribute('data-handle') : 'move';

    State.checkpoint();
    drag = {
      mode: mode,
      layer: layer,
      zone: found.zone,
      startX: point.x,
      startY: point.y,
      startOffsetX: layer.xCm,
      startOffsetY: layer.yCm,
      startWidth: layer.widthCm,
      startRotation: layer.rotation,
      startAngle: Math.atan2(point.y - center.y, point.x - center.x),
      startDistance: Math.hypot(point.x - center.x, point.y - center.y) || 0.001,
      pointerId: event.pointerId
    };
    canvas.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    var point = clientToCm(event);
    var layer = drag.layer;
    var zone = drag.zone;

    if (drag.mode === 'move') {
      layer.xCm = util.clamp(
        drag.startOffsetX + (point.x - drag.startX),
        -zone.center.x,
        100 - zone.center.x
      );
      layer.yCm = util.clamp(
        drag.startOffsetY + (point.y - drag.startY),
        -zone.center.y,
        90 - zone.center.y
      );
    } else if (drag.mode === 'resize') {
      var center = boardCenter(zone, layer);
      var distance = Math.hypot(point.x - center.x, point.y - center.y);
      var width = drag.startWidth * (distance / drag.startDistance);
      var maxWidth = Math.min(CONFIG.MAX_DESIGN_WIDTH_CM, CONFIG.MAX_DESIGN_HEIGHT_CM * layer.aspect);
      layer.widthCm = util.round(util.clamp(width, 2, maxWidth), 1);
    } else if (drag.mode === 'rotate') {
      var rotateCenter = boardCenter(zone, layer);
      var angle = Math.atan2(point.y - rotateCenter.y, point.x - rotateCenter.x);
      var degrees = drag.startRotation + ((angle - drag.startAngle) * 180) / Math.PI;
      degrees = ((((degrees + 180) % 360) + 360) % 360) - 180;
      [-180, -90, 0, 90, 180].some(function (snap) {
        if (Math.abs(degrees - snap) <= 2) {
          degrees = snap;
          return true;
        }
        return false;
      });
      layer.rotation = util.round(degrees, 1);
    }

    event.preventDefault();
    State.live();
  }

  function endDrag(event) {
    if (!drag) return;
    if (event && event.pointerId !== drag.pointerId) return;
    try {
      if (event) canvas.releasePointerCapture(event.pointerId);
    } catch (error) {
      /* El puntero ya puede estar liberado. */
    }
    drag = null;
    State.commit('design');
  }

  function readAsDataURL(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result)); };
      reader.onerror = function () { reject(new Error('No se pudo leer el archivo.')); };
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('La imagen no es válida o usa un formato no soportado.')); };
      img.src = src;
    });
  }

  function parseSvgMeta(text) {
    var result = { aspect: null, external: false, scripts: false };
    try {
      var doc = new DOMParser().parseFromString(text, 'image/svg+xml');
      var root = doc.documentElement;
      if (!root || root.nodeName.toLowerCase() !== 'svg') return result;

      var widthAttr = root.getAttribute('width') || '';
      var heightAttr = root.getAttribute('height') || '';
      var width = parseFloat(widthAttr);
      var height = parseFloat(heightAttr);
      if (width > 0 && height > 0 && widthAttr.indexOf('%') === -1 && heightAttr.indexOf('%') === -1) {
        result.aspect = width / height;
      } else {
        var viewBox = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
        if (viewBox.length === 4 && viewBox[2] > 0 && viewBox[3] > 0) {
          result.aspect = viewBox[2] / viewBox[3];
        }
      }

      var refs = doc.querySelectorAll('image, use, feImage');
      Array.prototype.forEach.call(refs, function (node) {
        var href = node.getAttribute('href') || node.getAttribute('xlink:href') || '';
        if (href && href.charAt(0) !== '#' && href.indexOf('data:') !== 0) {
          result.external = true;
        }
      });
      result.scripts = doc.querySelectorAll('script').length > 0;
    } catch (error) {
      /* Un SVG mal formado se rechazara al intentar cargarlo como imagen. */
    }
    return result;
  }

  function toLinear(channel) {
    return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  }

  function computeLuminance(src) {
    return loadImage(src).then(function (img) {
      var canvasEl = document.createElement('canvas');
      canvasEl.width = 32;
      canvasEl.height = 32;
      var ctx = canvasEl.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, 32, 32);
      var data = ctx.getImageData(0, 0, 32, 32).data;
      var total = 0;
      var weight = 0;
      for (var i = 0; i < data.length; i += 4) {
        var alpha = data[i + 3] / 255;
        if (alpha < 0.2) continue;
        var r = toLinear(data[i] / 255);
        var g = toLinear(data[i + 1] / 255);
        var b = toLinear(data[i + 2] / 255);
        total += (0.2126 * r + 0.7152 * g + 0.0722 * b) * alpha;
        weight += alpha;
      }
      return weight > 0 ? total / weight : null;
    });
  }

  function checkContrast() {
    var state = State.get();
    var shirtLum = util.luminance(state.shirt.color);
    if (shirtLum == null) return;
    var warned = false;
    activeLayers().some(function (layer) {
      if (!layer.visible || typeof layer.luminance !== 'number') return false;
      if (Math.abs(shirtLum - layer.luminance) < 0.16) {
        warned = true;
        return true;
      }
      return false;
    });
    if (warned) {
      toast('Contraste bajo entre una capa y la camiseta. Revisa el mockup antes de estampar.', 'warn');
    }
  }

  function fitWidthToZone(aspect, zone) {
    var width = Math.min(20, zone.maxW, zone.maxH * aspect);
    return util.round(util.clamp(width, 2, CONFIG.MAX_DESIGN_WIDTH_CM), 1);
  }

  function importFile(file, dropPoint) {
    if (!file) return;

    if (file.size > CONFIG.MAX_FILE_BYTES) {
      toast('El archivo supera los 12 MB. Usa un SVG o reduce el PNG.', 'error');
      return;
    }

    var isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
    var extensionOk = /\.(svg|png|jpe?g|webp)$/i.test(file.name);
    if (!isSvg && CONFIG.ACCEPTED_TYPES.indexOf(file.type) === -1 && !extensionOk) {
      toast('Formato no soportado. Usa SVG, PNG, JPG o WebP.', 'error');
      return;
    }

    var targetZone = activeZoneDef();
    var svgMeta = { aspect: null, external: false, scripts: false };
    var svgTextPromise = isSvg
      ? file.text().then(function (text) {
          svgMeta = parseSvgMeta(text);
        }).catch(function () {})
      : Promise.resolve();

    svgTextPromise.then(function () {
      return readAsDataURL(file);
    }).then(function (src) {
      return loadImage(src).then(function (image) {
        return { src: src, image: image };
      });
    }).then(function (result) {
      var src = result.src;
      var image = result.image;
      var aspect = svgMeta.aspect;
      if (!aspect && image.naturalWidth > 0 && image.naturalHeight > 0) {
        aspect = image.naturalWidth / image.naturalHeight;
      }
      if (!aspect) aspect = 1;
      aspect = util.clamp(aspect, 0.05, 20);

      var state = State.get();
      var zone = targetZone;
      var targetView = state.views[zone.view];
      var zoneState = targetView ? targetView.zones[zone.id] : null;
      if (!zoneState) {
        toast('La zona de destino ya no existe.', 'error');
        return;
      }
      State.checkpoint();

      var layer = {
        id: Schema.newId('layer'),
        type: 'image',
        name: file.name,
        visible: true,
        locked: false,
        opacity: 1,
        xCm: 0,
        yCm: 0,
        widthCm: fitWidthToZone(aspect, zone),
        aspect: aspect,
        rotation: 0,
        flipX: false,
        luminance: null,
        vector: isSvg,
        naturalWidth: image.naturalWidth || 0,
        naturalHeight: image.naturalHeight || 0,
        src: src,
        mime: file.type || (isSvg ? 'image/svg+xml' : ''),
        filename: file.name
      };

      if (dropPoint) {
        layer.xCm = util.clamp(dropPoint.x - zone.center.x, -zone.center.x, 100 - zone.center.x);
        layer.yCm = util.clamp(dropPoint.y - zone.center.y, -zone.center.y, 90 - zone.center.y);
      }

      state.shirt.side = zone.view;
      targetView.activeZone = zone.id;
      zoneState.layers.push(layer);
      zoneState.activeLayerId = layer.id;
      State.commit('design');

      if (svgMeta.external) {
        toast('El SVG referencia archivos externos. Al exportar solo se incluirá lo embebido.', 'warn');
      }
      if (svgMeta.scripts) {
        toast('El SVG contiene scripts. Se renderiza como imagen, por lo que no se ejecutan.', 'warn');
      }
      if (!isSvg && layer.naturalWidth > 0) {
        var effectiveDpi = layer.naturalWidth / (layer.widthCm / 2.54);
        if (effectiveDpi < 200) {
          toast('Resolución baja: ' + Math.round(effectiveDpi) + ' ppp efectivos a ' +
            util.formatCm(layer.widthCm) + ' cm. Usa un SVG o reduce el ancho.', 'warn', 6000);
        }
      }

      computeLuminance(src).then(function (luminance) {
        if (luminance == null) return;
        layer.luminance = luminance;
        State.save();
        checkContrast();
      }).catch(function () {
        /* La comprobación de contraste es opcional. */
      });

      toast('Capa agregada en ' + zone.label + '.', 'success');
    }).catch(function (error) {
      toast(error.message || 'No se pudo importar el diseño.', 'error');
    });
  }

  function applyZoom() {
    canvas.style.width = Math.round(BASE_WIDTH * zoom) + 'px';
    if (zoomLabel) zoomLabel.textContent = Math.round(zoom * 100) + '%';
  }

  function fit() {
    if (!stageScroll) return;
    var availableWidth = Math.max(240, stageScroll.clientWidth - 56);
    var availableHeight = Math.max(240, stageScroll.clientHeight - 56);
    var target = Math.min(availableWidth, availableHeight / 0.9);
    zoom = util.clamp(target / BASE_WIDTH, 0.3, 2.5);
    applyZoom();
  }

  function bindFileInput() {
    var input = document.getElementById('design-input');
    if (!input) return;
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      input.value = '';
      if (file) importFile(file, null);
    });
  }

  function bindDrop() {
    var target = stageScroll;
    var dropzone = document.getElementById('dropzone');
    if (!target) return;

    var allow = function (event) {
      event.preventDefault();
      event.stopPropagation();
    };

    target.addEventListener('dragover', function (event) {
      allow(event);
      if (stage) stage.classList.add('dragover');
    });
    target.addEventListener('dragleave', function () {
      if (stage) stage.classList.remove('dragover');
    });
    target.addEventListener('drop', function (event) {
      allow(event);
      if (stage) stage.classList.remove('dragover');
      var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (!file) return;
      importFile(file, clientToCm(event));
    });

    if (dropzone) {
      dropzone.addEventListener('dragover', function (event) {
        allow(event);
        dropzone.classList.add('dragover');
      });
      dropzone.addEventListener('dragleave', function () {
        dropzone.classList.remove('dragover');
      });
      dropzone.addEventListener('drop', function (event) {
        allow(event);
        dropzone.classList.remove('dragover');
        var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
        if (file) importFile(file, null);
      });
    }

    ['dragover', 'drop'].forEach(function (type) {
      document.addEventListener(type, function (event) {
        event.preventDefault();
      });
    });
  }

  function selectZone(zoneId) {
    var view = viewState();
    if (view.activeZone === zoneId) return;
    view.activeZone = zoneId;
    var zoneState = view.zones[zoneId];
    if (zoneState && zoneState.layers.length && !zoneState.activeLayerId) {
      zoneState.activeLayerId = zoneState.layers[zoneState.layers.length - 1].id;
    }
    State.commit('design');
  }

  function selectLayer(layerId) {
    var found = findLayer(layerId);
    if (!found) return;
    var view = viewState();
    view.activeZone = found.zone.id;
    found.zoneState.activeLayerId = layerId;
    State.commit('design');
  }

  function toggleLayerVisibility(layerId) {
    var found = findLayer(layerId);
    if (!found) return;
    State.checkpoint();
    found.layer.visible = !found.layer.visible;
    State.commit('design');
  }

  function removeActiveLayer() {
    var zone = activeZoneState();
    var layer = activeLayer();
    if (!zone || !layer || layer.locked) return;
    State.checkpoint();
    zone.layers = zone.layers.filter(function (item) { return item.id !== layer.id; });
    zone.activeLayerId = zone.layers.length ? zone.layers[zone.layers.length - 1].id : null;
    State.commit('design');
    toast('Capa eliminada.', 'info');
  }

  function duplicateActiveLayer() {
    var zone = activeZoneState();
    var layer = activeLayer();
    if (!zone || !layer || layer.locked) return;
    State.checkpoint();
    var copy = JSON.parse(JSON.stringify(layer));
    copy.id = Schema.newId('layer');
    copy.name = layer.name + ' copia';
    copy.xCm = layer.xCm + 1;
    copy.yCm = layer.yCm + 1;
    var index = zone.layers.indexOf(layer);
    zone.layers.splice(index + 1, 0, copy);
    zone.activeLayerId = copy.id;
    State.commit('design');
  }

  function moveActiveLayer(direction) {
    var zone = activeZoneState();
    var layer = activeLayer();
    if (!zone || !layer || layer.locked) return;
    var index = zone.layers.indexOf(layer);
    var target = index + direction;
    if (target < 0 || target >= zone.layers.length) return;
    State.checkpoint();
    zone.layers.splice(index, 1);
    zone.layers.splice(target, 0, layer);
    State.commit('design');
  }

  function toggleActiveLock() {
    var layer = activeLayer();
    if (!layer) return;
    State.checkpoint();
    layer.locked = !layer.locked;
    State.commit('design');
  }

  function bindControls() {
    Array.prototype.forEach.call(document.querySelectorAll('#side-toggle [data-side]'), function (button) {
      button.addEventListener('click', function () {
        State.get().shirt.side = button.dataset.side;
        State.commit('design');
        checkContrast();
      });
    });

    var colorInput = document.getElementById('shirt-color');
    if (colorInput) {
      colorInput.addEventListener('change', function () {
        State.checkpoint();
        State.get().shirt.color = colorInput.value;
        State.commit('design');
        checkContrast();
      });
    }

    var zoneList = document.getElementById('zone-list');
    if (zoneList) {
      zoneList.addEventListener('click', function (event) {
        var button = event.target.closest('[data-zone]');
        if (button) selectZone(button.getAttribute('data-zone'));
      });
    }

    var layerList = document.getElementById('layer-list');
    if (layerList) {
      layerList.addEventListener('click', function (event) {
        var eye = event.target.closest('[data-layer-visible]');
        if (eye) {
          toggleLayerVisibility(eye.getAttribute('data-layer-visible'));
          return;
        }
        var select = event.target.closest('[data-layer-select]');
        if (select) selectLayer(select.getAttribute('data-layer-select'));
      });
    }

    var widthRange = document.getElementById('width-range');
    var widthNumber = document.getElementById('width-number');
    var rotRange = document.getElementById('rot-range');
    var rotNumber = document.getElementById('rot-number');
    var widthEditing = false;
    var rotationEditing = false;

    function setWidth(value, commit) {
      var layer = activeLayer();
      if (!layer || layer.locked) return;
      if (commit) {
        if (!widthEditing) State.checkpoint();
        widthEditing = false;
      } else if (!widthEditing) {
        State.checkpoint();
        widthEditing = true;
      }
      var maxWidth = Math.min(CONFIG.MAX_DESIGN_WIDTH_CM, CONFIG.MAX_DESIGN_HEIGHT_CM * layer.aspect);
      layer.widthCm = util.round(util.clamp(util.toNumber(value, layer.widthCm), 2, maxWidth), 1);
      if (commit) State.commit('design');
      else State.live();
    }

    if (widthRange) {
      widthRange.addEventListener('input', function () { setWidth(widthRange.value, false); });
      widthRange.addEventListener('change', function () { setWidth(widthRange.value, true); });
    }
    if (widthNumber) {
      widthNumber.addEventListener('change', function () { setWidth(widthNumber.value, true); });
    }

    function setRotation(value, commit) {
      var layer = activeLayer();
      if (!layer || layer.locked) return;
      if (commit) {
        if (!rotationEditing) State.checkpoint();
        rotationEditing = false;
      } else if (!rotationEditing) {
        State.checkpoint();
        rotationEditing = true;
      }
      layer.rotation = util.round(util.clamp(util.toNumber(value, layer.rotation), -180, 180), 1);
      if (commit) State.commit('design');
      else State.live();
    }

    if (rotRange) {
      rotRange.addEventListener('input', function () { setRotation(rotRange.value, false); });
      rotRange.addEventListener('change', function () { setRotation(rotRange.value, true); });
    }
    if (rotNumber) {
      rotNumber.addEventListener('change', function () { setRotation(rotNumber.value, true); });
    }

    var flip = document.getElementById('btn-flip');
    if (flip) {
      flip.addEventListener('click', function () {
        var layer = activeLayer();
        if (!layer || layer.locked) return;
        State.checkpoint();
        layer.flipX = !layer.flipX;
        State.commit('design');
      });
    }

    var center = document.getElementById('btn-center');
    if (center) {
      center.addEventListener('click', function () {
        var layer = activeLayer();
        if (!layer || layer.locked) return;
        State.checkpoint();
        layer.xCm = 0;
        layer.yCm = 0;
        State.commit('design');
      });
    }

    var remove = document.getElementById('btn-remove');
    if (remove) remove.addEventListener('click', removeActiveLayer);

    var duplicate = document.getElementById('btn-duplicate');
    if (duplicate) duplicate.addEventListener('click', duplicateActiveLayer);

    var up = document.getElementById('btn-layer-up');
    if (up) up.addEventListener('click', function () { moveActiveLayer(1); });

    var down = document.getElementById('btn-layer-down');
    if (down) down.addEventListener('click', function () { moveActiveLayer(-1); });

    var lock = document.getElementById('btn-lock');
    if (lock) lock.addEventListener('click', toggleActiveLock);

    ['guide-zone', 'guide-safe', 'guide-center'].forEach(function (id) {
      var input = document.getElementById(id);
      if (!input) return;
      input.addEventListener('change', function () {
        var state = State.get();
        state.guides.zone = document.getElementById('guide-zone').checked;
        state.guides.safe = document.getElementById('guide-safe').checked;
        state.guides.center = document.getElementById('guide-center').checked;
        State.commit('design');
      });
    });

    var zoomIn = document.getElementById('zoom-in');
    var zoomOut = document.getElementById('zoom-out');
    var zoomFit = document.getElementById('zoom-fit');
    if (zoomIn) {
      zoomIn.addEventListener('click', function () {
        zoom = util.clamp(zoom * 1.15, 0.3, 2.5);
        applyZoom();
      });
    }
    if (zoomOut) {
      zoomOut.addEventListener('click', function () {
        zoom = util.clamp(zoom / 1.15, 0.3, 2.5);
        applyZoom();
      });
    }
    if (zoomFit) zoomFit.addEventListener('click', fit);

    document.addEventListener('keydown', function (event) {
      var target = event.target;
      var typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' || target.isContentEditable);
      if (typing) return;
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (activeLayer()) {
          event.preventDefault();
          removeActiveLayer();
        }
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
        if (activeLayer()) {
          event.preventDefault();
          duplicateActiveLayer();
        }
      }
    });
  }

  function init() {
    canvas = document.getElementById('canvas');
    stage = document.querySelector('.stage');
    stageScroll = document.getElementById('stage-scroll');
    zoomLabel = document.getElementById('zoom-label');

    renderSwatches();
    bindFileInput();
    bindDrop();
    bindControls();

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    render();
    fit();
  }

  global.MS.Editor = {
    init: init,
    render: render,
    sync: sync,
    fit: fit
  };
})(window);
