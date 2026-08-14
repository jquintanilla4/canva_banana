import { useCallback, useState } from 'react';
import { applyBlindTestMode, applyOpenSourceAliasMode, type BlindTestMapping } from '../services/blindTestService';

// Blind test mode anonymizes model names in dropdowns with random codenames;
// alt-click flips into the open-source alias variant instead. The two modes are
// mutually exclusive.
export function useBlindTestMode() {
  const [blindTestEnabled, setBlindTestEnabled] = useState(false);
  const [openSourceAliasEnabled, setOpenSourceAliasEnabled] = useState(false);
  const [blindTestMapping] = useState<BlindTestMapping>(() => new Map());

  const handleBlindTestClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    if (event.altKey) {
      setOpenSourceAliasEnabled(prev => {
        const next = !prev;
        if (next) {
          setBlindTestEnabled(false);
        }
        return next;
      });
      return;
    }
    setBlindTestEnabled(prev => {
      const next = !prev;
      if (next) {
        setOpenSourceAliasEnabled(false);
      }
      return next;
    });
  }, []);

  const mapModelOptions = useCallback(<T extends { value: string; label: string }>(options: ReadonlyArray<T>) => (
    applyBlindTestMode(
      applyOpenSourceAliasMode(options, openSourceAliasEnabled),
      blindTestMapping,
      blindTestEnabled,
    )
  ), [blindTestEnabled, blindTestMapping, openSourceAliasEnabled]);

  return {
    blindTestEnabled,
    openSourceAliasEnabled,
    handleBlindTestClick,
    mapModelOptions,
    blindTestMapping, // Stable Map identity; mutated in place by applyBlindTestMode.
  };
}
