/*
 * Plantillas vectoriales de camiseta (frente y espalda).
 *
 * El color base se inyecta en el cuerpo; las luces y sombras son capas
 * semitransparentes independientes, por lo que funcionan igual sobre colores
 * claros y oscuros. Todo el grupo tiene pointer-events desactivado para que
 * el diseno sea el unico elemento interactivo del lienzo.
 */
(function (global) {
  'use strict';

  var util = global.MS.util;

  function escAttr(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function markup(side, color) {
    var bodyColor = escAttr(util.sanitizeHex(color, '#FFFFFF'));
    var isBack = side === 'back';
    var p = isBack ? 'b' : 'f';

    var neckline = isBack
      ? 'C 612 170 560 195 500 195 C 440 195 388 170 380 130 Z'
      : 'C 610 190 560 222 500 222 C 440 222 390 190 380 130 Z';

    var collar = isBack
      ? 'M 380 130 C 388 170 440 195 500 195 C 560 195 612 170 620 130 ' +
        'L 620 145 C 612 184 560 209 500 209 C 440 209 388 184 380 145 Z'
      : 'M 380 130 C 390 190 440 222 500 222 C 560 222 610 190 620 130 ' +
        'L 620 147 C 610 206 560 238 500 238 C 440 238 390 206 380 147 Z';

    var body =
      'M 380 130 C 340 133 305 145 275 165 L 140 300 L 85 440 ' +
      'C 82 455 92 466 107 467 L 245 495 C 257 497 267 489 270 478 ' +
      'L 300 400 L 295 700 C 293 760 291 810 290 830 L 710 830 ' +
      'C 709 810 707 760 705 700 L 700 400 L 730 478 ' +
      'C 733 489 743 497 755 495 L 893 467 C 908 466 918 455 915 440 ' +
      'L 860 300 L 725 165 C 695 145 660 133 620 130 ' + neckline;

    var backYoke = isBack
      ? '<path d="M 275 165 C 340 202 430 218 500 218 C 570 218 660 202 725 165" ' +
        'fill="none" stroke="rgba(0,0,0,0.10)" stroke-width="3"/>'
      : '';

    return '' +
      '<defs>' +
        '<linearGradient id="ms-sides-' + p + '" x1="85" y1="0" x2="915" y2="0" gradientUnits="userSpaceOnUse">' +
          '<stop offset="0" stop-color="#000000" stop-opacity="0.16"/>' +
          '<stop offset="0.2" stop-color="#000000" stop-opacity="0"/>' +
          '<stop offset="0.8" stop-color="#000000" stop-opacity="0"/>' +
          '<stop offset="1" stop-color="#000000" stop-opacity="0.16"/>' +
        '</linearGradient>' +
        '<linearGradient id="ms-sheen-' + p + '" x1="0" y1="130" x2="0" y2="830" gradientUnits="userSpaceOnUse">' +
          '<stop offset="0" stop-color="#ffffff" stop-opacity="0.12"/>' +
          '<stop offset="0.45" stop-color="#ffffff" stop-opacity="0"/>' +
          '<stop offset="1" stop-color="#000000" stop-opacity="0.08"/>' +
        '</linearGradient>' +
      '</defs>' +
      '<g class="shirt" pointer-events="none">' +
        '<path d="' + body + '" fill="' + bodyColor + '" stroke="rgba(0,0,0,0.26)" ' +
          'stroke-width="3" stroke-linejoin="round"/>' +
        '<path d="' + body + '" fill="url(#ms-sheen-' + p + ')"/>' +
        '<path d="' + body + '" fill="url(#ms-sides-' + p + ')"/>' +
        '<path d="M 300 400 C 315 442 323 494 320 548" fill="none" ' +
          'stroke="rgba(0,0,0,0.10)" stroke-width="3"/>' +
        '<path d="M 700 400 C 685 442 677 494 680 548" fill="none" ' +
          'stroke="rgba(0,0,0,0.10)" stroke-width="3"/>' +
        '<path d="M 130 352 C 166 382 198 414 228 454" fill="none" ' +
          'stroke="rgba(0,0,0,0.07)" stroke-width="5"/>' +
        '<path d="M 870 352 C 834 382 802 414 772 454" fill="none" ' +
          'stroke="rgba(0,0,0,0.07)" stroke-width="5"/>' +
        '<path d="M 118 450 L 252 477" fill="none" stroke="rgba(0,0,0,0.10)" stroke-width="3"/>' +
        '<path d="M 882 450 L 748 477" fill="none" stroke="rgba(0,0,0,0.10)" stroke-width="3"/>' +
        '<path d="M 382 644 C 396 696 401 754 396 806" fill="none" ' +
          'stroke="rgba(0,0,0,0.05)" stroke-width="5"/>' +
        '<path d="M 612 630 C 600 684 596 744 602 800" fill="none" ' +
          'stroke="rgba(0,0,0,0.05)" stroke-width="5"/>' +
        '<path d="M 290 822 C 400 829 600 829 710 822" fill="none" ' +
          'stroke="rgba(0,0,0,0.14)" stroke-width="3"/>' +
        '<path d="M 290 812 C 400 819 600 819 710 812" fill="none" ' +
          'stroke="rgba(0,0,0,0.06)" stroke-width="2"/>' +
        backYoke +
        '<path d="' + collar + '" fill="rgba(0,0,0,0.12)" ' +
          'stroke="rgba(0,0,0,0.18)" stroke-width="2"/>' +
      '</g>';
  }

  function svg(side, color, content, options) {
    options = options || {};
    var width = options.width || 2000;
    var height = Math.round(width * (900 / 1000));
    var background = options.background
      ? '<rect width="1000" height="900" fill="' + escAttr(util.sanitizeHex(options.background, '#F2F3F5')) + '"/>'
      : '';
    return '' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" ' +
        'viewBox="0 0 1000 900">' +
        background +
        markup(side, color) +
        (content || '') +
      '</svg>';
  }

  global.MS.Shirt = {
    markup: markup,
    svg: svg
  };
})(window);
