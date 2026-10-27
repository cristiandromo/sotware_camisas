/*
 * Configuracion central del proyecto.
 *
 * Calibracion del editor: 1 cm = 10 unidades del viewBox de la camiseta.
 * La mesa de trabajo mide 100 x 90 cm. Las zonas de estampado viven en
 * js/catalog.js y usan las mismas unidades.
 */
(function (global) {
  'use strict';

  var DPI = 300;
  var CM_PX = 10;

  var SHIRT = {
    viewBox: '0 0 1000 900',
    viewBoxWidth: 1000,
    viewBoxHeight: 900,
    mockupWidth: 2000
  };

  var MAX_DESIGN_WIDTH_CM = 48;
  var MAX_DESIGN_HEIGHT_CM = 60;

  var COLORS = [
    { name: 'Blanco', hex: '#FFFFFF' },
    { name: 'Negro', hex: '#111318' },
    { name: 'Gris jaspe', hex: '#9AA0A6' },
    { name: 'Azul marino', hex: '#1B2A4A' },
    { name: 'Beige', hex: '#D9C7A7' },
    { name: 'Verde oliva', hex: '#5B6247' },
    { name: 'Vino', hex: '#6E1F2A' },
    { name: 'Azul cielo', hex: '#A9C9E6' }
  ];

  var STORAGE_KEY = 'mockup-studio:v2';
  var STORAGE_KEY_V1 = 'mockup-studio:v1';
  var MAX_FILE_BYTES = 12 * 1024 * 1024;
  var ACCEPTED_TYPES = ['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp'];

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function toNumber(value, fallback) {
    var n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function round(value, decimals) {
    var factor = Math.pow(10, decimals || 0);
    return Math.round(value * factor) / factor;
  }

  function cmToPx(cm) {
    return cm * CM_PX;
  }

  function pxForPrint(cm) {
    return Math.round((cm / 2.54) * DPI);
  }

  /* Caja envolvente de un diseno rotado. Se usa para el archivo de produccion. */
  function rotatedBox(width, height, degrees) {
    var rad = (degrees * Math.PI) / 180;
    return {
      w: Math.abs(width * Math.cos(rad)) + Math.abs(height * Math.sin(rad)),
      h: Math.abs(width * Math.sin(rad)) + Math.abs(height * Math.cos(rad))
    };
  }

  function luminance(hex) {
    var match = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!match) return null;
    var value = match[1];
    var channels = [0, 2, 4].map(function (offset) {
      return parseInt(value.slice(offset, offset + 2), 16) / 255;
    });
    var linear = channels.map(function (c) {
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  }

  function sanitizeHex(hex, fallback) {
    return /^#[0-9a-f]{6}$/i.test(String(hex || '')) ? String(hex) : fallback;
  }

  function colorName(hex) {
    var target = String(hex || '').toUpperCase();
    for (var i = 0; i < COLORS.length; i += 1) {
      if (COLORS[i].hex.toUpperCase() === target) return COLORS[i].name;
    }
    return target;
  }

  function slug(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'proyecto';
  }

  function formatCm(value) {
    var n = round(value, 1);
    return String(n).replace('.', ',');
  }

  global.MS = global.MS || {};
  global.MS.CONFIG = {
    DPI: DPI,
    CM_PX: CM_PX,
    SHIRT: SHIRT,
    MAX_DESIGN_WIDTH_CM: MAX_DESIGN_WIDTH_CM,
    MAX_DESIGN_HEIGHT_CM: MAX_DESIGN_HEIGHT_CM,
    COLORS: COLORS,
    STORAGE_KEY: STORAGE_KEY,
    STORAGE_KEY_V1: STORAGE_KEY_V1,
    SCHEMA_VERSION: 2,
    MAX_FILE_BYTES: MAX_FILE_BYTES,
    ACCEPTED_TYPES: ACCEPTED_TYPES
  };

  global.MS.util = {
    clamp: clamp,
    toNumber: toNumber,
    round: round,
    cmToPx: cmToPx,
    pxForPrint: pxForPrint,
    rotatedBox: rotatedBox,
    luminance: luminance,
    sanitizeHex: sanitizeHex,
    colorName: colorName,
    slug: slug,
    formatCm: formatCm
  };
})(window);
