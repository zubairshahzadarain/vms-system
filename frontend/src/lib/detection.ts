import '@tensorflow/tfjs-backend-webgl';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as tf from '@tensorflow/tfjs-core';

export interface Detection {
  class: string;
  score: number;
  bbox: [number, number, number, number]; // x, y, width, height in source-video pixels
}

/**
 * Lazily loads the COCO-SSD object detection model once and shares it across
 * every camera tile — this runs entirely client-side (WebGL), no backend,
 * no API key, no per-inference network call. Only the one-time model weights
 * download touches the network, same trust category as loading a web font.
 */
let modelPromise: Promise<cocoSsd.ObjectDetection> | null = null;

export function loadDetector(): Promise<cocoSsd.ObjectDetection> {
  if (!modelPromise) {
    modelPromise = tf.ready().then(() => cocoSsd.load({ base: 'lite_mobilenet_v2' }));
  }
  return modelPromise;
}

export async function detectObjects(
  source: HTMLVideoElement,
  model: cocoSsd.ObjectDetection,
): Promise<Detection[]> {
  if (source.readyState < 2 || source.videoWidth === 0) return [];
  const predictions = await model.detect(source);
  return predictions
    .filter((p) => p.score >= 0.5)
    .map((p) => ({ class: p.class, score: p.score, bbox: p.bbox as [number, number, number, number] }));
}
