import React from 'react';

type ImageResizeToastProps = {
  width: string;
  height: string;
  onWidthChange: (value: string) => void;
  onHeightChange: (value: string) => void;
  keepAspect: boolean;
  onToggleKeepAspect: (value: boolean) => void;
  isProcessing?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export const ImageResizeToast: React.FC<ImageResizeToastProps> = ({
  width,
  height,
  onWidthChange,
  onHeightChange,
  keepAspect,
  onToggleKeepAspect,
  isProcessing = false,
  onCancel,
  onConfirm,
}) => {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onConfirm();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-4 py-3 rounded-md shadow-lg z-30 w-72 border border-gray-700">
      <p className="text-sm font-semibold mb-3">Resize image</p>
      <div className="space-y-2">
        <label className="flex items-center space-x-2 text-xs text-gray-300" htmlFor="resize-width">
          <span className="w-14">Width</span>
          <input
            id="resize-width"
            type="number"
            min="1"
            className="flex-1 rounded-sm bg-gray-800 border border-gray-700 px-2 py-1 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={width}
            onChange={(e) => onWidthChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="px"
            disabled={isProcessing}
          />
        </label>
        <label className="flex items-center space-x-2 text-xs text-gray-300" htmlFor="resize-height">
          <span className="w-14">Height</span>
          <input
            id="resize-height"
            type="number"
            min="1"
            className="flex-1 rounded-sm bg-gray-800 border border-gray-700 px-2 py-1 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={height}
            onChange={(e) => onHeightChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="px"
            disabled={isProcessing}
          />
        </label>
        <label className="flex items-center space-x-2 text-xs text-gray-300 select-none">
          <input
            type="checkbox"
            checked={keepAspect}
            onChange={(e) => onToggleKeepAspect(e.target.checked)}
            className="h-4 w-4 accent-blue-500"
            disabled={isProcessing}
          />
          <span>Keep aspect ratio</span>
        </label>
      </div>
      <div className="flex justify-end space-x-2 mt-3">
        <button
          onClick={onCancel}
          className="px-3 py-1 rounded-md bg-gray-700 hover:bg-gray-600 text-sm"
          disabled={isProcessing}
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="px-3 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-sm font-semibold disabled:opacity-60"
          disabled={isProcessing}
        >
          {isProcessing ? 'Working…' : 'OK'}
        </button>
      </div>
    </div>
  );
};
