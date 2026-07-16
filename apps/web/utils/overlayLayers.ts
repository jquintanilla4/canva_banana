export const OVERLAY_LAYER_CLASS_NAMES = {
  appBar: 'z-20',
  floatingPanel: 'z-40',
  anchoredPopover: 'z-[45]', // Keeps detached menus above panels but below blocking dialogs.
  blockingModal: 'z-50',
} as const;
