/** Worker / SharedWorker bridge — prepends the same scope hooks as the main thread. */

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
    function patchConstructor(name, OrigCtor) {
      if (!OrigCtor) return;
      var Wrapped = maskNative(function(scriptURL, options) {
        if (options && options.type === 'module') return new OrigCtor(scriptURL, options);
        return new OrigCtor(wrapWorkerUrl(scriptURL), options);
      }, name);
      Wrapped.prototype = OrigCtor.prototype;
      try {
        Object.defineProperty(globalThis, name, { value: Wrapped, writable: true, configurable: true });
      } catch(e) {
        globalThis[name] = Wrapped;
      }
    }
    patchConstructor('Worker', typeof Worker !== 'undefined' ? Worker : null);
    patchConstructor('SharedWorker', typeof SharedWorker !== 'undefined' ? SharedWorker : null);
  })();
`;
}
