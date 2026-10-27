/*
 * Pruebas de humo ejecutables desde el navegador: ?selftest=1
 * Verifican la geometria de produccion, el rasterizado y el almacenamiento.
 */
(function (global) {
  'use strict';

  if (new URLSearchParams(global.location.search).get('selftest') !== '1') return;

  function report() {
    var results = [];

    function check(name, condition, detail) {
      results.push({ name: name, pass: Boolean(condition), detail: detail || '' });
    }

    var util = global.MS.util;
    var Exporter = global.MS.Exporter;
    var sampleSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">' +
      '<circle cx="100" cy="50" r="40" fill="#ff0000"/></svg>';
    var design = {
      src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(sampleSvg),
      filename: 'selftest.svg',
      mime: 'image/svg+xml',
      widthCm: 20,
      aspect: 2,
      cxCm: 50,
      cyCm: 40,
      rotation: 0,
      flipX: false,
      luminance: null
    };

    var box = Exporter.designBox(design);
    check('Caja sin rotación', Math.abs(box.w - 20) < 0.001 && Math.abs(box.h - 10) < 0.001,
      util.formatCm(box.w) + ' x ' + util.formatCm(box.h) + ' cm');

    var rotated = Object.assign({}, design, { rotation: 90 });
    var rotatedBox = Exporter.designBox(rotated);
    check('Caja con rotación 90', Math.abs(rotatedBox.w - 10) < 0.001 && Math.abs(rotatedBox.h - 20) < 0.001,
      util.formatCm(rotatedBox.w) + ' x ' + util.formatCm(rotatedBox.h) + ' cm');

    var expectedW = util.pxForPrint(20);
    var expectedH = util.pxForPrint(10);

    return Exporter.productionCanvas(design).then(function (canvas) {
      check('Dimensiones 300 ppp', canvas.width === expectedW && canvas.height === expectedH,
        canvas.width + ' x ' + canvas.height + ' px');

      var ctx = canvas.getContext('2d');
      var corner = ctx.getImageData(0, 0, 1, 1).data;
      check('Fondo transparente', corner[3] === 0, 'alpha=' + corner[3]);

      var center = ctx.getImageData(Math.round(canvas.width / 2), Math.round(canvas.height / 2), 1, 1).data;
      check('Diseño rasterizado', center[0] > 200 && center[1] < 60 && center[2] < 60,
        'rgb=' + center[0] + ',' + center[1] + ',' + center[2]);

      var svgCm = Exporter.productionSVG(design, 'cm');
      check('SVG en centímetros', svgCm.indexOf('width="20cm"') !== -1 && svgCm.indexOf('viewBox="0 0 20 10"') !== -1);

      return Exporter.productionCanvas(rotated).then(function (rotatedCanvas) {
        check('Dimensiones con rotación 90',
          rotatedCanvas.width === expectedH && rotatedCanvas.height === expectedW,
          rotatedCanvas.width + ' x ' + rotatedCanvas.height + ' px');

        var rotatedCtx = rotatedCanvas.getContext('2d');
        var rotatedCenter = rotatedCtx.getImageData(
          Math.round(rotatedCanvas.width / 2),
          Math.round(rotatedCanvas.height / 2), 1, 1
        ).data;
        check('Rotación conserva el contenido',
          rotatedCenter[0] > 200 && rotatedCenter[1] < 60 && rotatedCenter[2] < 60,
          'rgb=' + rotatedCenter[0] + ',' + rotatedCenter[1] + ',' + rotatedCenter[2]);

        return Exporter.mockupDataURL('front', {
          design: design,
          shirtColor: '#FFFFFF',
          width: 600,
          background: '#F4F6F9'
        });
      });
    }).then(function (url) {
      check('Mockup PNG', typeof url === 'string' && url.indexOf('data:image/png;base64,') === 0 && url.length > 1000,
        url.length + ' caracteres');

      var v1 = {
        version: 1,
        project: { code: 'V1-001', name: 'Proyecto v1' },
        shirt: { color: '#FFFFFF', side: 'front' },
        designs: {
          front: design,
          back: null
        },
        techpack: { brand: 'Marca v1', notes: 'Conservar' }
      };
      var migrated = global.MS.Schema.migrateV1(v1);
      var frontZone = migrated.views.front.zones['front-free'];
      var migratedLayer = frontZone && frontZone.layers && frontZone.layers[0];
      check('Migración v1 a v2', migrated.version === 2 &&
        migrated.project.code === 'V1-001' &&
        migrated.techpack.brand === 'Marca v1',
        'version=' + migrated.version);
      check('Posición v1 conservada', Boolean(migratedLayer) &&
        Math.abs(migratedLayer.xCm - (design.cxCm - 50)) < 0.001 &&
        Math.abs(migratedLayer.yCm - (design.cyCm - 45)) < 0.001,
        migratedLayer ? ('x=' + migratedLayer.xCm + ', y=' + migratedLayer.yCm) : 'sin capa');
      check('Zona migrada activa', migrated.views.front.activeZone === 'front-free' &&
        migrated.views.back.activeZone === 'back-full');

      var layered = [
        Object.assign({}, design, { id: 'a', type: 'image', xCm: -5, yCm: 0, opacity: 1, visible: true }),
        Object.assign({}, design, { id: 'b', type: 'image', xCm: 5, yCm: 0, opacity: 1, visible: true })
      ];
      var union = Exporter.unionBox(layered);
      check('Unión de capas', union && Math.abs(union.w - 30) < 0.001 && Math.abs(union.h - 10) < 0.001,
        union ? (union.w + ' x ' + union.h) : 'sin caja');
      var layeredSvg = Exporter.productionSVGFromLayers(layered, 'cm');
      check('SVG multiposición', typeof layeredSvg === 'string' &&
        layeredSvg.indexOf('viewBox="0 0 30 10"') !== -1);

      var key = 'mockup-studio:selftest';
      var storageOk = false;
      try {
        global.localStorage.setItem(key, 'ok');
        storageOk = global.localStorage.getItem(key) === 'ok';
        global.localStorage.removeItem(key);
      } catch (error) {
        storageOk = false;
      }
      check('localStorage disponible', storageOk);

      var failed = results.filter(function (item) { return !item.pass; });
      var lines = results.map(function (item) {
        return (item.pass ? 'PASS' : 'FAIL') + '  ' + item.name + (item.detail ? '  [' + item.detail + ']' : '');
      });
      lines.push('');
      lines.push(failed.length === 0 ? 'RESULTADO: PASS' : 'RESULTADO: FAIL (' + failed.length + ')');

      var panel = document.createElement('pre');
      panel.id = 'selftest-report';
      panel.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:9999;margin:0;padding:12px 14px;' +
        'background:#ffffff;color:#111;border:1px solid #333;border-radius:8px;' +
        'font:12px/1.5 ui-monospace,monospace;white-space:pre-wrap;max-width:calc(100vw - 24px)';
      panel.textContent = lines.join('\n');
      document.body.appendChild(panel);
      document.title = (failed.length === 0 ? 'SELFTEST PASS' : 'SELFTEST FAIL') + ' - Mockup Studio';
    }).catch(function (error) {
      var panel = document.createElement('pre');
      panel.id = 'selftest-report';
      panel.textContent = 'RESULTADO: FAIL\n' + (error && error.message ? error.message : String(error));
      document.body.appendChild(panel);
      document.title = 'SELFTEST FAIL - Mockup Studio';
    });
  }

  global.addEventListener('DOMContentLoaded', function () {
    global.setTimeout(function () {
      report();
    }, 150);
  });
})(window);
