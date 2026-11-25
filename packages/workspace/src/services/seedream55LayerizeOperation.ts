import type { CanvasImage, GenerationInputs } from '../types';
import { findNonOverlappingPlacement, getImageBounds } from '../utils/canvasGeometry';
import type { LayerizeSeedream55Options } from './fal/types';
import { layerizeSeedream55Image } from './falService';
import { getNaturalSize, prepareGeneratedImage } from './mediaService';
import { getFalModelLabel } from './modelConfig';
import { getSeedream55ModelProvider, SEEDREAM_55_MODEL_ID, SEEDREAM_55_VOLCENGINE_MODEL_ID } from './seedream55Config';
import { layerizeVolcengineSeedream55Image } from './seedream55VolcengineService';

interface Seedream55LayerizeOperation {
  readonly source: CanvasImage;
  readonly generation: GenerationInputs & { modelId: typeof SEEDREAM_55_MODEL_ID | typeof SEEDREAM_55_VOLCENGINE_MODEL_ID; modelLabel: string };
  execute(options: LayerizeSeedream55Options): Promise<{
    requestId?: string;
    images: CanvasImage[];
    placeOn(canvasImages: readonly CanvasImage[]): CanvasImage[];
  }>;
}

export const resolveSeedream55LayerizeOperation = ({
  request, modelId, images,
}: {
  request: GenerationInputs;
  modelId: string;
  images: readonly CanvasImage[];
}): Seedream55LayerizeOperation => {
  const provider = getSeedream55ModelProvider(request.modelId ?? modelId);
  if ((provider !== 'fal' && provider !== 'volcengine') || request.provider !== provider || request.modelMode === 'video') {
    throw new Error('Select Seedream 5.5 to layerize an image.');
  }
  const source = images.find(image => image.id === request.primaryImageId);
  if (!source || source.mediaType !== 'image' || !(source.element instanceof HTMLImageElement)) {
    throw new Error('Select a still image to layerize.');
  }
  if (request.referenceImageIds?.length || request.referenceVideoIds?.length || request.referenceAudioIds?.length) {
    throw new Error('Seedream 5.5 Layerize takes one image. Clear the other selections and references.');
  }

  const image = source.element;
  const prompt = request.prompt.trim();
  const isVolcengine = provider === 'volcengine';
  const selectorId = isVolcengine ? SEEDREAM_55_VOLCENGINE_MODEL_ID : SEEDREAM_55_MODEL_ID;
  const modelLabel = getFalModelLabel(selectorId);
  const generation = {
    kind: 'layerize',
    prompt,
    provider,
    modelId: selectorId,
    modelLabel,
    modelMode: 'image',
    primaryImageId: source.id,
    originalSourceImageId: source.id,
    falOptions: {},
  } satisfies Seedream55LayerizeOperation['generation'];

  return {
    source,
    generation,
    async execute(options) {
      const layerize = isVolcengine ? layerizeVolcengineSeedream55Image : layerizeSeedream55Image;
      const result = await layerize({ image, sourceFile: source.file, prompt }, options);
      const layers: CanvasImage[] = [];
      for (const { dataUrl, bounds } of result.layers) {
        options.abortSignal?.throwIfAborted();
        const { image: element, file } = await prepareGeneratedImage(dataUrl, 'preserve-original');
        const { naturalWidth, naturalHeight } = getNaturalSize(element);
        layers.push({
          id: crypto.randomUUID(), mediaType: 'image', element, file, rotation: 0,
          x: bounds?.x ?? 0, y: bounds?.y ?? 0,
          width: bounds?.width ?? (naturalWidth || 512), height: bounds?.height ?? (naturalHeight || 512),
          naturalWidth, naturalHeight, isPlaying: false, hasAudio: false,
          metadata: { source: 'generated', prompt, modelLabel, generation },
        });
      }
      const width = Math.max(...layers.map(layer => layer.x + layer.width));
      const height = Math.max(...layers.map(layer => layer.y + layer.height));

      return {
        requestId: result.requestId,
        images: layers,
        placeOn(canvasImages) {
          const anchor = getImageBounds(canvasImages.find(item => item.id === source.id) ?? source);
          const origin = findNonOverlappingPlacement(canvasImages, width, height, anchor.maxX + 20, anchor.minY);
          return layers.map(layer => ({ ...layer, x: origin.x + layer.x, y: origin.y + layer.y }));
        },
      };
    },
  };
};
