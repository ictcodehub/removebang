import { pipeline, env, RawImage, AutoConfig } from '@huggingface/transformers';

// Izinkan model diunduh dari Hugging Face Hub secara default
env.allowLocalModels = false;

let segmentator: any = null;

// Tangani pesan dari main thread
self.onmessage = async (event: MessageEvent) => {
  const { type, imageBlob } = event.data;

  if (type === 'load') {
    try {
      if (segmentator) {
        self.postMessage({ type: 'ready' });
        return;
      }

      // Deteksi WebGPU support
      let device = 'wasm';
      if ('gpu' in navigator) {
        device = 'webgpu';
      }

      self.postMessage({ type: 'status', message: `Menginisialisasi model dengan backend: ${device.toUpperCase()}...` });

      // Memuat config model terlebih dahulu untuk mengubah model_type menjadi 'isnet'
      // sebagai solusi dari ketidakcocokan tipe model di Hugging Face ('SegformerForSemanticSegmentation')
      const config = await AutoConfig.from_pretrained('briaai/RMBG-1.4');
      config.model_type = 'isnet';

      segmentator = await pipeline('image-segmentation', 'briaai/RMBG-1.4', {
        config,
        device: device as any,
        progress_callback: (progressData: any) => {
          if (progressData.status === 'progress') {
            self.postMessage({
              type: 'download-progress',
              file: progressData.file,
              progress: progressData.progress,
              loaded: progressData.loaded,
              total: progressData.total,
            });
          } else if (progressData.status === 'ready') {
            self.postMessage({
              type: 'file-ready',
              file: progressData.file,
            });
          }
        }
      });

      self.postMessage({ type: 'ready', device });
    } catch (error: any) {
      console.error('Gagal memuat model:', error);
      self.postMessage({ type: 'error', error: error.message || 'Gagal memuat model AI.' });
    }
  }

  else if (type === 'process') {
    try {
      if (!segmentator) {
        throw new Error('Model belum dimuat. Silakan muat model terlebih dahulu.');
      }

      self.postMessage({ type: 'status', message: 'Memproses gambar (menghapus background)...' });

      // Load raw image dari blob
      const url = URL.createObjectURL(imageBlob);
      const rawImage = await RawImage.fromURL(url);
      URL.revokeObjectURL(url);

      const startTime = performance.now();
      
      // Jalankan model segmentation
      const output = await segmentator(rawImage);
      
      const duration = (performance.now() - startTime) / 1000;

      // output[0] berisi mask karena pipeline image-segmentation mengembalikan array
      const mask = Array.isArray(output) ? output[0].mask : output.mask;

      if (!mask) {
        throw new Error('Tidak dapat mengekstrak mask dari output model AI.');
      }

      // Kirim hasil mask kembali ke main thread
      // Kita kirim lebar, tinggi, dan raw data dari mask (Uint8Array)
      self.postMessage({
        type: 'result',
        maskData: mask.data,
        maskWidth: mask.width,
        maskHeight: mask.height,
        duration: duration.toFixed(2),
      });

    } catch (error: any) {
      console.error('Gagal memproses gambar:', error);
      self.postMessage({ type: 'error', error: error.message || 'Gagal memproses gambar.' });
    }
  }
};
