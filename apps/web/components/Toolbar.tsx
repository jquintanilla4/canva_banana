import React, { useEffect, useRef, useState } from "react";
import { Tool, AppMode } from "../types";
import {
  SelectionIcon,
  PanIcon,
  ClearIcon,
  UndoIcon,
  RedoIcon,
  DownloadIcon,
  DeleteIcon,
  FreeSelectionIcon,
  NoteIcon,
  EraseIcon,
  BrushIcon,
  RemoveBackgroundIcon,
  UploadIcon,
  ResizeIcon,
  MicrophoneIcon,
  StopIcon,
  CameraSettingsIcon,
  VideoPromptAreaIcon,
} from "./Icons";
import { MAX_STROKE_SIZE, MIN_STROKE_SIZE } from "./canvas/constants";
import { CameraSettingsPopover } from "./CameraSettingsPopover";
import { Tooltip } from "./Tooltip";
import {
  hasCameraSettings,
  type CameraSettingsSelection,
} from "../utils/cameraSettings";
import { KEYBOARD_SHORTCUT_LABELS } from "../utils/keyboardShortcutLabels";

interface ToolbarProps {
  activeTool: Tool;
  onToolChange: (tool: Tool) => void;
  isVideoPromptAreaToolEnabled: boolean;
  appMode: AppMode;
  onModeChange: (mode: AppMode) => void;
  brushSize: number;
  eraserSize: number;
  onBrushSizeChange: (size: number) => void;
  onEraserSizeChange: (size: number) => void;
  brushColor: string;
  onBrushColorChange: (color: string) => void;
  onClear: () => void;
  hasClearablePaths: boolean;
  onUploadClick: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onDownload: () => void;
  isImageSelected: boolean;
  isObjectSelected: boolean;
  onDelete: () => void;
  onRemoveBackground: () => void;
  isBackgroundRemovalDisabled: boolean;
  isBackgroundRemovalLoading: boolean;
  onResize: () => void;
  isResizeDisabled: boolean;
  isAnnotateModeDisabled?: boolean;
  isRecording: boolean;
  onRecordToggle: () => void;
  cameraSettings: CameraSettingsSelection;
  onCameraSettingsChange: (selection: CameraSettingsSelection) => void;
  cameraSettingsEnabled: boolean;
}

