/*!
 * 底部来访统计（Vercount，不蒜子兼容写法，国内加速节点）
 * 纯静态 GitHub Pages 可用，免注册、免后端。
 * 仅线上域名计数；本机 127.0.0.1/localhost 预览时不加载计数脚本（数字显示 —，避免污染统计）。
 * 自注入样式与 DOM，各页面只需在 </body> 前引入本文件。
 */
(function () {
  'use strict';

  function init() {
    if (document.getElementById('zy-stats')) return;

    /* 样式：极简、无描边无阴影，融入纯黑底 */
    var css = document.createElement('style');
    css.textContent =
      '#zy-stats{text-align:center;padding:24px 16px 34px;' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;' +
      'font-size:11px;letter-spacing:.16em;color:rgba(248,245,255,.42);' +
      'line-height:1.9;user-select:none;-webkit-user-select:none;}' +
      '#zy-stats b{font-weight:400;color:rgba(248,245,255,.75);margin:0 .2em;font-variant-numeric:tabular-nums;}' +
      '#zy-stats .zy-dot{margin:0 .9em;opacity:.5;}' +
      '@media(max-width:600px){#zy-stats{font-size:10px;letter-spacing:.1em;}}';
    document.head.appendChild(css);

    var box = document.createElement('footer');
    box.id = 'zy-stats';
    box.setAttribute('aria-hidden', 'true');
    box.innerHTML =
      '累计来访<b id="vercount_value_site_uv">-</b>人' +
      '<span class="zy-dot">·</span>' +
      '累计访问<b id="vercount_value_site_pv">-</b>次';
    document.body.appendChild(box);

    var host = location.hostname;
    var isLocal = host === '127.0.0.1' || host === 'localhost' || host === '';
    if (isLocal) return; /* 本机预览：保持“-”，不计数 */

    /* 加载计数脚本（国内加速）；失败/超时则静默保留“-” */
    var s = document.createElement('script');
    s.src = 'https://cn.vercount.one/js';
    s.defer = true;
    s.async = true;
    s.onerror = function () { s.dataset.failed = '1'; };
    document.head.appendChild(s);

    /* 10 秒后仍是占位数字（回填失败）也保持“-”，不显示任何报错 */
    setTimeout(function () {
      ['vercount_value_site_uv', 'vercount_value_site_pv'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el && (!el.textContent || el.textContent === 'Loading')) el.textContent = '-';
      });
    }, 10000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
