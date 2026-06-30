'use strict';

(function () {
  const STORAGE_KEY = 'cast-ui-state-v1';
  const modes = [
    { id: 'upload', label: 'Upload', copy: 'Choose a local media file and register it with the service upload helper.' },
    { id: 'url', label: 'Source URL', copy: 'Quote and dispatch a hosted fetch from a public media URL.' },
    { id: 'transcript', label: 'Transcript', copy: 'Paste transcript text, preview the tier fit, and submit a paid dry-run.' },
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
    jobDetail: document.querySelector('#job-detail'),
    agentMode: document.querySelector('#agent-mode'),
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
    transcriptText: 'Host: Welcome to Cast.\nGuest: Today we are previewing a hosted dry-run render on E3D.',
    sourceUrl: '',
    upload: null,
    selectedSampleId: samples[0].id,
    title: 'Cast transcript short',
    description: 'Preview subtitle style, watermark state, metadata, and dry-run pricing before spend.',
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
      dryRun: true,
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

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',').pop() || '');
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
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
        render();
      });
    });
  }

  function renderInputPanel() {
    if (state.mode === 'upload') {
      els.inputModePanel.innerHTML = `
        <input id="upload-file" class="text-input" type="file" accept="audio/*,video/*">
        <button id="upload-file-button" class="button secondary">Register upload</button>
        <div class="small">${state.upload ? `Registered ${state.upload.fileName} (${formatBytes(state.upload.sizeBytes)}) as ${state.upload.uploadId}` : 'No upload registered yet.'}</div>
      `;
      document.querySelector('#upload-file-button').addEventListener('click', async () => {
        const fileInput = document.querySelector('#upload-file');
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        const base64 = await fileToBase64(file);
        state.upload = await apiJson('/ui-api/uploads', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type,
            dataBase64: base64,
          }),
        });
        persistState();
        render();
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
    els.walletDisplay.textContent = shortWallet(state.wallet);
    els.holderBadge.textContent = state.holderDiscountApplied ? '20% holder discount active' : 'Holder discount pending wallet quote';
    els.creditBalance.textContent = state.creditBalance == null ? 'No credit key' : `${state.creditBalance} credits`;
    els.creditKeyLabel.textContent = state.creditKey ? `Key ${state.creditKey.slice(0, 14)}...` : 'Add credits to unlock paid submission';
    els.activeTier.textContent = currentTier();
    els.freeAttempts.textContent = `Free sample attempts remaining: ${attemptsRemaining}`;
    els.submitState.textContent = state.creditKey ? 'Paid dry-run ready' : 'Credit key required for paid submit';
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
        if (job && job.kind !== 'local-sample' && !job.remoteStatus && state.creditKey) {
          await fetchRemoteJob(job);
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
    const status = await apiJson(`/api/cast/jobs/${job.jobId}`, { headers });
    const artifacts = await apiJson(`/api/cast/jobs/${job.jobId}/artifacts`, { headers });
    job.remoteStatus = status;
    job.artifacts = artifacts.artifacts;
    return job;
  }

  function artifactLink(job, artifact) {
    if (job.kind === 'local-sample') return artifact.downloadUrl;
    return artifact.downloadUrl;
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
            <a class="button ghost" href="${artifactLink(job, artifact)}" target="_blank" rel="noreferrer">Open artifact</a>
          </article>
        `).join('')}
      </div>
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
    els.jobDetail.querySelectorAll('[data-revision]').forEach((button) => {
      button.addEventListener('click', () => runRevision(job, button.dataset.revision));
    });
    const archiveButton = els.jobDetail.querySelector('[data-archive]');
    if (archiveButton) archiveButton.addEventListener('click', () => archiveJob(job));
  }

  function renderAgentMode() {
    const quoteBody = {
      input: currentInput(),
      preset: state.preset,
      tier: currentTier(),
    };
    const submitBody = {
      input: currentInput(),
      preset: state.preset,
      options: currentOptions(),
      webhookUrl: 'https://agent.example.com/hooks/cast',
    };
    els.agentMode.innerHTML = `
      <div class="code-card">
        <strong>curl capabilities</strong>
        <pre>curl -s ${location.origin}/api/cast/capabilities</pre>
      </div>
      <div class="code-card">
        <strong>curl quote</strong>
        <pre>curl -s -X POST ${location.origin}/api/cast/jobs/quote -H 'content-type: application/json' -d '${JSON.stringify(quoteBody, null, 2)}'</pre>
      </div>
      <div class="code-card">
        <strong>curl submit</strong>
        <pre>curl -s -X POST ${location.origin}/api/cast/jobs \\
  -H 'Authorization: Bearer &lt;e3d_cast_pay_...&gt;' \\
  -H 'Idempotency-Key: cast-demo-001' \\
  -H 'content-type: application/json' \\
  -d '${JSON.stringify(submitBody, null, 2)}'</pre>
      </div>
      <div class="code-card">
        <strong>e3d-agent</strong>
        <pre>e3d-agent cast render --preset ${state.preset} --dry-run --webhook https://agent.example.com/hooks/cast</pre>
      </div>
    `;
  }

  async function quoteJob() {
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
    const purchase = await apiJson('/ui-api/payments/credits/purchase', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        product: 'cast',
        wallet: state.wallet,
        txHash: els.txHash.value.trim(),
        paymentMethod: els.paymentMethod.value,
      }),
    });
    state.creditKey = purchase.creditKey;
    persistState();
    await refreshBalance();
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

  async function submitPaidJob() {
    if (!state.creditKey) {
      els.quoteStatus.textContent = 'Get E3D / buy credits first';
      return;
    }
    const submission = await apiJson('/api/cast/jobs', {
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
  }

  function createLocalSampleJob() {
    if (state.freeSampleAttemptsUsed >= 3) return;
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
      artifacts: [
        { artifactId: 'preview_frame', type: 'image/svg+xml', bytes: 1200, downloadUrl: samplePoster(sample) },
        { artifactId: 'manifest', type: 'application/json', bytes: 950, downloadUrl: `data:application/json,${encodeURIComponent(JSON.stringify(sample, null, 2))}` },
      ],
      ipfsArchiveStatus: 'not_available_for_local_sample',
    });
    state.selectedJobId = jobId;
    persistState();
    render();
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
          dryRun: true,
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
    if (window.ethereum && window.ethereum.request) {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      state.wallet = accounts[0] || '';
    } else {
      state.wallet = window.prompt('Enter a wallet address') || '';
    }
    persistState();
    renderStatus();
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
    els.quoteJob.addEventListener('click', quoteJob);
    els.quotePurchase.addEventListener('click', quotePurchase);
    els.registerPurchase.addEventListener('click', registerPurchase);
    els.refreshBalance.addEventListener('click', refreshBalance);
    els.submitJob.addEventListener('click', submitPaidJob);
    els.tryFreeRender.addEventListener('click', createLocalSampleJob);
    els.titleInput.addEventListener('input', (event) => { state.title = event.target.value; persistState(); renderPreview(); renderAgentMode(); });
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
    renderAgentMode();
    persistState();
  }

  init().catch((error) => {
    els.jobDetail.textContent = `UI failed to initialize: ${error.message}`;
  });
}());
