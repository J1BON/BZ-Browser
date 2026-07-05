/** Shared in-page hook body used by main thread and Worker scopes (must stay identical). */

export function buildScopeHooksBody(): string {
  return `
  function defineProtoGetter(proto, key, getter) {
    try {
      var orig = Object.getOwnPropertyDescriptor(proto, key);
      Object.defineProperty(proto, key, {
        get: getter,
        enumerable: orig ? orig.enumerable : true,
        configurable: orig ? orig.configurable : true,
      });
    } catch(e) {}
  }

  function detHash(key) {
    var h = 2166136261;
    var s = FP.seed + '\\x00' + key;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function detBit(key) { return (detHash(key) & 1) === 1; }
  function detUnit(key) { return detHash(key) / 4294967295; }

  function canvasContentKey(img) {
    var d = img.data, h = 2166136261;
    var step = Math.max(1, (d.length / 400) | 0);
    for (var i = 0; i < d.length; i += step * 4) {
      h ^= d[i]; h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  function applyUnifiedNoise(img, ox, oy) {
    var ck = canvasContentKey(img);
    var d = img.data, w = img.width, ht = img.height;
    var n = Math.max(32, (w * ht * 0.002) | 0);
    for (var k = 0; k < n; k++) {
      var x = detHash('n:' + ck + ':' + ox + ':' + oy + ':' + k) % w;
      var y = detHash('ny:' + ck + ':' + ox + ':' + oy + ':' + k) % ht;
      var i = (y * w + x) * 4;
      var delta = (detHash('nd:' + ck + ':' + i) % 3) - 1;
      d[i] = Math.min(255, Math.max(0, d[i] + delta));
      if (detBit('nc:' + ck + ':' + i)) d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + delta));
    }
    return img;
  }

  function patchNavigator() {
    defineProtoGetter(Navigator.prototype, 'userAgent', function() { return FP.ua; });
    defineProtoGetter(Navigator.prototype, 'platform', function() { return FP.platform; });
    defineProtoGetter(Navigator.prototype, 'languages', function() { return FP.langs; });
    defineProtoGetter(Navigator.prototype, 'language', function() { return FP.langs[0]; });
    defineProtoGetter(Navigator.prototype, 'hardwareConcurrency', function() { return FP.hwConcurrency; });
    defineProtoGetter(Navigator.prototype, 'deviceMemory', function() { return FP.deviceMemory; });
    defineProtoGetter(Navigator.prototype, 'maxTouchPoints', function() { return FP.maxTouchPoints; });
    defineProtoGetter(Navigator.prototype, 'doNotTrack', function() { return FP.doNotTrack; });
    defineProtoGetter(Navigator.prototype, 'webdriver', function() { return false; });
    defineProtoGetter(Navigator.prototype, 'vendor', function() { return 'Google Inc.'; });
    defineProtoGetter(Navigator.prototype, 'pdfViewerEnabled', function() { return true; });
  }

  function buildPluginArray() {
    function makeMime(desc, type, suffixes) {
      var m = { type: type, suffixes: suffixes, description: desc, enabledPlugin: null };
      try { Object.setPrototypeOf(m, MimeType.prototype); } catch(e) {}
      return m;
    }
    function makePlugin(name, desc, mimes) {
      var p = { name: name, filename: 'internal-pdf-viewer', description: desc, length: mimes.length };
      for (var i = 0; i < mimes.length; i++) {
        p[i] = mimes[i];
        mimes[i].enabledPlugin = p;
      }
      p.item = function(i) { return p[i] || null; };
      p.namedItem = function(n) {
        for (var j = 0; j < p.length; j++) if (p[j] && p[j].type === n) return p[j];
        return null;
      };
      try { Object.setPrototypeOf(p, Plugin.prototype); } catch(e) {}
      return p;
    }
    var pdfMime = makeMime('Portable Document Format', 'application/pdf', 'pdf');
    var arr = [
      makePlugin('PDF Viewer', 'Portable Document Format', [pdfMime]),
      makePlugin('Chrome PDF Viewer', 'Portable Document Format', [pdfMime]),
      makePlugin('Chromium PDF Viewer', '', [pdfMime]),
      makePlugin('Microsoft Edge PDF Viewer', '', [pdfMime]),
      makePlugin('WebKit built-in PDF', '', [pdfMime]),
    ];
    arr.item = function(i) { return arr[i] || null; };
    arr.namedItem = function(n) {
      for (var j = 0; j < arr.length; j++) if (arr[j].name === n) return arr[j];
      return null;
    };
    arr.refresh = function() {};
    try { Object.setPrototypeOf(arr, PluginArray.prototype); } catch(e) {}
    return arr;
  }

  function patchPlugins() {
    defineProtoGetter(Navigator.prototype, 'plugins', function() { return buildPluginArray(); });
  }

  function hookWebGL(proto) {
    var origGetParam = proto.getParameter;
    var origGetExt = proto.getExtension;
    var origReadPixels = proto.readPixels;
    var webglParams = FP.webglParams || {};
    proto.getParameter = function(p) {
      if (FP.webGlMetaSpoof) {
        if (p === 37445) return FP.webglVendor;
        if (p === 37446) return FP.webglRenderer;
        if (webglParams[p] != null) return webglParams[p];
      }
      return origGetParam.call(this, p);
    };
    proto.getExtension = function(name) {
      return origGetExt.call(this, name);
    };
    if (FP.webGlImageNoise) {
      proto.readPixels = function(x, y, w, h, fmt, type, pixels) {
        origReadPixels.call(this, x, y, w, h, fmt, type, pixels);
        if (pixels && pixels.length) {
          var n = Math.max(8, (pixels.length / 16) | 0);
          for (var k = 0; k < n; k++) {
            var i = (detHash('g:' + x + ':' + y + ':' + k) % (pixels.length / 4)) * 4;
            pixels[i] ^= (detHash('gp:' + i) & 1);
          }
        }
      };
    }
  }

  function patchCanvasNoise() {
    if (!FP.canvasNoise) return;
    var origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function(sx, sy, sw, sh) {
      var img = origGetImageData.apply(this, arguments);
      return applyUnifiedNoise(img, sx || 0, sy || 0);
    };
    if (typeof OffscreenCanvas !== 'undefined') {
      var origOC = OffscreenCanvas.prototype.getContext;
      OffscreenCanvas.prototype.getContext = function(type, attrs) {
        var ctx = origOC.call(this, type, attrs);
        if (ctx && type === '2d') {
          var origGet = ctx.getImageData.bind(ctx);
          ctx.getImageData = function(sx, sy, sw, sh) {
            return applyUnifiedNoise(origGet(sx, sy, sw, sh), sx || 0, sy || 0);
          };
        }
        return ctx;
      };
    }
  }

  patchNavigator();
  patchPlugins();
  if (FP.canvasNoise) patchCanvasNoise();
  try {
    hookWebGL(WebGLRenderingContext.prototype);
    if (typeof WebGL2RenderingContext !== 'undefined') hookWebGL(WebGL2RenderingContext.prototype);
  } catch(e) {}
`;
}
