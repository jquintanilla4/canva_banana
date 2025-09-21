import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Toolbar } from './components/Toolbar';
import { PromptBar } from './components/PromptBar';
import { Canvas } from './components/Canvas';
import { Tool, Path, CanvasImage, InpaintMode, Point } from './types';
import { generateImageEdit } from './services/geminiService';
import { ZoomToFitIcon } from './components/Icons';

interface ViewToolbarProps {
  onZoomToFit: () => void;
  disabled: boolean;
}

const ViewToolbar: React.FC<ViewToolbarProps> = ({ onZoomToFit, disabled }) => {
  return (
    <div className="absolute bottom-4 right-4 z-10 p-2 bg-gray-900/70 backdrop-blur-sm rounded-lg shadow-xl flex flex-col items-center space-y-2">
      <button
        onClick={onZoomToFit}
        disabled={disabled}
        className="p-2 rounded-md transition-colors duration-200 bg-gray-700 hover:bg-gray-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
        title="Zoom to Fit (.)"
      >
        <ZoomToFitIcon className="w-5 h-5" />
      </button>
    </div>
  );
};

const MAX_HISTORY_SIZE = 30;
const MAX_REFERENCE_IMAGES = 2;

const getStateSignature = (state: { images: CanvasImage[], paths: Path[] }): string => {
  const imageSignature = state.images.map(img => `${img.id},${img.x.toFixed(2)},${img.y.toFixed(2)},${img.width},${img.height}`).join(';');
  const pathSignature = state.paths.map(p => p.points.length).join(',');
  return `${imageSignature}|${pathSignature}`;
};

