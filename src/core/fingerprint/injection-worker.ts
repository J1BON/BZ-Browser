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
