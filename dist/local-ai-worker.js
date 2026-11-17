// Genuine, on-device language generation. No conversation is sent to a server.
const LIBRARY = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.web.min.js';
const CONVERTER = 'https://cdn.jsdelivr.net/npm/opencc-js@1.0.5/dist/esm/cn2t.js';
const MODEL = 'onnx-community/Qwen3-0.6B-ONNX-OPT';
const REVISION = '4799e655597b49210adb5c1ebe5b9d3bd04005a0';
let library;
let toTraditional = text => text;
let generator;
let loading;
let backend = 'wasm';
let dtype = 'q4';
let current;
let queue = Promise.resolve();
const cancelled = new Set();
const post = (type, id, extra = {}) => self.postMessage({ type, id, ...extra });

function readableError(error) {
  const message = String(error?.message || error || '未知錯誤');
  if (/out of memory|memory access|allocation|Array buffer|too large/i.test(message)) return '裝置記憶體不足，無法載入 AI 模型。請關閉其他分頁後重試，或改用記憶體較充足的裝置。';
  if (/fetch|network|connection|download|HTTP|Failed to load|Failed to retrieve/i.test(message)) return 'AI 模型下載失敗。請確認能連上 Hugging Face 與 jsDelivr，並使用穩定 Wi-Fi 後重試。';
  if (/WebAssembly|wasm|backend|WebGPU|GPU|shader|adapter/i.test(message)) return '這個瀏覽器無法啟動本機 AI 引擎，請改用最新版 Chrome 或 Edge 再試。';
  return '本機 AI 暫時無法運作：' + message.slice(0, 180);
}

async function initialize(id) {
  if (generator) return { model: MODEL, backend, dtype };
  if (loading) return loading;
  loading = (async () => {
    post('progress', id, { progress: 0, message: '正在載入 AI 引擎…' });
    const modules = await Promise.all([import(LIBRARY), import(CONVERTER)]);
    library = modules[0];
    toTraditional = modules[1].Converter({ from: 'cn', to: 'tw' });
    library.env.allowLocalModels = false;
    library.env.useBrowserCache = true;
    // GitHub Pages does not send cross-origin-isolation headers. One WASM
    // thread in a dedicated worker keeps both model and AR compatible.
    library.env.backends.onnx.wasm.numThreads = 1;
    library.env.backends.onnx.wasm.proxy = false;
    // Keep the pinned library's matching ONNX Runtime asyncify/WASM paths;
    // overriding them with a different runtime version breaks model operators.
    let adapter;
    try { adapter = await self.navigator?.gpu?.requestAdapter({ powerPreference: 'high-performance' }); } catch { /* Use WASM. */ }
    if (adapter?.features.has('shader-f16')) { backend = 'webgpu'; dtype = 'q4f16'; }
    else { backend = 'wasm'; dtype = 'q4'; }
    const files = new Map();
    const download = async () => {
      const expectedBytes = dtype === 'q4f16' ? 370_000_000 : 420_000_000;
      return library.pipeline('text-generation', MODEL, {
        revision: REVISION,
        dtype,
        device: backend,
        progress_callback: info => {
          if (info.status === 'progress') files.set(info.file, { loaded: Number(info.loaded) || 0, total: Number(info.total) || 0 });
          const loaded = [...files.values()].reduce((sum, item) => sum + item.loaded, 0);
          const progress = Math.min(0.95, 0.02 + loaded / expectedBytes * 0.92);
          const message = info.status === 'ready' ? '正在準備對話…'
            : /\.onnx/.test(info.file || '') && info.status === 'done' ? '模型已下載，正在準備推論引擎…'
            : loaded > 0 ? `正在下載 AI 模型：${Math.round(loaded / 1_000_000)} MB（首次約 400 MB）`
            : `正在準備${backend === 'webgpu' ? 'GPU' : '相容 CPU'}模型…`;
          post('progress', id, { progress, message, file: info.file, loaded, backend, dtype });
        }
      });
    };
    try { generator = await download(); }
    catch (error) {
      if (backend !== 'webgpu' || /fetch|network|download|HTTP/i.test(String(error?.message))) throw error;
      post('progress', id, { progress: 0.02, message: 'GPU 模型無法啟動，改用相容 CPU 模型；可能需要再下載約 400 MB。' });
      backend = 'wasm'; dtype = 'q4'; files.clear();
      generator = await download();
    }
    return { model: MODEL, backend, dtype };
  })();
  try { return await loading; }
  catch (error) { loading = null; throw error; }
}

async function generate(data) {
  if (cancelled.delete(data.id)) { post('cancelled', data.id); return; }
  if (!generator) throw new Error('請先啟用並完成 AI 模型下載。');
  const name = String(data.name || 'MOMO').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 20);
  const allMessages = (Array.isArray(data.messages) ? data.messages : [])
    .filter(item => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string')
    .slice(-10).map(item => ({ role: item.role, content: item.content.slice(0, 1000) }));
  // Bound mobile KV-cache memory while retaining several recent turns.
  const history = [];
  let budget = 2200;
  for (let i = allMessages.length - 1; i >= 0 && budget > 0; i--) {
    const item = allMessages[i];
    if (item.content.length > budget && history.length) break;
    const content = item.content.slice(-budget);
    history.unshift({ role: item.role, content }); budget -= content.length;
  }
  while (history[0]?.role === 'assistant') history.shift();
  if (!history.length || history.at(-1).role !== 'user') throw new Error('請先輸入想說的話。');
  const prompt = [{ role: 'system', content: `你是親切的聊天助手${name}。請根據使用者的話用繁體中文直接回覆，最多兩句，不要寫動作描寫或舞台指示。` }, ...history];
  const input = generator.tokenizer.apply_chat_template(prompt, { tokenize: false, add_generation_prompt: true, enable_thinking: false });
  const stopping = new library.InterruptableStoppingCriteria();
  current = { id: data.id, stopping };
  let text = '';
  let displayed = '';
  const streamer = new library.TextStreamer(generator.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: token => {
      text += token;
      const converted = toTraditional(text);
      const delta = converted.startsWith(displayed) ? converted.slice(displayed.length) : toTraditional(token);
      displayed = converted;
      if (!cancelled.has(data.id)) post('token', data.id, { token: delta, text: converted });
    }
  });
  try {
    const result = await generator(input, {
      max_new_tokens: 160,
      do_sample: false,
      temperature: 0.7,
      top_p: 0.8,
      top_k: 20,
      return_full_text: false,
      repetition_penalty: 1.05,
      streamer,
      stopping_criteria: [stopping],
    });
    if (cancelled.delete(data.id)) { post('cancelled', data.id); return; }
    const generated = result?.[0]?.generated_text;
    const final = (Array.isArray(generated) ? generated.at(-1)?.content : text || generated || '').trim();
    if (!final) throw new Error('AI 沒有產生回覆，請換個說法再試一次。');
    post('result', data.id, { text: toTraditional(final) });
  } finally { current = null; }
}

self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type === 'initialize') {
    initialize(data.id).then(info => post('ready', data.id, info)).catch(error => post('error', data.id, { message: readableError(error) }));
  } else if (data.type === 'generate') {
    queue = queue.then(() => generate(data)).catch(error => post('error', data.id, { message: readableError(error) }));
  } else if (data.type === 'cancel') {
    cancelled.add(data.id);
    if (current?.id === data.id) current.stopping.interrupt();
  }
});
