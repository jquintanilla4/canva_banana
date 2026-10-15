import { useCallback, useEffect, useState } from 'react';
import { KREA_2_MAX_STYLE_REFERENCES } from '../services/modelConfig';
import { normalizeKrea2StyleStrength } from '../utils/krea2StyleStrength';

const areKrea2StrengthMapsEqual = (left: Record<string, number>, right: Record<string, number>): boolean => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every(key => left[key] === right[key]);
};

type UseKrea2StyleStrengthsArgs = {
  isActive: boolean; // Krea 2 Large selected while Fal is the active provider.
  referenceImageIds: string[];
};

// Per-reference style strengths for Krea 2 Large; entries track the active style
// references and reset when the model is not active.
export function useKrea2StyleStrengths({ isActive, referenceImageIds }: UseKrea2StyleStrengthsArgs) {
  const [krea2StyleReferenceStrengths, setKrea2StyleReferenceStrengths] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!isActive) {
      setKrea2StyleReferenceStrengths(prev => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }
    const activeReferenceIds = referenceImageIds.slice(0, KREA_2_MAX_STYLE_REFERENCES);
    setKrea2StyleReferenceStrengths(prev => {
      const next = Object.fromEntries(activeReferenceIds.map(id => [id, normalizeKrea2StyleStrength(prev[id] ?? 1)]));
      return areKrea2StrengthMapsEqual(prev, next) ? prev : next;
    });
  }, [isActive, referenceImageIds]);

  const handleKrea2StyleReferenceStrengthChange = useCallback((imageId: string, value: number) => {
    setKrea2StyleReferenceStrengths(prev => ({ ...prev, [imageId]: normalizeKrea2StyleStrength(value) }));
  }, []);

  return {
    krea2StyleReferenceStrengths,
    setKrea2StyleReferenceStrengths,
    handleKrea2StyleReferenceStrengthChange,
  };
}
