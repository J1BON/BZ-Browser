/** Correlated WebGL parameters per claimed GPU — spoof as a set, not piecemeal. */

export interface WebGlProfile {
  params: Record<number, number | string | boolean>;
  webgpuVendor: string;
  webgpuArchitecture: string;
  extensions: string[];
  shaderPrecision: { shaderType: number; precisionType: number; rangeMin: number; rangeMax: number; precision: number }[];
}

const BASE_EXTENSIONS = [
  'ANGLE_instanced_arrays', 'EXT_blend_minmax', 'EXT_color_buffer_half_float',
  'EXT_disjoint_timer_query', 'EXT_float_blend', 'EXT_frag_depth',
  'EXT_shader_texture_lod', 'EXT_texture_compression_bptc', 'EXT_texture_compression_rgtc',
  'EXT_texture_filter_anisotropic', 'EXT_sRGB', 'OES_element_index_uint',
  'OES_fbo_render_mipmap', 'OES_standard_derivatives', 'OES_texture_float',
  'OES_texture_float_linear', 'OES_texture_half_float', 'OES_texture_half_float_linear',
  'OES_vertex_array_object', 'WEBGL_color_buffer_float', 'WEBGL_compressed_texture_s3tc',
  'WEBGL_compressed_texture_s3tc_srgb', 'WEBGL_debug_renderer_info', 'WEBGL_debug_shaders',
  'WEBGL_depth_texture', 'WEBGL_draw_buffers', 'WEBGL_lose_context',
];

const DEFAULT_SHADER_PRECISION = [
  { shaderType: 35633, precisionType: 36338, rangeMin: 127, rangeMax: 127, precision: 23 },
  { shaderType: 35633, precisionType: 36337, rangeMin: 127, rangeMax: 127, precision: 23 },
  { shaderType: 35633, precisionType: 36336, rangeMin: 127, rangeMax: 127, precision: 23 },
  { shaderType: 35632, precisionType: 36338, rangeMin: 127, rangeMax: 127, precision: 23 },
  { shaderType: 35632, precisionType: 36337, rangeMin: 127, rangeMax: 127, precision: 23 },
  { shaderType: 35632, precisionType: 36336, rangeMin: 127, rangeMax: 127, precision: 23 },
];

const GTX1060: WebGlProfile = {
  webgpuVendor: 'nvidia',
  webgpuArchitecture: 'ampere',
  extensions: [...BASE_EXTENSIONS, 'WEBGL_compressed_texture_astc'],
  shaderPrecision: DEFAULT_SHADER_PRECISION,
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
  extensions: [...BASE_EXTENSIONS],
  shaderPrecision: DEFAULT_SHADER_PRECISION,
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
  extensions: [...BASE_EXTENSIONS, 'WEBGL_compressed_texture_astc'],
  shaderPrecision: DEFAULT_SHADER_PRECISION,
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
