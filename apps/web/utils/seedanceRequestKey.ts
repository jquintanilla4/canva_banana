import type { CanvasImage, Seedance2Variant } from '../types';

type Seedance2RequestKeyArgs = {
  provider?: string; // Backend keeps repeat tracking scoped.
  modelId?: string; // Model id separates FAL and Volcengine.
  prompt: string;
  variant: Seedance2Variant;
  jimengModelVersion?: string; // Jimeng CLI channel changes backend behavior.
  aspectRatio: string;
  resolution: string;
  duration: string;
  generateAudio: boolean;
  cameraFixed: boolean;
  primaryImageId: string | null;
  videoLastFrameImageId: string | null;
  referenceImageIds: string[];
  referenceVideoIds: string[];
  referenceAudioIds: string[];
  images: CanvasImage[];
};

const buildCanvasAssetToken = (
  assetId: string | null,
  images: CanvasImage[],
): string | null => {
  if (!assetId) {
    return null;
  }

  const asset = images.find(img => img.id === assetId);
  if (!asset) {
    return `${assetId}:missing`; // Keep removed assets distinct while a request is active.
  }

  const rotationToken = asset.mediaType === 'image' ? asset.rotation ?? 0 : 'na';
  return [
    asset.id,
    asset.mediaType,
    rotationToken,
    asset.file.name || 'unnamed',
    asset.file.type || 'unknown',
    asset.file.size,
    asset.file.lastModified,
  ].join('|'); // Match the submitted canvas asset, not just its selection id.
};

const buildCanvasAssetTokenList = (
  assetIds: string[],
  images: CanvasImage[],
): string[] => assetIds.map(assetId => buildCanvasAssetToken(assetId, images) ?? `${assetId}:missing`);

export const buildSeedance2RequestKey = ({
  provider,
  modelId,
  prompt,
  variant,
  jimengModelVersion,
  aspectRatio,
  resolution,
  duration,
  generateAudio,
  cameraFixed,
  primaryImageId,
  videoLastFrameImageId,
  referenceImageIds,
  referenceVideoIds,
  referenceAudioIds,
  images,
}: Seedance2RequestKeyArgs): string => JSON.stringify({
  provider: provider ?? 'unknown', // Missing older calls still get a stable key.
  modelId: modelId ?? 'unknown', // Missing older calls still get a stable key.
  prompt: prompt.trim(),
  variant,
  jimengModelVersion: jimengModelVersion ?? null,
  aspectRatio,
  resolution,
  duration,
  generateAudio,
  cameraFixed,
  primaryAsset: buildCanvasAssetToken(primaryImageId, images),
  lastFrameAsset: buildCanvasAssetToken(videoLastFrameImageId, images),
  referenceImageAssets: buildCanvasAssetTokenList(referenceImageIds, images),
  referenceVideoAssets: buildCanvasAssetTokenList(referenceVideoIds, images),
  referenceAudioAssets: buildCanvasAssetTokenList(referenceAudioIds, images),
}); // Use the exact request inputs as the duplicate lock key.
