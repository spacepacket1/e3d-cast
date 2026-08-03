'use strict';

(function () {
  const STORAGE_KEY = 'cast-ui-state-v1';
  const E3D_ETH_ADDRESS = '0x6488861b401F427D13B6619C77C297366bCf6386';
  const WE3D_BASE_ADDRESS = '0xDFC9E32Dd0542D12c08ED15FEfadBAe8071B48A5';
  const ETH_RPC = 'https://cloudflare-eth.com';
  const BASE_RPC = 'https://mainnet.base.org';
  const modes = [
    { id: 'prompt', label: 'AI Prompt', copy: 'Type one sentence — AI writes the script and renders the video.' },
    { id: 'transcript', label: 'Transcript', copy: 'Paste transcript text, preview the tier fit, and create a video.' },
    { id: 'card', label: 'Video Card', copy: 'Birthday, congratulations, or any occasion — AI writes it and can email a link.' },
    { id: 'audio', label: 'Audio', copy: 'Upload a file or paste a source URL, then create a video.' },
  ];

  // Per-mode title/description/tags and Basic-mode preset. Applied whenever
  // the active mode changes (and, for Basic mode's preset, on every render)
  // so a job created from AI Prompt or Video Card doesn't inherit stale
  // "transcript" wording/format left over from whichever mode was active
  // before -- Basic mode hides the Title field entirely, so most users never
  // see or correct it themselves.
  const MODE_DEFAULTS = {
    prompt: { title: 'Cast AI prompt video', description: 'AI-written script from a one-line topic, rendered into video.', tags: 'cast,e3d,ai-prompt', preset: 'transcript_short' },
    transcript: { title: 'Cast transcript short', description: 'Preview subtitle style, watermark state, metadata, and pricing before spend.', tags: 'cast,e3d,transcript', preset: 'transcript_video' },
    card: { title: 'Cast video card', description: 'AI-written occasion video card, optionally emailed to the recipient.', tags: 'cast,e3d,video-card', preset: 'transcript_short' },
    audio: { title: 'Cast audio video', description: 'Audio-driven render with diarization, captions, and metadata.', tags: 'cast,e3d,audio', preset: 'youtube' },
  };

  function modeLabel(id) {
    const mode = modes.find((entry) => entry.id === id);
    return mode ? mode.label : (id || 'n/a');
  }

  function presetLabel(id) {
    const preset = presets.find((entry) => entry.id === id);
    return preset ? preset.title : (id || 'n/a');
  }

  // Prefers the server's createdAt (authoritative, present once remoteStatus
  // has loaded) but falls back to the local timestamp stamped at creation
  // time (see trackNewJob) so a just-created row shows a date immediately
  // instead of waiting on the first poll/fetch.
  function formatJobDate(job) {
    const raw = (job.remoteStatus && job.remoteStatus.createdAt) || job.createdAt;
    if (!raw) return '';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return '';
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    return date.toLocaleString(undefined, {
      month: isToday ? undefined : 'short',
      day: isToday ? undefined : 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  const presets = [
    { id: 'short', title: 'Short', aspect: '9:16', copy: 'Mobile-first clips with captions and watermark-aware defaults.' },
    { id: 'youtube', title: 'YouTube video', aspect: '16:9', copy: 'Longer-form widescreen package with metadata and thumbnail.' },
    { id: 'transcript_video', title: 'Transcript video', aspect: '16:9', copy: 'Narrated or caption-led transcript packaging for desktop video.' },
    { id: 'transcript_short', title: 'Transcript short', aspect: '9:16', copy: 'Fast transcript-to-short flow with six style templates.' },
  ];
  const styles = [
    { id: 'clean_podcast', title: 'Clean podcast' },
    { id: 'bold_mobile', title: 'Bold mobile' },
    { id: 'finance_signal', title: 'Finance signal' },
    { id: 'developer_demo', title: 'Developer demo' },
    { id: 'news_brief', title: 'News brief' },
    { id: 'minimal_subtitles', title: 'Minimal subtitles' },
  ];

  const samples = [
    {
      id: 'sample-transcript',
      title: 'Transcript short demo',
      preset: 'transcript_short',
      inputKind: 'transcript',
      style: 'bold_mobile',
      aspect: '9:16',
      description: 'Public transcript example with energetic mobile captions and visible free-tier watermark.',
      outputSummary: 'Preview frame, captions, metadata, and sample artifact bundle.',
    },
    {
      id: 'sample-audio',
      title: 'Audio to YouTube package',
      preset: 'youtube',
      inputKind: 'upload',
      style: 'clean_podcast',
      aspect: '16:9',
      description: 'Audio-driven long-form output with thumbnail, metadata, and archive-ready manifest.',
      outputSummary: 'Widescreen render preview, chapters, and publish metadata.',
    },
    {
      id: 'sample-agent',
      title: 'Agent-generated finance brief',
      preset: 'short',
      inputKind: 'url',
      style: 'finance_signal',
      aspect: '1:1',
      description: 'Agent-mode output example for copyable curl and `e3d-agent` usage.',
      outputSummary: 'Square preview, signal captions, and automation-friendly artifact manifest.',
    },
  ];

  // A real render from production (cast_job_9034809111fff54b) backing the
  // "Audio to YouTube package" sample, instead of the synthetic SVG
  // poster + JSON manifest the other samples still use. Served from
  // /samples/* (public, unauthenticated, range-request capable -- see
  // serveSampleAsset in src/server/index.js).
  const REAL_SAMPLE_ASSETS = {
    'sample-audio': {
      baseUrl: '/samples/audio-youtube',
      artifacts: [
        { artifactId: 'video', type: 'mp4', contentType: 'video/mp4', bytes: 603400139, fileName: 'video.mp4' },
        { artifactId: 'thumbnail', type: 'thumbnail', contentType: 'image/png', bytes: 25282, fileName: 'thumbnail.png' },
        { artifactId: 'captions', type: 'srt', contentType: 'application/x-subrip', bytes: 28281, fileName: 'captions.srt' },
        { artifactId: 'metadata', type: 'metadata', contentType: 'application/json', bytes: 351, fileName: 'metadata.json' },
      ],
    },
  };

  function realSampleArtifacts(sample) {
    const real = REAL_SAMPLE_ASSETS[sample.id];
    if (!real) return null;
    return real.artifacts.map((artifact) => ({ ...artifact, downloadUrl: `${real.baseUrl}/${artifact.fileName}` }));
  }

  // Basic mode (the default) hides Output preset / Caption style / Brand
  // kit / Platform metadata and just assumes these values, so a first-time
  // user isn't asked to make five decisions before creating anything.
  // Advanced mode reveals all of them, unchanged from before.
  const BASIC_MODE_DEFAULTS = {
    subtitleStyle: 'clean_podcast',
    brandEndCard: true,
    madeWithCast: true,
    archiveToIpfs: false,
  };

  const els = {
    connectWallet: document.querySelector('#connect-wallet'),
    getE3dLink: document.querySelector('#get-e3d-link'),
    walletDisplay: document.querySelector('#wallet-display'),
    holderBadge: document.querySelector('#holder-badge'),
    creditBalance: document.querySelector('#credit-balance'),
    creditKeyLabel: document.querySelector('#credit-key-label'),
    copyCreditKey: document.querySelector('#copy-credit-key'),
    activeTier: document.querySelector('#active-tier'),
    freeAttempts: document.querySelector('#free-attempts'),
    workspaceModeToggle: document.querySelector('#workspace-mode-toggle'),
    workspaceModeCopy: document.querySelector('#workspace-mode-copy'),
    advancedOptions: document.querySelector('#advanced-options'),
    inputModeTabs: document.querySelector('#input-mode-tabs'),
    inputModePanel: document.querySelector('#input-mode-panel'),
    presetGrid: document.querySelector('#preset-grid'),
    styleGrid: document.querySelector('#style-grid'),
    titleInput: document.querySelector('#title-input'),
    descriptionInput: document.querySelector('#description-input'),
    tagsInput: document.querySelector('#tags-input'),
    brandEndCard: document.querySelector('#brand-end-card'),
    madeWithToggle: document.querySelector('#made-with-toggle'),
    archiveToggle: document.querySelector('#archive-toggle'),
    watermarkCopy: document.querySelector('#watermark-copy'),
    rebateCopy: document.querySelector('#rebate-copy'),
    submitState: document.querySelector('#submit-state'),
    quoteJob: document.querySelector('#quote-job'),
    submitJob: document.querySelector('#submit-job'),
    tryFreeRender: document.querySelector('#try-free-render'),
    quotePanel: document.querySelector('#quote-panel'),
    quoteStatus: document.querySelector('#quote-status'),
    creditRequest: document.querySelector('#credit-request'),
    quotePurchase: document.querySelector('#quote-purchase'),
    purchaseQuote: document.querySelector('#purchase-quote'),
    txHash: document.querySelector('#tx-hash'),
    paymentMethod: document.querySelector('#payment-method'),
    registerPurchase: document.querySelector('#register-purchase'),
    refreshBalance: document.querySelector('#refresh-balance'),
    promoCodeInput: document.querySelector('#promo-code-input'),
    redeemPromoCode: document.querySelector('#redeem-promo-code'),
    promoCodeStatus: document.querySelector('#promo-code-status'),
    stripePacks: document.querySelector('#stripe-packs'),
    stripeStatus: document.querySelector('#stripe-status'),
    buyCreditsCta: document.querySelector('#buy-credits-cta'),
    heroCta: document.querySelector('#hero-cta'),
    heroBuyStarter: document.querySelector('#hero-buy-starter'),
    heroTryFree: document.querySelector('#hero-try-free'),
    jobsList: document.querySelector('#jobs-list'),
    loadWalletJobs: document.querySelector('#load-wallet-jobs'),
    tokenBalances: document.querySelector('#token-balances'),
    paymentsInfo: document.querySelector('#payments-info'),
    paymentsInfoDialog: document.querySelector('#payments-info-dialog'),
    dialogClose: document.querySelector('#dialog-close'),
  };

  // Shared by the initial state and by disconnectWallet()'s reset, so a
  // fresh default and "back to defaults after disconnect" can never drift
  // apart. workspaceMode is deliberately absent -- it's a UI preference
  // ("how do I want to use this app"), not wallet/session content, so
  // disconnecting shouldn't flip it back to Basic.
  function createDefaultState() {
    return {
      config: null,
      capabilities: null,
      wallet: '',
      creditKey: '',
      creditBalance: null,
      creditBalanceError: false,
      holderDiscountApplied: false,
      mode: 'prompt',
      preset: 'transcript_short',
      subtitleStyle: 'bold_mobile',
      transcriptText: 'Title: Time Tunnel\nHost: Welcome Time Traveller. Tell us your story.\nGuest: There I was, speeding through a wormhole, tumbling, and turning along the way.\nHost: It must have been scary. How long did it last?\nGuest: It felt like an eternity, but it really only lasted for a couple of seconds.\nHost: Do you remember any details?',
      sourceUrl: '',
      upload: null,
      uploadBusy: false,
      uploadError: '',
      uploadProgress: 0,
      transcriptionEngine: 'assemblyai',
      audioSource: 'upload',
      hostVoiceGender: 'male',
      guestVoiceGender: 'female',
      promptTopic: 'Interview a time traveller about wormhole physics',
      cardTopic: 'Jamie is turning 30 and loves hiking, board games, and terrible puns.',
      cardOccasion: 'birthday',
      recipientEmail: '',
      selectedSampleId: samples[0].id,
      // Matches the default mode ('prompt') above -- see MODE_DEFAULTS.
      title: MODE_DEFAULTS.prompt.title,
      description: MODE_DEFAULTS.prompt.description,
      tags: MODE_DEFAULTS.prompt.tags,
      archiveToIpfs: false,
      brandEndCard: true,
      madeWithCast: true,
      freeSampleAttemptsUsed: 0,
      quote: null,
      improveQuote: null,
      purchaseQuote: null,
      jobs: [],
      selectedJobId: '',
    };
  }

  const state = Object.assign(createDefaultState(), { workspaceMode: 'basic' }, loadState());

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch (_error) {
      return {};
    }
  }

  function persistState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      wallet: state.wallet,
      creditKey: state.creditKey,
      holderDiscountApplied: state.holderDiscountApplied,
      workspaceMode: state.workspaceMode,
      mode: state.mode,
      preset: state.preset,
      subtitleStyle: state.subtitleStyle,
      transcriptText: state.transcriptText,
      sourceUrl: state.sourceUrl,
      transcriptionEngine: state.transcriptionEngine,
      audioSource: state.audioSource,
      hostVoiceGender: state.hostVoiceGender,
      guestVoiceGender: state.guestVoiceGender,
      promptTopic: state.promptTopic,
      cardTopic: state.cardTopic,
      cardOccasion: state.cardOccasion,
      recipientEmail: state.recipientEmail,
      selectedSampleId: state.selectedSampleId,
      title: state.title,
      description: state.description,
      tags: state.tags,
      archiveToIpfs: state.archiveToIpfs,
      brandEndCard: state.brandEndCard,
      madeWithCast: state.madeWithCast,
      freeSampleAttemptsUsed: state.freeSampleAttemptsUsed,
      jobs: state.jobs,
      selectedJobId: state.selectedJobId,
    }));
  }

  function formatBytes(bytes) {
    if (!bytes && bytes !== 0) return 'n/a';
    if (bytes < 1000) return `${bytes} B`;
    if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(1)} KB`;
    if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
    return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
  }

  function shortWallet(value) {
    if (!value) return 'Not connected';
    return `${value.slice(0, 6)}...${value.slice(-4)}`;
  }

  function samplePoster(sample) {
    if (REAL_SAMPLE_ASSETS[sample.id]) {
      return `${REAL_SAMPLE_ASSETS[sample.id].baseUrl}/thumbnail.png`;
    }
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450">
        <defs>
          <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#182126"/>
            <stop offset="100%" stop-color="#bf4a2b"/>
          </linearGradient>
        </defs>
        <rect width="800" height="450" rx="32" fill="url(#g)"/>
        <circle cx="130" cy="100" r="90" fill="rgba(255,255,255,0.15)"/>
        <text x="48" y="78" font-family="Georgia, serif" font-size="28" fill="white">${sample.title}</text>
        <text x="48" y="122" font-family="Arial, sans-serif" font-size="18" fill="#ffe7df">${sample.description}</text>
        <rect x="48" y="300" width="340" height="72" rx="18" fill="rgba(255,255,255,0.9)"/>
        <text x="72" y="338" font-family="Arial, sans-serif" font-size="20" fill="#000">${sample.style.replace('_', ' ')}</text>
        <text x="72" y="364" font-family="Arial, sans-serif" font-size="16" fill="#444">${sample.preset} • ${sample.aspect}</text>
      </svg>
    `;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function selectedSample() {
    return samples.find((sample) => sample.id === state.selectedSampleId) || samples[0];
  }

  function currentTier() {
    return state.quote && state.quote.tier
      ? state.quote.tier
      : 'starter';
  }

  function currentInput() {
    if (state.mode === 'audio' && state.audioSource === 'upload') {
      return state.upload
        ? { kind: 'upload', uploadId: state.upload.uploadId, sizeBytes: state.upload.sizeBytes }
        : { kind: 'upload', uploadId: '', sizeBytes: 0 };
    }
    if (state.mode === 'audio' && state.audioSource === 'url') {
      return { kind: 'url', url: state.sourceUrl };
    }
    // Prompt mode's "topic" sub-path never reaches this function (it's routed
    // through quotePromptJob()/submitPromptJob() instead) -- this is only
    // ever hit for prompt mode's "I'll write my own script" sub-path.
    return { kind: 'transcript', text: state.transcriptText };
  }

  function currentOptions() {
    return {
      dryRun: false,
      subtitleStyle: state.subtitleStyle,
      transcriptionEngine: state.mode === 'audio' ? state.transcriptionEngine : 'assemblyai',
      brandEndCard: state.brandEndCard,
      archiveToIpfs: state.archiveToIpfs,
      // Only meaningful for genuine Transcript-mode submissions -- the worker
      // (e3d-cast/src/worker/index.js buildWorkerManifest) reads this as its
      // render text for transcript-kind jobs, so sending it unconditionally
      // used to leak whatever was left in this textarea (often still the
      // default placeholder) into AI Prompt/Video Card/Audio submissions too.
      // The server now overrides it with the real generated script for
      // prompt-to-podcast jobs regardless, but there's no reason to send it
      // at all outside Transcript mode.
      transcriptText: state.mode === 'transcript' ? state.transcriptText : undefined,
      // Video Card mode has no voice pickers -- let the renderer fall back to
      // its own distinct Host/Guest defaults instead of sending stale values
      // left over from another mode.
      voices: state.mode === 'card' ? undefined : { host: state.hostVoiceGender, guest: state.guestVoiceGender },
      title: state.title,
      description: state.description,
      tags: state.tags.split(',').map((value) => value.trim()).filter(Boolean),
      generateThumbnail: true,
      platforms: ['youtube', 'x'],
      publish: false,
      madeWithCast: state.madeWithCast,
    };
  }

  async function apiJson(url, options) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `Request failed: ${response.status}`);
      error.payload = data;
      throw error;
    }
    return data;
  }

  // Proof that this browser controls the connected wallet, established once
  // per (re)connect by signing a timestamped message with the wallet itself
  // rather than by trusting the (public, unauthenticated) address alone.
  // Deliberately kept out of `state`/localStorage — it's short-lived
  // (matches the server's 5-minute signature window) and re-derived per
  // session, not something that should persist across page loads.
  let walletProof = null;
  const WALLET_PROOF_MAX_AGE_MS = 4 * 60 * 1000;

  function utf8ToHex(text) {
    return '0x' + Array.from(new TextEncoder().encode(text)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function walletProofIsFresh() {
    return !!walletProof
      && walletProof.wallet === state.wallet
      && (Date.now() - walletProof.obtainedAt) < WALLET_PROOF_MAX_AGE_MS;
  }

  async function ensureWalletProof() {
    if (walletProofIsFresh()) return walletProof;
    if (!state.wallet) throw new Error('Connect a wallet first.');
    if (!window.ethereum || !window.ethereum.request) {
      throw new Error('A browser wallet (e.g. MetaMask) is required to prove wallet ownership.');
    }
    const message = `Cast: list my jobs at ${new Date().toISOString()}`;
    const signature = await window.ethereum.request({
      method: 'personal_sign',
      params: [utf8ToHex(message), state.wallet],
    });
    walletProof = { wallet: state.wallet, message, signature, obtainedAt: Date.now() };
    return walletProof;
  }

  // Appends the cached wallet proof as query params so authenticated GETs
  // (job status, artifact list, artifact bytes) work for jobs discovered via
  // wallet listing, not just ones created with the currently-remembered
  // credit key. A no-op once the proof goes stale -- the request just falls
  // back to whatever auth (if any) it already had.
  function withWalletProofParams(url) {
    if (!walletProofIsFresh()) return url;
    const joiner = url.includes('?') ? '&' : '?';
    return `${url}${joiner}wallet=${encodeURIComponent(walletProof.wallet)}&message=${encodeURIComponent(walletProof.message)}&signature=${encodeURIComponent(walletProof.signature)}`;
  }

  async function loadJobsForWallet() {
    const proof = await ensureWalletProof();
    const result = await apiJson('/api/cast/jobs/list', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ wallet: proof.wallet, message: proof.message, signature: proof.signature }),
    });
    const existingIds = new Set(state.jobs.map((job) => job.jobId));
    for (const serverJob of result.jobs || []) {
      if (existingIds.has(serverJob.jobId)) continue;
      state.jobs.push({
        jobId: serverJob.jobId,
        title: '',
        status: serverJob.status,
        tier: serverJob.tier,
        inputKind: serverJob.inputKind,
        preset: serverJob.outputPreset,
        remoteStatus: serverJob,
      });
    }
    persistState();
    render();
    return result.jobs || [];
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',').pop() || '');
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function uploadWithProgress(url, jsonBody, onProgress) {
    // fetch() does not expose upload progress events, so use XMLHttpRequest
    // for this request specifically.
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.setRequestHeader('content-type', 'application/json');
      if (xhr.upload) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
        };
      }
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText || '{}'); } catch (_error) { /* non-JSON response */ }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data);
        } else {
          const error = new Error(data.error || `Request failed: ${xhr.status}`);
          error.payload = data;
          reject(error);
        }
      };
      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.send(jsonBody);
    });
  }

  async function fetchErc20Balance(rpcUrl, contractAddress, walletAddress) {
    try {
      const data = '0x70a08231' + walletAddress.slice(2).toLowerCase().padStart(64, '0');
      const resp = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: contractAddress, data }, 'latest'] }),
      });
      const { result } = await resp.json();
      if (!result || result === '0x') return 0;
      const raw = BigInt(result);
      const whole = raw / BigInt('1000000000000000000');
      const frac = (raw % BigInt('1000000000000000000')) / BigInt('10000000000000000');
      return Number(whole) + Number(frac) / 100;
    } catch (_err) {
      return null;
    }
  }

  async function fetchTokenBalances() {
    if (!state.wallet || !els.tokenBalances) return;
    els.tokenBalances.textContent = 'Loading balances…';
    const [e3d, we3d] = await Promise.all([
      fetchErc20Balance(ETH_RPC, E3D_ETH_ADDRESS, state.wallet),
      fetchErc20Balance(BASE_RPC, WE3D_BASE_ADDRESS, state.wallet),
    ]);
    state.tokenBalances = { e3d, we3d };
    renderTokenBalances();
  }

  function renderTokenBalances() {
    if (!els.tokenBalances) return;
    if (!state.wallet) { els.tokenBalances.textContent = ''; return; }
    const fmt = (v) => v == null ? '—' : v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    const tb = state.tokenBalances || {};
    els.tokenBalances.innerHTML = `E3D&nbsp;<strong>${fmt(tb.e3d)}</strong>&ensp;·&ensp;Base wE3D&nbsp;<strong>${fmt(tb.we3d)}</strong>`;
  }

  function applyWorkspaceModeDefaults() {
    if (state.workspaceMode !== 'basic') return;
    // Preset comes from MODE_DEFAULTS[state.mode], not a single hardcoded
    // value -- a fixed "always youtube" default (the old behavior) forced
    // every Basic-mode job, including a one-line AI Prompt or a short Video
    // Card, into a 16:9/10-minute-shaped preset regardless of which mode
    // tab was actually selected.
    const modeDefaults = MODE_DEFAULTS[state.mode] || MODE_DEFAULTS.transcript;
    Object.assign(state, BASIC_MODE_DEFAULTS, { preset: modeDefaults.preset });
  }

  function renderWorkspaceMode() {
    applyWorkspaceModeDefaults();
    els.workspaceModeToggle.querySelectorAll('[data-workspace-mode]').forEach((button) => {
      button.classList.toggle('active', button.dataset.workspaceMode === state.workspaceMode);
    });
    els.advancedOptions.hidden = state.workspaceMode === 'basic';
    els.workspaceModeCopy.textContent = state.workspaceMode === 'basic'
      ? 'Basic assumes a preset that fits the selected mode, clean podcast captions, end card and Made with Cast rebate on, no IPFS archive. Switch to Advanced to change any of that.'
      : 'Advanced shows every option: output preset, caption style, brand kit, and platform metadata.';
  }

  function renderModeTabs() {
    els.inputModeTabs.innerHTML = modes.map((mode) => `
      <button class="mode-button ${mode.id === state.mode ? 'active' : ''}" data-mode="${mode.id}">
        <strong>${mode.label}</strong><br>
        <span class="small">${mode.copy}</span>
      </button>
    `).join('');
    els.inputModeTabs.querySelectorAll('[data-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        const previousDefaults = MODE_DEFAULTS[state.mode];
        state.mode = button.dataset.mode;
        state.preset = defaultPresetForMode(state.mode, state.preset);
        // Swap title/description/tags to the new mode's defaults, but only
        // if they still match the previous mode's defaults untouched --
        // Basic mode hides the Title field entirely, so without this a job
        // created from AI Prompt or Video Card would silently keep whatever
        // mode was active first (e.g. "Cast transcript short") forever.
        // A value the user actually typed themselves is never overwritten.
        const newDefaults = MODE_DEFAULTS[state.mode];
        if (previousDefaults && newDefaults) {
          if (state.title === previousDefaults.title) state.title = newDefaults.title;
          if (state.description === previousDefaults.description) state.description = newDefaults.description;
          if (state.tags === previousDefaults.tags) state.tags = newDefaults.tags;
        }
        // A quote from one mode has a different shape than another's (e.g.
        // prompt-to-podcast quotes have no .limits) -- carrying it across a
        // mode switch would make renderQuotePanel() render garbage or throw.
        state.quote = null;
        persistState();
        render();
      });
    });
  }

  const AUDIO_DRIVEN_PRESET = { transcript_video: 'youtube', transcript_short: 'short' };
  const TEXT_DRIVEN_PRESET = { youtube: 'transcript_video', short: 'transcript_short' };

  function defaultPresetForMode(mode, currentPreset) {
    if (mode === 'audio' && AUDIO_DRIVEN_PRESET[currentPreset]) {
      return AUDIO_DRIVEN_PRESET[currentPreset];
    }
    if ((mode === 'prompt' || mode === 'transcript' || mode === 'card') && TEXT_DRIVEN_PRESET[currentPreset]) {
      return TEXT_DRIVEN_PRESET[currentPreset];
    }
    return currentPreset;
  }

  function transcriptionEngineBlock() {
    return `
      <div class="section-block">
        <p class="section-title">Transcription</p>
        <label class="toggle-row">
          <input type="radio" name="transcription-engine" value="assemblyai" ${state.transcriptionEngine === 'local' ? '' : 'checked'}>
          AssemblyAI — best quality, speaker labels, uses credits
        </label>
        <label class="toggle-row">
          <input type="radio" name="transcription-engine" value="local" ${state.transcriptionEngine === 'local' ? 'checked' : ''}>
          Free — local transcription, no speaker labels, lower accuracy
        </label>
      </div>
    `;
  }

  function wireTranscriptionEngineBlock() {
    document.querySelectorAll('input[name="transcription-engine"]').forEach((input) => {
      input.addEventListener('change', (event) => {
        state.transcriptionEngine = event.target.value;
        persistState();
      });
    });
  }

  // Shared by AI Prompt and Transcript modes -- Video Card mode deliberately
  // has no voice pickers (see currentOptions()) since a card's two voices
  // are just whoever's "wishing you well," not a named Host/Guest pairing.
  function voicePickerRowHtml() {
    return `
      <div class="voice-picker-row">
        <label class="small">Host voice
          <select id="host-voice-gender">
            <option value="male" ${state.hostVoiceGender === 'male' ? 'selected' : ''}>Male</option>
            <option value="female" ${state.hostVoiceGender === 'female' ? 'selected' : ''}>Female</option>
          </select>
        </label>
        <label class="small">Guest voice
          <select id="guest-voice-gender">
            <option value="male" ${state.guestVoiceGender === 'male' ? 'selected' : ''}>Male</option>
            <option value="female" ${state.guestVoiceGender === 'female' ? 'selected' : ''}>Female</option>
          </select>
        </label>
      </div>
    `;
  }

  function wireVoicePickerRow() {
    document.querySelector('#host-voice-gender').addEventListener('change', (event) => {
      state.hostVoiceGender = event.target.value;
      persistState();
    });
    document.querySelector('#guest-voice-gender').addEventListener('change', (event) => {
      state.guestVoiceGender = event.target.value;
      persistState();
    });
  }

  function renderInputPanel() {
    if (state.mode === 'prompt') {
      els.inputModePanel.innerHTML = `
        <textarea id="prompt-topic-input" class="text-area compact" maxlength="500" placeholder="e.g. Interview a time traveller about wormhole physics">${state.promptTopic}</textarea>
        ${voicePickerRowHtml()}
        <div class="improve-transcript-row">
          <button id="improve-transcript-btn" class="button ghost" type="button">Make it better with AI</button>
          <span id="improve-transcript-status" class="small"></span>
        </div>
        <div id="improve-transcript-panel"></div>
      `;
      document.querySelector('#prompt-topic-input').addEventListener('input', (event) => {
        state.promptTopic = event.target.value;
        persistState();
      });
      wireVoicePickerRow();
      document.querySelector('#improve-transcript-btn').addEventListener('click', quoteImproveTranscript);
      renderImproveTranscriptPanel();
      return;
    }
    if (state.mode === 'transcript') {
      const maxChars = state.capabilities ? (state.capabilities.tiers.find((tier) => tier.id === currentTier()) || state.capabilities.tiers[1]).maxTranscriptChars : 20000;
      els.inputModePanel.innerHTML = `
        <textarea id="transcript-input" class="text-area" placeholder="Title: ... (optional)&#10;Host: ...&#10;Guest: ...">${state.transcriptText}</textarea>
        <div id="transcript-length" class="small">Transcript length: ${state.transcriptText.length} / ${maxChars} characters for ${currentTier()} tier.</div>
        ${voicePickerRowHtml()}
        <div class="improve-transcript-row">
          <button id="improve-transcript-btn" class="button ghost" type="button">Make it better with AI</button>
          <span id="improve-transcript-status" class="small"></span>
        </div>
        <div id="improve-transcript-panel"></div>
      `;
      document.querySelector('#transcript-input').addEventListener('input', (event) => {
        state.transcriptText = event.target.value;
        persistState();
        // Rewriting innerHTML (as a full renderInputPanel() would) replaces
        // the textarea node on every keystroke and drops focus -- only the
        // counter text needs to change here.
        document.querySelector('#transcript-length').textContent = `Transcript length: ${state.transcriptText.length} / ${maxChars} characters for ${currentTier()} tier.`;
      });
      wireVoicePickerRow();
      document.querySelector('#improve-transcript-btn').addEventListener('click', quoteImproveTranscript);
      renderImproveTranscriptPanel();
      return;
    }
    if (state.mode === 'card') {
      els.inputModePanel.innerHTML = `
        <textarea id="card-topic-input" class="text-area compact" maxlength="500" placeholder="e.g. Jamie is turning 30 and loves hiking, board games, and terrible puns">${state.cardTopic}</textarea>
        <div class="voice-picker-row">
          <label class="small">Occasion
            <select id="card-occasion">
              <option value="birthday" ${state.cardOccasion === 'birthday' ? 'selected' : ''}>Birthday</option>
              <option value="congratulations" ${state.cardOccasion === 'congratulations' ? 'selected' : ''}>Congratulations</option>
              <option value="custom" ${state.cardOccasion === 'custom' ? 'selected' : ''}>Custom</option>
            </select>
          </label>
          <label class="small">Email it to (optional)
            <input type="email" id="card-recipient-email" class="text-input" placeholder="friend@example.com" value="${state.recipientEmail}">
          </label>
        </div>
        <div class="small">Videos are too big to attach to email, so we'll send a link to watch it instead.</div>
        <div class="improve-transcript-row">
          <button id="improve-transcript-btn" class="button ghost" type="button">Make it better with AI</button>
          <span id="improve-transcript-status" class="small"></span>
        </div>
        <div id="improve-transcript-panel"></div>
      `;
      document.querySelector('#card-topic-input').addEventListener('input', (event) => {
        state.cardTopic = event.target.value;
        persistState();
      });
      document.querySelector('#card-occasion').addEventListener('change', (event) => {
        state.cardOccasion = event.target.value;
        persistState();
      });
      document.querySelector('#card-recipient-email').addEventListener('input', (event) => {
        state.recipientEmail = event.target.value;
        persistState();
      });
      document.querySelector('#improve-transcript-btn').addEventListener('click', quoteImproveTranscript);
      renderImproveTranscriptPanel();
      return;
    }
    // state.mode === 'audio' is the only remaining case.
    const uploadStatusText = state.uploadError
      ? `Upload failed: ${state.uploadError}`
      : state.upload
        ? `Registered ${state.upload.fileName} (${formatBytes(state.upload.sizeBytes)}) as ${state.upload.uploadId}`
        : 'No upload registered yet. Supports m4a, mp3, wav, and mp4 — submitting a paid job runs real diarization + transcription and returns a captions/transcript artifact.';
    els.inputModePanel.innerHTML = `
      <div class="toggle-row">
        <label><input type="radio" name="audio-source" value="upload" ${state.audioSource === 'upload' ? 'checked' : ''}> Upload a file</label>
        <label><input type="radio" name="audio-source" value="url" ${state.audioSource === 'url' ? 'checked' : ''}> Paste a URL</label>
      </div>
      ${state.audioSource === 'url' ? `
        <input id="source-url-input" class="text-input" type="url" placeholder="https://example.com/podcast.mp3" value="${state.sourceUrl}">
        <div class="small">Public HTTP(S) source only. The worker downloads this URL at dispatch time.</div>
      ` : `
        <input id="upload-file" class="text-input" type="file" accept="audio/*,video/*,.m4a,.mp3,.wav,.mp4" ${state.uploadBusy ? 'disabled' : ''}>
        <div class="upload-actions">
          <button id="upload-file-button" class="button secondary" ${state.uploadBusy ? 'disabled' : ''}>${state.uploadBusy ? 'Uploading…' : 'Register upload'}</button>
          ${state.uploadBusy ? `
            <div class="upload-progress-wrap">
              <progress id="upload-progress" value="${state.uploadProgress || 0}" max="100"></progress>
              <span id="upload-progress-text" class="small">${state.uploadProgress || 0}%</span>
            </div>
          ` : ''}
        </div>
        <div class="small">${uploadStatusText}</div>
      `}
      ${transcriptionEngineBlock()}
    `;
    wireTranscriptionEngineBlock();
    document.querySelectorAll('input[name="audio-source"]').forEach((input) => {
      input.addEventListener('change', (event) => {
        state.audioSource = event.target.value;
        state.quote = null;
        persistState();
        renderInputPanel();
      });
    });
    if (state.audioSource === 'url') {
      document.querySelector('#source-url-input').addEventListener('input', (event) => {
        state.sourceUrl = event.target.value;
        persistState();
      });
      return;
    }
    document.querySelector('#upload-file-button').addEventListener('click', async () => {
      const fileInput = document.querySelector('#upload-file');
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      state.uploadBusy = true;
      state.uploadError = '';
      state.uploadProgress = 0;
      renderInputPanel();
      try {
        const base64 = await fileToBase64(file);
        const payload = JSON.stringify({
          fileName: file.name,
          contentType: file.type,
          dataBase64: base64,
        });
        state.upload = await uploadWithProgress('/ui-api/uploads', payload, (percent) => {
          state.uploadProgress = percent;
          const bar = document.querySelector('#upload-progress');
          const label = document.querySelector('#upload-progress-text');
          if (bar) bar.value = percent;
          if (label) label.textContent = `${percent}%`;
        });
      } catch (error) {
        state.upload = null;
        state.uploadError = error.message || 'Upload failed';
      } finally {
        state.uploadBusy = false;
        persistState();
        render();
      }
    });
  }

  function renderImproveTranscriptPanel() {
    const panel = document.querySelector('#improve-transcript-panel');
    if (!panel) return;
    if (!state.improveQuote) {
      panel.innerHTML = '';
      return;
    }
    panel.innerHTML = `
      <div class="manifest-box">
        Rewriting this transcript with AI will use <strong>${state.improveQuote.estimatedCredits} credits</strong>.
        <div class="chip-row">
          <button id="improve-transcript-confirm" class="button primary" type="button">Do It</button>
          <button id="improve-transcript-cancel" class="button ghost" type="button">Cancel</button>
        </div>
      </div>
    `;
    panel.querySelector('#improve-transcript-confirm').addEventListener('click', applyImproveTranscript);
    panel.querySelector('#improve-transcript-cancel').addEventListener('click', () => {
      state.improveQuote = null;
      renderImproveTranscriptPanel();
    });
  }

  // Transcript mode improves the full script; AI Prompt and Video Card mode
  // improve their topic field instead -- same button, same endpoint, just a
  // different state field depending on which mode is showing it.
  function improveTargetKey() {
    if (state.mode === 'card') return 'cardTopic';
    if (state.mode === 'prompt') return 'promptTopic';
    return 'transcriptText';
  }

  async function quoteImproveTranscript() {
    const text = state[improveTargetKey()].trim();
    const statusEl = document.querySelector('#improve-transcript-status');
    if (!text) {
      if (statusEl) statusEl.textContent = 'Add some text first';
      return;
    }
    if (statusEl) statusEl.textContent = 'Quoting…';
    try {
      state.improveQuote = await apiJson('/api/cast/transcript/improve/quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (statusEl) statusEl.textContent = '';
    } catch (error) {
      state.improveQuote = null;
      if (statusEl) statusEl.textContent = (error.payload && error.payload.error) || error.message;
    }
    renderImproveTranscriptPanel();
  }

  async function applyImproveTranscript() {
    const statusEl = document.querySelector('#improve-transcript-status');
    if (!state.creditKey) {
      if (statusEl) statusEl.textContent = 'Add a credit key or buy credits first';
      return;
    }
    if (statusEl) statusEl.textContent = 'Improving with AI…';
    const key = improveTargetKey();
    try {
      const result = await apiJson('/api/cast/transcript/improve', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${state.creditKey}`,
          'idempotency-key': `ui-improve-${Date.now()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: state[key].trim() }),
      });
      state[key] = result.improvedText;
      state.improveQuote = null;
      persistState();
      renderInputPanel();
      const refreshedStatus = document.querySelector('#improve-transcript-status');
      if (refreshedStatus) refreshedStatus.textContent = `Improved — ${result.creditsSpent} credits used`;
      await refreshBalance();
    } catch (error) {
      if (statusEl) statusEl.textContent = (error.payload && error.payload.error) || error.message;
      renderImproveTranscriptPanel();
    }
  }

  // Shared by both the quote and submit calls so card fields are always sent
  // consistently (and never sent at all outside card mode).
  // Shared by quotePromptJob()/submitPromptJob() -- both AI Prompt and Video
  // Card mode go through the same prompt-to-podcast endpoints, just with a
  // different topic field and (for cards) occasion/recipient extras.
  function promptModeFields() {
    if (state.mode === 'card') {
      return {
        topic: state.cardTopic.trim(),
        cardOccasion: state.cardOccasion,
        recipientEmail: state.recipientEmail.trim(),
      };
    }
    return { topic: state.promptTopic.trim() };
  }

  function renderPresetGrid() {
    els.presetGrid.innerHTML = presets.map((preset) => `
      <button class="preset-card ${preset.id === state.preset ? 'active' : ''}" data-preset="${preset.id}">
        <strong>${preset.title}</strong>
        <p>${preset.copy}</p>
        <span class="small">${preset.aspect}</span>
      </button>
    `).join('');
    els.presetGrid.querySelectorAll('[data-preset]').forEach((button) => {
      button.addEventListener('click', () => {
        state.preset = button.dataset.preset;
        persistState();
        render();
      });
    });
  }

  function renderStyleGrid() {
    els.styleGrid.innerHTML = styles.map((style) => `
      <button class="style-card ${style.id === state.subtitleStyle ? 'active' : ''}" data-style="${style.id}">
        <strong>${style.title}</strong>
      </button>
    `).join('');
    els.styleGrid.querySelectorAll('[data-style]').forEach((button) => {
      button.addEventListener('click', () => {
        state.subtitleStyle = button.dataset.style;
        persistState();
        renderStyleGrid();
      });
    });
  }

  function renderPlatformMetadataInputs() {
    // Same staleness class as the brand-kit checkboxes above: these were
    // only ever synced once at init(), so disconnectWallet()'s reset (or
    // any other programmatic state change) wouldn't show up here. Safe to
    // re-sync on every render() -- the title/description/tags "input"
    // listeners only call persistState(), never render(), so this can't
    // clobber what someone is actively typing.
    els.titleInput.value = state.title;
    els.descriptionInput.value = state.description;
    els.tagsInput.value = state.tags;
  }

  function renderBrandKitCopy() {
    // Basic mode forces brandEndCard/madeWithCast/archiveToIpfs (see
    // applyWorkspaceModeDefaults) -- these checkboxes were previously only
    // ever synced once at init(), so without re-syncing here they'd show
    // stale values after a forced change (e.g. toggle off in Advanced,
    // switch to Basic and back to Advanced -- state is true again but the
    // checkbox would still show unchecked).
    els.brandEndCard.checked = state.brandEndCard;
    els.madeWithToggle.checked = state.madeWithCast;
    els.archiveToggle.checked = state.archiveToIpfs;
    const watermarkOn = currentTier() === 'free';
    els.watermarkCopy.textContent = watermarkOn
      ? 'Free/sample renders show the Cast watermark and a 24-hour retention window.'
      : 'Paid tiers remove the watermark. End card stays on by default for a small rebate.';
    els.rebateCopy.textContent = state.madeWithCast
      ? 'End card kept on: rebate preview active for paid jobs.'
      : 'End card off: no rebate preview.';
  }

  function renderStatus() {
    const attemptsRemaining = Math.max(0, 3 - Number(state.freeSampleAttemptsUsed || 0));
    const connected = !!state.wallet;
    const dot = document.querySelector('#wallet-dot');
    const walletCard = document.querySelector('#wallet-card');
    if (dot) { dot.className = `wallet-dot ${connected ? 'connected' : 'disconnected'}`; }
    if (walletCard) { walletCard.className = `status-card ${connected ? 'connected' : ''}`; }
    els.walletDisplay.innerHTML = `<span id="wallet-dot" class="wallet-dot ${connected ? 'connected' : 'disconnected'}"></span>${shortWallet(state.wallet)}`;
    els.connectWallet.textContent = connected ? `${state.wallet.slice(0, 6)}…` : 'Connect Wallet';
    els.connectWallet.className = connected ? 'button primary' : 'button secondary';
    // Holder-discount status is meaningless noise before a wallet is even
    // connected -- only card-relevant info belongs in the default view.
    els.holderBadge.hidden = !connected;
    els.holderBadge.textContent = state.holderDiscountApplied ? '20% holder discount active' : 'Holder discount pending wallet quote';
    els.creditBalance.textContent = state.creditBalanceError
      ? 'Balance unavailable — tap Refresh'
      : (state.creditBalance == null ? 'No credit key' : `${state.creditBalance} credits`);
    els.creditKeyLabel.textContent = state.creditKey ? `Key ${state.creditKey.slice(0, 14)}...` : 'Add credits to unlock paid submission';
    if (els.copyCreditKey) els.copyCreditKey.hidden = !state.creditKey;
    els.activeTier.textContent = currentTier();
    els.freeAttempts.textContent = `Free sample attempts remaining: ${attemptsRemaining}`;
    els.submitState.textContent = state.creditKey ? 'Ready to create video' : 'Create Video will prompt a wallet payment for credits';
  }

  function renderQuotePanel() {
    if (!state.quote) {
      els.quotePanel.innerHTML = `
        <div class="info-stack">
          <strong>No quote yet</strong>
          <span class="small">Live quotes show estimated credits, limit fit, burn amount, and discount state before spend.</span>
        </div>
      `;
      return;
    }
    if (state.mode === 'prompt' || state.mode === 'card') {
      // prompt-to-podcast quotes are a different, simpler shape (no
      // duration/artifact/limits estimate -- the script doesn't exist yet)
      // than a normal job quote, so they get their own small view here.
      // Transcript/Audio modes use the normal job quote endpoint instead, so
      // they fall through to the rich view below.
      els.quotePanel.innerHTML = `
        <div class="info-stack">
          <strong>${state.quote.estimatedCredits} credits</strong>
          <span>${state.quote.generationCredits} to write the ${state.mode === 'card' ? 'card' : 'script'} + ~${state.quote.estimatedRenderCredits} to render</span>
          <span class="small">${state.quote.note}</span>
        </div>
      `;
      return;
    }
    const freeTier = state.capabilities.tiers.find((tier) => tier.id === 'free');
    // Burn amount / Get E3D are on-chain-payment concepts with no place in a
    // card-first quote -- only show them once a wallet is actually in play.
    const walletConnected = !!state.wallet;
    els.quotePanel.innerHTML = `
      <div class="info-stack">
        <strong>${state.quote.estimatedCredits} credits</strong>
        <span>Expected render time: ${state.quote.estimatedDurationSeconds}s</span>
        <span>Estimated artifact size: ${formatBytes(state.quote.estimatedArtifactBytes)}</span>
        ${walletConnected ? `<span>Burn amount: ${state.quote.burnAmount} credits equivalent</span>` : ''}
        <span>Discount applied: ${state.quote.holderDiscountApplied ? 'yes' : 'no'}</span>
        <span>Retention: ${state.quote.limits.retentionHours}h</span>
        <span>Free tier reference: ${freeTier.freeAttempts} attempts, ${freeTier.maxTranscriptChars} chars max</span>
      </div>
      <div class="chip-row">
        <span class="chip">Tier limit fit: ${state.quote.limits.maxTranscriptChars} chars</span>
        <span class="chip">Artifact cap: ${formatBytes(state.quote.limits.maxArtifactBytes)}</span>
        ${walletConnected ? `<span class="chip">Get E3D: ${state.quote.pricing.getE3DUrl}</span>` : ''}
      </div>
    `;
  }

  function renderPurchaseQuote() {
    if (!state.purchaseQuote) {
      els.purchaseQuote.innerHTML = '<span class="small">Wallet purchase quote will show base price, holder discount, burn amount, and payment options.</span>';
      return;
    }
    const methods = (state.purchaseQuote.paymentOptions || []).map((option) => option.paymentMethod || option.method || 'payment').join(', ') || 'base-we3d';
    els.purchaseQuote.innerHTML = `
      <strong>${state.purchaseQuote.effectivePrice}</strong>
      <span>Base price: ${state.purchaseQuote.basePrice}</span>
      <span>Holder discount: ${state.purchaseQuote.holderDiscount}</span>
      <span>Burn amount: ${state.purchaseQuote.burnAmount}</span>
      <span>Payment options: ${methods}</span>
    `;
  }

  // "My Videos" merges what used to be two disconnected sections (a Recent
  // Jobs list above a separate Job Detail/Artifacts panel) into one: each
  // row expands its own detail inline, right below it, when clicked.
  // Only one row is expanded at a time -- clicking an open row again (or
  // clicking a different row) collapses it, since state.selectedJobId is a
  // single value rather than a set of open ids.
  function renderJobs() {
    if (!state.jobs.length) {
      els.jobsList.innerHTML = '<div class="empty-state">Videos you create or load stay here — click one to see status, artifacts, and revision actions.</div>';
      return;
    }
    els.jobsList.innerHTML = state.jobs.map((job) => {
      const status = jobStatus(job);
      const isActive = !TERMINAL_JOB_STATUSES.has(status) && job.kind !== 'local-sample';
      const isOpen = job.jobId === state.selectedJobId;
      return `
      <div class="job-row-wrap">
        <button class="job-row ${isOpen ? 'active open' : ''}" data-job="${job.jobId}">
          <strong>${job.title || job.jobId}</strong>
          <span class="small">${status}${isActive ? ` — ${jobProgressLabel(job)}` : ''} • ${job.tier || 'free'} • ${modeLabel(job.source || job.inputKind)}${formatJobDate(job) ? ` • ${formatJobDate(job)}` : ''}</span>
        </button>
        ${isOpen ? `<div class="job-row-detail" data-job-detail="${job.jobId}">${jobDetailHtml(job)}</div>` : ''}
      </div>
    `;
    }).join('');
    els.jobsList.querySelectorAll('[data-job]').forEach((button) => {
      button.addEventListener('click', async () => {
        const jobId = button.dataset.job;
        const opening = state.selectedJobId !== jobId;
        state.selectedJobId = opening ? jobId : '';
        persistState();
        renderJobs();
        if (!opening) return;
        const job = selectedJob();
        if (!job) return;
        if (job.kind !== 'local-sample' && (state.creditKey || walletProofIsFresh())) {
          try {
            if (!TERMINAL_JOB_STATUSES.has(jobStatus(job))) {
              await pollJobStatus(job);
            } else if (!job.remoteStatus) {
              await fetchRemoteJob(job);
            }
          } catch (error) {
            const detailEl = els.jobsList.querySelector(`[data-job-detail="${job.jobId}"]`);
            if (detailEl) detailEl.innerHTML = `<div class="manifest-box">${error.message}\n\nIf this job wasn't created with your current credit key, click "Load my jobs" first to prove wallet ownership.</div>`;
            return;
          }
        }
        renderJobs();
      });
    });
    const openJob = selectedJob();
    if (openJob) {
      const detailEl = els.jobsList.querySelector(`[data-job-detail="${openJob.jobId}"]`);
      if (detailEl) wireJobDetail(detailEl, openJob);
    }
  }

  function selectedJob() {
    return state.jobs.find((job) => job.jobId === state.selectedJobId) || null;
  }

  async function fetchRemoteJob(job) {
    const headers = state.creditKey ? { authorization: `Bearer ${state.creditKey}` } : {};
    const status = await apiJson(withWalletProofParams(`/api/cast/jobs/${job.jobId}`), { headers });
    const artifacts = await apiJson(withWalletProofParams(`/api/cast/jobs/${job.jobId}/artifacts`), { headers });
    job.remoteStatus = status;
    job.artifacts = artifacts.artifacts;
    return job;
  }

  const TERMINAL_JOB_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);
  const JOB_POLL_INTERVAL_MS = 5000;
  const pollingJobIds = new Set();

  function jobStatus(job) {
    return (job.remoteStatus && job.remoteStatus.status) || job.status;
  }

  // Shared by every job-submission flow (manual quote/submit, prompt-to-podcast,
  // ...) so a freshly created job always lands in Recent Jobs and gets selected
  // the same way regardless of which flow created it.
  function trackNewJob(job) {
    // Stamped locally so the row has a date immediately -- the server's own
    // createdAt (authoritative) arrives once remoteStatus loads and takes
    // over from there (see formatJobDate).
    job.createdAt = job.createdAt || new Date().toISOString();
    state.jobs.unshift(job);
    state.selectedJobId = job.jobId;
    persistState();
    return job;
  }

  // The worker reports coarse phases (e.g. "transcribe", "render") via
  // job.progress events; fall back to a generic message until the first one
  // lands so the row doesn't look stuck with no text at all.
  function jobProgressLabel(job) {
    const phase = job.remoteStatus && job.remoteStatus.progressPhase;
    if (!phase) return 'checking for updates…';
    const detail = job.remoteStatus && job.remoteStatus.progressDetail;
    return detail ? `${phase}: ${detail}` : phase;
  }

  // Jobs render synchronously at submission time (status "queued"/"running")
  // with no further update -- without this, the UI freezes on that first
  // snapshot until the user happens to reopen the job, which for a real
  // render (minutes, not seconds) reads as "did this do anything at all?"
  async function pollJobStatus(job, { silent } = {}) {
    if (job.kind === 'local-sample' || pollingJobIds.has(job.jobId)) return;
    pollingJobIds.add(job.jobId);
    const tick = async (isFirstAttempt) => {
      try {
        await fetchRemoteJob(job);
      } catch (error) {
        pollingJobIds.delete(job.jobId);
        if (isFirstAttempt && !silent) throw error;
        return;
      }
      persistState();
      renderJobs();
      if (TERMINAL_JOB_STATUSES.has(jobStatus(job))) {
        pollingJobIds.delete(job.jobId);
        return;
      }
      setTimeout(tick, JOB_POLL_INTERVAL_MS);
    };
    await tick(true);
  }

  function resumePollingForActiveJobs() {
    if (!(state.creditKey || walletProofIsFresh())) return;
    state.jobs.forEach((job) => {
      if (job.kind === 'local-sample' || TERMINAL_JOB_STATUSES.has(jobStatus(job))) return;
      pollJobStatus(job, { silent: true }).catch(() => {});
    });
  }

  const TEXT_ARTIFACT_TYPES = new Set(['application/x-subrip', 'text/plain']);

  async function fetchArtifactBlob(job, artifact) {
    if (job.kind === 'local-sample') {
      const response = await fetch(artifact.downloadUrl);
      if (!response.ok) throw new Error(`Failed to open sample artifact: ${response.status}`);
      return response.blob();
    }
    const headers = state.creditKey ? { authorization: `Bearer ${state.creditKey}` } : {};
    const response = await fetch(withWalletProofParams(artifact.downloadUrl), { headers });
    if (!response.ok) throw new Error(`Failed to open artifact: ${response.status}`);
    return response.blob();
  }

  function triggerBlobDownload(blob, fileName) {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
  }

  async function openArtifact(container, job, artifact) {
    const preview = container.querySelector('[data-artifact-preview]');
    if (!preview) return;
    preview.hidden = false;
    // Public sample video is served directly from a static, unauthenticated
    // URL (/samples/*) with Range support, so the browser can stream/seek it
    // natively -- pulling all ~600MB through fetch()+Blob just to play it
    // would be slow and needlessly memory-heavy.
    if (job.kind === 'local-sample' && artifact.contentType === 'video/mp4') {
      preview.textContent = '';
      const video = document.createElement('video');
      video.controls = true;
      video.className = 'artifact-video';
      video.src = artifact.downloadUrl;
      preview.appendChild(video);
      return;
    }
    preview.textContent = `Loading ${artifact.artifactId}…`;
    try {
      const blob = await fetchArtifactBlob(job, artifact);
      const contentType = artifact.contentType || artifact.type || blob.type;
      if (TEXT_ARTIFACT_TYPES.has(contentType)) {
        preview.textContent = `${artifact.artifactId} (${contentType})\n\n${await blob.text()}`;
        return;
      }
      // A real job's video is behind an auth-gated download endpoint (unlike
      // the public sample above), so it has to come through as a blob -- but
      // it should still play inline, not silently turn "Play video" into a
      // download.
      if (contentType === 'video/mp4') {
        preview.textContent = '';
        const video = document.createElement('video');
        video.controls = true;
        video.className = 'artifact-video';
        video.src = URL.createObjectURL(blob);
        preview.appendChild(video);
        return;
      }
      preview.textContent = `Downloading ${artifact.fileName || artifact.artifactId}…`;
      triggerBlobDownload(blob, artifact.fileName || artifact.artifactId);
    } catch (error) {
      preview.textContent = `Failed to open ${artifact.artifactId}: ${error.message}`;
    }
  }

  async function sendCard(container, job) {
    const statusEl = container.querySelector('[data-send-card-status]');
    const button = container.querySelector('[data-send-card]');
    if (button) button.disabled = true;
    if (statusEl) statusEl.textContent = 'Sending…';
    try {
      await apiJson(`/api/cast/jobs/${job.jobId}/send-card`, {
        method: 'POST',
        headers: { authorization: `Bearer ${state.creditKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      await fetchRemoteJob(job);
      renderJobs();
    } catch (error) {
      if (button) button.disabled = false;
      if (statusEl) statusEl.textContent = `Failed: ${(error.payload && error.payload.error) || error.message}`;
    }
  }

  // Returns just the inner HTML for one job's expanded detail -- called from
  // renderJobs() for whichever row is currently open (state.selectedJobId),
  // so "My Videos" can render the list and the open row's detail as one
  // pass instead of two disconnected sections/functions.
  function jobDetailHtml(job) {
    const detail = job.remoteStatus || job;
    const artifacts = job.artifacts || [];
    const archive = detail.ipfsArchiveUris || job.ipfs || {};
    return `
      <div class="info-stack">
        <span>Mode: ${modeLabel(job.inputKind || detail.inputKind)}</span>
        <span>Status: ${detail.status}${!TERMINAL_JOB_STATUSES.has(detail.status) && job.kind !== 'local-sample' ? ` — ${jobProgressLabel(job)} (auto-refreshing every few seconds)` : ''}</span>
        <span>Format: ${presetLabel(detail.outputPreset || job.preset || state.preset)}</span>
        <span>Holder discount: ${detail.holderDiscountApplied ? 'applied' : 'not applied'}</span>
        <span>Artifact retention: ${detail.artifactExpiresAt || 'local sample'}</span>
      </div>
      <div class="artifact-grid">
        ${artifacts.map((artifact) => `
          <article class="artifact-card">
            <strong>${artifact.artifactId}</strong>
            <div class="small">${artifact.type || artifact.contentType}</div>
            <div class="small">${formatBytes(artifact.bytes || artifact.sizeBytes || 0)}</div>
            <button class="button ghost" data-open-artifact="${artifact.artifactId}">${TEXT_ARTIFACT_TYPES.has(artifact.contentType) ? 'View transcript' : artifact.contentType === 'video/mp4' ? 'Play video' : 'Open artifact'}</button>
          </article>
        `).join('')}
      </div>
      <div class="manifest-box" data-artifact-preview hidden></div>
      ${detail.recipientEmail ? `
        <div class="manifest-box">
          ${detail.cardEmailSentAt ? `
            Card sent to ${detail.recipientEmail} at ${detail.cardEmailSentAt}.
            ${detail.cardEmailWatchUrl ? `<a href="${detail.cardEmailWatchUrl}" target="_blank" rel="noreferrer">Watch link</a>` : ''}
          ` : `
            <button class="button primary" data-send-card type="button" ${detail.status === 'succeeded' ? '' : 'disabled'}>Send card to ${detail.recipientEmail}</button>
            <div class="small">${detail.status === 'succeeded' ? 'Preview it with "Play video" above first if you like.' : 'Waiting for the video to finish rendering…'}</div>
          `}
          <span data-send-card-status class="small"></span>
        </div>
      ` : ''}
      <div class="chip-row">
        <button class="button secondary" data-revision="thumbnail">Revision: thumbnail</button>
        <button class="button secondary" data-revision="metadata">Revision: metadata</button>
        <button class="button secondary" data-revision="subtitle_style">Revision: subtitle style</button>
        <button class="button ghost" data-archive="ipfs">Archive to IPFS</button>
      </div>
      <div class="manifest-box">IPFS archive status: ${detail.ipfsArchiveStatus || (job.kind === 'local-sample' ? 'local sample only' : 'not archived')}
${Object.keys(archive).length ? `\n${JSON.stringify(archive, null, 2)}` : '\nConsent required before archive.'}</div>
    `;
  }

  // Wires up the buttons inside one open row's detail block, scoped to that
  // row's own container -- multiple job rows can exist in the DOM at once
  // (collapsed), so these can no longer be looked up as page-global ids.
  function wireJobDetail(container, job) {
    const artifacts = job.artifacts || [];
    container.querySelectorAll('[data-open-artifact]').forEach((button) => {
      button.addEventListener('click', () => {
        const artifact = artifacts.find((entry) => entry.artifactId === button.dataset.openArtifact);
        if (artifact) openArtifact(container, job, artifact);
      });
    });
    const sendCardButton = container.querySelector('[data-send-card]');
    if (sendCardButton) sendCardButton.addEventListener('click', () => sendCard(container, job));
    container.querySelectorAll('[data-revision]').forEach((button) => {
      button.addEventListener('click', () => runRevision(job, button.dataset.revision));
    });
    const archiveButton = container.querySelector('[data-archive]');
    if (archiveButton) archiveButton.addEventListener('click', () => archiveJob(job));
  }

  function inputReadinessIssue() {
    if (state.mode === 'audio') {
      if (state.audioSource === 'upload') {
        if (state.uploadBusy) return 'Upload still in progress — wait for it to finish before quoting or submitting.';
        if (!state.upload) return 'Register an upload first.';
      } else if (!state.sourceUrl.trim()) {
        return 'Enter a source URL first.';
      }
    }
    if (state.mode === 'prompt' && !state.promptTopic.trim()) {
      return 'Type a topic first.';
    }
    if (state.mode === 'transcript' && !state.transcriptText.trim()) {
      return 'Paste transcript text first.';
    }
    if (state.mode === 'card' && !state.cardTopic.trim()) {
      return 'Describe the card first.';
    }
    return '';
  }

  async function quoteJob() {
    if (state.mode === 'prompt' || state.mode === 'card') return quotePromptJob();
    const issue = inputReadinessIssue();
    if (issue) {
      els.quoteStatus.textContent = 'Quote failed';
      els.quotePanel.innerHTML = `<div class="manifest-box">${issue}</div>`;
      els.quotePanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    els.quoteStatus.textContent = 'Quoting';
    try {
      const headers = { 'content-type': 'application/json' };
      if (state.creditKey) headers.authorization = `Bearer ${state.creditKey}`;
      state.quote = await apiJson('/api/cast/jobs/quote', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          input: currentInput(),
          preset: state.preset,
          options: currentOptions(),
          tier: currentTier(),
        }),
      });
      state.holderDiscountApplied = !!state.quote.holderDiscountApplied;
      els.quoteStatus.textContent = 'Quoted';
      persistState();
      render();
    } catch (error) {
      els.quoteStatus.textContent = 'Quote failed';
      els.quotePanel.innerHTML = `<div class="manifest-box">${(error.payload && JSON.stringify(error.payload, null, 2)) || error.message}</div>`;
    }
    els.quotePanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function quotePromptJob() {
    const issue = inputReadinessIssue();
    if (issue) {
      els.quoteStatus.textContent = 'Quote failed';
      els.quotePanel.innerHTML = `<div class="manifest-box">${issue}</div>`;
      els.quotePanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    els.quoteStatus.textContent = 'Quoting';
    try {
      state.quote = await apiJson('/api/cast/prompt-to-podcast/quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          preset: state.preset,
          tier: currentTier(),
          options: currentOptions(),
          ...promptModeFields(),
        }),
      });
      els.quoteStatus.textContent = 'Quoted';
      persistState();
      render();
    } catch (error) {
      els.quoteStatus.textContent = 'Quote failed';
      els.quotePanel.innerHTML = `<div class="manifest-box">${(error.payload && JSON.stringify(error.payload, null, 2)) || error.message}</div>`;
    }
    els.quotePanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function setStripeStatus(html) {
    if (!els.stripeStatus) return;
    els.stripeStatus.innerHTML = html;
  }

  // Known pack shape shown immediately so the payments panel never renders
  // an empty gap while /payments/stripe/packs is still in flight -- actual
  // prices/credits always come from the live response once it resolves.
  const STRIPE_PACK_SKELETON = [
    { id: 'starter', name: 'Starter', amountUsd: 9 },
    { id: 'creator', name: 'Creator', amountUsd: 29 },
    { id: 'pro', name: 'Pro', amountUsd: 79 },
  ];

  async function loadStripePacks() {
    if (!els.stripePacks) return;
    els.stripePacks.innerHTML = STRIPE_PACK_SKELETON.map((pack) => `
      <button type="button" class="stripe-pack is-loading" disabled>
        <span class="pack-info">
          <strong>${pack.name}</strong>
          <span class="pack-meta">Loading…</span>
        </span>
        <span class="pack-price">$${pack.amountUsd}</span>
      </button>
    `).join('');
    try {
      const data = await apiJson('/ui-api/payments/stripe/packs');
      if (!data.enabled) {
        els.stripePacks.innerHTML = '<p class="small">Card payments are not configured on this server yet (missing Stripe keys).</p>';
        return;
      }
      els.stripePacks.innerHTML = (data.packs || []).map((pack) => `
        <button type="button" class="stripe-pack" data-pack-id="${pack.id}">
          <span class="pack-info">
            <strong>${pack.name}</strong>
            <span class="pack-meta">${pack.credits.toLocaleString()} credits · ${pack.description || ''}</span>
          </span>
          <span class="pack-price">$${Number(pack.amountUsd).toFixed(pack.amountUsd % 1 ? 2 : 0)}</span>
        </button>
      `).join('');
      els.stripePacks.querySelectorAll('[data-pack-id]').forEach((button) => {
        button.addEventListener('click', () => startStripeCheckout(button.dataset.packId));
      });
    } catch (error) {
      els.stripePacks.innerHTML = `<p class="small">Could not load card packs: ${(error.payload && error.payload.error) || error.message}</p>`;
    }
  }

  function scrollToPayments() {
    const panel = document.querySelector('.payment-controls');
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function startStripeCheckout(packId) {
    setStripeStatus('<span class="small">Opening Stripe Checkout…</span>');
    scrollToPayments();
    try {
      const checkout = await apiJson('/ui-api/payments/stripe/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          product: 'cast',
          packId,
          wallet: state.wallet || undefined,
          // Lets a repeat purchase top up this same key's balance instead of
          // minting an unrelated second key the UI would then overwrite this
          // one with, silently orphaning whatever was on it.
          existingCreditKey: state.creditKey || undefined,
        }),
      });
      if (!checkout.url) {
        throw new Error('Stripe did not return a checkout URL');
      }
      window.location.href = checkout.url;
    } catch (error) {
      setStripeStatus(`<div class="manifest-box">${(error.payload && JSON.stringify(error.payload, null, 2)) || error.message}</div>`);
      scrollToPayments();
    }
  }

  function renderHeroCta() {
    if (!els.heroCta) return;
    const funded = Number(state.creditBalance) > 0 || !!state.creditKey;
    els.heroCta.classList.toggle('is-funded', funded);
    const title = els.heroCta.querySelector('h2');
    const copy = els.heroCta.querySelector('.hero-cta-copy .small');
    if (funded) {
      // Credit count is shown in the Credits status card below -- no need to
      // repeat it here too.
      if (title) title.textContent = 'You are funded — create a video';
      if (copy) copy.textContent = 'Paste a transcript or upload audio, get a quote, then Create Video.';
    } else {
      if (title) title.textContent = 'Your first videos for $9';
      if (copy) {
        copy.textContent = 'Starter pack = 2,000 credits (~4 YouTube-length renders). Card checkout via Stripe. Free sample render available with no purchase.';
      }
    }
    if (els.buyCreditsCta) {
      els.buyCreditsCta.hidden = funded;
    }
  }

  async function claimStripeSessionIfPresent() {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('stripe_session_id');
    const cancelled = params.get('stripe_cancelled');
    if (cancelled) {
      setStripeStatus('<span class="small">Card checkout cancelled. No charge was made.</span>');
      // Clean the query string without a full reload.
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }
    if (!sessionId) return;

    setStripeStatus('<span class="small">Confirming card payment and unlocking credits…</span>');
    try {
      // Poll briefly — webhook may land a second after redirect.
      let result = null;
      let lastError = null;
      for (let attempt = 1; attempt <= 8; attempt += 1) {
        try {
          const response = await fetch(`/ui-api/payments/stripe/session/${encodeURIComponent(sessionId)}/result`, {
            method: 'GET',
            headers: { accept: 'application/json' },
          });
          const payload = await response.json().catch(() => ({}));
          if (response.status === 202) {
            setStripeStatus(`<span class="small">Payment received — waiting for credit grant (attempt ${attempt}/8)…</span>`);
            await new Promise((resolve) => setTimeout(resolve, 1500));
            continue;
          }
          if (!response.ok) {
            lastError = payload;
            // KEY_ALREADY_CLAIMED: user refreshed after success; keep existing key if any.
            if (response.status === 409 && payload.code === 'KEY_ALREADY_CLAIMED') {
              setStripeStatus(`<span class="small">This payment already unlocked ${payload.issuedCredits || ''} credits. If Create Video is locked, use the credit key from your first successful return, or buy a new pack. Stuck? <a href="mailto:support@e3d.ai">support@e3d.ai</a></span>`);
              window.history.replaceState({}, '', window.location.pathname);
              return;
            }
            throw Object.assign(new Error(payload.error || `HTTP ${response.status}`), { payload });
          }
          result = payload;
          break;
        } catch (err) {
          lastError = err;
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }
      if (!result || (!result.creditKey && !result.merged)) {
        throw Object.assign(new Error('Could not claim credit key from Stripe session'), { payload: lastError });
      }
      // A merge tops up the credit key already in state.creditKey (that's
      // what made the merge possible) rather than issuing a new one.
      if (result.creditKey) {
        state.creditKey = result.creditKey;
        persistState();
      }
      await refreshBalance();
      setStripeStatus(`<span class="small">Card payment confirmed — ${result.issuedCredits} credits added${result.merged ? ' to your existing balance' : ''}. You’re ready to Create Video.</span>`);
      window.history.replaceState({}, '', window.location.pathname);
      render();
    } catch (error) {
      setStripeStatus(`<div class="manifest-box">${(error.payload && JSON.stringify(error.payload, null, 2)) || error.message}</div>`);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }

  async function quotePurchase() {
    if (!state.wallet) {
      state.wallet = window.prompt('Enter a wallet address') || '';
      persistState();
    }
    if (!state.wallet) return;
    state.purchaseQuote = await apiJson('/ui-api/payments/credits/quote', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        product: 'cast',
        wallet: state.wallet,
        requestedIssuedCredits: Number(els.creditRequest.value || 1000),
      }),
    });
    state.holderDiscountApplied = !!state.purchaseQuote.holderDiscountApplied;
    persistState();
    render();
  }

  async function registerPurchase() {
    const txHash = els.txHash.value.trim();
    if (!txHash) {
      els.purchaseQuote.innerHTML = '<span class="small">Enter a transaction hash first.</span>';
      return;
    }
    els.registerPurchase.disabled = true;
    els.purchaseQuote.innerHTML = '<span class="small">Registering purchase…</span>';
    try {
      const purchase = await registerPurchaseWithRetry(
        {
          product: 'cast',
          wallet: state.wallet,
          txHash,
          paymentMethod: els.paymentMethod.value,
        },
        {
          onProgress: ({ attempt, maxAttempts, elapsedLabel }) => {
            els.purchaseQuote.innerHTML = `<span class="small">Waiting for transaction to confirm on-chain… (${elapsedLabel} elapsed, attempt ${attempt}/${maxAttempts}). This can take several minutes depending on network congestion — no need to resubmit.</span>`;
          },
        },
      );
      state.creditKey = purchase.creditKey;
      persistState();
      await refreshBalance();
      els.purchaseQuote.innerHTML = `<span class="small">Purchase registered — ${purchase.issuedCredits} credits added.</span>`;
    } catch (error) {
      els.purchaseQuote.innerHTML = `<div class="manifest-box">${(error.payload && JSON.stringify(error.payload, null, 2)) || error.message}</div>`;
    } finally {
      els.registerPurchase.disabled = false;
    }
  }

  async function refreshBalance() {
    if (!state.creditKey) return;
    try {
      const balance = await apiJson('/api/payments/credits/balance?product=cast', {
        headers: { authorization: `Bearer ${state.creditKey}` },
      });
      state.creditBalance = balance.credits;
      state.creditBalanceError = false;
    } catch (error) {
      // Previously swallowed with no console log and no UI signal, so a
      // real purchase (credit key correctly saved) looked identical to "no
      // credit key" -- indistinguishable from having never paid at all.
      console.error('refreshBalance failed', error);
      state.creditBalanceError = true;
    }
    persistState();
    renderStatus();
  }

  async function redeemPromoCode() {
    const code = (els.promoCodeInput.value || '').trim();
    if (!code) {
      els.promoCodeStatus.textContent = 'Enter a promo code first';
      return;
    }
    els.promoCodeStatus.textContent = 'Redeeming…';
    els.redeemPromoCode.disabled = true;
    try {
      const result = await apiJson('/api/cast/promo/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, existingCreditKey: state.creditKey || undefined }),
      });
      // A fresh key is only returned when there was no existing key to top
      // up -- if one was supplied, the credits landed on it already and
      // state.creditKey is already correct.
      if (result.creditKey) {
        state.creditKey = result.creditKey;
      }
      persistState();
      els.promoCodeInput.value = '';
      await refreshBalance();
      render();
      els.promoCodeStatus.textContent = `+${result.credits} credits redeemed!`;
    } catch (error) {
      els.promoCodeStatus.textContent = (error.payload && error.payload.error) || error.message;
    } finally {
      els.redeemPromoCode.disabled = false;
    }
  }

  // Mirrors the backend's minimum credit purchase floor (productRegistry.js /
  // x402Config.js MIN_CREDIT_PURCHASE) — not exposed via a public endpoint, so
  // duplicated here deliberately rather than guessed at.
  const MIN_CREDIT_PURCHASE = 500;

  function erc20TransferCalldata(toAddress, amountWei) {
    const selector = 'a9059cbb';
    const addressPadded = toAddress.replace(/^0x/, '').toLowerCase().padStart(64, '0');
    const amountPadded = amountWei.toString(16).padStart(64, '0');
    return `0x${selector}${addressPadded}${amountPadded}`;
  }

  async function ensureWalletChain(chainId) {
    const chainIdHex = `0x${Number(chainId).toString(16)}`;
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainIdHex }] });
    } catch (switchError) {
      if (switchError && switchError.code === 4902 && Number(chainId) === 8453) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: chainIdHex,
            chainName: 'Base',
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
            rpcUrls: ['https://mainnet.base.org'],
            blockExplorerUrls: ['https://basescan.org'],
          }],
        });
      } else {
        throw switchError;
      }
    }
  }

  async function sendErc20Payment({ wallet, tokenAddress, treasuryAddress, amountWei, chainId }) {
    if (!window.ethereum || !window.ethereum.request) {
      throw new Error('No wallet provider found — connect a browser wallet like MetaMask first.');
    }
    await ensureWalletChain(chainId);
    const data = erc20TransferCalldata(treasuryAddress, amountWei);
    return window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [{ from: wallet, to: tokenAddress, data, value: '0x0' }],
    });
  }

  function confirmPayment(purchaseQuote, paymentOption, jobQuote) {
    return new Promise((resolve) => {
      els.quoteStatus.textContent = 'Confirm payment';
      els.quotePanel.innerHTML = `
        <div class="info-stack">
          <strong>Fund ${purchaseQuote.requiredBaseCredits} credits to create this video</strong>
          <span>This job needs ${jobQuote.estimatedCredits} credits.</span>
          <span>You will send ${paymentOption.requiredAmount} ${paymentOption.token} on ${paymentOption.chain} to ${paymentOption.treasuryAddress}.</span>
        </div>
        <div class="chip-row">
          <button id="confirm-payment" class="button primary">Confirm &amp; pay</button>
          <button id="cancel-payment" class="button ghost">Cancel</button>
        </div>
      `;
      els.quotePanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      document.querySelector('#confirm-payment').addEventListener('click', () => resolve(true));
      document.querySelector('#cancel-payment').addEventListener('click', () => resolve(false));
    });
  }

  function formatElapsed(ms) {
    const totalSeconds = Math.round(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  // Real on-chain transactions can take several minutes to be picked up by
  // the indexer, especially under network congestion or low gas — 30
  // attempts at 4s (2 minutes total) was routinely too short and left users
  // watching a static, easy-to-miss status line with no sense of progress.
  async function registerPurchaseWithRetry(payload, options = {}) {
    const maxAttempts = options.maxAttempts || 90;
    const delayMs = options.delayMs || 5000;
    const onProgress = options.onProgress || (() => {});
    const startedAt = Date.now();
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await apiJson('/ui-api/payments/credits/purchase', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch (error) {
        lastError = error;
        onProgress({ attempt, maxAttempts, elapsedLabel: formatElapsed(Date.now() - startedAt) });
        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }
    throw lastError;
  }

  async function autoFundAndCreateVideo() {
    if (!state.wallet) {
      try {
        await connectWallet();
      } catch (error) {
        els.quoteStatus.textContent = 'Create video failed';
        els.quotePanel.innerHTML = `<div class="manifest-box">${error.message || 'Wallet connection was rejected or failed.'}</div>`;
        els.quotePanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      if (!state.wallet) {
        els.quoteStatus.textContent = 'Create video failed';
        els.quotePanel.innerHTML = '<div class="manifest-box">Connect a wallet to create a video.</div>';
        els.quotePanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
    }
    const issue = inputReadinessIssue();
    if (issue) {
      els.quoteStatus.textContent = 'Create video failed';
      els.quotePanel.innerHTML = `<div class="manifest-box">${issue}</div>`;
      els.quotePanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    els.quoteStatus.textContent = 'Preparing…';
    let jobQuote;
    let purchaseQuote;
    try {
      jobQuote = await apiJson('/api/cast/jobs/quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: currentInput(), preset: state.preset, options: currentOptions(), tier: currentTier() }),
      });
      const neededCredits = Math.max(jobQuote.estimatedCredits, MIN_CREDIT_PURCHASE);
      purchaseQuote = await apiJson('/ui-api/payments/credits/quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ product: 'cast', wallet: state.wallet, requestedIssuedCredits: neededCredits }),
      });
    } catch (error) {
      els.quoteStatus.textContent = 'Create video failed';
      els.quotePanel.innerHTML = `<div class="manifest-box">${(error.payload && JSON.stringify(error.payload, null, 2)) || error.message}</div>`;
      els.quotePanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    // Respect the Payments panel's payment-method choice (also used by the
    // manual registerPurchase flow) so auto-pay and manual purchases always
    // agree on which token gets used. Falls back to whatever the quote
    // actually offers if the selected method isn't in that list.
    const paymentOption = purchaseQuote.paymentOptions.find((option) => option.id === els.paymentMethod.value) || purchaseQuote.paymentOptions[0];
    if (!paymentOption) {
      els.quoteStatus.textContent = 'Create video failed';
      els.quotePanel.innerHTML = '<div class="manifest-box">No payment method is configured for Cast.</div>';
      els.quotePanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    const confirmed = await confirmPayment(purchaseQuote, paymentOption, jobQuote);
    if (!confirmed) {
      els.quoteStatus.textContent = 'Payment canceled';
      return;
    }
    let txHash;
    try {
      els.quoteStatus.textContent = 'Confirm the payment in your wallet…';
      const amountWei = BigInt(purchaseQuote.requiredBaseCredits) * 10n ** 15n;
      txHash = await sendErc20Payment({
        wallet: state.wallet,
        tokenAddress: paymentOption.tokenAddress,
        treasuryAddress: paymentOption.treasuryAddress,
        amountWei,
        chainId: paymentOption.chainId,
      });
    } catch (error) {
      els.quoteStatus.textContent = 'Payment failed';
      els.quotePanel.innerHTML = `<div class="manifest-box">${error.message || 'Wallet rejected or failed to send the transaction.'}</div>`;
      els.quotePanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    let purchase;
    els.quoteStatus.textContent = 'Waiting for on-chain confirmation…';
    els.quotePanel.innerHTML = `<div class="manifest-box">Transaction sent: ${txHash}\n\nWaiting for it to confirm on-chain. This can take a few minutes depending on network congestion — this page updates automatically, no need to resubmit.</div>`;
    els.quotePanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    try {
      purchase = await registerPurchaseWithRetry(
        {
          product: 'cast',
          wallet: state.wallet,
          txHash,
          paymentMethod: paymentOption.id,
        },
        {
          onProgress: ({ attempt, maxAttempts, elapsedLabel }) => {
            els.quoteStatus.textContent = `Waiting for on-chain confirmation… (${elapsedLabel})`;
            els.quotePanel.innerHTML = `<div class="manifest-box">Transaction sent: ${txHash}\n\nWaiting for it to confirm on-chain (${elapsedLabel} elapsed, attempt ${attempt}/${maxAttempts}). This can take a few minutes depending on network congestion — this page updates automatically, no need to resubmit.</div>`;
          },
        },
      );
    } catch (error) {
      els.quoteStatus.textContent = 'Payment sent but credit registration failed';
      els.quotePanel.innerHTML = `<div class="manifest-box">Transaction: ${txHash}\n${(error.payload && JSON.stringify(error.payload, null, 2)) || error.message}\n\nThis transaction is real — if it eventually confirms, register it manually from the Payments panel using this tx hash.</div>`;
      els.quotePanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    state.creditKey = purchase.creditKey;
    persistState();
    await refreshBalance();
    els.quoteStatus.textContent = 'Credits ready — creating video…';
    await submitPaidJob(true);
  }

  async function submitPaidJob(isRetryAfterFunding) {
    if (state.mode === 'prompt' || state.mode === 'card') return submitPromptJob();
    if (!state.creditKey) {
      if (isRetryAfterFunding) {
        els.quoteStatus.textContent = 'Get E3D / buy credits first';
        return;
      }
      return autoFundAndCreateVideo();
    }
    const issue = inputReadinessIssue();
    if (issue) {
      els.quoteStatus.textContent = 'Create video failed';
      els.quotePanel.innerHTML = `<div class="manifest-box">${issue}</div>`;
      els.quotePanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    let submission;
    try {
      submission = await apiJson('/api/cast/jobs', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${state.creditKey}`,
          'idempotency-key': `ui-${Date.now()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          input: currentInput(),
          preset: state.preset,
          options: currentOptions(),
        }),
      });
    } catch (error) {
      if (!isRetryAfterFunding && error.payload && error.payload.code === 'INSUFFICIENT_CREDITS') {
        return autoFundAndCreateVideo();
      }
      els.quoteStatus.textContent = 'Create video failed';
      els.quotePanel.innerHTML = `<div class="manifest-box">${(error.payload && JSON.stringify(error.payload, null, 2)) || error.message}</div>`;
      els.quotePanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    const job = trackNewJob({
      jobId: submission.jobId,
      title: state.title,
      status: submission.status,
      tier: submission.tier,
      inputKind: state.mode,
      preset: state.preset,
    });
    await pollJobStatus(job);
    await refreshBalance();
    render();
    els.jobsList.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Card/podcast generation doesn't hook into the wallet auto-fund flow (that
  // path is tightly coupled to /api/cast/jobs semantics) -- with no credit
  // key yet, it just points the user at buying credits instead.
  async function submitPromptJob() {
    if (!state.creditKey) {
      els.quoteStatus.textContent = 'Add a credit key or buy credits first';
      return;
    }
    const issue = inputReadinessIssue();
    if (issue) {
      els.quoteStatus.textContent = 'Create video failed';
      els.quotePanel.innerHTML = `<div class="manifest-box">${issue}</div>`;
      els.quotePanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    let result;
    try {
      result = await apiJson('/api/cast/prompt-to-podcast', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${state.creditKey}`,
          'idempotency-key': `ui-prompt-${Date.now()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          preset: state.preset,
          tier: currentTier(),
          options: currentOptions(),
          ...promptModeFields(),
        }),
      });
    } catch (error) {
      els.quoteStatus.textContent = 'Create video failed';
      els.quotePanel.innerHTML = `<div class="manifest-box">${(error.payload && JSON.stringify(error.payload, null, 2)) || error.message}</div>`;
      els.quotePanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    const job = trackNewJob({
      jobId: result.jobId,
      title: state.title,
      status: result.status,
      tier: result.tier,
      inputKind: state.mode,
      preset: state.preset,
    });
    await pollJobStatus(job);
    // The card email is no longer sent automatically here -- the sender gets
    // a "Send card" button in the video's expanded row (see jobDetailHtml())
    // so they can watch the video first and back out if it's not right.
    await refreshBalance();
    render();
    els.jobsList.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Guards the entire submitPaidJob() call chain -- including its nested
  // autoFundAndCreateVideo() -> submitPaidJob(true) retry after a wallet
  // top-up -- behind a single in-flight lock. Without this, a second click
  // before the button visibly disabled (or before the first request
  // resolved) could fire a second submission built from whatever mode/text
  // was on screen *by then*, which might not match what the user had
  // configured when they clicked the first time -- e.g. clicking once while
  // still on Transcript, then switching to Video Card and clicking again,
  // produces two real jobs, and whichever happens to finish last is the one
  // that ends up selected/on top.
  let creatingVideo = false;

  async function handleCreateVideoClick() {
    if (creatingVideo) return;
    creatingVideo = true;
    els.submitJob.disabled = true;
    const originalLabel = els.submitJob.textContent;
    els.submitJob.textContent = 'Creating…';
    try {
      await submitPaidJob();
    } finally {
      creatingVideo = false;
      els.submitJob.disabled = false;
      els.submitJob.textContent = originalLabel;
    }
  }

  function createLocalSampleJob() {
    if (state.freeSampleAttemptsUsed >= 3) {
      els.quoteStatus.textContent = 'Free sample attempts used up';
      els.quotePanel.innerHTML = '<div class="manifest-box">You have used all 3 free sample attempts. Buy credits and use Get quote / Create Video for a real render.</div>';
      return;
    }
    const sample = selectedSample();
    const jobId = `sample_${sample.id}_${Date.now()}`;
    state.freeSampleAttemptsUsed += 1;
    trackNewJob({
      jobId,
      kind: 'local-sample',
      title: sample.title,
      status: 'succeeded',
      tier: 'free',
      preset: sample.preset,
      inputKind: sample.inputKind,
      artifacts: realSampleArtifacts(sample) || [
        { artifactId: 'preview_frame', type: 'image/svg+xml', bytes: 1200, downloadUrl: samplePoster(sample) },
        { artifactId: 'manifest', type: 'application/json', bytes: 950, downloadUrl: `data:application/json,${encodeURIComponent(JSON.stringify(sample, null, 2))}` },
      ],
      ipfsArchiveStatus: 'not_available_for_local_sample',
    });
    render();
    els.jobsList.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function runRevision(job, revisionType) {
    if (job.kind === 'local-sample') return;
    const submission = await apiJson(`/api/cast/jobs/${job.jobId}/revise`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${state.creditKey}`,
        'idempotency-key': `ui-revision-${Date.now()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        revisionType,
        options: {
          dryRun: false,
          subtitleStyle: state.subtitleStyle,
          title: state.title,
          description: state.description,
        },
      }),
    });
    const child = trackNewJob({
      jobId: submission.jobId,
      title: `${revisionType} revision`,
      status: submission.status,
      tier: submission.tier,
      preset: state.preset,
      inputKind: state.mode,
    });
    await pollJobStatus(child);
    render();
  }

  async function archiveJob(job) {
    if (job.kind === 'local-sample') return;
    await apiJson(`/api/cast/jobs/${job.jobId}/archive-ipfs`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${state.creditKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        consent: true,
        include: ['video', 'thumbnail', 'captions', 'manifest', 'metadata', 'social_copy'],
      }),
    });
    await fetchRemoteJob(job);
    renderJobs();
  }

  async function disconnectWallet() {
    // Credit key, jobs, and every creation-form field are either
    // wallet-specific (credit key, job history) or just leftover scratch
    // state from the last session -- carrying them over to whatever
    // wallet connects next showed a confusing mix of two people's data.
    // workspaceMode is the one exception (see createDefaultState) --
    // that's a UI preference, not session content.
    Object.assign(state, createDefaultState(), { workspaceMode: state.workspaceMode });
    state.tokenBalances = null;
    walletProof = null;
    // Not part of `state` (read directly from the DOM at submit time) but
    // still a payment tx hash tied to whoever was just connected.
    els.txHash.value = '';
    persistState();
    render();
  }

  async function connectWallet() {
    if (state.wallet) return disconnectWallet();
    if (window.ethereum && window.ethereum.request) {
      await window.ethereum.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] });
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      state.wallet = accounts[0] || '';
    } else {
      state.wallet = window.prompt('Enter a wallet address') || '';
    }
    persistState();
    render();
    fetchTokenBalances();
    if (state.wallet) {
      // Best-effort: reload this wallet's job history automatically, same
      // as clicking "Load my jobs". Silent on failure/rejection (e.g. no
      // injected wallet to sign with, or the user dismisses the signature
      // prompt) -- connecting still succeeds either way, and "Load my
      // jobs" remains available to retry by hand.
      loadJobsForWallet().catch(() => {});
    }
  }

  async function init() {
    state.config = await apiJson('/ui-api/config');
    state.capabilities = await apiJson('/api/cast/capabilities');
    els.getE3dLink.href = state.config.getE3dUrl;

    els.workspaceModeToggle.querySelectorAll('[data-workspace-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        state.workspaceMode = button.dataset.workspaceMode;
        persistState();
        render();
      });
    });
    els.connectWallet.addEventListener('click', connectWallet);
    if (els.copyCreditKey) {
      els.copyCreditKey.addEventListener('click', async () => {
        if (!state.creditKey) return;
        try {
          await navigator.clipboard.writeText(state.creditKey);
          const original = els.copyCreditKey.textContent;
          els.copyCreditKey.textContent = '✅';
          els.copyCreditKey.title = 'Copied!';
          setTimeout(() => {
            els.copyCreditKey.textContent = original;
            els.copyCreditKey.title = 'Copy credit key';
          }, 1500);
        } catch (_error) {
          // Clipboard API can fail (permissions, insecure context) -- nothing
          // destructive happens, just no visual confirmation.
        }
      });
    }
    if (els.buyCreditsCta) {
      els.buyCreditsCta.addEventListener('click', () => startStripeCheckout('starter'));
    }
    if (els.heroBuyStarter) {
      els.heroBuyStarter.addEventListener('click', () => startStripeCheckout('starter'));
    }
    if (els.heroTryFree) {
      els.heroTryFree.addEventListener('click', createLocalSampleJob);
    }
    els.loadWalletJobs.addEventListener('click', async () => {
      const original = els.loadWalletJobs.textContent;
      els.loadWalletJobs.disabled = true;
      els.loadWalletJobs.textContent = 'Loading…';
      try {
        const jobs = await loadJobsForWallet();
        els.loadWalletJobs.textContent = `Loaded ${jobs.length} job${jobs.length === 1 ? '' : 's'}`;
      } catch (error) {
        els.jobsList.innerHTML = `<div class="empty-state">${error.message}</div>`;
        els.loadWalletJobs.textContent = original;
      } finally {
        els.loadWalletJobs.disabled = false;
        setTimeout(() => { els.loadWalletJobs.textContent = original; }, 3000);
      }
    });
    els.quoteJob.addEventListener('click', quoteJob);
    els.quotePurchase.addEventListener('click', quotePurchase);
    els.registerPurchase.addEventListener('click', registerPurchase);
    els.refreshBalance.addEventListener('click', refreshBalance);
    els.redeemPromoCode.addEventListener('click', redeemPromoCode);
    els.submitJob.addEventListener('click', () => handleCreateVideoClick());
    els.tryFreeRender.addEventListener('click', createLocalSampleJob);
    els.paymentsInfo.addEventListener('click', () => els.paymentsInfoDialog.showModal());
    els.dialogClose.addEventListener('click', () => els.paymentsInfoDialog.close());
    els.paymentsInfoDialog.addEventListener('click', (e) => { if (e.target === els.paymentsInfoDialog) els.paymentsInfoDialog.close(); });
    els.titleInput.addEventListener('input', (event) => { state.title = event.target.value; persistState(); });
    els.descriptionInput.addEventListener('input', (event) => { state.description = event.target.value; persistState(); });
    els.tagsInput.addEventListener('input', (event) => { state.tags = event.target.value; persistState(); });
    els.brandEndCard.addEventListener('change', (event) => { state.brandEndCard = event.target.checked; persistState(); });
    els.madeWithToggle.addEventListener('change', (event) => { state.madeWithCast = event.target.checked; persistState(); renderBrandKitCopy(); });
    els.archiveToggle.addEventListener('change', (event) => { state.archiveToIpfs = event.target.checked; persistState(); });

    if (state.creditKey) {
      await refreshBalance();
    }
    if (state.wallet) fetchTokenBalances();
    if (state.selectedJobId) {
      const job = selectedJob();
      if (job && job.kind !== 'local-sample' && state.creditKey) {
        await pollJobStatus(job, { silent: true });
      }
    }
    // Resume live status checks for any other still-running jobs from a
    // previous visit (e.g. reloading the page mid-render).
    resumePollingForActiveJobs();

    await loadStripePacks();
    // Handle return from Stripe Checkout before first paint of payment panel status.
    await claimStripeSessionIfPresent();
    render();
  }

  function render() {
    renderWorkspaceMode();
    renderModeTabs();
    renderInputPanel();
    renderPresetGrid();
    renderStyleGrid();
    renderStatus();
    renderHeroCta();
    renderPlatformMetadataInputs();
    renderBrandKitCopy();
    renderQuotePanel();
    renderPurchaseQuote();
    renderJobs();
    renderTokenBalances();
    persistState();
  }

  init().catch((error) => {
    document.body.textContent = `UI failed to initialize: ${error.message}`;
  });
}());
