/** Correlated WebGL parameters per claimed GPU — spoof as a set, not piecemeal. */

export interface WebGlProfile {
  params: Record<number, number | string | boolean>;
  webgpuVendor: string;
  webgpuArchitecture: string;
}

const GTX1060: WebGlProfile = {
  webgpuVendor: 'nvidia',
  webgpuArchitecture: 'ampere',
  params: {
    3379: 16384, // MAX_TEXTURE_SIZE
    3386: 32767, // MAX_VIEWPORT_DIMS (returned as Int32Array — handled in runtime)
    34930: 16, // MAX_TEXTURE_IMAGE_UNITS
    35661: 32, // MAX_VERTEX_TEXTURE_IMAGE_UNITS
    36349: 8192, // MAX_ARRAY_TEXTURE_LAYERS
  },
};

const INTEL_UHD: WebGlProfile = {
  webgpuVendor: 'intel',
  webgpuArchitecture: 'gen9',
  params: {
    3379: 16384,
    3386: 16384,
    34930: 16,
    35661: 16,
    36349: 2048,
  },
};

const APPLE_M1: WebGlProfile = {
  webgpuVendor: 'apple',
  webgpuArchitecture: 'apple-gpu',
  params: {
    3379: 16384,
    3386: 16384,
    34930: 16,
    35661: 16,
    36349: 2048,
  },
};

export function pickWebGlProfile(vendor: string, renderer: string): WebGlProfile {
  const v = `${vendor} ${renderer}`.toLowerCase();
  if (v.includes('apple') || v.includes('m1') || v.includes('m2') || v.includes('m3')) return APPLE_M1;
  if (v.includes('intel')) return INTEL_UHD;
  return GTX1060;
}
