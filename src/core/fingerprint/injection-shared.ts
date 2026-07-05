/** Shared in-page hook body used by main thread and Worker scopes (must stay identical). */

import { buildNativeMaskBootstrap } from './injection-native-mask.js';

export function buildScopeHooksBody(): string {
  return `
  ${buildNativeMaskBootstrap()}

  function defineProtoGetter(proto, key, getterFn) {
    if (!proto) return;
    try {
      var orig = Object.getOwnPropertyDescriptor(proto, key);
      var getter = maskNative(getterFn, 'get ' + key);
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

  function patchNavigatorProto(proto) {
    if (!proto) return;
    defineProtoGetter(proto, 'userAgent', function() { return FP.ua; });
    defineProtoGetter(proto, 'platform', function() { return FP.platform; });
    defineProtoGetter(proto, 'languages', function() { return FP.langs; });
    defineProtoGetter(proto, 'language', function() { return FP.langs[0]; });
    defineProtoGetter(proto, 'hardwareConcurrency', function() { return FP.hwConcurrency; });
    defineProtoGetter(proto, 'deviceMemory', function() { return FP.deviceMemory; });
    defineProtoGetter(proto, 'maxTouchPoints', function() { return FP.maxTouchPoints; });
    defineProtoGetter(proto, 'doNotTrack', function() { return FP.doNotTrack; });
    defineProtoGetter(proto, 'webdriver', function() { return false; });
    defineProtoGetter(proto, 'vendor', function() { return 'Google Inc.'; });
    defineProtoGetter(proto, 'pdfViewerEnabled', function() { return true; });
  }

  function patchNavigator() {
    patchNavigatorProto(typeof Navigator !== 'undefined' ? Navigator.prototype : null);
    patchNavigatorProto(typeof WorkerNavigator !== 'undefined' ? WorkerNavigator.prototype : null);
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
    var build = buildPluginArray;
    defineProtoGetter(typeof Navigator !== 'undefined' ? Navigator.prototype : null, 'plugins', function() { return build(); });
    defineProtoGetter(typeof WorkerNavigator !== 'undefined' ? WorkerNavigator.prototype : null, 'plugins', function() { return build(); });
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

  var _nativeCtxGetImageData = CanvasRenderingContext2D.prototype.getImageData;
  function readNoisedImageData(ctx, sx, sy, sw, sh) {
    var img = _nativeCtxGetImageData.call(ctx, sx, sy, sw, sh);
    return applyUnifiedNoise(img, sx || 0, sy || 0);
  }

  function patchCanvasNoise() {
    if (!FP.canvasNoise) return;
    CanvasRenderingContext2D.prototype.getImageData = maskNative(function(sx, sy, sw, sh) {
      return readNoisedImageData(this, sx, sy, sw, sh);
    }, 'getImageData');
    if (typeof OffscreenCanvas !== 'undefined') {
      var origOC = OffscreenCanvas.prototype.getContext;
      var origConvertToBlob = OffscreenCanvas.prototype.convertToBlob;
      OffscreenCanvas.prototype.getContext = function(type, attrs) {
        var ctx = origOC.call(this, type, attrs);
        if (ctx && type === '2d') {
          ctx.getImageData = maskNative(function(sx, sy, sw, sh) {
            return readNoisedImageData(ctx, sx, sy, sw, sh);
          }, 'getImageData');
        }
        return ctx;
      };
      if (origConvertToBlob) {
        OffscreenCanvas.prototype.convertToBlob = maskNative(function(options) {
          var self = this;
          var ctx = self.getContext('2d');
          if (ctx && self.width && self.height) {
            var img = _nativeCtxGetImageData.call(ctx, 0, 0, self.width, self.height);
            var backup = new Uint8ClampedArray(img.data);
            applyUnifiedNoise(img, 0, 0);
            ctx.putImageData(img, 0, 0);
            return origConvertToBlob.call(self, options).finally(function() {
              img.data.set(backup);
              ctx.putImageData(img, 0, 0);
            });
          }
          return origConvertToBlob.call(self, options);
        }, 'convertToBlob');
      }
    }
  }

  function patchAudioNoise() {
    var sampleRate = FP.audioSampleRate || 44100;
    function noiseArray(arr, prefix) {
      for (var i = 0; i < arr.length; i++) arr[i] += (detUnit(prefix + ':' + i) - 0.5) * 0.0001;
    }
    function patchAnalyser(analyser) {
      var methods = ['getFloatFrequencyData', 'getFloatTimeDomainData', 'getByteFrequencyData', 'getByteTimeDomainData'];
      for (var m = 0; m < methods.length; m++) {
        (function(method) {
          if (!analyser[method]) return;
          var orig = analyser[method].bind(analyser);
          analyser[method] = maskNative(function(arr) {
            orig(arr);
            noiseArray(arr, 'a:' + method);
          }, method);
        })(methods[m]);
      }
      return analyser;
    }
    if (typeof AudioBuffer !== 'undefined') {
      var origGetChannel = AudioBuffer.prototype.getChannelData;
      AudioBuffer.prototype.getChannelData = maskNative(function(channel) {
        var data = origGetChannel.call(this, channel);
        for (var i = 0; i < data.length; i += 100) {
          data[i] += (detUnit('ab:' + channel + ':' + i) - 0.5) * 1e-7;
        }
        return data;
      }, 'getChannelData');
    }
    var OrigAC = typeof AudioContext !== 'undefined' ? AudioContext : (typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null);
    if (OrigAC) {
      defineProtoGetter(OrigAC.prototype, 'sampleRate', function() { return sampleRate; });
      var origCreateAnalyser = OrigAC.prototype.createAnalyser;
      OrigAC.prototype.createAnalyser = maskNative(function() {
        return patchAnalyser(origCreateAnalyser.call(this));
      }, 'createAnalyser');
      var origCreateOsc = OrigAC.prototype.createOscillator;
      OrigAC.prototype.createOscillator = maskNative(function() {
        var osc = origCreateOsc.call(this);
        try {
          if (osc.detune) osc.detune.value = (detUnit('osc:' + FP.seed) - 0.5) * 0.01;
        } catch(e) {}
        return osc;
      }, 'createOscillator');
    }
    var OrigOffline = typeof OfflineAudioContext !== 'undefined' ? OfflineAudioContext : (typeof webkitOfflineAudioContext !== 'undefined' ? webkitOfflineAudioContext : null);
    if (OrigOffline) {
      defineProtoGetter(OrigOffline.prototype, 'sampleRate', function() { return sampleRate; });
      var origStartRendering = OrigOffline.prototype.startRendering;
      OrigOffline.prototype.startRendering = maskNative(function() {
        return origStartRendering.call(this).then(function(buffer) {
          for (var ch = 0; ch < buffer.numberOfChannels; ch++) {
            var data = buffer.getChannelData(ch);
            for (var i = 0; i < data.length; i += 100) {
              data[i] += (detUnit('o:' + ch + ':' + i) - 0.5) * 1e-7;
            }
          }
          return buffer;
        });
      }, 'startRendering');
    }
  }

  function patchFontSpoof() {
    if (!FP.fontSpoof || !FP.fonts || !FP.fonts.length) return;
    var allowed = FP.fonts;
    var fallback = allowed[0];
    function extractFamilies(fontStr) {
      if (!fontStr) return [];
      return fontStr.split(',').map(function(f) { return f.replace(/['"]/g, '').trim(); });
    }
    function isGeneric(f) {
      return !f || f === 'inherit' || f === 'serif' || f === 'sans-serif' || f === 'monospace' || f === 'cursive' || f === 'fantasy';
    }
    function hasDisallowedFont(families) {
      for (var i = 0; i < families.length; i++) {
        var f = families[i];
        if (isGeneric(f)) continue;
        var ok = false;
        for (var j = 0; j < allowed.length; j++) {
          if (f.toLowerCase() === allowed[j].toLowerCase()) { ok = true; break; }
        }
        if (!ok) return true;
      }
      return false;
    }
    function remapFont(fontStr) {
      var families = extractFamilies(fontStr);
      if (!hasDisallowedFont(families)) return fontStr;
      for (var i = 0; i < families.length; i++) {
        if (!isGeneric(families[i])) return fontStr.replace(families[i], fallback);
      }
      return fontStr;
    }
    var origMeasureText = CanvasRenderingContext2D.prototype.measureText;
    CanvasRenderingContext2D.prototype.measureText = maskNative(function(text) {
      var saved = this.font;
      var remapped = remapFont(saved);
      if (remapped !== saved) this.font = remapped;
      var r = origMeasureText.call(this, text);
      if (remapped !== saved) this.font = saved;
      return r;
    }, 'measureText');
    if (typeof document !== 'undefined' && document.fonts && document.fonts.check) {
      var origCheck = document.fonts.check.bind(document.fonts);
      document.fonts.check = maskNative(function(font, text) {
        if (hasDisallowedFont(extractFamilies(font || ''))) return false;
        return origCheck(font, text);
      }, 'check');
    }
    function patchOffset(prop) {
      var desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop);
      if (!desc || !desc.get) return;
      var origGet = desc.get;
      Object.defineProperty(HTMLElement.prototype, prop, {
        get: maskNative(function() {
          try {
            var ff = this.style && this.style.fontFamily;
            if (ff && hasDisallowedFont(extractFamilies(ff))) {
              var saved = this.style.fontFamily;
              this.style.fontFamily = fallback + ', sans-serif';
              var v = origGet.call(this);
              this.style.fontFamily = saved;
              return v;
            }
          } catch(e) {}
          return origGet.call(this);
        }, 'get ' + prop),
        configurable: true,
        enumerable: desc.enumerable !== false,
      });
    }
    patchOffset('offsetWidth');
    patchOffset('offsetHeight');
  }

  patchNavigator();
  patchPlugins();
  if (FP.canvasNoise) patchCanvasNoise();
  if (FP.audioNoise) patchAudioNoise();
  if (FP.fontSpoof) patchFontSpoof();
  try {
    hookWebGL(WebGLRenderingContext.prototype);
    if (typeof WebGL2RenderingContext !== 'undefined') hookWebGL(WebGL2RenderingContext.prototype);
  } catch(e) {}
`;
}
