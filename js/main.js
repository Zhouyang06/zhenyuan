/* 站点逻辑：加载 content.json → 应用文本/图片 → 初始化动效（Dither / FuzzyText / CoverFlow）→ 进场动画 */
(function () {
  'use strict';

  /* 每次进入/回到本页都显示在最顶部（含浏览器缓存恢复） */
  function goTop() { try { window.scrollTo(0, 0); } catch (e) {} }
  goTop();
  window.addEventListener('pageshow', goTop);
  window.addEventListener('load', goTop);

  async function loadContent() {
    try {
      var res = await fetch('content.json', { cache: 'no-store' });
      if (res.ok) return await res.json();
    } catch (e) { /* 本地 file:// 或首次部署时静默降级为 HTML 默认值 */ }
    return {};
  }

  function applyContent(content) {
    document.querySelectorAll('[data-cid]').forEach(function (el) {
      var cid = el.getAttribute('data-cid');
      var val = cid.split('.').reduce(function (o, k) {
        return (o && o[k] !== undefined) ? o[k] : undefined;
      }, content);
      if (val === undefined) return;
      if (el.tagName === 'IMG') el.src = val;
      else el.textContent = val;
    });
  }

  /* ====== Hero：FuzzyText 毛玻璃噪点大字 ====== */
  var fuzzyRef = null;
  function initFuzzy(content) {
    var el = document.getElementById('fuzzy-hero');
    if (!el || !window.createFuzzyText) return;
    if (fuzzyRef) { fuzzyRef.destroy(); fuzzyRef = null; }
    fuzzyRef = window.createFuzzyText(el, {
      text: (content.hero && content.hero.title) || 'ZhenYuan',
      fontSize: 'clamp(110px,17vw,250px)',
      fontWeight: 900,
      fontFamily: 'Georgia,"Times New Roman",serif',
      color: '#111114',
      enableHover: true,
      baseIntensity: 0.10,
      hoverIntensity: 0.32,
      fuzzRange: 18,
      fps: 60,
      direction: 'horizontal'
    });
  }

  /* ====== Dither 抖动波纹宽幅区（首页顶部 65:24） ====== */
  function initDither() {
    var el = document.getElementById('dither-frame');
    if (!el || !window.createDither) return;
    try {
      window.createDither(el, {
        waveSpeed: 0.05,
        waveFrequency: 3,
        waveAmplitude: 0.5,
        waveColor: [1, 1, 1],
        backgroundColor: [0, 0, 0],
        colorNum: 4,
        pixelSize: 4,
        disableAnimation: false,
        enableMouseInteraction: true,
        mouseRadius: 0.5
      });
    } catch (e) { /* WebGL 不可用时保持黑底 */ }
  }

  /* ====== Cover Flow 作品轮播 ====== */
  var DEFAULT_GALLERY = [
    { image: 'images/photo.jpg',    film: 'Kodak',        camera: 'Nikon F3hp', date: '2026.11.25' },
    { image: 'images/showcase.jpg', film: 'Ilford HP5',   camera: 'Nikon F3hp', date: '2026.10.02' },
    { image: 'images/philo1.jpg',   film: 'Kodak Tri-X',  camera: 'Nikon FM2',  date: '2026.08.15' },
    { image: 'images/philo2.jpg',   film: 'Ilford Delta', camera: 'Canon AE-1', date: '2026.07.20' },
    { image: 'images/philo3.jpg',   film: 'Fomapan 400',  camera: 'Nikon F3hp', date: '2026.06.11' }
  ];

  function initCoverflow(content) {
    var stage = document.getElementById('cf-stage');
    if (!stage) return;

    /* 纯照片模式（无标注）：优先 coverflow.images（管理处相册可选），否则退回图库封面 */
    var srcs = (content.coverflow && Array.isArray(content.coverflow.images) && content.coverflow.images.length)
      ? content.coverflow.images.filter(function (v) { return typeof v === 'string' && v; })
      : ((content.photo && Array.isArray(content.photo.gallery) && content.photo.gallery.length)
        ? content.photo.gallery.map(function (g) { return g.image; })
        : DEFAULT_GALLERY.map(function (g) { return g.image; }));
    if (!srcs.length) srcs = DEFAULT_GALLERY.map(function (g) { return g.image; });

    stage.innerHTML = '';
    var slides = srcs.map(function (src) {
      var d = document.createElement('div');
      d.className = 'cf-item';
      var img = document.createElement('img');
      img.src = src;
      img.alt = '';
      d.appendChild(img);
      stage.appendChild(d);
      return d;
    });

    var cur = 0, timer = null, hover = false;

    // 从分类页选择后回跳：?work=N 直接定位到所选作品（且暂停自动轮播，等用户交互）
    var wp = parseInt(new URLSearchParams(location.search).get('work'), 10);
    var pickArrive = !isNaN(wp);
    if (pickArrive) cur = ((wp % slides.length) + slides.length) % slides.length;

    function layout() {
      var n = slides.length;
      var base = Math.min(stage.clientWidth * 0.35, 360);
      slides.forEach(function (s, i) {
        var o = i - cur;
        // 环形处理：让最外侧滑向最短方向
        if (o > n / 2) o -= n;
        if (o < -n / 2) o += n;
        var ao = Math.abs(o);
        var x = 0, rot = 0, sc = 1, op = 1;
        if (o === 0) { x = 0; rot = 0; sc = 1; op = 1; }
        else {
          x = base * (ao === 1 ? 1 : ao === 2 ? 1.6 : 1.95) * Math.sign(o);
          rot = -58 * Math.sign(o);
          sc = ao === 1 ? 0.74 : ao === 2 ? 0.58 : 0.5;
          op = ao === 1 ? 0.9 : ao === 2 ? 0.5 : 0;
        }
        s.style.zIndex = String(30 - ao);
        s.style.opacity = String(op);
        s.style.pointerEvents = op === 0 ? 'none' : 'auto';
        s.style.transform = 'translate(-50%,-50%) translateX(' + x + 'px) rotateY(' + rot + 'deg) scale(' + sc + ')';
      });
    }

    function go(i) {
      var n = slides.length;
      if (!n) return;
      var next = ((i % n) + n) % n;
      if (next === cur) return;
      cur = next;
      layout();
    }

    function next() { go(cur + 1); }

    function play() { stop(); timer = setInterval(next, 3000); }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }

    slides.forEach(function (s, i) {
      s.addEventListener('click', function () { go(i); play(); });
    });
    stage.addEventListener('mouseenter', stop);
    stage.addEventListener('mouseleave', function () { if (hover) play(); });
    // 触屏滑动切换
    var tx = 0;
    stage.addEventListener('touchstart', function (e) { tx = e.touches[0].clientX; stop(); }, { passive: true });
    stage.addEventListener('touchend', function (e) {
      var dx = e.changedTouches[0].clientX - tx;
      if (Math.abs(dx) > 40) go(cur + (dx < 0 ? 1 : -1));
      play();
    }, { passive: true });

    window.addEventListener('resize', layout);
    layout();

    // 首屏进入视口后开始自动轮播（从分类页选定作品回跳时不自动轮播）
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          hover = en.isIntersecting;
          if (en.isIntersecting) { if (!pickArrive) play(); } else stop();
        });
      }, { threshold: 0.25 });
      io.observe(stage);
    } else { play(); }
  }

  /* ====== Sample Reels / Social Media 横杠：点击延伸铺满屏幕后跳转 ====== */
  function initBands() {
    document.querySelectorAll('.band').forEach(function (bar) {
      bar.addEventListener('click', function (e) {
        e.preventDefault();
        if (document.querySelector('.band-wipe')) return;
        var r = bar.getBoundingClientRect();
        var ov = document.createElement('div');
        ov.className = 'band-wipe';
        ov.style.top = r.top + 'px';
        ov.style.height = r.height + 'px';
        ov.innerHTML = '<span>' + bar.textContent.trim() + '</span>';
        document.body.appendChild(ov);
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { ov.classList.add('grow'); });
        });
        setTimeout(function () { location.href = bar.getAttribute('href'); }, 800); // 延长跳转时间确保动画完成
      });
    });
  }

  /* ====== Philosophy 照片展示柜（精选1）：按上传数量自适应密铺，大小不一 ====== */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ===== 正方形拼版：n 张照片拼成整体正方形，方块大小错落但不悬殊，并做错位摆放 =====
     G×G 单位网格；铺块只用 2×2（中方）与 1×1（小方），边长比最大 2:1，不出现过于庞大的单图；
     n≡2(mod 3) 无法纯方块拼方时补极少量 2×1/1×2 矩形。中块与矩形落点随机、横竖随机、图序打散，
     渲染时再给每块轻微转角与位移，形成手工拼贴感而非整齐表格。 */
  function solveSquare(n, rnd) {
    rnd = rnd || Math.random;
    function shuffled(len) {
      var a = [];
      for (var i = 0; i < len; i++) a.push(i);
      for (var j = len - 1; j > 0; j--) { var k = Math.floor(rnd() * (j + 1)); var tmp = a[j]; a[j] = a[k]; a[k] = tmp; }
      return a;
    }
    function spot(occ, G, w, h) {
      var ys = shuffled(G - h + 1), xs = shuffled(G - w + 1);
      for (var yi = 0; yi < ys.length; yi++)
        for (var xi = 0; xi < xs.length; xi++) {
          var y = ys[yi], x = xs[xi], ok = true;
          for (var dy = 0; dy < h && ok; dy++)
            for (var dx = 0; dx < w; dx++)
              if (occ[y + dy][x + dx]) { ok = false; break; }
          if (ok) return { x: x, y: y };
        }
      return null;
    }
    function mark(occ, q, w, h) {
      for (var dy = 0; dy < h; dy++)
        for (var dx = 0; dx < w; dx++) occ[q.y + dy][q.x + dx] = true;
    }
    for (var G = 2; G <= 6; G++) {
      var D = G * G - n;
      if (D < 0) continue;
      var r1 = D % 3;                 /* 矩形数量（0~2 消化余数） */
      var b2 = (D - r1) / 3;          /* 2×2 中方块数量 */
      if (4 * b2 + 2 * r1 > G * G || b2 + r1 > n) continue;
      var occ = [], tiles = [], i, q, okAll = true;
      for (i = 0; i < G; i++) occ.push(new Array(G).fill(false));
      for (i = 0; i < b2; i++) {
        q = spot(occ, G, 2, 2);
        if (!q) { okAll = false; break; }
        mark(occ, q, 2, 2); tiles.push({ x: q.x, y: q.y, s: 2 });
      }
      if (!okAll) continue;
      for (i = 0; i < r1; i++) {
        var hor = rnd() < 0.5;
        q = spot(occ, G, hor ? 2 : 1, hor ? 1 : 2);
        if (!q) q = spot(occ, G, hor ? 1 : 2, hor ? 2 : 1);
        if (!q) { okAll = false; break; }
        var rw = hor ? 2 : 1, rh = hor ? 1 : 2;
        mark(occ, q, rw, rh); tiles.push({ x: q.x, y: q.y, w: rw, h: rh });
      }
      if (!okAll) continue;
      for (var y = 0; y < G; y++)
        for (var x = 0; x < G; x++)
          if (!occ[y][x]) tiles.push({ x: x, y: y, s: 1 });
      if (tiles.length === n) {
        for (var z = tiles.length - 1; z > 0; z--) { var kk = Math.floor(rnd() * (z + 1)); var tt = tiles[z]; tiles[z] = tiles[kk]; tiles[kk] = tt; }
        return { G: G, tiles: tiles };
      }
    }
    return { G: 1, tiles: [{ x: 0, y: 0, s: 1 }] };
  }
  if (typeof window !== "undefined") window.__philoLayout = solveSquare;  /* 测试钩子 */

  function initPhiloMosaic(content) {
    var box = document.getElementById('philo-imgs');
    if (!box) return;
    var imgs = [];
    if (content && content.philosophy && Array.isArray(content.philosophy.images)) {
      imgs = content.philosophy.images.filter(function (v) { return typeof v === 'string' && v; });
    }
    if (!imgs.length && content && content.philosophy) {
      imgs = Object.keys(content.philosophy)
        .filter(function (k) { return /^img\d+$/.test(k); })
        .sort(function (a, b) { return parseInt(a.slice(3), 10) - parseInt(b.slice(3), 10); })
        .map(function (k) { return content.philosophy[k]; })
        .filter(function (v) { return typeof v === 'string' && v; });
    }
    if (!imgs.length) imgs = ['images/philo1.jpg', 'images/philo2.jpg', 'images/philo3.jpg'];

    var layRnd = mulberry32((0x9E3779B9 ^ (imgs.length * 2654435761)) >>> 0);
    var lay = solveSquare(imgs.length, layRnd);
    box.innerHTML = '';
    box.style.gridTemplateColumns = 'repeat(' + lay.G + ',1fr)';
    box.style.gridTemplateRows = 'repeat(' + lay.G + ',1fr)';
    lay.tiles.forEach(function (t, i) {
      var fig = document.createElement('figure');
      fig.className = 'pi-tile';
      var w = t.w || t.s, h = t.h || t.s;
      fig.style.gridColumn = (t.x + 1) + ' / span ' + w;
      fig.style.gridRow = (t.y + 1) + ' / span ' + h;
      fig.style.setProperty('--ti', i);
      fig.innerHTML = '<img src="' + imgs[i] + '" alt="理念配图 ' + (i + 1) + '" loading="lazy">';
      box.appendChild(fig);
    });
  }

  function initReveal() {
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('in'); });
      document.querySelectorAll('.hero-tagline').forEach(function (el) { el.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('in');
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });
    /* hero-tagline（Welcome / True Aspiration）滚入视口时才触发动画 */
    document.querySelectorAll('.hero-tagline').forEach(function (el) { io.observe(el); });
  }

  function initBarcode() {
    var bc = document.getElementById('barcode');
    if (!bc) return;
    bc.innerHTML = '';
    for (var i = 0; i < 34; i++) {
      var bar = document.createElement('i');
      bar.style.width = (Math.random() < 0.3 ? 3 : 1) + 'px';
      if (Math.random() < 0.2) bar.style.width = '5px';
      bc.appendChild(bar);
    }
  }

  /* ====== Social Links：从 content.social 渲染链接卡片 ====== */
  function initSocial(content) {
    var box = document.getElementById('social-links');
    if (!box || !content || !content.social) return;
    var imgEl = document.querySelector('[data-cid="social.image"]');
    if (imgEl && content.social.image) imgEl.src = content.social.image;
    var links = content.social.links;
    if (!Array.isArray(links)) return;
    box.innerHTML = '';
    links.forEach(function (lk) {
      var a = document.createElement('a');
      a.className = 'social-link';
      a.href = lk.url || '#';
      a.target = '_blank';
      a.rel = 'noopener';
      a.style.animationDelay = (0.05 + box.children.length * 0.13).toFixed(2) + 's'; /* 链接条错落入场 */
      var icon = document.createElement('span');
      icon.className = 'social-link-icon';
      icon.textContent = (lk.platform || '?').slice(0, 1);
      var name = document.createElement('span');
      name.className = 'social-link-name';
      name.textContent = lk.platform || '';
      a.appendChild(icon);
      a.appendChild(name);
      box.appendChild(a);
    });
  }

  /* ====== 菜单页（menu.html）：渲染 content.menu.items ====== */
  var DEFAULT_MENU = [
    { label: 'Sample Reels', sub: '作品集 · Film / Digital', href: 'category.html?cat=reels' },
    { label: 'Social Media', sub: '社交平台 · LINK',          href: 'social.html' },
    { label: 'ALL',          sub: '全部作品 · Works',         href: 'works.html' }
  ];

  function initMenu(content) {
    var box = document.getElementById('menu-list');
    if (!box) return;
    var items = (content.menu && Array.isArray(content.menu.items) && content.menu.items.length)
      ? content.menu.items : DEFAULT_MENU;
    box.innerHTML = '';
    items.forEach(function (it, i) {
      var a = document.createElement('a');
      a.className = 'menu-row reveal';
      a.href = it.href || '#';
      a.style.transitionDelay = (i * 0.08).toFixed(2) + 's';
      var lab = document.createElement('span');
      lab.className = 'menu-row-label';
      lab.textContent = it.label || '';
      var sub = document.createElement('span');
      sub.className = 'menu-row-sub';
      sub.textContent = it.sub || '';
      var ar = document.createElement('span');
      ar.className = 'menu-row-arrow';
      ar.textContent = '→';
      a.appendChild(lab);
      a.appendChild(sub);
      a.appendChild(ar);
      box.appendChild(a);
    });
  }

  (async function () {
    var content = await loadContent();
    applyContent(content);
    initFuzzy(content);
    initDither();
    initCoverflow(content);
    initPhiloMosaic(content);
    initSocial(content);
    initMenu(content);
    initReveal();
    initBarcode();
    initBands();

    // 兜底：若 intro.js 加载失败，保证页面最终可见
    setTimeout(function () {
      if (!window.__introStarted) {
        document.body.classList.remove('locked');
        document.body.classList.add('ready');
      }
    }, 6000);
  })();
})();
