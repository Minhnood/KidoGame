export { validateAndNormalize, extractStrings } from './validate.js';
export type {
  NormalizedSb3,
  ProjectJson,
  ProjectTarget,
  Sb3Warning,
  ValidateOptions,
} from './validate.js';

export { packageToHtml, runtimePath } from './package.js';
export type { PackagedHtml, PackagedRuntime, PackageOptions } from './package.js';

export {
  renderThumbnail,
  renderCoverOptions,
  normalizeCoverImage,
  MAX_COVER_OPTIONS,
  MAX_COVER_IMAGE_BYTES,
  THUMB_WIDTH,
  THUMB_HEIGHT,
} from './thumbnail.js';

export { detectTouchKeys } from './keys.js';
export type { TouchKey } from './keys.js';
export { buildTouchControls } from './touch-controls.js';
export { buildStageDecor } from './stage-decor.js';

export { readSb3Zip } from './zip.js';
export type { ZipEntry } from './zip.js';

export { Sb3Error } from './errors.js';
export type { Sb3ErrorCode } from './errors.js';

export { LIMITS, ALLOWED_EXTENSIONS, ALLOWED_ASSET_EXTENSIONS } from './limits.js';
