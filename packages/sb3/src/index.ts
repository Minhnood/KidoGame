export { validateAndNormalize, extractStrings } from './validate.js';
export type {
  NormalizedSb3,
  ProjectJson,
  ProjectTarget,
  Sb3Warning,
  ValidateOptions,
} from './validate.js';

export { packageToHtml } from './package.js';
export type { PackagedHtml, PackageOptions } from './package.js';

export { renderThumbnail, THUMB_WIDTH, THUMB_HEIGHT } from './thumbnail.js';

export { readSb3Zip } from './zip.js';
export type { ZipEntry } from './zip.js';

export { Sb3Error } from './errors.js';
export type { Sb3ErrorCode } from './errors.js';

export { LIMITS, ALLOWED_EXTENSIONS, ALLOWED_ASSET_EXTENSIONS } from './limits.js';
