'use strict';

(function () {
  const STORAGE_KEY = 'cast-ui-state-v1';
  const E3D_ETH_ADDRESS = '0x6488861b401F427D13B6619C77C297366bCf6386';
  const WE3D_BASE_ADDRESS = '0xDFC9E32Dd0542D12c08ED15FEfadBAe8071B48A5';
  const ETH_RPC = 'https://cloudflare-eth.com';
  const BASE_RPC = 'https://mainnet.base.org';
  const modes = [
    { id: 'upload', label: 'Upload', copy: 'Choose a local media file and register it with the service upload helper.' },
    { id: 'url', label: 'Source URL', copy: 'Quote and dispatch a hosted fetch from a public media URL.' },
    { id: 'transcript', label: 'Transcript', copy: 'Paste transcript text, preview the tier fit, and create a video.' },
    { id: 'sample', label: 'Sample', copy: 'Run a free public sample render before buying credits.' },
  ];
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

  const els = {
    connectWallet: document.querySelector('#connect-wallet'),
    getE3dLink: document.querySelector('#get-e3d-link'),
    walletDisplay: document.querySelector('#wallet-display'),
    holderBadge: document.querySelector('#holder-badge'),
    creditBalance: document.querySelector('#credit-balance'),
    creditKeyLabel: document.querySelector('#credit-key-label'),
    activeTier: document.querySelector('#active-tier'),
    freeAttempts: document.querySelector('#free-attempts'),
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
    previewAspect: document.querySelector('#preview-aspect'),
    previewCaption: document.querySelector('#preview-caption'),
    previewWatermark: document.querySelector('#preview-watermark'),
    previewTitle: document.querySelector('#preview-title'),
    previewDescription: document.querySelector('#preview-description'),
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
    sampleGallery: document.querySelector('#sample-gallery'),
    jobsList: document.querySelector('#jobs-list'),
    loadWalletJobs: document.querySelector('#load-wallet-jobs'),
    jobDetail: document.querySelector('#job-detail'),
    tokenBalances: document.querySelector('#token-balances'),
    paymentsInfo: document.querySelector('#payments-info'),
    paymentsInfoDialog: document.querySelector('#payments-info-dialog'),
    dialogClose: document.querySelector('#dialog-close'),
  };

  const state = Object.assign({
    config: null,
    capabilities: null,
    wallet: '',
    creditKey: '',
    creditBalance: null,
    holderDiscountApplied: false,
    mode: 'transcript',
    preset: 'transcript_short',
    subtitleStyle: 'bold_mobile',
    transcriptText: 'Host: Welcome to Cast.\nGuest: Today we are previewing a hosted render on E3D.',
    sourceUrl: '',
    upload: null,
    uploadBusy: false,
    uploadError: '',
    uploadProgress: 0,
    selectedSampleId: samples[0].id,
    title: 'Cast transcript short',
    description: 'Preview subtitle style, watermark state, metadata, and pricing before spend.',
    tags: 'cast,e3d,transcript',
    archiveToIpfs: false,
    brandEndCard: true,
    madeWithCast: true,
    freeSampleAttemptsUsed: 0,
    quote: null,
    purchaseQuote: null,
    jobs: [],
    selectedJobId: '',
  }, loadState());

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
      mode: state.mode,
      preset: state.preset,
      subtitleStyle: state.subtitleStyle,
      transcriptText: state.transcriptText,
      sourceUrl: state.sourceUrl,
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
    if (state.mode === 'upload') {
      return state.upload
        ? { kind: 'upload', uploadId: state.upload.uploadId, sizeBytes: state.upload.sizeBytes }
        : { kind: 'upload', uploadId: '', sizeBytes: 0 };
    }
    if (state.mode === 'url') {
      return { kind: 'url', url: state.sourceUrl };
    }
    if (state.mode === 'sample') {
      return { kind: 'transcript', text: `${selectedSample().title}\n${selectedSample().description}` };
    }
    return { kind: 'transcript', text: state.transcriptText };
  }

  function currentOptions() {
    return {
      dryRun: false,
      subtitleStyle: state.subtitleStyle,
      brandEndCard: state.brandEndCard,
      archiveToIpfs: state.archiveToIpfs,
      transcriptText: state.transcriptText,
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

  function renderModeTabs() {
    els.inputModeTabs.innerHTML = modes.map((mode) => `
      <button class="mode-button ${mode.id === state.mode ? 'active' : ''}" data-mode="${mode.id}">
        <strong>${mode.label}</strong><br>
        <span class="small">${mode.copy}</span>
      </button>
    `).join('');
    els.inputModeTabs.querySelectorAll('[data-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        state.mode = button.dataset.mode;
        state.preset = defaultPresetForMode(state.mode, state.preset);
        persistState();
        render();
      });
    });
  }

  const AUDIO_DRIVEN_PRESET = { transcript_video: 'youtube', transcript_short: 'short' };
  const TEXT_DRIVEN_PRESET = { youtube: 'transcript_video', short: 'transcript_short' };

  function defaultPresetForMode(mode, currentPreset) {
    if ((mode === 'upload' || mode === 'url') && AUDIO_DRIVEN_PRESET[currentPreset]) {
      return AUDIO_DRIVEN_PRESET[currentPreset];
    }
    if ((mode === 'transcript' || mode === 'sample') && TEXT_DRIVEN_PRESET[currentPreset]) {
      return TEXT_DRIVEN_PRESET[currentPreset];
    }
    return currentPreset;
  }

  function renderInputPanel() {
    if (state.mode === 'upload') {
      const statusText = state.uploadError
        ? `Upload failed: ${state.uploadError}`
        : state.upload
          ? `Registered ${state.upload.fileName} (${formatBytes(state.upload.sizeBytes)}) as ${state.upload.uploadId}`
          : 'No upload registered yet. Supports m4a, mp3, wav, and mp4 — submitting a paid job runs real diarization + transcription and returns a captions/transcript artifact.';
      els.inputModePanel.innerHTML = `
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
        <div class="small">${statusText}</div>
      `;
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
      return;
    }

    if (state.mode === 'url') {
      els.inputModePanel.innerHTML = `
        <input id="source-url-input" class="text-input" type="url" placeholder="https://example.com/podcast.mp3" value="${state.sourceUrl}">
        <div class="small">Public HTTP(S) source only. The worker downloads this URL at dispatch time.</div>
      `;
      document.querySelector('#source-url-input').addEventListener('input', (event) => {
        state.sourceUrl = event.target.value;
        persistState();
      });
      return;
    }

    if (state.mode === 'sample') {
      els.inputModePanel.innerHTML = `
        <div class="sample-gallery">
          ${samples.map((sample) => `
            <article class="sample-card">
              <img src="${samplePoster(sample)}" alt="${sample.title}">
              <strong>${sample.title}</strong>
              <p>${sample.description}</p>
              <button class="button ${sample.id === state.selectedSampleId ? 'primary' : 'ghost'}" data-sample="${sample.id}">
                ${sample.id === state.selectedSampleId ? 'Selected' : 'Use sample'}
              </button>
            </article>
          `).join('')}
        </div>
      `;
      els.inputModePanel.querySelectorAll('[data-sample]').forEach((button) => {
        button.addEventListener('click', () => {
          state.selectedSampleId = button.dataset.sample;
          state.title = selectedSample().title;
          state.description = selectedSample().description;
          state.preset = selectedSample().preset;
          state.subtitleStyle = selectedSample().style;
          persistState();
          render();
        });
      });
      return;
    }

    const maxChars = state.capabilities ? (state.capabilities.tiers.find((tier) => tier.id === currentTier()) || state.capabilities.tiers[1]).maxTranscriptChars : 20000;
    els.inputModePanel.innerHTML = `
      <textarea id="transcript-input" class="text-area" placeholder="Host: ...&#10;Guest: ...">${state.transcriptText}</textarea>
      <div class="small">Transcript length: ${state.transcriptText.length} / ${maxChars} characters for ${currentTier()} tier.</div>
    `;
    document.querySelector('#transcript-input').addEventListener('input', (event) => {
      state.transcriptText = event.target.value;
      persistState();
      renderPreview();
      renderInputPanel();
    });
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
        renderPreview();
        renderStyleGrid();
      });
    });
  }

  function renderPreview() {
    const preset = presets.find((entry) => entry.id === state.preset) || presets[0];
    const watermarkOn = currentTier() === 'free' || state.mode === 'sample';
    els.previewAspect.textContent = preset.aspect;
    els.previewCaption.textContent = `${styles.find((entry) => entry.id === state.subtitleStyle).title} captions preview`;
    els.previewWatermark.textContent = watermarkOn ? 'cast.e3d.ai' : 'Made with Cast';
    els.previewTitle.textContent = state.title || 'Cast preview title';
    els.previewDescription.textContent = state.description || 'Description preview';
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
    els.holderBadge.textContent = state.holderDiscountApplied ? '20% holder discount active' : 'Holder discount pending wallet quote';
    els.creditBalance.textContent = state.creditBalance == null ? 'No credit key' : `${state.creditBalance} credits`;
    els.creditKeyLabel.textContent = state.creditKey ? `Key ${state.creditKey.slice(0, 14)}...` : 'Add credits to unlock paid submission';
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
    const freeTier = state.capabilities.tiers.find((tier) => tier.id === 'free');
    els.quotePanel.innerHTML = `
      <div class="info-stack">
        <strong>${state.quote.estimatedCredits} credits</strong>
        <span>Expected render time: ${state.quote.estimatedDurationSeconds}s</span>
        <span>Estimated artifact size: ${formatBytes(state.quote.estimatedArtifactBytes)}</span>
        <span>Burn amount: ${state.quote.burnAmount} credits equivalent</span>
        <span>Discount applied: ${state.quote.holderDiscountApplied ? 'yes' : 'no'}</span>
        <span>Retention: ${state.quote.limits.retentionHours}h</span>
        <span>Free tier reference: ${freeTier.freeAttempts} attempts, ${freeTier.maxTranscriptChars} chars max</span>
      </div>
      <div class="chip-row">
        <span class="chip">Tier limit fit: ${state.quote.limits.maxTranscriptChars} chars</span>
        <span class="chip">Artifact cap: ${formatBytes(state.quote.limits.maxArtifactBytes)}</span>
        <span class="chip">Get E3D: ${state.quote.pricing.getE3DUrl}</span>
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

  function renderSamples() {
    els.sampleGallery.innerHTML = samples.map((sample) => `
      <article class="sample-card">
        <img src="${samplePoster(sample)}" alt="${sample.title}">
        <strong>${sample.title}</strong>
        <p>${sample.description}</p>
        <div class="chip-row">
          <span class="chip">${sample.inputKind}</span>
          <span class="chip">${sample.preset}</span>
          <span class="chip">${sample.aspect}</span>
        </div>
        <p class="small">${sample.outputSummary}</p>
      </article>
    `).join('');
  }

  function renderJobs() {
    if (!state.jobs.length) {
      els.jobsList.innerHTML = '<div class="empty-state">Recent jobs stay here for resume, revision, archive, and artifact download.</div>';
      return;
    }
    els.jobsList.innerHTML = state.jobs.map((job) => `
      <article class="job-card">
        <strong>${job.title || job.jobId}</strong>
        <p>${job.status} • ${job.tier || 'free'} • ${job.source || job.inputKind}</p>
        <button class="button ghost" data-job="${job.jobId}">Open</button>
      </article>
    `).join('');
    els.jobsList.querySelectorAll('[data-job]').forEach((button) => {
      button.addEventListener('click', async () => {
        state.selectedJobId = button.dataset.job;
        persistState();
        const job = selectedJob();
        if (job && job.kind !== 'local-sample' && !job.remoteStatus && (state.creditKey || walletProofIsFresh())) {
          try {
            await fetchRemoteJob(job);
          } catch (error) {
            els.jobDetail.innerHTML = `<div class="manifest-box">${error.message}\n\nIf this job wasn't created with your current credit key, click "Load my jobs" first to prove wallet ownership.</div>`;
            return;
          }
        }
        renderJobDetail();
      });
    });
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

  async function openArtifact(job, artifact) {
    const preview = document.querySelector('#artifact-preview');
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
      video.style.maxWidth = '100%';
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
      preview.textContent = `Downloading ${artifact.fileName || artifact.artifactId}…`;
      triggerBlobDownload(blob, artifact.fileName || artifact.artifactId);
    } catch (error) {
      preview.textContent = `Failed to open ${artifact.artifactId}: ${error.message}`;
    }
  }

  function renderJobDetail() {
    const job = selectedJob();
    if (!job) {
      els.jobDetail.innerHTML = 'Select a recent job to inspect artifacts, archive it to IPFS, or run revision actions.';
      return;
    }
    const detail = job.remoteStatus || job;
    const artifacts = job.artifacts || [];
    const archive = detail.ipfsArchiveUris || job.ipfs || {};
    els.jobDetail.innerHTML = `
      <div class="info-stack">
        <strong>${job.title || job.jobId}</strong>
        <span>Status: ${detail.status}</span>
        <span>Preset: ${detail.outputPreset || job.preset || state.preset}</span>
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
      <div id="artifact-preview" class="manifest-box" hidden></div>
      <div class="chip-row">
        <button class="button secondary" data-revision="thumbnail">Revision: thumbnail</button>
        <button class="button secondary" data-revision="metadata">Revision: metadata</button>
        <button class="button secondary" data-revision="subtitle_style">Revision: subtitle style</button>
        <button class="button ghost" data-archive="ipfs">Archive to IPFS</button>
      </div>
      <div class="manifest-box">IPFS archive status: ${detail.ipfsArchiveStatus || (job.kind === 'local-sample' ? 'local sample only' : 'not archived')}
${Object.keys(archive).length ? `\n${JSON.stringify(archive, null, 2)}` : '\nConsent required before archive.'}
\nNFT mint available: false</div>
    `;
    els.jobDetail.querySelectorAll('[data-open-artifact]').forEach((button) => {
      button.addEventListener('click', () => {
        const artifact = artifacts.find((entry) => entry.artifactId === button.dataset.openArtifact);
        if (artifact) openArtifact(job, artifact);
      });
    });
    els.jobDetail.querySelectorAll('[data-revision]').forEach((button) => {
      button.addEventListener('click', () => runRevision(job, button.dataset.revision));
    });
    const archiveButton = els.jobDetail.querySelector('[data-archive]');
    if (archiveButton) archiveButton.addEventListener('click', () => archiveJob(job));
  }

  function inputReadinessIssue() {
    if (state.mode === 'upload') {
      if (state.uploadBusy) return 'Upload still in progress — wait for it to finish before quoting or submitting.';
      if (!state.upload) return 'Register an upload first.';
    }
    if (state.mode === 'url' && !state.sourceUrl.trim()) {
      return 'Enter a source URL first.';
    }
    if (state.mode === 'transcript' && !state.transcriptText.trim()) {
      return 'Paste transcript text first.';
    }
    return '';
  }

  async function quoteJob() {
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
    const balance = await apiJson('/api/payments/credits/balance?product=cast', {
      headers: { authorization: `Bearer ${state.creditKey}` },
    });
    state.creditBalance = balance.credits;
    persistState();
    renderStatus();
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
    // Ethereum E3D default for now — Base wE3D has no liquidity pool yet.
    const paymentOption = purchaseQuote.paymentOptions.find((option) => option.id === 'ethereum-e3d') || purchaseQuote.paymentOptions[0];
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
    const job = {
      jobId: submission.jobId,
      title: state.title,
      status: submission.status,
      tier: submission.tier,
      inputKind: state.mode,
      preset: state.preset,
    };
    state.jobs.unshift(job);
    state.selectedJobId = job.jobId;
    persistState();
    await fetchRemoteJob(job);
    await refreshBalance();
    render();
    els.jobDetail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
    state.jobs.unshift({
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
    state.selectedJobId = jobId;
    persistState();
    render();
    els.jobDetail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
    const child = {
      jobId: submission.jobId,
      title: `${revisionType} revision`,
      status: submission.status,
      tier: submission.tier,
      preset: state.preset,
      inputKind: state.mode,
    };
    state.jobs.unshift(child);
    state.selectedJobId = child.jobId;
    persistState();
    await fetchRemoteJob(child);
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
    renderJobDetail();
  }

  async function connectWallet() {
    if (state.wallet) {
      state.wallet = '';
      state.tokenBalances = null;
      persistState();
      renderStatus();
      renderTokenBalances();
      return;
    }
    if (window.ethereum && window.ethereum.request) {
      await window.ethereum.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] });
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      state.wallet = accounts[0] || '';
    } else {
      state.wallet = window.prompt('Enter a wallet address') || '';
    }
    persistState();
    renderStatus();
    fetchTokenBalances();
  }

  async function init() {
    state.config = await apiJson('/ui-api/config');
    state.capabilities = await apiJson('/api/cast/capabilities');
    els.getE3dLink.href = state.config.getE3dUrl;
    els.titleInput.value = state.title;
    els.descriptionInput.value = state.description;
    els.tagsInput.value = state.tags;
    els.brandEndCard.checked = state.brandEndCard;
    els.madeWithToggle.checked = state.madeWithCast;
    els.archiveToggle.checked = state.archiveToIpfs;

    els.connectWallet.addEventListener('click', connectWallet);
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
    els.submitJob.addEventListener('click', () => submitPaidJob());
    els.tryFreeRender.addEventListener('click', createLocalSampleJob);
    els.paymentsInfo.addEventListener('click', () => els.paymentsInfoDialog.showModal());
    els.dialogClose.addEventListener('click', () => els.paymentsInfoDialog.close());
    els.paymentsInfoDialog.addEventListener('click', (e) => { if (e.target === els.paymentsInfoDialog) els.paymentsInfoDialog.close(); });
    els.titleInput.addEventListener('input', (event) => { state.title = event.target.value; persistState(); renderPreview(); });
    els.descriptionInput.addEventListener('input', (event) => { state.description = event.target.value; persistState(); renderPreview(); });
    els.tagsInput.addEventListener('input', (event) => { state.tags = event.target.value; persistState(); });
    els.brandEndCard.addEventListener('change', (event) => { state.brandEndCard = event.target.checked; persistState(); renderPreview(); });
    els.madeWithToggle.addEventListener('change', (event) => { state.madeWithCast = event.target.checked; persistState(); renderPreview(); });
    els.archiveToggle.addEventListener('change', (event) => { state.archiveToIpfs = event.target.checked; persistState(); });

    if (state.creditKey) {
      try {
        await refreshBalance();
      } catch (_error) {
        state.creditBalance = null;
      }
    }
    if (state.wallet) fetchTokenBalances();
    if (state.selectedJobId) {
      const job = selectedJob();
      if (job && job.kind !== 'local-sample' && state.creditKey) {
        try {
          await fetchRemoteJob(job);
        } catch (_error) {
          // Keep the cached local job entry visible if the remote lookup fails.
        }
      }
    }

    render();
  }

  function render() {
    renderModeTabs();
    renderInputPanel();
    renderPresetGrid();
    renderStyleGrid();
    renderStatus();
    renderPreview();
    renderQuotePanel();
    renderPurchaseQuote();
    renderSamples();
    renderJobs();
    renderJobDetail();
    renderTokenBalances();
    persistState();
  }

  init().catch((error) => {
    els.jobDetail.textContent = `UI failed to initialize: ${error.message}`;
  });
}());
