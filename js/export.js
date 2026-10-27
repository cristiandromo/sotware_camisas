/*
 * Exportacion de mockups y archivos de produccion.
 *
 * Un mockup compone todas las zonas visibles de una vista. Un archivo de
 * produccion compone solo las capas de la zona activa, recortadas a la caja
 * envolvente comun y rasterizadas a 300 ppp con fondo transparente.
 */
(function (global) {
  'use strict';

  var CONFIG = global.MS.CONFIG;
  var util = global.MS.util;
  var Shirt = global.MS.Shirt;
  var Catalog = global.MS.Catalog;

  var mockupCache = new Map();
  var MAX_CACHE = 12;

  function toasts() {
    return global.MS.App && global.MS.App.toast ? global.MS.App.toast : function () {};
  }

  function escapeAttr(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function svgDataUrl(svg) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('No se pudo cargar la imagen para exportar.')); };
      img.src = src;
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob);
        else reject(new Error('El navegador no pudo generar el archivo.'));
      }, type, quality);
    });
  }

  var CRC_TABLE = (function () {
    var table = [];
    for (var n = 0; n < 256; n += 1) {
      var c = n;
      for (var k = 0; k < 8; k += 1) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i += 1) {
      crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  /* Canvas no escribe densidad en el PNG. Insertar pHYs evita que el taller
     interprete el archivo como 72/96 ppp aunque los pixeles sean correctos. */
  function addPngDpi(blob, dpi) {
    if (!blob || blob.type !== 'image/png') return Promise.resolve(blob);
    return blob.arrayBuffer().then(function (buffer) {
      var bytes = new Uint8Array(buffer);
      var isPng = bytes.length > 33 &&
        bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
      var isIhdr = bytes[12] === 0x49 && bytes[13] === 0x48 && bytes[14] === 0x44 && bytes[15] === 0x52;
      if (!isPng || !isIhdr) return blob;

      var ppm = Math.round(dpi / 0.0254);
      var chunk = new Uint8Array(4 + 4 + 9 + 4);
      var view = new DataView(chunk.buffer);
      view.setUint32(0, 9);
      chunk[4] = 0x70; chunk[5] = 0x48; chunk[6] = 0x59; chunk[7] = 0x73;
      view.setUint32(8, ppm);
      view.setUint32(12, ppm);
      chunk[16] = 1;
      view.setUint32(17, crc32(chunk.subarray(4, 17)));

      var out = new Uint8Array(bytes.length + chunk.length);
      out.set(bytes.subarray(0, 33), 0);
      out.set(chunk, 33);
      out.set(bytes.subarray(33), 33 + chunk.length);
      return new Blob([out], { type: 'image/png' });
    });
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    global.setTimeout(function () { URL.revokeObjectURL(url); }, 1200);
  }

  function designSize(design) {
    var width = design.widthCm;
    return { w: width, h: width / design.aspect };
  }

  function designBox(design) {
    var size = designSize(design);
    return util.rotatedBox(size.w, size.h, util.toNumber(design.rotation, 0));
  }

  function layerSize(layer) {
    var width = layer.widthCm;
    return { w: width, h: width / layer.aspect };
  }

  function layerBox(layer) {
    var size = layerSize(layer);
    return util.rotatedBox(size.w, size.h, util.toNumber(layer.rotation, 0));
  }

  function isExportable(layer) {
    return layer && layer.type !== 'text' && layer.visible !== false && layer.opacity > 0;
  }

  function visibleLayers(zone) {
    return zone && Array.isArray(zone.layers)
      ? zone.layers.filter(isExportable)
      : [];
  }

  function zoneLayers(state, side, zoneId) {
    var view = state.views && state.views[side];
    var zone = view && view.zones && view.zones[zoneId];
    return visibleLayers(zone);
  }

  function activeZoneId(state) {
    var view = state.views && state.views[state.shirt.side];
    return view ? view.activeZone : Catalog.defaultZone(state.shirt.side);
  }

  function unionBox(layers) {
    if (!layers || !layers.length) return null;
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;

    layers.forEach(function (layer) {
      var box = layerBox(layer);
      minX = Math.min(minX, layer.xCm - box.w / 2);
      minY = Math.min(minY, layer.yCm - box.h / 2);
      maxX = Math.max(maxX, layer.xCm + box.w / 2);
      maxY = Math.max(maxY, layer.yCm + box.h / 2);
    });

    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  function layerMarkup(layer, centerX, centerY, scale) {
    var size = layerSize(layer);
    var w = size.w * scale;
    var h = size.h * scale;
    var transform = 'translate(' + (centerX * scale) + ' ' + (centerY * scale) + ') ' +
      'rotate(' + util.toNumber(layer.rotation, 0) + ') ' +
      'scale(' + (layer.flipX ? -1 : 1) + ' 1)';
    var opacity = typeof layer.opacity === 'number' && layer.opacity < 1
      ? ' opacity="' + layer.opacity + '"'
      : '';

    return '<g transform="' + transform + '"' + opacity + '>' +
      '<image x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h + '" ' +
        'href="' + escapeAttr(layer.src) + '" preserveAspectRatio="xMidYMid meet"/>' +
      '</g>';
  }

  function singleDesignMarkup(design) {
    var size = designSize(design);
    var w = size.w * CONFIG.CM_PX;
    var h = size.h * CONFIG.CM_PX;
    var transform = 'translate(' + (design.cxCm * CONFIG.CM_PX) + ' ' + (design.cyCm * CONFIG.CM_PX) + ') ' +
      'rotate(' + util.toNumber(design.rotation, 0) + ') ' +
      'scale(' + (design.flipX ? -1 : 1) + ' 1)';

    return '<g transform="' + transform + '">' +
      '<image x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h + '" ' +
        'href="' + escapeAttr(design.src) + '" preserveAspectRatio="xMidYMid meet"/>' +
      '</g>';
  }

  function viewContent(state, side) {
    var parts = [];
    Catalog.forView(side).forEach(function (zone) {
      var zoneState = state.views[side] && state.views[side].zones[zone.id];
      visibleLayers(zoneState).forEach(function (layer) {
        parts.push(layerMarkup(
          layer,
          zone.center.x + layer.xCm,
          zone.center.y + layer.yCm,
          CONFIG.CM_PX
        ));
      });
    });
    return parts.join('');
  }

  function productionSVGFromLayers(layers, units) {
    var box = unionBox(layers);
    if (!box) return null;
    var boxW = util.round(box.w, 3);
    var boxH = util.round(box.h, 3);
    var pxW = util.pxForPrint(boxW);
    var pxH = util.pxForPrint(boxH);
    var width = units === 'cm' ? boxW + 'cm' : pxW;
    var height = units === 'cm' ? boxH + 'cm' : pxH;
    var content = layers.map(function (layer) {
      return layerMarkup(layer, layer.xCm - box.x, layer.yCm - box.y, 1);
    }).join('');

    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" ' +
        'viewBox="0 0 ' + boxW + ' ' + boxH + '">' +
        content +
      '</svg>';
  }

  function productionSVG(design, units) {
    var layer = {
      id: 'legacy',
      type: 'image',
      src: design.src,
      widthCm: design.widthCm,
      aspect: design.aspect,
      xCm: 0,
      yCm: 0,
      rotation: design.rotation,
      flipX: design.flipX,
      opacity: 1,
      visible: true
    };
    return productionSVGFromLayers([layer], units);
  }

  function productionCanvasFromLayers(layers) {
    var box = unionBox(layers);
    if (!box) return Promise.reject(new Error('No hay capas visibles para exportar.'));

    var pxW = util.pxForPrint(box.w);
    var pxH = util.pxForPrint(box.h);
    if (pxW * pxH > 120000000) {
      return Promise.reject(new Error('El archivo de producción es demasiado grande. Reduce el tamaño del diseño.'));
    }

    var svg = productionSVGFromLayers(layers, 'px');
    return loadImage(svgDataUrl(svg)).then(function (img) {
      var canvas = document.createElement('canvas');
      canvas.width = pxW;
      canvas.height = pxH;
      var ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, pxW, pxH);
      ctx.drawImage(img, 0, 0, pxW, pxH);
      return canvas;
    });
  }

  function productionCanvas(design) {
    var layer = {
      id: 'legacy',
      type: 'image',
      src: design.src,
      widthCm: design.widthCm,
      aspect: design.aspect,
      xCm: 0,
      yCm: 0,
      rotation: design.rotation,
      flipX: design.flipX,
      opacity: 1,
      visible: true
    };
    return productionCanvasFromLayers([layer]);
  }

  function productionBlobFromLayers(layers) {
    return productionCanvasFromLayers(layers).then(function (canvas) {
      return canvasToBlob(canvas, 'image/png');
    }).then(function (blob) {
      return addPngDpi(blob, CONFIG.DPI);
    });
  }

  function productionBlob(design) {
    return productionCanvas(design).then(function (canvas) {
      return canvasToBlob(canvas, 'image/png');
    }).then(function (blob) {
      return addPngDpi(blob, CONFIG.DPI);
    });
  }

  function renderMockupCanvas(side, options) {
    options = options || {};
    var state = global.MS.State.get();
    var contractDesign = options.design !== undefined ? options.design : null;
    var color = options.shirtColor || state.shirt.color;
    var width = options.width || 1600;
    var background = options.background === undefined ? '#F4F6F9' : options.background;
    var content = contractDesign ? singleDesignMarkup(contractDesign) : viewContent(state, side);
    var svg = Shirt.svg(side, color, content, { width: width, background: background });

    return loadImage(svgDataUrl(svg)).then(function (img) {
      var canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = Math.round(width * 0.9);
      var ctx = canvas.getContext('2d');
      if (background) {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas;
    });
  }

  function layerSignature(layer) {
    return [
      layer.id,
      layer.type,
      layer.visible,
      layer.opacity,
      layer.widthCm,
      layer.aspect,
      layer.xCm,
      layer.yCm,
      layer.rotation,
      layer.flipX,
      layer.src ? layer.src.length : 0,
      layer.src ? layer.src.slice(0, 36) : '',
      layer.src ? layer.src.slice(-36) : ''
    ].join(',');
  }

  function viewSignature(state, side) {
    return Catalog.forView(side).map(function (zone) {
      var zoneState = state.views[side] && state.views[side].zones[zone.id];
      var layers = zoneState && Array.isArray(zoneState.layers) ? zoneState.layers : [];
      return zone.id + ':' + layers.map(layerSignature).join('|');
    }).join(';');
  }

  function mockupDataURL(side, options) {
    options = options || {};
    var state = global.MS.State.get();
    var design = options.design;
    var color = options.shirtColor || state.shirt.color;
    var width = options.width || 1200;
    var background = options.background === undefined ? '#F4F6F9' : options.background;
    var signature = design
      ? [design.src.length, design.src.slice(0, 36), design.src.slice(-36), design.widthCm, design.aspect, design.cxCm, design.cyCm, design.rotation, design.flipX].join(',')
      : viewSignature(state, side);
    var key = [side, width, background || 'transparent', color, signature].join('::');

    if (mockupCache.has(key)) return mockupCache.get(key);

    var promise = renderMockupCanvas(side, {
      design: design,
      shirtColor: color,
      width: width,
      background: background
    }).then(function (canvas) {
      return canvas.toDataURL('image/png');
    });

    mockupCache.set(key, promise);
    if (mockupCache.size > MAX_CACHE) {
      var oldest = mockupCache.keys().next().value;
      mockupCache.delete(oldest);
    }

    promise.catch(function () { mockupCache.delete(key); });
    return promise;
  }

  function baseName() {
    var state = global.MS.State.get();
    return util.slug([state.project.code, state.project.name].filter(Boolean).join('-'));
  }

  function sideName(side) {
    return side === 'back' ? 'espalda' : 'frente';
  }

  function currentZone() {
    var state = global.MS.State.get();
    var zoneId = activeZoneId(state);
    return { state: state, zoneId: zoneId, def: Catalog.byId(zoneId) };
  }

  function downloadMockup(side, format) {
    var state = global.MS.State.get();
    var hasLayers = Catalog.forView(side).some(function (zone) {
      var zoneState = state.views[side] && state.views[side].zones[zone.id];
      return visibleLayers(zoneState).length > 0;
    });
    if (!hasLayers) {
      toasts()('No hay capas visibles en la vista ' + sideName(side) + '.', 'warn');
      return;
    }

    var isJpg = format === 'jpg';
    var choice = document.getElementById('mockup-bg');
    var transparent = !isJpg && choice && choice.value === 'transparent';
    var background = transparent ? null : '#F4F6F9';
    var type = isJpg ? 'image/jpeg' : 'image/png';

    renderMockupCanvas(side, {
      width: CONFIG.SHIRT.mockupWidth,
      background: background
    }).then(function (canvas) {
      return canvasToBlob(canvas, type, isJpg ? 0.92 : undefined);
    }).then(function (blob) {
      downloadBlob(blob, baseName() + '_' + sideName(side) + '_mockup.' + (isJpg ? 'jpg' : 'png'));
      toasts()('Mockup generado.', 'success');
    }).catch(function (error) {
      toasts()(error.message, 'error');
    });
  }

  function downloadProduction(side) {
    var current = currentZone();
    var layers = zoneLayers(current.state, side, current.zoneId);
    if (!layers.length) {
      toasts()('No hay capas visibles en la zona ' + (current.def ? current.def.label : current.zoneId) + '.', 'warn');
      return;
    }

    productionBlobFromLayers(layers).then(function (blob) {
      downloadBlob(blob, baseName() + '_' + sideName(side) + '_' + util.slug(current.def.label) + '_produccion_300dpi.png');
      toasts()('PNG de producción generado a 300 ppp.', 'success');
    }).catch(function (error) {
      toasts()(error.message, 'error');
    });
  }

  function downloadProductionSVG(side) {
    var current = currentZone();
    var layers = zoneLayers(current.state, side, current.zoneId);
    if (!layers.length) {
      toasts()('No hay capas visibles en la zona ' + (current.def ? current.def.label : current.zoneId) + '.', 'warn');
      return;
    }

    var svg = productionSVGFromLayers(layers, 'cm');
    var blob = new Blob([svg], { type: 'image/svg+xml' });
    downloadBlob(blob, baseName() + '_' + sideName(side) + '_' + util.slug(current.def.label) + '_produccion.svg');
    toasts()('SVG editable generado.', 'success');
  }

  function setDisabled(id, disabled) {
    var el = document.getElementById(id);
    if (el) el.disabled = disabled;
  }

  function resolutionLabel(layers) {
    var raster = layers.filter(function (layer) { return !layer.vector && layer.naturalWidth > 0; });
    if (!raster.length) {
      return layers.some(function (layer) { return layer.vector; })
        ? 'Vectorial (sin pérdida)'
        : 'Desconocida';
    }
    var minDpi = Math.round(Math.min.apply(null, raster.map(function (layer) {
      return layer.naturalWidth / (layer.widthCm / 2.54);
    })));
    return minDpi + ' ppp efectivos' + (minDpi < 300 ? ' (baja)' : '');
  }

  function sync() {
    var current = currentZone();
    var layers = zoneLayers(current.state, current.state.shirt.side, current.zoneId);
    var readout = document.getElementById('prod-readout');
    var hasLayers = layers.length > 0;

    setDisabled('btn-prod-png', !hasLayers);
    setDisabled('btn-prod-svg', !hasLayers);
    var viewHasLayers = Catalog.forView(current.state.shirt.side).some(function (zone) {
      var zoneState = current.state.views[current.state.shirt.side].zones[zone.id];
      return visibleLayers(zoneState).length > 0;
    });
    setDisabled('btn-mockup-png', !viewHasLayers);
    setDisabled('btn-mockup-jpg', !viewHasLayers);

    if (!readout) return;
    if (!hasLayers) {
      readout.textContent = 'Sin capas visibles en ' + (current.def ? current.def.label : 'esta zona') + '.';
      return;
    }

    var box = unionBox(layers);
    readout.innerHTML =
      '<strong>' + escapeAttr(current.def.label) + '</strong> &middot; ' + layers.length +
        (layers.length === 1 ? ' capa' : ' capas') + '<br>' +
      'Tamaño: ' + util.formatCm(box.w) + ' x ' + util.formatCm(box.h) + ' cm<br>' +
      util.pxForPrint(box.w) + ' x ' + util.pxForPrint(box.h) + ' px a ' + CONFIG.DPI + ' ppp<br>' +
      'Resolución: ' + resolutionLabel(layers);
  }

  function init() {
    var bind = function (id, handler) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('click', handler);
    };

    var side = function () { return global.MS.State.get().shirt.side; };

    bind('btn-mockup-png', function () { downloadMockup(side(), 'png'); });
    bind('btn-mockup-jpg', function () { downloadMockup(side(), 'jpg'); });
    bind('btn-prod-png', function () { downloadProduction(side()); });
    bind('btn-prod-svg', function () { downloadProductionSVG(side()); });
    bind('btn-open-techpack', function () {
      if (global.MS.App && global.MS.App.showTab) global.MS.App.showTab('techpack');
    });
  }

  global.MS.Exporter = {
    init: init,
    sync: sync,
    designSize: designSize,
    designBox: designBox,
    layerSize: layerSize,
    layerBox: layerBox,
    unionBox: unionBox,
    zoneLayers: zoneLayers,
    visibleLayers: visibleLayers,
    activeZoneId: activeZoneId,
    productionSVG: productionSVG,
    productionSVGFromLayers: productionSVGFromLayers,
    productionCanvas: productionCanvas,
    productionCanvasFromLayers: productionCanvasFromLayers,
    productionBlob: productionBlob,
    productionBlobFromLayers: productionBlobFromLayers,
    renderMockupCanvas: renderMockupCanvas,
    mockupDataURL: mockupDataURL,
    downloadMockup: downloadMockup,
    downloadProduction: downloadProduction,
    downloadProductionSVG: downloadProductionSVG,
    resolutionLabel: resolutionLabel,
    clearCache: function () { mockupCache.clear(); },
    baseName: baseName
  };
})(window);
