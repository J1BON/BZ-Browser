import type { BrowserProfile, FingerprintConfig } from '../../types/profile.js';
import { seedInt } from './seed.js';
import { buildTlsLaunchArgs } from './tls-profiles.js';
import { buildDeviceIdentity, buildAcceptLanguage, buildLanguageList } from './device-identity.js';
function resolvePlatform(fp: FingerprintConfig): string {
  if (fp.device === 'iOS') return 'iPhone';
  if (fp.device === 'Android') return 'Linux armv81';
  if (fp.device === 'MacOS') return 'MacIntel';
  if (fp.device === 'Linux') return 'Linux x86_64';
  return 'Win32';
}

function buildUaBrands(fp: FingerprintConfig): { brand: string; version: string }[] {
  const major = fp.browserVersion.split('.')[0] ?? '131';
  if (fp.device === 'iOS') {
    return [
      { brand: 'Safari', version: major },
      { brand: 'Not_A Brand', version: '99' },
    ];
  }
  return [
    { brand: 'Google Chrome', version: major },
    { brand: 'Chromium', version: major },
    { brand: 'Not_A Brand', version: '24' },
  ];
}

function resolveUaPlatform(fp: FingerprintConfig): string {
  if (fp.device === 'iOS') return 'iOS';
  if (fp.device === 'Android') return 'Android';
  if (fp.device === 'MacOS') return 'macOS';
  if (fp.device === 'Linux') return 'Linux';
  return 'Windows';
}

export interface InjectionPayload {
  ua: string;
  langs: string[];
  tz: string;
  lat: number;
  lon: number;
  w: number;
  h: number;
  innerW: number;
  innerH: number;
  dpr: number;
  webglVendor: string;
  webglRenderer: string;
  webgpuVendor: string;
  webgpuArchitecture: string;
  canvasNoise: boolean;
  audioNoise: boolean;
  clientRectsNoise: boolean;
  fontSpoof: boolean;
  fonts: string[];
  blockWebRTC: boolean;
  spoofMediaDevices: boolean;
  spoofSpeechVoices: boolean;
  spoofWebGPU: boolean;
  seed: string;
  hwConcurrency: number;
  deviceMemory: number;
  platform: string;
  maxTouchPoints: number;
  isMobile: boolean;
  doNotTrack: string | null;
  portScanProtect: boolean;
  webGlImageNoise: boolean;
  webGlMetaSpoof: boolean;
  uaBrands: { brand: string; version: string }[];
  uaPlatform: string;
  uaMobile: boolean;
  webrtcRelay: boolean;
  macValue: string;
  deviceNameValue: string;
  proxyIp: string;
  uaFullVersion: string;
  platformVersion: string;
  architecture: string;
  bitness: string;
  model: string;
  fullVersionList: { brand: string; version: string }[];
  mediaDevicesList: { deviceId: string; kind: string; label: string; groupId: string }[];
  speechVoicesList: { name: string; lang: string; default: boolean; localService: boolean; voiceURI: string }[];
  numericSeed: number;
  colorDepth: number;
  taskbarOffset: number;
  battery: { charging: boolean; level: number; chargingTime: number; dischargingTime: number };
  connection: { effectiveType: string; downlink: number; rtt: number; type: string };
}

