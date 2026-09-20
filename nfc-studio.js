(() => {
  'use strict';

  const BRIDGE_ORIGIN = `${window.location.protocol}//${window.location.hostname}:8766`;
  const IS_LOCAL_BRIDGE_APP = window.location.port === '8766';

  const $ = id => document.getElementById(id);
  const els = {
    module: $('nfcModuleStatus'),
    reader: $('nfcReaderStatus'),
    card: $('nfcCardStatus'),
    uid: $('nfcCardUid'),
    url: $('nfcUrlInput'),
    auto: $('nfcAutoWrite'),
    read: $('nfcReadCardBtn'),
    write: $('nfcWriteCardBtn'),
    verify: $('nfcVerifyCardBtn'),
    log: $('nfcActivityLog'),
    hint: $('nfcBridgeHint')
  };
  if (!els.module) return;

  let bridgeOnline = false;
  let cardPresent = false;
  let previousPresent = false;
  let autoArmed = true;
  let busy = false;
  let lastWrittenUrl = '';

  const normalizeUrl = value => {
    try {
      const u = new URL(value);
      const host = u.hostname.replace(/^www\./i, '').toLowerCase();
      const path = u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '');
      return `${u.protocol.toLowerCase()}//${host}${path}${u.search}${u.hash}`;
    } catch (_) {
      return String(value || '')
        .trim()
        .replace(/^https?:\/\/(?:www\.)?/i, '')
        .replace(/\/$/, '')
        .toLowerCase();
    }
  };

  const addLog = (title, detail = '', ok = true) => {
    const time = new Date().toLocaleTimeString();
    els.log.className = 'nfc-log-entry';
    els.log.innerHTML = `<span style="display:inline-grid;place-items:center;width:32px;height:32px;border-radius:50%;background:${ok ? '#eaf8f1' : '#fff1f1'};color:${ok ? '#087443' : '#b42318'}">${ok ? '✓' : '!'}</span><div><b>${title}</b><small style="display:block;margin-top:4px;color:#7c8796">${detail}${detail ? ' · ' : ''}${time}</small></div>`;
  };

  const setButtons = () => {
    const enabled = IS_LOCAL_BRIDGE_APP && bridgeOnline && cardPresent && !busy;
    els.read.disabled = !enabled;
    els.write.disabled = !enabled;
    els.verify.disabled = !enabled;
    els.auto.disabled = !IS_LOCAL_BRIDGE_APP || !bridgeOnline;
  };

  const showPublicMode = () => {
    bridgeOnline = false;
    cardPresent = false;
    els.module.textContent = 'LOCAL APP REQUIRED';
    els.module.classList.remove('ready');
    els.module.classList.add('standby');
    els.reader.textContent = 'NFC hardware is available in the local Tabaja app';
    els.card.textContent = 'Start the NFC Bridge to open it';
    els.uid.textContent = '—';
    els.hint.innerHTML = `<div style="display:grid;gap:10px"><span>For security, Edge blocks the online PWA from controlling USB card readers. Run <b>NFC-Bridge\\Start-NFC-Bridge.bat</b>; it opens the complete Tabaja app locally with these same buttons fully active.</span><button id="openLocalTabajaBtn" type="button" style="border:0;border-radius:10px;padding:11px 14px;font-weight:800;background:#173b7a;color:#fff;cursor:pointer">Open Local Tabaja NFC App</button></div>`;
    $('openLocalTabajaBtn')?.addEventListener('click', () => window.open(`${BRIDGE_ORIGIN}/`, '_blank'));
    setButtons();
  };

  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    let data;
    try {
      data = await response.json();
    } catch (_) {
      throw new Error(`Bridge returned an invalid response (${response.status}).`);
    }
    if (!response.ok || data.ok === false) throw new Error(data.error || 'NFC Bridge error.');
    return data;
  }

  const applyStatus = data => {
    bridgeOnline = !!(data && data.ok !== false);
    cardPresent = !!(data && data.cardPresent);

    els.module.textContent = cardPresent ? 'CARD READY' : 'BRIDGE ONLINE';
    els.module.classList.add('ready');
    els.module.classList.remove('standby');
    els.reader.textContent = data.reader || 'Bridge online — connect ACR122U';
    els.card.textContent = cardPresent ? 'Card detected' : 'Place one card on reader';
    els.uid.textContent = data.uid || '—';
    els.hint.textContent = cardPresent
      ? 'Reader and card are ready. Read, Write and Verify are active on this page.'
      : 'Bridge connected. Place one NFC card in the center of the reader.';

    if (els.auto.checked) {
      if (!cardPresent) autoArmed = true;
      if (cardPresent && !previousPresent && autoArmed && !busy) {
        autoArmed = false;
        window.setTimeout(writeUrl, 250);
      }
    }
    previousPresent = cardPresent;
    setButtons();
  };

  const showBridgeError = message => {
    bridgeOnline = false;
    cardPresent = false;
    previousPresent = false;
    els.module.textContent = 'BRIDGE OFFLINE';
    els.module.classList.remove('ready');
    els.module.classList.add('standby');
    els.reader.textContent = 'Waiting for NFC Bridge';
    els.card.textContent = 'No card detected';
    els.uid.textContent = '—';
    els.hint.textContent = message || 'Keep the black NFC Bridge window open.';
    setButtons();
  };

  async function refreshStatus() {
    if (!IS_LOCAL_BRIDGE_APP || busy) return;
    try {
      applyStatus(await api('/status'));
    } catch (error) {
      showBridgeError(error.message);
    }
  }

  async function withBusy(fn) {
    if (busy || !IS_LOCAL_BRIDGE_APP) return;
    busy = true;
    setButtons();
    try {
      await fn();
    } catch (error) {
      addLog('Operation failed', error.message || String(error), false);
    } finally {
      busy = false;
      setButtons();
      window.setTimeout(refreshStatus, 150);
    }
  }

  async function readCard() {
    await withBusy(async () => {
      const data = await api('/read');
      if (data.url) els.url.value = data.url;
      addLog('Card read successfully', data.url ? `URL: ${data.url}` : `UID: ${data.uid || 'unknown'}`);
    });
  }

  async function writeUrl() {
    const url = els.url.value.trim();
    if (!/^https?:\/\//i.test(url)) {
      addLog('Invalid website link', 'The link must begin with https:// or http://', false);
      return;
    }
    await withBusy(async () => {
      const data = await api('/write', { method: 'POST', body: JSON.stringify({ url }) });
      lastWrittenUrl = url;
      const verified = !!data.url && normalizeUrl(data.url) === normalizeUrl(url);
      addLog(
        verified ? 'Website link written and verified' : 'Website link written',
        `${data.url || url}${data.uid ? ` · UID ${data.uid}` : ''}`,
        true
      );
    });
  }

  async function verifyCard() {
    const expected = els.url.value.trim() || lastWrittenUrl;
    if (!expected) {
      addLog('Nothing to verify', 'Enter the expected website link first.', false);
      return;
    }
    await withBusy(async () => {
      const data = await api('/verify', { method: 'POST', body: JSON.stringify({ url: expected }) });
      const match = !!data.match || (!!data.url && normalizeUrl(data.url) === normalizeUrl(expected));
      addLog(
        match ? 'Card verified successfully' : 'Verification mismatch',
        match ? data.url : `Found: ${data.url || 'no URL'}`,
        match
      );
    });
  }

  els.read.addEventListener('click', readCard);
  els.write.addEventListener('click', writeUrl);
  els.verify.addEventListener('click', verifyCard);
  els.auto.addEventListener('change', () => { autoArmed = true; });

  if (!IS_LOCAL_BRIDGE_APP) {
    showPublicMode();
    return;
  }

  els.hint.textContent = 'Connecting to the local NFC Bridge…';
  setButtons();
  refreshStatus();
  window.setInterval(refreshStatus, 700);
})();
