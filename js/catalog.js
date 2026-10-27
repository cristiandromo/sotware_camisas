/*
 * Catalogo de zonas de estampado para camiseta.
 *
 * Las coordenadas estan en centimetros sobre la mesa de 100 x 90 cm.
 * Cada zona define su centro, tamano maximo recomendado y margen seguro.
 * Los disenos v1 se migran a las zonas "free-front" y "free-back" para
 * conservar exactamente su posicion original.
 */
(function (global) {
  'use strict';

  var ZONES = [
    {
      id: 'front-full',
      view: 'front',
      label: 'Frente completo',
      center: { x: 50, y: 40 },
      maxW: 30,
      maxH: 40,
      safe: 1
    },
    {
      id: 'front-chest',
      view: 'front',
      label: 'Pecho central',
      center: { x: 50, y: 34 },
      maxW: 26,
      maxH: 28,
      safe: 1
    },
    {
      id: 'front-left-chest',
      view: 'front',
      label: 'Pecho izquierdo',
      center: { x: 58, y: 31 },
      maxW: 10,
      maxH: 10,
      safe: 0.7
    },
    {
      id: 'front-right-chest',
      view: 'front',
      label: 'Pecho derecho',
      center: { x: 42, y: 31 },
      maxW: 10,
      maxH: 10,
      safe: 0.7
    },
    {
      id: 'front-sleeve-left',
      view: 'front',
      label: 'Manga izquierda',
      center: { x: 85, y: 35 },
      maxW: 8,
      maxH: 8,
      safe: 0.5
    },
    {
      id: 'front-sleeve-right',
      view: 'front',
      label: 'Manga derecha',
      center: { x: 15, y: 35 },
      maxW: 8,
      maxH: 8,
      safe: 0.5
    },
    {
      id: 'front-free',
      view: 'front',
      label: 'Libre (frente)',
      center: { x: 50, y: 45 },
      maxW: 50,
      maxH: 70,
      safe: 1,
      free: true,
      guideRect: { xCm: 25, yCm: 13, wCm: 50, hCm: 70 }
    },
    {
      id: 'back-full',
      view: 'back',
      label: 'Espalda completa',
      center: { x: 50, y: 42 },
      maxW: 30,
      maxH: 40,
      safe: 1
    },
    {
      id: 'back-upper',
      view: 'back',
      label: 'Espalda alta',
      center: { x: 50, y: 30 },
      maxW: 28,
      maxH: 18,
      safe: 1
    },
    {
      id: 'back-nape',
      view: 'back',
      label: 'Nuca',
      center: { x: 50, y: 23 },
      maxW: 8,
      maxH: 5,
      safe: 0.4
    },
    {
      id: 'back-sleeve-left',
      view: 'back',
      label: 'Manga izquierda',
      center: { x: 85, y: 35 },
      maxW: 8,
      maxH: 8,
      safe: 0.5
    },
    {
      id: 'back-sleeve-right',
      view: 'back',
      label: 'Manga derecha',
      center: { x: 15, y: 35 },
      maxW: 8,
      maxH: 8,
      safe: 0.5
    },
    {
      id: 'back-free',
      view: 'back',
      label: 'Libre (espalda)',
      center: { x: 50, y: 45 },
      maxW: 50,
      maxH: 70,
      safe: 1,
      free: true,
      guideRect: { xCm: 25, yCm: 13, wCm: 50, hCm: 70 }
    }
  ];

  var INDEX = {};
  ZONES.forEach(function (zone) {
    INDEX[zone.id] = zone;
    zone.rect = zone.guideRect || {
      xCm: zone.center.x - zone.maxW / 2,
      yCm: zone.center.y - zone.maxH / 2,
      wCm: zone.maxW,
      hCm: zone.maxH
    };
  });

  var DEFAULT_ZONE = {
    front: 'front-chest',
    back: 'back-full'
  };

  function byId(id) {
    return INDEX[id] || null;
  }

  function forView(view) {
    return ZONES.filter(function (zone) { return zone.view === view; });
  }

  function defaultZone(view) {
    return DEFAULT_ZONE[view] || DEFAULT_ZONE.front;
  }

  function freeZone(view) {
    return view === 'back' ? 'back-free' : 'front-free';
  }

  function createZoneState(view) {
    var zones = {};
    forView(view).forEach(function (zone) {
      zones[zone.id] = { layers: [], activeLayerId: null };
    });
    return zones;
  }

  function ensureZones(view, zones) {
    var out = zones && typeof zones === 'object' ? zones : {};
    forView(view).forEach(function (zone) {
      if (!out[zone.id] || typeof out[zone.id] !== 'object') {
        out[zone.id] = { layers: [], activeLayerId: null };
      }
      if (!Array.isArray(out[zone.id].layers)) out[zone.id].layers = [];
    });
    return out;
  }

  global.MS = global.MS || {};
  global.MS.Catalog = {
    zones: ZONES,
    byId: byId,
    forView: forView,
    defaultZone: defaultZone,
    freeZone: freeZone,
    createZoneState: createZoneState,
    ensureZones: ensureZones
  };
})(window);