export function buildInjectionPayload(fp: FingerprintConfig, seed: string): InjectionPayload {
  const platform = resolvePlatform(fp);
  const screenW = fp.screenWidth ?? fp.windowWidth;
  const screenH = fp.screenHeight ?? fp.windowHeight;
  const isMobile = fp.formFactor === 'mobile';
  const identity = buildDeviceIdentity(fp, seed);
  const langs = buildLanguageList(fp);

  // Deterministic numeric seed reused by the injected script so noise is
  // stable across repeated reads within the same profile.
  let numericSeed = 0;
  for (let i = 0; i < seed.length; i++) {
    numericSeed = (Math.imul(31, numericSeed) + seed.charCodeAt(i)) | 0;
  }
  numericSeed = numericSeed >>> 0;

  // Per-profile (seeded) values that used to be hardcoded.
  const colorDepth = [24, 24, 24, 30][seedInt(seed + 'depth', 0, 3)];
  const taskbarOffset = isMobile ? 0 : [40, 48, 60, 72][seedInt(seed + 'taskbar', 0, 3)];
  const batteryLevel = Math.round((0.5 + seedInt(seed + 'battlvl', 0, 49) / 100) * 100) / 100;
  const batteryCharging = seedInt(seed + 'battchg', 0, 1) === 1;
  const effectiveTypes = ['4g', '4g', '4g', 'wifi'];
  const connEffective = isMobile ? effectiveTypes[seedInt(seed + 'conn', 0, 3)] : '4g';
  const connDownlink = isMobile ? [5, 8, 10, 15][seedInt(seed + 'dl', 0, 3)] : 10;
  const connRtt = isMobile ? [50, 75, 100, 150][seedInt(seed + 'rtt', 0, 3)] : 50;

  return {
    ua: fp.userAgent,
    langs,
    tz: fp.timeZone,
    lat: fp.latitude ?? 0,
    lon: fp.longitude ?? 0,
    w: screenW,
    h: screenH,
    innerW: fp.windowWidth,
    innerH: fp.windowHeight,
    dpr: fp.devicePixelRatio ?? (isMobile ? 3 : 1),
    webglVendor: fp.webGlMark ?? 'Google Inc. (NVIDIA)',
    webglRenderer: fp.webGlMode ?? 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    webgpuVendor: fp.webGPUVendor ?? 'nvidia',
    webgpuArchitecture: fp.webGPUArchitecture ?? 'ampere',
    canvasNoise: fp.canvas === '2',
    audioNoise: fp.audioContext === '2',
    clientRectsNoise: fp.clientRects === '2',
    fontSpoof: fp.fontEnable === '2',
    fonts: fp.fontList ?? ['Arial', 'Calibri', 'Segoe UI', 'Times New Roman', 'Verdana'],
    blockWebRTC: fp.webRTC === '3',
    webrtcRelay: fp.webRTC === '2',
    spoofMediaDevices: fp.mediaDevices === '2',
    spoofSpeechVoices: fp.speechVoices === '2',
    spoofWebGPU: fp.webGPU === '2',
    seed,
    hwConcurrency: fp.hardwareConcurrency ?? seedInt(seed + 'hw', 4, 16),
    deviceMemory: fp.deviceMemory ?? [4, 8, 16][seedInt(seed + 'mem', 0, 2)],
    platform,
    maxTouchPoints: fp.touchPoints ?? (isMobile ? 5 : 0),
    isMobile,
    doNotTrack: fp.doNotTrack === '1' ? '1' : null,
    portScanProtect: fp.portScanProtection !== '2',
    webGlImageNoise: fp.webGlImage === '2',
    webGlMetaSpoof: fp.webGlMeta !== '1',
    uaBrands: buildUaBrands(fp),
    uaPlatform: resolveUaPlatform(fp),
    uaMobile: isMobile,
    macValue: fp.macValue ?? '00-00-00-00-00-00',
    deviceNameValue: fp.deviceNameValue ?? 'DESKTOP-PC',
    proxyIp: '',
    uaFullVersion: identity.uaFullVersion,
    platformVersion: identity.platformVersion,
    architecture: identity.architecture,
    bitness: identity.bitness,
    model: identity.model,
    fullVersionList: identity.fullVersionList,
    mediaDevicesList: identity.mediaDevices,
    speechVoicesList: identity.speechVoices,
    numericSeed,
    colorDepth,
    taskbarOffset,
    battery: {
      charging: batteryCharging,
      level: batteryLevel,
      chargingTime: batteryCharging ? seedInt(seed + 'chgtime', 0, 40) * 60 : Infinity,
      dischargingTime: batteryCharging ? Infinity : seedInt(seed + 'dischg', 40, 200) * 60,
    },
    connection: {
      effectiveType: connEffective,
      downlink: connDownlink,
      rtt: connRtt,
      type: isMobile ? 'cellular' : 'wifi',
    },
  };
}

export function buildInjectionPayloadWithProxy(fp: FingerprintConfig, seed: string, proxyIp?: string): InjectionPayload {
  const payload = buildInjectionPayload(fp, seed);
  if (proxyIp) payload.proxyIp = proxyIp;
  return payload;
}

