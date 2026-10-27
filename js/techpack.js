/*
 * Ficha tecnica de estampado.
 *
 * El documento se genera como HTML autocontenido (mockups en data URL) y se
 * muestra en un iframe. El PDF se obtiene con el dialogo de impresion del
 * navegador, sin dependencias externas.
 */
(function (global) {
  'use strict';

  var CONFIG = global.MS.CONFIG;
  var util = global.MS.util;
  var State = global.MS.State;

  var frame;
  var previewStatus;
  var previewTimer = null;
  var previewSequence = 0;

  function toast(message, type) {
    if (global.MS.App && global.MS.App.toast) global.MS.App.toast(message, type);
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function isActive() {
    var view = document.getElementById('view-techpack');
    return Boolean(view && view.classList.contains('active'));
  }

  function setPreviewStatus(text) {
    if (previewStatus) previewStatus.textContent = text || '';
  }

  function sideLabel(side) {
    return side === 'back' ? 'Espalda' : 'Frente';
  }

  function activePlacements(state) {
    var items = [];
    ['front', 'back'].forEach(function (side) {
      global.MS.Catalog.forView(side).forEach(function (zone) {
        var layers = global.MS.Exporter.zoneLayers(state, side, zone.id);
        if (!layers.length) return;
        items.push({
          side: side,
          zone: zone,
          layers: layers,
          box: global.MS.Exporter.unionBox(layers)
        });
      });
    });
    return items;
  }

  function colorLabel(hex) {
    var name = util.colorName(hex);
    return name.toUpperCase() === String(hex).toUpperCase()
      ? String(hex).toUpperCase()
      : name + ' (' + String(hex).toUpperCase() + ')';
  }

  function row(label, value) {
    if (!value) return '';
    return '<tr><th>' + esc(label) + '</th><td>' + value + '</td></tr>';
  }

  function buildDoc(options) {
    options = options || {};
    var preview = Boolean(options.preview);
    var state = State.get();
    var tp = state.techpack;
    var placements = activePlacements(state);
    var imageSides = ['front', 'back'].filter(function (side) {
      return placements.some(function (item) { return item.side === side; });
    });
    var width = preview ? 900 : 1500;

    var imagePromises = imageSides.map(function (side) {
      return global.MS.Exporter.mockupDataURL(side, {
        width: width,
        background: '#F4F6F9'
      }).then(function (url) {
        return { side: side, url: url };
      });
    });

    return Promise.all(imagePromises).then(function (mockups) {
      var mockupHTML = mockups.map(function (item) {
        return '<figure><img src="' + esc(item.url) + '" alt="Mockup ' + sideLabel(item.side) + '">' +
          '<figcaption>' + sideLabel(item.side) + '</figcaption></figure>';
      }).join('');

      var printSizes = placements.map(function (item) {
        var box = item.box;
        var pxW = util.pxForPrint(box.w);
        var pxH = util.pxForPrint(box.h);
        var detail = sideLabel(item.side) + ' · ' + item.zone.label + ': ' +
          util.formatCm(box.w) + ' x ' + util.formatCm(box.h) + ' cm (' +
          pxW + ' x ' + pxH + ' px a ' + CONFIG.DPI + ' ppp). ' +
          item.layers.length + (item.layers.length === 1 ? ' capa' : ' capas') + '. ' +
          global.MS.Exporter.resolutionLabel(item.layers);
        return detail;
      }).join('<br>');

      var placementText = tp.placement
        ? esc(tp.placement)
        : placements.map(function (item) {
            return esc(sideLabel(item.side) + ' · ' + item.zone.label + ' (' +
              item.layers.length + (item.layers.length === 1 ? ' capa' : ' capas') + ')');
          }).join('<br>');

      var title = state.project.name || 'Diseño sin nombre';
      var code = state.project.code || '';
      var brand = tp.brand || '';

      var productRows =
        row('Marca', esc(brand)) +
        row('Nombre', esc(title)) +
        row('Código', esc(code)) +
        row('Prenda', esc(tp.garment)) +
        row('Tejido', esc(tp.fabric)) +
        row('Color', esc(colorLabel(state.shirt.color))) +
        row('Tallas', esc(tp.sizes)) +
        row('Cantidad', esc(tp.quantity));

      var printRows =
        row('Técnica', esc(tp.technique)) +
        row('Ubicación', placementText) +
        row('Tamaño de estampado', printSizes) +
        row('Archivo', 'PNG RGB 300 ppp, fondo transparente') +
        row('Contacto / taller', esc(tp.contact)) +
        row('Fecha', esc(tp.date));

      var identityRow = tp.brandIdentity
        ? '<section class="card"><h2>Identidad de marca</h2><p>' + esc(tp.brandIdentity) + '</p></section>'
        : '';

      var notesRow = tp.notes
        ? '<section class="card"><h2>Notas de producción</h2><p>' + esc(tp.notes) + '</p></section>'
        : '';

      var mockupSection = mockupHTML
        ? '<section class="card"><h2>Mockups</h2><div class="mockups">' + mockupHTML + '</div></section>'
        : '<section class="card"><h2>Mockups</h2><p class="muted">Este proyecto todavía no tiene diseños.</p></section>';

      var generated = new Date().toLocaleString('es-CO', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
      });

      return '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">' +
        '<title>Ficha técnica - ' + esc(title) + '</title>' +
        '<style>' + docStyles() + '</style></head><body><main class="doc">' +
          '<header class="doc-head">' +
            '<div>' +
              '<div class="kicker">Ficha técnica de estampado</div>' +
              '<h1>' + esc(title) + '</h1>' +
              (code ? '<div class="code">' + esc(code) + '</div>' : '') +
            '</div>' +
            '<div class="brand">' + esc(brand || 'Sin marca') + '</div>' +
          '</header>' +
          '<div class="grid">' +
            '<section class="card"><h2>Producto</h2><table>' + productRows + '</table></section>' +
            '<section class="card"><h2>Estampado</h2><table>' + printRows + '</table></section>' +
          '</div>' +
          mockupSection +
          identityRow +
          notesRow +
          '<footer>Generado con Mockup Studio &middot; ' + esc(generated) +
            ' &middot; Los mockups son orientativos; el archivo de producción es el PNG de 300 ppp.</footer>' +
        '</main></body></html>';
    });
  }

  function docStyles() {
    return '' +
      '*{box-sizing:border-box}' +
      'body{margin:0;padding:28px;background:#fff;color:#15202b;' +
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,sans-serif;font-size:12px;line-height:1.45}' +
      '.doc{max-width:860px;margin:0 auto}' +
      '.doc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;' +
        'padding-bottom:14px;border-bottom:2px solid #15202b;margin-bottom:16px}' +
      '.kicker{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#5b6b7c;font-weight:700}' +
      'h1{margin:3px 0 2px;font-size:26px;line-height:1.15}' +
      '.code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;color:#5b6b7c}' +
      '.brand{max-width:220px;text-align:right;font-size:13px;font-weight:700}' +
      '.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}' +
      '.card{border:1px solid #d8dee6;border-radius:8px;padding:14px 16px;margin-bottom:14px;break-inside:avoid}' +
      'h2{margin:0 0 9px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#5b6b7c}' +
      'table{width:100%;border-collapse:collapse;table-layout:fixed}' +
      'th{width:37%;padding:5px 8px 5px 0;text-align:left;vertical-align:top;font-size:10.5px;' +
        'font-weight:600;color:#5b6b7c;border-bottom:1px solid #eef1f5}' +
      'td{padding:5px 0;vertical-align:top;font-size:11.5px;border-bottom:1px solid #eef1f5;overflow-wrap:anywhere}' +
      'tr:last-child th,tr:last-child td{border-bottom:0}' +
      'p{margin:0;font-size:11.5px;white-space:pre-wrap}' +
      '.muted{color:#7b8794}' +
      '.mockups{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}' +
      'figure{margin:0}' +
      'figure img{display:block;width:auto;max-width:100%;max-height:340px;margin:0 auto;border:1px solid #e2e7ee;border-radius:6px;background:#f4f6f9}' +
      'figcaption{margin-top:5px;font-size:10.5px;color:#5b6b7c;text-align:center}' +
      'footer{margin-top:18px;padding-top:10px;border-top:1px solid #e2e7ee;font-size:9.5px;color:#7b8794}' +
      '@page{size:A4;margin:12mm}' +
      '@media print{body{padding:0}.doc{max-width:none}.card{break-inside:avoid}}';
  }

  function renderForm() {
    var state = State.get();
    Array.prototype.forEach.call(document.querySelectorAll('[data-field]'), function (input) {
      var key = input.dataset.field;
      var value = state.techpack[key];
      if (value == null) value = '';
      if (input.tagName === 'SELECT') {
        var options = Array.prototype.map.call(input.options, function (option) { return option.value; });
        if (options.indexOf(value) === -1) value = options[0] || '';
      }
      input.value = value;
    });
  }

  function schedulePreview(delay) {
    if (!isActive()) return;
    if (previewTimer) global.clearTimeout(previewTimer);
    setPreviewStatus('Pendiente de actualizar');
    previewTimer = global.setTimeout(updatePreview, delay == null ? 450 : delay);
  }

  function updatePreview() {
    if (!isActive()) return;
    var sequence = ++previewSequence;
    setPreviewStatus('Generando...');

    buildDoc({ preview: true }).then(function (doc) {
      if (sequence !== previewSequence) return;
      frame.srcdoc = doc;
      var time = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
      setPreviewStatus('Actualizado ' + time);
    }).catch(function (error) {
      if (sequence !== previewSequence) return;
      setPreviewStatus('Error al generar');
      toast(error.message || 'No se pudo generar la ficha técnica.', 'error');
    });
  }

  function loadFrame(doc) {
    return new Promise(function (resolve) {
      frame.onload = function () {
        frame.onload = null;
        resolve();
      };
      frame.srcdoc = doc;
    });
  }

  function printDoc() {
    setPreviewStatus('Preparando impresion...');
    buildDoc({ preview: false }).then(function (doc) {
      return loadFrame(doc);
    }).then(function () {
      setPreviewStatus('Listo para imprimir');
      try {
        frame.contentWindow.focus();
        frame.contentWindow.print();
      } catch (error) {
        toast('El navegador bloqueo la impresion. Usa Ctrl+P en la vista previa.', 'warn');
      }
    }).catch(function (error) {
      setPreviewStatus('Error al generar');
      toast(error.message || 'No se pudo preparar la impresion.', 'error');
    });
  }

  function downloadHTML() {
    buildDoc({ preview: false }).then(function (doc) {
      var blob = new Blob([doc], { type: 'text/html;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = global.MS.Exporter.baseName() + '_ficha_tecnica.html';
      document.body.appendChild(link);
      link.click();
      link.remove();
      global.setTimeout(function () { URL.revokeObjectURL(url); }, 1200);
      toast('Ficha técnica descargada.', 'success');
    }).catch(function (error) {
      toast(error.message || 'No se pudo generar la ficha técnica.', 'error');
    });
  }

  function importBrand(file) {
    if (!file) return;
    file.text().then(function (text) {
      var parsed = JSON.parse(text);
      var data = parsed.data || parsed;
      var state = State.get();
      var brand = data.brand_name || data.naming_final || data.name || '';

      if (brand) state.techpack.brand = String(brand);

      var identity = [];
      if (Array.isArray(data.color_palette)) {
        var palette = data.color_palette.map(function (color) {
          if (!color || typeof color !== 'object') return '';
          return [color.name, color.hex].filter(Boolean).join(': ');
        }).filter(Boolean);
        if (palette.length) identity.push('Paleta: ' + palette.join(' | '));
      }

      var typography = [data.type_primary, data.type_secondary].filter(Boolean);
      if (typography.length) identity.push('Tipografía: ' + typography.join(' / '));

      if (identity.length) {
        state.techpack.brandIdentity = identity.join('. ');
      }

      if (!state.project.name && data.tech_name) state.project.name = String(data.tech_name);
      if (!state.project.code && data.tech_code) state.project.code = String(data.tech_code);

      State.commit('techpack');
      renderForm();
      if (global.MS.App && global.MS.App.syncProjectInputs) global.MS.App.syncProjectInputs();
      schedulePreview(0);
      toast('Datos de marca importados.', 'success');
    }).catch(function () {
      toast('No se pudo leer brand.json. Verifica que sea un JSON válido.', 'error');
    });
  }

  function onStateChange(reason) {
    if (reason === 'load' || reason === 'reset') {
      renderForm();
      schedulePreview(0);
      return;
    }
    if (reason === 'live') return;
    if (reason === 'techpack') {
      schedulePreview();
      return;
    }
    schedulePreview();
  }

  function init() {
    frame = document.getElementById('tp-frame');
    previewStatus = document.getElementById('preview-status');

    Array.prototype.forEach.call(document.querySelectorAll('[data-field]'), function (input) {
      input.addEventListener('input', function () {
        var key = input.dataset.field;
        State.get().techpack[key] = input.value;
        State.touch('techpack');
      });
    });

    var brandButton = document.getElementById('btn-brand-import');
    var brandInput = document.getElementById('brand-input');
    if (brandButton && brandInput) {
      brandButton.addEventListener('click', function () { brandInput.click(); });
      brandInput.addEventListener('change', function () {
        var file = brandInput.files && brandInput.files[0];
        brandInput.value = '';
        if (file) importBrand(file);
      });
    }

    var exportButton = document.getElementById('btn-tp-export');
    if (exportButton) exportButton.addEventListener('click', downloadHTML);

    var printButton = document.getElementById('btn-tp-print');
    if (printButton) printButton.addEventListener('click', printDoc);

    var refreshButton = document.getElementById('btn-tp-refresh');
    if (refreshButton) refreshButton.addEventListener('click', function () { schedulePreview(0); });

    renderForm();
  }

  global.MS.Techpack = {
    init: init,
    renderForm: renderForm,
    onStateChange: onStateChange,
    refresh: function () { schedulePreview(0); },
    buildDoc: buildDoc
  };
})(window);