const ToolButton: React.FC<{
  label: string;
  shortcut?: string;
  detail?: string;
  isActive: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  activeClassName?: string;
}> = ({ label, shortcut, detail, isActive, onClick, children, disabled, activeClassName }) => {
  const accessibleLabel = `${label}${shortcut ? ` (${shortcut})` : ""}${detail ? ` • ${detail}` : ""}`;

  return (
    <Tooltip label={label} shortcut={shortcut} detail={detail}>
      <button
        onClick={onClick}
        className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors duration-200 ${
          isActive
            ? (activeClassName ?? "bg-blue-600 text-white")
            : "bg-gray-700 hover:bg-gray-600"
        } disabled:opacity-50 disabled:cursor-not-allowed`}
        aria-label={accessibleLabel}
        disabled={disabled}
      >
        {children}
      </button>
    </Tooltip>
  );
};

const ModeButton: React.FC<{
  label: string;
  isActive: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  showHintLine?: boolean;
}> = ({
  label,
  isActive,
  onClick,
  children,
  disabled,
  showHintLine = false,
}) => (
  <Tooltip label={label}>
    <button
      onClick={onClick}
      className={`relative flex h-8 items-center px-3 text-sm font-semibold rounded-md transition-colors duration-200 ${
        isActive ? "bg-blue-600 text-white" : "bg-gray-700 hover:bg-gray-600"
      } disabled:opacity-50 disabled:cursor-not-allowed`}
      disabled={disabled}
    >
      {children}
      {showHintLine && (
        <span className="pointer-events-none absolute left-1/2 top-full mt-1 h-0.5 w-5 -translate-x-1/2 rounded-full bg-white/80" />
      )}
    </button>
  </Tooltip>
);

export const Toolbar: React.FC<ToolbarProps> = ({
  activeTool,
  onToolChange,
  isVideoPromptAreaToolEnabled,
  appMode,
  onModeChange,
  brushSize,
  eraserSize,
  onBrushSizeChange,
  onEraserSizeChange,
  brushColor,
  onBrushColorChange,
  onClear,
  hasClearablePaths,
  onUploadClick,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onDownload,
  isImageSelected,
  isObjectSelected,
  onDelete,
  onRemoveBackground,
  isBackgroundRemovalDisabled,
  isBackgroundRemovalLoading,
  onResize,
  isResizeDisabled,
  isAnnotateModeDisabled = false,
  isRecording,
  onRecordToggle,
  cameraSettings,
  onCameraSettingsChange,
  cameraSettingsEnabled,
}) => {
  // Main control bar: switches modes/tools and exposes canvas actions (undo, clear, upload, background removal).
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
  const closeTimeoutRef = useRef<number | null>(null);
  const isBrushToolActive = activeTool === Tool.BRUSH;
  const isEraserToolActive = activeTool === Tool.ERASE;
  const isCanvasMode = appMode === "CANVAS";
  const strokeSize = isEraserToolActive ? eraserSize : brushSize;
  const handleStrokeSizeChange = (value: number) => {
    if (isEraserToolActive) {
      onEraserSizeChange(value);
    } else {
      onBrushSizeChange(value);
    }
  };
  const inactiveMode = isCanvasMode ? "ANNOTATE" : "CANVAS";
  const inactiveModeLabel = isCanvasMode ? "Annotate" : "Canvas";
  const inactiveModeTitle = isCanvasMode ? "Annotate Mode" : "Canvas Mode";
  const isInactiveModeDisabled = isCanvasMode ? isAnnotateModeDisabled : false;
  const activeModeLabel = isCanvasMode ? "Canvas" : "Annotate";
  const activeModeTitle = isCanvasMode ? "Canvas Mode" : "Annotate Mode";
  const videoPromptAreaToolDetail = isVideoPromptAreaToolEnabled
    ? undefined
    : "Switch to a video model to create video prompt areas";
  const modeMenuVisibility = isModeMenuOpen
    ? "opacity-100 pointer-events-auto"
    : "opacity-0 pointer-events-none";
  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };
  const scheduleMenuClose = () => {
    clearCloseTimeout();
    closeTimeoutRef.current = window.setTimeout(() => {
      setIsModeMenuOpen(false);
      closeTimeoutRef.current = null;
    }, 3000);
  };
  const handleModeMenuOpen = () => {
    clearCloseTimeout();
    setIsModeMenuOpen(true);
  };
  const [isCameraPanelOpen, setIsCameraPanelOpen] = useState(false);
  const cameraPanelRef = useRef<HTMLDivElement>(null);
  const isCameraSettingsActive = hasCameraSettings(cameraSettings);

  useEffect(() => {
    if (!isCameraPanelOpen) {
      return;
    }

    const handleMouseDown = (event: MouseEvent) => {
      if (
        cameraPanelRef.current &&
        !cameraPanelRef.current.contains(event.target as Node)
      ) {
        setIsCameraPanelOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsCameraPanelOpen(false);
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isCameraPanelOpen]);

  useEffect(() => {
    if (!cameraSettingsEnabled && isCameraPanelOpen) {
      setIsCameraPanelOpen(false);
    }
  }, [cameraSettingsEnabled, isCameraPanelOpen]);
  const handleModeChange = (mode: AppMode) => {
    onModeChange(mode);
    setIsModeMenuOpen(false);
  };

  useEffect(() => () => clearCloseTimeout(), []);

  return (
    <header className="pointer-events-auto flex h-12 items-center space-x-4 rounded-lg bg-gray-900/70 px-3 py-2 shadow-xl backdrop-blur-sm">
      <div className="flex h-full items-center border-r border-gray-600 pr-4">
        <div
          className="relative flex h-full items-center"
          onMouseEnter={handleModeMenuOpen}
          onMouseLeave={scheduleMenuClose}
        >
          <ModeButton
            label={activeModeTitle}
            isActive
            onClick={() => {
              handleModeMenuOpen();
              scheduleMenuClose();
            }}
            showHintLine
          >
            {activeModeLabel}
          </ModeButton>
          <div
            className={`absolute left-1/2 top-full z-20 mt-3 w-max -translate-x-1/2 flex flex-col items-center space-y-3 transition-opacity duration-150 ${modeMenuVisibility}`}
            onMouseEnter={handleModeMenuOpen}
            onMouseLeave={scheduleMenuClose}
          >
            <ModeButton
              label={inactiveModeTitle}
              isActive={false}
              onClick={() => handleModeChange(inactiveMode)}
              disabled={isInactiveModeDisabled}
            >
              {inactiveModeLabel}
            </ModeButton>
          </div>
        </div>
      </div>

      <div className="flex h-full items-center space-x-2 border-r border-gray-600 pr-4">
        <ToolButton
          label="Select"
          shortcut={KEYBOARD_SHORTCUT_LABELS.select}
          isActive={activeTool === Tool.SELECTION}
          onClick={() => onToolChange(Tool.SELECTION)}
        >
          <SelectionIcon className="w-4 h-4" />
        </ToolButton>
        <ToolButton
          label="Free Select"
          shortcut={KEYBOARD_SHORTCUT_LABELS.freeSelect}
          isActive={activeTool === Tool.FREE_SELECTION}
          onClick={() => onToolChange(Tool.FREE_SELECTION)}
        >
          <FreeSelectionIcon className="w-4 h-4" />
        </ToolButton>
        <ToolButton
          label="Pan"
          shortcut={KEYBOARD_SHORTCUT_LABELS.pan}
          isActive={activeTool === Tool.PAN}
          onClick={() => onToolChange(Tool.PAN)}
        >
          <PanIcon className="w-4 h-4" />
        </ToolButton>
        <ToolButton
          label="Note"
          shortcut={KEYBOARD_SHORTCUT_LABELS.note}
          isActive={activeTool === Tool.NOTE}
          onClick={() => onToolChange(Tool.NOTE)}
        >
          <NoteIcon className="w-4 h-4" />
        </ToolButton>
        <Tooltip label={isRecording ? "Stop Recording" : "Record Audio"} shortcut={KEYBOARD_SHORTCUT_LABELS.recordAudio}>
          <button
            onClick={onRecordToggle}
            className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors duration-200 ${
              isRecording
                ? "bg-red-600 animate-pulse text-white"
                : "bg-gray-700 hover:bg-gray-600 text-white"
            }`}
            aria-label={isRecording ? `Stop Recording (${KEYBOARD_SHORTCUT_LABELS.recordAudio})` : `Record Audio (${KEYBOARD_SHORTCUT_LABELS.recordAudio})`}
          >
            {isRecording ? (
              <StopIcon className="w-4 h-4" />
            ) : (
              <MicrophoneIcon className="w-4 h-4" />
            )}
          </button>
        </Tooltip>
        <ToolButton
          label="Video Prompt Area"
          shortcut={KEYBOARD_SHORTCUT_LABELS.videoPromptArea}
          detail={videoPromptAreaToolDetail}
          isActive={activeTool === Tool.VIDEO_PROMPT_AREA}
          onClick={() => onToolChange(Tool.VIDEO_PROMPT_AREA)}
          disabled={!isVideoPromptAreaToolEnabled}
        >
          <VideoPromptAreaIcon className="w-5 h-5" />
        </ToolButton>
        <div ref={cameraPanelRef} className="flex h-full items-center">
          <ToolButton
            label="Camera Settings"
            onClick={() => setIsCameraPanelOpen((prev) => !prev)}
            isActive={
              cameraSettingsEnabled &&
              (isCameraPanelOpen || isCameraSettingsActive)
            }
            disabled={!cameraSettingsEnabled}
            activeClassName={
              isCameraPanelOpen
                ? "bg-amber-500 text-black"
                : "bg-amber-500 text-white"
            }
          >
            <span className="relative flex items-center justify-center">
              <CameraSettingsIcon className="h-5 w-5" />
            </span>
          </ToolButton>
          <CameraSettingsPopover
            isOpen={isCameraPanelOpen}
            selection={cameraSettings}
            onApply={onCameraSettingsChange}
            onClose={() => setIsCameraPanelOpen(false)}
          />
        </div>
        <ToolButton
          label="Brush"
          shortcut={KEYBOARD_SHORTCUT_LABELS.brush}
          isActive={activeTool === Tool.BRUSH}
          onClick={() => onToolChange(Tool.BRUSH)}
          disabled={appMode === "CANVAS"}
        >
          <BrushIcon className="w-4 h-4" />
        </ToolButton>
        <ToolButton
          label="Erase"
          shortcut={KEYBOARD_SHORTCUT_LABELS.erase}
          detail={appMode === "CANVAS" ? "Only available in Annotate mode" : undefined}
          isActive={activeTool === Tool.ERASE}
          onClick={() => onToolChange(Tool.ERASE)}
          disabled={appMode === "CANVAS"}
        >
          <EraseIcon className="w-4 h-4" />
        </ToolButton>
        <Tooltip label="Clear Markings">
          <button
            onClick={onClear}
            disabled={!hasClearablePaths}
            className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors duration-200 ${
              hasClearablePaths
                ? "bg-[#E1B927] hover:bg-[#d4a51f] text-black"
                : "bg-[#222937] text-white"
            } disabled:cursor-not-allowed`}
            aria-label="Clear Markings"
          >
            <ClearIcon className="w-[1.20rem] h-[1.20rem]" />
          </button>
        </Tooltip>
      </div>

      <div className="flex h-full items-center space-x-2 border-r border-gray-600 pr-4">
        <ToolButton
          label="Undo"
          shortcut={KEYBOARD_SHORTCUT_LABELS.undo}
          onClick={onUndo}
          disabled={!canUndo}
          isActive={false}
        >
          <UndoIcon className="w-4 h-4" />
        </ToolButton>
        <ToolButton
          label="Redo"
          shortcut={KEYBOARD_SHORTCUT_LABELS.redo}
          onClick={onRedo}
          disabled={!canRedo}
          isActive={false}
        >
          <RedoIcon className="w-4 h-4" />
        </ToolButton>
      </div>

      {(isBrushToolActive || isEraserToolActive) && (
        <div className="flex h-full items-center space-x-4 border-r border-gray-600 pr-4">
          <div className="flex h-full items-center space-x-2">
            <label htmlFor="brushSize" className="text-xs text-gray-300">
              Size
            </label>
            <input
              id="brushSize"
              type="range"
              min={MIN_STROKE_SIZE}
              max={MAX_STROKE_SIZE}
              value={strokeSize}
              onChange={(e) => handleStrokeSizeChange(Number(e.target.value))}
              className="w-24 h-2 accent-blue-500"
            />
          </div>
          {isBrushToolActive && appMode === "ANNOTATE" && (
            <div className="flex h-full items-center space-x-2">
              <label htmlFor="brushColor" className="text-xs text-gray-300">
                Color
              </label>
              <input
                id="brushColor"
                type="color"
                value={brushColor}
                onChange={(e) => onBrushColorChange(e.target.value)}
                className="w-8 h-8 p-0 border-none rounded-md bg-transparent cursor-pointer"
                style={{ colorScheme: 'light dark' }}
              />
            </div>
          )}
        </div>
      )}

      <div className="flex h-full items-center space-x-2">
        <Tooltip label="Resize Selected Image">
          <button
            onClick={onResize}
            disabled={isResizeDisabled}
            className="flex h-8 w-8 items-center justify-center rounded-md transition-colors duration-200 bg-gray-700 hover:bg-gray-600 active:bg-blue-600 text-white disabled:bg-gray-700 disabled:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Resize Selected Image"
          >
            <ResizeIcon className="w-4 h-4" />
          </button>
        </Tooltip>
        <Tooltip label="Remove Background">
          <button
            onClick={onRemoveBackground}
            disabled={isBackgroundRemovalDisabled}
            className="flex h-8 w-8 items-center justify-center rounded-md transition-colors duration-200 bg-gray-700 hover:bg-gray-600 active:bg-[#9334EB] text-white disabled:bg-gray-700 disabled:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Remove Background"
          >
            {isBackgroundRemovalLoading ? (
              <svg
                className="h-4 w-4 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : (
              <RemoveBackgroundIcon className="w-4 h-4" />
            )}
          </button>
        </Tooltip>
        <Tooltip label="Upload Image">
          <button
            onClick={onUploadClick}
            className="flex h-8 w-8 items-center justify-center rounded-md transition-colors duration-200 bg-gray-700 hover:bg-gray-600 active:bg-[#2663EB] text-white"
            aria-label="Upload Image"
          >
            <UploadIcon className="w-4 h-4" />
          </button>
        </Tooltip>
        <ToolButton
          label="Download Selected Image"
          onClick={onDownload}
          disabled={!isImageSelected}
          isActive={false}
        >
          <DownloadIcon className="w-4 h-4" />
        </ToolButton>
        <Tooltip label="Delete Selected Object" shortcut={KEYBOARD_SHORTCUT_LABELS.deleteObject}>
          <button
            onClick={onDelete}
            disabled={!isObjectSelected}
            className="flex h-8 w-8 items-center justify-center rounded-md transition-colors duration-200 bg-red-600 hover:bg-red-500 disabled:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={`Delete Selected Object (${KEYBOARD_SHORTCUT_LABELS.deleteObject})`}
          >
            <DeleteIcon className="w-4 h-4" />
          </button>
        </Tooltip>
      </div>
    </header>
  );
};