export function buildFingerprintScript(fp: FingerprintConfig, fingerprintId = 'default', proxyIp?: string): string {
  const FP = buildInjectionPayloadWithProxy(fp, fingerprintId, proxyIp);

  return `
(function() {
  'use strict';
  const FP = ${JSON.stringify(FP)};

  function mulberry32(a) {
    return function() {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  // Non-deterministic stream (only used where variance-per-call is acceptable).
  var rng = mulberry32(FP.numericSeed | 0);

  // Deterministic per-index noise: the SAME (seed,index) always yields the SAME
  // value. Detectors that read canvas/webgl twice and compare hashes get a
  // stable result, exactly like real hardware.
  function noiseAt(index) {
    var h = (FP.numericSeed ^ Math.imul(index + 1, 0x9E3779B1)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x85EBCA77) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xC2B2AE3D) >>> 0;
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  // --- toString masking: make every override report [native code] ---
  var nativeStrings = new WeakMap();
  var origFnToString = Function.prototype.toString;
  function maskNative(fake, real, name) {
    try {
      var target = name || (real && real.name) || (fake && fake.name) || '';
      nativeStrings.set(fake, 'function ' + target + '() { [native code] }');
    } catch (e) {}
    return fake;
  }
  var patchedToString = function toString() {
    if (nativeStrings.has(this)) return nativeStrings.get(this);
    return origFnToString.call(this);
  };
  try {
    nativeStrings.set(patchedToString, 'function toString() { [native code] }');
    Function.prototype.toString = patchedToString;
  } catch (e) {}

  // Replace a prototype/object method AND mask its toString in one step.
  function redefineMethod(obj, key, factory) {
    try {
      var orig = obj[key];
      var fake = factory(orig);
      maskNative(fake, orig, key);
      obj[key] = fake;
    } catch (e) {}
  }
  // Define an accessor whose getter reports [native code].
  function defineGetter(obj, key, getter) {
    try {
      maskNative(getter, null, 'get ' + key);
      Object.defineProperty(obj, key, { get: getter, configurable: true, enumerable: true });
    } catch (e) {}
  }

  // --- Navigator ---
  var navGetters = {
    userAgent: function() { return FP.ua; },
    platform: function() { return FP.platform; },
    languages: function() { return FP.langs.slice(); },
    language: function() { return FP.langs[0]; },
    hardwareConcurrency: function() { return FP.hwConcurrency; },
    deviceMemory: function() { return FP.deviceMemory; },
    maxTouchPoints: function() { return FP.maxTouchPoints; },
    doNotTrack: function() { return FP.doNotTrack; },
    webdriver: function() { return false; },
    vendor: function() { return 'Google Inc.'; },
    pdfViewerEnabled: function() { return true; },
    appVersion: function() { return FP.ua.replace('Mozilla/', ''); },
  };
  Object.keys(navGetters).forEach(function(key) {
    defineGetter(navigator, key, navGetters[key]);
  });

  // --- Realistic PluginArray / MimeTypeArray (matches modern Chrome) ---
  if (!FP.isMobile) {
    try {
      var pluginData = [
        { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Microsoft Edge PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'WebKit built-in PDF', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      ];
      var mimeData = [
        { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
        { type: 'text/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
      ];
      var MimeType = function() {};
      var Plugin = function() {};
      var mimeArr = Object.create(MimeTypeArray ? MimeTypeArray.prototype : Object.prototype);
      var pluginArr = Object.create(PluginArray ? PluginArray.prototype : Object.prototype);
      var mimes = mimeData.map(function(m) {
        var mt = Object.create((typeof MimeType !== 'undefined' && window.MimeType) ? window.MimeType.prototype : Object.prototype);
        Object.defineProperties(mt, {
          type: { value: m.type, enumerable: true },
          suffixes: { value: m.suffixes, enumerable: true },
          description: { value: m.description, enumerable: true },
        });
        return mt;
      });
      var plugins = pluginData.map(function(p) {
        var pl = Object.create((window.Plugin) ? window.Plugin.prototype : Object.prototype);
        Object.defineProperties(pl, {
          name: { value: p.name, enumerable: true },
          filename: { value: p.filename, enumerable: true },
          description: { value: p.description, enumerable: true },
          length: { value: mimes.length, enumerable: true },
        });
        mimes.forEach(function(mt, i) { pl[i] = mt; });
        pl.item = maskNative(function(i) { return mimes[i] || null; }, null, 'item');
        pl.namedItem = maskNative(function(n) { return mimes.filter(function(x){return x.type===n;})[0] || null; }, null, 'namedItem');
        return pl;
      });
      mimes.forEach(function(mt, i) {
        Object.defineProperty(mt, 'enabledPlugin', { value: plugins[0], enumerable: true });
      });
      plugins.forEach(function(pl, i) { pluginArr[i] = pl; pluginArr[pl.name] = pl; });
      mimes.forEach(function(mt, i) { mimeArr[i] = mt; mimeArr[mt.type] = mt; });
      Object.defineProperty(pluginArr, 'length', { value: plugins.length });
      Object.defineProperty(mimeArr, 'length', { value: mimes.length });
      pluginArr.item = maskNative(function(i){ return plugins[i] || null; }, null, 'item');
      pluginArr.namedItem = maskNative(function(n){ return pluginArr[n] || null; }, null, 'namedItem');
      pluginArr.refresh = maskNative(function(){}, null, 'refresh');
      mimeArr.item = maskNative(function(i){ return mimes[i] || null; }, null, 'item');
      mimeArr.namedItem = maskNative(function(n){ return mimeArr[n] || null; }, null, 'namedItem');
      defineGetter(navigator, 'plugins', function() { return pluginArr; });
      defineGetter(navigator, 'mimeTypes', function() { return mimeArr; });
    } catch (e) {}
  }

  // --- User-Agent Client Hints (navigator.userAgentData) ---
  if (navigator.userAgentData) {
    try {
      var brands = FP.uaBrands.map(function(b){ return { brand: b.brand, version: b.version }; });
      var getHEV = maskNative(function getHighEntropyValues(hints) {
        var result = { brands: brands, mobile: FP.uaMobile, platform: FP.uaPlatform };
        if (hints.indexOf('architecture') >= 0) result.architecture = FP.architecture;
        if (hints.indexOf('bitness') >= 0) result.bitness = FP.bitness;
        if (hints.indexOf('model') >= 0) result.model = FP.model;
        if (hints.indexOf('platformVersion') >= 0) result.platformVersion = FP.platformVersion;
        if (hints.indexOf('uaFullVersion') >= 0) result.uaFullVersion = FP.uaFullVersion;
        if (hints.indexOf('fullVersionList') >= 0) result.fullVersionList = FP.fullVersionList;
        return Promise.resolve(result);
      }, null, 'getHighEntropyValues');
      var uadObject = {
        brands: brands,
        mobile: FP.uaMobile,
        platform: FP.uaPlatform,
        getHighEntropyValues: getHEV,
        toJSON: maskNative(function toJSON() { return { brands: brands, mobile: FP.uaMobile, platform: FP.uaPlatform }; }, null, 'toJSON'),
      };
      defineGetter(navigator, 'userAgentData', function() { return uadObject; });
    } catch(e) {}
  }

  // --- Screen (outer) vs viewport (inner) ---
  defineGetter(screen, 'width', function(){ return FP.w; });
  defineGetter(screen, 'availWidth', function(){ return FP.w; });
  defineGetter(screen, 'height', function(){ return FP.h; });
  defineGetter(screen, 'availHeight', function(){ return FP.h - FP.taskbarOffset; });
  defineGetter(screen, 'availLeft', function(){ return 0; });
  defineGetter(screen, 'availTop', function(){ return 0; });
  defineGetter(window, 'innerWidth', function(){ return FP.innerW; });
  defineGetter(window, 'innerHeight', function(){ return FP.innerH; });
  defineGetter(window, 'outerWidth', function(){ return FP.innerW; });
  defineGetter(window, 'outerHeight', function(){ return FP.innerH + FP.taskbarOffset; });
  defineGetter(window, 'devicePixelRatio', function(){ return FP.dpr; });
  defineGetter(screen, 'colorDepth', function(){ return FP.colorDepth; });
  defineGetter(screen, 'pixelDepth', function(){ return FP.colorDepth; });

  // --- Timezone (patch resolvedOptions rather than replacing the constructor,
  //     which preserves function identity and avoids the classic detection) ---
  try {
    var OrigDTF = Intl.DateTimeFormat;
    redefineMethod(OrigDTF.prototype, 'resolvedOptions', function(orig) {
      return function resolvedOptions() {
        var o = orig.call(this);
        o.timeZone = FP.tz;
        return o;
      };
    });
    // Also cover Date's timezone-dependent output.
    redefineMethod(Date.prototype, 'getTimezoneOffset', function(orig) {
      return function getTimezoneOffset() {
        try {
          var dtf = new OrigDTF('en-US', { timeZone: FP.tz, timeZoneName: 'shortOffset' });
          var parts = dtf.formatToParts(this);
          for (var i = 0; i < parts.length; i++) {
            if (parts[i].type === 'timeZoneName') {
              var m = parts[i].value.match(/GMT([+-])(\\d{1,2})(?::(\\d{2}))?/);
              if (m) {
                var sign = m[1] === '+' ? -1 : 1;
                return sign * (parseInt(m[2], 10) * 60 + (m[3] ? parseInt(m[3], 10) : 0));
              }
            }
          }
        } catch (e) {}
        return orig.call(this);
      };
    });
  } catch (e) {}

  // --- Geolocation ---
  if (navigator.geolocation) {
    var pos = { coords: { latitude: FP.lat, longitude: FP.lon, accuracy: 50, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() };
    redefineMethod(navigator.geolocation, 'getCurrentPosition', function() {
      return function getCurrentPosition(ok){ if (typeof ok === 'function') ok(pos); };
    });
    redefineMethod(navigator.geolocation, 'watchPosition', function() {
      return function watchPosition(ok){ if (typeof ok === 'function') ok(pos); return 0; };
    });
  }

  // --- Canvas noise (DETERMINISTIC: identical reads => identical bytes) ---
  if (FP.canvasNoise) {
    var origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    // Apply position-seeded noise. The same pixel index always flips the same
    // way, so hashing the canvas twice yields the same hash (like real HW).
    function applyCanvasNoise(data) {
      for (var i = 0; i < data.length; i += 4) {
        var n = noiseAt(i);
        if (n > 0.5) {
          data[i] = data[i] ^ 1;
          data[i + 1] = data[i + 1] ^ (n > 0.75 ? 1 : 0);
        }
      }
    }
    function noiseCanvas(canvas) {
      try {
        var ctx = canvas.getContext('2d');
        if (!ctx) return;
        var img = origGetImageData.call(ctx, 0, 0, canvas.width, canvas.height);
        applyCanvasNoise(img.data);
        ctx.putImageData(img, 0, 0);
      } catch (e) {}
    }
    redefineMethod(HTMLCanvasElement.prototype, 'toDataURL', function(orig) {
      return function toDataURL() { noiseCanvas(this); return orig.apply(this, arguments); };
    });
    redefineMethod(HTMLCanvasElement.prototype, 'toBlob', function(orig) {
      return function toBlob() { noiseCanvas(this); return orig.apply(this, arguments); };
    });
    redefineMethod(CanvasRenderingContext2D.prototype, 'getImageData', function(orig) {
      return function getImageData() {
        var img = orig.apply(this, arguments);
        applyCanvasNoise(img.data);
        return img;
      };
    });
  }

  // --- WebGL spoof (meta = vendor/renderer, image = readPixels noise) ---
  function hookWebGL(proto) {
    redefineMethod(proto, 'getParameter', function(orig) {
      return function getParameter(p) {
        if (FP.webGlMetaSpoof) {
          if (p === 37445) return FP.webglVendor;   // UNMASKED_VENDOR_WEBGL
          if (p === 37446) return FP.webglRenderer;  // UNMASKED_RENDERER_WEBGL
          if (p === 7936) return 'WebKit';           // VENDOR
          if (p === 7937) return 'WebKit WebGL';     // RENDERER
        }
        return orig.call(this, p);
      };
    });
    redefineMethod(proto, 'getExtension', function(orig) {
      return function getExtension(name) {
        if (FP.webGlMetaSpoof && name === 'WEBGL_debug_renderer_info') {
          return { UNMASKED_VENDOR_WEBGL: 37445, UNMASKED_RENDERER_WEBGL: 37446 };
        }
        return orig.call(this, name);
      };
    });
    if (FP.webGlImageNoise) {
      redefineMethod(proto, 'readPixels', function(orig) {
        return function readPixels(x, y, w, h, fmt, type, pixels) {
          orig.call(this, x, y, w, h, fmt, type, pixels);
          if (pixels && pixels.length) {
            for (var i = 0; i < pixels.length; i += 4) {
              if (noiseAt(i) > 0.5) pixels[i] = pixels[i] ^ 1;
            }
          }
        };
      });
    }
  }
  try {
    hookWebGL(WebGLRenderingContext.prototype);
    if (typeof WebGL2RenderingContext !== 'undefined') hookWebGL(WebGL2RenderingContext.prototype);
  } catch(e) {}

  // --- WebGPU spoof ---
  if (FP.spoofWebGPU && navigator.gpu) {
    var origRequestAdapter = navigator.gpu.requestAdapter.bind(navigator.gpu);
    navigator.gpu.requestAdapter = function(opts) {
      return origRequestAdapter(opts).then(function(adapter) {
        if (!adapter) return adapter;
        var origReqDev = adapter.requestDevice.bind(adapter);
        adapter.requestDevice = function() {
          return origReqDev.apply(adapter, arguments).then(function(device) {
            return device;
          });
        };
        adapter.info = { vendor: FP.webgpuVendor, architecture: FP.webgpuArchitecture, device: '', description: '' };
        return adapter;
      });
    };
  }

  // --- AudioContext noise (DETERMINISTIC per index) ---
  if (FP.audioNoise) {
    var OrigAudioContext = window.AudioContext || window.webkitAudioContext;
    if (OrigAudioContext) {
      redefineMethod(OrigAudioContext.prototype, 'createAnalyser', function(orig) {
        return function createAnalyser() {
          var analyser = orig.call(this);
          redefineMethod(analyser, 'getFloatFrequencyData', function(o) {
            return function getFloatFrequencyData(arr) {
              o.call(analyser, arr);
              for (var i = 0; i < arr.length; i++) arr[i] += (noiseAt(i) - 0.5) * 0.0001;
            };
          });
          return analyser;
        };
      });
    }
    if (window.OfflineAudioContext || window.webkitOfflineAudioContext) {
      var OrigOffline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      redefineMethod(OrigOffline.prototype, 'startRendering', function(orig) {
        return function startRendering() {
          return orig.call(this).then(function(buffer) {
            try {
              for (var ch = 0; ch < buffer.numberOfChannels; ch++) {
                var data = buffer.getChannelData(ch);
                for (var i = 0; i < data.length; i += 100) {
                  data[i] += (noiseAt(i + ch * 7919) - 0.5) * 0.0000001;
                }
              }
            } catch(e) {}
            return buffer;
          });
        };
      });
    }
  }
  if (FP.clientRectsNoise) {
    // Deterministic offset derived from the rect geometry, so repeated reads of
    // the same element return identical values (real layout is stable).
    function rectNoise(r) {
      var key = Math.round((r.x + r.y + r.width + r.height) * 1000) | 0;
      return (noiseAt(key >>> 0) - 0.5) * 0.00001;
    }
    redefineMethod(Element.prototype, 'getBoundingClientRect', function(orig) {
      return function getBoundingClientRect() {
        var r = orig.call(this);
        var n = rectNoise(r);
        return { x: r.x+n, y: r.y+n, width: r.width, height: r.height, top: r.top+n, right: r.right+n, bottom: r.bottom+n, left: r.left+n, toJSON: function(){ return this; } };
      };
    });
    redefineMethod(Element.prototype, 'getClientRects', function(orig) {
      return function getClientRects() {
        var rects = orig.call(this);
        var arr = [];
        for (var i = 0; i < rects.length; i++) {
          var r = rects[i];
          var n = rectNoise(r);
          arr.push({ x: r.x+n, y: r.y+n, width: r.width, height: r.height, top: r.top+n, right: r.right+n, bottom: r.bottom+n, left: r.left+n });
        }
        arr.item = maskNative(function(i){ return arr[i]; }, null, 'item');
        return arr;
      };
    });
  }

  // --- Font enumeration spoof + measureText noise (deterministic per text) ---
  if (FP.fontSpoof) {
    var allowedFonts = FP.fonts;
    if (document.fonts && document.fonts.check) {
      redefineMethod(document.fonts, 'check', function(orig) {
        return function check(font, text) {
          var family = (font.match(/['"]?([^'"]+)['"]?/) || [])[1] || font;
          if (allowedFonts.indexOf(family) === -1) return false;
          return orig.call(document.fonts, font, text);
        };
      });
    }
    function textSeed(text) {
      var h = 0;
      var s = String(text || '');
      for (var i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
      return h >>> 0;
    }
    redefineMethod(CanvasRenderingContext2D.prototype, 'measureText', function(orig) {
      return function measureText(text) {
        var m = orig.call(this, text);
        var n = (noiseAt(textSeed(text)) - 0.5) * 0.002;
        return { width: m.width + n, actualBoundingBoxAscent: m.actualBoundingBoxAscent, actualBoundingBoxDescent: m.actualBoundingBoxDescent, actualBoundingBoxLeft: m.actualBoundingBoxLeft, actualBoundingBoxRight: m.actualBoundingBoxRight, fontBoundingBoxAscent: m.fontBoundingBoxAscent, fontBoundingBoxDescent: m.fontBoundingBoxDescent, emHeightAscent: m.emHeightAscent, emHeightDescent: m.emHeightDescent, hangingBaseline: m.hangingBaseline, alphabeticBaseline: m.alphabeticBaseline, ideographicBaseline: m.ideographicBaseline };
      };
    });
  }

  // --- MediaDevices spoof (per-profile seeded IDs) ---
  if (FP.spoofMediaDevices && navigator.mediaDevices) {
    redefineMethod(navigator.mediaDevices, 'enumerateDevices', function() {
      return function enumerateDevices() {
        return Promise.resolve(FP.mediaDevicesList.map(function(d){ return Object.assign({}, d); }));
      };
    });
  }

  // --- SpeechVoices spoof (OS-appropriate, per profile) ---
  if (FP.spoofSpeechVoices && window.speechSynthesis) {
    redefineMethod(speechSynthesis, 'getVoices', function() {
      return function getVoices() { return FP.speechVoicesList.slice(); };
    });
  }

  // --- WebRTC: block | proxy-relay | allow ---
  // The public (srflx) candidate IP is what leaks the real WAN address. In relay
  // mode we rewrite it to the proxy exit IP; local candidates are dropped.
  var privateIpRe = /(^|[^\\d])(10\\.|127\\.|169\\.254\\.|192\\.168\\.|172\\.(1[6-9]|2\\d|3[01])\\.)/;
  function rewriteCandidate(str) {
    if (!str) return str;
    if (FP.proxyIp) {
      // Replace any IPv4 in the srflx/relay candidate with the proxy exit IP.
      str = str.replace(/((?:srflx|relay)[\\s\\S]*?)(\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3})/g, '$1' + FP.proxyIp);
    }
    return str;
  }
  if (FP.blockWebRTC && window.RTCPeerConnection) {
    // Keep the API present (absence itself is a signal) but neutralise ICE so
    // no host/srflx candidates ever escape.
    var OrigBlockRTC = window.RTCPeerConnection;
    var BlockedRTC = function RTCPeerConnection(config, constraints) {
      if (config) config.iceServers = [];
      var pc = new OrigBlockRTC(config, constraints);
      redefineMethod(pc, 'createDataChannel', function(orig) { return function createDataChannel(){ return orig.apply(pc, arguments); }; });
      redefineMethod(pc, 'addIceCandidate', function() { return function addIceCandidate(){ return Promise.resolve(); }; });
      Object.defineProperty(pc, 'onicecandidate', { get: function(){ return null; }, set: function(){}, configurable: true });
      return pc;
    };
    BlockedRTC.prototype = OrigBlockRTC.prototype;
    maskNative(BlockedRTC, OrigBlockRTC, 'RTCPeerConnection');
    window.RTCPeerConnection = BlockedRTC;
    window.webkitRTCPeerConnection = BlockedRTC;
  } else if (FP.webrtcRelay && window.RTCPeerConnection) {
    var OrigRTC = window.RTCPeerConnection;
    var RelayRTC = function RTCPeerConnection(config, constraints) {
      var pc = new OrigRTC(config, constraints);
      redefineMethod(pc, 'addIceCandidate', function(orig) {
        return function addIceCandidate(candidate) {
          if (candidate && candidate.candidate && privateIpRe.test(candidate.candidate)) {
            return Promise.resolve();
          }
          return orig.call(pc, candidate);
        };
      });
      // Rewrite outgoing SDP so the advertised public IP is the proxy IP.
      redefineMethod(pc, 'setLocalDescription', function(orig) {
        return function setLocalDescription(desc) {
          if (desc && desc.sdp) desc.sdp = rewriteCandidate(desc.sdp);
          return orig.call(pc, desc);
        };
      });
      return pc;
    };
    RelayRTC.prototype = OrigRTC.prototype;
    maskNative(RelayRTC, OrigRTC, 'RTCPeerConnection');
    window.RTCPeerConnection = RelayRTC;
    window.webkitRTCPeerConnection = RelayRTC;
  }

  // --- connection / battery / orientation (seeded per profile) ---
  try {
    defineGetter(navigator, 'connection', function() {
      return {
        effectiveType: FP.connection.effectiveType,
        downlink: FP.connection.downlink,
        rtt: FP.connection.rtt,
        saveData: false,
        type: FP.connection.type,
        onchange: null,
      };
    });
  } catch(e) {}
  if (navigator.getBattery) {
    redefineMethod(navigator, 'getBattery', function() {
      return function getBattery() {
        return Promise.resolve({
          charging: FP.battery.charging,
          // JSON.stringify converts Infinity -> null; restore it here.
          chargingTime: FP.battery.chargingTime == null ? Infinity : FP.battery.chargingTime,
          dischargingTime: FP.battery.dischargingTime == null ? Infinity : FP.battery.dischargingTime,
          level: FP.battery.level,
          addEventListener: function(){}, removeEventListener: function(){},
        });
      };
    });
  }
  if (FP.isMobile) {
    try {
      defineGetter(screen, 'orientation', function() { return { type: 'portrait-primary', angle: 0 }; });
    } catch(e) {}
  }

  // --- Font enumeration block (offsetWidth / offsetHeight probe) ---
  // Real browsers never return 0 for a rendered element; returning 0 for a
  // disallowed font is itself detectable. Instead we clamp disallowed fonts to
  // the metrics of a guaranteed-present fallback so probes see plausible values.
  if (FP.fontSpoof) {
    var allowedFonts = FP.fonts;
    ['offsetWidth', 'offsetHeight'].forEach(function(prop) {
      var desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop);
      if (desc && desc.get) {
        redefineMethod(desc, 'get', function(origGet) {
          return function() {
            var self = this;
            var style = self.style && self.style.fontFamily;
            if (style) {
              var fam = (style.match(/['"]?([^'"]+)['"]?/) || [])[1] || style;
              if (allowedFonts.indexOf(fam) === -1) {
                // Temporarily fall back to a base font for the measurement.
                var prev = self.style.fontFamily;
                try {
                  self.style.fontFamily = 'sans-serif';
                  var val = origGet.call(self);
                  self.style.fontFamily = prev;
                  return val;
                } catch (e) { self.style.fontFamily = prev; }
              }
            }
            return origGet.call(self);
          };
        });
        Object.defineProperty(HTMLElement.prototype, prop, desc);
      }
    });
  }

  // --- Port scan protection (block localhost probing) ---
  if (FP.portScanProtect) {
    var blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'];
    if (window.fetch) {
      redefineMethod(window, 'fetch', function(orig) {
        return function fetch(input, init) {
          try {
            var url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
            var host = new URL(url, window.location.href).hostname;
            if (blockedHosts.indexOf(host) >= 0 && url.indexOf(window.location.hostname) < 0) {
              return Promise.reject(new TypeError('Failed to fetch'));
            }
          } catch(e) {}
          return orig.apply(this, arguments);
        };
      });
    }
    if (window.XMLHttpRequest) {
      redefineMethod(XMLHttpRequest.prototype, 'open', function(orig) {
        return function open(method, url) {
          try {
            var host = new URL(url, window.location.href).hostname;
            if (blockedHosts.indexOf(host) >= 0) throw new DOMException('Blocked', 'SecurityError');
          } catch(e) { if (e && e.name === 'SecurityError') throw e; }
          return orig.apply(this, arguments);
        };
      });
    }
  }

  // --- Automation evasion ---
  delete window.__playwright;
  delete window.__pw_manual;
  delete window.__PW_inspect;
  delete navigator.__proto__.webdriver;
  // window.chrome exists in real Chrome; loadTimes/csi are always present.
  // NOTE: chrome.runtime is intentionally NOT injected — stock Chrome does not
  // expose it without an extension context, and forging it is a detection vector.
  if (!window.chrome) {
    try { Object.defineProperty(window, 'chrome', { value: {}, writable: true, enumerable: true, configurable: true }); } catch (e) { window.chrome = {}; }
  }
  if (!window.chrome.loadTimes) window.chrome.loadTimes = maskNative(function loadTimes(){ return {}; }, null, 'loadTimes');
  if (!window.chrome.csi) window.chrome.csi = maskNative(function csi(){ return {}; }, null, 'csi');

  // Permissions query patch (masked)
  if (navigator.permissions && navigator.permissions.query) {
    redefineMethod(navigator.permissions, 'query', function(orig) {
      return function query(desc) {
        if (desc && desc.name === 'notifications') return Promise.resolve({ state: Notification.permission, onchange: null });
        return orig.call(navigator.permissions, desc);
      };
    });
  }

})();
`;
}

