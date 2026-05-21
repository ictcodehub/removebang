import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, 
  Image as ImageIcon, 
  Download, 
  RefreshCw, 
  Sliders, 
  Sparkles, 
  Cpu, 
  Eye, 
  Palette, 
  Info, 
  AlertTriangle,
  FileImage,
  Trash2,
  Check,
  Play,
  Layers,
  FileArchive,
  ZoomIn,
  ZoomOut,
  PanelRightClose,
  PanelRightOpen,
  Sun,
  Moon
} from 'lucide-react';
import JSZip from 'jszip';
import lightIcon from './assets/light-icon.png';
import darkIcon from './assets/dark-icon.png';
import './App.css';

// Solid color presets
const SOLID_PRESETS = [
  '#FFFFFF', '#000000', '#F3F4F6', '#3B82F6', 
  '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', 
  '#EC4899', '#06B6D4', '#64748B', '#78350F'
];

// Gradient presets
const GRADIENT_PRESETS = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #ff9a9e 0%, #fecfef 99%, #fecfef 100%)',
  'linear-gradient(135deg, #f6d365 0%, #fda085 100%)',
  'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)',
  'linear-gradient(135deg, #13547a 0%, #80d0c7 100%)',
  'linear-gradient(135deg, #434343 0%, #000000 100%)',
  'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)'
];

