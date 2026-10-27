/*
 * Esquema v2 y migracion desde v1.
 *
 * v1 guardaba un unico diseno por vista. v2 guarda zonas con pilas de capas.
 * La migracion mueve cada diseno v1 a una zona libre con el mismo centro
 * absoluto, de modo que el proyecto se vea y exporte igual que antes.
 */
(function (global) {
  'use strict';

  var CONFIG = global.MS.CONFIG;
  var util = global.MS.util;
  var Catalog = global.MS.Catalog;

  var VERSION = 2;

  function today() {
    var now = new Date();
    var month = String(now.getMonth() + 1).padStart(2, '0');
    var day = String(now.getDate()).padStart(2, '0');
    return now.getFullYear() + '-' + month + '-' + day;
  }

  function newId(prefix) {
    return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function defaultTechpack() {
    return {
      brand: '',
      garment: 'Camiseta unisex manga corta',
      fabric: '100% algodón, jersey peinado 180 g/m2',
      sizes: 'S, M, L, XL',
      technique: 'DTG / DTF',
      placement: '',
      quantity: '1',
      date: today(),
      contact: '',
      brandIdentity: '',
      notes: ''
    };
  }

  function defaultState() {
    return {
      version: VERSION,
      meta: { created: new Date().toISOString(), updated: null },
      project: { code: '', name: '' },
      garment: { type: 'tshirt', size: 'M' },
      shirt: { color: '#FFFFFF', side: 'front' },
      views: {
        front: { activeZone: Catalog.defaultZone('front'), zones: Catalog.createZoneState('front') },
        back: { activeZone: Catalog.defaultZone('back'), zones: Catalog.createZoneState('back') }
      },
      guides: { zone: true, safe: true, center: true },
      colorways: [],
      techpack: defaultTechpack()
    };
  }

  function normalizeText(raw) {
    var text = raw && typeof raw.text === 'object' ? raw.text : {};
    return {
      content: String(text.content == null ? (raw && raw.content) || '' : text.content),
      font: String(text.font || 'Inter'),
      sizeCm: util.clamp(util.toNumber(text.sizeCm, 4), 0.5, 40),
      weight: String(text.weight || '600'),
      color: util.sanitizeHex(text.color, '#111318'),
      align: text.align === 'center' || text.align === 'right' ? text.align : 'left',
      letterSpacing: util.toNumber(text.letterSpacing, 0),
      lineHeight: util.clamp(util.toNumber(text.lineHeight, 1.2), 0.8, 3)
    };
  }

  function normalizeLayer(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var type = raw.type === 'text' ? 'text' : 'image';

    if (type === 'image' && (typeof raw.src !== 'string' || raw.src.indexOf('data:image/') !== 0)) {
      return null;
    }

    var aspect = util.clamp(util.toNumber(raw.aspect, 1), 0.05, 20);
    var maxWidth = Math.min(CONFIG.MAX_DESIGN_WIDTH_CM, CONFIG.MAX_DESIGN_HEIGHT_CM * aspect);
    var widthCm = util.clamp(util.toNumber(raw.widthCm, 20), 2, maxWidth);

    var layer = {
      id: typeof raw.id === 'string' && /^[A-Za-z0-9_-]+$/.test(raw.id) ? raw.id : newId('layer'),
      type: type,
      name: String(raw.name || raw.filename || (type === 'text' ? 'Texto' : 'Capa')),
      visible: raw.visible !== false,
      locked: Boolean(raw.locked),
      opacity: util.clamp(util.toNumber(raw.opacity, 1), 0, 1),
      xCm: util.clamp(util.toNumber(raw.xCm, 0), -100, 100),
      yCm: util.clamp(util.toNumber(raw.yCm, 0), -100, 100),
      widthCm: widthCm,
      aspect: aspect,
      rotation: util.toNumber(raw.rotation, 0),
      flipX: Boolean(raw.flipX),
      luminance: typeof raw.luminance === 'number' ? raw.luminance : null,
      vector: Boolean(raw.vector || String(raw.mime || '').indexOf('svg') !== -1),
      naturalWidth: util.toNumber(raw.naturalWidth, 0),
      naturalHeight: util.toNumber(raw.naturalHeight, 0)
    };

    if (type === 'image') {
      layer.src = raw.src;
      layer.mime = String(raw.mime || '');
      layer.filename = String(raw.filename || layer.name);
    } else {
      layer.text = normalizeText(raw);
    }

    return layer;
  }

  function normalizeZones(view, rawZones) {
    var zones = Catalog.ensureZones(view, rawZones);
    var result = {};

    Catalog.forView(view).forEach(function (def) {
      var source = zones[def.id] || { layers: [], activeLayerId: null };
      var layers = [];
      var seen = {};

      (Array.isArray(source.layers) ? source.layers : []).forEach(function (rawLayer) {
        var layer = normalizeLayer(rawLayer);
        if (!layer) return;
        if (seen[layer.id]) layer.id = newId('layer');
        seen[layer.id] = true;
        layers.push(layer);
      });

      var activeLayerId = null;
      if (typeof source.activeLayerId === 'string') {
        var exists = layers.some(function (layer) { return layer.id === source.activeLayerId; });
        if (exists) activeLayerId = source.activeLayerId;
      }
      if (!activeLayerId && layers.length) activeLayerId = layers[layers.length - 1].id;

      result[def.id] = { layers: layers, activeLayerId: activeLayerId };
    });

    return result;
  }

  function normalizeV2(raw) {
    var base = defaultState();
    if (!raw || typeof raw !== 'object') return base;

    var out = Object.assign({}, base, raw);
    out.version = VERSION;
    out.meta = Object.assign({}, base.meta, raw.meta || {});
    out.project = Object.assign({}, base.project, raw.project || {});
    out.garment = Object.assign({}, base.garment, raw.garment || {});
    out.shirt = Object.assign({}, base.shirt, raw.shirt || {});
    out.guides = Object.assign({}, base.guides, raw.guides || {});
    out.techpack = Object.assign({}, base.techpack, raw.techpack || {});
    out.colorways = Array.isArray(raw.colorways) ? raw.colorways.map(function (item) {
      if (!item || typeof item !== 'object') return null;
      return {
        id: typeof item.id === 'string' && item.id ? item.id : newId('color'),
        name: String(item.name || 'Color'),
        hex: util.sanitizeHex(item.hex, '#FFFFFF')
      };
    }).filter(Boolean) : [];

    out.shirt.color = util.sanitizeHex(out.shirt.color, '#FFFFFF');
    if (out.shirt.side !== 'front' && out.shirt.side !== 'back') out.shirt.side = 'front';
    if (out.garment.type !== 'tshirt') out.garment.type = 'tshirt';
    if (!out.garment.size) out.garment.size = 'M';

    out.project.code = String(out.project.code || '');
    out.project.name = String(out.project.name || '');

    out.views = {};
    ['front', 'back'].forEach(function (view) {
      var source = raw.views && raw.views[view] && typeof raw.views[view] === 'object'
        ? raw.views[view]
        : {};
      var zones = normalizeZones(view, source.zones);
      var activeZone = source.activeZone;
      var def = Catalog.byId(activeZone);
      if (!def || def.view !== view) activeZone = Catalog.defaultZone(view);
      out.views[view] = { activeZone: activeZone, zones: zones };
    });

    Object.keys(out.techpack).forEach(function (key) {
      if (out.techpack[key] == null) out.techpack[key] = '';
      else if (typeof out.techpack[key] !== 'string') out.techpack[key] = String(out.techpack[key]);
    });

    return out;
  }

  function layerFromV1(design, zone) {
    return normalizeLayer({
      id: newId('layer'),
      type: 'image',
      name: design.filename || 'Diseño importado',
      visible: true,
      locked: false,
      opacity: 1,
      xCm: util.toNumber(design.cxCm, zone.center.x) - zone.center.x,
      yCm: util.toNumber(design.cyCm, zone.center.y) - zone.center.y,
      widthCm: design.widthCm,
      aspect: design.aspect,
      rotation: design.rotation,
      flipX: design.flipX,
      luminance: design.luminance,
      vector: design.vector,
      naturalWidth: design.naturalWidth,
      naturalHeight: design.naturalHeight,
      src: design.src,
      mime: design.mime,
      filename: design.filename
    });
  }

  function migrateV1(raw) {
    var out = defaultState();
    if (!raw || typeof raw !== 'object') return out;

    out.meta = Object.assign({}, out.meta, raw.meta || {});
    out.project = Object.assign({}, out.project, raw.project || {});
    out.techpack = Object.assign({}, out.techpack, raw.techpack || {});
    out.guides = Object.assign({}, out.guides, raw.guides || {});
    out.shirt.color = util.sanitizeHex(raw.shirt && raw.shirt.color, '#FFFFFF');
    out.shirt.side = raw.shirt && raw.shirt.side === 'back' ? 'back' : 'front';

    ['front', 'back'].forEach(function (view) {
      var design = raw.designs && raw.designs[view];
      out.views[view] = {
        activeZone: Catalog.defaultZone(view),
        zones: Catalog.createZoneState(view)
      };
      if (!design || typeof design.src !== 'string' || design.src.indexOf('data:image/') !== 0) return;

      var zoneId = Catalog.freeZone(view);
      var zone = Catalog.byId(zoneId);
      var layer = layerFromV1(design, zone);
      if (!layer) return;
      out.views[view].zones[zoneId].layers.push(layer);
      out.views[view].zones[zoneId].activeLayerId = layer.id;
      out.views[view].activeZone = zoneId;
    });

    return normalizeV2(out);
  }

  function normalize(raw) {
    if (!raw || typeof raw !== 'object') return defaultState();
    var candidate = raw.state && typeof raw.state === 'object' ? raw.state : raw;

    if (candidate.version === VERSION || candidate.views) return normalizeV2(candidate);
    if (candidate.version === 1 || candidate.designs) return migrateV1(candidate);
    return normalizeV2(candidate);
  }

  global.MS.Schema = {
    version: VERSION,
    defaultState: defaultState,
    normalize: normalize,
    normalizeV2: normalizeV2,
    migrateV1: migrateV1,
    normalizeLayer: normalizeLayer,
    newId: newId
  };
})(window);