export function buildLaunchArgs(profile: BrowserProfile, fingerprintId?: string): string[] {
  const fp = profile.fingerprint;
  const isMobile = fp.formFactor === 'mobile';
  const args = [
    '--disable-blink-features=AutomationControlled',
    '--disable-infobars',
    `--window-size=${fp.windowWidth},${fp.windowHeight}`,
    `--lang=${fp.screenLang}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-dev-shm-usage',
    '--exclude-switches=enable-automation',
    '--disable-component-update',
  ];

  args.push(...buildTlsLaunchArgs(
    fp.tlsProfileId,
    fingerprintId ?? profile.fingerprintId ?? 'default',
    fp.device,
    fp.browserVersion,
  ));

  if (fp.webRTC === '2') {
    args.push('--force-webrtc-ip-handling-policy=disable_non_proxied_udp');
  } else if (fp.webRTC === '3') {
    args.push('--webrtc-ip-handling-policy=disable_non_proxied_udp');
  }

  if (profile.headless) {
    args.push('--headless=new');
  }

  if (fp.hardwareAccelerate === '1') {
    args.push('--enable-gpu-rasterization');
  }

  if (fp.portScanProtection !== '2') {
    args.push('--disable-background-networking');
  }

  if (isMobile) {
    args.push('--enable-touch-events');
  }

  if (profile.proxy.host && profile.proxy.port) {
    const scheme = profile.proxy.type?.toLowerCase().includes('socks') ? 'socks5' : 'http';
    args.push(`--proxy-server=${scheme}://${profile.proxy.host}:${profile.proxy.port}`);
  }

  return args;
}

