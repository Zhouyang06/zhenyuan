/*!
 * Prism — 棱镜光线背景（原生 WebGL 移植版）
 * 移植自 React Bits 的 <Prism/> 组件（github.com/DavidHDev/react-bits）
 * 片元着色器与参数语义与原版一致，去除 React / OGL 依赖，可直接用于静态站点
 *
 * 用法：window.createPrism(containerElement, { ...参数 })
 */
(function () {
  'use strict';

  function createPrism(container, opts) {
    if (!container) return null;

    var o = {
      height: 3.5, baseWidth: 5.5, animationType: 'rotate',
      glow: 1, offset: { x: 0, y: 0 }, noise: 0.5, transparent: true,
      scale: 3.6, hueShift: 0, colorFrequency: 1, hoverStrength: 2,
      inertia: 0.05, bloom: 1, timeScale: 0.5, lightMode: false
    };
    for (var k in (opts || {})) { if (opts[k] !== undefined) o[k] = opts[k]; }

    var H = Math.max(0.001, o.height);
    var BASE_HALF = Math.max(0.001, o.baseWidth) * 0.5;
    var GLOW = Math.max(0.0, o.glow);
    var NOISE = Math.max(0.0, o.noise);
    var SAT = (typeof o.saturation === 'number') ? o.saturation : (o.transparent ? 1.2 : 1);
    var SCALE = Math.max(0.001, o.scale);
    var HUE = o.hueShift || 0;
    var CFREQ = Math.max(0.0, o.colorFrequency || 1);
    var BLOOM = Math.max(0.0, o.bloom || 1);
    var TS = Math.max(0, o.timeScale || 1);
    var HOVSTR = Math.max(0, o.hoverStrength || 1);
    var INERT = Math.max(0, Math.min(1, o.inertia || 0.12));
    var offX = (o.offset && o.offset.x) || 0;
    var offY = (o.offset && o.offset.y) || 0;
    var dpr = Math.min(2, window.devicePixelRatio || 1);

    var canvas = document.createElement('canvas');
    var gl = canvas.getContext('webgl', { alpha: !!o.transparent, antialias: false })
          || canvas.getContext('experimental-webgl', { alpha: !!o.transparent, antialias: false });
    if (!gl) return null;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    container.appendChild(canvas);

    var vert = 'attribute vec2 position;void main(){gl_Position=vec4(position,0.0,1.0);}';

    var frag = [
      'precision highp float;',
      'uniform vec2  iResolution;',
      'uniform float iTime;',
      'uniform float uHeight;',
      'uniform float uBaseHalf;',
      'uniform int   uUseBaseWobble;',
      'uniform mat3  uRot;',
      'uniform float uGlow;',
      'uniform vec2  uOffsetPx;',
      'uniform float uNoise;',
      'uniform float uSaturation;',
      'uniform float uScale;',
      'uniform float uHueShift;',
      'uniform float uColorFreq;',
      'uniform float uBloom;',
      'uniform float uCenterShift;',
      'uniform float uInvBaseHalf;',
      'uniform float uInvHeight;',
      'uniform float uMinAxis;',
      'uniform float uPxScale;',
      'uniform float uTimeScale;',
      'uniform float uLightMode;',
      'vec4 tanh4(vec4 x){',
      '  vec4 e2x = exp(2.0*x);',
      '  return (e2x - 1.0) / (e2x + 1.0);',
      '}',
      'float rand(vec2 co){',
      '  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453123);',
      '}',
      'float sdOctaAnisoInv(vec3 p){',
      '  vec3 q = vec3(abs(p.x) * uInvBaseHalf, abs(p.y) * uInvHeight, abs(p.z) * uInvBaseHalf);',
      '  float m = q.x + q.y + q.z - 1.0;',
      '  return m * uMinAxis * 0.5773502691896258;',
      '}',
      'float sdPyramidUpInv(vec3 p){',
      '  float oct = sdOctaAnisoInv(p);',
      '  float halfSpace = -p.y;',
      '  return max(oct, halfSpace);',
      '}',
      'mat3 hueRotation(float a){',
      '  float c = cos(a), s = sin(a);',
      '  mat3 W = mat3(0.299,0.587,0.114, 0.299,0.587,0.114, 0.299,0.587,0.114);',
      '  mat3 U = mat3(0.701,-0.587,-0.114, -0.299,0.413,-0.114, -0.300,-0.588,0.886);',
      '  mat3 V = mat3(0.168,-0.331,0.500, 0.328,0.035,-0.500, -0.497,0.296,0.201);',
      '  return W + U * c + V * s;',
      '}',
      'void main(){',
      '  vec2 f = (gl_FragCoord.xy - 0.5 * iResolution.xy - uOffsetPx) * uPxScale;',
      '  float z = 5.0;',
      '  float d = 0.0;',
      '  vec3 p;',
      '  vec4 o = vec4(0.0);',
      '  float cf = uColorFreq;',
      '  mat2 wob = mat2(1.0);',
      '  if (uUseBaseWobble == 1) {',
      '    float t = iTime * uTimeScale;',
      '    float c0 = cos(t + 0.0);',
      '    float c1 = cos(t + 33.0);',
      '    float c2 = cos(t + 11.0);',
      '    wob = mat2(c0, c1, c2, c0);',
      '  }',
      '  const int STEPS = 100;',
      '  for (int i = 0; i < STEPS; i++) {',
      '    p = vec3(f, z);',
      '    p.xz = p.xz * wob;',
      '    p = uRot * p;',
      '    vec3 q = p;',
      '    q.y += uCenterShift;',
      '    d = 0.1 + 0.2 * abs(sdPyramidUpInv(q));',
      '    z -= d;',
      '    o += (sin((p.y + z) * cf + vec4(0.0, 1.0, 2.0, 3.0)) + 1.0) / d;',
      '  }',
      '  o = tanh4(o * o * (uGlow * uBloom) / 1e5);',
      '  vec3 col = o.rgb;',
      '  float n = rand(gl_FragCoord.xy + vec2(iTime));',
      '  col += (n - 0.5) * uNoise;',
      '  col = clamp(col, 0.0, 1.0);',
      '  float L = dot(col, vec3(0.2126, 0.7152, 0.0722));',
      '  col = clamp(mix(vec3(L), col, uSaturation), 0.0, 1.0);',
      '  if (abs(uHueShift) > 0.0001) {',
      '    col = clamp(hueRotation(uHueShift) * col, 0.0, 1.0);',
      '  }',
      '  if (uLightMode > 0.5) {',
      '    float peak = max(col.r, max(col.g, col.b));',
      '    vec3 chroma = pow(clamp(col / max(peak, 0.0001), 0.0, 1.0), vec3(1.14));',
      '    gl_FragColor = vec4(mix(vec3(1.0), chroma, o.a * 0.94), 1.0);',
      '  } else {',
      '    gl_FragColor = vec4(col, o.a);',
      '  }',
      '}'
    ].join('\n');

    function compile(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error('Prism shader: ' + gl.getShaderInfoLog(s));
      }
      return s;
    }
    var prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vert));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('Prism link: ' + gl.getProgramInfoLog(prog));
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
    ['iResolution', 'iTime', 'uHeight', 'uBaseHalf', 'uUseBaseWobble', 'uRot', 'uGlow',
     'uOffsetPx', 'uNoise', 'uSaturation', 'uScale', 'uHueShift', 'uColorFreq', 'uBloom',
     'uCenterShift', 'uInvBaseHalf', 'uInvHeight', 'uMinAxis', 'uPxScale', 'uTimeScale',
     'uLightMode'].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });

    var iRes = new Float32Array([1, 1]);
    var offPx = new Float32Array([offX * dpr, offY * dpr]);
    var rot = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

    gl.uniform1f(U.uHeight, H);
    gl.uniform1f(U.uBaseHalf, BASE_HALF);
    gl.uniform1i(U.uUseBaseWobble, o.animationType === 'rotate' ? 1 : 0);
    gl.uniformMatrix3fv(U.uRot, false, rot);
    gl.uniform1f(U.uGlow, GLOW);
    gl.uniform2fv(U.uOffsetPx, offPx);
    gl.uniform1f(U.uNoise, NOISE);
    gl.uniform1f(U.uSaturation, SAT);
    gl.uniform1f(U.uScale, SCALE);
    gl.uniform1f(U.uHueShift, HUE);
    gl.uniform1f(U.uColorFreq, CFREQ);
    gl.uniform1f(U.uBloom, BLOOM);
    gl.uniform1f(U.uCenterShift, H * 0.25);
    gl.uniform1f(U.uInvBaseHalf, 1 / BASE_HALF);
    gl.uniform1f(U.uInvHeight, 1 / H);
    gl.uniform1f(U.uMinAxis, Math.min(BASE_HALF, H));
    gl.uniform1f(U.uTimeScale, TS);
    gl.uniform1f(U.uLightMode, o.lightMode ? 1.0 : 0.0);

    function resize() {
      var w = container.clientWidth || 1;
      var h = container.clientHeight || 1;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      iRes[0] = canvas.width;
      iRes[1] = canvas.height;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2fv(U.iResolution, iRes);
      gl.uniform1f(U.uPxScale, 1 / (canvas.height * 0.1 * SCALE));
      offPx[0] = offX * dpr;
      offPx[1] = offY * dpr;
      gl.uniform2fv(U.uOffsetPx, offPx);
    }
    resize();
    window.addEventListener('resize', resize);

    // ---- hover 交互（与原版一致：指针带动旋转，带惯性） ----
    var pointer = { x: 0, y: 0, inside: true };
    function onMove(e) {
      var ww = Math.max(1, window.innerWidth);
      var wh = Math.max(1, window.innerHeight);
      pointer.x = Math.max(-1, Math.min(1, (e.clientX - ww * 0.5) / (ww * 0.5)));
      pointer.y = Math.max(-1, Math.min(1, (e.clientY - wh * 0.5) / (wh * 0.5)));
      pointer.inside = true;
    }
    function onLeave() { pointer.inside = false; }
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('mouseleave', onLeave);
    window.addEventListener('blur', onLeave);

    function setEuler(yaw, pitch, roll, out) {
      var cy = Math.cos(yaw), sy = Math.sin(yaw);
      var cx = Math.cos(pitch), sx = Math.sin(pitch);
      var cz = Math.cos(roll), sz = Math.sin(roll);
      var r00 = cy * cz + sy * sx * sz, r01 = -cy * sz + sy * sx * cz, r02 = sy * cx;
      var r10 = cx * sz, r11 = cx * cz, r12 = -sx;
      var r20 = -sy * cz + cy * sx * sz, r21 = sy * sz + cy * sx * cz, r22 = cy * cx;
      out[0] = r00; out[1] = r10; out[2] = r20;
      out[3] = r01; out[4] = r11; out[5] = r21;
      out[6] = r02; out[7] = r12; out[8] = r22;
      return out;
    }
    function lerp(a, b, t) { return a + (b - a) * t; }

    var yaw = 0, pitch = 0, roll = 0;
    var destroyed = false, raf = 0, t0 = performance.now();
    function frame(t) {
      if (destroyed) return;
      gl.uniform1f(U.iTime, (t - t0) * 0.001);
      var maxYaw = 0.6 * HOVSTR, maxPitch = 0.6 * HOVSTR;
      var tYaw = (pointer.inside ? -pointer.x : 0) * maxYaw;
      var tPitch = (pointer.inside ? pointer.y : 0) * maxPitch;
      yaw = lerp(yaw, tYaw, INERT);
      pitch = lerp(pitch, tPitch, INERT);
      roll = lerp(roll, 0, 0.1);
      gl.uniformMatrix3fv(U.uRot, false, setEuler(yaw, pitch, roll, rot));
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
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
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('mouseleave', onLeave);
        window.removeEventListener('blur', onLeave);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }
    };
  }

  window.createPrism = createPrism;
})();
