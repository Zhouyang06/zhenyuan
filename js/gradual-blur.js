/*!
 * GradualBlur — 边缘渐变模糊（原生 JS 版）
 * 由 Ansh Dhanani 的 React <GradualBlur/> 组件移植
 * github.com/ansh-dhanani
 *
 * 用法：给任意定位容器（position 非 static）加 data-gradual-blur 属性即可
 * 可选属性：data-gb-position（bottom/top）、data-gb-height（如 7rem）、
 *          data-gb-strength（强度系数）、data-gb-count（分层数）
 */
(function () {
  'use strict';

  function createGradualBlur(parent, opts) {
    if (!parent) return null;
    var o = {
      position: 'bottom',
      height: '7rem',
      strength: 2.5,
      divCount: 3,
      exponential: true,
      opacity: 0.9
    };
    for (var k in (opts || {})) { if (opts[k] !== undefined) o[k] = opts[k]; }

    var m = String(o.height).match(/^([\d.]+)(\w+)$/);
    var H = m ? parseFloat(m[1]) : 7;
    var unit = m ? m[2] : 'rem';

    var wrap = document.createElement('div');
    wrap.className = 'gradual-blur';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.style.opacity = o.opacity;

    // 边缘处的最大模糊像素（分层叠加渐近达到该值）
    var maxBlurPx = o.strength * 6;
    for (var i = 1; i <= o.divCount; i++) {
      var p = o.exponential ? Math.pow(i / o.divCount, 2) : i / o.divCount;
      var slice = document.createElement('div');
      slice.className = 'gradual-blur-slice';
      if (o.position === 'top') {
        slice.style.top = '0';
        slice.style.bottom = 'auto';
      } else {
        slice.style.bottom = '0';
        slice.style.top = 'auto';
      }
      slice.style.height = (p * H) + unit;
      var b = (maxBlurPx / o.divCount).toFixed(2) + 'px';
      slice.style.backdropFilter = 'blur(' + b + ')';
      slice.style.webkitBackdropFilter = 'blur(' + b + ')';
      wrap.appendChild(slice);
    }
    parent.appendChild(wrap);
    return wrap;
  }

  window.createGradualBlur = createGradualBlur;

  // 自动挂载页面上所有带 data-gradual-blur 的容器
  function mount() {
    document.querySelectorAll('[data-gradual-blur]').forEach(function (el) {
      if (el.querySelector(':scope > .gradual-blur')) return;
      createGradualBlur(el, {
        position: el.getAttribute('data-gb-position') || 'bottom',
        height: el.getAttribute('data-gb-height') || '7rem',
        strength: parseFloat(el.getAttribute('data-gb-strength') || '2.5'),
        divCount: parseInt(el.getAttribute('data-gb-count') || '3', 10),
        exponential: el.getAttribute('data-gb-exp') !== 'linear',
        opacity: parseFloat(el.getAttribute('data-gb-opacity') || '0.9')
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