// Background image presets
const BG_IMAGE_PRESETS = [
  { name: 'Office', url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=600&q=80' },
  { name: 'Nature', url: 'https://images.unsplash.com/photo-1501854140801-50d01698950b?auto=format&fit=crop&w=600&q=80' },
  { name: 'Neon City', url: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=600&q=80' },
  { name: 'Studio', url: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=600&q=80' }
];

interface ImageState {
  file: File;
  name: string;
  size: string;
  width: number;
  height: number;
  url: string;
}

interface MaskState {
  data: Uint8Array;
  width: number;
  height: number;
}

interface DownloadProgress {
  [filename: string]: {
    loaded: number;
    total: number;
    progress: number;
  };
}

interface BatchItem {
  id: string;
  file: File;
  name: string;
  size: string;
  url: string;
  width: number;
  height: number;
  status: 'pending' | 'processing' | 'done' | 'failed';
  error?: string;
  inferenceTime?: string;
  mask?: {
    data: Uint8Array;
    width: number;
    height: number;
  };
  resultUrl?: string;
}

export default function App() {
  // WebGPU support detection
  const [webGPUSupported, setWebGPUSupported] = useState<boolean>(false);
  const [activeBackend, setActiveBackend] = useState<string>('WASM');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);

  // Theme state persisted in localStorage
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('removebang-theme') as 'dark' | 'light') || 'dark';
  });

  useEffect(() => {
    localStorage.setItem('removebang-theme', theme);
  }, [theme]);

  // Model & Worker states
  const [isWorkerReady, setIsWorkerReady] = useState<boolean>(false);
  const [modelLoading, setModelLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [downloads, setDownloads] = useState<DownloadProgress>({});
  const [error, setError] = useState<string | null>(null);

  // Image & Processing states
  const [image, setImage] = useState<ImageState | null>(null);
  const [mask, setMask] = useState<MaskState | null>(null);
  const [processing, setProcessing] = useState<boolean>(false);
  const [inferenceTime, setInferenceTime] = useState<string>('');

  // Background Customizer states
  const [bgType, setBgType] = useState<'transparent' | 'color' | 'gradient' | 'image'>('transparent');
  const [bgColor, setBgColor] = useState<string>('#FFFFFF');
  const [bgGradient, setBgGradient] = useState<string>(GRADIENT_PRESETS[0]);
  const [bgImage, setBgImage] = useState<string>(BG_IMAGE_PRESETS[0].url);
  const [customBgImage, setCustomBgImage] = useState<string | null>(null);

  // Fine-tuning states
  const [feather, setFeather] = useState<number>(0);
  const [brightness, setBrightness] = useState<number>(100);
  const [contrast, setContrast] = useState<number>(100);

  // Before/After comparison slider
  const [compareSplit, setCompareSplit] = useState<number>(50);

  // Batch Mode states
  const [isBatchMode, setIsBatchMode] = useState<boolean>(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchProcessingIndex, setBatchProcessingIndex] = useState<number | null>(null);
  const [isZipping, setIsZipping] = useState<boolean>(false);

  // Drag and drop state
  const [dragActive, setDragActive] = useState<boolean>(false);

  // Preview Modal & Zoom/Pan states
  const [previewItem, setPreviewItem] = useState<BatchItem | null>(null);
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Refs
  const workerRef = useRef<Worker | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bgImageInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const originalImageRef = useRef<HTMLImageElement>(null);

  // Refs to avoid stale closures in worker callbacks
  const isBatchModeRef = useRef(isBatchMode);
  const batchProcessingIndexRef = useRef(batchProcessingIndex);
  const batchItemsRef = useRef(batchItems);

  useEffect(() => { isBatchModeRef.current = isBatchMode; }, [isBatchMode]);
  useEffect(() => { batchProcessingIndexRef.current = batchProcessingIndex; }, [batchProcessingIndex]);
  useEffect(() => { batchItemsRef.current = batchItems; }, [batchItems]);

  const previewViewportRef = useRef<HTMLDivElement>(null);

  // Native wheel event for preview zoom
  useEffect(() => {
    const viewport = previewViewportRef.current;
    if (!viewport) return;

    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      setZoomScale((prev) => {
        const delta = e.deltaY;
        const newScale = Math.min(Math.max(prev - delta * 0.0015, 1), 5);
        if (newScale === 1) {
          setPanOffset({ x: 0, y: 0 });
        }
        return newScale;
      });
    };

    viewport.addEventListener('wheel', onWheelNative, { passive: false });
    return () => {
      viewport.removeEventListener('wheel', onWheelNative);
    };
  }, [previewItem]);

  // Render composite for a single batch item in memory
  const renderItemComposite = (item: BatchItem): Promise<string> => {
    return new Promise((resolve) => {
      if (!item.mask) {
        resolve('');
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = item.width;
      canvas.height = item.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve('');
        return;
      }

      const drawForeground = () => {
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = item.mask!.width;
        maskCanvas.height = item.mask!.height;
        const maskCtx = maskCanvas.getContext('2d');
        if (!maskCtx) { resolve(''); return; }

        const maskImgData = maskCtx.createImageData(item.mask!.width, item.mask!.height);
        for (let i = 0; i < item.mask!.data.length; i++) {
          maskImgData.data[4 * i + 3] = item.mask!.data[i];
        }
        maskCtx.putImageData(maskImgData, 0, 0);

        const scaledMaskCanvas = document.createElement('canvas');
        scaledMaskCanvas.width = item.width;
        scaledMaskCanvas.height = item.height;
        const scaledMaskCtx = scaledMaskCanvas.getContext('2d');
        if (!scaledMaskCtx) { resolve(''); return; }

        if (feather > 0) {
          scaledMaskCtx.filter = `blur(${feather}px)`;
        }
        scaledMaskCtx.drawImage(maskCanvas, 0, 0, item.width, item.height);

        const img = new Image();
        img.src = item.url;
        img.onload = () => {
          const fgCanvas = document.createElement('canvas');
          fgCanvas.width = item.width;
          fgCanvas.height = item.height;
          const fgCtx = fgCanvas.getContext('2d');
          if (!fgCtx) { resolve(''); return; }

          fgCtx.drawImage(img, 0, 0);
          fgCtx.globalCompositeOperation = 'destination-in';
          fgCtx.drawImage(scaledMaskCanvas, 0, 0);
          fgCtx.globalCompositeOperation = 'source-over';

          ctx.save();
          if (brightness !== 100 || contrast !== 100) {
            ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
          }
          ctx.drawImage(fgCanvas, 0, 0);
          ctx.restore();

          canvas.toBlob((blob) => {
            if (blob) {
              resolve(URL.createObjectURL(blob));
            } else {
              resolve('');
            }
          }, 'image/png');
        };
        img.onerror = () => {
          resolve('');
        };
      };

      if (bgType === 'color') {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, item.width, item.height);
        drawForeground();
      } else if (bgType === 'gradient') {
        const grad = ctx.createLinearGradient(0, 0, item.width, item.height);
        if (bgGradient.includes('#')) {
          const matches = bgGradient.match(/#[a-fA-F0-9]{6}/g);
          if (matches && matches.length >= 2) {
            grad.addColorStop(0, matches[0]);
            grad.addColorStop(1, matches[matches.length - 1]);
          } else {
            grad.addColorStop(0, '#667eea');
            grad.addColorStop(1, '#764ba2');
          }
        } else {
          grad.addColorStop(0, '#667eea');
          grad.addColorStop(1, '#764ba2');
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, item.width, item.height);
        drawForeground();
      } else if (bgType === 'image') {
        const bgImgUrl = customBgImage || bgImage;
        if (bgImgUrl) {
          const bgImg = new Image();
          bgImg.crossOrigin = 'anonymous';
          bgImg.src = bgImgUrl;
          bgImg.onload = () => {
            const scale = Math.max(item.width / bgImg.width, item.height / bgImg.height);
            const x = (item.width - bgImg.width * scale) / 2;
            const y = (item.height - bgImg.height * scale) / 2;
            ctx.drawImage(bgImg, x, y, bgImg.width * scale, bgImg.height * scale);
            drawForeground();
          };
          bgImg.onerror = () => {
            drawForeground();
          };
        } else {
          drawForeground();
        }
      } else {
        ctx.clearRect(0, 0, item.width, item.height);
        drawForeground();
      }
    });
  };

  // Detect WebGPU on init
  useEffect(() => {
    if ('gpu' in navigator) {
      setWebGPUSupported(true);
    }
  }, []);

  // Initialize Web Worker
  useEffect(() => {
    const worker = new Worker(new URL('./worker.ts?v=3', import.meta.url), {
      type: 'module',
    });
    
    worker.onmessage = (event) => {
      const { type, file, progress, loaded, total, device, maskData, maskWidth, maskHeight, duration, error: workerError, message } = event.data;

      switch (type) {
        case 'status':
          setStatusMessage(message);
          break;

        case 'download-progress':
          setDownloads(prev => ({
            ...prev,
            [file]: { loaded, total, progress: Math.round(progress) }
          }));
          break;

        case 'file-ready':
          setDownloads(prev => {
            const next = { ...prev };
            delete next[file];
            return next;
          });
          break;

        case 'ready':
          setIsWorkerReady(true);
          setModelLoading(false);
          if (device) setActiveBackend(device.toUpperCase());
          setStatusMessage('RMBG-1.4 AI model is ready.');
          break;

        case 'result':
          if (isBatchModeRef.current && batchProcessingIndexRef.current !== null) {
            const idx = batchProcessingIndexRef.current;
            const item = batchItemsRef.current[idx];
            if (item) {
              const updatedItem: BatchItem = {
                ...item,
                status: 'done',
                inferenceTime: duration,
                mask: {
                  data: maskData,
                  width: maskWidth,
                  height: maskHeight,
                }
              };
              
              renderItemComposite(updatedItem).then(resultUrl => {
                setBatchItems(prev => prev.map((itm, i) => 
                  i === idx ? { ...updatedItem, resultUrl } : itm
                ));
                setBatchProcessingIndex(null);
              });
            }
          } else {
            setMask({
              data: maskData,
              width: maskWidth,
              height: maskHeight,
            });
            setInferenceTime(duration);
            setProcessing(false);
            setStatusMessage('Background removal completed.');
          }
          break;

        case 'error':
          if (isBatchModeRef.current && batchProcessingIndexRef.current !== null) {
            const idx = batchProcessingIndexRef.current;
            setBatchItems(prev => prev.map((itm, i) => 
              i === idx ? { ...itm, status: 'failed', error: workerError } : itm
            ));
            setBatchProcessingIndex(null);
          } else {
            setError(workerError);
            setProcessing(false);
            setModelLoading(false);
          }
          break;
      }
    };

    workerRef.current = worker;

    // Load model on first open
    setModelLoading(true);
    worker.postMessage({ type: 'load' });

    return () => {
      worker.terminate();
    };
  }, []);

  // Sequential batch processing queue
  useEffect(() => {
    if (!isBatchMode || !isWorkerReady || batchProcessingIndex !== null) return;

    const pendingIndex = batchItems.findIndex(item => item.status === 'pending');
    if (pendingIndex !== -1) {
      setBatchProcessingIndex(pendingIndex);
      
      setBatchItems(prev => prev.map((item, idx) => 
        idx === pendingIndex ? { ...item, status: 'processing' } : item
      ));

      if (workerRef.current) {
        workerRef.current.postMessage({
          type: 'process',
          imageBlob: batchItems[pendingIndex].file
        });
      }
    }
  }, [isBatchMode, isWorkerReady, batchItems, batchProcessingIndex]);

  // Update batch composites on global settings change (debounced)
  useEffect(() => {
    if (!isBatchMode || batchItems.length === 0) return;

    const timer = setTimeout(() => {
      const updateBatchComposites = async () => {
        const completedItems = batchItems.filter(item => item.status === 'done' && item.mask);
        for (const item of completedItems) {
          const newUrl = await renderItemComposite(item);
          setBatchItems(prev => prev.map(itm => 
            itm.id === item.id ? { ...itm, resultUrl: newUrl } : itm
          ));
        }
      };
      updateBatchComposites();
    }, 300);

    return () => clearTimeout(timer);
  }, [bgType, bgColor, bgGradient, bgImage, customBgImage, feather, brightness, contrast, isBatchMode]);

  // Draw composite to canvas display
  useEffect(() => {
    drawComposite();
  }, [image, mask, bgType, bgColor, bgGradient, bgImage, customBgImage, feather, brightness, contrast]);

  // Draw composite to main canvas
  const drawComposite = () => {
    const canvas = canvasRef.current;
    if (!canvas || !image || !mask) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = image;
    canvas.width = width;
    canvas.height = height;

    if (bgType === 'color') {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);
    } else if (bgType === 'gradient') {
      const grad = ctx.createLinearGradient(0, 0, width, height);
      if (bgGradient.includes('#')) {
        const matches = bgGradient.match(/#[a-fA-F0-9]{6}/g);
        if (matches && matches.length >= 2) {
          grad.addColorStop(0, matches[0]);
          grad.addColorStop(1, matches[matches.length - 1]);
        } else {
          grad.addColorStop(0, '#667eea');
          grad.addColorStop(1, '#764ba2');
        }
      } else {
        grad.addColorStop(0, '#667eea');
        grad.addColorStop(1, '#764ba2');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    } else if (bgType === 'image') {
      const bgImgUrl = customBgImage || bgImage;
      const bgImg = new Image();
      bgImg.crossOrigin = 'anonymous';
      bgImg.src = bgImgUrl;
      bgImg.onload = () => {
        const scale = Math.max(width / bgImg.width, height / bgImg.height);
        const x = (width - bgImg.width * scale) / 2;
        const y = (height - bgImg.height * scale) / 2;
        ctx.drawImage(bgImg, x, y, bgImg.width * scale, bgImg.height * scale);
        drawForegroundOnly(ctx, width, height);
      };
      return;
    } else {
      ctx.clearRect(0, 0, width, height);
    }

    drawForegroundOnly(ctx, width, height);
  };

  // Draw foreground (original image + mask + filters)
  const drawForegroundOnly = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (!image || !mask) return;

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = mask.width;
    maskCanvas.height = mask.height;
    const maskCtx = maskCanvas.getContext('2d');
    if (!maskCtx) return;

    const maskImgData = maskCtx.createImageData(mask.width, mask.height);
    for (let i = 0; i < mask.data.length; i++) {
      const alpha = mask.data[i];
      maskImgData.data[4 * i] = 0;
      maskImgData.data[4 * i + 1] = 0;
      maskImgData.data[4 * i + 2] = 0;
      maskImgData.data[4 * i + 3] = alpha;
    }
    maskCtx.putImageData(maskImgData, 0, 0);

    const scaledMaskCanvas = document.createElement('canvas');
    scaledMaskCanvas.width = width;
    scaledMaskCanvas.height = height;
    const scaledMaskCtx = scaledMaskCanvas.getContext('2d');
    if (!scaledMaskCtx) return;

    if (feather > 0) {
      scaledMaskCtx.filter = `blur(${feather}px)`;
    }
    scaledMaskCtx.drawImage(maskCanvas, 0, 0, width, height);

    const fgCanvas = document.createElement('canvas');
    fgCanvas.width = width;
    fgCanvas.height = height;
    const fgCtx = fgCanvas.getContext('2d');
    if (!fgCtx) return;

    const imgElement = originalImageRef.current;
    if (imgElement && imgElement.complete) {
      fgCtx.drawImage(imgElement, 0, 0);
      fgCtx.globalCompositeOperation = 'destination-in';
      fgCtx.drawImage(scaledMaskCanvas, 0, 0);
      fgCtx.globalCompositeOperation = 'source-over';
    }

    ctx.save();
    if (brightness !== 100 || contrast !== 100) {
      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
    }
    ctx.drawImage(fgCanvas, 0, 0);
    ctx.restore();
  };

  // Add files to batch queue
  const addFilesToBatch = (files: File[]) => {
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    
    if (imageFiles.length === 0) {
      setError('Unsupported file format. Please select an image file.');
      return;
    }
    
    setError(null);
    setIsBatchMode(true);
    
    imageFiles.forEach(file => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.src = url;
      img.onload = () => {
        const sizeStr = (file.size / (1024 * 1024)).toFixed(2) + ' MB';
        const newItem: BatchItem = {
          id: Math.random().toString(36).substring(2, 9),
          file,
          name: file.name,
          size: sizeStr,
          url,
          width: img.width,
          height: img.height,
          status: 'pending',
        };
        setBatchItems(prev => {
          if (prev.some(item => item.file.name === file.name && item.file.size === file.size)) {
            return prev;
          }
          return [...prev, newItem];
        });
      };
    });
  };

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files);
      if (filesArray.length > 1 || isBatchMode) {
        addFilesToBatch(filesArray);
      } else {
        processSelectedFile(filesArray[0]);
      }
    }
  };

  const processSelectedFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Unsupported file format. Please select an image.');
      return;
    }

    setError(null);
    setMask(null);
    setInferenceTime('');
    setCustomBgImage(null);

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    img.onload = () => {
      const sizeStr = (file.size / (1024 * 1024)).toFixed(2) + ' MB';
      setImage({
        file,
        name: file.name,
        size: sizeStr,
        width: img.width,
        height: img.height,
        url,
      });

      if (workerRef.current && isWorkerReady) {
        setProcessing(true);
        workerRef.current.postMessage({
          type: 'process',
          imageBlob: file,
        });
      }
    };
  };

  // Drag & Drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray = Array.from(e.dataTransfer.files);
      if (filesArray.length > 1 || isBatchMode) {
        addFilesToBatch(filesArray);
      } else {
        processSelectedFile(filesArray[0]);
      }
    }
  };

  // Download result as high-res PNG
  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const originalName = image.name.substring(0, image.name.lastIndexOf('.')) || image.name;
      a.download = `${originalName}_removebang.png`;
      a.href = url;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  // Delete batch item
  const handleDeleteBatchItem = (id: string) => {
    setBatchItems(prev => {
      const item = prev.find(itm => itm.id === id);
      if (item) {
        URL.revokeObjectURL(item.url);
        if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
      }
      return prev.filter(itm => itm.id !== id);
    });
  };

  // Download single batch item
  const handleDownloadBatchItem = (item: BatchItem) => {
    if (!item.resultUrl) return;
    const a = document.createElement('a');
    const originalName = item.name.substring(0, item.name.lastIndexOf('.')) || item.name;
    a.download = `${originalName}_removebang.png`;
    a.href = item.resultUrl;
    a.click();
  };

  // Process all / retry failed
  const handleProcessAllBatch = () => {
    setError(null);
    setBatchItems(prev => prev.map(item => 
      item.status === 'failed' || item.status === 'pending'
        ? { ...item, status: 'pending' }
        : item
    ));
  };



  // Download all as ZIP
  const handleDownloadAllZip = async () => {
    const completed = batchItems.filter(item => item.status === 'done' && item.resultUrl);
    if (completed.length === 0) return;

    setIsZipping(true);
    setError(null);
    setStatusMessage('Compressing image files to ZIP...');

    try {
      const zip = new JSZip();

      for (let i = 0; i < completed.length; i++) {
        const item = completed[i];
        const res = await fetch(item.resultUrl!);
        const blob = await res.blob();
        
        const originalName = item.name.substring(0, item.name.lastIndexOf('.')) || item.name;
        const fileName = `${originalName}_removebang.png`;
        
        let uniqueFileName = fileName;
        let counter = 1;
        while (zip.file(uniqueFileName)) {
          uniqueFileName = `${originalName}_removebang_${counter}.png`;
          counter++;
        }
        
        zip.file(uniqueFileName, blob);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const downloadUrl = URL.createObjectURL(zipBlob);
      
      const a = document.createElement('a');
      a.download = `removebang_batch_${Date.now()}.zip`;
      a.href = downloadUrl;
      a.click();
      
      URL.revokeObjectURL(downloadUrl);
      setStatusMessage('ZIP download completed.');
    } catch (err: any) {
      console.error(err);
      setError('Failed to create ZIP file: ' + err.message);
    } finally {
      setIsZipping(false);
    }
  };

  // Clear all batch items
  const handleResetAllBatch = () => {
    batchItems.forEach(item => {
      URL.revokeObjectURL(item.url);
      if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
    });
    setBatchItems([]);
    setBatchProcessingIndex(null);
    setError(null);
  };

  // Upload custom background image
  const handleBgImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const url = URL.createObjectURL(file);
      setCustomBgImage(url);
      setBgType('image');
    }
  };

  const triggerBgImageUpload = () => {
    bgImageInputRef.current?.click();
  };

  const handleReset = () => {
    setImage(null);
    setMask(null);
    setInferenceTime('');
    setCustomBgImage(null);
    setFeather(0);
    setBrightness(100);
    setContrast(100);
    setCompareSplit(50);
    setError(null);
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const isDownloading = Object.keys(downloads).length > 0;

  // Determine whether to show sidebar
  const showSidebar = (!isBatchMode && image) || (isBatchMode && batchItems.length > 0);

  // Get the icon source based on theme
  const logoSrc = theme === 'dark' ? darkIcon : lightIcon;

  // ─── RENDER ───────────────────────────────────────────────────────
  return (
    <div className={`app-container premium-${theme}-theme`}>

      {/* ── TOP NAVIGATION BAR ── */}
      <nav className="top-nav">
        {/* Left: Logo + Brand */}
        <div className="nav-left">
          <div className="nav-logo">
            <img src={logoSrc} alt="RemoveBang" />
          </div>
          <span className="nav-brand">RemoveBang</span>
          {statusMessage && <div className="status-pill">{statusMessage}</div>}
        </div>

        {/* Center: Status */}
        <div className="nav-center">
        </div>

        {/* Right: Mode tabs + badges + toggles */}
        <div className="nav-right">
          {/* Mode Tabs */}
          <div className="mode-tabs">
            <button 
              className={`mode-tab ${!isBatchMode ? 'active' : ''}`}
              onClick={() => {
                if (batchProcessingIndex !== null) return;
                setIsBatchMode(false);
              }}
              disabled={batchProcessingIndex !== null}
            >
              <ImageIcon size={14} />
              Single
            </button>
            <button 
              className={`mode-tab ${isBatchMode ? 'active' : ''}`}
              onClick={() => setIsBatchMode(true)}
            >
              <Layers size={14} />
              Batch
              {batchItems.length > 0 && (
                <span className="badge-count">{batchItems.length}</span>
              )}
            </button>
          </div>

          {/* Backend Badge */}
          <div className={`backend-badge ${webGPUSupported ? '' : 'cpu'}`}>
            <Cpu size={12} />
            <span>{activeBackend}</span>
            <span className="dot" />
          </div>

          {/* Theme Toggle */}
          <button 
            className="icon-btn"
            onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {/* Sidebar Toggle */}
          {showSidebar && (
            <button 
              className="icon-btn sidebar-toggle"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              title={isSidebarOpen ? 'Hide Sidebar' : 'Show Sidebar'}
            >
              {isSidebarOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
            </button>
          )}

          {/* Reset / Clear */}
          {showSidebar && (
            <button
              className="icon-btn"
              onClick={isBatchMode ? handleResetAllBatch : handleReset}
              title="Reset / Clear All"
              disabled={batchProcessingIndex !== null}
              style={{ color: 'var(--error)' }}
            >
              <RefreshCw size={16} />
            </button>
          )}
        </div>
      </nav>

      {/* ── MAIN CONTENT ── */}
      <main className="main-content">
        {/* Error Banner */}
        {error && (
          <div className="error-banner">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Hidden file inputs */}
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          accept="image/*" 
          multiple={true}
          className="hidden-input"
        />
        <input 
          type="file" 
          ref={bgImageInputRef} 
          onChange={handleBgImageUpload} 
          accept="image/*" 
          className="hidden-input"
        />

        <div className="workspace">
          {modelLoading ? (
            /* ── MODEL LOADING ── */
            <div className="upload-zone">
              <div className="loading-card">
                <div className="loading-header">
                  <div className="loading-spinner" />
                  <div>
                    <div className="loading-title">Loading RMBG-1.4 AI Model...</div>
                    <div className="loading-status">{statusMessage || 'Connecting to model server...'}</div>
                  </div>
                </div>

                {isDownloading && (
                  <div className="progress-section">
                    <div className="progress-label">Model Download (~176MB — one-time only, cached automatically)</div>
                    {Object.entries(downloads).map(([filename, progressInfo]) => (
                      <div key={filename} className="download-row">
                        <div className="download-row-meta">
                          <span className="download-row-name">{filename}</span>
                          <span className="download-row-pct">{progressInfo.progress}%</span>
                        </div>
                        <div className="progress-track">
                          <div className="progress-fill" style={{ width: `${progressInfo.progress}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              {isBatchMode ? (
                /* ═══════════════════════════════════════
                   BATCH MODE
                   ═══════════════════════════════════════ */
                batchItems.length === 0 ? (
                  /* Empty batch upload */
                  <div className="upload-zone">
                    <div 
                      className={`upload-card ${dragActive ? 'drag-active' : ''}`}
                      onDragEnter={handleDrag}
                      onDragLeave={handleDrag}
                      onDragOver={handleDrag}
                      onDrop={handleDrop}
                      onClick={triggerFileInput}
                    >
                      <div className="upload-icon"><Layers size={32} /></div>
                      <h3 className="upload-heading">Drag & Drop Multiple Images</h3>
                      <p className="upload-sub">or click to browse your computer</p>
                      <span className="upload-hint">PNG, JPEG, WEBP — processed locally</span>
                    </div>
                  </div>
                ) : (
                  /* Active batch */
                  <div className={`editor-layout ${!isSidebarOpen ? 'sidebar-hidden' : ''}`}>
                    {/* Left: Batch queue */}
                    <div className="batch-container">
                      <div className="batch-header">
                        <div>
                          <div className="batch-title">Batch Queue ({batchItems.length} Images)</div>
                          <div className="batch-subtitle">
                            Processed: {batchItems.filter(i => i.status === 'done').length} / {batchItems.length}
                          </div>
                        </div>
                        <button className="batch-add-btn" onClick={triggerFileInput}>
                          <Upload size={14} />
                          <span>Add Images</span>
                        </button>
                      </div>

                      <div className="batch-grid">
                        {batchItems.map((item) => (
                          <div key={item.id} className={`batch-card ${item.status}`}>
                            <div className="card-thumb-wrap checkerboard">
                              <img 
                                src={item.resultUrl || item.url} 
                                alt={item.name} 
                                className="card-thumb"
                              />
                              
                              {item.status === 'processing' && (
                                <div className="card-processing-overlay">
                                  <div className="loading-spinner" />
                                  <span>Processing...</span>
                                </div>
                              )}

                              <div className="card-actions-overlay">
                                {item.status === 'done' && item.resultUrl && (
                                  <button 
                                    className="action-btn"
                                    onClick={(e) => { e.stopPropagation(); setPreviewItem(item); }}
                                    title="Preview"
                                  >
                                    <Eye size={14} />
                                  </button>
                                )}
                                {item.status !== 'processing' && (
                                  <button 
                                    className="action-btn delete"
                                    onClick={(e) => { e.stopPropagation(); handleDeleteBatchItem(item.id); }}
                                    title="Remove"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="card-info">
                              <div className="card-name" title={item.name}>{item.name}</div>
                              <div className="card-meta">
                                <span>{item.width}×{item.height}</span>
                                <span className="dot">·</span>
                                <span>{item.size}</span>
                              </div>
                              <div className="card-footer">
                                <div>
                                  {item.status === 'pending' && <span className="status-tag pending">Pending</span>}
                                  {item.status === 'processing' && <span className="status-tag processing">Processing</span>}
                                  {item.status === 'done' && (
                                    <span className="status-tag done">
                                      <Check size={10} /> Done ({item.inferenceTime}s)
                                    </span>
                                  )}
                                  {item.status === 'failed' && (
                                    <span className="status-tag failed" title={item.error}>Failed</span>
                                  )}
                                </div>

                                {item.status === 'done' && item.resultUrl && (
                                  <button 
                                    className="card-download-btn"
                                    onClick={(e) => { e.stopPropagation(); handleDownloadBatchItem(item); }}
                                    title="Download Image"
                                  >
                                    <Download size={12} />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Right: Batch sidebar */}
                    <div className="editor-sidebar">
                      {renderBackgroundSection()}
                      {renderSliderSection()}
                      {renderBatchInfoSection()}
                      {renderBatchActions()}
                    </div>
                  </div>
                )
              ) : (
                /* ═══════════════════════════════════════
                   SINGLE MODE
                   ═══════════════════════════════════════ */
                !image ? (
                  /* Upload area */
                  <div className="upload-zone">
                    <div 
                      className={`upload-card ${dragActive ? 'drag-active' : ''}`}
                      onDragEnter={handleDrag}
                      onDragLeave={handleDrag}
                      onDragOver={handleDrag}
                      onDrop={handleDrop}
                      onClick={triggerFileInput}
                    >
                      <div className="upload-icon"><Upload size={32} /></div>
                      <h3 className="upload-heading">Drag & Drop Image</h3>
                      <p className="upload-sub">or click to browse your computer</p>
                      <span className="upload-hint">PNG, JPEG, WEBP — 100% local processing</span>
                    </div>
                  </div>
                ) : (
                  /* Editor workspace */
                  <div className={`editor-layout ${!isSidebarOpen ? 'sidebar-hidden' : ''}`}>
                    {/* Left: Canvas viewport */}
                    <div className="canvas-area checkerboard">
                      {/* Hidden original image element */}
                      <img 
                        ref={originalImageRef}
                        src={image.url} 
                        alt="Original Hidden" 
                        style={{ display: 'none' }}
                        onLoad={drawComposite}
                      />

                      {processing ? (
                        <div className="canvas-processing">
                          <div className="loading-spinner" />
                          <p>{statusMessage || 'Extracting subject...'}</p>
                        </div>
                      ) : (
                        /* Before / After Split Slider */
                        <div className="split-container">
                          <div 
                            className="split-left"
                            style={{ clipPath: `polygon(0 0, ${compareSplit}% 0, ${compareSplit}% 100%, 0 100%)` }}
                          >
                            <img src={image.url} alt="Original" />
                            <span className="split-label split-label-before">Original</span>
                          </div>

                          <div 
                            className="split-right" 
                            style={{ clipPath: `polygon(${compareSplit}% 0, 100% 0, 100% 100%, ${compareSplit}% 100%)` }}
                          >
                            <canvas ref={canvasRef} />
                            <span className="split-label split-label-after">Result</span>
                          </div>

                          <div className="split-divider" style={{ left: `${compareSplit}%` }}>
                            <div className="split-handle">
                              <Eye size={14} />
                            </div>
                          </div>

                          <input 
                            type="range" 
                            min="0" max="100" 
                            value={compareSplit} 
                            onChange={(e) => setCompareSplit(Number(e.target.value))} 
                            className="split-range-input"
                          />
                        </div>
                      )}
                    </div>

                    {/* Right: Editor sidebar */}
                    <div className="editor-sidebar">
                      {renderBackgroundSection()}
                      {renderSliderSection()}
                      {renderSingleInfoSection()}
                      {renderSingleActions()}
                    </div>
                  </div>
                )
              )}
            </>
          )}
        </div>
      </main>

      {/* ── PREVIEW MODAL ── */}
      {previewItem && (
        <div className="modal-overlay" onClick={() => setPreviewItem(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <h3>{previewItem.name}</h3>
                <p>{previewItem.width}×{previewItem.height} · {previewItem.size}</p>
              </div>
              <button className="modal-close" onClick={() => setPreviewItem(null)}>
                &times;
              </button>
            </div>
            
            <div className="modal-body">
              <div 
                ref={previewViewportRef}
                className="modal-viewport checkerboard"
                onMouseDown={(e) => {
                  if (zoomScale <= 1) return;
                  setIsPanning(true);
                  setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
                }}
                onMouseMove={(e) => {
                  if (!isPanning) return;
                  setPanOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
                }}
                onMouseUp={() => setIsPanning(false)}
                onMouseLeave={() => setIsPanning(false)}
                onDoubleClick={(e) => {
                  if (zoomScale > 1) {
                    setZoomScale(1);
                    setPanOffset({ x: 0, y: 0 });
                  } else {
                    const container = e.currentTarget;
                    const { left, top, width, height } = container.getBoundingClientRect();
                    const x = e.clientX - left;
                    const y = e.clientY - top;
                    setZoomScale(2.5);
                    setPanOffset({ x: (width / 2 - x) * 1.5, y: (height / 2 - y) * 1.5 });
                  }
                }}
                style={{ 
                  cursor: zoomScale > 1 ? (isPanning ? 'grabbing' : 'grab') : 'zoom-in',
                }}
              >
                <img 
                  src={previewItem.resultUrl || previewItem.url} 
                  alt="Preview"
                  style={{ 
                    transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`,
                    transformOrigin: 'center center',
                    transition: isPanning ? 'none' : 'transform 0.15s ease-out',
                  }}
                />
                
                <div className="zoom-bar">
                  <button 
                    className="zoom-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setZoomScale(prev => {
                        const next = Math.max(prev - 0.25, 1);
                        if (next === 1) setPanOffset({ x: 0, y: 0 });
                        return next;
                      });
                    }}
                    disabled={zoomScale <= 1}
                  >
                    <ZoomOut size={14} />
                  </button>
                  
                  <input 
                    type="range" 
                    className="zoom-slider"
                    min="1" max="5" step="0.1" 
                    value={zoomScale}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setZoomScale(val);
                      if (val === 1) setPanOffset({ x: 0, y: 0 });
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  
                  <button 
                    className="zoom-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setZoomScale(prev => Math.min(prev + 0.25, 5));
                    }}
                    disabled={zoomScale >= 5}
                  >
                    <ZoomIn size={14} />
                  </button>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button 
                className="btn-primary" 
                onClick={() => handleDownloadBatchItem(previewItem)}
              >
                <Download size={14} />
                <span>Download HD Image (PNG)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── FOOTER ── */}
      <footer>
        <p>© 2026 RemoveBang. Built by <strong>Tio (Ajit Prasetiyo)</strong>. Powered by <a href="https://huggingface.co/briaai/RMBG-1.4" target="_blank" rel="noreferrer">Bria AI RMBG-1.4</a> & Transformers.js.</p>
      </footer>
    </div>
  );

  // ─── RENDER HELPERS ─────────────────────────────────────────────────

  function renderBackgroundSection() {
    return (
      <div className="sidebar-section">
        <div className="section-header">
          <Palette size={16} />
          <span>Background</span>
        </div>

        <div className="bg-tabs">
          <button className={`bg-tab ${bgType === 'transparent' ? 'active' : ''}`} onClick={() => setBgType('transparent')}>
            <ImageIcon size={12} /><span>None</span>
          </button>
          <button className={`bg-tab ${bgType === 'color' ? 'active' : ''}`} onClick={() => setBgType('color')}>
            <Palette size={12} /><span>Color</span>
          </button>
          <button className={`bg-tab ${bgType === 'gradient' ? 'active' : ''}`} onClick={() => setBgType('gradient')}>
            <Sparkles size={12} /><span>Gradient</span>
          </button>
          <button className={`bg-tab ${bgType === 'image' ? 'active' : ''}`} onClick={() => setBgType('image')}>
            <FileImage size={12} /><span>Image</span>
          </button>
        </div>

        <div className="bg-options">
          {bgType === 'transparent' && (
            <p className="bg-note">Transparent background (PNG HD)</p>
          )}

          {bgType === 'color' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="swatch-grid">
                {SOLID_PRESETS.map(color => (
                  <div 
                    key={color} 
                    className={`swatch ${bgColor === color ? 'active' : ''}`}
                    style={{ backgroundColor: color, border: color === '#FFFFFF' ? '1px solid var(--hairline)' : undefined }}
                    onClick={() => setBgColor(color)}
                  />
                ))}
              </div>
              <label className="color-picker-row">
                <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} />
                <span>{bgColor}</span>
              </label>
            </div>
          )}

          {bgType === 'gradient' && (
            <div className="swatch-grid">
              {GRADIENT_PRESETS.map(grad => (
                <div 
                  key={grad} 
                  className={`swatch ${bgGradient === grad ? 'active' : ''}`}
                  style={{ backgroundImage: grad }}
                  onClick={() => setBgGradient(grad)}
                />
              ))}
            </div>
          )}

          {bgType === 'image' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="bg-thumbs">
                {BG_IMAGE_PRESETS.map((preset, idx) => (
                  <div 
                    key={idx} 
                    className={`bg-thumb ${bgImage === preset.url && !customBgImage ? 'active' : ''}`}
                    style={{ backgroundImage: `url(${preset.url})` }}
                    onClick={() => { setBgImage(preset.url); setCustomBgImage(null); }}
                    title={preset.name}
                  />
                ))}
                {customBgImage && (
                  <div className="bg-thumb active" style={{ backgroundImage: `url(${customBgImage})` }} title="Custom" />
                )}
              </div>
              <button className="bg-upload-btn" onClick={triggerBgImageUpload}>
                <Upload size={12} />
                <span>Upload Background</span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderSliderSection() {
    return (
      <div className="sidebar-section">
        <div className="section-header">
          <Sliders size={16} />
          <span>Adjustments</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="slider-group">
            <div className="slider-row">
              <span>Feather</span>
              <span className="slider-val">{feather}px</span>
            </div>
            <input type="range" min="0" max="25" value={feather} onChange={(e) => setFeather(Number(e.target.value))} className="range-input" />
          </div>

          <div className="slider-group">
            <div className="slider-row">
              <span>Brightness</span>
              <span className="slider-val">{brightness}%</span>
            </div>
            <input type="range" min="60" max="140" value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} className="range-input" />
          </div>

          <div className="slider-group">
            <div className="slider-row">
              <span>Contrast</span>
              <span className="slider-val">{contrast}%</span>
            </div>
            <input type="range" min="60" max="140" value={contrast} onChange={(e) => setContrast(Number(e.target.value))} className="range-input" />
          </div>
        </div>
      </div>
    );
  }

  function renderSingleInfoSection() {
    return (
      <div className="sidebar-section">
        <div className="section-header">
          <Info size={16} />
          <span>Details</span>
        </div>

        <div className="info-grid">
          <div className="info-cell">
            <div className="info-label">Resolution</div>
            <div className="info-value">{image!.width}×{image!.height}</div>
          </div>
          <div className="info-cell">
            <div className="info-label">Inference</div>
            <div className="info-value">{inferenceTime ? `${inferenceTime}s` : '—'}</div>
          </div>
          <div className="info-cell">
            <div className="info-label">File Size</div>
            <div className="info-value">{image!.size}</div>
          </div>
          <div className="info-cell">
            <div className="info-label">Model</div>
            <div className="info-value success">RMBG-1.4</div>
          </div>
        </div>
      </div>
    );
  }

  function renderSingleActions() {
    return (
      <div className="actions-stack">
        <button className="btn-primary" onClick={handleDownload} disabled={processing}>
          <Download size={14} />
          <span>Download HD Image (PNG)</span>
        </button>
        <button className="btn-secondary" onClick={handleReset} disabled={processing}>
          <RefreshCw size={14} />
          <span>Upload New Image</span>
        </button>
      </div>
    );
  }

  function renderBatchInfoSection() {
    const completed = batchItems.filter(i => i.status === 'done');
    const avgTime = completed.length > 0
      ? (completed.reduce((acc, curr) => acc + parseFloat(curr.inferenceTime || '0'), 0) / completed.length).toFixed(2) + 's'
      : '—';

    return (
      <div className="sidebar-section">
        <div className="section-header">
          <Info size={16} />
          <span>Queue Status</span>
        </div>

        <div className="info-grid">
          <div className="info-cell">
            <div className="info-label">Completed</div>
            <div className="info-value">{completed.length} / {batchItems.length}</div>
          </div>
          <div className="info-cell">
            <div className="info-label">Avg Time</div>
            <div className="info-value">{avgTime}</div>
          </div>
          <div className="info-cell">
            <div className="info-label">Model</div>
            <div className="info-value success">RMBG-1.4</div>
          </div>
          <div className="info-cell">
            <div className="info-label">Backend</div>
            <div className="info-value">{activeBackend}</div>
          </div>
        </div>
      </div>
    );
  }

  function renderBatchActions() {
    const completedCount = batchItems.filter(i => i.status === 'done').length;
    const hasPendingOrFailed = batchItems.some(i => i.status === 'failed' || i.status === 'pending');

    return (
      <div className="actions-stack">
        <button 
          className="btn-primary" 
          onClick={handleDownloadAllZip}
          disabled={completedCount === 0 || isZipping}
        >
          {isZipping ? (
            <div className="loading-spinner" style={{ width: '14px', height: '14px', borderWidth: '2px', borderTopColor: 'var(--on-primary)' }} />
          ) : (
            <FileArchive size={14} />
          )}
          <span>{isZipping ? 'Compressing...' : `Download ZIP (${completedCount})`}</span>
        </button>

        
        {hasPendingOrFailed && (
          <button 
            className="btn-secondary btn-sm" 
            onClick={handleProcessAllBatch}
            disabled={batchProcessingIndex !== null || isZipping}
          >
            <Play size={12} />
            <span>{batchProcessingIndex !== null ? 'Processing...' : 'Start Queue'}</span>
          </button>
        )}

        <button 
          className="btn-secondary btn-sm btn-danger" 
          onClick={handleResetAllBatch}
          disabled={batchProcessingIndex !== null || isZipping}
        >
          <RefreshCw size={12} />
          <span>Clear All</span>
        </button>
      </div>
    );
  }
}
