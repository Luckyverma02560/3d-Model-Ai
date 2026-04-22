import {
  GestureRecognizer, FilesetResolver
} from '@mediapipe/tasks-vision';
import { OneEuroFilter } from './oneEuroFilter.js';

/**
 * Gesture → Action mapping:
 *   Open_Palm      → Move (translate x,y)
 *   Closed_Fist    → Grab & drag in Z (depth)
 *   Pointing_Up    → Rotate around Y
 *   Victory (✌)   → Scale (pinch distance)
 *   Thumb_Up       → Toggle Anti-gravity (float)
 *   Thumb_Down     → Toggle Gravity (fall)
 *   ILoveYou       → Reset to floor anchor
 */
export class GestureController {
  constructor(video, canvas) {
    this.video  = video;
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.recognizer = null;
    this.lastResult = null;
    this.filters = {
      x: new OneEuroFilter(), y: new OneEuroFilter(), z: new OneEuroFilter()
    };
    this.listeners = new Set();
    this.prevGesture = null;
    this.prevPinch   = null;
  }

  async init() {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
    );
    this.recognizer = await GestureRecognizer.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-tasks/gesture_recognizer/gesture_recognizer.task',
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: 0.6
    });

    // Request camera stream
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: 640, height: 480 }
    });
    this.video.srcObject = stream;
    await new Promise(r => this.video.onloadedmetadata = r);
    this.video.play();
    this.loop();
  }

  on(cb) { this.listeners.add(cb); }
  emit(evt) { this.listeners.forEach(cb => cb(evt)); }

  loop() {
    if (this.video.readyState >= 2) {
      const now = performance.now();
      const res = this.recognizer.recognizeForVideo(this.video, now);
      this.handle(res);
      this.draw(res);
    }
    requestAnimationFrame(() => this.loop());
  }

  handle(res) {
    if (!res.gestures.length) {
      this.emit({ type: 'idle' });
      return;
    }
    const gName = res.gestures[0][0].categoryName;
    const score = res.gestures[0][0].score;
    const lm    = res.landmarks[0];           // 21 normalised points
    const wrist = lm[0], index = lm[8], thumb = lm[4];

    // Normalised screen coords → world mapping (done in main.js)
    const x = this.filters.x.filter(1 - index.x);  // mirror
    const y = this.filters.y.filter(1 - index.y);
    const z = this.filters.z.filter(index.z);      // depth hint

    // Pinch distance for scale
    const pinch = Math.hypot(index.x - thumb.x, index.y - thumb.y, index.z - thumb.z);
    const pinchDelta = this.prevPinch !== null ? pinch - this.prevPinch : 0;
    this.prevPinch = pinch;

    document.getElementById('gesture').textContent =
      `Gesture: ${gName} (${score.toFixed(2)})`;

    this.emit({
      type: 'gesture',
      name: gName,
      confidence: score,
      position: { x, y, z },
      pinch, pinchDelta,
      landmarks: lm,
      changed: gName !== this.prevGesture
    });
    this.prevGesture = gName;
  }

  draw(res) {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!res.landmarks.length) return;
    ctx.fillStyle = '#0af';
    for (const hand of res.landmarks) {
      for (const p of hand) {
        ctx.beginPath();
        ctx.arc((1 - p.x) * canvas.width, p.y * canvas.height, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}