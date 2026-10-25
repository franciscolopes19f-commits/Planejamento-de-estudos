// Leitura de código de barras pela câmera.
// 1º: BarcodeDetector nativo (Chrome/Android). 2º: biblioteca ZXing (carregada só quando necessária).
// A câmera exige HTTPS (ou localhost). Leitores físicos funcionam como teclado: basta focar o campo.

import { modal, icon, esc } from './lib.js';
import { validateGtin } from '/shared/gtin.js';

let zxingLoading = null;
export function loadZxing() {
  if (window.ZXing) return Promise.resolve(window.ZXing);
  zxingLoading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/vendor/zxing.min.js';
    s.onload = () => resolve(window.ZXing);
    s.onerror = () => reject(new Error('Não foi possível carregar o leitor.'));
    document.head.appendChild(s);
  });
  return zxingLoading;
}

export function cameraSupport() {
  if (window.NT_DEMO) return { ok: false, reason: 'Na demonstração online o navegador não libera a câmera ao vivo. Use “Foto do código” ou digite o número.' };
  if (!window.isSecureContext) return { ok: false, reason: 'A câmera só funciona com o painel aberto em HTTPS.' };
  if (!navigator.mediaDevices?.getUserMedia) return { ok: false, reason: 'Este navegador não permite acesso à câmera.' };
  return { ok: true };
}

/** Abre a câmera e chama onCode(código) na primeira leitura com dígito verificador válido. */
export function openScanner(onCode) {
  const sup = cameraSupport();
  let stream = null;
  let stopped = false;
  let zxReader = null;
  const stop = () => {
    stopped = true;
    try { zxReader?.reset(); } catch {}
    stream?.getTracks().forEach((t) => t.stop());
  };
  const closeModal = modal({
    title: 'Ler código pela câmera',
    html: sup.ok
      ? `<p class="small muted" style="margin:0">Aponte para o código de barras da embalagem, dentro da faixa amarela.</p>
         <div class="video-wrap"><video playsinline muted autoplay></video></div>
         <p class="small" data-scan-msg aria-live="polite" style="margin:10px 0 0"></p>`
      : `<div class="card card--warn">${icon('alert')} ${esc(sup.reason)}</div><p class="small">Você pode digitar o código ou usar um leitor físico (USB/Bluetooth).</p>`,
    onClose: stop,
    async onMount(m, close) {
      const origClose = close;
      if (!sup.ok) return;
      const video = m.querySelector('video');
      const msg = m.querySelector('[data-scan-msg]');
      const done = (raw) => {
        const g = validateGtin(raw);
        if (!g.valid) { msg.textContent = `Leitura ${raw}: ${g.error}`; return false; }
        stop();
        origClose();
        navigator.vibrate?.(80);
        onCode(g.code);
        return true;
      };
      try {
        if ('BarcodeDetector' in window) {
          const formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf'];
          const supported = await window.BarcodeDetector.getSupportedFormats?.() || formats;
          const det = new window.BarcodeDetector({ formats: formats.filter((f) => supported.includes(f)) });
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } } });
          video.srcObject = stream;
          await video.play();
          msg.textContent = 'Procurando código…';
          const tick = async () => {
            if (stopped) return;
            try {
              const codes = await det.detect(video);
              for (const c of codes) if (done(c.rawValue)) return;
            } catch {}
            setTimeout(tick, 180);
          };
          tick();
        } else {
          msg.textContent = 'Carregando leitor…';
          const ZX = await loadZxing();
          const hints = new Map();
          hints.set(ZX.DecodeHintType.POSSIBLE_FORMATS, [ZX.BarcodeFormat.EAN_13, ZX.BarcodeFormat.EAN_8, ZX.BarcodeFormat.UPC_A, ZX.BarcodeFormat.UPC_E, ZX.BarcodeFormat.ITF]);
          zxReader = new ZX.BrowserMultiFormatReader(hints, 200);
          msg.textContent = 'Procurando código…';
          await zxReader.decodeFromConstraints({ video: { facingMode: 'environment' } }, video, (res) => {
            if (res && !stopped) done(res.getText());
          });
        }
      } catch (e) {
        msg.innerHTML = e.name === 'NotAllowedError'
          ? 'Permissão da câmera negada. Libere o acesso nas configurações do navegador ou digite o código.'
          : `Não foi possível abrir a câmera (${esc(e.message || e.name)}). Digite o código ou use um leitor físico.`;
      }
    },
  });
  return () => { stop(); closeModal(); };
}

/** Lê o código a partir de uma foto (funciona mesmo sem câmera ao vivo: o celular abre a câmera nativa). */
export async function decodeFromPhoto(file) {
  const ZX = await loadZxing();
  const hints = new Map();
  hints.set(ZX.DecodeHintType.POSSIBLE_FORMATS, [ZX.BarcodeFormat.EAN_13, ZX.BarcodeFormat.EAN_8, ZX.BarcodeFormat.UPC_A, ZX.BarcodeFormat.UPC_E, ZX.BarcodeFormat.ITF]);
  hints.set(ZX.DecodeHintType.TRY_HARDER, true);
  const reader = new ZX.BrowserMultiFormatReader(hints);
  const url = URL.createObjectURL(file);
  try {
    const res = await reader.decodeFromImageUrl(url);
    return res.getText();
  } catch {
    throw new Error('Não foi possível ler o código nesta foto. Aproxime, evite reflexo e mantenha as barras na horizontal.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
