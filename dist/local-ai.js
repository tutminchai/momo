/** Browser-local generative AI; initialization only starts on an explicit click. */
export class LocalCompanionAI extends EventTarget {
  constructor({ name = 'MOMO', onProgress = () => {} } = {}) {
    super();
    this.name = name;
    this.onProgress = onProgress;
    this.ready = false;
    this.loading = false;
    this.backend = null;
    this.dtype = null;
    this.model = 'onnx-community/Qwen3-0.6B-ONNX';
    this._worker = null;
    this._requests = new Map();
    this._serial = 0;
    this._initializing = null;
    this._activeId = null;
  }

  get isReady() { return this.ready; }
  setName(name) { this.name = String(name || 'MOMO').trim().slice(0, 20) || 'MOMO'; }
  _state() { this.dispatchEvent(new CustomEvent('statechange', { detail: { ready: this.ready, loading: this.loading, backend: this.backend, dtype: this.dtype } })); }

  _ensureWorker() {
    if (this._worker) return;
    if (!('Worker' in window) || typeof WebAssembly === 'undefined') throw new Error('這個瀏覽器無法執行本機 AI，請改用最新版 Chrome 或 Edge。');
    this._worker = new Worker(new URL('./local-ai-worker.js?v=20261117-ai3', import.meta.url), { type: 'module' });
    this._worker.addEventListener('message', event => {
      const data = event.data || {};
      const request = this._requests.get(data.id);
      if (!request) return;
      if (data.type === 'progress') {
        this.onProgress(data);
        this.dispatchEvent(new CustomEvent('progress', { detail: data }));
      } else if (data.type === 'token') {
        if (this._activeId === data.id) request.onToken?.(data.token, data.text);
      } else if (data.type === 'ready' || data.type === 'result') {
        this._finish(data.id);
        request.resolve(data.type === 'result' ? data.text : data);
      } else if (data.type === 'cancelled') {
        this._finish(data.id);
        request.reject(new DOMException('已停止回覆', 'AbortError'));
      } else if (data.type === 'error') {
        this._finish(data.id);
        request.reject(new Error(data.message || 'AI 暫時無法回應，請稍後再試。'));
      }
    });
    this._worker.addEventListener('error', () => {
      const error = new Error('AI 引擎載入失敗，請確認網路可連線至 jsDelivr 與 Hugging Face，再重新啟用。');
      for (const id of [...this._requests.keys()]) { const request = this._requests.get(id); this._finish(id); request.reject(error); }
      this._worker?.terminate(); this._worker = null;
      this.ready = false; this.loading = false; this._initializing = null; this._state();
    });
  }

  _finish(id) {
    const request = this._requests.get(id);
    request?.cleanup?.();
    this._requests.delete(id);
    if (this._activeId === id) this._activeId = null;
  }

  async initialize() {
    if (this.ready) return { model: this.model, backend: this.backend, dtype: this.dtype };
    if (this._initializing) return this._initializing;
    try { this._ensureWorker(); }
    catch (error) { this.loading = false; this._state(); throw error; }
    this.loading = true; this._state();
    const id = 'init-' + (++this._serial);
    this._initializing = new Promise((resolve, reject) => {
      this._requests.set(id, { resolve, reject });
      this._worker.postMessage({ type: 'initialize', id });
    }).then(info => {
      this.ready = true; this.backend = info.backend; this.dtype = info.dtype;
      this.onProgress({ progress: 1, message: 'AI 已就緒，可以開始自然對話。', backend: this.backend, dtype: this.dtype });
      return info;
    }).finally(() => { this.loading = false; this._initializing = null; this._state(); });
    return this._initializing;
  }

  async generate(messages, { onToken, signal } = {}) {
    if (!this.ready || !this._worker) throw new Error('請先點「啟用 AI 對話」，完成模型下載後再聊天。');
    if (signal?.aborted) throw new DOMException('已停止回覆', 'AbortError');
    this.cancel();
    const id = 'chat-' + (++this._serial);
    this._activeId = id;
    return new Promise((resolve, reject) => {
      const abort = () => {
        if (!this._requests.has(id)) return;
        this._worker?.postMessage({ type: 'cancel', id });
        this._finish(id);
        reject(new DOMException('已停止回覆', 'AbortError'));
      };
      this._requests.set(id, { resolve, reject, onToken, cleanup: () => signal?.removeEventListener('abort', abort) });
      signal?.addEventListener('abort', abort, { once: true });
      this._worker.postMessage({ type: 'generate', id, name: this.name, messages });
    });
  }

  cancel() {
    const id = this._activeId;
    if (!id) return;
    const request = this._requests.get(id);
    this._worker?.postMessage({ type: 'cancel', id });
    this._finish(id);
    request?.reject(new DOMException('已停止回覆', 'AbortError'));
  }

  dispose() {
    for (const id of [...this._requests.keys()]) { const request = this._requests.get(id); this._finish(id); request.reject(new DOMException('AI 已關閉', 'AbortError')); }
    this._worker?.terminate(); this._worker = null;
    this.ready = false; this.loading = false; this._initializing = null; this._state();
  }
}
