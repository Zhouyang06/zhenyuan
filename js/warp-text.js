/*!
 * WarpText — 流动扭曲文字动效（原生 WebGL 版）
 * 由 React <WarpText/> 组件移植，参数与原组件保持一致：
 *   text / color / warpStrength / warpScale / speed / pointerInfluence /
 *   pointerStrength / refraction / ripple / fontSize / fontWeight /
 *   fontFamily / letterSpacing / lineHeight
 *
 * 用法：createWarpText(containerElement, options)
 * 容器需具备宽高（组件会铺满容器，对应原始 .warp-text CSS 结构）
 */
(function () {
  'use strict';

  var VERT = [
    'attribute vec2 aPos;',
    'varying vec2 vUv;',
    'void main(){',
    '  vUv = aPos * 0.5 + 0.5;',
    '  gl_Position = vec4(aPos, 0.0, 1.0);',
    '}'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform sampler2D uTex;',
    'uniform float uTime;',
    'uniform vec2 uPointer;',
    'uniform float uAspect;',
    'uniform float uWarpStrength;',
    'uniform float uWarpScale;',
    'uniform float uSpeed;',
    'uniform float uPointerInfluence;',
    'uniform float uPointerStrength;',
    'uniform float uRefraction;',
    'uniform float uRipple;',
    'uniform float uPointerOn;',
    'uniform vec3 uColor;',
    '',
    'float hash(vec2 p){',
    '  p = fract(p * vec2(123.34, 456.21));',
    '  p += dot(p, p + 45.32);',
    '  return fract(p.x * p.y);',
    '}',
    'float noise(vec2 p){',
    '  vec2 i = floor(p);',
    '  vec2 f = fract(p);',
    '  vec2 u = f * f * (3.0 - 2.0 * f);',
    '  float a = hash(i);',
    '  float b = hash(i + vec2(1.0, 0.0));',
    '  float c = hash(i + vec2(0.0, 1.0));',
    '  float d = hash(i + vec2(1.0, 1.0));',
    '  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);',
    '}',
    'float fbm(vec2 p){',
    '  float v = 0.0;',
    '  float amp = 0.5;',
    '  for (int i = 0; i < 4; i++) {',
    '    v += amp * noise(p);',
    '    p = p * 2.03 + vec2(17.7, 9.2);',
    '    amp *= 0.5;',
    '  }',
    '  return v;',
    '}',
    '',
    'void main(){',
    '  vec2 uv = vUv;',
    '  float t = uTime * uSpeed;',
    '',
    '  // 流动域扭曲',
    '  vec2 p = uv * vec2(uAspect, 1.0) * uWarpScale * 2.0;',
    '  float n1 = fbm(p + vec2(t * 0.8, -t * 0.5));',
    '  float n2 = fbm(p + vec2(-t * 0.6, t * 0.7) + 5.2);',
    '  vec2 flow = (vec2(n1, n2) - 0.5) * 2.0;',
    '',
    '  vec2 push = vec2(0.0);',
    '  // 指针涟漪',
    '  if (uRipple > 0.5 && uPointerOn > 0.001) {',
    '    vec2 asp = vec2(uAspect, 1.0);',
    '    vec2 d = (uv - uPointer) * asp;',
    '    float dist = length(d);',
    '    float ring = sin(dist * 20.0 - uTime * 5.0) * exp(-dist * 4.5);',
    '    push += (d / max(dist, 0.0001)) * ring * 0.05 * uPointerStrength;',
    '  }',
    '  // 指针轻微牵引',
    '  if (uPointerOn > 0.001) {',
    '    vec2 d2 = uv - uPointer;',
    '    float fall = exp(-length(d2) * (3.0 + 4.0 * uPointerInfluence));',
    '    push += d2 * fall * 0.22 * uPointerStrength;',
    '  }',
    '',
    '  vec2 wuv = uv + flow * uWarpStrength * 0.3 + push * uPointerOn;',
    '',
    '  // 折射：沿位移方向做色散偏移',
    '  vec2 tuv = vec2(wuv.x, 1.0 - wuv.y);',
    '  vec2 off = (wuv - uv) * uRefraction * 36.0;',
    '  float ac = texture2D(uTex, tuv).a;',
    '  float ar = texture2D(uTex, tuv + off).a;',
    '  float ab = texture2D(uTex, tuv - off).a;',
    '',
    '  float alpha = max(ac, max(ar, ab));',
    '  // 黑字白底：色散差值直接发出彩色描边（红/青分离）',
    '  float mn = min(ar, min(ac, ab));',
    '  vec3 sep = vec3(ar, ac, ab) - vec3(mn);',
    '  gl_FragColor = vec4(uColor * alpha + sep * 0.8, alpha);',
    '}'
  ].join('\n');

  function hexToRgb(hex) {
    var h = String(hex || '#ffffff').replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  function createWarpText(container, userOpts) {
    var opts = {
      text: 'zhenyuan',
      color: '#f8f5ff',
      warpStrength: 0.08,
      warpScale: 1.9,
      speed: 0.55,
      pointerInfluence: 0.42,
      pointerStrength: 0.5,
      refraction: 0.032,
      ripple: true,
      fontSize: 121,
      fontWeight: 800,
      fontFamily: 'inherit',
      letterSpacing: -0.06,
      lineHeight: 0.9
    };
    for (var k in userOpts) { if (userOpts[k] !== undefined) opts[k] = userOpts[k]; }

    if (opts.fontFamily === 'inherit') {
      opts.fontFamily = getComputedStyle(container).fontFamily || 'serif';
    }

    var canvas = document.createElement('canvas');
    container.appendChild(canvas);

    var gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true });
    if (!gl) {
      console.warn('WarpText: 当前浏览器 WebGL 不可用，已降级为静态文字（请检查浏览器硬件加速是否开启）');
      canvas.remove();
      var fallback = document.createElement('div');
      fallback.className = 'warp-text-fallback';
      fallback.textContent = opts.text;
      container.appendChild(fallback);
      return { setText: function () {}, destroy: function () {} };
    }

    function compile(type, src) {
      var sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error('WarpText shader error:', gl.getShaderInfoLog(sh));
      }
      return sh;
    }
    var prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    var quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    var U = {};
    ['uTex', 'uTime', 'uPointer', 'uAspect', 'uWarpStrength', 'uWarpScale', 'uSpeed',
     'uPointerInfluence', 'uPointerStrength', 'uRefraction', 'uRipple', 'uPointerOn', 'uColor'
    ].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });

    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.uniform1i(U.uTex, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.clearColor(0, 0, 0, 0);

    // ---- 文字纹理 ----
    var textCanvas = document.createElement('canvas');
    var tctx = textCanvas.getContext('2d');

    function measure(fontPx) {
      tctx.font = opts.fontWeight + ' ' + fontPx + 'px ' + opts.fontFamily;
      var spacing = opts.letterSpacing * fontPx;
      var total = 0, widths = [];
      var chars = Array.from(opts.text);
      for (var i = 0; i < chars.length; i++) {
        var w = tctx.measureText(chars[i]).width;
        widths.push(w);
        total += w + spacing;
      }
      total -= spacing;
      return { widths: widths, total: Math.max(total, 1), chars: chars };
    }

    function rebuild() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var cw = Math.max(container.clientWidth, 10);
      var ch = Math.max(container.clientHeight, 10);
      var tw = cw * dpr, th = ch * dpr;
      var cap = Math.min(1, 2600 / Math.max(tw, th));
      tw = Math.max(Math.round(tw * cap), 16);
      th = Math.max(Math.round(th * cap), 16);

      canvas.width = tw; canvas.height = th;
      gl.viewport(0, 0, tw, th);
      gl.uniform1f(U.uAspect, tw / th);

      // 文字以“contain”方式铺进容器
      var base = measure(opts.fontSize);
      var inkH = opts.fontSize;
      var scale = Math.min((tw * 0.96) / base.total, (th * 0.72) / inkH);
      var fontPx = Math.max(opts.fontSize * scale, 8);

      var m = measure(fontPx);
      var spacing = opts.letterSpacing * fontPx;
      textCanvas.width = tw; textCanvas.height = th;
      tctx.clearRect(0, 0, tw, th);
      tctx.font = opts.fontWeight + ' ' + fontPx + 'px ' + opts.fontFamily;
      tctx.fillStyle = '#fff';
      tctx.textBaseline = 'middle';
      var x = (tw - m.total) / 2;
      var y = th / 2;
      for (var i = 0; i < m.chars.length; i++) {
        tctx.fillText(m.chars[i], x, y);
        x += m.widths[i] + spacing;
      }

      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textCanvas);
      setUniforms();
    }

    function setUniforms() {
      gl.uniform1f(U.uWarpStrength, opts.warpStrength);
      gl.uniform1f(U.uWarpScale, opts.warpScale);
      gl.uniform1f(U.uSpeed, opts.speed);
      gl.uniform1f(U.uPointerInfluence, opts.pointerInfluence);
      gl.uniform1f(U.uPointerStrength, opts.pointerStrength);
      gl.uniform1f(U.uRefraction, opts.refraction);
      gl.uniform1f(U.uRipple, opts.ripple ? 1 : 0);
      var c = hexToRgb(opts.color);
      gl.uniform3f(U.uColor, c[0], c[1], c[2]);
    }

    // ---- 指针 ----
    var pointer = { x: 0.5, y: 0.5 }, target = { x: 0.5, y: 0.5 };
    var pointerOn = 0, pointerOnTarget = 0;

    canvas.addEventListener('pointermove', function (e) {
      var r = canvas.getBoundingClientRect();
      target.x = (e.clientX - r.left) / Math.max(r.width, 1);
      target.y = 1 - (e.clientY - r.top) / Math.max(r.height, 1);
      pointerOnTarget = 1;
    });
    canvas.addEventListener('pointerleave', function () { pointerOnTarget = 0; });

    // ---- 渲染循环 ----
    var start = performance.now();
    var raf = 0;

    function draw() {
      var t = (performance.now() - start) / 1000;
      pointer.x += (target.x - pointer.x) * 0.08;
      pointer.y += (target.y - pointer.y) * 0.08;
      pointerOn += (pointerOnTarget - pointerOn) * 0.06;

      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(U.uTime, t);
      gl.uniform2f(U.uPointer, pointer.x, pointer.y);
      gl.uniform1f(U.uPointerOn, pointerOn);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      raf = requestAnimationFrame(draw);
    }

    var resizeTimer = 0;
    var ro = new ResizeObserver(function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(rebuild, 120);
    });
    ro.observe(container);

    rebuild();
    raf = requestAnimationFrame(draw);

    return {
      setText: function (t) { opts.text = t; rebuild(); },
      destroy: function () { cancelAnimationFrame(raf); ro.disconnect(); canvas.remove(); }
    };
  }

  window.createWarpText = createWarpText;
})();
