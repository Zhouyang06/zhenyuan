/* =====================================================
   分类页选择器：液态玻璃方块剥离（无图） → 一级选择
   → 薄玻璃照片流（对角斜叠、鼠标左右滑动、居中右移）
   → 点击中间照片：摆正在中间 → 该图片集照片如树叶四面八方飞入堆叠
   → 作品集：宽幅封面 + 标签条（文字无黑底）+ 随机密铺网格
     （紧密缝隙/大小随机/鼠标边缘反光/点击放大）
   ===================================================== */
(function () {
  'use strict';

  /* 每次进入/回到本页都显示在最顶部（含浏览器缓存恢复） */
  function goTop() { try { window.scrollTo(0, 0); } catch (e) {} }
  goTop();
  window.addEventListener('pageshow', goTop);
  window.addEventListener('load', goTop);

  /* ---------- 数据：与首页 Cover Flow 同源（content.json） ---------- */
  var DEFAULT_GALLERY = [
    { image: 'images/photo.jpg',    film: 'Kodak',        camera: 'Nikon F3hp', date: '2026.11.25', location: '东京',   note: '傍晚的银座，夕阳穿过人群落在石板路上。', images: ['images/photo.jpg', 'images/philo1.jpg', 'images/philo3.jpg'] },
    { image: 'images/showcase.jpg', film: 'Ilford HP5',   camera: 'Nikon F3hp', date: '2026.10.02', location: '上海',   note: '雨后的梧桐道，黑白的颗粒刚刚好。', images: ['images/showcase.jpg', 'images/philo2.jpg'] },
    { image: 'images/philo1.jpg',   film: 'Kodak Tri-X',  camera: 'Nikon FM2',  date: '2026.08.15', location: '北京',   note: '胡同里卖冰棍的爷爷，童年的夏天又回来了。', images: ['images/philo1.jpg', 'images/photo.jpg', 'images/philo2.jpg'] },
    { image: 'images/philo2.jpg',   film: 'Ilford Delta', camera: 'Canon AE-1', date: '2026.07.20', location: '京都',   note: '鸭川边的夕凉，蝉鸣还没停。', images: ['images/philo2.jpg', 'images/showcase.jpg', 'images/philo3.jpg'] },
    { image: 'images/philo3.jpg',   film: 'Fomapan 400',  camera: 'Nikon F3hp', date: '2026.06.11', location: '布拉格', note: '红屋顶下的一只白猫，看了镜头很久。', images: ['images/philo3.jpg', 'images/philo1.jpg'] }
  ];
  var GALLERY = DEFAULT_GALLERY.map(normalize);

  function normalize(g) {
    if (Array.isArray(g.images) && g.images.length) g.images = g.images.slice();
    else g.images = g.image ? [g.image] : [];
    return g;
  }
  function brandOf(film) { return (film || '').split(' ')[0]; }
  function unique(arr) {
    var seen = {}, out = [];
    arr.forEach(function (v) { if (v && !seen[v]) { seen[v] = 1; out.push(v); } });
    return out;
  }
  function mod(n, m) { return ((n % m) + m) % m; }
  function hashStr(s) {
    var h = 2166136261;
    s = String(s || '');
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- 状态 ---------- */
  var veil = document.getElementById('sel-veil');
  var stage = document.getElementById('ring-stage');
  var caption = document.getElementById('ring-caption');
  var card = null;
  var busy = false;
  var streamLive = false;
  var lightbox = null;

  var EASE = 'cubic-bezier(.16,1,.3,1)';

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---------- 液态玻璃方块：从横条剥离 → 居中（纯玻璃，无图） ---------- */
  function startPeel(bar) {
    if (busy || card) return;
    busy = true;
    var cat = bar.getAttribute('data-cat');
    var name = bar.querySelector('.cat-bar-name').textContent.trim();
    var r = bar.getBoundingClientRect();

    veil.classList.add('on');

    card = document.createElement('div');
    card.className = 'peel-card';
    card.style.left = r.left + 'px';
    card.style.top = r.top + 'px';
    card.style.width = r.width + 'px';
    card.style.height = r.height + 'px';
    card.innerHTML =
      '<span class="peel-label">' + name + '</span>' +
      '<button class="sel-close" type="button" aria-label="关闭">×</button>' +
      '<div class="sel-ui"></div>';
    document.body.appendChild(card);

    card.querySelector('.sel-close').addEventListener('click', closePeel);
    buildLevel(cat, card.querySelector('.sel-ui'));

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        card.classList.add('peeling');
        var cw = Math.min(window.innerWidth * 0.82, 540);
        if (window.innerWidth < 560) cw = window.innerWidth * 0.88;
        var ch = cw * (window.innerWidth < 560 ? 0.82 : 0.72);
        card.style.left = (window.innerWidth - cw) / 2 + 'px';
        card.style.top = (window.innerHeight - ch) / 2 + 'px';
        card.style.width = cw + 'px';
        card.style.height = ch + 'px';
      });
    });

    setTimeout(function () {
      card.classList.add('settled');
      card.classList.remove('peeling');
      busy = false;
    }, 760);
  }

  function closePeel() {
    if (!card || busy) return;
    busy = true;
    card.style.opacity = '0';
    veil.classList.remove('on');
    setTimeout(function () {
      if (card) { card.remove(); card = null; }
      busy = false;
    }, 420);
  }

  /* ---------- 一级选择：Film 选胶卷品牌 / Digital 选器材（先按 cat 字段分池） ---------- */
  function catPool(cat) {
    var pool = GALLERY.filter(function (g) { return (g.cat || 'film') === cat; });
    return pool.length ? pool : GALLERY.slice();
  }
  function pickSets(cat, val) {
    var pool = catPool(cat);
    if (val === 'Others') return pool.slice(); /* Others = 浏览该分类全部 */
    return pool.filter(function (g) {
      return cat === 'film' ? brandOf(g.film) === val : g.camera === val;
    });
  }

  /* 内容在方块飞行途中就构建好（不可见），到达后选项直接在标题周围展开——无二次跳转 */
  function buildLevel(cat, ui) {
    var pool = catPool(cat);
    var opts = cat === 'film'
      ? unique(pool.map(function (g) { return brandOf(g.film); }))
      : unique(pool.map(function (g) { return g.camera; }));
    opts.push('Others');

    var crumbText = cat === 'film' ? 'Film · 选择胶卷品牌' : 'Digital · 选择器材';
    var titleText = cat === 'film' ? 'Film' : 'Digital';
    var hintText = cat === 'film' ? 'Choose film stock' : 'Choose camera';

    ui.innerHTML =
      '<p class="sel-crumb">' + crumbText + '</p>' +
      '<h2 class="sel-title">' + titleText + '</h2>' +
      '<div class="sel-opts">' + opts.map(function (o, i) {
        return '<button class="sel-opt" type="button" data-val="' + o + '" style="animation-delay:' + (i * 70) + 'ms">' + o + '</button>';
      }).join('') + '</div>' +
      '<p class="sel-hint">' + hintText + '</p>';

    ui.querySelectorAll('.sel-opt').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var val = btn.getAttribute('data-val');
        var sets = pickSets(cat, val);
        if (!sets.length) sets = catPool(cat).slice();
        ui.style.transition = 'opacity .22s ease, filter .22s ease';
        ui.style.opacity = '0';
        ui.style.filter = 'blur(6px)';
        card.animate([
          { opacity: 1, transform: 'scale(1)' },
          { opacity: 0, transform: 'scale(.92)' }
        ], { duration: 380, easing: 'ease-in', fill: 'forwards' });
        setTimeout(function () {
          if (card) { card.remove(); card = null; }
          enterStream(sets);
        }, 400);
      });
    });
  }

  /* ---------- 薄玻璃照片流：对角斜叠横跨整屏，鼠标左右滑动选择 ---------- */
  function enterStream(sets) {
    sets.forEach(normalize);
    /* 预加载本批全部图片，避免切换/飞入时解码卡顿 */
    sets.forEach(function (g) {
      g.images.forEach(function (src) { var im = new Image(); im.src = src; });
    });
    stage.innerHTML = '';
    stage.classList.add('stream');
    goTop();   /* 进入照片流时回到页面顶部，避免固定卡片被滚动位遮挡 */
    var back = document.getElementById('back-arrow');
    if (back) { back.classList.add('show'); back.onclick = closeStream; }

    var M = Math.max(13, sets.length + 4);
    var cards = [];
    var cardImgs = [];   /* 缓存 img 引用，避免每帧 querySelector */
    var cardD = [];      /* 每张卡当前的 d 值（JS 缓存，替代每帧 setAttribute） */
    var cardLast = [];   /* 每张卡上一帧写入的样式值（值不变就不碰 DOM） */
    for (var i = 0; i < M; i++) {
      var c = document.createElement('div');
      c.className = 'stream-card';
      /* sc-inner 包装层：入场动画作用在内层，不影响卡片的定位 transform/opacity */
      c.innerHTML = '<div class="sc-inner"><img alt=""><span class="sc-glow"></span></div>';
      stage.appendChild(c);
      cards.push(c);
      cardImgs.push(c.querySelector('img'));
      cardD.push(0);
      cardLast.push({ w: '', h: '', z: '', op: '', tf: '', go: '', lx: '', ly: '', center: false, src: '' });
      /* 入场：内层错落淡入上浮（卡片定位完全不受影响） */
      c.querySelector('.sc-inner').animate([
        { opacity: 0, transform: 'translateY(30px) scale(.96)' },
        { opacity: 1, transform: 'translateY(0) scale(1)' }
      ], { duration: 560, delay: 60 + i * 38, easing: EASE, fill: 'backwards' });
    }

    caption.innerHTML = '<b></b><span></span><p class="ring-hint">左右滑动 / 滚轮 选择 · 点击中间照片打开</p>';
    caption.classList.add('on');

    var P = 0, PT = 0, raf = 0, idx = -1;
    var mx = -9999, my = -9999; /* 鼠标位置（玻璃边缘反光用） */
    var lastInteract = 0;        /* 最后一次滚轮/拖拽时间（用于停顿后吸附整数档） */
    var lastCw = 0;              /* 卡片尺寸缓存（仅窗口变化时重写 width/height） */
    var capB = caption.querySelector('b'), capS = caption.querySelector('span');
    streamLive = true;

    function frame() {
      if (!streamLive) { raf = 0; return; }
      /* 停止操作约 200ms 后，轻柔吸附到最近的整数档——一页"落定"成摞 */
      if (!dragging && performance.now() - lastInteract > 200) {
        var snapT = Math.round(PT);
        if (Math.abs(PT - snapT) > 0.003) PT += (snapT - PT) * 0.2;
        else PT = snapT;
      }
      P += (PT - P) * 0.12;
      var vw = window.innerWidth, vh = window.innerHeight;
      /* 卡片尺寸：横版照片（翻文件堆样式——最前面一张完整大图） */
      var cw = Math.max(260, Math.min(vw * 0.6, 600));
      var ch = cw * 0.68;
      var sizeChanged = cw !== lastCw;
      if (sizeChanged) lastCw = cw;
      /* 面前大图的位置（略偏下，给身后摞的顶边条带留空间） */
      var x0 = vw / 2;
      var y0 = vh * 0.56;
      /* 身后文件摞：每张只露出顶部一条（阶梯高度），摞深超过 stackN 的完全隐藏 */
      var stackStep = Math.max(12, ch * 0.045);
      var stackN = 9;
      var curIdx = mod(Math.round(P), sets.length);
      if (curIdx !== idx) idx = curIdx;

      for (var i2 = 0; i2 < M; i2++) {
        var c2 = cards[i2];
        var L2 = cardLast[i2];
        var pos = i2 - P;
        var d = mod(pos + M / 2, M) - M / 2; /* 0=居中，>0 右上远去，<0 左下远去 */
        cardD[i2] = d;
        var sIdx = mod(Math.round(P + d), sets.length);
        var src = sets[sIdx].images[0];
        var img = cardImgs[i2];
        if (L2.src !== src) { L2.src = src; img.src = src; }
        var x, y, z, sc, op;
        var ad = Math.abs(d);
        var isCenter = ad < 0.5;
        if (d >= 0) {
          /* 面前大图(d=0) + 身后文件摞：整摞对齐，只有每张顶部阶梯条带露出来 */
          x = x0;
          y = y0 - d * stackStep;
          sc = 1 - d * 0.012;
          z = 100 - Math.round(d * 9);
          /* 摞深渐隐：超出 stackN 的卡片柔和淡出，不瞬间消失 */
          op = Math.max(0, Math.min(1, (stackN + 1 - d) * 1.4));
        } else {
          /* 已翻过的卡片：平整地垂直向下滑落出屏（不漂移、不倾斜），压在最上层，
             靠自身实体遮挡身后的摞——落出屏幕后下一张自然完整露出，无需黑屏 */
          var fa = ad;
          x = x0;
          y = y0 + fa * (vh * 0.44 + ch * 0.4);
          sc = 1;
          z = 160 - Math.round(fa * 20);         /* 掉落中的纸压在最上层，滑落全程可见 */
          var fe = Math.max(0, 1 - fa / 1.15);
          op = fe * fe;
        }
        /* —— 以下样式仅在值变化时写入 DOM，静止帧近乎零写入（卡顿优化核心） —— */
        if (sizeChanged) {
          var ws = cw + 'px', hs = ch + 'px';
          if (L2.w !== ws) { L2.w = ws; c2.style.width = ws; }
          if (L2.h !== hs) { L2.h = hs; c2.style.height = hs; }
        }
        var zs = String(z);
        if (L2.z !== zs) { L2.z = zs; c2.style.zIndex = zs; }
        var ops = op.toFixed(3);
        if (L2.op !== ops) { L2.op = ops; c2.style.opacity = ops; }
        var tf = 'translate(-50%,-50%) translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0px) ' +
          'rotateZ(0deg) scale(' + sc.toFixed(3) + ')';
        if (L2.tf !== tf) { L2.tf = tf; c2.style.transform = tf; }
        if (L2.center !== isCenter) { L2.center = isCenter; c2.classList.toggle('center', isCenter); }
        /* 薄玻璃边缘反光：鼠标贴近该卡片某侧边缘时，仅那侧边缘泛起反光（中心不亮） */
        var dispW = cw * sc, dispH = ch * sc;
        var Lx = x - dispW / 2, Rx = x + dispW / 2, Ty = y - dispH / 2, By = y + dispH / 2;
        var inside = mx >= Lx && mx <= Rx && my >= Ty && my <= By;
        var dd;
        if (inside) dd = Math.min(mx - Lx, Rx - mx, my - Ty, By - my);
        else { var nx = Math.max(Lx, Math.min(mx, Rx)); var ny = Math.max(Ty, Math.min(my, By)); dd = Math.sqrt((mx - nx) * (mx - nx) + (my - ny) * (my - ny)); }
        var go = (dd < 190 && op > 0.5) ? (1 - dd / 190) : 0;
        var gos = go.toFixed(2);
        if (go > 0) {
          var lxs = ((mx - Lx) / dispW * 100).toFixed(1) + '%';
          var lys = ((my - Ty) / dispH * 100).toFixed(1) + '%';
          if (L2.go !== gos) { L2.go = gos; c2.style.setProperty('--go', gos); }
          if (L2.lx !== lxs) { L2.lx = lxs; c2.style.setProperty('--lx', lxs); }
          if (L2.ly !== lys) { L2.ly = lys; c2.style.setProperty('--ly', lys); }
        } else if (L2.go !== '0.00') {
          L2.go = '0.00'; L2.lx = ''; L2.ly = '';
          c2.style.setProperty('--go', '0');
        }
      }

      /* 文字只在切页时更新 */
      var cg = sets[curIdx];
      var bText = cg.film + ' · ' + cg.camera;
      var sText = cg.date + (cg.location ? ' · ' + cg.location : '');
      if (capB.textContent !== bText) capB.textContent = bText;
      if (capS.textContent !== sText) capS.textContent = sText;
      raf = requestAnimationFrame(frame);
    }

    var dragging = false, sx = 0, moved = 0;
    function onDown(e) {
      dragging = true; moved = 0; sx = e.clientX;
      stage.classList.add('grabbing');
    }
    function onMove(e) {
      if (!dragging) return;
      var dx = e.clientX - sx; sx = e.clientX;
      moved = Math.max(moved, Math.abs(dx));
      PT += dx * 0.013;
      lastInteract = performance.now();
    }
    function onUp() {
      dragging = false;
      moved = 0;
      lastInteract = performance.now();
      stage.classList.remove('grabbing');
    }
    function onWheel(e) {
      e.preventDefault();
      PT += (e.deltaY + Math.abs(e.deltaX) * Math.sign(e.deltaX || 1) * 1.6) * 0.004;
      lastInteract = performance.now();
    }
    function onMouse(e) { mx = e.clientX; my = e.clientY; }
    function onClick(e) {
      var c3 = e.target.closest ? e.target.closest('.stream-card') : null;
      if (!c3 || moved > 10) return;
      var ci = cards.indexOf(c3);
      var d = ci >= 0 ? cardD[ci] : 0;
      if (Math.abs(d) < 0.5) {
        confirmStream(sets, mod(Math.round(P), sets.length), c3);
      } else {
        PT = Math.round(P + d);
        lastInteract = performance.now();
      }
    }

    stage.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    stage.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('mousemove', onMouse, { passive: true });
    stage.addEventListener('click', onClick);

    streamCleanup = function () {
      stage.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      stage.removeEventListener('wheel', onWheel);
      window.removeEventListener('mousemove', onMouse);
      stage.removeEventListener('click', onClick);
      if (raf) cancelAnimationFrame(raf);
      raf = 0; streamLive = false;
    };

    raf = requestAnimationFrame(frame);
  }

  var streamCleanup = null;

  function closeStream() {
    if (streamCleanup) { streamCleanup(); streamCleanup = null; }
    stage.innerHTML = '';
    stage.classList.remove('stream', 'grabbing');
    caption.classList.remove('on');
    veil.classList.remove('on');
    var back = document.getElementById('back-arrow');
    if (back) back.classList.remove('show');
    busy = false;
  }

  /* ---------- 确认：选中图摆正 → 图片集照片如树叶四面八方飞入堆叠 ---------- */
  function confirmStream(sets, idx0, centerCard) {
    if (!streamLive) return;
    if (streamCleanup) { streamCleanup(); streamCleanup = null; }
    stage.classList.remove('grabbing');
    var g = sets[idx0];

    var vw = window.innerWidth, vh = window.innerHeight;

    /* 其余玻璃卡向外飘散 */
    stage.querySelectorAll('.stream-card').forEach(function (c2) {
      if (c2 === centerCard) return;
      var bx = (Math.random() - 0.5) * vw * 1.2;
      var by = (Math.random() - 0.5) * vh * 1.2;
      c2.animate([
        { opacity: 1, transform: c2.style.transform },
        { opacity: 0, transform: 'translate(-50%,-50%) translate3d(' + (vw / 2 + bx).toFixed(0) + 'px,' + (vh / 2 + by).toFixed(0) + 'px,0) rotate(' + ((Math.random() - 0.5) * 80).toFixed(1) + 'deg) scale(.6)' }
      ], { duration: 620, easing: 'cubic-bezier(.45,0,.7,.45)', fill: 'forwards' });
    });

    /* 预加载并预解码该集全部图片：树叶飞入时图已就绪且已解码，不出白片、不掉帧 */
    g.images.forEach(function (p) {
      var im = new Image();
      im.src = p;
      if (im.decode) im.decode().catch(function () {});
    });

    /* 选中卡：平滑滑行到屏幕中央。保持原尺寸不变（不改宽高/比例，杜绝重排卡顿） */
    /* 与照片流 frame() 完全相同的尺寸公式——淡接底图与玻璃卡严丝合缝 */
    var cw = Math.max(260, Math.min(vw * 0.6, 600));
    var ch = cw * 0.68;
    centerCard.classList.add('center');
    centerCard.animate([
      { transform: centerCard.style.transform },
      { transform: 'translate(-50%,-50%) translate3d(' + (vw / 2) + 'px,' + (vh / 2) + 'px,0) rotateY(0deg) rotateZ(0deg) scale(1)' }
    ], { duration: 620, easing: EASE, fill: 'forwards' });

    var imgs = g.images.slice();
    var leaves = imgs.slice(1);
    while (leaves.length < 11) leaves.push(imgs[leaves.length % imgs.length]);
    leaves = leaves.slice(0, 11);

    /* 滑行期间就把飞入节点全部建好挂到卡片下层（z-index 低于玻璃卡，此刻不可见），
       到点只播放动画——避免同一帧创建 12 个节点+首次绘制造成的卡顿 */
    var ratios = [1.55, 1.0, 0.82, 1.25, 1.4, 1.05, 0.9, 1.6, 1.1, 0.75, 1.3];
    var widths2 = [cw, 280, 240, 320, 290, 250, 260, 340, 270, 230, 310];
    var cxp = vw / 2, cyp = vh / 2;

    var base = document.createElement('div');
    base.className = 'leaf-pile';
    base.style.width = cw + 'px';
    base.style.height = ch + 'px';
    base.style.zIndex = '2';
    base.style.opacity = '0';
    base.innerHTML = '<img src="' + imgs[0] + '" alt="" style="width:100%;height:100%;object-fit:cover;display:block;">';
    stage.appendChild(base);

    var leafEls = [];
    for (var k = 0; k < leaves.length; k++) {
      (function (k2) {
        var rp = document.createElement('div');
        rp.className = 'leaf-pile';
        rp.style.width = widths2[(k2 % widths2.length)] + 'px';
        rp.style.aspectRatio = String(ratios[k2 % ratios.length]);
        rp.style.zIndex = String(30 + k2);
        rp.style.opacity = '0';
        rp.innerHTML = '<img src="' + leaves[k2] + '" alt="" style="width:100%;height:100%;object-fit:cover;display:block;">';
        stage.appendChild(rp);

        /* 从屏幕外四面八方连续飞入：全程运动不中断，仅末段轻微过冲后归位 */
        var a = Math.random() * Math.PI * 2;
        var D = Math.sqrt(vw * vw + vh * vh) / 2 + 320;
        var fx = Math.cos(a) * D, fy = Math.sin(a) * D;
        var startRot = (Math.random() - 0.5) * 220;
        var ox = (Math.random() - 0.5) * 280;
        var oy = (Math.random() - 0.5) * 180;
        var endRot = (Math.random() - 0.5) * 30;
        function T(x, y, rot, sc) {
          return 'translate(-50%,-50%) translate3d(' + x.toFixed(0) + 'px,' + y.toFixed(0) + 'px,0) rotate(' + rot.toFixed(1) + 'deg) scale(' + sc + ')';
        }
        leafEls.push({
          el: rp,
          frames: [
            { opacity: 0, transform: T(cxp + fx, cyp + fy, startRot, 0.82) },
            { opacity: 1, offset: 0.18, transform: T(cxp + fx * 0.62, cyp + fy * 0.62, startRot * 0.6, 0.9) },
            { opacity: 1, offset: 0.74, transform: T(cxp + ox * 1.5, cyp + oy * 1.5 - 26, endRot * 1.35, 1.03) },
            { opacity: 1, transform: T(cxp + ox, cyp + oy, endRot, 1) }
          ],
          opts: { duration: 980 + k2 * 28, delay: k2 * 52, easing: 'cubic-bezier(.22,.61,.21,1)', fill: 'both' }
        });
      })(k);
    }

    setTimeout(function () {
      /* 交叉淡接：底层主照片与玻璃卡【同位置、同尺寸、同比例】，只做透明度溶解，
         双方 scale 都恒定为 1——视觉上照片毫无跳缩，只是玻璃质感溶解为实体照片 */
      base.animate([
        { opacity: 0, transform: 'translate(-50%,-50%) translate3d(' + cxp + 'px,' + cyp + 'px,0) scale(1)' },
        { opacity: 1, transform: 'translate(-50%,-50%) translate3d(' + cxp + 'px,' + cyp + 'px,0) scale(1)' }
      ], { duration: 520, easing: EASE, fill: 'forwards' });

      /* 选中卡淡出溶解（主照片已在其下方同尺寸就位，无任何缩放） */
      centerCard.animate([
        { opacity: 1, transform: 'translate(-50%,-50%) translate3d(' + cxp + 'px,' + cyp + 'px,0) scale(1)' },
        { opacity: 0, transform: 'translate(-50%,-50%) translate3d(' + cxp + 'px,' + cyp + 'px,0) scale(1)' }
      ], { duration: 420, easing: 'ease-out', fill: 'forwards' });

      leafEls.forEach(function (L) { L.el.animate(L.frames, L.opts); });

      /* 淡出完成后移除玻璃卡节点（此时已不可见，不产生任何视觉跳变） */
      setTimeout(function () {
        stage.querySelectorAll('.stream-card').forEach(function (n) { n.remove(); });
      }, 640);

      setTimeout(function () { showPortfolio(g); }, 2600);
    }, 620);
  }

  /* ---------- 作品集长页面：宽幅封面 + 标签条 + 随机密铺 ---------- */
  function showPortfolio(g) {
    goTop();
    stage.innerHTML = '';
    stage.classList.remove('stream', 'grabbing');
    caption.classList.remove('on');
    veil.classList.remove('on');

    var canvas = document.getElementById('portfolio-canvas');
    var back = document.getElementById('back-arrow');
    document.body.classList.add('portfolio-show');
    if (canvas) { canvas.classList.add('show'); canvas.innerHTML = ''; }
    if (back) { back.classList.add('show'); back.onclick = resetPortfolio; }

    var head = document.createElement('div'); head.className = 'wp-headspace';
    canvas.appendChild(head);

    var banner = document.createElement('div');
    banner.className = 'wp-banner';
    banner.innerHTML = '<img src="' + g.images[0] + '" alt="">';
    canvas.appendChild(banner);
    /* 封面宽幅：浮起淡入 */
    banner.animate([
      { opacity: 0, transform: 'translateY(34px) scale(1.012)' },
      { opacity: 1, transform: 'none' }
    ], { duration: 780, easing: EASE, fill: 'both' });

    var brandName = brandOf(g.film);
    var tag = document.createElement('div');
    tag.className = 'wp-tag';
    tag.innerHTML =
      '<div>' +
        '<div class="wpt-brand">' + escapeHtml(brandName) + '</div>' +
        '<div class="wpt-film">' + escapeHtml(g.film) + '</div>' +
      '</div>' +
      '<div class="wpt-meta">' +
        '<div class="wpt-place">' + escapeHtml(g.location || '— — —') + '</div>' +
        '<div class="wpt-date">' + escapeHtml(g.date || '') + '</div>' +
      '</div>' +
      '<div class="wpt-note">' + escapeHtml(g.note || '') + '</div>';
    canvas.appendChild(tag);
    /* 标签条：封面之后浮起 */
    tag.animate([
      { opacity: 0, transform: 'translateY(24px)' },
      { opacity: 1, transform: 'none' }
    ], { duration: 640, delay: 200, easing: EASE, fill: 'both' });

    /* 随机密铺：每个图片集用自己的种子，布局各不相同但稳定 */
    var mosaic = document.createElement('div');
    mosaic.className = 'wp-mosaic';
    var rng = mulberry32(hashStr(g.film + '|' + g.date + '|' + (g.location || '')));
    var tiles = [];
    g.images.forEach(function (src, i) {
      var t = document.createElement('div');
      t.className = 'mp-tile';
      var colSpan = rng() < 0.22 ? 2 : 1;
      var rowRnd = rng();
      var rowSpan = rowRnd < 0.16 ? 3 : (rowRnd < 0.5 ? 2 : 1);
      t.style.gridColumn = 'span ' + colSpan;
      t.style.gridRow = 'span ' + rowSpan;
      t.innerHTML = '<img src="' + src + '" alt="" loading="lazy">';
      t.addEventListener('click', function () { openLightbox(g.images, i); });
      mosaic.appendChild(t);
      tiles.push(t);
    });
    canvas.appendChild(mosaic);

    tiles.forEach(function (t, i) {
      t.animate([
        { opacity: 0, transform: 'translateY(22px) scale(.98)' },
        { opacity: 1, transform: 'none' }
      ], { duration: 620, delay: 340 + i * 46, easing: EASE, fill: 'both' });
    });

    /* 鼠标跟随：只在图片靠近鼠标一侧的边缘泛起反光，照片像浮在屏幕上 */
    var glowEls = [banner].concat(tiles);
    var lightFn = function (e) {
      glowEls.forEach(function (t) {
        var r = t.getBoundingClientRect();
        var inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        var dd;
        if (inside) {
          /* 在图片内：距最近的边越近反光越强（中心几乎没有） */
          dd = Math.min(e.clientX - r.left, r.right - e.clientX, e.clientY - r.top, r.bottom - e.clientY);
        } else {
          /* 在图片外：取到图片的直线距离 */
          var nx = Math.max(r.left, Math.min(e.clientX, r.right));
          var ny = Math.max(r.top, Math.min(e.clientY, r.bottom));
          dd = Math.sqrt((e.clientX - nx) * (e.clientX - nx) + (e.clientY - ny) * (e.clientY - ny));
        }
        if (dd < 200) {
          t.classList.add('wp-glow');
          t.style.setProperty('--lx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
          t.style.setProperty('--ly', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
          t.style.setProperty('--go', (1 - dd / 200).toFixed(2));
        } else {
          t.classList.remove('wp-glow');
          t.style.setProperty('--go', '0');
        }
      });
    };
    window.addEventListener('mousemove', lightFn, { passive: true });
    canvas._lightFn = lightFn;

    canvas.scrollTop = 0;
    busy = false;
  }

  /* ---------- 图片放大灯箱 ---------- */
  function openLightbox(list, i) {
    if (lightbox) lightbox.remove();
    var lb = document.createElement('div');
    lb.className = 'wp-lightbox';
    lb.innerHTML =
      '<button class="lb-x" type="button" aria-label="关闭">×</button>' +
      '<button class="lb-prev" type="button" aria-label="上一张">‹</button>' +
      '<img class="lb-img" alt="">' +
      '<button class="lb-next" type="button" aria-label="下一张">›</button>';
    document.body.appendChild(lightbox = lb);

    function show(k) {
      i = mod(k, list.length);
      lb.querySelector('.lb-img').src = list[i];
    }
    function close() {
      lb.classList.remove('on');
      setTimeout(function () { if (lb.parentNode) lb.remove(); if (lightbox === lb) lightbox = null; }, 320);
      window.removeEventListener('keydown', onKey);
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') show(i + 1);
      else if (e.key === 'ArrowLeft') show(i - 1);
    }
    lb.querySelector('.lb-x').addEventListener('click', close);
    lb.querySelector('.lb-prev').addEventListener('click', function (e) { e.stopPropagation(); show(i - 1); });
    lb.querySelector('.lb-next').addEventListener('click', function (e) { e.stopPropagation(); show(i + 1); });
    lb.addEventListener('click', function (e) { if (e.target === lb) close(); });
    window.addEventListener('keydown', onKey);

    show(i);
    requestAnimationFrame(function () { requestAnimationFrame(function () { lb.classList.add('on'); }); });
  }

  function resetPortfolio() {
    goTop();
    var canvas = document.getElementById('portfolio-canvas');
    if (canvas) {
      if (canvas._lightFn) window.removeEventListener('mousemove', canvas._lightFn);
      canvas.innerHTML = '';
      canvas.classList.remove('show');
    }
    if (lightbox) { lightbox.remove(); lightbox = null; }
    stage.innerHTML = '';
    stage.classList.remove('stream', 'grabbing', 'live', 'flat');
    var back = document.getElementById('back-arrow');
    if (back) { back.classList.remove('show'); back.onclick = null; }
    document.body.classList.remove('portfolio-show');
    caption.classList.remove('on');
    veil.classList.remove('on');
    streamLive = false;
    if (streamCleanup) { streamCleanup(); streamCleanup = null; }
    busy = false;
    var c2 = document.getElementById('portfolio-canvas');
    if (c2) c2.scrollTop = 0;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- 绑定横条 ---------- */
  document.querySelectorAll('.cat-bar').forEach(function (bar) {
    bar.addEventListener('click', function () { startPeel(bar); });
  });

  /* ---------- 滚动显现（footer 等 .reveal 元素，与首页同语言） ---------- */
  (function initReveal() {
    var els = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
    els.forEach(function (el) { io.observe(el); });
  })();

  /* ---------- 导航条联动：作品集(reels)/社交平台(social) = 两个分类入口 ----------
     跨分类：正常跳转；同分类：不刷新页面，直接退回到 Film/Digital 选择起点 */
  (function bindNavLinks() {
    var hereCat = new URLSearchParams(location.search).get('cat') === 'social' ? 'social' : 'reels';
    document.querySelectorAll('.nav-link[data-navcat]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        if (a.getAttribute('data-navcat') !== hereCat) return; /* 跨分类 → 浏览器正常跳转 */
        e.preventDefault();
        if (document.body.classList.contains('portfolio-show')) resetPortfolio();
        else if (streamLive) closeStream();
        else if (card) closePeel();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  })();

  /* ---------- 加载作品数据（失败则用默认） ---------- */
  fetch('content.json', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : {}; })
    .then(function (c) {
      if (c && c.photo && Array.isArray(c.photo.gallery) && c.photo.gallery.length) {
        GALLERY = c.photo.gallery.map(normalize);
      }
      /* 分类页头图（"真愿"上方大图）：管理处可换（content.category.image） */
      if (c && c.category && c.category.image) {
        var hero = document.getElementById('cat-hero-img');
        if (hero && hero.getAttribute('src') !== c.category.image) hero.src = c.category.image;
      }
    })
    .catch(function () { /* 静默使用默认 */ });
})();
