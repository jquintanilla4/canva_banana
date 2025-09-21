import React from 'react';
import { Tool, InpaintMode } from '../types';
import { SelectionIcon, PanIcon, AnnotateIcon, InpaintIcon, ClearIcon, UndoIcon, RedoIcon, DownloadIcon, DeleteIcon, FreeSelectionIcon, NoteIcon } from './Icons';

interface ToolbarProps {
  activeTool: Tool;
  onToolChange: (tool: Tool) => void;
  brushSize: number;
  onBrushSizeChange: (size: number) => void;
  brushColor: string;
  onBrushColorChange: (color: string) => void;
  onClear: () => void;
  onUploadClick: () => void;
  inpaintMode: InpaintMode;
  onInpaintModeChange: (mode: InpaintMode) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onDownload: () => void;
  isImageSelected: boolean;
  isObjectSelected: boolean;
  onDelete: () => void;
}

const ToolButton: React.FC<{
  label: string;
  isActive: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}> = ({ label, isActive, onClick, children, disabled }) => (
  <button
    onClick={onClick}
    className={`p-2 rounded-md transition-colors duration-200 ${
      isActive ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600'
    } disabled:opacity-50 disabled:cursor-not-allowed`}
    title={label}
    disabled={disabled}
  >
    {children}
  </button>
);

const ModeButton: React.FC<{
  label: string;
  isActive: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ label, isActive, onClick, children }) => (
  <button
    onClick={onClick}
    className={`px-3 py-1 text-xs rounded-md transition-colors duration-200 ${
      isActive ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600'
    }`}
    title={label}
  >
    {children}
  </button>
);


export const Toolbar: React.FC<ToolbarProps> = ({
  activeTool,
  onToolChange,
  brushSize,
  onBrushSizeChange,
  brushColor,
  onBrushColorChange,
  onClear,
  onUploadClick,
  inpaintMode,
  onInpaintModeChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onDownload,
  isImageSelected,
  isObjectSelected,
  onDelete,
}) => {
  return (
    <header className="absolute top-0 left-1/2 -translate-x-1/2 z-10 mt-4 p-2 bg-gray-900/70 backdrop-blur-sm rounded-lg shadow-xl flex items-center space-x-4">
      <div className="flex items-center space-x-2 border-r border-gray-600 pr-4">
        <ToolButton label="Select (V)" isActive={activeTool === Tool.SELECTION} onClick={() => onToolChange(Tool.SELECTION)}>
          <SelectionIcon className="w-5 h-5" />
        </ToolButton>
        <ToolButton label="Free Select (F)" isActive={activeTool === Tool.FREE_SELECTION} onClick={() => onToolChange(Tool.FREE_SELECTION)}>
          <FreeSelectionIcon className="w-5 h-5" />
        </ToolButton>
        <ToolButton label="Pan (H)" isActive={activeTool === Tool.PAN} onClick={() => onToolChange(Tool.PAN)}>
          <PanIcon className="w-5 h-5" />
        </ToolButton>
         <ToolButton label="Note (N)" isActive={activeTool === Tool.NOTE} onClick={() => onToolChange(Tool.NOTE)}>
          <NoteIcon className="w-5 h-5" />
        </ToolButton>
        <ToolButton label="Annotate (B)" isActive={activeTool === Tool.ANNOTATE} onClick={() => onToolChange(Tool.ANNOTATE)}>
          <AnnotateIcon className="w-5 h-5" />
        </ToolButton>
        <ToolButton label="Inpaint (P)" isActive={activeTool === Tool.INPAINT} onClick={() => onToolChange(Tool.INPAINT)}>
          <InpaintIcon className="w-5 h-5" />
        </ToolButton>
        <button
          onClick={onClear}
          className="p-2 bg-red-600 hover:bg-red-500 rounded-md transition-colors"
          title="Clear Annotations & Masks"
        >
          <ClearIcon className="w-5 h-5" />
        </button>
        {activeTool === Tool.INPAINT && (
            <div className="flex items-center space-x-1 pl-2 border-l border-gray-700">
                <ModeButton label="Strict Mode" isActive={inpaintMode === 'STRICT'} onClick={() => onInpaintModeChange('STRICT')}>
                    S
                </ModeButton>
                <ModeButton label="Creative Mode" isActive={inpaintMode === 'CREATIVE'} onClick={() => onInpaintModeChange('CREATIVE')}>
                    C
                </ModeButton>
            </div>
        )}
      </div>

      <div className="flex items-center space-x-2 border-r border-gray-600 pr-4">
          <ToolButton label="Undo" onClick={onUndo} disabled={!canUndo} isActive={false}>
              <UndoIcon className="w-5 h-5" />
          </ToolButton>
          <ToolButton label="Redo" onClick={onRedo} disabled={!canRedo} isActive={false}>
              <RedoIcon className="w-5 h-5" />
          </ToolButton>
      </div>

      {(activeTool === Tool.ANNOTATE || activeTool === Tool.INPAINT) && (
        <div className="flex items-center space-x-4 border-r border-gray-600 pr-4">
          <div className="flex items-center space-x-2">
            <label htmlFor="brushSize" className="text-xs text-gray-300">Size</label>
            <input
              id="brushSize"
              type="range"
              min="1"
              max="100"
              value={brushSize}
              onChange={(e) => onBrushSizeChange(Number(e.target.value))}
              className="w-24 accent-blue-500"
            />
          </div>
          {activeTool === Tool.ANNOTATE && (
            <div className="flex items-center space-x-2">
              <label htmlFor="brushColor" className="text-xs text-gray-300">Color</label>
              <input
                id="brushColor"
                type="color"
                value={brushColor}
                onChange={(e) => onBrushColorChange(e.target.value)}
                className="w-8 h-8 p-0 border-none rounded-md bg-transparent cursor-pointer"
              />
            </div>
          )}
        </div>
      )}
      
      <div className="flex items-center space-x-2">
        <button onClick={onUploadClick} className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-500 rounded-md transition-colors">
          Upload Image
        </button>
        <ToolButton label="Download Selected Image" onClick={onDownload} disabled={!isImageSelected} isActive={false}>
          <DownloadIcon className="w-5 h-5" />
        </ToolButton>
        <button
          onClick={onDelete}
          disabled={!isObjectSelected}
          className="p-2 rounded-md transition-colors duration-200 bg-red-600 hover:bg-red-500 disabled:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Delete Selected Object (Delete/Backspace)"
        >
          <DeleteIcon className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
};
