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
}

export function buildInjectionPayload(fp: FingerprintConfig, seed: string): InjectionPayload {
  const platform = resolvePlatform(fp);
  const screenW = fp.screenWidth ?? fp.windowWidth;
  const screenH = fp.screenHeight ?? fp.windowHeight;
  const isMobile = fp.formFactor === 'mobile';
  const identity = buildDeviceIdentity(fp, seed);
  const langs = buildLanguageList(fp);

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
  var rng = mulberry32(FP.seed.split('').reduce(function(h,c){return ((h<<5)-h+c.charCodeAt(0))|0;},0));

  // --- Navigator ---
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
    appVersion: { get: function() { return FP.ua.replace('Mozilla/', ''); } },
    plugins: { get: function() {
      var p = [{name:'PDF Viewer',filename:'internal-pdf-viewer',description:'Portable Document Format'}];
      p.item = function(i){return p[i];};
      p.namedItem = function(n){return p.find(function(x){return x.name===n;});};
      p.refresh = function(){};
      return p;
    }},
  };
  Object.keys(navProps).forEach(function(key) {
    try { Object.defineProperty(navigator, key, navProps[key]); } catch(e) {}
  });

  // --- User-Agent Client Hints (navigator.userAgentData) ---
  if (navigator.userAgentData) {
    try {
      var brands = FP.uaBrands.map(function(b){ return { brand: b.brand, version: b.version }; });
      Object.defineProperty(navigator, 'userAgentData', {
        get: function() {
          return {
            brands: brands,
            mobile: FP.uaMobile,
            platform: FP.uaPlatform,
            getHighEntropyValues: function(hints) {
              var result = { brands: brands, mobile: FP.uaMobile, platform: FP.uaPlatform };
              if (hints.indexOf('architecture') >= 0) result.architecture = FP.architecture;
              if (hints.indexOf('bitness') >= 0) result.bitness = FP.bitness;
              if (hints.indexOf('model') >= 0) result.model = FP.model;
              if (hints.indexOf('platformVersion') >= 0) result.platformVersion = FP.platformVersion;
              if (hints.indexOf('uaFullVersion') >= 0) result.uaFullVersion = FP.uaFullVersion;
              if (hints.indexOf('fullVersionList') >= 0) result.fullVersionList = FP.fullVersionList;
              return Promise.resolve(result);
            },
            toJSON: function() { return { brands: brands, mobile: FP.uaMobile, platform: FP.uaPlatform }; },
          };
        },
      });
    } catch(e) {}
  }

  // --- Screen (outer) vs viewport (inner) ---
  ['width','availWidth'].forEach(function(k){ try{Object.defineProperty(screen,k,{get:function(){return FP.w;}});}catch(e){} });
  ['height','availHeight'].forEach(function(k){ try{Object.defineProperty(screen,k,{get:function(){return FP.h-(k==='availHeight'?40:0);}});}catch(e){} });
  try { Object.defineProperty(window,'innerWidth',{get:function(){return FP.innerW;}}); } catch(e) {}
  try { Object.defineProperty(window,'innerHeight',{get:function(){return FP.innerH;}}); } catch(e) {}
  try { Object.defineProperty(window,'outerWidth',{get:function(){return FP.innerW;}}); } catch(e) {}
  try { Object.defineProperty(window,'outerHeight',{get:function(){return FP.innerH+80;}}); } catch(e) {}
  try { Object.defineProperty(window,'devicePixelRatio',{get:function(){return FP.dpr;}}); } catch(e) {}
  try { Object.defineProperty(screen,'colorDepth',{get:function(){return 24;}}); } catch(e) {}
  try { Object.defineProperty(screen,'pixelDepth',{get:function(){return 24;}}); } catch(e) {}

  // --- Timezone ---
  var OrigDTF = Intl.DateTimeFormat;
  Intl.DateTimeFormat = function(locales, options) {
    options = options || {};
    if (!options.timeZone) options.timeZone = FP.tz;
    return new OrigDTF(locales, options);
  };
  Intl.DateTimeFormat.prototype = OrigDTF.prototype;
  Intl.DateTimeFormat.supportedLocalesOf = OrigDTF.supportedLocalesOf;
  var origResolved = OrigDTF.prototype.resolvedOptions;
  OrigDTF.prototype.resolvedOptions = function() {
    var o = origResolved.call(this);
    o.timeZone = FP.tz;
    return o;
  };

  // --- Geolocation ---
  if (navigator.geolocation) {
    var pos = { coords: { latitude: FP.lat, longitude: FP.lon, accuracy: 50, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() };
    navigator.geolocation.getCurrentPosition = function(ok){ ok(pos); };
    navigator.geolocation.watchPosition = function(ok){ ok(pos); return 0; };
  }

  // --- Canvas noise (seeded) ---
  if (FP.canvasNoise) {
    var origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    var origToBlob = HTMLCanvasElement.prototype.toBlob;
    var origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    function noiseCanvas(canvas) {
      var ctx = canvas.getContext('2d');
      if (!ctx) return;
      var img = origGetImageData.call(ctx, 0, 0, canvas.width, canvas.height);
      for (var i = 0; i < img.data.length; i += 4) {
        if (rng() > 0.5) img.data[i] ^= 1;
      }
      ctx.putImageData(img, 0, 0);
    }
    HTMLCanvasElement.prototype.toDataURL = function() { noiseCanvas(this); return origToDataURL.apply(this, arguments); };
    HTMLCanvasElement.prototype.toBlob = function() { noiseCanvas(this); return origToBlob.apply(this, arguments); };
    CanvasRenderingContext2D.prototype.getImageData = function() {
      var img = origGetImageData.apply(this, arguments);
      for (var i = 0; i < img.data.length; i += 4) {
        if (rng() > 0.5) img.data[i] ^= 1;
      }
      return img;
    };
  }

  // --- WebGL spoof (meta = vendor/renderer, image = readPixels noise) ---
  function hookWebGL(proto) {
    var origGetParam = proto.getParameter;
    var origGetExt = proto.getExtension;
    var origReadPixels = proto.readPixels;
    proto.getParameter = function(p) {
      if (FP.webGlMetaSpoof) {
        if (p === 37445) return FP.webglVendor;
        if (p === 37446) return FP.webglRenderer;
      }
      return origGetParam.call(this, p);
    };
    proto.getExtension = function(name) {
      if (FP.webGlMetaSpoof && name === 'WEBGL_debug_renderer_info') {
        return { UNMASKED_VENDOR_WEBGL: 37445, UNMASKED_RENDERER_WEBGL: 37446 };
      }
      return origGetExt.call(this, name);
    };
    if (FP.webGlImageNoise) {
      proto.readPixels = function(x, y, w, h, fmt, type, pixels) {
        origReadPixels.call(this, x, y, w, h, fmt, type, pixels);
        if (pixels && pixels.length) {
          for (var i = 0; i < pixels.length; i += 4) {
            if (rng() > 0.5) pixels[i] ^= 1;
          }
        }
      };
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

  // --- AudioContext noise (seeded) ---
  if (FP.audioNoise) {
    var OrigAudioContext = window.AudioContext || window.webkitAudioContext;
    if (OrigAudioContext) {
      var origCreateAnalyser = OrigAudioContext.prototype.createAnalyser;
      OrigAudioContext.prototype.createAnalyser = function() {
        var analyser = origCreateAnalyser.call(this);
        var origGetFloat = analyser.getFloatFrequencyData.bind(analyser);
        analyser.getFloatFrequencyData = function(arr) {
          origGetFloat(arr);
          for (var i = 0; i < arr.length; i++) arr[i] += (rng() - 0.5) * 0.0001;
        };
        return analyser;
      };
      var origCreateOsc = OrigAudioContext.prototype.createOscillator;
      OrigAudioContext.prototype.createOscillator = function() {
        var osc = origCreateOsc.call(this);
        var origConnect = osc.connect.bind(osc);
        osc.connect = function(dest) {
          if (dest && dest.getFloatFrequencyData) {
            var origGet = dest.getFloatFrequencyData.bind(dest);
            dest.getFloatFrequencyData = function(arr) {
              origGet(arr);
              for (var i = 0; i < arr.length; i++) arr[i] += (rng() - 0.5) * 0.0001;
            };
          }
          return origConnect(dest);
        };
        return osc;
      };
    }
    if (window.OfflineAudioContext || window.webkitOfflineAudioContext) {
      var OrigOffline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      var origStartRendering = OrigOffline.prototype.startRendering;
      OrigOffline.prototype.startRendering = function() {
        return origStartRendering.call(this).then(function(buffer) {
          try {
            for (var ch = 0; ch < buffer.numberOfChannels; ch++) {
              var data = buffer.getChannelData(ch);
              for (var i = 0; i < data.length; i += 100) {
                data[i] += (rng() - 0.5) * 0.0000001;
              }
            }
          } catch(e) {}
          return buffer;
        });
      };
    }
  }
  if (FP.clientRectsNoise) {
    var origGCR = Element.prototype.getClientRects;
    var origGCBR = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function() {
      var r = origGCBR.call(this);
      var n = (rng() - 0.5) * 0.00001;
      return { x: r.x+n, y: r.y+n, width: r.width, height: r.height, top: r.top+n, right: r.right+n, bottom: r.bottom+n, left: r.left+n, toJSON: function(){ return this; } };
    };
    Element.prototype.getClientRects = function() {
      var rects = origGCR.call(this);
      var n = (rng() - 0.5) * 0.00001;
      var arr = [];
      for (var i = 0; i < rects.length; i++) {
        var r = rects[i];
        arr.push({ x: r.x+n, y: r.y+n, width: r.width, height: r.height, top: r.top+n, right: r.right+n, bottom: r.bottom+n, left: r.left+n });
      }
      arr.item = function(i){ return arr[i]; };
      return arr;
    };
  }

  // --- Font enumeration spoof + measureText noise ---
  if (FP.fontSpoof) {
    var allowedFonts = FP.fonts;
    if (document.fonts && document.fonts.check) {
      var origCheck = document.fonts.check.bind(document.fonts);
      document.fonts.check = function(font, text) {
        var family = (font.match(/['"]?([^'"]+)['"]?/) || [])[1] || font;
        if (allowedFonts.indexOf(family) === -1) return false;
        return origCheck(font, text);
      };
    }
    var origMeasureText = CanvasRenderingContext2D.prototype.measureText;
    CanvasRenderingContext2D.prototype.measureText = function(text) {
      var m = origMeasureText.call(this, text);
      var n = (rng() - 0.5) * 0.002;
      return { width: m.width + n, actualBoundingBoxAscent: m.actualBoundingBoxAscent, actualBoundingBoxDescent: m.actualBoundingBoxDescent, actualBoundingBoxLeft: m.actualBoundingBoxLeft, actualBoundingBoxRight: m.actualBoundingBoxRight, fontBoundingBoxAscent: m.fontBoundingBoxAscent, fontBoundingBoxDescent: m.fontBoundingBoxDescent, emHeightAscent: m.emHeightAscent, emHeightDescent: m.emHeightDescent, hangingBaseline: m.hangingBaseline, alphabeticBaseline: m.alphabeticBaseline, ideographicBaseline: m.ideographicBaseline };
    };
  }

  // --- MediaDevices spoof (per-profile seeded IDs) ---
  if (FP.spoofMediaDevices && navigator.mediaDevices) {
    navigator.mediaDevices.enumerateDevices = function() {
      return Promise.resolve(FP.mediaDevicesList.map(function(d){ return Object.assign({}, d); }));
    };
  }

  // --- SpeechVoices spoof (OS-appropriate, per profile) ---
  if (FP.spoofSpeechVoices && window.speechSynthesis) {
    speechSynthesis.getVoices = function() { return FP.speechVoicesList.slice(); };
  }

  // --- WebRTC: block | proxy-relay | allow ---
  if (FP.blockWebRTC) {
    window.RTCPeerConnection = undefined;
    window.webkitRTCPeerConnection = undefined;
    window.RTCDataChannel = undefined;
    window.RTCSessionDescription = undefined;
    window.RTCIceCandidate = undefined;
  } else if (FP.webrtcRelay && window.RTCPeerConnection) {
    var OrigRTC = window.RTCPeerConnection;
    window.RTCPeerConnection = function(config, constraints) {
      if (config && config.iceServers) config.iceServers = [];
      var pc = new OrigRTC(config, constraints);
      var origAddIce = pc.addIceCandidate.bind(pc);
      pc.addIceCandidate = function(candidate) {
        if (candidate && candidate.candidate && /192\\.168|10\\.|172\\.(1[6-9]|2|3[01])|127\\./.test(candidate.candidate)) {
          return Promise.resolve();
        }
        return origAddIce(candidate);
      };
      return pc;
    };
    window.RTCPeerConnection.prototype = OrigRTC.prototype;
  }

  // --- Device identity (MAC / hostname) for fingerprint checks ---
  try {
    Object.defineProperty(navigator, '__deviceMeta', {
      get: function() { return { mac: FP.macValue, deviceName: FP.deviceNameValue, proxyIp: FP.proxyIp }; },
    });
  } catch(e) {}

  // --- Mobile APIs: connection, battery, orientation ---
  if (FP.isMobile) {
    try {
      Object.defineProperty(navigator, 'connection', {
        get: function() { return { effectiveType: '4g', downlink: 10, rtt: 50, saveData: false }; },
      });
    } catch(e) {}
    if (navigator.getBattery) {
      navigator.getBattery = function() {
        return Promise.resolve({ charging: true, chargingTime: 0, dischargingTime: Infinity, level: 0.87 });
      };
    }
    try {
      Object.defineProperty(screen, 'orientation', {
        get: function() { return { type: 'portrait-primary', angle: 0 }; },
      });
    } catch(e) {}
  }

  // --- Font enumeration block (offsetWidth probe) ---
  if (FP.fontSpoof) {
    var allowedFonts = FP.fonts;
    var origOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
    if (origOffsetWidth && origOffsetWidth.get) {
      var origGet = origOffsetWidth.get;
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
        get: function() {
          var style = this.style && this.style.fontFamily;
          if (style) {
            var fam = (style.match(/['"]?([^'"]+)['"]?/) || [])[1] || style;
            if (allowedFonts.indexOf(fam) === -1) return 0;
          }
          return origGet.call(this);
        },
      });
    }
  }

  // --- Port scan protection (block localhost probing) ---
  if (FP.portScanProtect) {
    var blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'];
    var origFetch = window.fetch;
    if (origFetch) {
      window.fetch = function(input, init) {
        try {
          var url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
          var host = new URL(url, window.location.href).hostname;
          if (blockedHosts.indexOf(host) >= 0 && url.indexOf(window.location.hostname) < 0) {
            return Promise.reject(new TypeError('Failed to fetch'));
          }
        } catch(e) {}
        return origFetch.apply(this, arguments);
      };
    }
    var OrigXHR = window.XMLHttpRequest;
    if (OrigXHR) {
      window.XMLHttpRequest = function() {
        var xhr = new OrigXHR();
        var origOpen = xhr.open;
        xhr.open = function(method, url) {
          try {
            var host = new URL(url, window.location.href).hostname;
            if (blockedHosts.indexOf(host) >= 0) throw new Error('Blocked');
          } catch(e) { if (e.message === 'Blocked') throw e; }
          return origOpen.apply(xhr, arguments);
        };
        return xhr;
      };
    }
  }

  // --- Chrome runtime + automation evasion ---
  if (!window.chrome) window.chrome = {};
  delete window.__playwright;
  delete window.__pw_manual;
  delete window.__PW_inspect;
  Object.defineProperty(navigator, 'webdriver', { get: function() { return false; } });
  if (!window.chrome.runtime) {
    window.chrome.runtime = {
      connect: function(){ return { onMessage: { addListener: function(){} }, postMessage: function(){} }; },
      sendMessage: function(){},
      id: undefined,
    };
  }
  if (!window.chrome.loadTimes) window.chrome.loadTimes = function(){ return {}; };
  if (!window.chrome.csi) window.chrome.csi = function(){ return {}; };

  // Permissions query patch
  if (navigator.permissions && navigator.permissions.query) {
    var origQuery = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = function(desc) {
      if (desc.name === 'notifications') return Promise.resolve({ state: 'prompt', onchange: null });
      return origQuery(desc);
    };
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

export function buildExtraHeaders(fp: FingerprintConfig): Record<string, string> {
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

  const identity = buildDeviceIdentity(fp, 'headers');
  const fullList = identity.fullVersionList
    .map((b) => `"${b.brand}";v="${b.version.split('.')[0]}"`)
    .join(', ');

  return {
    'Accept-Language': buildAcceptLanguage(fp),
    'Sec-CH-UA': brandHeader,
    'Sec-CH-UA-Mobile': isMobile ? '?1' : '?0',
    'Sec-CH-UA-Platform': platformHeader,
    'Sec-CH-UA-Full-Version-List': fullList,
    'Sec-CH-UA-Platform-Version': `"${identity.platformVersion}"`,
    'Sec-CH-UA-Arch': `"${identity.architecture}"`,
    'Sec-CH-UA-Bitness': '"64"',
  };
}
