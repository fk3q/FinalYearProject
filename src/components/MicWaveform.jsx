import React, { useEffect, useRef } from "react";

// Siri-style wavy line that animates in real time from a live MediaStream.
//
// Architecture:
//   · The same MediaStream the parent's MediaRecorder is using gets piped
//     into a Web Audio AnalyserNode (via createMediaStreamSource). No
//     second mic permission, no second prompt -- just a tap into the
//     existing stream.
//   · A requestAnimationFrame loop reads the time-domain waveform
//     (`getByteTimeDomainData`) every frame and renders a smooth cubic
//     bezier through the samples on a canvas.
//   · DPR-aware so the line stays crisp on retina screens. CSS sizes the
//     element; we size the backing canvas at devicePixelRatio.
//
// All Web Audio + RAF resources are released on unmount, so toggling the
// mic on/off doesn't leak AudioContexts (browsers cap at ~6 per page).
const MicWaveform = ({
  stream,
  width = 80,
  height = 24,
  color = "#ffffff",
  // Multiplier on the raw waveform amplitude. The byte time-domain data is
  // centred on 128 with values 0-255; we map (sample - 128) / 128 -> [-1,1]
  // and then scale by `gain` so a quiet mic still produces a visible curve.
  gain = 1.6,
}) => {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);

  useEffect(() => {
    if (!stream) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    // ── Set up the Web Audio graph ──────────────────────────────────
    let audioCtx;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return undefined;
      audioCtx = new Ctor();
    } catch {
      return undefined;
    }
    audioCtxRef.current = audioCtx;

    let source;
    try {
      source = audioCtx.createMediaStreamSource(stream);
    } catch {
      // Stream may already be torn down by the time we mount; bail.
      audioCtx.close().catch(() => {});
      audioCtxRef.current = null;
      return undefined;
    }
    sourceRef.current = source;

    const analyser = audioCtx.createAnalyser();
    // 1024-sample window -> ~21 ms at 48kHz, smooth enough for a wavy
    // line without lagging behind the user's voice.
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.55;
    source.connect(analyser);
    analyserRef.current = analyser;

    const buf = new Uint8Array(analyser.fftSize);

    // ── DPR-aware canvas sizing ─────────────────────────────────────
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return undefined;
    ctx2d.scale(dpr, dpr);
    ctx2d.lineWidth = 1.6;
    ctx2d.lineCap = "round";
    ctx2d.lineJoin = "round";
    ctx2d.strokeStyle = color;

    // ── Render loop ─────────────────────────────────────────────────
    // Subsample the 1024-byte buffer down to ~28 control points so the
    // bezier stays smooth instead of jittering on every individual
    // sample (which would look like noise, not a voice waveform).
    const POINTS = 28;
    const step = Math.floor(buf.length / POINTS);
    const midY = height / 2;

    const draw = () => {
      analyser.getByteTimeDomainData(buf);
      ctx2d.clearRect(0, 0, width, height);

      ctx2d.beginPath();
      const xs = [];
      const ys = [];
      for (let i = 0; i < POINTS; i += 1) {
        const v = (buf[i * step] - 128) / 128; // -1..1
        const x = (i / (POINTS - 1)) * width;
        const y = midY + v * gain * midY;
        xs.push(x);
        ys.push(y);
      }
      // Smooth curve using midpoint-quadratic interpolation -- gives a
      // continuous flowing wave rather than a polyline.
      ctx2d.moveTo(xs[0], ys[0]);
      for (let i = 0; i < POINTS - 1; i += 1) {
        const cx = (xs[i] + xs[i + 1]) / 2;
        const cy = (ys[i] + ys[i + 1]) / 2;
        ctx2d.quadraticCurveTo(xs[i], ys[i], cx, cy);
      }
      ctx2d.lineTo(xs[POINTS - 1], ys[POINTS - 1]);
      ctx2d.stroke();

      rafRef.current = window.requestAnimationFrame(draw);
    };
    rafRef.current = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(rafRef.current);
      try {
        source.disconnect();
      } catch {
        /* graph may already be torn down */
      }
      try {
        analyser.disconnect();
      } catch {
        /* same */
      }
      // Closing the AudioContext frees the underlying audio thread so we
      // don't blow past the browser's per-page AudioContext cap on
      // repeated start/stop cycles.
      audioCtx.close().catch(() => {});
      audioCtxRef.current = null;
      analyserRef.current = null;
      sourceRef.current = null;
    };
  }, [stream, width, height, color, gain]);

  return (
    <canvas
      ref={canvasRef}
      className="cp-mic-wave"
      aria-hidden="true"
    />
  );
};

export default MicWaveform;
