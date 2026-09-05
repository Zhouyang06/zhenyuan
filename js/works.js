/* works.html — 作品流页逻辑：开场闪动序列 → 作品行渲染（横向滚动/错落入场）→ 详情画布（缩略图轮换+大图切换+黑色玻璃导航） */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var WORKS = [];          /* 排序后的作品集（晚→早） */
  var curWork = 0;         /* 当前打开的作品索引 */
  var vTarget = 0;         /* 目标虚拟位置（环形无限，活动区 [n, 2n-1]） */
  var vRender = 0;         /* 已烘焙进 transform 的虚拟位置 */
  var nImg = 1;            /* 当前作品图片数（单份） */
  var cycleTimer = null;   /* 缩略图轮换定时器 */
  var wheelAcc = 0;        /* 滚轮累积量（降低灵敏度） */
  var lastStepAt = 0;      /* 上次步进时间（节流冷却） */

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  /* 按拍摄日期从晚到早排序（date 形如 2026.11.25） */
  function sortWorks(gallery) {
    return gallery.slice().sort(function (a, b) {
      var da = Date.parse((a.date || '').replace(/\./g, '-')) || 0;
      var db = Date.parse((b.date || '').replace(/\./g, '-')) || 0;
      return db - da;
    });
  }

  /* ============ 开场：zhenyuan/真愿 急速交替 → 光芒 → 闪白 → Works 浮现 ============ */
  function playIntro() {
    var intro = $('#works-intro');
    if (!intro) { finishIntro(); return; }
    if (new URLSearchParams(location.search).has('nointro')) { intro.remove(); finishIntro(); return; }

    /* 故障式闪动：真愿/zhenyuan 双层叠加、随机错开闪烁 + 微小横向抖动 */
    var cn = intro.querySelector('.wi-cn');
    var en = intro.querySelector('.wi-en');
    var flick = setInterval(function () {
      var a = Math.random() < 0.55;            /* 中文字层随机亮/灭 */
      cn.style.opacity = a ? '1' : '0';
      en.style.opacity = a ? (Math.random() < 0.5 ? '1' : '0') : '1';
      cn.style.marginLeft = (Math.random() * 4 - 2).toFixed(1) + 'px';  /* 错开抖动 */
      en.style.marginLeft = (Math.random() * 4 - 2).toFixed(1) + 'px';
    }, 70);

    function stepFlash() {
      clearInterval(flick);
      cn.style.opacity = '0';
      en.style.opacity = '0';
      intro.classList.add('flash');         /* 闪白 */
      setTimeout(function () {
        intro.classList.add('away');        /* 揭开页面 */
        finishIntro();
        setTimeout(function () { intro.remove(); }, 700);
      }, 340);
    }
    setTimeout(stepFlash, 1200);

    intro.addEventListener('click', function () { /* 点击跳过 */
      clearInterval(flick);
      intro.remove();
      finishIntro();
    });
  }

  function finishIntro() {
    document.body.classList.remove('locked');
    document.body.classList.add('works-ready'); /* Works 向上浮现到顶部 */
  }

  /* ============ 作品行渲染：纯横向滚动画廊（文字注释与序号进入详情后才显示） ============ */
  function renderRows() {
    var box = $('#w-rows');
    if (!box) return;
    box.innerHTML = '';

    WORKS.forEach(function (w, i) {
      var row = document.createElement('div');
      row.className = 'w-row' + (i % 2 ? ' rev' : ''); /* 相邻行滚动方向相反 */

      var mq = document.createElement('div');
      mq.className = 'w-marquee';
      var track = document.createElement('div');
      track.className = 'w-track';
      var imgs = (w.images && w.images.length ? w.images.slice() : [w.image || '']);
      while (imgs.length < 4) imgs = imgs.concat(imgs);      /* 不够 4 张则复制补满 */
      var loop = imgs.concat(imgs);                          /* 无缝循环：内容 ×2 */
      loop.forEach(function (src) {
        var im = document.createElement('img');
        im.src = src;
        im.alt = '';
        im.loading = 'lazy';
        track.appendChild(im);
      });
      mq.appendChild(track);

      row.appendChild(mq);
      row.addEventListener('click', function () { openDetail(i); });
      box.appendChild(row);
    });

    /* 行错落入场（滚动到可见时） */
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
        });
      }, { threshold: 0.12 });
      box.querySelectorAll('.w-row').forEach(function (r) { io.observe(r); });
    } else {
      box.querySelectorAll('.w-row').forEach(function (r) { r.classList.add('in'); });
    }
  }

  /* ============ 详情画布（图2）：缩略图竖排轮换 → 居中即选中 → 大图同步 ============ */
  function openDetail(i) {
    curWork = i;
    var w = WORKS[i];
    var canvas = $('#wd-canvas');
    if (!canvas) return;

    $('#wd-num').textContent = pad2(i + 1);

    /* 缩略图竖排：内容 ×3 实现无缝循环（活动区为中段，滚到边缘时瞬间平移等效位） */
    var inner = $('#wd-stripinner');
    inner.innerHTML = '';
    var imgs = (w.images && w.images.length ? w.images : [w.image || '']);
    nImg = imgs.length;
    for (var rep = 0; rep < 3; rep++) {
      imgs.forEach(function (src, j) {
        var t = document.createElement('img');
        t.className = 'wd-thumb' + (j === 0 ? ' cur' : '');
        t.src = src;
        t.alt = '';
        t.dataset.j = j;
        t.addEventListener('click', function (e) {
          e.stopPropagation();
          jumpTo(j);        /* 点击缩略图：跳到中段对应张 */
        });
        inner.appendChild(t);
      });
    }
    vTarget = vRender = nImg; /* 从中段第 0 张开始（视觉与第 0 张相同） */

    /* 中部名称列表：全部作品名，当前加粗（同图2） */
    var names = $('#wd-names');
    names.innerHTML = '';
    WORKS.forEach(function (wk, j) {
      var el = document.createElement('span');
      el.textContent = wk.film || 'Untitled';
      if (j === i) { el.className = 'cur wd-film'; }
      el.addEventListener('click', function () {
        if (j !== curWork) { closeDetail(); openDetail(j); }
      });
      names.appendChild(el);
    });

    /* 元信息 */
    $('#wd-meta').innerHTML =
      (w.camera ? 'Camera · ' + esc(w.camera) + '<br>' : '') +
      (w.date ? 'Date · ' + esc(w.date) + '<br>' : '') +
      (w.location ? 'Location · ' + esc(w.location) : '');

    setBigImg(imgs[0]);
    canvas.hidden = false;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { canvas.classList.add('show'); });
    });
    document.body.classList.add('works-detail'); /* 导航条转黑色液态玻璃 */
    positionStrip(true);
    markCur();
    startCycle();
  }

  function closeDetail() {
    stopCycle();
    var canvas = $('#wd-canvas');
    if (canvas) canvas.classList.remove('show');
    document.body.classList.remove('works-detail');
    setTimeout(function () { if (canvas && !canvas.classList.contains('show')) canvas.hidden = true; }, 600);
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  /* 大图淡入淡出切换 */
  function setBigImg(src) {
    var img = $('#wd-bigimg');
    if (!img) return;
    img.style.opacity = '0';
    setTimeout(function () {
      img.onload = function () { img.style.opacity = '1'; };
      img.src = src;
      if (img.complete) img.style.opacity = '1';
    }, 200);
  }

  /* ---- 环形滚动的核心：虚拟位置 v（可无限增减），内容×3 周期性复制 ----
     vRender = 已烘焙进 transform 的位置；越界时按“当前视觉相位 ± n*步距”平移，
     任意时刻（含动画途中）都保持相位，肉眼完全无缝、绝无抽动 */
  function pitchPx() {
    var c = $('#wd-stripinner').children;
    return c.length > 1 ? (c[1].offsetTop - c[0].offsetTop) : 0;
  }
  function curTranslateY() { /* 读取当前实际 transform 的 translateY（含动画中途相位） */
    var inner = $('#wd-stripinner');
    var m = getComputedStyle(inner).transform;
    if (!m || m === 'none') return 0;
    var parts = m.match(/matrix.*\((.+)\)/);
    return parts ? parseFloat(parts[1].split(',')[5]) : 0;
  }
  function applyV(vv, instant) {
    var inner = $('#wd-stripinner');
    var strip = $('#wd-strip');
    var c0 = inner.children[0];
    if (!c0 || !strip) return;
    var y = c0.offsetTop + c0.offsetHeight / 2 - strip.clientHeight / 2 + vv * pitchPx();
    if (instant) inner.style.transition = 'none';
    inner.style.transform = 'translateY(' + (-y) + 'px)';
    if (instant) { void inner.offsetHeight; inner.style.transition = ''; }
  }
  function positionStrip(instant) { applyV(vRender, instant); }

  function markCur() {
    var curJ = ((Math.round(vTarget) % nImg) + nImg) % nImg;
    Array.prototype.forEach.call($('#wd-stripinner').children, function (el) {
      el.classList.toggle('cur', +el.dataset.j === curJ);
    });
    var w = WORKS[curWork];
    setBigImg(w.images[curJ] || w.image || '');
  }

  /* 环形步进：d=±1。vTarget 越出活动区 [n, 2n-1] 时，
     以“当前视觉相位 ± 一个周期”重烘焙 vRender 并同步平移 vTarget——任意时刻无缝 */
  function shift(d) {
    vTarget += d;
    if (vTarget < nImg || vTarget > 2 * nImg - 1) {
      var c0 = $('#wd-stripinner').children[0];
      var strip = $('#wd-strip');
      var base = c0.offsetTop + c0.offsetHeight / 2 - strip.clientHeight / 2;
      var visualV = (-curTranslateY() - base) / pitchPx(); /* 当前视觉对应的虚拟位置（含中途相位） */
      vRender = visualV + (vTarget < nImg ? nImg : -nImg);
      vTarget += (vTarget < nImg ? nImg : -nImg);
      positionStrip(true);                                 /* 相位保持的无缝平移 */
    }
    applyV(vTarget, false);
    markCur();
  }

  function jumpTo(j) {
    stopCycle();            /* 手动选择后停止自动轮换，交给用户控制 */
    vTarget = nImg + j;
    applyV(vTarget, false);
    markCur();
  }

  function startCycle() {
    stopCycle();
    cycleTimer = setInterval(function () {
      if (WORKS[curWork]) shift(1);
    }, 2400);
  }
  function stopCycle() { if (cycleTimer) { clearInterval(cycleTimer); cycleTimer = null; } }

  /* ============ 启动 ============ */
  (async function () {
    var gallery = [];
    try {
      var res = await fetch('content.json', { cache: 'no-store' });
      if (res.ok) {
        var c = await res.json();
        if (c && c.photo && Array.isArray(c.photo.gallery) && c.photo.gallery.length) gallery = c.photo.gallery;
      }
    } catch (e) { /* 静默使用空数据 */ }
    if (!gallery.length) gallery = [{ image: 'images/photo.jpg', film: 'Kodak', camera: 'Nikon F3hp', date: '2026.11.25', location: '东京', images: ['images/photo.jpg', 'images/showcase.jpg', 'images/philo1.jpg', 'images/philo2.jpg', 'images/philo3.jpg'] }];
    WORKS = sortWorks(gallery);
    renderRows();
    playIntro();
  })();

  $('#wd-back') && $('#wd-back').addEventListener('click', closeDetail);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDetail(); });

  /* 详情左侧缩略图流：滚轮上下滚动即跟随切换（环形无限循环）。
     灵敏度削减：deltaY 累积到 100 才走一步 + 320ms 冷却，快速滚动也不会狂转 */
  $('#wd-strip') && $('#wd-strip').addEventListener('wheel', function (e) {
    e.preventDefault();
    if (!WORKS[curWork] || nImg < 2) return;
    stopCycle();                                  /* 手动滚动后停止自动轮换 */
    var now = performance.now();
    if (now - lastStepAt < 320) { wheelAcc = 0; return; }   /* 冷却期内忽略 */
    wheelAcc += e.deltaY;
    if (Math.abs(wheelAcc) < 100) return;                  /* 累积不足一步 */
    var d = wheelAcc > 0 ? 1 : -1;
    wheelAcc = 0;
    lastStepAt = now;
    shift(d);                                     /* 向下滚=下一张，向上滚=上一张 */
  }, { passive: false });
})();
