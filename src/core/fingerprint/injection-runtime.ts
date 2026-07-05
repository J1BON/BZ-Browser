/** Generates the in-page antidetect runtime (injected via addInitScript). */

import { buildWorkerBridgeScript } from './injection-worker.js';
import { buildScopeHooksBody } from './injection-shared.js';

export interface RuntimeOptions {
  /** Patched Chromium handles canvas/TLS/UA natively — skip heavy JS hooks */
  useNativeKernel: boolean;
}

export function buildInjectionRuntimeScript(fpJson: string, options: RuntimeOptions): string {
  const nativeSkip = options.useNativeKernel ? 'true' : 'false';
  const scopeHooks = buildScopeHooksBody();
  const workerInject = options.useNativeKernel ? '' : buildWorkerInjectionFromScope(fpJson, scopeHooks);
  const workerBridge = workerInject ? buildWorkerBridgeScript(workerInject) : '';

  return `
(function() {
  'use strict';
  var FP = ${fpJson};
  var USE_NATIVE = ${nativeSkip};

  delete window.__playwright;
  delete window.__pw_manual;
  delete window.__PW_inspect;

  if (USE_NATIVE) {
    ${workerBridge}
    return;
  }

  ${scopeHooks}

  if (navigator.userAgentData) {
    try {
      var brands = FP.uaBrands.map(function(b) { return { brand: b.brand, version: b.version }; });
      var uadObj = {
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
      defineProtoGetter(Navigator.prototype, 'userAgentData', function() { return uadObj; });
    } catch(e) {}
  }

  var availOff = FP.availHeightOffset || 40;
  defineProtoGetter(Screen.prototype, 'width', function() { return FP.w; });
  defineProtoGetter(Screen.prototype, 'availWidth', function() { return FP.w; });
  defineProtoGetter(Screen.prototype, 'height', function() { return FP.h; });
  defineProtoGetter(Screen.prototype, 'availHeight', function() { return FP.h - availOff; });
  defineProtoGetter(Screen.prototype, 'colorDepth', function() { return FP.colorDepth; });
  defineProtoGetter(Screen.prototype, 'pixelDepth', function() { return FP.colorDepth; });
  defineProtoGetter(window, 'innerWidth', function() { return FP.innerW; });
  defineProtoGetter(window, 'innerHeight', function() { return FP.innerH; });
  defineProtoGetter(window, 'devicePixelRatio', function() { return FP.dpr; });

  if (navigator.geolocation) {
    var pos = { coords: { latitude: FP.lat, longitude: FP.lon, accuracy: 50, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() };
    navigator.geolocation.getCurrentPosition = function(ok) { ok(pos); };
    navigator.geolocation.watchPosition = function(ok) { ok(pos); return 0; };
  }

  if (FP.canvasNoise) {
    var origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    var origToBlob = HTMLCanvasElement.prototype.toBlob;
    var origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    HTMLCanvasElement.prototype.toDataURL = function() {
      var self = this;
      var ctx = self.getContext('2d');
      if (ctx && self.width && self.height) {
        var img = origGetImageData.call(ctx, 0, 0, self.width, self.height);
        var backup = new Uint8ClampedArray(img.data);
        applyUnifiedNoise(img, 0, 0);
        ctx.putImageData(img, 0, 0);
        try { return origToDataURL.apply(self, arguments); } finally {
          img.data.set(backup);
          ctx.putImageData(img, 0, 0);
        }
      }
      return origToDataURL.apply(self, arguments);
    };
    HTMLCanvasElement.prototype.toBlob = function() {
      var self = this;
      var ctx = self.getContext('2d');
      if (ctx && self.width && self.height) {
        var img = origGetImageData.call(ctx, 0, 0, self.width, self.height);
        var backup = new Uint8ClampedArray(img.data);
        applyUnifiedNoise(img, 0, 0);
        ctx.putImageData(img, 0, 0);
        try { return origToBlob.apply(self, arguments); } finally {
          img.data.set(backup);
          ctx.putImageData(img, 0, 0);
        }
      }
      return origToBlob.apply(self, arguments);
    };
  }

  if (FP.spoofWebGPU && navigator.gpu) {
    var origRequestAdapter = navigator.gpu.requestAdapter.bind(navigator.gpu);
    navigator.gpu.requestAdapter = function(opts) {
      return origRequestAdapter(opts).then(function(adapter) {
        if (!adapter) return adapter;
        try {
          adapter.info = {
            vendor: FP.webgpuVendor || 'nvidia',
            architecture: FP.webgpuArchitecture || 'ampere',
            device: '',
            description: '',
          };
        } catch(e) {}
        return adapter;
      });
    };
  }

  if (FP.clientRectsNoise) {
    var origGCBR = Element.prototype.getBoundingClientRect;
    var origGCR = Element.prototype.getClientRects;
    Element.prototype.getBoundingClientRect = function() {
      var r = origGCBR.call(this);
      var n = (detUnit('r:' + (this.tagName || '')) - 0.5) * 0.00001;
      return new DOMRect(r.x + n, r.y + n, r.width, r.height);
    };
    Element.prototype.getClientRects = function() {
      var rects = origGCR.call(this);
      var n = (detUnit('rc:' + (this.tagName || '')) - 0.5) * 0.00001;
      var out = [];
      for (var i = 0; i < rects.length; i++) {
        var r = rects[i];
        out.push(new DOMRect(r.x + n, r.y + n, r.width, r.height));
      }
      out.item = function(i) { return out[i]; };
      return out;
    };
  }

  if (FP.spoofMediaDevices && navigator.mediaDevices) {
    navigator.mediaDevices.enumerateDevices = function() {
      return Promise.resolve(FP.mediaDevicesList.map(function(d) { return Object.assign({}, d); }));
    };
  }

  if (FP.spoofSpeechVoices && typeof speechSynthesis !== 'undefined') {
    speechSynthesis.getVoices = function() { return FP.speechVoicesList.slice(); };
  }

  if (FP.isMobile) {
    defineProtoGetter(Navigator.prototype, 'connection', function() {
      return { effectiveType: FP.connectionType || '4g', downlink: FP.connectionDownlink || 10, rtt: FP.connectionRtt || 50, saveData: false };
    });
    if (navigator.getBattery) {
      navigator.getBattery = function() {
        return Promise.resolve({ charging: FP.batteryCharging !== false, chargingTime: 0, dischargingTime: Infinity, level: FP.batteryLevel || 0.85 });
      };
    }
  }

  if (FP.portScanProtect && window.fetch) {
    var blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'];
    var origFetch = window.fetch;
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

  if (!window.chrome) window.chrome = {};
  if (!window.chrome.csi) {
    window.chrome.csi = function() { return { onloadT: Date.now(), startE: Date.now(), pageT: 0, tran: 15 }; };
  }
  if (!window.chrome.loadTimes) {
    window.chrome.loadTimes = function() {
      var t = Date.now() / 1000;
      return { commitLoadTime: t, connectionInfo: 'http/1.1', finishDocumentLoadTime: t, finishLoadTime: t, firstPaintAfterLoadTime: 0, firstPaintTime: t, navigationType: 'Other', npnNegotiatedProtocol: 'unknown', requestTime: t, startLoadTime: t, wasAlternateProtocolAvailable: false, wasFetchedViaSpdy: false, wasNpnNegotiated: false };
    };
  }

  ${workerBridge}
})();
`;
}

function buildWorkerInjectionFromScope(fpJson: string, scopeHooks: string): string {
  return `
(function() {
  'use strict';
  var FP = ${fpJson};
  ${scopeHooks}
})();
`;
}

// Re-export for worker module compatibility
export { buildWorkerBridgeScript } from './injection-worker.js';
