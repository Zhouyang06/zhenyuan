/*!
 * 开屏流程：
 * 1. 进入网站 → 全屏 Prism 棱镜动效（黑底 + 棱镜光辉，鼠标可交互）
 * 2. 用户第一次滚动 / 触摸 / 点击 → 闪白 + 彩色光晕（胶片漏光效果）
 *    黑场渐变为白，漏光光斑从屏幕边缘晕开，随后整体渐隐露出页面
 * 3. 解锁滚动，导航条与超大 ZhenYuan 依次浮现
 */
(function () {
  'use strict';

  var overlay = document.getElementById('intro');

  function finish() {
    document.body.classList.remove('locked');
    document.body.classList.add('ready');
    if (overlay) overlay.style.display = 'none';
    window.removeEventListener('wheel', onAct);
    window.removeEventListener('touchstart', onAct);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('mousedown', onAct);
  }

  if (!overlay) { finish(); return; }
  // 分类页选择完成后回跳：?nointro=1 跳过开屏直接显示页面
  if (new URLSearchParams(location.search).get('nointro') === '1') { finish(); return; }
  window.__introStarted = true;   // 告知 main.js 兜底逻辑：开屏已接管

  try { window.scrollTo(0, 0); } catch (e) {}

  // 挂载 Prism 背景（参数与 React Bits <Prism/> 一致）
  var prism = null;
  if (window.createPrism) {
    try {
      prism = window.createPrism(overlay, {
        height: 2,
        baseWidth: 5,
        animationType: 'hover',
        glow: 0.6,
        noise: 0.5,
        transparent: true,
        scale: 3.6,
        hueShift: 0,
        colorFrequency: 3.4,
        hoverStrength: 4.5,
        inertia: 0.05,
        bloom: 1.1,
        saturation: 0.82,   /* 光晕颜色降饱和（默认 1.5） */
        timeScale: 0.5
      });
    } catch (e) { /* WebGL 不可用时退化为纯黑背景 */ }
  }

  // 漏光画布（叠在 Prism 之上）
  var flash = document.createElement('canvas');
  flash.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none';
  overlay.appendChild(flash);

  /* 胶片漏光动画：中心过曝白闪 + 边缘不规则彩色漏光（瓣状光斑簇 + 椭圆光带） */
  function playFlash(done) {
    var ctx = flash.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = window.innerWidth, H = window.innerHeight;
    flash.width = W * dpr; flash.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 每组漏光：锚点(x,y 屏幕比例) + 颜色 + 若干"瓣"（偏移dx/dy、半径比、相位）
    // 瓣簇互相错位叠加，轮廓呈有机不规则形，而不是正圆
    var leaks = [
      { x: -0.06, y: -0.10, c: [255, 122, 26], d: 0.00, a: -0.5,   // 左上 橙
        lobes: [[0, 0, 0.50, 0], [0.30, 0.18, 0.34, 1.7], [-0.26, 0.28, 0.30, 3.1], [0.10, -0.32, 0.28, 4.6]] },
      { x: 1.06, y: 0.30, c: [255, 45, 45], d: 0.10, a: 0.9,       // 右中 红
        lobes: [[0, 0, 0.46, 0.8], [-0.30, 0.16, 0.32, 2.4], [0.08, -0.28, 0.30, 3.9], [-0.10, 0.34, 0.24, 5.2]] },
      { x: 0.10, y: 1.10, c: [255, 210, 60], d: 0.20, a: 2.4,      // 左下 黄
        lobes: [[0, 0, 0.44, 0.4], [0.28, -0.20, 0.30, 2.0], [-0.32, -0.12, 0.28, 3.4]] },
      { x: 0.94, y: 1.06, c: [255, 79, 163], d: 0.30, a: 1.6,      // 右下 品红
        lobes: [[0, 0, 0.40, 1.2], [-0.26, -0.18, 0.30, 2.8], [0.22, 0.12, 0.26, 4.2]] },
      { x: -0.10, y: 0.62, c: [53, 208, 255], d: 0.16, a: 2.9,     // 左中 青
        lobes: [[0, 0, 0.38, 0.6], [0.26, 0.20, 0.28, 2.2], [0.05, -0.30, 0.26, 3.7]] }
    ];
    var DUR = 1.75;
    var M = Math.max(W, H);

    // 画一个椭圆光带（旋转 + 压扁的径向渐变）
    function streak(cx, cy, ang, len, thin, col, alpha) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      ctx.scale(1, thin);
      var rg = ctx.createRadialGradient(0, 0, 0, 0, 0, len);
      rg.addColorStop(0, 'rgba(' + col + ',' + alpha + ')');
      rg.addColorStop(0.55, 'rgba(' + col + ',' + (alpha * 0.45) + ')');
      rg.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.fillStyle = rg;
      ctx.fillRect(-len, -len, len * 2, len * 2);
      ctx.restore();
    }

    function frame(now) {
      var t = (now - t0) / 1000;
      ctx.clearRect(0, 0, W, H);

      // 中心过曝白闪：两个错位径向 + 一个斜向椭圆，边缘不是完美圆形
      var fa = t < 0.18 ? t / 0.18 : Math.max(0, 1 - (t - 0.18) / 0.9) * 0.55;
      if (fa > 0.003) {
        var fr = (0.25 + Math.min(t / 0.6, 1) * 1.1) * M;
        var g = ctx.createRadialGradient(W * 0.5, H * 0.5, 0, W * 0.5, H * 0.5, fr);
        g.addColorStop(0, 'rgba(255,255,255,' + Math.min(1, fa) + ')');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        var g2 = ctx.createRadialGradient(W * 0.42, H * 0.58, 0, W * 0.42, H * 0.58, fr * 0.72);
        g2.addColorStop(0, 'rgba(255,255,255,' + (fa * 0.8) + ')');
        g2.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g2;
        ctx.fillRect(0, 0, W, H);
        streak(W * 0.5, H * 0.5, -0.35, fr * 0.9, 0.38, '255,255,255', fa * 0.5);
      }

      // 彩色漏光：瓣状簇 + 斜向椭圆光带
      for (var i = 0; i < leaks.length; i++) {
        var L = leaks[i], lt = t - L.d;
        if (lt <= 0) continue;
        var env = Math.min(lt / 0.4, 1) * Math.max(0, Math.min(1, 1 - Math.max(0, lt - 0.55) / 0.9));
        if (env <= 0.01) continue;
        env *= 0.5;
        /* 漏光颜色降饱和：向白色混入约 1/3，色晕更柔和 */
        var mc0 = Math.round(L.c[0] * 0.68 + 255 * 0.32);
        var mc1 = Math.round(L.c[1] * 0.68 + 255 * 0.32);
        var mc2 = Math.round(L.c[2] * 0.68 + 255 * 0.32);
        var col = mc0 + ',' + mc1 + ',' + mc2;
        var ax = L.x * W + Math.sin(lt * 1.1 + i * 2.1) * W * 0.015;
        var ay = L.y * H + Math.cos(lt * 1.4 + i) * H * 0.012;

        // 斜向光带（胶片漏光常见的长条状痕迹）
        streak(ax, ay, L.a, M * 0.52, 0.16 + 0.05 * Math.sin(lt * 2 + i), col, env * 0.5);

        // 瓣状光斑簇：每瓣独立呼吸、漂移，叠出不规则轮廓
        for (var j = 0; j < L.lobes.length; j++) {
          var lb = L.lobes[j];
          var ph = lb[3];
          var breathe = 0.55 + 0.45 * Math.sin(lt * 2.3 + ph);
          var a = env * breathe;
          if (a <= 0.01) continue;
          var R = lb[2] * M * (0.9 + 0.25 * Math.sin(lt * 1.7 + ph * 1.3));
          var cx = ax + lb[0] * W + Math.sin(lt * 0.9 + ph) * W * 0.008;
          var cy = ay + lb[1] * H + Math.cos(lt * 1.2 + ph) * H * 0.008;
          var rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
          rg.addColorStop(0, 'rgba(' + col + ',' + a + ')');
          rg.addColorStop(0.45, 'rgba(' + col + ',' + (a * 0.5) + ')');
          rg.addColorStop(1, 'rgba(' + col + ',0)');
          ctx.fillStyle = rg;
          ctx.fillRect(0, 0, W, H);
        }
      }

      if (t < DUR) requestAnimationFrame(frame);
      else done();
    }
    var t0 = performance.now();
    requestAnimationFrame(frame);
  }

  var triggered = false;
  var armed = false;                 // 开屏后 0.6s 内忽略触发，防加载瞬间的误触
  setTimeout(function () { armed = true; }, 600);

  function play() {
    if (triggered || !armed) return;
    triggered = true;
    overlay.classList.add('playing');  // 隐藏 SCROLL 提示
    overlay.classList.add('leak');     // 黑场渐变为白
    playFlash(function () {
      if (prism) prism.destroy();
      finish();
    });
    // 白闪最亮时开始渐隐黑场、浮现页面内容
    setTimeout(function () {
      overlay.classList.add('done');
      document.body.classList.remove('locked');
      document.body.classList.add('ready');
    }, 950);
  }

  function onAct() { play(); }
  function onKey(e) {
    if ([' ', 'PageDown', 'ArrowDown', 'End'].indexOf(e.key) >= 0) play();
  }
  window.addEventListener('wheel', onAct, { passive: true });
  window.addEventListener('touchstart', onAct, { passive: true });
  window.addEventListener('keydown', onKey);
  window.addEventListener('mousedown', onAct);
  // 拖动滚动条不产生 wheel 事件，用 scroll 兜底（略过顶部的回弹）
  window.addEventListener('scroll', function () {
    if (window.scrollY > 10) play();
  }, { passive: true });

  // 测试钩子：手动播放漏光动画（不影响正常流程）
  window.__introTest = function (cb) { playFlash(cb || function () {}); };
})();
