/** Compact runtime injected into Web Workers / SharedWorkers (CreepJS probes these). */

export function buildWorkerInjectionScript(fpJson: string, useNativeKernel: boolean): string {
  if (useNativeKernel) return '';
  return `
(function() {
  'use strict';
  var FP = ${fpJson};
  function detHash(key) {
    var h = 2166136261, s = FP.seed + '\\x00' + key;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function detBit(key) { return (detHash(key) & 1) === 1; }
  try {
    Object.defineProperty(navigator, 'userAgent', { get: function() { return FP.ua; } });
    Object.defineProperty(navigator, 'platform', { get: function() { return FP.platform; } });
    Object.defineProperty(navigator, 'languages', { get: function() { return FP.langs; } });
    Object.defineProperty(navigator, 'language', { get: function() { return FP.langs[0]; } });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: function() { return FP.hwConcurrency; } });
    Object.defineProperty(navigator, 'deviceMemory', { get: function() { return FP.deviceMemory; } });
    Object.defineProperty(navigator, 'webdriver', { get: function() { return false; } });
  } catch(e) {}
  if (typeof OffscreenCanvas !== 'undefined') {
    var origOC = OffscreenCanvas.prototype.getContext;
    OffscreenCanvas.prototype.getContext = function(type, attrs) {
      var ctx = origOC.call(this, type, attrs);
      if (ctx && type === '2d' && FP.canvasNoise) {
        var origGet = ctx.getImageData.bind(ctx);
        ctx.getImageData = function(sx, sy, sw, sh) {
          var img = origGet(sx, sy, sw, sh);
          var d = img.data, w = img.width, n = Math.max(24, (w * img.height * 0.002) | 0);
          for (var k = 0; k < n; k++) {
            var x = detHash('w:' + sx + ':' + sy + ':' + k) % w;
            var y = detHash('wy:' + sx + ':' + sy + ':' + k) % img.height;
            var i = (y * w + x) * 4;
            var delta = (detHash('wd:' + i) % 3) - 1;
            d[i] = Math.min(255, Math.max(0, d[i] + delta));
          }
          return img;
        };
      }
      return ctx;
    };
  }
  if (typeof WebGLRenderingContext !== 'undefined') {
    var origGP = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(p) {
      if (p === 37445) return FP.webglVendor;
      if (p === 37446) return FP.webglRenderer;
      return origGP.call(this, p);
    };
  }
})();
`;
}

export function buildWorkerBridgeScript(workerInjectSource: string): string {
  const escaped = JSON.stringify(workerInjectSource);
  return `
(function() {
  var __cabWorkerInject = ${escaped};
  function wrapWorkerUrl(url) {
    var src = typeof url === 'string' ? url : (url && url.href ? url.href : String(url));
    if (src.indexOf('blob:') === 0) return src;
    var code = __cabWorkerInject + ';\\nimportScripts(' + JSON.stringify(src) + ');';
    return URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
  }
  if (typeof Worker !== 'undefined') {
    var OrigWorker = Worker;
    Worker = function(scriptURL, options) {
      if (options && options.type === 'module') return new OrigWorker(scriptURL, options);
      return new OrigWorker(wrapWorkerUrl(scriptURL), options);
    };
    Worker.prototype = OrigWorker.prototype;
  }
  if (typeof SharedWorker !== 'undefined') {
    var OrigShared = SharedWorker;
    SharedWorker = function(scriptURL, options) {
      return new OrigShared(wrapWorkerUrl(scriptURL), options);
    };
    SharedWorker.prototype = OrigShared.prototype;
  }
})();
`;
}
