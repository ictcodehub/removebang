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
  FileImage
} from 'lucide-react';
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

  // Drag and drop state
  const [dragActive, setDragActive] = useState<boolean>(false);

  // Ref
  const workerRef = useRef<Worker | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bgImageInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const originalImageRef = useRef<HTMLImageElement>(null);

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
          setMask({
            data: maskData,
            width: maskWidth,
            height: maskHeight,
          });
          setInferenceTime(duration);
          setProcessing(false);
          setStatusMessage('Penghapusan background selesai.');
          break;

        case 'error':
          setError(workerError);
          setProcessing(false);
          setModelLoading(false);
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

  // Tangani pemilihan file gambar
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processSelectedFile(e.target.files[0]);
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

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processSelectedFile(e.dataTransfer.files[0]);
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
      <header className="glass-panel" style={{ padding: '20px 30px', border: 'none' }}>
        <div className="brand">
          <div className="brand-logo">
            <Sparkles size={24} color="white" />
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
            style={{ display: 'none' }}
          />

          {!image ? (
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
              <div className="glass-panel canvas-viewport transparent-checkerboard" style={{ padding: '0px', overflow: 'hidden' }}>
                
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
          )}
        </>
      )}

      <footer>
        <p>© 2026 RemoveBang. Didukung oleh <a href="https://huggingface.co/briaai/RMBG-1.4" target="_blank" rel="noreferrer">Bria AI RMBG-1.4</a> & Transformers.js.</p>
      </footer>
    </div>
  );
}
