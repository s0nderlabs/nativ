"use client";

import { useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";

const ASCII_SETS = [
  " .,:;+*?%S#@",
  " .,;:*+?S%#@",
  " .;,:+*S?%@#",
];
const FONT_SIZE = 8;
const CHAR_WIDTH = FONT_SIZE * 0.6;
const CHAR_HEIGHT = FONT_SIZE * 1.05;

export function HalftoneHero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pathname = usePathname();
  const isHome = pathname === "/";
  const stateRef = useRef({
    mouseX: 0.5,
    mouseY: 0.5,
    animId: 0,
    imageLoaded: false,
    destroyed: false,
  });

  const handleMouseMove = useCallback((e: MouseEvent) => {
    stateRef.current.mouseX = e.clientX / window.innerWidth;
    stateRef.current.mouseY = e.clientY / window.innerHeight;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false })!;

    stateRef.current.destroyed = false;

    const sampleCanvas = document.createElement("canvas");
    const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true })!;

    const img = new Image();
    img.src = "/hero-bg-2.webp";

    let cols = 0;
    let rows = 0;

    let cellBrightness: Float32Array | null = null;
    let cellR: Uint8Array | null = null;
    let cellG: Uint8Array | null = null;
    let cellB: Uint8Array | null = null;
    let vignetteGradient: CanvasGradient | null = null;
    const font = `${FONT_SIZE}px "Ioskeley Mono", "JetBrains Mono", "Fira Code", monospace`;

    function resize() {
      if (stateRef.current.destroyed || !canvas || !ctx) return;

      const dpr = Math.min(window.devicePixelRatio, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = font;
      ctx.textBaseline = "top";
      cols = Math.floor(window.innerWidth / CHAR_WIDTH);
      rows = Math.floor(window.innerHeight / CHAR_HEIGHT);

      // Pre-compute vignette gradient (only changes on resize)
      const w = window.innerWidth;
      const h = window.innerHeight;
      vignetteGradient = ctx.createRadialGradient(w / 2, h / 2, h * 0.02, w / 2, h / 2, h * 0.8);
      vignetteGradient.addColorStop(0, "rgba(5,5,5,0.7)");
      vignetteGradient.addColorStop(0.25, "rgba(5,5,5,0.5)");
      vignetteGradient.addColorStop(0.5, "rgba(5,5,5,0.2)");
      vignetteGradient.addColorStop(0.75, "rgba(5,5,5,0.1)");
      vignetteGradient.addColorStop(1, "rgba(5,5,5,0.9)");

      if (stateRef.current.imageLoaded && cols > 0 && rows > 0) {
        sampleCanvas.width = cols;
        sampleCanvas.height = rows;
        sampleCtx.drawImage(img, 0, 0, cols, rows);
        const pixelData = sampleCtx.getImageData(0, 0, cols, rows).data;

        const total = cols * rows;
        cellBrightness = new Float32Array(total);
        cellR = new Uint8Array(total);
        cellG = new Uint8Array(total);
        cellB = new Uint8Array(total);

        for (let i = 0; i < total; i++) {
          const pi = i * 4;
          const r = pixelData[pi];
          const g = pixelData[pi + 1];
          const b = pixelData[pi + 2];
          cellBrightness[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

          const max = Math.max(r, g, b, 1);
          const boost = Math.min(255 / max * 0.7, 2.0);
          cellR[i] = Math.min(255, Math.round(r * boost));
          cellG[i] = Math.min(255, Math.round(g * boost));
          cellB[i] = Math.min(255, Math.round(b * boost));
        }
      }
    }

    img.onload = () => {
      stateRef.current.imageLoaded = true;
      resize();
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", handleMouseMove);

    const startTime = performance.now();
    let rendered = false;

    function render() {
      if (stateRef.current.destroyed) return;

      const now = performance.now();
      const isHomePage = window.location.pathname === "/";

      // On non-home pages, render once (after image loads) then stop — zero CPU
      if (!isHomePage && rendered) {
        stateRef.current.animId = requestAnimationFrame(render);
        return;
      }
      // Only mark as rendered if we actually have image data to draw
      if (!isHomePage && cellBrightness) rendered = true;
      if (isHomePage) rendered = false;

      const time = (now - startTime) * 0.001;
      const { mouseX, mouseY } = stateRef.current;

      const w = window.innerWidth;
      const h = window.innerHeight;

      ctx.fillStyle = "#050505";
      ctx.fillRect(0, 0, w, h);

      if (!cellBrightness || !cellR || !cellG || !cellB || !vignetteGradient) {
        stateRef.current.animId = requestAnimationFrame(render);
        return;
      }

      const wavePhase = time * 0.15;
      const invRows = 1 / rows;
      const invCols = 1 / cols;
      const mouseR = 0.25;
      const mouseR2 = mouseR * mouseR;

      for (let y = 0; y < rows; y++) {
        const ny = y * invRows;
        const rowOffset = y * cols;

        let lastStyle = "";
        let batchStr = "";
        let batchStartX = 0;

        for (let x = 0; x <= cols; x++) {
          let char = " ";
          let style = "";

          if (x < cols) {
            const nx = x * invCols;
            const cellIdx = rowOffset + x;
            let brightness = cellBrightness[cellIdx];

            const wave = Math.sin(((nx + ny) * 1.8 - wavePhase) * 6.2832) * 0.06;
            brightness += wave;

            const dx = nx - mouseX;
            const dy = ny - mouseY;
            const d2 = dx * dx + dy * dy;
            if (d2 < mouseR2) {
              brightness += (1 - Math.sqrt(d2) / mouseR) * 0.12;
            }

            if (brightness < 0.03) {
              char = " ";
            } else {
              if (brightness > 1) brightness = 1;

              const setIdx = ((time * 0.4 + x * 0.13 + y * 0.17) | 0) % 3;
              const chars = ASCII_SETS[setIdx];
              const charIdx = Math.min(chars.length - 1, (brightness * chars.length) | 0);
              char = chars[charIdx];

              if (char !== " ") {
                const alpha = Math.min(1, brightness * 1.3);
                const qa = ((alpha * 10 + 0.5) | 0) / 10;
                const qr = (cellR[cellIdx] >> 4) << 4;
                const qg = (cellG[cellIdx] >> 4) << 4;
                const qb = (cellB[cellIdx] >> 4) << 4;
                style = `rgba(${qr},${qg},${qb},${qa})`;
              }
            }
          }

          if (style !== lastStyle || x === cols) {
            if (batchStr.length > 0 && lastStyle) {
              ctx.fillStyle = lastStyle;
              ctx.fillText(batchStr, batchStartX * CHAR_WIDTH, y * CHAR_HEIGHT);
            }
            batchStr = char === " " ? "" : char;
            batchStartX = x;
            lastStyle = style;
          } else if (char !== " ") {
            const gap = x - (batchStartX + batchStr.length);
            if (gap > 0) {
              if (batchStr.length > 0 && lastStyle) {
                ctx.fillStyle = lastStyle;
                ctx.fillText(batchStr, batchStartX * CHAR_WIDTH, y * CHAR_HEIGHT);
              }
              batchStr = char;
              batchStartX = x;
            } else {
              batchStr += char;
            }
          }
        }
      }

      ctx.fillStyle = vignetteGradient;
      ctx.fillRect(0, 0, w, h);

      stateRef.current.animId = requestAnimationFrame(render);
    }

    stateRef.current.animId = requestAnimationFrame(render);

    return () => {
      stateRef.current.destroyed = true;
      cancelAnimationFrame(stateRef.current.animId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [handleMouseMove]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10 transition-opacity duration-700"
      style={{ width: "100vw", height: "100vh", opacity: isHome ? 1 : 0.12 }}
    />
  );
}
