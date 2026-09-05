/*!
 * 管理处（多级控制台）
 * 访问控制（两层）：
 *   1. 密码门：密码 → SHA-256 比对（PASSWORD_HASH）
 *   2. 发布/写入权限：本机用本地接口（X-Admin-Key=密码哈希）；GitHub Pages 用你的 Token（仅存本次会话）
 * 结构：面包屑 + 灰导航 + Control 标题 + 黑菜单列（一级）→ 灰内容区（二级/三级）
 */
(function () {
  'use strict';

  /* ====== 配置 ====== */
  // 管理密码的 SHA-256（十六进制）。当前默认密码：zhenyuan2026 —— 上线前请修改！
  var PASSWORD_HASH = 'a607a4d7f3b063962461d0716988f0e84ed1d2e223b92da02fd8ebaa6f6d32bc';
  var BRANCH = 'main';
  var CONTENT_PATH = 'content.json';
  var IS_LOCAL = location.hostname === '127.0.0.1' || location.hostname === 'localhost';

  var $ = function (s) { return document.querySelector(s); };

  /* ====== 全局状态 ====== */
  var content = {};          // content.json 全量（所有编辑直接改这里）
  var state = { section: 'featured', rollIdx: null };
  var upFiles = [];          // 批量上传暂存

  /* ====== 工具 ====== */
  async function sha256Hex(str) {
    var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  }
  function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function b64Utf8(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    bytes.forEach(function (b) { bin += String.fromCharCode(b); });
    return btoa(bin);
  }
  function fileToBase64(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result).split(',')[1]); };
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }
  function setStatus(msg) { $('#status').textContent = msg; }
  function getRepo() { return $('#gh-repo').value.trim(); }
  function getToken() { return $('#gh-token').value.trim(); }
  function adminKey() { return sessionStorage.getItem('zy_key') || ''; }

  /* ====== 面包屑 ====== */
  function setCrumb(parts) {
    var el = $('#crumb');
    el.innerHTML = '';
    parts.forEach(function (p, i) {
      if (i) {
        var sp = document.createElement('span');
        sp.textContent = '›';
        el.appendChild(sp);
      }
      var b = document.createElement(i === parts.length - 1 ? 'b' : 'span');
      b.textContent = p;
      if (i < parts.length - 1) b.style.color = '#9a9aa0';
      el.appendChild(b);
    });
  }

  /* ====== GitHub Contents API（部署到 GitHub Pages 时使用） ====== */
  function apiHeaders(token) {
    return { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json' };
  }
  async function putFile(token, repo, path, contentB64, message) {
    var sha;
    var g = await fetch('https://api.github.com/repos/' + repo + '/contents/' + path + '?ref=' + BRANCH,
      { headers: apiHeaders(token) });
    if (g.ok) { sha = (await g.json()).sha; }
    var body = { message: message, content: contentB64, branch: BRANCH };
    if (sha) body.sha = sha;
    var r = await fetch('https://api.github.com/repos/' + repo + '/contents/' + path, {
      method: 'PUT',
      headers: Object.assign(apiHeaders(token), { 'Content-Type': 'application/json' }),
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      var j = await r.json().catch(function () { return {}; });
      throw new Error(j.message || ('HTTP ' + r.status));
    }
  }

  /* ====== 保存（本机接口 / GitHub API 双通道） ====== */
  async function saveContent() {
    var json = JSON.stringify(content, null, 2) + '\n';
    if (IS_LOCAL) {
      var r = await fetch('/api/save-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminKey() },
        body: json
      });
      if (!r.ok) {
        var j = await r.json().catch(function () { return {}; });
        throw new Error(j.error || ('HTTP ' + r.status));
      }
      return '已保存！本机服务器已更新，刷新站点页面即可看到。';
    }
    var token = getToken(), repo = getRepo();
    if (!token || !repo) {
      $('#pub-setup').hidden = false;
      throw new Error('部署到 GitHub Pages 后保存需要仓库和 Token，请在"发布设置"中填写');
    }
    await putFile(token, repo, CONTENT_PATH, b64Utf8(json), 'update site content via admin');
    return '已保存并发布！GitHub Pages 会在 1-2 分钟内自动更新。';
  }

  /* ====== 图片上传（本机接口 / GitHub API 双通道），返回相对路径 ====== */
  function buildImagePath(fileName) {
    var ext = (String(fileName).split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    if (ext === 'jpeg') ext = 'jpg';
    var base = String(fileName).replace(/\.[^.]+$/, '').replace(/[^\w\-]/g, '_').slice(0, 40) || 'img';
    return 'images/uploads/' + Date.now() + '-' + base + '.' + ext;
  }
  /* 图片压缩：JPG 大图缩到长边 2000px、质量 82%（PNG 超 1.5MB 才转、白底；GIF/WEBP 等原样传） */
  async function compressImage(file) {
    var type = (file.type || '').toLowerCase();
    var isJpg = type === 'image/jpeg';
    var isPng = type === 'image/png';
    if (!isJpg && !(isPng && file.size > 1572864)) return file;   // 其余格式 / 小 PNG 不处理
    if (isJpg && file.size < 1572864) return file;                // JPG 小于 1.5MB 不处理
    try {
      var bmp = await createImageBitmap(file);
      var scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
      if (scale >= 1 && isJpg && file.size <= 3145728) { if (bmp.close) bmp.close(); return file; }
      var cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(bmp.width * scale));
      cv.height = Math.max(1, Math.round(bmp.height * scale));
      var ctx = cv.getContext('2d');
      if (isPng) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); }
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
      if (bmp.close) bmp.close();
      var blob = await new Promise(function (res) { cv.toBlob(res, 'image/jpeg', 0.82); });
      if (!blob || blob.size >= file.size) return file;           // 压缩反而变大 → 放弃，用原图
      return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: Date.now() });
    } catch (e) { return file; }                                  // 浏览器不支持 → 原图直传
  }
  /* TIFF 自动转换：浏览器不显示 TIFF → UTIF 解码 → 缩到长边 2000px、白底、转 JPG（质量 82%） */
  async function convertTiff(file) {
    var isTiff = /\.tiff?$/i.test(file.name) || (file.type || '').toLowerCase() === 'image/tiff';
    if (!isTiff) return file;
    if (typeof UTIF === 'undefined') throw new Error('TIFF 解码库未加载（js/utif.js）');
    var buf = await file.arrayBuffer();
    var ifds = UTIF.decode(buf);
    if (!ifds || !ifds.length) throw new Error('TIFF 解析失败：' + file.name);
    UTIF.decodeImage(buf, ifds[0], ifds);
    var w = ifds[0].width, h = ifds[0].height;
    if (!w || !h) throw new Error('TIFF 尺寸异常：' + file.name);
    var rgba = UTIF.toRGBA8(ifds[0]);          // 取第一页（多页 TIFF 只转首页）
    var src = document.createElement('canvas');
    src.width = w; src.height = h;
    src.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
    var scale = Math.min(1, 2000 / Math.max(w, h));
    var cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(w * scale));
    cv.height = Math.max(1, Math.round(h * scale));
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);   // 透明区域转白底
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, cv.width, cv.height);
    var blob = await new Promise(function (res) { cv.toBlob(res, 'image/jpeg', 0.82); });
    if (!blob) throw new Error('TIFF 转 JPG 失败：' + file.name);
    return new File([blob], file.name.replace(/\.(tiff?|TIFF?)$/, '') + '.jpg', { type: 'image/jpeg', lastModified: Date.now() });
  }
  window.__adminTiffTest = convertTiff;   // 测试钩子（与 intro.js __introTest 同一约定）
  async function uploadOne(file) {
    file = await convertTiff(file);
    file = await compressImage(file);
    var path = buildImagePath(file.name);
    var b64 = await fileToBase64(file);
    if (IS_LOCAL) {
      var r = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminKey() },
        body: JSON.stringify({ path: path, b64: b64 })
      });
      if (!r.ok) {
        var j = await r.json().catch(function () { return {}; });
        throw new Error(j.error || ('HTTP ' + r.status));
      }
      return path;
    }
    var token = getToken(), repo = getRepo();
    if (!token || !repo) {
      $('#pub-setup').hidden = false;
      throw new Error('部署到 GitHub Pages 后上传需要仓库和 Token，请在"发布设置"中填写');
    }
    await putFile(token, repo, path, b64, 'upload image: ' + path);
    return path;
  }
  /* 选择文件 → 逐张上传 → cb(路径数组) 回填 */
  function bindImgUpload(fileInput, cb) {
    fileInput.addEventListener('change', async function () {
      var files = Array.from(fileInput.files || []);
      if (!files.length) return;
      try {
        var paths = [];
        for (var i = 0; i < files.length; i++) {
          setStatus('正在上传图片…（' + (i + 1) + '/' + files.length + '）');
          paths.push(await uploadOne(files[i]));
        }
        cb(paths);
        setStatus('上传完成，点"保存并发布"后全站生效。');
      } catch (err) {
        setStatus('上传失败：' + err.message);
      }
      fileInput.value = '';
    });
  }

  /* ====== 照片池：全站所有照片（无标注网格，供点选） ====== */
  function allPhotos() {
    var seen = {}, out = [];
    function add(p) {
      if (typeof p !== 'string' || !p || seen[p]) return;
      seen[p] = 1;
      out.push(p);
    }
    (content.coverflow && Array.isArray(content.coverflow.images) ? content.coverflow.images : []).forEach(add);
    (content.philosophy && Array.isArray(content.philosophy.images) ? content.philosophy.images : []).forEach(add);
    ((content.photo && content.photo.gallery) || []).forEach(function (g) {
      add(g.image);
      (g.images || []).forEach(add);
    });
    if (content.showcase) add(content.showcase.image);
    if (content.social) add(content.social.image);
    return out;
  }

  /* ====== 左侧一级菜单 ====== */
  var SECTIONS = [
    { id: 'featured',  name: '精选1',      render: renderFeatured },
    { id: 'coverflow', name: 'Coverflow',  render: renderCoverflow },
    { id: 'rolls',     name: '照片与胶卷', render: renderRolls },
    { id: 'upload',    name: '批量上传',   render: renderUpload },
    { id: 'text',      name: '文字内容',   render: renderText },
    { id: 'social',    name: '社交平台',   render: renderSocial }
  ];

  function renderMenu() {
    var menu = $('#admin-menu');
    menu.innerHTML = '';
    var label = document.createElement('span');
    label.className = 'menu-sub';
    label.textContent = 'Control';
    menu.appendChild(label);
    var gapBefore = document.createElement('span');
    gapBefore.className = 'menu-gap';
    menu.appendChild(gapBefore);
    SECTIONS.forEach(function (sec) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = sec.name;
      if (state.section === sec.id) b.classList.add('cur');
      b.addEventListener('click', function () {
        state.section = sec.id;
        state.rollIdx = null;
        renderMenu();
        renderSection();
      });
      menu.appendChild(b);
    });
    var gap = document.createElement('span');
    gap.className = 'menu-gap';
    menu.appendChild(gap);
  }

  function renderSection() {
    var box = $('#admin-content');
    box.innerHTML = '';
    /* 三级详情：选中某卷 → 卷编辑表单 */
    if (state.section === 'rolls' && state.rollIdx != null && content.photo.gallery[state.rollIdx]) {
      setCrumb(['管理处', '照片与胶卷', rollName(state.rollIdx)]);
      renderRollForm(box, state.rollIdx);
      return;
    }
    var sec = SECTIONS.filter(function (s) { return s.id === state.section; })[0] || SECTIONS[0];
    setCrumb(['管理处', sec.name]);
    sec.render(box);
  }

  function rollName(idx) {
    var g = ((content.photo && content.photo.gallery) || [])[idx] || {};
    return g.film || g.camera || ('胶卷 ' + (idx + 1));
  }

  /* ====== 通用小构件 ====== */
  function h2(box, text, hint) {
    var h = document.createElement('h2');
    h.textContent = text;
    box.appendChild(h);
    if (hint) {
      var p = document.createElement('p');
      p.className = 'sec-hint';
      p.textContent = hint;
      box.appendChild(p);
    }
  }
  function field(label, input) {
    var lab = document.createElement('label');
    lab.className = 'field';
    var k = document.createElement('span');
    k.className = 'field-key';
    k.textContent = label;
    lab.appendChild(k);
    lab.appendChild(input);
    return lab;
  }
  function textInput(value, oninput, placeholder) {
    var i = document.createElement('input');
    i.type = 'text';
    i.value = value || '';
    if (placeholder) i.placeholder = placeholder;
    i.addEventListener('input', function () { oninput(i.value); });
    return i;
  }
  function areaInput(value, oninput, rows) {
    var t = document.createElement('textarea');
    t.rows = rows || 3;
    t.value = value || '';
    t.addEventListener('input', function () { oninput(t.value); });
    return t;
  }

  /* 有序图片列表：缩略图（封面标亮 + × 删除 + ↑↓ 调序） */
  function thumbList(arr, onChange, opts) {
    opts = opts || {};
    var wrap = document.createElement('div');
    wrap.className = 'gimgs-list';
    arr.forEach(function (p, i) {
      var th = document.createElement('div');
      th.className = 'gimg-thumb' + (i === 0 && !opts.noCover ? ' is-cover' : '');
      th.innerHTML = '<img src="' + escapeAttr(p) + '" alt="" loading="lazy" decoding="async">';
      if (opts.indexes) {
        var idx = document.createElement('span');
        idx.className = 'gimg-idx';
        idx.textContent = String(i + 1);
        th.appendChild(idx);
      } else if (i === 0 && !opts.noCover) {
        var fl = document.createElement('span');
        fl.className = 'gimg-flag';
        fl.textContent = '封面';
        th.appendChild(fl);
      }
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'gimg-del';
      del.title = '移除';
      del.textContent = '×';
      del.addEventListener('click', function () {
        arr.splice(i, 1);
        onChange();
      });
      th.appendChild(del);
      if (!opts.noReorder && arr.length > 1) {
        ['↑', '↓'].forEach(function (arrow, k) {
          var to = k === 0 ? i - 1 : i + 1;
          if (to < 0 || to >= arr.length) return;
          var mv = document.createElement('button');
          mv.type = 'button';
          mv.className = 'gimg-up';
          mv.style.bottom = k === 0 ? '3px' : '24px';
          mv.title = k === 0 ? '前移' : '后移';
          mv.textContent = arrow;
          mv.addEventListener('click', function () {
            var t = arr[i]; arr[i] = arr[to]; arr[to] = t;
            onChange();
          });
          th.appendChild(mv);
        });
      }
      wrap.appendChild(th);
    });
    return wrap;
  }

  /* 上传追加（多选） */
  function addUploadButton(arr, onChange, label) {
    var lab = document.createElement('label');
    lab.className = 'gimgs-add';
    lab.textContent = label || '＋ 上传图片';
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.multiple = true;
    inp.setAttribute('data-gupload-set', '');
    lab.appendChild(inp);
    bindImgUpload(inp, function (paths) {
      paths.forEach(function (p) { arr.push(p); });
      onChange();
    });
    return lab;
  }

  /* 照片池网格（无标注，点选切换；就地刷新，不重建面板） */
  function poolGrid(box, selected, onToggle) {
    var pool = allPhotos();
    if (!pool.length) {
      var p0 = document.createElement('p');
      p0.className = 'pool-empty';
      p0.textContent = '还没有照片：先到"批量上传"或各板块上传照片。';
      box.appendChild(p0);
      return;
    }
    var grid = document.createElement('div');
    grid.className = 'pool';
    var recs = [];
    function refresh() {
      recs.forEach(function (rec) {
        var idx = selected.indexOf(rec.path);
        rec.el.classList.toggle('picked', idx >= 0);
        var badge = rec.el.querySelector('.pi-idx');
        if (idx >= 0) {
          if (badge) { badge.textContent = String(idx + 1); }
          else {
            var b = document.createElement('span');
            b.className = 'pi-idx';
            b.textContent = String(idx + 1);
            rec.el.appendChild(b);
          }
        } else if (badge) { badge.remove(); }
      });
    }
    pool.forEach(function (p) {
      var it = document.createElement('button');
      it.type = 'button';
      it.className = 'pool-item';
      var im = document.createElement('img');
      im.src = p;
      im.alt = '';
      im.loading = 'lazy';
      im.decoding = 'async';
      it.appendChild(im);
      it.addEventListener('click', function () {
        onToggle(p);
        refresh();
      });
      recs.push({ path: p, el: it });
      grid.appendChild(it);
    });
    refresh();
    box.appendChild(grid);
  }

  /* ====== 精选1（philosophy.images，首页按数量自适应排列） ====== */
  function renderFeatured(box) {
    h2(box, '精选1', '首页理念区（Sensuous Subjective）展示柜的照片。按上传数量自动调整排列方式，无需其他设置。');
    var imgs = content.philosophy.images;
    /* 局部重绘：只重建缩略图条，不重建整个面板（避免图片重载、滚动跳动） */
    var listWrap = document.createElement('div');
    function rerenderList() { listWrap.innerHTML = ''; listWrap.appendChild(thumbList(imgs, rerenderList, { noCover: true })); }
    rerenderList();
    box.appendChild(listWrap);
    box.appendChild(addUploadButton(imgs, rerenderList, '＋ 上传照片到精选1'));

    var t = document.createElement('p');
    t.className = 'sec-hint';
    t.style.marginTop = '22px';
    t.textContent = '从已有照片中点选加入（再次点击移除）：';
    box.appendChild(t);
    poolGrid(box, imgs, function (p) {
      var i = imgs.indexOf(p);
      if (i >= 0) imgs.splice(i, 1); else imgs.push(p);
      rerenderList();
    });
  }

  /* ====== Coverflow（coverflow.images，首页纯照片轮播） ====== */
  function renderCoverflow(box) {
    h2(box, 'Coverflow', '首页 Photography 区的轮播照片。只显示照片，不带任何文字标注；按下面点选的顺序轮播。');
    var imgs = content.coverflow.images;
    var listWrap = document.createElement('div');
    function rerenderList() { listWrap.innerHTML = ''; listWrap.appendChild(thumbList(imgs, rerenderList, { noCover: true, indexes: true })); }
    rerenderList();
    box.appendChild(listWrap);
    var t = document.createElement('p');
    t.className = 'sec-hint';
    t.textContent = '全部照片（像手机相册一样，无标注）——点选加入轮播 / 再点一次移除：';
    box.appendChild(t);
    poolGrid(box, imgs, function (p) {
      var i = imgs.indexOf(p);
      if (i >= 0) imgs.splice(i, 1); else imgs.push(p);
      rerenderList();
    });
  }

  /* ====== 照片与胶卷：二级=卷列表，三级=卷详情编辑 ====== */
  function renderRolls(box) {
    renderGallery(box, content.photo.gallery);
  }

  function renderGallery(sec, items) {   /* 二级：按 Film / Digital 分组列出胶卷 */
    h2(sec, '照片与胶卷', '先选择一个胶卷，再进入编辑该卷的照片和文字（三级界面）。');
    ['film', 'digital'].forEach(function (cat) {
      var title = document.createElement('p');
      title.className = 'cat-group-title';
      title.textContent = cat === 'film' ? 'FILM · 胶卷' : 'DIGITAL · 数码';
      sec.appendChild(title);
      var wrap = document.createElement('div');
      wrap.className = 'gallery-wrap';
      var any = false;
      items.forEach(function (g, i) {
        if ((g.cat || 'film') !== cat) return;
        any = true;
        wrap.appendChild(galleryRow(g, i));
      });
      if (!any) {
        var empty = document.createElement('p');
        empty.className = 'pool-empty';
        empty.textContent = '暂无内容';
        wrap.appendChild(empty);
      }
      sec.appendChild(wrap);
    });

    var add = document.createElement('button');
    add.type = 'button';
    add.className = 'gallery-add';
    add.textContent = '＋ 新建胶卷';
    add.addEventListener('click', function () {
      content.photo.gallery.push({
        cat: 'film', film: '新胶卷', camera: '', date: '', location: '', note: '', images: [], image: ''
      });
      state.rollIdx = content.photo.gallery.length - 1;
      renderSection();
      setStatus('已新建胶卷，填写信息并保存后生效。');
    });
    sec.appendChild(add);
  }

  function galleryRow(item, idx) {   /* 二级列表里的一张卷卡片 */
    var it = document.createElement('button');
    it.type = 'button';
    it.className = 'roll-card';
    it.innerHTML =
      '<img src="' + escapeAttr(item.image || (item.images && item.images[0]) || '') + '" alt="" loading="lazy" decoding="async">' +
      '<span class="rc-meta">' +
        '<span class="rc-tag ' + escapeAttr(item.cat || 'film') + '">' + escapeHtml(item.cat || 'film') + '</span>' +
        '<span class="rc-film">' + escapeHtml(item.film || '未命名') + '</span>' +
        '<span class="rc-sub">' + escapeHtml((item.date || '—') + ' · ' + (item.location || '—') + ' · ' + ((item.images || []).length) + ' 张') + '</span>' +
      '</span>';
    it.addEventListener('click', function () {
      state.rollIdx = idx;
      renderSection();
    });
    return it;
  }

  /* 三级：单卷编辑 */
  function renderRollForm(box, idx) {
    var roll = content.photo.gallery[idx];
    var back = document.createElement('button');
    back.type = 'button';
    back.className = 'ad-back';
    back.textContent = '‹ 返回列表';
    back.addEventListener('click', function () {
      state.rollIdx = null;
      renderSection();
    });
    box.appendChild(back);

    h2(box, roll.film || '未命名胶卷', '编辑这一卷的分类、文字和全部照片。改动后点右上角"保存并发布"。');

    var grid = document.createElement('div');
    grid.className = 'form-grid';

    var catSel = document.createElement('select');
    catSel.innerHTML = '<option value="film">Film（胶卷）</option><option value="digital">Digital（数码）</option>';
    catSel.value = roll.cat || 'film';
    catSel.addEventListener('change', function () { roll.cat = catSel.value; });
    grid.appendChild(field('分类（决定出现在哪个分类页）', catSel));

    grid.appendChild(field('胶卷 / 作品名', textInput(roll.film, function (v) { roll.film = v; }, '例如：Kodak Portra 400')));
    grid.appendChild(field('相机 / 器材', textInput(roll.camera, function (v) { roll.camera = v; }, '例如：Nikon F3hp')));
    grid.appendChild(field('日期', textInput(roll.date, function (v) { roll.date = v; }, '例如：2026.11.25')));
    grid.appendChild(field('拍摄地点', textInput(roll.location, function (v) { roll.location = v; }, '例如：北京')));
    grid.appendChild(field('', document.createElement('span'))); /* 占位保持两列对齐 */
    box.appendChild(grid);

    box.appendChild(field('作品说明', areaInput(roll.note, function (v) { roll.note = v; })));

    /* 本卷照片（div.field 避免嵌套 label） */
    var imgsField = document.createElement('div');
    imgsField.className = 'field';
    var imgsKey = document.createElement('span');
    imgsKey.className = 'field-key';
    imgsKey.textContent = '本卷全部照片（第一张为封面；× 移除，↑↓ 调序）';
    imgsField.appendChild(imgsKey);
    var imgsWrap = document.createElement('div');
    imgsField.appendChild(imgsWrap);
    var hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.setAttribute('data-gfield', 'images');
    hidden.value = JSON.stringify(roll.images);
    imgsField.appendChild(hidden);
    function rerenderImgs() {
      imgsWrap.innerHTML = '';
      imgsWrap.appendChild(thumbList(roll.images, rerenderImgs));
      imgsWrap.appendChild(addUploadButton(roll.images, rerenderImgs, '＋ 上传照片到本卷'));
      roll.image = roll.images[0] || '';
      hidden.value = JSON.stringify(roll.images);
    }
    rerenderImgs();
    box.appendChild(imgsField);

    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'gallery-del';
    del.style.marginTop = '10px';
    del.textContent = '删除这个胶卷';
    del.addEventListener('click', function () {
      if (!confirm('确定删除「' + (roll.film || '未命名') + '」？其全部照片引用也会移除。')) return;
      content.photo.gallery.splice(idx, 1);
      state.rollIdx = null;
      renderSection();
      setStatus('已删除，点"保存并发布"后生效。');
    });
    box.appendChild(del);
  }

  /* ====== 批量上传 ====== */
  function renderUpload(box) {
    h2(box, '批量上传', '把电脑上的一整个文件夹（或多张照片）拖进来：选择分类到 Film 还是 Digital，填写是哪一卷、日期和文字，保存后自动更新到全站各处。');

    var zone = document.createElement('div');
    zone.className = 'dropzone';
    zone.innerHTML = '<b>拖拽照片 / 文件夹到这里</b><span>或点击选择文件（可多选；大图会自动压缩，网页加载更快）</span>';
    box.appendChild(zone);

    var pick = document.createElement('input');
    pick.type = 'file';
    pick.accept = 'image/*';
    pick.multiple = true;
    pick.hidden = true;
    box.appendChild(pick);

    var prev = document.createElement('div');
    prev.className = 'up-previews';
    box.appendChild(prev);

    var start;
    function setFiles(files) {
      var imgs = Array.from(files || []).filter(function (f) { return /^image\//.test(f.type); });
      if (!imgs.length) return;
      upFiles = imgs;
      prev.innerHTML = '';
      imgs.slice(0, 24).forEach(function (f) {
        var im = document.createElement('img');
        im.src = URL.createObjectURL(f);
        prev.appendChild(im);
      });
      if (imgs.length > 24) {
        var more = document.createElement('span');
        more.className = 'pool-empty';
        more.textContent = '…共 ' + imgs.length + ' 张';
        prev.appendChild(more);
      }
      if (start) start.disabled = false;
      setStatus('已选择 ' + imgs.length + ' 张照片，请填写下方信息。');
    }
    zone.addEventListener('click', function () { pick.click(); });
    pick.addEventListener('change', function () { setFiles(pick.files); });
    ['dragover', 'dragenter'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove('over'); });
    });
    zone.addEventListener('drop', function (e) { setFiles(e.dataTransfer.files); });

    var form = document.createElement('div');
    form.className = 'form-grid';
    box.appendChild(form);

    var catSel = document.createElement('select');
    catSel.innerHTML = '<option value="film">Film（胶卷）</option><option value="digital">Digital（数码）</option>';
    form.appendChild(field('分类到', catSel));

    var modeSel = document.createElement('select');
    modeSel.innerHTML = '<option value="new">新建一卷</option><option value="merge">并入已有卷</option>';
    form.appendChild(field('方式', modeSel));

    var nameInp = textInput('', function () {}, '例如：Kodak Portra 400');
    var mergeSel = document.createElement('select');
    function refreshMerge() {
      mergeSel.innerHTML = '';
      content.photo.gallery.forEach(function (g, i) {
        if ((g.cat || 'film') !== catSel.value) return;
        var o = document.createElement('option');
        o.value = String(i);
        o.textContent = (g.film || '未命名') + '（' + ((g.images || []).length) + ' 张）';
        mergeSel.appendChild(o);
      });
    }
    var nameField = field('新胶卷名称', nameInp);
    var mergeField = field('并入哪一卷', mergeSel);
    function refreshMode() {
      var merge = modeSel.value === 'merge';
      nameField.hidden = merge;
      mergeField.hidden = !merge;
      if (merge) refreshMerge();
    }
    catSel.addEventListener('change', refreshMerge);
    modeSel.addEventListener('change', refreshMode);
    refreshMerge();
    refreshMode();
    form.appendChild(nameField);
    form.appendChild(mergeField);

    var dateInp = textInput('', function () {}, '例如：2026.09.05');
    var locInp = textInput('', function () {}, '例如：北京');
    form.appendChild(field('日期', dateInp));
    form.appendChild(field('拍摄地点', locInp));
    form.appendChild(field('', document.createElement('span')));
    var noteInp = areaInput('', function () {});
    box.appendChild(field('想说的话（整卷共用说明）', noteInp));

    var actions = document.createElement('div');
    actions.className = 'up-actions';
    start = document.createElement('button');
    start.type = 'button';
    start.className = 'btn-dark';
    start.disabled = true;
    start.textContent = '开始上传并加入网站';
    actions.appendChild(start);
    box.appendChild(actions);

    start.addEventListener('click', async function () {
      if (!upFiles.length) { setStatus('请先拖入照片。'); return; }
      start.disabled = true;
      try {
        var paths = [];
        for (var i = 0; i < upFiles.length; i++) {
          setStatus('正在上传…（' + (i + 1) + '/' + upFiles.length + '）');
          paths.push(await uploadOne(upFiles[i]));
        }
        if (modeSel.value === 'merge') {
          var g = content.photo.gallery[parseInt(mergeSel.value, 10)];
          if (!g) throw new Error('请选择要并入的胶卷');
          paths.forEach(function (p) { g.images.push(p); });
          g.image = g.images[0] || g.image;
          setStatus('已并入「' + (g.film || '未命名') + '」，点"保存并发布"后全站生效。');
        } else {
          content.photo.gallery.push({
            cat: catSel.value, film: nameInp.value || '未命名', camera: '',
            date: dateInp.value, location: locInp.value, note: noteInp.value,
            images: paths, image: paths[0] || ''
          });
          setStatus('已新建胶卷「' + (nameInp.value || '未命名') + '」，点"保存并发布"后全站生效。');
        }
        upFiles = [];
        renderSection();
      } catch (err) {
        setStatus('上传失败：' + err.message);
        start.disabled = false;
      }
    });
  }

  /* ====== 文字内容（排除特效文字，如首页 WebGL 大字 hero.title） ====== */
  var TEXT_GROUPS = [
    { title: '导航条', fields: [
      ['nav.link1', '「作品集」链接文字'], ['nav.link2', '「社交平台」链接文字'], ['nav.cta', '右侧按钮文字（Menus）']
    ] },
    { title: '首页', fields: [
      ['hero.welcome', 'Welcome 文字'], ['hero.tagline', 'True Aspiration 标语'],
      ['studio.word', 'STUDIO 水印大字'], ['studio.location', '坐标行（X: zhen Y: yuan）'],
      ['studio.statement', '工作室宣言（可换行）'], ['photo.title', 'Photography 区标题'],
      ['footer.brand', '页脚品牌（Verus Votum）'], ['footer.note', '页脚小字']
    ] },
    { title: '理念（Sensuous Subjective）', fields: [
      ['philosophy.word1', '左词'], ['philosophy.word2', '右词'], ['philosophy.note', '下方小字']
    ] }
  ];
  var IMAGE_FIELDS = [
    ['showcase.image', '首页封面大图']
  ];

  function setPath(cid, v) {
    var parts = cid.split('.');
    var o = content;
    for (var i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    o[parts[parts.length - 1]] = v;
  }
  function getPath(cid) {
    return cid.split('.').reduce(function (o, k) {
      return (o && o[k] !== undefined) ? o[k] : undefined;
    }, content);
  }

  function setText(box, cid, label) {
    var val = getPath(cid);
    if (typeof val !== 'string') val = '';
    var inp = val.indexOf('\n') >= 0 || val.length > 60
      ? areaInput(val, function (v) { setPath(cid, v); })
      : textInput(val, function (v) { setPath(cid, v); });
    box.appendChild(field(label + '　·　' + cid, inp));
  }
  function setImage(box, cid, label) {
    var val = getPath(cid) || '';
    var wrap = document.createElement('div');
    wrap.className = 'field';
    var k = document.createElement('span');
    k.className = 'field-key';
    k.textContent = label + '　·　' + cid;
    wrap.appendChild(k);
    var img = document.createElement('img');
    img.className = 'field-preview';
    img.src = val;
    wrap.appendChild(img);
    var lab = document.createElement('label');
    lab.className = 'gimgs-add';
    lab.textContent = '＋ 上传替换';
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.setAttribute('data-gupload-set', '');
    lab.appendChild(inp);
    wrap.appendChild(lab);
    bindImgUpload(inp, function (paths) {
      if (!paths.length) return;
      setPath(cid, paths[0]);
      img.src = paths[0];
    });
    box.appendChild(wrap);
  }

  function renderText(box) {
    h2(box, '文字内容', '全站普通文字与图片。带特殊效果的文字（如首页 WebGL 噪点大字 ZhenYuan）不在此列。');
    TEXT_GROUPS.forEach(function (g) {
      var t = document.createElement('p');
      t.className = 'cat-group-title';
      t.textContent = g.title;
      box.appendChild(t);
      g.fields.forEach(function (f) { setText(box, f[0], f[1]); });
    });
    var ti = document.createElement('p');
    ti.className = 'cat-group-title';
    ti.textContent = '首页图片';
    box.appendChild(ti);
    IMAGE_FIELDS.forEach(function (f) { setImage(box, f[0], f[1]); });

    var mt = document.createElement('p');
    mt.className = 'cat-group-title';
    mt.textContent = '菜单页（menu.html）';
    box.appendChild(mt);
    setText(box, 'menu.title', '标题');
    (content.menu.items || []).forEach(function (it, i) {
      var card = document.createElement('div');
      card.className = 'gallery-item';
      card.style.marginBottom = '10px';
      var head = document.createElement('div');
      head.className = 'gallery-head';
      head.innerHTML = '<b>' + escapeHtml(it.label || ('入口 ' + (i + 1))) + '</b>';
      card.appendChild(head);
      var grid = document.createElement('div');
      grid.className = 'form-grid';
      grid.appendChild(field('大字标题', textInput(it.label, function (v) { it.label = v; })));
      grid.appendChild(field('右侧小字', textInput(it.sub, function (v) { it.sub = v; })));
      card.appendChild(grid);
      box.appendChild(card);
    });
  }

  /* ====== 社交平台 ====== */
  function renderSocial(box) {
    h2(box, '社交平台', 'social.html 的品牌文字、宣言、图片与链接卡片。');
    setText(box, 'social.title', '标题（LINK）');
    setText(box, 'social.brandCn', '品牌中文（真愿）');
    setText(box, 'social.brandEn', '品牌英文（zhenyuan）');
    setText(box, 'social.statement', '黑色宣言块（可换行）');
    setImage(box, 'social.image', '右侧大图');

    var t = document.createElement('p');
    t.className = 'cat-group-title';
    t.textContent = '链接卡片';
    box.appendChild(t);
    renderSocialLinks(box, content.social.links || []);
  }

  function renderSocialLinks(sec, items) {
    var wrap = document.createElement('div');
    wrap.className = 'gallery-wrap';
    items.forEach(function (item, i) { wrap.appendChild(socialLinkRow(item, i)); });
    sec.appendChild(wrap);

    var add = document.createElement('button');
    add.type = 'button';
    add.className = 'gallery-add';
    add.textContent = '＋ 添加一个链接';
    add.addEventListener('click', function () {
      items.push({ platform: '', url: '' });
      renderSection();
    });
    sec.appendChild(add);
  }

  function socialLinkRow(item, idx) {
    var it = document.createElement('div');
    it.className = 'gallery-item';
    it.innerHTML =
      '<div class="gallery-head"><b>链接</b><button type="button" class="gallery-del">删除</button></div>' +
      '<label class="field"><span class="field-key">平台名称</span>' +
      '<input type="text" data-sfield="platform" value="' + escapeAttr(item.platform || '') + '" placeholder="例如：抖音"></label>' +
      '<label class="field"><span class="field-key">链接地址</span>' +
      '<input type="text" data-sfield="url" value="' + escapeAttr(item.url || '') + '" placeholder="https://"></label>';
    it.querySelector('[data-sfield="platform"]').addEventListener('input', function () { item.platform = this.value; });
    it.querySelector('[data-sfield="url"]').addEventListener('input', function () { item.url = this.value; });
    it.querySelector('.gallery-del').addEventListener('click', function () {
      content.social.links.splice(idx, 1);
      renderSection();
      setStatus('已删除一个链接，点"保存并发布"后生效');
    });
    return it;
  }

  /* ====== 密码门 ====== */
  $('#gate-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var h = await sha256Hex($('#gate-pwd').value);
    if (h === PASSWORD_HASH) {
      sessionStorage.setItem('zy_admin', '1');
      sessionStorage.setItem('zy_key', h);
      enter();
    } else {
      $('#gate-err').textContent = '密码错误';
    }
  });

  async function enter() {
    $('#gate').style.display = 'none';
    $('#editor').hidden = false;
    $('#gh-token').value = sessionStorage.getItem('zy_token') || '';
    $('#gh-repo').value = sessionStorage.getItem('zy_repo') || '';
    try {
      var res = await fetch(CONTENT_PATH, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      content = await res.json();
      /* 结构兜底：保证新板块存在（旧 content.json 也能用） */
      content.philosophy = content.philosophy || {};
      if (!Array.isArray(content.philosophy.images)) {
        content.philosophy.images = ['images/philo1.jpg', 'images/philo2.jpg', 'images/philo3.jpg'];
      }
      content.coverflow = content.coverflow || { images: [] };
      if (!Array.isArray(content.coverflow.images)) content.coverflow.images = [];
      content.photo = content.photo || {};
      content.photo.gallery = Array.isArray(content.photo.gallery) ? content.photo.gallery : [];
      content.photo.gallery.forEach(function (g) {
        g.cat = g.cat === 'digital' ? 'digital' : 'film';
        g.images = Array.isArray(g.images) ? g.images : (g.image ? [g.image] : []);
      });
      content.menu = content.menu || { title: 'Menus', items: [] };
      content.social = content.social || { links: [] };
      content.social.links = Array.isArray(content.social.links) ? content.social.links : [];
      renderMenu();
      renderSection();
    } catch (err) {
      setStatus('无法加载 content.json（请通过网站服务器访问）');
    }
  }

  if (sessionStorage.getItem('zy_admin') === '1') enter();

  $('#gh-token').addEventListener('input', function () {
    sessionStorage.setItem('zy_token', this.value.trim());
  });
  $('#gh-repo').addEventListener('input', function () {
    sessionStorage.setItem('zy_repo', this.value.trim());
  });
  $('#pub-toggle').addEventListener('click', function () {
    var p = $('#pub-setup');
    p.hidden = !p.hidden;
  });

  /* ====== 保存并发布 ====== */
  $('#save-btn').addEventListener('click', async function () {
    try {
      setStatus('正在保存…');
      var msg = await saveContent();
      setStatus(msg);
    } catch (err) {
      setStatus('保存失败：' + err.message);
    }
  });
})();
