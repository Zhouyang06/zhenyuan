/*!
 * Dither — 抖动波纹背景（原生 WebGL2 移植版）
 * 移植自 React Bits 的 <Dither/> 组件（github.com/DavidHDev/react-bits）
 * 原版为 two-pass（波纹噪声 → postprocessing 抖动后处理），
 * 此处合并为单 pass：直接在像素化坐标上采样波纹，再做 8×8 Bayer 抖动 + 色彩量化
 *
 * 用法：window.createDither(containerElement, { waveSpeed, waveFrequency, ... })
 */
(function () {
  'use strict';

  function createDither(container, opts) {
    if (!container) return null;

    var o = {
      waveSpeed: 0.05,
      waveFrequency: 3,
      waveAmplitude: 0.3,
      waveColor: [0.5, 0.5, 0.5],
      backgroundColor: [0, 0, 0],
      colorNum: 4,
      pixelSize: 2,
      disableAnimation: false,
      enableMouseInteraction: true,
      mouseRadius: 1
    };
    for (var k in (opts || {})) { if (opts[k] !== undefined) o[k] = opts[k]; }

    var canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    var gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
    if (!gl) return null; // 需要 WebGL2（Bayer 常量数组语法）
    container.appendChild(canvas);

    var vert = '#version 300 es\n' +
      'in vec2 position;void main(){gl_Position=vec4(position,0.0,1.0);}';

    var frag = [
      '#version 300 es',
      'precision highp float;',
      'uniform vec2  resolution;',
      'uniform float time;',
      'uniform float waveSpeed;',
      'uniform float waveFrequency;',
      'uniform float waveAmplitude;',
      'uniform vec3  waveColor;',
      'uniform vec3  backgroundColor;',
      'uniform vec2  mousePos;',
      'uniform int   enableMouseInteraction;',
      'uniform float mouseRadius;',
      'uniform float colorNum;',
      'uniform float pixelSize;',
      'out vec4 fragColor;',
      'vec4 mod289(vec4 x) { return x - floor(x * (1.0/289.0)) * 289.0; }',
      'vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }',
      'vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }',
      'vec2 fade(vec2 t) { return t*t*t*(t*(t*6.0-15.0)+10.0); }',
      'float cnoise(vec2 P) {',
      '  vec4 Pi = floor(P.xyxy) + vec4(0.0,0.0,1.0,1.0);',
      '  vec4 Pf = fract(P.xyxy) - vec4(0.0,0.0,1.0,1.0);',
      '  Pi = mod289(Pi);',
      '  vec4 ix = Pi.xzxz;',
      '  vec4 iy = Pi.yyww;',
      '  vec4 fx = Pf.xzxz;',
      '  vec4 fy = Pf.yyww;',
      '  vec4 i = permute(permute(ix) + iy);',
      '  vec4 gx = fract(i * (1.0/41.0)) * 2.0 - 1.0;',
      '  vec4 gy = abs(gx) - 0.5;',
      '  vec4 tx = floor(gx + 0.5);',
      '  gx = gx - tx;',
      '  vec2 g00 = vec2(gx.x, gy.x);',
      '  vec2 g10 = vec2(gx.y, gy.y);',
      '  vec2 g01 = vec2(gx.z, gy.z);',
      '  vec2 g11 = vec2(gx.w, gy.w);',
      '  vec4 norm = taylorInvSqrt(vec4(dot(g00,g00), dot(g01,g01), dot(g10,g10), dot(g11,g11)));',
      '  g00 *= norm.x; g01 *= norm.y; g10 *= norm.z; g11 *= norm.w;',
      '  float n00 = dot(g00, vec2(fx.x, fy.x));',
      '  float n10 = dot(g10, vec2(fx.y, fy.y));',
      '  float n01 = dot(g01, vec2(fx.z, fy.z));',
      '  float n11 = dot(g11, vec2(fx.w, fy.w));',
      '  vec2 fade_xy = fade(Pf.xy);',
      '  vec2 n_x = mix(vec2(n00, n01), vec2(n10, n11), fade_xy.x);',
      '  return 2.3 * mix(n_x.x, n_x.y, fade_xy.y);',
      '}',
      'const int OCTAVES = 4;',
      'float fbm(vec2 p) {',
      '  float value = 0.0;',
      '  float amp = 1.0;',
      '  float freq = waveFrequency;',
      '  for (int i = 0; i < OCTAVES; i++) {',
      '    value += amp * abs(cnoise(p));',
      '    p *= freq;',
      '    amp *= waveAmplitude;',
      '  }',
      '  return value;',
      '}',
      'float pattern(vec2 p) {',
      '  vec2 p2 = p - time * waveSpeed;',
      '  return fbm(p + fbm(p2));',
      '}',
      'const float bayerMatrix8x8[64] = float[64](',
      '  0.0/64.0, 48.0/64.0, 12.0/64.0, 60.0/64.0,  3.0/64.0, 51.0/64.0, 15.0/64.0, 63.0/64.0,',
      ' 32.0/64.0, 16.0/64.0, 44.0/64.0, 28.0/64.0, 35.0/64.0, 19.0/64.0, 47.0/64.0, 31.0/64.0,',
      '  8.0/64.0, 56.0/64.0,  4.0/64.0, 52.0/64.0, 11.0/64.0, 59.0/64.0,  7.0/64.0, 55.0/64.0,',
      ' 40.0/64.0, 24.0/64.0, 36.0/64.0, 20.0/64.0, 43.0/64.0, 27.0/64.0, 39.0/64.0, 23.0/64.0,',
      '  2.0/64.0, 50.0/64.0, 14.0/64.0, 62.0/64.0,  1.0/64.0, 49.0/64.0, 13.0/64.0, 61.0/64.0,',
      ' 34.0/64.0, 18.0/64.0, 46.0/64.0, 30.0/64.0, 33.0/64.0, 17.0/64.0, 45.0/64.0, 29.0/64.0,',
      ' 10.0/64.0, 58.0/64.0,  6.0/64.0, 54.0/64.0,  9.0/64.0, 57.0/64.0,  5.0/64.0, 53.0/64.0,',
      ' 42.0/64.0, 26.0/64.0, 38.0/64.0, 22.0/64.0, 41.0/64.0, 25.0/64.0, 37.0/64.0, 21.0/64.0',
      ');',
      'void main() {',
      '  vec2 res = resolution;',
      // 像素化：块坐标（同时充当 Bayer 索引与波纹采样位置，等价于原版两管线）
      '  vec2 block = floor(gl_FragCoord.xy / pixelSize);',
      '  vec2 uv = (block * pixelSize) / res;',
      '  uv -= 0.5;',
      '  uv.x *= res.x / res.y;',
      '  float f = pattern(uv);',
      '  if (enableMouseInteraction == 1) {',
      '    vec2 mouseNDC = (mousePos / res - 0.5) * vec2(1.0, -1.0);',
      '    mouseNDC.x *= res.x / res.y;',
      '    float dist = length(uv - mouseNDC);',
      '    float effect = 1.0 - smoothstep(0.0, mouseRadius, dist);',
      '    f -= 0.5 * effect;',
      '  }',
      '  vec3 col = mix(backgroundColor, waveColor, clamp(f, 0.0, 1.0));',
      // 8×8 Bayer 有序抖动 + 色彩量化（与原版 RetroEffect 一致）
      '  int x = int(mod(block.x, 8.0));',
      '  int y = int(mod(block.y, 8.0));',
      '  float threshold = bayerMatrix8x8[y * 8 + x] - 0.25;',
      '  float stepQ = 1.0 / (colorNum - 1.0);',
      '  col += threshold * stepQ;',
      '  float luminance = dot(col, vec3(0.2126, 0.7152, 0.0722));',
      '  float bias = mix(0.2, 0.0, smoothstep(0.45, 0.8, luminance));',
      '  col = clamp(col - bias, 0.0, 1.0);',
      '  col = floor(col * (colorNum - 1.0) + 0.5) / (colorNum - 1.0);',
      '  fragColor = vec4(col, 1.0);',
      '}'
    ].join('\n');

    function compile(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error('Dither shader: ' + gl.getShaderInfoLog(s));
      }
      return s;
    }
    var prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vert));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('Dither link: ' + gl.getProgramInfoLog(prog));
    }
    gl.useProgram(prog);

    // 全屏三角形
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var locPos = gl.getAttribLocation(prog, 'position');
    gl.enableVertexAttribArray(locPos);
    gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, 0, 0);

    var U = {};
    ['resolution', 'time', 'waveSpeed', 'waveFrequency', 'waveAmplitude', 'waveColor',
     'backgroundColor', 'mousePos', 'enableMouseInteraction', 'mouseRadius',
     'colorNum', 'pixelSize'].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });

    // 与原版一致：dpr 固定为 1（像素块以 CSS 像素为基准）
    var res = new Float32Array([1, 1]);
    var mouse = new Float32Array([-1000, -1000]);

    gl.uniform1f(U.waveSpeed, o.waveSpeed);
    gl.uniform1f(U.waveFrequency, o.waveFrequency);
    gl.uniform1f(U.waveAmplitude, o.waveAmplitude);
    gl.uniform3fv(U.waveColor, o.waveColor);
    gl.uniform3fv(U.backgroundColor, o.backgroundColor);
    gl.uniform1i(U.enableMouseInteraction, o.enableMouseInteraction ? 1 : 0);
    gl.uniform1f(U.mouseRadius, o.mouseRadius);
    gl.uniform1f(U.colorNum, o.colorNum);
    gl.uniform1f(U.pixelSize, o.pixelSize);

    function resize() {
      var w = Math.max(1, container.clientWidth);
      var h = Math.max(1, container.clientHeight);
      canvas.width = w;
      canvas.height = h;
      res[0] = w; res[1] = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2fv(U.resolution, res);
    }
    resize();
    window.addEventListener('resize', resize);

    // 鼠标交互（指针划过时波纹下陷）
    function onMove(e) {
      if (!o.enableMouseInteraction) return;
      var rect = canvas.getBoundingClientRect();
      mouse[0] = e.clientX - rect.left;
      mouse[1] = e.clientY - rect.top;
      gl.uniform2fv(U.mousePos, mouse);
    }
    canvas.addEventListener('pointermove', onMove, { passive: true });

    var destroyed = false, raf = 0, t0 = performance.now();
    function frame(t) {
      if (destroyed) return;
      if (!o.disableAnimation) gl.uniform1f(U.time, (t - t0) * 0.001);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return {
      canvas: canvas,
      destroy: function () {
        destroyed = true;
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', resize);
        canvas.removeEventListener('pointermove', onMove);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }
    };
  }

  window.createDither = createDither;
})();
