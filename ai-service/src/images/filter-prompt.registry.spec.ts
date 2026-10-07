import { describe, expect, it } from 'vitest';

import { ImageEnhancementError } from './image-enhancement.error.js';
import { FilterPromptRegistry } from './filter-prompt.registry.js';

const handwrittenDiaryPrompt = `Edit the supplied image while preserving the main subject, composition,
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
alter the primary subject, add a logo, or add a watermark.`;

const subjectStickerPrompt = `Identify the single primary subject in the supplied image. Remove the entire
background precisely while preserving the subject's recognizable appearance,
edges, proportions, details, and natural colors. Return only the isolated
subject as a PNG with a genuinely transparent background. Add one clean,
continuous, evenly thick white outline around the subject. Do not add text,
shadow, decoration, a replacement background, a logo, or a watermark.`;

describe('FilterPromptRegistry', () => {
  it('resolves each supported filter to its server-owned canonical prompt', () => {
    const registry = new FilterPromptRegistry();

    expect(registry.get('handwritten_diary')).toEqual({
      id: 'handwritten_diary',
      prompt: handwrittenDiaryPrompt,
    });
    expect(registry.get('subject_sticker')).toEqual({
      id: 'subject_sticker',
      prompt: subjectStickerPrompt,
      requiredOutputMime: 'image/png',
    });
  });

  it('rejects an unsupported filter ID as an invalid request', () => {
    const registry = new FilterPromptRegistry();

    let thrown: unknown;
    try {
      registry.get('custom_prompt');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ImageEnhancementError);
    expect(thrown).toMatchObject({ code: 'INVALID_REQUEST' });
  });

  it('accepts only a filter ID, never a client-supplied prompt', () => {
    expect(new FilterPromptRegistry().get).toHaveLength(1);
  });
});
