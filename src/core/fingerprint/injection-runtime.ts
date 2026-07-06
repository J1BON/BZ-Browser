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

  var availOff = FP.availHeightOffset || 40;
  defineProtoGetter(Screen.prototype, 'width', function() { return FP.w; });
  defineProtoGetter(Screen.prototype, 'availWidth', function() { return FP.w; });
  defineProtoGetter(Screen.prototype, 'height', function() { return FP.h; });
  defineProtoGetter(Screen.prototype, 'availHeight', function() { return FP.h - availOff; });
  defineProtoGetter(Screen.prototype, 'availLeft', function() { return FP.availLeft || 0; });
  defineProtoGetter(Screen.prototype, 'availTop', function() { return FP.availTop || 0; });
  defineProtoGetter(Screen.prototype, 'colorDepth', function() { return FP.colorDepth; });
  defineProtoGetter(Screen.prototype, 'pixelDepth', function() { return FP.colorDepth; });
  if (typeof screen !== 'undefined' && screen.orientation) {
    try {
      var orientProto = Object.getPrototypeOf(screen.orientation);
      if (orientProto) {
        defineProtoGetter(orientProto, 'type', function() { return FP.screenOrientation || 'landscape-primary'; });
      }
    } catch(e) {}
  }
  defineProtoGetter(window, 'innerWidth', function() { return FP.innerW; });
  defineProtoGetter(window, 'innerHeight', function() { return FP.innerH; });
  defineProtoGetter(window, 'devicePixelRatio', function() { return FP.dpr; });

  if (navigator.geolocation) {
    var pos = { coords: { latitude: FP.lat, longitude: FP.lon, accuracy: 50, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() };
    navigator.geolocation.getCurrentPosition = maskNative(function(ok) { ok(pos); }, 'getCurrentPosition');
    navigator.geolocation.watchPosition = maskNative(function(ok) { ok(pos); return 0; }, 'watchPosition');
  }

  if (FP.canvasNoise) {
    var origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    var origToBlob = HTMLCanvasElement.prototype.toBlob;
    var nativeGetImageData = CanvasRenderingContext2D.prototype.getImageData;

    HTMLCanvasElement.prototype.toDataURL = maskNative(function() {
      var self = this;
      var ctx = self.getContext('2d');
      if (ctx && self.width && self.height) {
        try {
          var originalImg = nativeGetImageData.call(ctx, 0, 0, self.width, self.height);
          var backup = new Uint8ClampedArray(originalImg.data);
          var noisedImg = readNoisedImageData(ctx, 0, 0, self.width, self.height);
          ctx.putImageData(noisedImg, 0, 0);
          var res = origToDataURL.apply(self, arguments);
          originalImg.data.set(backup);
          ctx.putImageData(originalImg, 0, 0);
          return res;
        } catch (e) {}
      }
      return origToDataURL.apply(self, arguments);
    }, 'toDataURL');

    HTMLCanvasElement.prototype.toBlob = maskNative(function() {
      var self = this;
      var ctx = self.getContext('2d');
      if (ctx && self.width && self.height) {
        try {
          var originalImg = nativeGetImageData.call(ctx, 0, 0, self.width, self.height);
          var backup = new Uint8ClampedArray(originalImg.data);
          var noisedImg = readNoisedImageData(ctx, 0, 0, self.width, self.height);
          ctx.putImageData(noisedImg, 0, 0);
          var res = origToBlob.apply(self, arguments);
          originalImg.data.set(backup);
          ctx.putImageData(originalImg, 0, 0);
          return res;
        } catch (e) {}
      }
      return origToBlob.apply(self, arguments);
    }, 'toBlob');
  }

  if (FP.spoofWebGPU && navigator.gpu) {
    var origRequestAdapter = navigator.gpu.requestAdapter.bind(navigator.gpu);
    navigator.gpu.requestAdapter = maskNative(function(opts) {
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
    }, 'requestAdapter');
  }

  if (FP.clientRectsNoise) {
    var origGCBR = Element.prototype.getBoundingClientRect;
    var origGCR = Element.prototype.getClientRects;
    function toDOMRectList(rects) {
      var list = Array.prototype.slice.call(rects);
      for (var i = 0; i < rects.length; i++) list[i] = rects[i];
      list.item = function(idx) { return list[idx] || null; };
      try { Object.setPrototypeOf(list, DOMRectList.prototype); } catch(e) {}
      return list;
    }
    Element.prototype.getBoundingClientRect = maskNative(function() {
      var r = origGCBR.call(this);
      var tag = this.tagName || '';
      var n = (detUnit('r:' + tag) - 0.5) * 0.00001;
      var wn = (detUnit('rw:' + tag) - 0.5) * 0.00001;
      return new DOMRect(r.x + n, r.y + n, r.width + wn, r.height + wn);
    }, 'getBoundingClientRect');
    Element.prototype.getClientRects = maskNative(function() {
      var rects = origGCR.call(this);
      var tag = this.tagName || '';
      var n = (detUnit('rc:' + tag) - 0.5) * 0.00001;
      var wn = (detUnit('rcw:' + tag) - 0.5) * 0.00001;
      var out = [];
      for (var i = 0; i < rects.length; i++) {
        var r = rects[i];
        out.push(new DOMRect(r.x + n, r.y + n, r.width + wn, r.height + wn));
      }
      return toDOMRectList(out);
    }, 'getClientRects');
  }

  if (FP.spoofMediaDevices && navigator.mediaDevices) {
    navigator.mediaDevices.enumerateDevices = maskNative(function() {
      return Promise.resolve(FP.mediaDevicesList.map(function(d) { return Object.assign({}, d); }));
    }, 'enumerateDevices');
  }

  if (FP.spoofSpeechVoices && typeof speechSynthesis !== 'undefined') {
    speechSynthesis.getVoices = maskNative(function() { return FP.speechVoicesList.slice(); }, 'getVoices');
  }

  if (FP.isMobile) {
    defineProtoGetter(Navigator.prototype, 'connection', function() {
      return { effectiveType: FP.connectionType || '4g', downlink: FP.connectionDownlink || 10, rtt: FP.connectionRtt || 50, saveData: false };
    });
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

  if (FP.webRtcProtect && typeof RTCPeerConnection !== 'undefined') {
    var OrigPC = RTCPeerConnection;
    var proxyIp = FP.proxyIp || '';
    function isLocalIp(ip) {
      if (!ip) return true;
      if (ip.indexOf('.local') >= 0) return true;
      if (ip === '127.0.0.1' || ip === '0.0.0.0' || ip === '::1') return true;
      if (ip.indexOf('192.168.') === 0 || ip.indexOf('10.') === 0) return true;
      if (ip.indexOf('172.') === 0) {
        var p = parseInt(ip.split('.')[1], 10);
        if (p >= 16 && p <= 31) return true;
      }
      if (ip.indexOf('fe80') === 0) return true;
      return false;
    }
    function scrubSdp(sdp) {
      if (!sdp) return sdp;
      if (FP.webRtcBlock) return sdp.replace(/a=candidate:[^\\r\\n]+\\r\\n/g, '');
      var lines = sdp.split('\\r\\n');
      var out = [];
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.indexOf('a=candidate:') === 0) {
          var parts = line.split(' ');
          var ip = parts[4];
          var type = parts[7];
          if (type === 'host' && (isLocalIp(ip) || ip.indexOf('.local') >= 0)) continue;
          if (type === 'srflx' && proxyIp && ip && ip !== proxyIp) line = line.replace(ip, proxyIp);
        }
        out.push(line);
      }
      return out.join('\\r\\n');
    }
    function scrubCandidate(candidate) {
      if (!candidate || !candidate.candidate) return candidate;
      if (FP.webRtcBlock) return null;
      var c = candidate.candidate;
      var parts = c.split(' ');
      var ip = parts[4];
      var type = parts[7];
      if (type === 'host' && (isLocalIp(ip) || (ip && ip.indexOf('.local') >= 0))) return null;
      if (type === 'srflx' && proxyIp && ip && ip !== proxyIp) {
        c = c.replace(ip, proxyIp);
        return { candidate: c, sdpMid: candidate.sdpMid, sdpMLineIndex: candidate.sdpMLineIndex };
      }
      return candidate;
    }
    function rewriteStatIp(s, ip) {
      if (s.address) s.address = ip;
      if (s.ip) s.ip = ip;
      if (s.localIp) s.localIp = ip;
      if (s.remoteIp) s.remoteIp = ip;
    }
    function scrubStatsReport(report) {
      if (!report || !report.forEach) return report;
      report.forEach(function(s) {
        var addr = s.address || s.ip;
        if (s.type === 'local-candidate') {
          if (s.candidateType === 'host' && isLocalIp(addr)) { report.delete(s.id); return; }
          if (s.candidateType === 'srflx' && proxyIp && addr && addr !== proxyIp) rewriteStatIp(s, proxyIp);
        } else if (s.type === 'remote-candidate') {
          if (s.candidateType === 'srflx' && proxyIp && addr && addr !== proxyIp) rewriteStatIp(s, proxyIp);
        } else if (s.type === 'candidate-pair') {
          var lip = s.localIp || s.localAddress || s.address;
          if (proxyIp && lip && isLocalIp(lip)) rewriteStatIp(s, proxyIp);
        }
      });
      return report;
    }
    function wrapIceListener(listener) {
      return function(ev) {
        if (!ev.candidate) { listener(ev); return; }
        var scrubbed = scrubCandidate(ev.candidate);
        if (!scrubbed) return;
        listener(Object.assign({}, ev, { candidate: scrubbed }));
      };
    }
    var WrappedPC = maskNative(function(config, constraints) {
      if (FP.webRtcBlock) {
        config = config || {};
        config.iceServers = [];
      }
      var pc = new OrigPC(config, constraints);
      if (!FP.webRtcProtect) return pc;
      var origSetLocal = pc.setLocalDescription.bind(pc);
      pc.setLocalDescription = maskNative(function(desc) {
        if (desc && desc.sdp) desc = { type: desc.type, sdp: scrubSdp(desc.sdp) };
        return origSetLocal(desc);
      }, 'setLocalDescription');
      var origAddEv = pc.addEventListener.bind(pc);
      pc.addEventListener = maskNative(function(type, listener, opts) {
        if (type === 'icecandidate' && typeof listener === 'function') {
          return origAddEv(type, wrapIceListener(listener), opts);
        }
        return origAddEv(type, listener, opts);
      }, 'addEventListener');
      try {
        var oicd = Object.getOwnPropertyDescriptor(OrigPC.prototype, 'onicecandidate');
        if (oicd && oicd.set) {
          Object.defineProperty(pc, 'onicecandidate', {
            get: oicd.get ? oicd.get.bind(pc) : function() { return null; },
            set: function(fn) { oicd.set.call(this, fn ? wrapIceListener(fn) : fn); },
            configurable: true,
          });
        }
      } catch(e) {}
      var origGetStats = pc.getStats.bind(pc);
      pc.getStats = maskNative(function() {
        return origGetStats.apply(pc, arguments).then(function(report) {
          return scrubStatsReport(report);
        });
      }, 'getStats');
      return pc;
    }, 'RTCPeerConnection');
    WrappedPC.prototype = OrigPC.prototype;
    try { Object.setPrototypeOf(WrappedPC, OrigPC); } catch(e) {}
    if (OrigPC.generateCertificate) WrappedPC.generateCertificate = OrigPC.generateCertificate.bind(OrigPC);
    if (OrigPC.getDefaultIceServers) WrappedPC.getDefaultIceServers = OrigPC.getDefaultIceServers.bind(OrigPC);
    try {
      Object.defineProperty(globalThis, 'RTCPeerConnection', { value: WrappedPC, writable: true, configurable: true });
    } catch(e) {
      globalThis.RTCPeerConnection = WrappedPC;
    }
  }

  (function patchPermissions() {
    var permState = FP.notificationPermission || 'default';
    if (typeof Notification !== 'undefined') {
      try {
        Object.defineProperty(Notification, 'permission', { get: function() { return permState; }, configurable: true });
      } catch(e) {}
    }
    if (navigator.permissions && navigator.permissions.query) {
      var origQuery = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = maskNative(function(desc) {
        if (desc && desc.name === 'notifications') {
          return Promise.resolve({ state: permState, onchange: null });
        }
        return origQuery(desc);
      }, 'query');
    }
  })();

  if (!window.chrome) window.chrome = {};
  if (!window.chrome.csi) {
    window.chrome.csi = maskNative(function() { return { onloadT: Date.now(), startE: Date.now(), pageT: 0, tran: 15 }; }, 'csi');
  }
  if (!window.chrome.loadTimes) {
    window.chrome.loadTimes = maskNative(function() {
      var t = Date.now() / 1000;
      return { commitLoadTime: t, connectionInfo: 'http/1.1', finishDocumentLoadTime: t, finishLoadTime: t, firstPaintAfterLoadTime: 0, firstPaintTime: t, navigationType: 'Other', npnNegotiatedProtocol: 'unknown', requestTime: t, startLoadTime: t, wasAlternateProtocolAvailable: false, wasFetchedViaSpdy: false, wasNpnNegotiated: false };
    }, 'loadTimes');
  }
  if (!window.chrome.runtime) {
    window.chrome.runtime = {
      id: undefined,
      connect: maskNative(function() { throw new Error('Extension context invalidated.'); }, 'connect'),
      sendMessage: maskNative(function() { throw new Error('Extension context invalidated.'); }, 'sendMessage'),
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
