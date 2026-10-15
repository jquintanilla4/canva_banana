export type ImageRunKind = 'text_to_image' | 'image_edit';
export type ImageRunSettingsValidation = 'strict' | 'restore';

export interface ImageRunSettings<Kind extends ImageRunKind = ImageRunKind> {
  readonly kind: Kind;
  readonly numImages?: number; // Direct callers may omit the provider's default output count.
}

export const resolveImageRunOutputCount = (
  value: unknown,
  maximum: number,
  validation: ImageRunSettingsValidation,
): number | undefined => typeof value === 'number' && Number.isFinite(value)
  ? Math.min(maximum, Math.max(1, Math.floor(value)))
  : validation === 'restore' ? 1 : undefined;
