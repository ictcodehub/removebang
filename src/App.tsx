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
  ZoomOut
} from 'lucide-react';
import JSZip from 'jszip';
import './App.css';

// Preset warna solid
const SOLID_PRESETS = [
  '#FFFFFF', '#000000', '#F3F4F6', '#3B82F6', 
  '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', 
  '#EC4899', '#06B6D4', '#64748B', '#78350F'
];

// Preset gradasi
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

// Preset background images
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

  // Before/After comparison slider percentage (0 to 100)
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


  // Ref
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

  // Listen to wheel events on preview viewport natively to bypass active listener restrictions
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

  // Render pratinjau composite untuk satu item batch di memori
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

  // Deteksi WebGPU saat inisialisasi
  useEffect(() => {
    if ('gpu' in navigator) {
      setWebGPUSupported(true);
    }
  }, []);

  // Inisialisasi Web Worker
  useEffect(() => {
    // Inisialisasi worker menggunakan Vite Worker import
    const worker = new Worker(new URL('./worker.ts', import.meta.url), {
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
          // File selesai diunduh
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
          setStatusMessage('Model AI RMBG-1.4 siap digunakan.');
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
            setStatusMessage('Penghapusan background selesai.');
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

    // Muat model saat pertama kali dibuka
    setModelLoading(true);
    worker.postMessage({ type: 'load' });

    return () => {
      worker.terminate();
    };
  }, []);

  // Antrean Pemrosesan Sequential Mode Batch
  useEffect(() => {
    if (!isBatchMode || !isWorkerReady || batchProcessingIndex !== null) return;

    const pendingIndex = batchItems.findIndex(item => item.status === 'pending');
    if (pendingIndex !== -1) {
      setBatchProcessingIndex(pendingIndex);
      
      // Update status of this item to 'processing'
      setBatchItems(prev => prev.map((item, idx) => 
        idx === pendingIndex ? { ...item, status: 'processing' } : item
      ));

      // Post message to web worker
      if (workerRef.current) {
        workerRef.current.postMessage({
          type: 'process',
          imageBlob: batchItems[pendingIndex].file
        });
      }
    }
  }, [isBatchMode, isWorkerReady, batchItems, batchProcessingIndex]);

  // Trigger update pratinjau batch jika setelan global berubah (dengan 300ms debounce)
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

  // Gambar hasil gabungan ke Canvas Display setiap ada perubahan
  useEffect(() => {
    drawComposite();
  }, [image, mask, bgType, bgColor, bgGradient, bgImage, customBgImage, feather, brightness, contrast]);

  // Fungsi menggambar composite ke Canvas utama
  const drawComposite = () => {
    const canvas = canvasRef.current;
    if (!canvas || !image || !mask) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = image;
    canvas.width = width;
    canvas.height = height;

    // 1. Gambar Background terlebih dahulu
    if (bgType === 'color') {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);
    } else if (bgType === 'gradient') {
      // Kita perlu membuat CSS gradient di Canvas. Untuk kesederhanaan, mari kita parsing warna gradasi atau gambar gradient
      // Sebagai fallback, mari kita isi dengan background gradasi canvas linear
      const grad = ctx.createLinearGradient(0, 0, width, height);
      // Parsing warna-warna preset dari CSS string
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
        // Gambar background dengan teknik cover (menjaga aspek rasio)
        const scale = Math.max(width / bgImg.width, height / bgImg.height);
        const x = (width - bgImg.width * scale) / 2;
        const y = (height - bgImg.height * scale) / 2;
        ctx.drawImage(bgImg, x, y, bgImg.width * scale, bgImg.height * scale);
        // Redraw foreground setelah background gambar termuat
        drawForegroundOnly(ctx, width, height);
      };
      return; // Kembalikan dulu agar menunggu gambar termuat
    } else {
      // Transparan - bersihkan canvas
      ctx.clearRect(0, 0, width, height);
    }

    drawForegroundOnly(ctx, width, height);
  };

  // Fungsi khusus untuk menggambar foreground (gambar asli + mask + filters)
  const drawForegroundOnly = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (!image || !mask) return;

    // 2. Buat Canvas mask mentah (ukuran model AI)
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

    // 3. Buat Canvas mask yang sudah diskalakan ke resolusi asli gambar
    const scaledMaskCanvas = document.createElement('canvas');
    scaledMaskCanvas.width = width;
    scaledMaskCanvas.height = height;
    const scaledMaskCtx = scaledMaskCanvas.getContext('2d');
    if (!scaledMaskCtx) return;

    // Jika ada feathering, berikan filter blur ke mask
    if (feather > 0) {
      scaledMaskCtx.filter = `blur(${feather}px)`;
    }
    scaledMaskCtx.drawImage(maskCanvas, 0, 0, width, height);

    // 4. Buat Canvas khusus untuk foreground yang dipotong
    const fgCanvas = document.createElement('canvas');
    fgCanvas.width = width;
    fgCanvas.height = height;
    const fgCtx = fgCanvas.getContext('2d');
    if (!fgCtx) return;

    // Gambar foto asli
    const imgElement = originalImageRef.current;
    if (imgElement && imgElement.complete) {
      fgCtx.drawImage(imgElement, 0, 0);
      
      // Gunakan globalCompositeOperation 'destination-in' untuk memotong berdasarkan mask
      fgCtx.globalCompositeOperation = 'destination-in';
      fgCtx.drawImage(scaledMaskCanvas, 0, 0);
      
      // Kembalikan ke mode normal
      fgCtx.globalCompositeOperation = 'source-over';
    }

    // 5. Terapkan filter Brightness & Contrast pada foreground sebelum digambar ke display
    ctx.save();
    if (brightness !== 100 || contrast !== 100) {
      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
    }

    // Gambar foreground di atas background
    ctx.drawImage(fgCanvas, 0, 0);
    ctx.restore();
  };

  // Tambahkan banyak file ke antrean batch
  const addFilesToBatch = (files: File[]) => {
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    
    if (imageFiles.length === 0) {
      setError('Format file tidak didukung. Harap pilih file gambar.');
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
          // Cegah duplikasi file yang sama persis jika tidak sengaja
          if (prev.some(item => item.file.name === file.name && item.file.size === file.size)) {
            return prev;
          }
          return [...prev, newItem];
        });
      };
    });
  };

  // Tangani pemilihan file gambar
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
      setError('Format file tidak didukung. Harap pilih gambar.');
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

      // Secara otomatis mulai memproses penghapusan background
      if (workerRef.current && isWorkerReady) {
        setProcessing(true);
        workerRef.current.postMessage({
          type: 'process',
          imageBlob: file,
        });
      }
    };
  };

  // Tangani seret-dan-lepas file (Drag & Drop)
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

  // Unduh hasil gambar PNG resolusi tinggi
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

  // Hapus satu item dari antrean batch
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

  // Unduh satu hasil item batch
  const handleDownloadBatchItem = (item: BatchItem) => {
    if (!item.resultUrl) return;
    const a = document.createElement('a');
    const originalName = item.name.substring(0, item.name.lastIndexOf('.')) || item.name;
    a.download = `${originalName}_removebang.png`;
    a.href = item.resultUrl;
    a.click();
  };

  // Mulai memproses semua / memproses ulang item yang gagal
  const handleProcessAllBatch = () => {
    setError(null);
    setBatchItems(prev => prev.map(item => 
      item.status === 'failed' || item.status === 'pending'
        ? { ...item, status: 'pending' }
        : item
    ));
  };

  // Unduh semua hasil batch yang sukses diproses
  const handleDownloadAllBatch = () => {
    const completed = batchItems.filter(item => item.status === 'done' && item.resultUrl);
    if (completed.length === 0) return;
    
    completed.forEach((item, index) => {
      setTimeout(() => {
        const a = document.createElement('a');
        const originalName = item.name.substring(0, item.name.lastIndexOf('.')) || item.name;
        a.download = `${originalName}_removebang.png`;
        a.href = item.resultUrl!;
        a.click();
      }, index * 400); // Jeda 400ms antar unduhan agar tidak diblokir browser
    });
  };

  // Unduh semua hasil batch sebagai berkas ZIP tunggal
  const handleDownloadAllZip = async () => {
    const completed = batchItems.filter(item => item.status === 'done' && item.resultUrl);
    if (completed.length === 0) return;

    setIsZipping(true);
    setError(null);
    setStatusMessage('Sedang mengompresi berkas gambar ke ZIP...');

    try {
      const zip = new JSZip();

      for (let i = 0; i < completed.length; i++) {
        const item = completed[i];
        const res = await fetch(item.resultUrl!);
        const blob = await res.blob();
        
        const originalName = item.name.substring(0, item.name.lastIndexOf('.')) || item.name;
        const fileName = `${originalName}_removebang.png`;
        
        // Atur agar nama file unik di dalam ZIP jika ada berkas bernama sama
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
      setStatusMessage('Unduhan berkas ZIP selesai.');
    } catch (err: any) {
      console.error(err);
      setError('Gagal membuat berkas ZIP: ' + err.message);
    } finally {
      setIsZipping(false);
    }
  };


  // Bersihkan seluruh antrean batch
  const handleResetAllBatch = () => {
    batchItems.forEach(item => {
      URL.revokeObjectURL(item.url);
      if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
    });
    setBatchItems([]);
    setBatchProcessingIndex(null);
    setError(null);
  };

  // Unggah custom background image
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

  // Cek apakah model sedang diunduh (terdapat aktif downloads)
  const isDownloading = Object.keys(downloads).length > 0;

  return (
    <div className="app-container">
      <header>
        <div className="brand">
          <div className="brand-logo">
            <img src="/icon.jpg" alt="RemoveBang Logo" style={{ width: '100%', height: '100%', borderRadius: '8px', objectFit: 'contain' }} />
          </div>
          <div className="brand-text">
            <h1 className="neon-text">RemoveBang</h1>
            <p>Aplikasi Penghapus Background HD Lokal Terakselerasi GPU</p>
          </div>
        </div>

        <div className={`gpu-badge ${webGPUSupported ? '' : 'cpu'}`}>
          <Cpu size={16} />
          <span>Akselerasi: {activeBackend}</span>
          <div className="badge-dot" />
        </div>
      </header>

      {error && (
        <div className="glass-panel neon-glow" style={{ padding: '16px 24px', borderColor: 'var(--error)', background: 'rgba(239, 68, 68, 0.05)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <AlertTriangle color="var(--error)" size={20} />
          <p style={{ color: 'var(--error)', fontSize: '14px', fontWeight: '500' }}>Error: {error}</p>
        </div>
      )}

      {/* Tampilan Pengunduhan Model AI */}
      {modelLoading && (
        <div className="glass-panel loading-card neon-glow">
          <div className="loading-header">
            <div className="loading-spinner" />
            <div className="loading-info">
              <h3>Memuat Model AI RMBG-1.4...</h3>
              <p>{statusMessage || 'Sedang menghubungkan ke server model...'}</p>
            </div>
          </div>

          {isDownloading && (
            <div className="progress-container">
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500' }}>Progres Unduhan Model (~176MB - Hanya sekali, selanjutnya dicache otomatis):</div>
              {Object.entries(downloads).map(([filename, progressInfo]) => (
                <div key={filename} className="download-item">
                  <div className="download-meta">
                    <span className="download-filename">{filename}</span>
                    <span className="download-percentage">{progressInfo.progress}%</span>
                  </div>
                  <div className="progress-track">
                    <div 
                      className="progress-fill" 
                      style={{ width: `${progressInfo.progress}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Halaman Utama Upload & Workspace */}
      {!modelLoading && (
        <>
          {/* Form input gambar tersembunyi */}
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept="image/*" 
            multiple={true}
            style={{ display: 'none' }}
          />

          {/* Toggle Mode Tunggal vs Batch */}
          <div className="mode-toggle-container">
            <div className="mode-toggle-pill glass-panel">
              <button 
                className={`mode-toggle-btn ${!isBatchMode ? 'active' : ''}`}
                onClick={() => {
                  if (batchProcessingIndex !== null) return;
                  setIsBatchMode(false);
                }}
                disabled={batchProcessingIndex !== null}
              >
                <ImageIcon size={16} />
                <span>Mode Tunggal</span>
              </button>
              <button 
                className={`mode-toggle-btn ${isBatchMode ? 'active' : ''}`}
                onClick={() => setIsBatchMode(true)}
              >
                <Layers size={16} />
                <span>Mode Batch</span>
                {batchItems.length > 0 && (
                  <span className="badge-count">{batchItems.length}</span>
                )}
              </button>
            </div>
          </div>

          {isBatchMode ? (
            /* =======================================
               WORKSPACE MODE BATCH
               ======================================= */
            batchItems.length === 0 ? (
              /* Area Upload Mode Batch (Kosong) */
              <div 
                className={`glass-panel upload-wrapper ${dragActive ? 'drag-active' : ''}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={triggerFileInput}
              >
                <div className="upload-icon-container">
                  <Layers size={36} />
                </div>
                <div className="upload-text">
                  <h3>Seret & Lepaskan Banyak Foto</h3>
                  <p>atau klik untuk menelusuri folder komputer Anda</p>
                </div>
                <div className="upload-limits">
                  Mendukung PNG, JPEG, WEBP. Seluruh foto akan diproses secara lokal satu per satu.
                </div>
              </div>
            ) : (
              /* Antrean Batch Aktif */
              <div className="workspace-grid batch-grid-layout">
                
                {/* Sisi Kiri: Grid Preview Batch */}
                <div className="batch-preview-container">
                  <div className="batch-grid-header glass-panel">
                    <div className="batch-stats-info">
                      <h3>Antrean Batch ({batchItems.length} Foto)</h3>
                      <p>
                        Diproses: {batchItems.filter(item => item.status === 'done').length} / {batchItems.length}
                      </p>
                    </div>
                    <div className="batch-header-actions">
                      <button 
                        className="btn-batch-add"
                        onClick={triggerFileInput}
                      >
                        <Upload size={14} />
                        <span>Tambah Foto</span>
                      </button>
                    </div>
                  </div>

                  <div className="batch-items-grid">
                    {batchItems.map((item, idx) => {
                      const isProcessing = item.status === 'processing';
                      const isDone = item.status === 'done';
                      const isFailed = item.status === 'failed';
                      const isPending = item.status === 'pending';

                      return (
                        <div key={item.id} className={`batch-item-card glass-panel ${item.status}`}>
                          <div className="card-thumbnail-container transparent-checkerboard">
                            <img 
                              src={item.resultUrl || item.url} 
                              alt={item.name} 
                              className="card-thumbnail"
                            />
                            
                            {isProcessing && (
                              <div className="card-overlay">
                                <div className="loading-spinner" />
                                <span>Memproses...</span>
                              </div>
                            )}

                            <div className="card-hover-actions">
                              {isDone && item.resultUrl && (
                                <>
                                  <button 
                                    className="action-circle-btn preview"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPreviewItem(item);
                                    }}
                                    title="Pratinjau Detail & Zoom"
                                  >
                                    <Eye size={14} />
                                  </button>
                                  <button 
                                    className="action-circle-btn download"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDownloadBatchItem(item);
                                    }}
                                    title="Download Gambar HD"
                                  >
                                    <Download size={14} />
                                  </button>
                                </>
                              )}
                              {!isProcessing && (
                                <button 
                                  className="action-circle-btn delete"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteBatchItem(item.id);
                                  }}
                                  title="Hapus dari antrean"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>

                          </div>

                          <div className="card-details">
                            <div className="card-filename" title={item.name}>
                              {item.name}
                            </div>
                            <div className="card-meta">
                              <span>{item.width} × {item.height}</span>
                              <span className="meta-dot">•</span>
                              <span>{item.size}</span>
                            </div>
                            <div className="card-status-row">
                              {isPending && <span className="status-badge pending">Menunggu</span>}
                              {isProcessing && <span className="status-badge processing">Memproses</span>}
                              {isDone && (
                                <span className="status-badge done">
                                  <Check size={10} />
                                  <span>Selesai ({item.inferenceTime}s)</span>
                                </span>
                              )}
                              {isFailed && (
                                <span className="status-badge failed" title={item.error}>
                                  Gagal
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Sisi Kanan: Panel Kontrol Editor (Untuk Semua Gambar) */}
                <div className="control-sidebar">
                  
                  {/* Seksi Kustomisasi Background */}
                  <div className="glass-panel panel-section">
                    <div className="section-title">
                      <Palette size={18} />
                      <span>Latar Belakang Global</span>
                    </div>

                    {/* Tabs Tipe Background */}
                    <div className="background-tabs">
                      <button 
                        className={`tab-btn ${bgType === 'transparent' ? 'active' : ''}`}
                        onClick={() => setBgType('transparent')}
                      >
                        <ImageIcon size={14} />
                        <span>Bening</span>
                      </button>
                      <button 
                        className={`tab-btn ${bgType === 'color' ? 'active' : ''}`}
                        onClick={() => setBgType('color')}
                      >
                        <Palette size={14} />
                        <span>Warna</span>
                      </button>
                      <button 
                        className={`tab-btn ${bgType === 'gradient' ? 'active' : ''}`}
                        onClick={() => setBgType('gradient')}
                      >
                        <Sparkles size={14} />
                        <span>Gradasi</span>
                      </button>
                      <button 
                        className={`tab-btn ${bgType === 'image' ? 'active' : ''}`}
                        onClick={() => setBgType('image')}
                      >
                        <FileImage size={14} />
                        <span>Gambar</span>
                      </button>
                    </div>

                    {/* Area Pilihan Preset */}
                    <div className="background-options">
                      {bgType === 'transparent' && (
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center', padding: '10px 0' }}>
                          Seluruh gambar batch akan menggunakan latar belakang transparan (PNG HD).
                        </p>
                      )}

                      {bgType === 'color' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          <div className="color-presets">
                            {SOLID_PRESETS.map(color => (
                              <div 
                                key={color} 
                                className={`color-circle ${bgColor === color ? 'active' : ''}`}
                                style={{ backgroundColor: color }}
                                onClick={() => setBgColor(color)}
                              />
                            ))}
                          </div>
                          <label className="custom-color-picker">
                            <input 
                              type="color" 
                              value={bgColor} 
                              onChange={(e) => setBgColor(e.target.value)}
                              className="picker-input"
                            />
                            <span className="picker-text">Kustom: {bgColor}</span>
                          </label>
                        </div>
                      )}

                      {bgType === 'gradient' && (
                        <div className="color-presets">
                          {GRADIENT_PRESETS.map(grad => (
                            <div 
                              key={grad} 
                              className={`color-circle ${bgGradient === grad ? 'active' : ''}`}
                              style={{ backgroundImage: grad }}
                              onClick={() => setBgGradient(grad)}
                            />
                          ))}
                        </div>
                      )}

                      {bgType === 'image' && (
                        <div className="bg-image-picker">
                          <div className="bg-image-thumbnails">
                            {BG_IMAGE_PRESETS.map((preset, idx) => (
                              <div 
                                key={idx} 
                                className={`bg-thumb ${bgImage === preset.url && !customBgImage ? 'active' : ''}`}
                                style={{ backgroundImage: `url(${preset.url})` }}
                                onClick={() => {
                                  setBgImage(preset.url);
                                  setCustomBgImage(null);
                                }}
                                title={preset.name}
                              />
                            ))}
                            {customBgImage && (
                              <div 
                                className="bg-thumb active"
                                style={{ backgroundImage: `url(${customBgImage})` }}
                                title="Kustom"
                              />
                            )}
                          </div>
                          
                          <input 
                            type="file" 
                            ref={bgImageInputRef} 
                            onChange={handleBgImageUpload} 
                            accept="image/*" 
                            style={{ display: 'none' }}
                          />
                          <button className="bg-upload-btn" onClick={triggerBgImageUpload}>
                            <Upload size={14} />
                            <span>Unggah Gambar Background</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Seksi Fine-Tuning Pemotongan */}
                  <div className="glass-panel panel-section">
                    <div className="section-title">
                      <Sliders size={18} />
                      <span>Penyesuaian Tepi & Filter</span>
                    </div>

                    <div style={{ display: 'flex', gap: '20px', flexDirection: 'column' }}>
                      <div className="slider-group">
                        <div className="slider-label">
                          <span>Feather (Kelembutan Tepi)</span>
                          <span className="slider-value">{feather}px</span>
                        </div>
                        <input 
                          type="range" 
                          min="0" 
                          max="25" 
                          value={feather} 
                          onChange={(e) => setFeather(Number(e.target.value))}
                          className="input-slider"
                        />
                      </div>

                      <div className="slider-group">
                        <div className="slider-label">
                          <span>Kecerahan Subjek</span>
                          <span className="slider-value">{brightness}%</span>
                        </div>
                        <input 
                          type="range" 
                          min="60" 
                          max="140" 
                          value={brightness} 
                          onChange={(e) => setBrightness(Number(e.target.value))}
                          className="input-slider"
                        />
                      </div>

                      <div className="slider-group">
                        <div className="slider-label">
                          <span>Kontras Subjek</span>
                          <span className="slider-value">{contrast}%</span>
                        </div>
                        <input 
                          type="range" 
                          min="60" 
                          max="140" 
                          value={contrast} 
                          onChange={(e) => setContrast(Number(e.target.value))}
                          className="input-slider"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Seksi Ringkasan Kinerja Batch */}
                  <div className="glass-panel panel-section">
                    <div className="section-title">
                      <Info size={18} />
                      <span>Status Kinerja Antrean</span>
                    </div>

                    <div className="info-grid">
                      <div className="info-item">
                        <div className="info-label">Selesai</div>
                        <div className="info-value">{batchItems.filter(item => item.status === 'done').length} / {batchItems.length}</div>
                      </div>
                      <div className="info-item">
                        <div className="info-label">Rata-rata Waktu</div>
                        <div className="info-value">
                          {(() => {
                            const completed = batchItems.filter(item => item.status === 'done' && item.inferenceTime);
                            if (completed.length === 0) return '0.00s';
                            const sum = completed.reduce((acc, curr) => acc + parseFloat(curr.inferenceTime!), 0);
                            return (sum / completed.length).toFixed(2) + 's';
                          })()}
                        </div>
                      </div>
                      <div className="info-item">
                        <div className="info-label">Mode AI</div>
                        <div className="info-value" style={{ color: 'var(--success)' }}>HD (RMBG-1.4)</div>
                      </div>
                      <div className="info-item">
                        <div className="info-label">Akselerasi</div>
                        <div className="info-value">{activeBackend}</div>
                      </div>
                    </div>
                  </div>

                  {/* Tombol Aksi Ekspor Batch */}
                  <div className="actions-container">
                    <button 
                      className="btn-primary" 
                      onClick={handleDownloadAllZip}
                      disabled={batchItems.filter(item => item.status === 'done').length === 0 || isZipping}
                    >
                      {isZipping ? (
                        <div className="loading-spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', borderTopColor: 'white', marginRight: '6px' }} />
                      ) : (
                        <FileArchive size={18} />
                      )}
                      <span>{isZipping ? 'Mengompresi ZIP...' : `Unduh Berkas ZIP (${batchItems.filter(item => item.status === 'done').length} Foto)`}</span>
                    </button>

                    <button 
                      className="btn-secondary" 
                      onClick={handleDownloadAllBatch}
                      disabled={batchItems.filter(item => item.status === 'done').length === 0 || isZipping}
                      style={{ fontSize: '11px', padding: '8px 12px' }}
                      title="Mengunduh satu per satu secara berurutan dengan jeda waktu"
                    >
                      <Download size={14} />
                      <span>Unduh Satu per Satu (PNG)</span>
                    </button>
                    
                    {batchItems.some(item => item.status === 'failed' || item.status === 'pending') && (
                      <button 
                        className="btn-secondary" 
                        onClick={handleProcessAllBatch}
                        disabled={batchProcessingIndex !== null || isZipping}
                      >
                        <Play size={14} />
                        <span>{batchProcessingIndex !== null ? 'Sedang Memproses...' : 'Mulai Antrean'}</span>
                      </button>
                    )}

                    <button 
                      className="btn-secondary" 
                      onClick={handleResetAllBatch}
                      disabled={batchProcessingIndex !== null || isZipping}
                      style={{ borderColor: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}
                    >
                      <RefreshCw size={14} />
                      <span>Bersihkan Semua</span>
                    </button>
                  </div>


                </div>

              </div>
            )
          ) : (
            /* =======================================
               WORKSPACE MODE TUNGGAL (EXISTING)
               ======================================= */
            !image ? (
              /* Area Upload */
              <div 
                className={`glass-panel upload-wrapper ${dragActive ? 'drag-active' : ''}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={triggerFileInput}
              >
                <div className="upload-icon-container">
                  <Upload size={36} />
                </div>
                <div className="upload-text">
                  <h3>Seret & Lepaskan Gambar</h3>
                  <p>atau klik untuk menelusuri folder komputer Anda</p>
                </div>
                <div className="upload-limits">
                  Mendukung PNG, JPEG, WEBP. Pemrosesan dilakukan 100% aman dan lokal di PC Anda.
                </div>
              </div>
            ) : (
              /* Workspace Utama */
              <div className="workspace-grid">
                
                {/* Sisi Kiri: Canvas Viewport dengan Split Comparison */}
                <div className="canvas-viewport transparent-checkerboard" style={{ padding: '0px', overflow: 'hidden' }}>
                  
                  {/* Image element tersembunyi untuk input asli */}
                  <img 
                    ref={originalImageRef}
                    src={image.url} 
                    alt="Original Hidden" 
                    style={{ display: 'none' }}
                    onLoad={drawComposite}
                  />

                  {processing ? (
                    /* Loading State Saat Memotong */
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', zIndex: 10 }}>
                      <div className="loading-spinner" style={{ width: '48px', height: '48px', borderWidth: '4px' }} />
                      <p style={{ color: 'white', fontWeight: '600', textShadow: '0 2px 4px rgba(0,0,0,0.5)', fontSize: '15px' }}>
                        {statusMessage || 'Mengekstraksi subjek...'}
                      </p>
                    </div>
                  ) : (
                    /* Before / After Split Slider */
                    <div className="split-view-container">
                      
                      {/* Sisi Kiri (Gambar Asli): Ditampilkan di belakang dengan clipPath */}
                      <div 
                        className="split-image-left"
                        style={{ clipPath: `polygon(0 0, ${compareSplit}% 0, ${compareSplit}% 100%, 0 100%)` }}
                      >
                        <img src={image.url} alt="Original Image" />
                        <div className="image-label-badge label-before">Asli</div>
                      </div>

                      {/* Sisi Kanan (Hasil Potongan): Ditampilkan di atas dengan pemotongan lebar clip-path */}
                      <div 
                        className="split-image-right" 
                        style={{ clipPath: `polygon(${compareSplit}% 0, 100% 0, 100% 100%, ${compareSplit}% 100%)` }}
                      >
                        <canvas ref={canvasRef} />
                        <div className="image-label-badge label-after">Hasil</div>
                      </div>

                      {/* Batang Slider Handle Tengah */}
                      <div className="slider-handle-bar" style={{ left: `${compareSplit}%` }}>
                        <div className="slider-handle-button">
                          <Eye size={18} />
                        </div>
                      </div>

                      {/* Range Input Tak Terlihat untuk Kontrol Geser */}
                      <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        value={compareSplit} 
                        onChange={(e) => setCompareSplit(Number(e.target.value))} 
                        className="slider-range-input"
                      />
                    </div>
                  )}
                </div>

                {/* Sisi Kanan: Panel Kontrol Editor */}
                <div className="control-sidebar">
                  
                  {/* Seksi Kustomisasi Background */}
                  <div className="glass-panel panel-section">
                    <div className="section-title">
                      <Palette size={18} />
                      <span>Latar Belakang</span>
                    </div>

                    {/* Tabs Tipe Background */}
                    <div className="background-tabs">
                      <button 
                        className={`tab-btn ${bgType === 'transparent' ? 'active' : ''}`}
                        onClick={() => setBgType('transparent')}
                      >
                        <ImageIcon size={14} />
                        <span>Bening</span>
                      </button>
                      <button 
                        className={`tab-btn ${bgType === 'color' ? 'active' : ''}`}
                        onClick={() => setBgType('color')}
                      >
                        <Palette size={14} />
                        <span>Warna</span>
                      </button>
                      <button 
                        className={`tab-btn ${bgType === 'gradient' ? 'active' : ''}`}
                        onClick={() => setBgType('gradient')}
                      >
                        <Sparkles size={14} />
                        <span>Gradasi</span>
                      </button>
                      <button 
                        className={`tab-btn ${bgType === 'image' ? 'active' : ''}`}
                        onClick={() => setBgType('image')}
                      >
                        <FileImage size={14} />
                        <span>Gambar</span>
                      </button>
                    </div>

                    {/* Area Pilihan Preset Sesuai Tab Aktif */}
                    <div className="background-options">
                      {bgType === 'transparent' && (
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center', padding: '10px 0' }}>
                          Latar belakang akan disimpan transparan sepenuhnya (PNG HD).
                        </p>
                      )}

                      {bgType === 'color' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          <div className="color-presets">
                            {SOLID_PRESETS.map(color => (
                              <div 
                                key={color} 
                                className={`color-circle ${bgColor === color ? 'active' : ''}`}
                                style={{ backgroundColor: color }}
                                onClick={() => setBgColor(color)}
                              />
                            ))}
                          </div>
                          <label className="custom-color-picker">
                            <input 
                              type="color" 
                              value={bgColor} 
                              onChange={(e) => setBgColor(e.target.value)}
                              className="picker-input"
                            />
                            <span className="picker-text">Kustom: {bgColor}</span>
                          </label>
                        </div>
                      )}

                      {bgType === 'gradient' && (
                        <div className="color-presets">
                          {GRADIENT_PRESETS.map(grad => (
                            <div 
                              key={grad} 
                              className={`color-circle ${bgGradient === grad ? 'active' : ''}`}
                              style={{ backgroundImage: grad }}
                              onClick={() => setBgGradient(grad)}
                            />
                          ))}
                        </div>
                      )}

                      {bgType === 'image' && (
                        <div className="bg-image-picker">
                          <div className="bg-image-thumbnails">
                            {BG_IMAGE_PRESETS.map((preset, idx) => (
                              <div 
                                key={idx} 
                                className={`bg-thumb ${bgImage === preset.url && !customBgImage ? 'active' : ''}`}
                                style={{ backgroundImage: `url(${preset.url})` }}
                                onClick={() => {
                                  setBgImage(preset.url);
                                  setCustomBgImage(null);
                                }}
                                title={preset.name}
                              />
                            ))}
                            {customBgImage && (
                              <div 
                                className="bg-thumb active"
                                style={{ backgroundImage: `url(${customBgImage})` }}
                                title="Kustom"
                              />
                            )}
                          </div>
                          
                          <input 
                            type="file" 
                            ref={bgImageInputRef} 
                            onChange={handleBgImageUpload} 
                            accept="image/*" 
                            style={{ display: 'none' }}
                          />
                          <button className="bg-upload-btn" onClick={triggerBgImageUpload}>
                            <Upload size={14} />
                            <span>Unggah Gambar Background</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Seksi Fine-Tuning Pemotongan */}
                  <div className="glass-panel panel-section">
                    <div className="section-title">
                      <Sliders size={18} />
                      <span>Penyesuaian Tepi & Filter</span>
                    </div>

                    <div style={{ display: 'flex', gap: '20px', flexDirection: 'column' }}>
                      {/* Feathering (Edge soften) */}
                      <div className="slider-group">
                        <div className="slider-label">
                          <span>Feather (Kelembutan Tepi)</span>
                          <span className="slider-value">{feather}px</span>
                        </div>
                        <input 
                          type="range" 
                          min="0" 
                          max="25" 
                          value={feather} 
                          onChange={(e) => setFeather(Number(e.target.value))}
                          className="input-slider"
                        />
                      </div>

                      {/* Brightness */}
                      <div className="slider-group">
                        <div className="slider-label">
                          <span>Kecerahan Subjek</span>
                          <span className="slider-value">{brightness}%</span>
                        </div>
                        <input 
                          type="range" 
                          min="60" 
                          max="140" 
                          value={brightness} 
                          onChange={(e) => setBrightness(Number(e.target.value))}
                          className="input-slider"
                        />
                      </div>

                      {/* Contrast */}
                      <div className="slider-group">
                        <div className="slider-label">
                          <span>Kontras Subjek</span>
                          <span className="slider-value">{contrast}%</span>
                        </div>
                        <input 
                          type="range" 
                          min="60" 
                          max="140" 
                          value={contrast} 
                          onChange={(e) => setContrast(Number(e.target.value))}
                          className="input-slider"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Informasi Gambar & Performa */}
                  <div className="glass-panel panel-section">
                    <div className="section-title">
                      <Info size={18} />
                      <span>Detail & Kinerja</span>
                    </div>

                    <div className="info-grid">
                      <div className="info-item">
                        <div className="info-label">Resolusi Asli</div>
                        <div className="info-value">{image.width} × {image.height}</div>
                      </div>
                      <div className="info-item">
                        <div className="info-label">Inference Time</div>
                        <div className="info-value">{inferenceTime ? `${inferenceTime}s` : 'Mengevaluasi...'}</div>
                      </div>
                      <div className="info-item">
                        <div className="info-label">Ukuran Gambar</div>
                        <div className="info-value">{image.size}</div>
                      </div>
                      <div className="info-item">
                        <div className="info-label">Mode AI</div>
                        <div className="info-value" style={{ color: 'var(--success)' }}>HD (RMBG-1.4)</div>
                      </div>
                      {mask && (
                        <div className="info-item" style={{ gridColumn: 'span 2' }}>
                          <div className="info-label">Diagnostik Mask</div>
                          <div className="info-value" style={{ fontSize: '11px', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                            Len: {mask.data.length} | Dim: {mask.width}x{mask.height} | Min/Max: {Math.min(...Array.from(mask.data.slice(0, 500)))}/{Math.max(...Array.from(mask.data.slice(0, 500)))} | Sample: [{Array.from(mask.data.slice(0, 5)).join(', ')}]
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Tombol Aksi Ekspor */}
                  <div className="actions-container">
                    <button 
                      className="btn-primary" 
                      onClick={handleDownload}
                      disabled={processing}
                    >
                      <Download size={18} />
                      <span>Download Gambar HD (PNG)</span>
                    </button>
                    <button 
                      className="btn-secondary" 
                      onClick={handleReset}
                      disabled={processing}
                    >
                      <RefreshCw size={14} />
                      <span>Unggah Gambar Baru</span>
                    </button>
                  </div>

                </div>

              </div>
            )
          )}
        </>
      )}

      {/* Modal Preview Batch & Zoom */}
      {previewItem && (
        <div className="preview-modal-overlay" onClick={() => setPreviewItem(null)}>
          <div className="preview-modal-content glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="preview-modal-header">
              <div className="preview-modal-title">
                <h3>Pratinjau Detail: {previewItem.name}</h3>
                <p>{previewItem.width} × {previewItem.height} • {previewItem.size}</p>
              </div>
              <button className="preview-modal-close" onClick={() => setPreviewItem(null)}>
                &times;
              </button>
            </div>
            
            <div className="preview-modal-body">
              {/* Viewport Gambar (Scroll & Pan) */}
              <div 
                ref={previewViewportRef}
                className="preview-image-viewport transparent-checkerboard"
                onMouseDown={(e) => {
                  if (zoomScale <= 1) return;
                  setIsPanning(true);
                  setPanStart({
                    x: e.clientX - panOffset.x,
                    y: e.clientY - panOffset.y
                  });
                }}
                onMouseMove={(e) => {
                  if (!isPanning) return;
                  setPanOffset({
                    x: e.clientX - panStart.x,
                    y: e.clientY - panStart.y
                  });
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
                    setPanOffset({
                      x: (width / 2 - x) * 1.5,
                      y: (height / 2 - y) * 1.5
                    });
                  }
                }}
                style={{ 
                  position: 'relative', 
                  cursor: zoomScale > 1 ? (isPanning ? 'grabbing' : 'grab') : 'zoom-in',
                  overflow: 'hidden'
                }}
                title={zoomScale > 1 ? "Klik & geser untuk memindahkan gambar" : "Klik ganda untuk memperbesar"}
              >
                <img 
                  src={previewItem.resultUrl || previewItem.url} 
                  alt="Pratinjau HD"
                  className="preview-large-img"
                  style={{ 
                    display: 'block', 
                    maxWidth: '100%', 
                    maxHeight: '65vh', 
                    margin: '0 auto', 
                    objectFit: 'contain',
                    transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`,
                    transformOrigin: 'center center',
                    transition: isPanning ? 'none' : 'transform 0.15s ease-out',
                    userSelect: 'none',
                    pointerEvents: 'none'
                  }}
                />
                
                {/* Floating Zoom Controls at Bottom Center */}
                <div className="zoom-controls-floating">
                  <button 
                    className="btn-zoom"
                    onClick={(e) => {
                      e.stopPropagation();
                      setZoomScale(prev => {
                        const next = Math.max(prev - 0.25, 1);
                        if (next === 1) setPanOffset({ x: 0, y: 0 });
                        return next;
                      });
                    }}
                    disabled={zoomScale <= 1}
                    title="Zoom Out"
                  >
                    <ZoomOut size={16} />
                  </button>
                  
                  <input 
                    type="range" 
                    className="preview-zoom-slider"
                    min="1" 
                    max="5" 
                    step="0.1" 
                    value={zoomScale}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setZoomScale(val);
                      if (val === 1) setPanOffset({ x: 0, y: 0 });
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  
                  <button 
                    className="btn-zoom"
                    onClick={(e) => {
                      e.stopPropagation();
                      setZoomScale(prev => Math.min(prev + 0.25, 5));
                    }}
                    disabled={zoomScale >= 5}
                    title="Zoom In"
                  >
                    <ZoomIn size={16} />
                  </button>
                </div>
              </div>
            </div>

            <div className="preview-modal-footer">
              <button 
                className="btn-primary" 
                onClick={() => {
                  handleDownloadBatchItem(previewItem);
                }}
              >
                <Download size={16} />
                <span>Unduh Gambar HD (PNG)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <footer>
        <p>© 2026 RemoveBang. Dibuat oleh <strong>Tio (Ajit Prasetiyo)</strong>. Didukung oleh <a href="https://huggingface.co/briaai/RMBG-1.4" target="_blank" rel="noreferrer">Bria AI RMBG-1.4</a> & Transformers.js.</p>
      </footer>
    </div>
  );
}
