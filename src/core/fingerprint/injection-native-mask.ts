/** Function.prototype.toString masking for JS-fallback mode. */

export function buildNativeMaskBootstrap(): string {
  return `
  var _origFnToString = Function.prototype.toString;
  var _nativeMask = typeof WeakMap !== 'undefined' ? new WeakMap() : { _m: {}, set: function(k,v){this._m[k]=v;}, get: function(k){return this._m[k];}, has: function(k){return k in this._m;} };
  function maskNative(fn, nativeName) {
    _nativeMask.set(fn, 'function ' + nativeName + '() { [native code] }');
    try { Object.defineProperty(fn, 'name', { value: nativeName, configurable: true }); } catch(e) {}
    return fn;
  }
  Function.prototype.toString = maskNative(function() {
    if (_nativeMask.has(this)) return _nativeMask.get(this);
    return _origFnToString.call(this);
  }, 'toString');
`;
}
