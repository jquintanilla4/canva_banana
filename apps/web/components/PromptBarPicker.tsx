import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDownIcon } from './Icons';
import { getIntrinsicElementSize, getViewportMenuPosition, type VerticalMenuPlacement } from '../utils/viewportMenuPosition';
import { useAnchoredPortalTracking } from '../hooks/useAnchoredPortalTracking';
import { OVERLAY_LAYER_CLASS_NAMES } from '../utils/overlayLayers';
import { CANVAS_INTERACTION_BOUNDARY_PROPS } from '../utils/canvasInteractionBoundary';

export interface PromptBarPickerOption {
  value: string;
  label: string;
  highlightColor?: string;
  tooltip?: string;
  disabled?: boolean;
}

interface PromptBarPickerProps {
  id: string;
  ariaLabel: string;
  options: ReadonlyArray<PromptBarPickerOption>;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  displayLabel?: string;
  title?: string;
}

interface PickerPosition {
  placement: VerticalMenuPlacement;
  left: number;
  top: number;
  minWidth: number;
  maxWidth: number;
  maxHeight: number;
}

type PickerActivationSource = 'automatic' | 'keyboard' | 'pointer'; // Distinguishes visual fallback from deliberate option activation.

const PICKER_GAP_PX = 6; // Leaves a small gap above the trigger.
const PICKER_VIEWPORT_MARGIN_PX = 8; // Keeps the menu inside the app window.
const PICKER_MIN_WIDTH_PX = 160; // Gives short-value menus enough reading room.
const PICKER_TYPEAHEAD_RESET_MS = 500; // Starts a new search after a short typing pause.

const findEnabledIndex = (
  options: ReadonlyArray<PromptBarPickerOption>,
  startIndex: number,
  direction: 1 | -1,
): number => {
  if (options.length === 0) {
    return -1;
  }

  for (let step = 1; step <= options.length; step += 1) {
    const index = (startIndex + (step * direction) + options.length) % options.length;
    if (!options[index]?.disabled) {
      return index;
    }
  }

  return -1;
};

const findTypeaheadIndex = (
  options: ReadonlyArray<PromptBarPickerOption>,
  query: string,
  startIndex: number,
): number => {
  const normalizedQuery = query.toLocaleLowerCase();
  for (let step = 1; step <= options.length; step += 1) {
    const index = (startIndex + step + options.length) % options.length;
    const option = options[index];
    if (!option?.disabled && option.label.toLocaleLowerCase().startsWith(normalizedQuery)) {
      return index;
    }
  }
  return -1;
};

const hasEnabledTypeaheadPrefix = (
  options: ReadonlyArray<PromptBarPickerOption>,
  query: string,
): boolean => {
  const normalizedQuery = query.toLocaleLowerCase();
  return options.some(option => (
    !option.disabled && option.label.toLocaleLowerCase().startsWith(normalizedQuery)
  ));
}; // Lets typeahead separators continue only while they can reach an option.

