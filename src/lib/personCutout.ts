/**
 * Optional, on-device person cutouts. Loaded only after somebody chooses a
 * virtual background; the ordinary booth does not depend on MediaPipe.
 *
 * MediaPipe's small SelfieSegmenter separates person (label 1) from background
 * (label 0). Frame data is processed locally; only the model/WASM is fetched.
 */
import { FilesetResolver, ImageSegmenter, type ImageSegmenterResult } from '@mediapipe/tasks-vision';
import type { TogetherSource } from './togetherPhotos';

const RUNTIME = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';
const MASK_WIDTH = 256;
const FRAME_MAX_WIDTH = 640;

type RunMode = 'IMAGE' | 'VIDEO';

export class PersonCutoutProcessor {
  private readonly input = document.createElement('canvas');
  private readonly alpha = document.createElement('canvas');
  private readonly inputContext = this.input.getContext('2d', { willReadFrequently: true });
  private readonly alphaContext = this.alpha.getContext('2d', { willReadFrequently: true });
  private lastTimestamp = 0;

  private constructor(private readonly segmenter: ImageSegmenter, private readonly mode: RunMode) {}

  static async create(mode: RunMode): Promise<PersonCutoutProcessor> {
    const files = await FilesetResolver.forVisionTasks(RUNTIME);
    const options = (delegate: 'GPU' | 'CPU') => ({
      baseOptions: { modelAssetPath: MODEL, delegate },
      runningMode: mode,
      outputCategoryMask: true,
      outputConfidenceMasks: true,
    } as const);
    // GPU accelerates some phones; CPU is a supported fallback on Safari/Android.
    let segmenter: ImageSegmenter;
    try { segmenter = await ImageSegmenter.createFromOptions(files, options('GPU')); }
    catch { segmenter = await ImageSegmenter.createFromOptions(files, options('CPU')); }
    return new PersonCutoutProcessor(segmenter, mode);
  }

  /** Reuses `destination` so one device may cache two independent subjects. */
  cutout(source: CanvasImageSource, width: number, height: number, destination = document.createElement('canvas')): TogetherSource {
    if (width <= 0 || height <= 0) throw new Error('Camera image is not ready yet.');
    if (!this.inputContext || !this.alphaContext) throw new Error('Canvas is not available.');
    const ratio = width / height;
    const inputWidth = Math.max(96, Math.round(MASK_WIDTH * Math.min(1.55, ratio)));
    const inputHeight = Math.max(96, Math.round(inputWidth / ratio));
    if (this.input.width !== inputWidth || this.input.height !== inputHeight) {
      this.input.width = inputWidth; this.input.height = inputHeight;
    }
    this.inputContext.drawImage(source, 0, 0, inputWidth, inputHeight);
    const outputWidth = Math.min(FRAME_MAX_WIDTH, width);
    const outputHeight = Math.max(1, Math.round(outputWidth / ratio));
    if (destination.width !== outputWidth || destination.height !== outputHeight) {
      destination.width = outputWidth; destination.height = outputHeight;
    }
    const targetContext = destination.getContext('2d');
    if (!targetContext) throw new Error('Photo canvas is not available.');
    targetContext.globalCompositeOperation = 'source-over';
    targetContext.clearRect(0, 0, outputWidth, outputHeight);
    targetContext.drawImage(source, 0, 0, outputWidth, outputHeight);
    const consume = (result: ImageSegmenterResult) => {
      const confidence = result.confidenceMasks?.[1];
      const category = result.categoryMask;
      const mask = confidence ?? category;
      if (!mask) throw new Error('The background remover returned no mask.');
      const mw = mask.width, mh = mask.height;
      if (this.alpha.width !== mw || this.alpha.height !== mh) { this.alpha.width = mw; this.alpha.height = mh; }
      const pixels = this.alphaContext!.createImageData(mw, mh);
      if (confidence) {
        const values = confidence.getAsFloat32Array();
        for (let i = 0; i < values.length; i++) {
          const p = i * 4;
          // Smooth the boundary without washing out the person's face.
          const strength = Math.max(0, Math.min(1, (values[i] - 0.22) / 0.55));
          const a = Math.round(strength * strength * (3 - 2 * strength) * 255);
          pixels.data[p] = 255; pixels.data[p + 1] = 255; pixels.data[p + 2] = 255; pixels.data[p + 3] = a;
        }
      } else {
        const values = category!.getAsUint8Array();
        for (let i = 0; i < values.length; i++) {
          const p = i * 4;
          pixels.data[p] = 255; pixels.data[p + 1] = 255; pixels.data[p + 2] = 255;
          pixels.data[p + 3] = values[i] === 1 ? 255 : 0;
        }
      }
      this.alphaContext!.putImageData(pixels, 0, 0);
      targetContext.save();
      targetContext.globalCompositeOperation = 'destination-in';
      targetContext.imageSmoothingEnabled = true;
      targetContext.filter = 'blur(1px)';
      targetContext.drawImage(this.alpha, 0, 0, outputWidth, outputHeight);
      targetContext.restore();
    };
    if (this.mode === 'VIDEO') {
      this.lastTimestamp = Math.max(this.lastTimestamp + 1, performance.now());
      this.segmenter.segmentForVideo(this.input, this.lastTimestamp, consume);
    } else {
      this.segmenter.segment(this.input, consume);
    }
    return { image: destination, width: destination.width, height: destination.height };
  }

  close(): void { this.segmenter.close(); }
}