/**
 * Build the low-entropy + high-entropy Client Hint request headers.
 *
 * CRITICAL: `seed` MUST be the same value passed to buildInjectionPayload /
 * buildFingerprintScript (i.e. the profile's fingerprintId). Otherwise the
 * server-visible headers (platformVersion, arch, bitness, full version list)
 * won't match what navigator.userAgentData.getHighEntropyValues() returns in
 * JS — a textbook automation flag.
 */
export function buildExtraHeaders(fp: FingerprintConfig, seed = 'default'): Record<string, string> {
  const major = fp.browserVersion.split('.')[0] ?? '131';
  const isMobile = fp.formFactor === 'mobile';
  const platformHeader = fp.device === 'iOS' ? '"iOS"'
    : fp.device === 'Android' ? '"Android"'
    : fp.device === 'MacOS' ? '"macOS"'
    : fp.device === 'Linux' ? '"Linux"'
    : '"Windows"';

  const brandHeader = fp.device === 'iOS'
    ? `"Safari";v="${major}", "Not_A Brand";v="99"`
    : `"Google Chrome";v="${major}", "Chromium";v="${major}", "Not_A Brand";v="24"`;

  const identity = buildDeviceIdentity(fp, seed);
  const fullList = identity.fullVersionList
    .map((b) => `"${b.brand}";v="${b.version}"`)
    .join(', ');

  return {
    'Accept-Language': buildAcceptLanguage(fp),
    'Sec-CH-UA': brandHeader,
    'Sec-CH-UA-Mobile': isMobile ? '?1' : '?0',
    'Sec-CH-UA-Platform': platformHeader,
    'Sec-CH-UA-Full-Version-List': fullList,
    'Sec-CH-UA-Platform-Version': `"${identity.platformVersion}"`,
    'Sec-CH-UA-Arch': `"${identity.architecture}"`,
    'Sec-CH-UA-Bitness': `"${identity.bitness}"`,
    'Sec-CH-UA-Model': `"${identity.model}"`,
  };
}