export const PromptBarPicker: React.FC<PromptBarPickerProps> = ({
  id,
  ariaLabel,
  options,
  value,
  onChange,
  disabled,
  displayLabel,
  title,
}) => {
  const listboxId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const typeaheadRef = useRef({ buffer: '', updatedAt: 0, hasMatch: false }); // Tracks whether Space can continue a matched multi-word search.
  const activationSourceRef = useRef<PickerActivationSource>('automatic');
  const [open, setOpen] = useState(false);
  const [activeValue, setActiveValue] = useState<string | null>(null); // Keeps the highlighted option stable when controlled options reorder.
  const [position, setPosition] = useState<PickerPosition | null>(null);
  const selectedIndex = options.findIndex(option => option.value === value);
  const activeIndex = activeValue === null ? -1 : options.findIndex(option => option.value === activeValue);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const selectedLabel = displayLabel ?? selectedOption?.label ?? value;
  const selectedValueLabel = selectedOption?.label ?? value;
  const selectedColor = displayLabel ? undefined : selectedOption?.highlightColor;
  const canRenderPortal = typeof document !== 'undefined';
  const accessibleLabelId = `${listboxId}-label`;
  const accessibleValueId = `${listboxId}-value`;

  const resetTypeahead = useCallback(() => {
    typeaheadRef.current = { buffer: '', updatedAt: 0, hasMatch: false };
  }, []);

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    setPosition(null);
    setActiveValue(null);
    resetTypeahead();
    activationSourceRef.current = 'automatic';
    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  }, [resetTypeahead]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const listbox = listboxRef.current;
    if (!trigger || !listbox) {
      return;
    }

    const triggerRect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const intrinsicSize = getIntrinsicElementSize(listbox);
    const menuPosition = getViewportMenuPosition({
      anchorRect: triggerRect,
      menuWidth: Math.max(triggerRect.width, PICKER_MIN_WIDTH_PX, intrinsicSize.width),
      menuHeight: intrinsicSize.height,
      viewportWidth,
      viewportHeight,
      gapPx: PICKER_GAP_PX,
      marginPx: PICKER_VIEWPORT_MARGIN_PX,
      preferredPlacement: 'top',
    });
    const nextPosition = {
      ...menuPosition,
      minWidth: Math.min(Math.max(triggerRect.width, PICKER_MIN_WIDTH_PX), menuPosition.maxWidth),
    };

    setPosition(previous => (
      previous
      && previous.placement === nextPosition.placement
      && previous.left === nextPosition.left
      && previous.top === nextPosition.top
      && previous.minWidth === nextPosition.minWidth
      && previous.maxWidth === nextPosition.maxWidth
      && previous.maxHeight === nextPosition.maxHeight
        ? previous
        : nextPosition
    ));
  }, []);

  const openPicker = useCallback((
    activationSource: PickerActivationSource = 'automatic',
    navigationDirection?: 1 | -1,
  ) => {
    if (disabled || options.length === 0) {
      return;
    }
    const fallbackStartIndex = navigationDirection === undefined
      ? -1
      : selectedIndex >= 0 ? selectedIndex : navigationDirection === -1 ? 0 : -1; // Only keyboard opening follows the current value and arrow direction.
    const initialIndex = selectedIndex >= 0 && !options[selectedIndex]?.disabled
      ? selectedIndex
      : findEnabledIndex(options, fallbackStartIndex, navigationDirection ?? 1);
    activationSourceRef.current = activationSource;
    setActiveValue(options[initialIndex]?.value ?? null);
    setOpen(true);
  }, [disabled, options, selectedIndex]);

  const highlightBoundaryOption = useCallback((boundary: 'first' | 'last') => {
    const direction = boundary === 'first' ? 1 : -1;
    const startIndex = boundary === 'first' ? -1 : 0;
    const boundaryIndex = findEnabledIndex(options, startIndex, direction);
    if (boundaryIndex < 0) {
      return;
    }
    activationSourceRef.current = 'keyboard';
    setActiveValue(options[boundaryIndex]?.value ?? null);
    setOpen(true);
  }, [options]); // Uses one deterministic path for open and closed first/last navigation.

  const selectOption = useCallback((index: number, restoreFocus = true) => {
    const option = options[index];
    if (!option || option.disabled) {
      return;
    }
    if (option.value !== value) {
      onChange(option.value);
    }
    close(restoreFocus);
  }, [close, onChange, options, value]);

  useLayoutEffect(() => {
    if (open && activeValue !== null && (!options[activeIndex] || options[activeIndex]?.disabled)) {
      close(); // Avoids committing a fallback when the active controlled option disappears or becomes disabled.
    }
  }, [activeIndex, activeValue, close, open, options]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const trigger = triggerRef.current;
    const listbox = listboxRef.current;
    if (!trigger || !listbox) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!trigger.contains(target) && !listbox.contains(target)) {
        close();
      }
    };
    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target as Node;
      if (!trigger.contains(target) && !listbox.contains(target)) {
        close(); // Programmatic focus changes must dismiss the detached menu.
      }
    };
    document.addEventListener('pointerdown', handlePointerDown, true); // Capture outside presses before canvas controls stop propagation.
    document.addEventListener('focusin', handleFocusIn);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('focusin', handleFocusIn);
    };
  }, [close, open]);

  useAnchoredPortalTracking({
    active: open,
    anchorRef: triggerRef,
    portalRef: listboxRef,
    updatePosition,
  });

  useEffect(() => {
    if (!open || activeIndex < 0) {
      return;
    }
    document.getElementById(`${listboxId}-option-${activeIndex}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, listboxId, open]);

  useEffect(() => {
    if (disabled && open) {
      close();
    }
  }, [close, disabled, open]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const isGenerateShortcut = event.key === 'Enter' && (event.metaKey || event.ctrlKey); // Generate remains an app-level shortcut.
    if (isGenerateShortcut) {
      event.preventDefault(); // Prevents button activation while Generate handles the bubbling shortcut.
      return;
    }
    const now = Date.now();
    const previousTypeahead = typeaheadRef.current;
    const canContinueTypeaheadWithSpace = event.key === ' '
      && activationSourceRef.current === 'keyboard'
      && previousTypeahead.hasMatch
      && previousTypeahead.buffer.length > 0
      && now - previousTypeahead.updatedAt <= PICKER_TYPEAHEAD_RESET_MS
      && hasEnabledTypeaheadPrefix(options, `${previousTypeahead.buffer} `); // Continues only a reachable multi-word search.
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation(); // Keeps picker dismissal from clearing canvas selections.
      close(true);
      return;
    }
    if (event.key === 'Tab' && open) {
      event.stopPropagation(); // The picker owns its open-state Tab commit or dismissal.
      if (activationSourceRef.current === 'keyboard' && activeIndex >= 0) {
        selectOption(activeIndex, false); // Commits the keyboard choice before normal Tab navigation.
      } else {
        close();
      }
      return;
    }
    if (event.key === 'Enter' || (event.key === ' ' && !canContinueTypeaheadWithSpace)) {
      event.preventDefault();
      event.stopPropagation(); // Prevents picker activation from reaching app shortcuts.
      if (open) {
        const activeOption = options[activeIndex];
        const canCommitActiveOption = activationSourceRef.current !== 'automatic' || activeOption?.value === value; // Commits deliberate pointer or keyboard activation only.
        if (canCommitActiveOption) {
          selectOption(activeIndex);
        } else {
          close();
        }
      } else {
        openPicker();
      }
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation(); // Arrow navigation belongs only to the open picker.
      resetTypeahead(); // Explicit navigation starts a new interaction sequence.
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      if (!open) {
        openPicker('keyboard', direction); // Arrow opening is deliberate navigation, so its active option can commit.
        return;
      }
      activationSourceRef.current = 'keyboard';
      setActiveValue(currentValue => {
        const currentIndex = currentValue === null ? -1 : options.findIndex(option => option.value === currentValue);
        const nextIndex = findEnabledIndex(options, currentIndex, direction);
        return options[nextIndex]?.value ?? null;
      });
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      event.stopPropagation(); // Boundary navigation must not reach parent controls.
      resetTypeahead(); // Boundary navigation ends the current typeahead sequence.
      highlightBoundaryOption(event.key === 'Home' ? 'first' : 'last');
      return;
    }
    if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault(); // Space must never synthesize a button click during typeahead.
      event.stopPropagation(); // Printable keys belong to picker typeahead, even without a match.
      const nextBuffer = now - previousTypeahead.updatedAt <= PICKER_TYPEAHEAD_RESET_MS
        ? `${previousTypeahead.buffer}${event.key}`
        : event.key;
      const normalizedBuffer = nextBuffer.toLocaleLowerCase();
      const repeatedCharacterSearch = normalizedBuffer.split('').every(character => character === normalizedBuffer[0]);
      const query = repeatedCharacterSearch ? normalizedBuffer[0] ?? '' : normalizedBuffer;
      const currentIndex = open ? activeIndex : selectedIndex;
      const currentOption = options[currentIndex];
      const currentOptionMatches = !repeatedCharacterSearch
        && normalizedBuffer.length > 1
        && Boolean(currentOption && !currentOption.disabled && currentOption.label.toLocaleLowerCase().startsWith(query));
      const matchIndex = currentOptionMatches
        ? currentIndex
        : findTypeaheadIndex(options, query, currentIndex);

      typeaheadRef.current = { buffer: nextBuffer, updatedAt: now, hasMatch: matchIndex >= 0 };
      if (matchIndex >= 0) {
        activationSourceRef.current = 'keyboard';
        setActiveValue(options[matchIndex]?.value ?? null);
        setOpen(true); // Printable keys reveal matching options without committing early.
      }
    }
  };

  return (
    <>
      <span id={accessibleLabelId} className="sr-only">{ariaLabel}</span>
      <span id={accessibleValueId} className="sr-only">Current value: {selectedValueLabel}</span>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-labelledby={accessibleLabelId}
        aria-describedby={accessibleValueId}
        aria-controls={open ? listboxId : undefined} // References the listbox only while its portal exists.
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
        disabled={disabled}
        title={title}
        onClick={() => {
          if (open) {
            close();
          } else {
            openPicker();
          }
        }}
        onKeyDown={handleKeyDown}
        className="inline-flex items-center gap-2 whitespace-nowrap rounded-md bg-transparent px-[0.4rem] py-[0.34rem] text-sm text-white focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 disabled:cursor-not-allowed disabled:text-gray-400"
        style={selectedColor ? { color: selectedColor } : undefined}
      >
        <span>{selectedLabel}</span>
        <ChevronDownIcon className="shrink-0 text-white/80" aria-hidden="true" />
      </button>
      {open && canRenderPortal && createPortal(
        <div
          {...CANVAS_INTERACTION_BOUNDARY_PROPS}
          id={listboxId}
          ref={listboxRef}
          role="listbox"
          aria-label={ariaLabel}
          data-placement={position?.placement}
          className={`fixed ${OVERLAY_LAYER_CLASS_NAMES.anchoredPopover} overflow-y-auto rounded-md border border-white/10 bg-gray-950/95 py-1 text-sm text-white shadow-xl shadow-black/35 backdrop-blur`}
          style={{
            left: position?.left ?? 0,
            top: position?.top ?? 0,
            minWidth: position?.minWidth,
            maxWidth: position?.maxWidth,
            maxHeight: position?.maxHeight,
            visibility: position ? 'visible' : 'hidden',
          }}
        >
          {options.map((option, index) => {
            const selected = option.value === value;
            const active = index === activeIndex;
            return (
              <button
                key={option.value}
                id={`${listboxId}-option-${index}`}
                type="button"
                role="option"
                aria-selected={selected}
                aria-disabled={option.disabled || undefined}
                disabled={option.disabled}
                tabIndex={-1}
                title={option.tooltip}
                onMouseDown={event => event.preventDefault()} // Keeps keyboard focus on the combobox trigger.
                onMouseEnter={() => {
                  if (!option.disabled) {
                    activationSourceRef.current = 'pointer';
                    setActiveValue(option.value);
                  }
                }}
                onClick={() => selectOption(index)}
                className={`block w-full whitespace-nowrap px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-40 ${active ? 'bg-white/15' : selected ? 'bg-white/10' : 'hover:bg-white/10'}`}
                style={option.highlightColor ? { color: option.highlightColor } : undefined}
              >
                {option.label}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
};
