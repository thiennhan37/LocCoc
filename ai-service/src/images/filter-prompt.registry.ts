import { ImageEnhancementError } from './image-enhancement.error.js';
import type { FilterPrompt, ImageFilterId } from './image.types.js';

const FILTER_PROMPTS: Readonly<Record<ImageFilterId, Readonly<FilterPrompt>>> = Object.freeze({
  handwritten_diary: Object.freeze({
    id: 'handwritten_diary',
    prompt: `Edit the supplied image while preserving the main subject, composition,
faces, identity, body shape, and natural colors. Add a stylish, relaxed,
casual hand-drawn overlay using thin white pen lines. Lines should feel
slightly rough, gently imperfect, and mostly continuous. Add a few contour
lines that follow the outside edges of prominent objects. Use very few arrows
or dotted paths to guide the eye.

Add no more than two extremely short handwritten Vietnamese comments, each
one to four words, in a positive, sweet, diary-like emotional voice. Keep all
writing away from faces and important subject details. Add only a restrained
number of small steam marks, sparkles, hearts, or simple emoticon faces. Leave
generous negative space. Do not overcrowd the image, replace the background,
alter the primary subject, add a logo, or add a watermark.`,
  }),
  subject_sticker: Object.freeze({
    id: 'subject_sticker',
    prompt: `Identify the single primary subject in the supplied image. Remove the entire
background precisely while preserving the subject's recognizable appearance,
edges, proportions, details, and natural colors. Return only the isolated
subject as a PNG with a genuinely transparent background. Add one clean,
continuous, evenly thick white outline around the subject. Do not add text,
shadow, decoration, a replacement background, a logo, or a watermark.`,
    requiredOutputMime: 'image/png',
  }),
});

export class FilterPromptRegistry {
  get(filterId: string): Readonly<FilterPrompt> {
    if (!isImageFilterId(filterId)) {
      throw new ImageEnhancementError('INVALID_REQUEST', 'Unsupported image filter');
    }

    return FILTER_PROMPTS[filterId];
  }
}

function isImageFilterId(filterId: string): filterId is ImageFilterId {
  return Object.hasOwn(FILTER_PROMPTS, filterId);
}
