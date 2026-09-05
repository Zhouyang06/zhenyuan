/*!
 * FuzzyText — 毛玻璃噪点文字（原生 JS 移植版）
 * 移植自 React Bits 的 <FuzzyText/> 组件（github.com/DavidHDev/react-bits）
 * 逐行水平错位绘制文字，鼠标悬停时模糊加剧；去除 React 依赖
 *
 * 用法：window.createFuzzyText(containerElement, { text, fontSize, ... })
 */
(function () {
  'use strict';

  function createFuzzyText(container, opts) {
    if (!container) return null;
    container.textContent = '';

    var o = {
      text: 'ZhenYuan',
      fontSize: 'clamp(110px,17vw,250px)',
      fontWeight: 900,
      fontFamily: 'Georgia,"Times New Roman",serif',
      color: '#111114',
      enableHover: true,
      baseIntensity: 0.18,
      hoverIntensity: 0.5,
      fuzzRange: 30,
      fps: 60,
      direction: 'horizontal'
    };
    for (var k in (opts || {})) { if (opts[k] !== undefined) o[k] = opts[k]; }

    var canvas = document.createElement('canvas');
    canvas.style.display = 'block';
    canvas.style.maxWidth = '100%';
    container.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;

    var raf = 0, cancelled = false, resizeTimer = 0;

    function init() {
      var fontSizeStr = typeof o.fontSize === 'number' ? o.fontSize + 'px' : o.fontSize;
      var fontString = o.fontWeight + ' ' + fontSizeStr + ' ' + o.fontFamily;

      var numericFontSize;
      if (typeof o.fontSize === 'number') {
        numericFontSize = o.fontSize;
      } else {
        var temp = document.createElement('span');
        temp.style.fontSize = o.fontSize;
        temp.style.position = 'absolute';
        temp.style.visibility = 'hidden';
        document.body.appendChild(temp);
        numericFontSize = parseFloat(window.getComputedStyle(temp).fontSize) || 100;
        document.body.removeChild(temp);
      }

      var offscreen = document.createElement('canvas');
      var offCtx = offscreen.getContext('2d');
      if (!offCtx) return;
      offCtx.font = fontString;
      offCtx.textBaseline = 'alphabetic';

      var text = o.text;
      var metrics = offCtx.measureText(text);
      var actualLeft = metrics.actualBoundingBoxLeft !== undefined ? metrics.actualBoundingBoxLeft : 0;
      var actualRight = metrics.actualBoundingBoxRight !== undefined ? metrics.actualBoundingBoxRight : metrics.width;
      var actualAscent = metrics.actualBoundingBoxAscent !== undefined ? metrics.actualBoundingBoxAscent : numericFontSize;
      var actualDescent = metrics.actualBoundingBoxDescent !== undefined ? metrics.actualBoundingBoxDescent : numericFontSize * 0.2;

      var textBoundingWidth = Math.ceil(actualLeft + actualRight);
      var tightHeight = Math.ceil(actualAscent + actualDescent);
      var extraWidthBuffer = 10;
      var offscreenWidth = textBoundingWidth + extraWidthBuffer;

      offscreen.width = offscreenWidth;
      offscreen.height = tightHeight;
      var xOffset = extraWidthBuffer / 2;
      offCtx.font = fontString;
      offCtx.textBaseline = 'alphabetic';
      offCtx.fillStyle = o.color;
      offCtx.fillText(text, xOffset - actualLeft, actualAscent);

      var horizontalMargin = o.fuzzRange + 20;
      canvas.width = offscreenWidth + horizontalMargin * 2;
      canvas.height = tightHeight;
      ctx.translate(horizontalMargin, 0);

      var interactiveLeft = horizontalMargin + xOffset;
      var interactiveRight = interactiveLeft + textBoundingWidth;

      var isHovering = false;
      var currentIntensity = o.baseIntensity;
      var targetIntensity = o.baseIntensity;
      var lastFrameTime = 0;
      var frameDuration = 1000 / o.fps;

      function frame(timestamp) {
        if (cancelled) return;
        if (timestamp - lastFrameTime < frameDuration) {
          raf = requestAnimationFrame(frame);
          return;
        }
        lastFrameTime = timestamp;
        ctx.clearRect(-o.fuzzRange - 20, -o.fuzzRange - 10,
          offscreenWidth + 2 * (o.fuzzRange + 20), tightHeight + 2 * (o.fuzzRange + 10));

        targetIntensity = isHovering ? o.hoverIntensity : o.baseIntensity;
        currentIntensity = targetIntensity;

        // 逐行水平错位：毛玻璃噪点效果
        for (var j = 0; j < tightHeight; j++) {
          var dx = Math.floor(currentIntensity * (Math.random() - 0.5) * o.fuzzRange);
          ctx.drawImage(offscreen, 0, j, offscreenWidth, 1, dx, j, offscreenWidth, 1);
        }
        raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);

      function inText(x, y) {
        return x >= interactiveLeft && x <= interactiveRight && y >= 0 && y <= tightHeight;
      }
      function onMove(e) {
        if (!o.enableHover) return;
        var rect = canvas.getBoundingClientRect();
        isHovering = inText(e.clientX - rect.left, e.clientY - rect.top);
      }
      function onLeave() { isHovering = false; }
      function onTouch(e) {
        if (!o.enableHover) return;
        var rect = canvas.getBoundingClientRect();
        isHovering = inText(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top);
      }
      if (o.enableHover) {
        canvas.addEventListener('mousemove', onMove);
        canvas.addEventListener('mouseleave', onLeave);
        canvas.addEventListener('touchmove', onTouch, { passive: true });
        canvas.addEventListener('touchend', onLeave);
      }
      canvas._fuzzyCleanup = function () {
        cancelAnimationFrame(raf);
        canvas.removeEventListener('mousemove', onMove);
        canvas.removeEventListener('mouseleave', onLeave);
        canvas.removeEventListener('touchmove', onTouch);
        canvas.removeEventListener('touchend', onLeave);
      };
    }

    // 字体就绪后渲染，避免测量偏差
    function start() {
      if (document.fonts && document.fonts.load) {
        document.fonts.load(o.fontWeight + ' 100px ' + o.fontFamily).then(init).catch(init);
      } else { init(); }
    }
    start();

    // 视口变化时按 clamp 新字号重建
    function onResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (canvas._fuzzyCleanup) canvas._fuzzyCleanup();
        cancelled = true;
        setTimeout(function () { cancelled = false; init(); }, 30);
      }, 220);
    }
    window.addEventListener('resize', onResize);

    return {
      canvas: canvas,
      destroy: function () {
        cancelled = true;
        cancelAnimationFrame(raf);
        clearTimeout(resizeTimer);
        window.removeEventListener('resize', onResize);
        if (canvas._fuzzyCleanup) canvas._fuzzyCleanup();
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }
    };
  }

  window.createFuzzyText = createFuzzyText;
})();
