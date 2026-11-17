/** Browser-native voice and genuine browser-local language-model dialogue. */
export class CompanionInteraction extends EventTarget {
  constructor({ ai = null, onDraft = () => {}, onMessage = () => {}, onSpeaking = () => {}, onAction = () => {}, onState = () => {} } = {}) {
    super();
    this.ai = ai;
    this.onDraft = onDraft;
    this.history = [];
    this.isThinking = false;
    this._abortController = null;
    this.onMessage = onMessage;
    this.onSpeaking = onSpeaking;
    this.onAction = onAction;
    this.onState = onState;
    this.name = 'MOMO';
    this.voiceEnabled = true;
    this.isListening = false;
    this.isSinging = false;
    this.engine = 'ondevice';
    this._generation = 0;
    this._timers = new Set();
    this._nodes = new Set();
    this._recognition = null;
    this._audio = null;
    this._utterance = null;
    this._songPending = false;
    this._emitState();
  }

  setName(value) {
    this.name = String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 20) || 'MOMO';
    this.ai?.setName?.(this.name);
    return this.name;
  }

  _emitState(extra = {}) {
    this.onState({ listening: this.isListening, voiceEnabled: this.voiceEnabled, singing: this.isSinging, thinking: this.isThinking, aiReady: Boolean(this.ai?.ready), engine: 'ondevice', ...extra });
  }

  _later(fn, delay) {
    const timer = setTimeout(() => { this._timers.delete(timer); fn(); }, delay);
    this._timers.add(timer);
    return timer;
  }

  async unlockAudio() {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return null;
    try {
      if (!this._audio || this._audio.state === 'closed') this._audio = new Context();
      if (this._audio.state === 'suspended') await this._audio.resume();
      return this._audio;
    } catch { return null; }
  }

  setVoiceEnabled(enabled) {
    this.voiceEnabled = !!enabled;
    if (!this.voiceEnabled) {
      this._utterance = null;
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      if (this.isSinging || this._songPending) this.stop();
      this.onSpeaking(false);
    } else {
      this.unlockAudio();
    }
    this._emitState();
  }

  stop({ keepRecognition = false } = {}) {
    this._generation++;
    const controller = this._abortController;
    this._abortController = null;
    if (controller) controller.abort();
    this.isThinking = false;
    this.onDraft('');
    for (const timer of this._timers) clearTimeout(timer);
    this._timers.clear();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    this._utterance = null;
    for (const node of this._nodes) {
      try { node.stop(); } catch {}
      try { node.disconnect(); } catch {}
    }
    this._nodes.clear();
    this.isSinging = false;
    this._songPending = false;
    if (!keepRecognition && this._recognition) {
      try { this._recognition.abort(); } catch {}
      this._recognition = null;
      this.isListening = false;
    }
    this.onSpeaking(false);
    this.onAction('idle');
    this._emitState();
  }

  clearHistory() {
    this.stop();
    this.history = [];
  }

  _trimHistory() {
    const length = () => this.history.reduce((sum, message) => sum + message.content.length, 0);
    while (this.history.length > 12 || length() > 6000) this.history.splice(0, 2);
  }

  _rememberTurn(user, assistant) {
    this.history.push({ role: 'user', content: user }, { role: 'assistant', content: assistant });
    this._trimHistory();
  }

  _messagesFor(text) {
    const messages = this.history.map(message => ({ ...message }));
    const length = () => messages.reduce((sum, message) => sum + message.content.length, 0) + text.length;
    // Leave room for this user message while preserving completed user/assistant pairs.
    while (messages.length > 10 || length() > 6000) messages.splice(0, 2);
    return [...messages, { role: 'user', content: text }];
  }

  _isSingCommand(text) {
    return /^(?:(?:請|你|妳|可以|能不能|可不可以|幫我|給我|再|我想聽|想聽|來|幫忙|能)\s*)*(?:唱|哼)(?:一首|首|一段|段|個|一下|下)?(?:歌|歌曲|小曲)?(?:給我聽|給我|聽|嗎|吧|呀|啊|一下|！|!|。|？|\?|\s)*$/i.test(text)
      || /^sing(?: me)?(?: a)?(?: song)?[.!?\s]*$/i.test(text);
  }

  _actionFor(text) {
    if (/跳.{0,4}舞|跳支|舞蹈|\bdance\b|一起跳/i.test(text)) return 'dance';
    if (/停止|停下|安靜|休息|\bstop\b|別說/i.test(text)) return 'idle';
    if (/早安|午安|晚安|你好|嗨|哈囉|\bhello\b|\bhi\b|こんにちは|再見|拜拜|\bbye\b|難過|傷心|有點累|謝謝/i.test(text)) return 'wave';
    return 'happy';
  }

  async send(value) {
    const text = String(value || '').trim().slice(0, 500);
    if (!text) return;
    this.stop();
    this.onMessage({ role: 'user', text });
    if (this._isSingCommand(text)) {
      const songText = await this.sing({ includeMessage: true });
      if (songText) this._rememberTurn(text, songText);
      return songText;
    }
    if (!this.ai?.ready) {
      const notice = '請先點「啟用 AI 對話」，完成語言模型載入後，我才能和你自然聊天。';
      this.onMessage({ role: 'assistant', text: notice, kind: 'status' });
      this._emitState({ notice });
      return;
    }

    const generation = this._generation;
    const controller = new AbortController();
    this._abortController = controller;
    this.isThinking = true;
    this._emitState();
    let draft = '';
    try {
      const result = await this.ai.generate(this._messagesFor(text), {
        signal: controller.signal,
        onToken: (delta, fullText) => {
          if (generation !== this._generation || controller.signal.aborted) return;
          draft = typeof fullText === 'string' ? fullText : draft + String(delta || '');
          this.onDraft(draft);
        }
      });
      if (generation !== this._generation || controller.signal.aborted) return;
      const reply = String(result || draft).trim();
      if (!reply) throw new Error('模型沒有產生回覆，請再試一次。');
      this.isThinking = false;
      this._abortController = null;
      this.onDraft('');
      this._rememberTurn(text, reply);
      this.onMessage({ role: 'assistant', text: reply, kind: 'ai' });
      const action = this._actionFor(text);
      this.onAction(action);
      this._speak(reply, { action });
      if (action === 'dance') this._later(() => {
        if (generation === this._generation) this.onAction('idle');
      }, 14000);
      return reply;
    } catch (error) {
      if (generation !== this._generation || controller.signal.aborted || error?.name === 'AbortError') return;
      this.onDraft('');
      const detail = String(error?.message || '請確認模型已載入，再試一次。').slice(0, 220);
      const notice = `AI 暫時無法回覆：${detail}`;
      this.onMessage({ role: 'assistant', text: notice, kind: 'error' });
      this._emitState({ notice });
      return;
    } finally {
      if (generation === this._generation) {
        this.isThinking = false;
        if (this._abortController === controller) this._abortController = null;
        this._emitState();
      }
    }
  }

  _speak(text, { action } = {}) {
    const settleSilentAction = () => {
      if (action === 'dance' || action === 'idle') return;
      const generation = this._generation;
      this._later(() => { if (generation === this._generation) this.onAction('idle'); }, 4000);
    };
    if (!this.voiceEnabled) { this.onSpeaking(false); settleSilentAction(); return; }
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
      this._emitState({ notice: '這個瀏覽器無法播放語音，您仍可閱讀對話文字。' });
      settleSilentAction();
      return;
    }
    const generation = this._generation;
    const utterance = new SpeechSynthesisUtterance(text);
    this._utterance = utterance;
    utterance.lang = 'zh-TW';
    utterance.rate = 1.02;
    utterance.pitch = 1.28;
    utterance.volume = 0.9;
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => /zh[-_]TW/i.test(v.lang)) || voices.find(v => /^zh/i.test(v.lang));
    if (voice) utterance.voice = voice;
    utterance.onstart = () => { if (generation === this._generation && this._utterance === utterance && this.voiceEnabled) this.onSpeaking(true); };
    utterance.onend = () => {
      if (generation !== this._generation || this._utterance !== utterance) return;
      this.onSpeaking(false);
      this._utterance = null;
      if (action !== 'dance') this.onAction('idle');
    };
    utterance.onerror = event => {
      if (generation !== this._generation || this._utterance !== utterance) return;
      this.onSpeaking(false);
      this._utterance = null;
      if (action !== 'dance') this.onAction('idle');
      if (event.error !== 'canceled' && event.error !== 'interrupted') this._emitState({ notice: '語音暫時無法播放，對話文字已顯示。' });
    };
    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch {
      this.onSpeaking(false);
      settleSilentAction();
      this._emitState({ notice: '語音無法啟動，請先點一下聲音按鈕再試一次。' });
    }
  }

  toggleListening() {
    if (this.isListening) {
      if (this._recognition) {
        try { this._recognition.stop(); } catch {}
      }
      this.isListening = false;
      this._emitState();
      return;
    }
    return this.listen();
  }

  listen() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      this._emitState({ notice: '此瀏覽器未提供語音辨識，請改用下方文字輸入。Android 建議使用 Chrome。' });
      return false;
    }
    this.stop();
    this.unlockAudio();
    let delivered = false;
    const recognition = new Recognition();
    this._recognition = recognition;
    recognition.lang = 'zh-TW';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      if (recognition !== this._recognition) return;
      this.isListening = true;
      this._emitState({ notice: '正在聽，請說話…', transcript: '' });
    };
    recognition.onresult = event => {
      if (recognition !== this._recognition || delivered) return;
      let finalText = '';
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalText += event.results[i][0].transcript;
        else interimText += event.results[i][0].transcript;
      }
      this._emitState({ transcript: finalText || interimText });
      if (finalText.trim()) {
        delivered = true;
        this.isListening = false;
        this._recognition = null;
        try { recognition.stop(); } catch {}
        this._emitState({ notice: '' });
        this.send(finalText);
      }
    };
    recognition.onerror = event => {
      if (recognition !== this._recognition) return;
      this.isListening = false;
      const errors = {
        'not-allowed': '麥克風權限尚未開啟，請允許瀏覽器使用麥克風，或改用文字輸入。',
        'service-not-allowed': '這個瀏覽器無法使用語音辨識服務，請改用文字輸入。',
        'audio-capture': '找不到麥克風，請確認裝置與瀏覽器的麥克風設定。',
        'no-speech': '沒有聽到聲音，再點一次麥克風試試看。',
        'network': '語音辨識服務連線失敗，請檢查網路，或改用文字輸入。'
      };
      this._emitState({ notice: event.error === 'aborted' ? '' : (errors[event.error] || '語音辨識暫時無法使用，您可以改用文字輸入。') });
      this._recognition = null;
    };
    recognition.onend = () => {
      if (recognition !== this._recognition) return;
      this.isListening = false;
      this._recognition = null;
      this._emitState();
    };
    try {
      recognition.start();
      this.isListening = true;
      this._emitState({ notice: '正在啟動麥克風…' });
      return true;
    } catch {
      this._recognition = null;
      this.isListening = false;
      this._emitState({ notice: '麥克風啟動失敗，請稍後再試，或改用文字輸入。' });
      return false;
    }
  }

  /** 16-second original melody sung as synthesised "oo / la" vowels. */
  async sing({ includeMessage = true } = {}) {
    this.stop();
    this._songPending = true;
    const generation = this._generation;
    const context = this.voiceEnabled ? await this.unlockAudio() : null;
    if (generation !== this._generation) return;
    this._songPending = false;
    const songText = '送你一首我的原創小曲《今天也要開心》♪\n啦啦啦，陽光輕輕走；啦啦啦，快樂跟著我。\n（合成音色哼唱，約 16 秒）';
    if (includeMessage) this.onMessage({ role: 'assistant', text: songText, kind: 'song' });
    this.isSinging = true;
    this.onAction('sing');
    this._emitState({ notice: !this.voiceEnabled ? `目前已靜音；開啟聲音後可以聽到 ${this.name} 的小曲。` : context ? `${this.name} 正在哼唱原創小曲 ♪` : `此瀏覽器無法啟動音訊，但 ${this.name} 仍會為你表演。` });
    if (context) this._playSong(context, generation);
    this._later(() => {
      if (generation !== this._generation) return;
      this.isSinging = false;
      this.onSpeaking(false);
      this.onAction('happy');
      this._emitState({ notice: '小曲唱完了，謝謝你聽我唱歌！' });
      this._later(() => { if (generation === this._generation) this.onAction('idle'); }, 1500);
    }, 16400);
    return songText;
  }

  _playSong(context, generation) {
    const master = context.createGain();
    master.gain.value = 0.22;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.ratio.value = 4;
    master.connect(compressor);
    compressor.connect(context.destination);
    this._nodes.add(master);
    this._nodes.add(compressor);
    const start = context.currentTime + 0.06;
    const beat = 0.5;
    const hz = midi => 440 * 2 ** ((midi - 69) / 12);
    // Thirty-two beats: C major, four phrases, composed for this companion.
    const melody = [
      [72,1],[76,1],[79,1],[76,1],[74,1],[72,1],[74,2],
      [76,1],[79,1],[81,1],[79,1],[76,2],[74,2],
      [72,1],[74,1],[76,1],[79,1],[81,1],[79,1],[76,2],
      [74,1],[76,1],[74,1],[71,1],[72,4]
    ];
    let position = 0;
    for (const [midi, duration] of melody) {
      const at = start + position * beat;
      const length = duration * beat * 0.88;
      const voice = context.createOscillator();
      voice.type = 'sawtooth';
      voice.frequency.setValueAtTime(hz(midi) * 0.985, at);
      voice.frequency.exponentialRampToValueAtTime(hz(midi), at + 0.055);
      const vibrato = context.createOscillator();
      const vibratoAmount = context.createGain();
      vibrato.frequency.value = 5.2;
      vibratoAmount.gain.value = 2.6;
      vibrato.connect(vibratoAmount);
      vibratoAmount.connect(voice.frequency);
      const envelope = context.createGain();
      envelope.gain.setValueAtTime(0, at);
      envelope.gain.linearRampToValueAtTime(0.24, at + 0.035);
      envelope.gain.setValueAtTime(0.20, at + Math.max(0.045, length - 0.07));
      envelope.gain.linearRampToValueAtTime(0, at + length);
      // Three formants create a soft, vowel-like singing tone.
      [[560,4.2,1],[1120,5,0.5],[2500,7,0.1]].forEach(([frequency, q, gain]) => {
        const filter = context.createBiquadFilter();
        const formantGain = context.createGain();
        filter.type = 'bandpass';
        filter.frequency.value = frequency;
        filter.Q.value = q;
        formantGain.gain.value = gain;
        voice.connect(filter);
        filter.connect(formantGain);
        formantGain.connect(envelope);
        this._nodes.add(filter);
        this._nodes.add(formantGain);
      });
      envelope.connect(master);
      voice.start(at);
      voice.stop(at + length + 0.02);
      vibrato.start(at);
      vibrato.stop(at + length + 0.02);
      [voice, vibrato, vibratoAmount, envelope].forEach(node => this._nodes.add(node));
      this._later(() => { if (generation === this._generation) this.onSpeaking(true); }, (at - context.currentTime) * 1000);
      this._later(() => { if (generation === this._generation) this.onSpeaking(false); }, (at + length - context.currentTime) * 1000);
      position += duration;
    }
    // A quiet plucked accompaniment, scheduled with the same audio clock.
    const roots = [48,53,55,48];
    for (let bar = 0; bar < 4; bar++) {
      for (let pulse = 0; pulse < 8; pulse++) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const at = start + (bar * 8 + pulse) * beat;
        oscillator.type = 'sine';
        oscillator.frequency.value = hz(roots[bar] + [0,7,12,7][pulse % 4]);
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(0.27, at + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.001, at + 0.4);
        oscillator.connect(gain);
        gain.connect(master);
        oscillator.start(at);
        oscillator.stop(at + 0.42);
        this._nodes.add(oscillator);
        this._nodes.add(gain);
      }
    }
    this._later(() => {
      if (generation !== this._generation) return;
      for (const node of this._nodes) {
        try { node.disconnect(); } catch {}
      }
      this._nodes.clear();
    }, 16300);
  }

  destroy() {
    this.stop();
    if (this._audio && this._audio.state !== 'closed') this._audio.close().catch(() => {});
  }
}