export default function App() {
  const [tool, setTool] = useState<Tool>(Tool.PAN);
  const [brushSize, setBrushSize] = useState(20);
  const [brushColor, setBrushColor] = useState('#ff0000');
  const [prompt, setPrompt] = useState('');
  const [inpaintMode, setInpaintMode] = useState<InpaintMode>('STRICT');
  
  const [historyState, setHistoryState] = useState<{
    history: { images: CanvasImage[], paths: Path[] }[],
    index: number,
  }>({
    history: [{ images: [], paths: [] }],
    index: 0,
  });

  const { history, index: historyIndex } = historyState;
  const { images, paths } = history[historyIndex];

  const [liveImages, setLiveImages] = useState<CanvasImage[] | null>(null);
  const [livePaths, setLivePaths] = useState<Path[] | null>(null);

  const displayedImages = liveImages ?? images;
  const displayedPaths = livePaths ?? paths;

  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [referenceImageIds, setReferenceImageIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoomToFitTrigger, setZoomToFitTrigger] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const setState = useCallback((updater: (prevState: {images: CanvasImage[], paths: Path[]}) => {images: CanvasImage[], paths: Path[]}) => {
    setHistoryState(currentState => {
      const { history: prevHistory, index: prevIndex } = currentState;
      const prevState = prevHistory[prevIndex];
      const newState = updater(prevState);
      
      if (getStateSignature(newState) === getStateSignature(prevState)) {
          return currentState;
      }

      const newHistory = prevHistory.slice(0, prevIndex + 1);
      newHistory.push(newState);

      if (newHistory.length > MAX_HISTORY_SIZE) {
        newHistory.shift();
      }

      return {
        history: newHistory,
        index: newHistory.length - 1,
      };
    });
  }, []);

  const handleDelete = useCallback(() => {
    if (!selectedImageId) return;

    setState(prevState => ({
      images: prevState.images.filter(img => img.id !== selectedImageId),
      paths: prevState.paths,
    }));
    setSelectedImageId(null);
    setReferenceImageIds([]);
  }, [selectedImageId, setState]);

  const handleZoomToFit = useCallback(() => {
    setZoomToFitTrigger(c => c + 1);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!selectedImageId) {
      setError("Please select an image to edit.");
      return;
    }
    
    const sourceImage = images.find(img => img.id === selectedImageId);
    const referenceImageElements = referenceImageIds
      .map(id => images.find(img => img.id === id)?.element)
      .filter((el): el is HTMLImageElement => !!el);
    
    if (!sourceImage) {
      setError("Selected image not found. Please select another image.");
      return;
    }

    if (!prompt) {
      setError("Please write a prompt to describe your edit.");
      return;
    }

    if (tool !== Tool.SELECTION && tool !== Tool.ANNOTATE && tool !== Tool.INPAINT && tool !== Tool.FREE_SELECTION) {
      setError("Please use the Select, Annotate, or Inpaint tool to generate an image.");
      return;
    }
    
    if ((tool === Tool.ANNOTATE || tool === Tool.INPAINT) && paths.length === 0) {
      setError("Please draw on the selected image before generating.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const translatedPaths = paths.map(path => ({
        ...path,
        points: path.points.map(point => ({
          x: point.x - sourceImage.x,
          y: point.y - sourceImage.y,
        })),
      }));

      const { imageBase64 } = await generateImageEdit({
        prompt,
        image: sourceImage.element,
        tool,
        paths: translatedPaths,
        imageDimensions: { width: sourceImage.width, height: sourceImage.height },
        mimeType: sourceImage.file.type,
        inpaintMode,
        referenceImages: referenceImageElements,
      });

      const newImg = new Image();
      newImg.onload = async () => {
          const blob = await (await fetch(newImg.src)).blob();
          const newFile = new File([blob], "generated_image.png", { type: "image/png" });
          const newCanvasImage: CanvasImage = {
            id: crypto.randomUUID(),
            element: newImg,
            x: sourceImage.x + sourceImage.width + 20, // 20px padding
            y: sourceImage.y,
            width: newImg.width,
            height: newImg.height,
            file: newFile,
          };
          setState(prevState => ({
            images: [...prevState.images, newCanvasImage],
            paths: prevState.paths,
          }));
          setSelectedImageId(newCanvasImage.id);
          setReferenceImageIds([]);
          setTool(Tool.SELECTION);
      }
      newImg.src = `data:image/png;base64,${imageBase64}`;

    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  }, [prompt, tool, paths, images, selectedImageId, referenceImageIds, inpaintMode, setState]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        activeEl instanceof HTMLSelectElement
      ) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'v':
          setTool(Tool.SELECTION);
          break;
        case 'f':
          setTool(Tool.FREE_SELECTION);
          break;
        case 'h':
          setTool(Tool.PAN);
          break;
        case 'b':
          setTool(Tool.ANNOTATE);
          break;
        case 'p':
          setTool(Tool.INPAINT);
          break;
        case 'delete':
        case 'backspace':
          handleDelete();
          break;
        case '.':
          if (images.length > 0) {
            handleZoomToFit();
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleDelete, handleZoomToFit, images]);
  
  useEffect(() => {
    const handleGlobalSubmit = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();

        const isSubmitAllowed =
          !isLoading &&
          !!selectedImageId &&
          prompt.trim().length > 0 &&
          [Tool.SELECTION, Tool.ANNOTATE, Tool.INPAINT, Tool.FREE_SELECTION].includes(tool);
        
        if (isSubmitAllowed) {
          handleGenerate();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalSubmit);
    return () => {
      window.removeEventListener('keydown', handleGlobalSubmit);
    };
  }, [isLoading, selectedImageId, prompt, tool, handleGenerate]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const undo = useCallback(() => {
    if (canUndo) {
      setLiveImages(null);
      setLivePaths(null);
      setHistoryState(prev => ({ ...prev, index: prev.index - 1 }));
    }
  }, [canUndo]);
  
  const redo = useCallback(() => {
    if (canRedo) {
      setLiveImages(null);
      setLivePaths(null);
      setHistoryState(prev => ({ ...prev, index: prev.index + 1 }));
    }
  }, [canRedo]);


  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          setState(prevState => {
            let newX = 0;
            let newY = 0;
            if (prevState.images.length > 0) {
              const lastImage = prevState.images[prevState.images.length - 1];
              newX = lastImage.x + lastImage.width + 20;
              newY = lastImage.y;
            }

            const newCanvasImage: CanvasImage = {
              id: crypto.randomUUID(),
              element: img,
              x: newX,
              y: newY,
              width: img.width,
              height: img.height,
              file: file,
            };
            setSelectedImageId(newCanvasImage.id);
            setReferenceImageIds([]);
            return {
              images: [...prevState.images, newCanvasImage],
              paths: [],
            };
          });
          setTool(Tool.SELECTION);
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
      e.target.value = ''; // Reset file input
    }
  };

  const handleFilesDrop = useCallback((files: FileList, point: Point) => {
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    let lastAddedImageId: string | null = null;
    const newImages: CanvasImage[] = [];
    let imagesProcessed = 0;

    imageFiles.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const newCanvasImage: CanvasImage = {
                    id: crypto.randomUUID(),
                    element: img,
                    // Center the image on the drop point and stagger multiple images
                    x: point.x - (img.width / 2) + (index * 20),
                    y: point.y - (img.height / 2) + (index * 20),
                    width: img.width,
                    height: img.height,
                    file: file,
                };
                newImages.push(newCanvasImage);
                lastAddedImageId = newCanvasImage.id;
                imagesProcessed++;
                
                // When the last image is processed, update the state
                if (imagesProcessed === imageFiles.length) {
                    setState(prevState => ({
                        images: [...prevState.images, ...newImages],
                        paths: [], // Clear paths on new uploads
                    }));
                    setSelectedImageId(lastAddedImageId);
                    setReferenceImageIds([]);
                    setTool(Tool.SELECTION);
                }
            };
            img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
    });
  }, [setState]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };
  
  const handleClear = () => {
      setState(prevState => ({...prevState, paths: [] }));
  }

  const handleCommit = useCallback(() => {
    if (liveImages !== null || livePaths !== null) {
      setState(prevState => ({
        images: liveImages ?? prevState.images,
        paths: livePaths ?? prevState.paths,
      }));
      setLiveImages(null);
      setLivePaths(null);
    }
  }, [liveImages, livePaths, setState]);

  const handleDownload = useCallback(() => {
    if (!selectedImageId) return;
    const imageToDownload = images.find(img => img.id === selectedImageId);
    if (!imageToDownload) return;

    const link = document.createElement('a');
    link.href = imageToDownload.element.src;
    link.download = imageToDownload.file.name || 'download.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [selectedImageId, images]);
  
  const handleImageSelection = useCallback((imageId: string | null, isShiftClick: boolean) => {
    if (!imageId) { // Clicked on canvas background
        setSelectedImageId(null);
        setReferenceImageIds([]);
        return;
    }

    if (isShiftClick) {
        if (selectedImageId && imageId !== selectedImageId) {
            setReferenceImageIds(prevIds => {
                if (prevIds.includes(imageId)) {
                    // Remove if already a reference
                    return prevIds.filter(id => id !== imageId);
                }
                if (prevIds.length < MAX_REFERENCE_IMAGES) {
                    // Add if there's space
                    return [...prevIds, imageId];
                }
                // Do nothing if full
                return prevIds;
            });
        }
    } else {
        // Normal click
        if (selectedImageId !== imageId) {
            // If clicking a new image, make it primary and clear all references.
            setSelectedImageId(imageId);
            setReferenceImageIds([]);
        }
        // If clicking the current primary, do nothing.
    }
  }, [selectedImageId]);

  return (
    <div className="h-screen w-screen bg-gray-800 text-white flex flex-col overflow-hidden">
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
      
      <Toolbar
        activeTool={tool}
        onToolChange={setTool}
        brushSize={brushSize}
        onBrushSizeChange={setBrushSize}
        brushColor={brushColor}
        onBrushColorChange={setBrushColor}
        onClear={handleClear}
        onUploadClick={handleUploadClick}
        inpaintMode={inpaintMode}
        onInpaintModeChange={setInpaintMode}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        onDownload={handleDownload}
        isImageSelected={!!selectedImageId}
        onDelete={handleDelete}
      />
      
      <main className="flex-1 relative">
        <Canvas
          images={displayedImages}
          onImagesChange={setLiveImages}
          tool={tool}
          paths={displayedPaths}
          onPathsChange={setLivePaths}
          brushSize={brushSize}
          brushColor={brushColor}
          selectedImageId={selectedImageId}
          referenceImageIds={referenceImageIds}
          onImageSelect={handleImageSelection}
          onCommit={handleCommit}
          onFilesDrop={handleFilesDrop}
          zoomToFitTrigger={zoomToFitTrigger}
        />
        <ViewToolbar onZoomToFit={handleZoomToFit} disabled={images.length === 0} />
      </main>
      
      {error && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-red-500 text-white p-3 rounded-md shadow-lg z-20 max-w-md text-center">
            <p>{error}</p>
            <button onClick={() => setError(null)} className="absolute -top-1 -right-1 text-2xl font-bold bg-red-700 rounded-full h-6 w-6 flex items-center justify-center leading-none">&times;</button>
        </div>
      )}

      <PromptBar
        prompt={prompt}
        onPromptChange={setPrompt}
        onSubmit={handleGenerate}
        isLoading={isLoading}
        inputDisabled={!selectedImageId}
        submitDisabled={!selectedImageId || (tool !== Tool.SELECTION && tool !== Tool.ANNOTATE && tool !== Tool.INPAINT && tool !== Tool.FREE_SELECTION)}
      />
    </div>
  );
}