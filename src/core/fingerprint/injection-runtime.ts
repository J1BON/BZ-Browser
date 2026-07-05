/** Generates the in-page antidetect runtime (injected via addInitScript). */

export interface RuntimeOptions {
  /** Patched Chromium handles canvas/TLS/UA natively — skip heavy JS hooks */
  useNativeKernel: boolean;
}

export function buildInjectionRuntimeScript(fpJson: string, options: RuntimeOptions): string {
  const nativeSkip = options.useNativeKernel ? 'true' : 'false';
  return `
(function() {
  'use strict';
  var FP = ${fpJson};
  var USE_NATIVE = ${nativeSkip};

  var _origFnToString = Function.prototype.toString;
  var _nativeMask = typeof WeakMap !== 'undefined' ? new WeakMap() : { _m: {}, set: function(k,v){this._m[k]=v;}, get: function(k){return this._m[k];}, has: function(k){return k in this._m;} };
  function maskNative(fn, nativeName) {
    _nativeMask.set(fn, 'function ' + nativeName + '() { [native code] }');
    return fn;
  }
  Function.prototype.toString = maskNative(function() {
    if (_nativeMask.has(this)) return _nativeMask.get(this);
    return _origFnToString.call(this);
  }, 'toString');

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

  function noiseImageData(img, ox, oy) {
    var d = img.data, w = img.width;
    for (var y = 0; y < img.height; y++) {
      for (var x = 0; x < w; x++) {
        var i = (y * w + x) * 4;
        if (detBit('c:' + ox + ':' + oy + ':' + x + ':' + y)) d[i] ^= 1;
      }
    }
    return img;
  }

  function buildPluginArray() {
    var pdfViewer = { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' };
    var chromePdf = { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' };
    var chromiumPdf = { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: '' };
    var edgePdf = { name: 'Microsoft Edge PDF Viewer', filename: 'internal-pdf-viewer', description: '' };
    var webkitPdf = { name: 'WebKit built-in PDF', filename: 'internal-pdf-viewer', description: '' };
    var arr = [pdfViewer, chromePdf, chromiumPdf, edgePdf, webkitPdf];
    arr.item = function(i) { return arr[i] || null; };
    arr.namedItem = function(n) {
      for (var j = 0; j < arr.length; j++) if (arr[j].name === n) return arr[j];
      return null;
    };
    arr.refresh = function() {};
    return arr;
  }

  var navProps = {
    userAgent: { get: function() { return FP.ua; } },
    platform: { get: function() { return FP.platform; } },
    languages: { get: function() { return FP.langs; } },
    language: { get: function() { return FP.langs[0]; } },
    hardwareConcurrency: { get: function() { return FP.hwConcurrency; } },
    deviceMemory: { get: function() { return FP.deviceMemory; } },
    maxTouchPoints: { get: function() { return FP.maxTouchPoints; } },
    doNotTrack: { get: function() { return FP.doNotTrack; } },
    webdriver: { get: function() { return false; } },
    vendor: { get: function() { return 'Google Inc.'; } },
    pdfViewerEnabled: { get: function() { return true; } },
    plugins: { get: function() { return buildPluginArray(); } },
  };
  Object.keys(navProps).forEach(function(key) {
    try { Object.defineProperty(navigator, key, navProps[key]); } catch(e) {}
  });

  if (navigator.userAgentData) {
    try {
      var brands = FP.uaBrands.map(function(b) { return { brand: b.brand, version: b.version }; });
      var uadGetHighEntropy = maskNative(function(hints) {
        var result = { brands: brands, mobile: FP.uaMobile, platform: FP.uaPlatform };
        if (hints.indexOf('architecture') >= 0) result.architecture = FP.architecture;
        if (hints.indexOf('bitness') >= 0) result.bitness = FP.bitness;
        if (hints.indexOf('model') >= 0) result.model = FP.model;
        if (hints.indexOf('platformVersion') >= 0) result.platformVersion = FP.platformVersion;
        if (hints.indexOf('uaFullVersion') >= 0) result.uaFullVersion = FP.uaFullVersion;
        if (hints.indexOf('fullVersionList') >= 0) result.fullVersionList = FP.fullVersionList;
        return Promise.resolve(result);
      }, 'getHighEntropyValues');
      Object.defineProperty(navigator, 'userAgentData', {
        get: function() {
          return {
            brands: brands,
            mobile: FP.uaMobile,
            platform: FP.uaPlatform,
            getHighEntropyValues: uadGetHighEntropy,
            toJSON: function() { return { brands: brands, mobile: FP.uaMobile, platform: FP.uaPlatform }; },
          };
        },
      });
    } catch(e) {}
  }

  if (!USE_NATIVE) {
    var availOff = FP.availHeightOffset || 40;
    ['width','availWidth'].forEach(function(k) {
      try { Object.defineProperty(screen, k, { get: function() { return FP.w; } }); } catch(e) {}
    });
    try { Object.defineProperty(screen, 'height', { get: function() { return FP.h; } }); } catch(e) {}
    try { Object.defineProperty(screen, 'availHeight', { get: function() { return FP.h - availOff; } }); } catch(e) {}
    try { Object.defineProperty(window, 'innerWidth', { get: function() { return FP.innerW; } }); } catch(e) {}
    try { Object.defineProperty(window, 'innerHeight', { get: function() { return FP.innerH; } }); } catch(e) {}
    try { Object.defineProperty(window, 'devicePixelRatio', { get: function() { return FP.dpr; } }); } catch(e) {}
    try { Object.defineProperty(screen, 'colorDepth', { get: function() { return FP.colorDepth; } }); } catch(e) {}
    try { Object.defineProperty(screen, 'pixelDepth', { get: function() { return FP.colorDepth; } }); } catch(e) {}
  }

  var OrigDTF = Intl.DateTimeFormat;
  var WrappedDTF = maskNative(function(locales, opts) {
    opts = opts || {};
    if (!opts.timeZone) opts.timeZone = FP.tz;
    return new OrigDTF(locales, opts);
  }, 'DateTimeFormat');
  WrappedDTF.prototype = OrigDTF.prototype;
  WrappedDTF.supportedLocalesOf = OrigDTF.supportedLocalesOf.bind(OrigDTF);
  Intl.DateTimeFormat = WrappedDTF;
  OrigDTF.prototype.resolvedOptions = maskNative(function() {
    var o = Object.assign({}, OrigDTF.prototype.resolvedOptions.call(this));
    o.timeZone = FP.tz;
    return o;
  }, 'resolvedOptions');

  if (navigator.geolocation) {
    var pos = { coords: { latitude: FP.lat, longitude: FP.lon, accuracy: 50, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() };
    navigator.geolocation.getCurrentPosition = maskNative(function(ok) { ok(pos); }, 'getCurrentPosition');
    navigator.geolocation.watchPosition = maskNative(function(ok) { ok(pos); return 0; }, 'watchPosition');
  }

  if (!USE_NATIVE && FP.canvasNoise) {
    var origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    var origToBlob = HTMLCanvasElement.prototype.toBlob;
    var origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    HTMLCanvasElement.prototype.toDataURL = maskNative(function() {
      var ctx = this.getContext('2d');
      if (ctx) {
        var img = origGetImageData.call(ctx, 0, 0, this.width, this.height);
        noiseImageData(img, 0, 0);
        ctx.putImageData(img, 0, 0);
      }
      return origToDataURL.apply(this, arguments);
    }, 'toDataURL');
    HTMLCanvasElement.prototype.toBlob = maskNative(function() {
      var ctx = this.getContext('2d');
      if (ctx) {
        var img = origGetImageData.call(ctx, 0, 0, this.width, this.height);
        noiseImageData(img, 0, 0);
        ctx.putImageData(img, 0, 0);
      }
      return origToBlob.apply(this, arguments);
    }, 'toBlob');
    CanvasRenderingContext2D.prototype.getImageData = maskNative(function(sx, sy, sw, sh) {
      var img = origGetImageData.apply(this, arguments);
      return noiseImageData(img, sx || 0, sy || 0);
    }, 'getImageData');
  }

  if (!USE_NATIVE) {
    function hookWebGL(proto) {
      var origGetParam = proto.getParameter;
      var origGetExt = proto.getExtension;
      var origReadPixels = proto.readPixels;
      proto.getParameter = maskNative(function(p) {
        if (FP.webGlMetaSpoof) {
          if (p === 37445) return FP.webglVendor;
          if (p === 37446) return FP.webglRenderer;
          if (p === 3379) return FP.webglMaxTexture || 16384;
        }
        return origGetParam.call(this, p);
      }, 'getParameter');
      proto.getExtension = maskNative(function(name) {
        if (FP.webGlMetaSpoof && name === 'WEBGL_debug_renderer_info') {
          return { UNMASKED_VENDOR_WEBGL: 37445, UNMASKED_RENDERER_WEBGL: 37446 };
        }
        return origGetExt.call(this, name);
      }, 'getExtension');
      if (FP.webGlImageNoise) {
        proto.readPixels = maskNative(function(x, y, w, h, fmt, type, pixels) {
          origReadPixels.call(this, x, y, w, h, fmt, type, pixels);
          if (pixels && pixels.length) {
            for (var i = 0; i < pixels.length; i += 4) {
              if (detBit('g:' + x + ':' + y + ':' + i)) pixels[i] ^= 1;
            }
          }
        }, 'readPixels');
      }
    }
    try {
      hookWebGL(WebGLRenderingContext.prototype);
      if (typeof WebGL2RenderingContext !== 'undefined') hookWebGL(WebGL2RenderingContext.prototype);
    } catch(e) {}
  }

  if (!USE_NATIVE && FP.audioNoise) {
    var OrigAC = window.AudioContext || window.webkitAudioContext;
    if (OrigAC) {
      var _origCreateAnalyser = OrigAC.prototype.createAnalyser;
      OrigAC.prototype.createAnalyser = maskNative(function() {
        var analyser = _origCreateAnalyser.call(this);
        var origGetFloat = analyser.getFloatFrequencyData.bind(analyser);
        analyser.getFloatFrequencyData = maskNative(function(arr) {
          origGetFloat(arr);
          for (var i = 0; i < arr.length; i++) arr[i] += (detUnit('a:' + i) - 0.5) * 0.0001;
        }, 'getFloatFrequencyData');
        return analyser;
      }, 'createAnalyser');
    }
    var OrigOffline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (OrigOffline) {
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

  if (!USE_NATIVE && FP.clientRectsNoise) {
    var origGCBR = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = maskNative(function() {
      var r = origGCBR.call(this);
      var n = (detUnit('r:' + (this.tagName || '')) - 0.5) * 0.00001;
      return { x: r.x + n, y: r.y + n, width: r.width, height: r.height, top: r.top + n, right: r.right + n, bottom: r.bottom + n, left: r.left + n, toJSON: function() { return this; } };
    }, 'getBoundingClientRect');
  }

  if (!USE_NATIVE && FP.fontSpoof) {
    var allowedFonts = FP.fonts;
    if (document.fonts && document.fonts.check) {
      var origCheck = document.fonts.check.bind(document.fonts);
      document.fonts.check = maskNative(function(font, text) {
        var family = (font.match(/['"]?([^'"]+)['"]?/) || [])[1] || font;
        if (allowedFonts.indexOf(family) === -1) return false;
        return origCheck(font, text);
      }, 'check');
    }
    var origMeasureText = CanvasRenderingContext2D.prototype.measureText;
    CanvasRenderingContext2D.prototype.measureText = maskNative(function(text) {
      var m = origMeasureText.call(this, text);
      var n = (detUnit('mt:' + text) - 0.5) * 0.002;
      return Object.assign({}, m, { width: m.width + n });
    }, 'measureText');
    var origOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
    if (origOffsetWidth && origOffsetWidth.get) {
      var origGetW = origOffsetWidth.get;
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
        get: function() {
          var w = origGetW.call(this);
          var style = this.style && this.style.fontFamily;
          if (style) {
            var fam = (style.match(/['"]?([^'"]+)['"]?/) || [])[1] || style;
            if (allowedFonts.indexOf(fam) === -1) return w + Math.floor(detUnit('fw:' + fam) * 3) + 1;
          }
          return w;
        },
      });
    }
  }

  if (FP.spoofMediaDevices && navigator.mediaDevices) {
    navigator.mediaDevices.enumerateDevices = maskNative(function() {
      return Promise.resolve(FP.mediaDevicesList.map(function(d) { return Object.assign({}, d); }));
    }, 'enumerateDevices');
  }

  if (FP.spoofSpeechVoices && window.speechSynthesis) {
    speechSynthesis.getVoices = maskNative(function() { return FP.speechVoicesList.slice(); }, 'getVoices');
  }

  if (FP.webrtcRelay && window.RTCPeerConnection) {
    var OrigRTC = window.RTCPeerConnection;
    function rewriteSdp(sdp, ip) {
      if (!ip || !sdp) return sdp;
      var out = sdp.replace(/c=IN IP4 [\\d.]+/g, 'c=IN IP4 ' + ip);
      out = out.replace(/a=candidate:([^\\r\\n]+)/g, function(line, body) {
        if (/ 192\\.168\\.| 10\\.| 127\\.| 172\\.(1[6-9]|2\\d|3[01])\\./.test(body)) return line;
        return 'a=candidate:' + body.replace(/(\\d{1,3}\\.){3}\\d{1,3}/g, ip);
      });
      return out;
    }
    var origSetLocal = OrigRTC.prototype.setLocalDescription;
    OrigRTC.prototype.setLocalDescription = maskNative(function(desc) {
      if (desc && desc.sdp && FP.proxyIp) {
        var sdp = rewriteSdp(desc.sdp, FP.proxyIp);
        return origSetLocal.call(this, new RTCSessionDescription({ type: desc.type, sdp: sdp }));
      }
      return origSetLocal.apply(this, arguments);
    }, 'setLocalDescription');
    var origAddIce = OrigRTC.prototype.addIceCandidate;
    OrigRTC.prototype.addIceCandidate = maskNative(function(candidate) {
      if (candidate && candidate.candidate && /192\\.168|10\\.|172\\.(1[6-9]|2|3[01])|127\\./.test(candidate.candidate)) {
        return Promise.resolve();
      }
      return origAddIce.apply(this, arguments);
    }, 'addIceCandidate');
  }

  if (FP.isMobile) {
    try {
      Object.defineProperty(navigator, 'connection', {
        get: function() {
          return { effectiveType: FP.connectionType || '4g', downlink: FP.connectionDownlink || 10, rtt: FP.connectionRtt || 50, saveData: false };
        },
      });
    } catch(e) {}
    if (navigator.getBattery) {
      navigator.getBattery = maskNative(function() {
        return Promise.resolve({ charging: FP.batteryCharging !== false, chargingTime: 0, dischargingTime: Infinity, level: FP.batteryLevel || 0.85 });
      }, 'getBattery');
    }
  }

  if (FP.portScanProtect && window.fetch) {
    var blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'];
    var origFetch = window.fetch;
    window.fetch = maskNative(function(input, init) {
      try {
        var url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
        var host = new URL(url, window.location.href).hostname;
        if (blockedHosts.indexOf(host) >= 0 && url.indexOf(window.location.hostname) < 0) {
          return Promise.reject(new TypeError('Failed to fetch'));
        }
      } catch(e) {}
      return origFetch.apply(this, arguments);
    }, 'fetch');
  }

  delete window.__playwright;
  delete window.__pw_manual;
  delete window.__PW_inspect;

  if (navigator.permissions && navigator.permissions.query) {
    var origQuery = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = maskNative(function(desc) {
      if (desc.name === 'notifications') return Promise.resolve({ state: 'prompt', onchange: null });
      return origQuery(desc);
    }, 'query');
  }
})();
`;
}
