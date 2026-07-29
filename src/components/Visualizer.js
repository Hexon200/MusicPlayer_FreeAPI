let audioCtx = null;
let analyser = null;
let sourceNode = null;
let animFrameId = null;

export function setupVisualizer(audioElement, canvasElement) {
  if (!canvasElement) return;
  const ctx = canvasElement.getContext('2d');

  function resizeCanvas() {
    canvasElement.width = canvasElement.clientWidth * window.devicePixelRatio || 300;
    canvasElement.height = canvasElement.clientHeight * window.devicePixelRatio || 180;
  }

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  function initAudioContext() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContext();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
    }

    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    if (!sourceNode && audioElement) {
      try {
        sourceNode = audioCtx.createMediaElementSource(audioElement);
        sourceNode.connect(analyser);
        analyser.connect(audioCtx.destination);
      } catch (err) {
        console.warn('AudioSource already connected or cross-origin issue', err);
      }
    }
  }

  function draw() {
    animFrameId = requestAnimationFrame(draw);

    const width = canvasElement.width;
    const height = canvasElement.height;
    ctx.clearRect(0, 0, width, height);

    if (!analyser) {
      // Idle wave preview when audio context is inactive
      drawIdleWave(ctx, width, height);
      return;
    }

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    const barWidth = (width / bufferLength) * 1.5;
    let x = 0;

    // Get current theme color from computed style
    const style = getComputedStyle(document.body);
    const primaryColor = style.getPropertyValue('--mood-primary').trim() || '#6366f1';
    const accentColor = style.getPropertyValue('--mood-accent').trim() || '#38bdf8';

    for (let i = 0; i < bufferLength; i++) {
      const barHeight = (dataArray[i] / 255) * (height * 0.75);

      const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
      gradient.addColorStop(0, primaryColor);
      gradient.addColorStop(1, accentColor);

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(x, height - barHeight, barWidth - 4, barHeight, [4, 4, 0, 0]);
      ctx.fill();

      x += barWidth;
    }
  }

  function drawIdleWave(ctx, width, height) {
    const time = Date.now() * 0.003;
    const style = getComputedStyle(document.body);
    const primaryColor = style.getPropertyValue('--mood-primary').trim() || '#6366f1';

    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();

    for (let x = 0; x < width; x += 5) {
      const y = height / 2 + Math.sin(x * 0.02 + time) * 12;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    ctx.stroke();
    ctx.globalAlpha = 1.0;
  }

  // Start animation loop
  if (animFrameId) cancelAnimationFrame(animFrameId);
  draw();

  return {
    initAudioContext,
    stop: () => {
      if (animFrameId) cancelAnimationFrame(animFrameId);
    }
  };
}
