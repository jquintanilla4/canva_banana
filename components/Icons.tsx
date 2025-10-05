import React from 'react';
import { FaMousePointer, FaHandPaper, FaPencilAlt, FaMagic, FaUndo, FaRedo, FaDownload, FaTrash, FaExpandAlt, FaStickyNote, FaArrowUp, FaArrowDown, FaEraser, FaCropAlt, FaCheck, FaTimes, FaCopy, FaPaintBrush, FaChevronDown } from 'react-icons/fa';
import { IoNuclear } from 'react-icons/io5';
import { RxCursorArrow } from 'react-icons/rx';
import type { IconBaseProps } from 'react-icons';

// Extend IconBaseProps to include className
interface IconProps extends IconBaseProps {
  className?: string;
}

export const SelectionIcon = FaMousePointer as React.FC<IconProps>;
export const PanIcon = FaHandPaper as React.FC<IconProps>;
export const FreeSelectionIcon = RxCursorArrow as React.FC<IconProps>;
export const AnnotateIcon = FaPencilAlt as React.FC<IconProps>;
export const InpaintIcon = FaMagic as React.FC<IconProps>;
export const EraseIcon = FaEraser as React.FC<IconProps>;
export const NoteIcon = FaStickyNote as React.FC<IconProps>;
export const BrushIcon = FaPaintBrush as React.FC<IconProps>;
export const CropIcon = FaCropAlt as React.FC<IconProps>;
export const ClearIcon = IoNuclear as React.FC<IconProps>;
export const UndoIcon = FaUndo as React.FC<IconProps>;
export const RedoIcon = FaRedo as React.FC<IconProps>;
export const DownloadIcon = FaDownload as React.FC<IconProps>;
export const DeleteIcon = FaTrash as React.FC<IconProps>;
export const ZoomToFitIcon = FaExpandAlt as React.FC<IconProps>;
export const LayerUpIcon = FaArrowUp as React.FC<IconProps>;
export const LayerDownIcon = FaArrowDown as React.FC<IconProps>;
export const ConfirmIcon = FaCheck as React.FC<IconProps>;
export const CancelIcon = FaTimes as React.FC<IconProps>;
export const CopyIcon = FaCopy as React.FC<IconProps>;
export const ChevronDownIcon = FaChevronDown as React.FC<IconProps>;