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

/** Model inference succeeded, but the image mask contains no usable person. */
export class PersonNotDetectedError extends Error {
  constructor() {
    super('No clear person was found. Face the camera, brighten the room, and keep your head and shoulders in view. You can also choose Original cameras.');
    this.name = 'PersonNotDetectedError';
  }
}

// A successful inference is not proof that a person was segmented.
// Reject empty/all-foreground masks rather than exporting transparent photos.
const MIN_PERSON_COVERAGE = 0.012;
const MAX_PERSON_COVERAGE = 0.94;

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
      // The selfie model normally provides background/person confidence at
      // indices 0/1. Some builds expose just one foreground confidence mask.
      // Always try the category mask if the confidence mask looks empty.
      const confidenceMasks = result.confidenceMasks ?? [];
      const foreground = confidenceMasks.length === 1 ? confidenceMasks[0] : confidenceMasks[1];
      const candidates = [
        ...(foreground ? [{ mask: foreground, kind: 'confidence' as const }] : []),
        ...(result.categoryMask ? [{ mask: result.categoryMask, kind: 'category' as const }] : []),
      ];
      let accepted = false;
      for (const candidate of candidates) {
        const { mask, kind } = candidate;
        const mw = mask.width, mh = mask.height;
        if (!mw || !mh) continue;
        const values = kind === 'confidence' ? mask.getAsFloat32Array() : mask.getAsUint8Array();
        if (values.length !== mw * mh) continue;
        const pixels = this.alphaContext!.createImageData(mw, mh);
        let personPixels = 0;
        for (let i = 0; i < values.length; i++) {
          const p = i * 4;
          let opacity: number;
          if (kind === 'category') {
            opacity = values[i] === 1 ? 255 : 0;
          } else {
            const probability = Number.isFinite(values[i]) ? values[i] : 0;
            const strength = Math.max(0, Math.min(1, (probability - 0.17) / 0.55));
            opacity = Math.round(strength * strength * (3 - 2 * strength) * 255);
          }
          if (opacity >= 64) personPixels++;
          pixels.data[p] = 255;
          pixels.data[p + 1] = 255;
          pixels.data[p + 2] = 255;
          pixels.data[p + 3] = opacity;
        }
        const coverage = personPixels / values.length;
        if (coverage < MIN_PERSON_COVERAGE || coverage > MAX_PERSON_COVERAGE) continue;
        if (this.alpha.width !== mw || this.alpha.height !== mh) {
          this.alpha.width = mw; this.alpha.height = mh;
        }
        this.alphaContext!.putImageData(pixels, 0, 0);
        targetContext.save();
        targetContext.globalCompositeOperation = 'destination-in';
        targetContext.imageSmoothingEnabled = true;
        targetContext.filter = 'blur(1px)';
        targetContext.drawImage(this.alpha, 0, 0, outputWidth, outputHeight);
        targetContext.restore();
        accepted = true;
        break;
      }
      if (!accepted) throw new PersonNotDetectedError();
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
