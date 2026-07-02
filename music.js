// ═══════════════════════════════════════════════════════════════
//  VALOSIM MUSIC — YouTube embed + Spotify Web Playback (PKCE)
// ═══════════════════════════════════════════════════════════════
(() => {
  // Spotify Developer Dashboard'dan alınan Client ID.
  const SPOTIFY_CLIENT_ID = '7cd4c83c80e7421a8b59dcf12a93b7d1';

  // ── DOM ──────────────────────────────────────────────────────
  const musicPanel = document.getElementById('musicPanel');
  const ytUrlInput = document.getElementById('ytUrlInput');
  const ytMsg = document.getElementById('ytMsg');
  const musicDock = document.getElementById('musicDock');
  const dockTitle = document.getElementById('dockTitle');
  const dockVolume = document.getElementById('dockVolume');
  const ytPlayerBox = document.getElementById('ytPlayerBox');
  const spStatus = document.getElementById('spotifyStatus');
  const spConnectBtn = document.getElementById('spotifyConnectBtn');
  const spSetupNote = document.getElementById('spotifySetupNote');
  const spControls = document.getElementById('spotifyControls');
  const spLogoutBtn = document.getElementById('spotifyLogoutBtn');
  const spTrack = document.getElementById('spTrack');

  const show = el => el.classList.remove('hidden');
  const hide = el => el.classList.add('hidden');

  let activeSource = null; // 'yt' | 'spotify'

  function setDockSource(src) {
    activeSource = src;
    ytPlayerBox.style.display = src === 'yt' ? 'block' : 'none';
    show(musicDock);
  }

  // ── YouTube ──────────────────────────────────────────────────
  let ytPlayer = null;
  let ytApiPromise = null;

  function loadYTApi() {
    if (ytApiPromise) return ytApiPromise;
    ytApiPromise = new Promise(resolve => {
      if (window.YT && window.YT.Player) return resolve();
      window.onYouTubeIframeAPIReady = () => resolve();
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    });
    return ytApiPromise;
  }

  function parseYouTubeUrl(raw) {
    let u;
    try { u = new URL(raw.trim()); } catch (e) { return null; }
    const host = u.hostname.replace(/^www\./, '');
    if (!['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'].includes(host)) return null;
    const listId = u.searchParams.get('list');
    let videoId = u.searchParams.get('v');
    if (host === 'youtu.be') videoId = u.pathname.slice(1) || videoId;
    if (!videoId && u.pathname.startsWith('/embed/')) videoId = u.pathname.split('/')[2];
    if (!videoId && !listId) return null;
    return { videoId, listId };
  }

  function updateYtTitle() {
    if (!ytPlayer || activeSource !== 'yt') return;
    const d = ytPlayer.getVideoData && ytPlayer.getVideoData();
    dockTitle.textContent = (d && d.title) ? d.title : 'YOUTUBE';
  }

  async function loadYouTube(raw) {
    const parsed = parseYouTubeUrl(raw);
    if (!parsed) {
      ytMsg.textContent = 'Link anlaşılamadı — bir YouTube şarkı, video veya playlist linki yapıştır.';
      ytMsg.style.color = 'var(--accent)';
      return;
    }
    ytMsg.textContent = 'Yükleniyor...';
    ytMsg.style.color = '';
    localStorage.setItem('valosim_yt_url', raw.trim());
    if (spPlayer) spPlayer.pause().catch(() => {});
    await loadYTApi();
    setDockSource('yt');
    musicDock.classList.remove('collapsed');

    const startPlayback = () => {
      if (parsed.listId) {
        ytPlayer.loadPlaylist({ list: parsed.listId, listType: 'playlist' });
      } else {
        ytPlayer.loadVideoById(parsed.videoId);
      }
    };

    if (ytPlayer) {
      startPlayback();
    } else {
      ytPlayer = new YT.Player('ytPlayerBox', {
        width: 296, height: 167,
        videoId: parsed.listId ? undefined : parsed.videoId,
        playerVars: parsed.listId
          ? { listType: 'playlist', list: parsed.listId, autoplay: 1 }
          : { autoplay: 1 },
        events: {
          onReady: e => {
            e.target.setVolume(Number(dockVolume.value));
            e.target.playVideo();
            updateYtTitle();
          },
          onStateChange: updateYtTitle
        }
      });
    }
    ytMsg.textContent = 'Çalıyor — mini oynatıcı sağ altta.';
    ytMsg.style.color = 'var(--neon-green)';
  }

  document.getElementById('ytLoadBtn').addEventListener('click', () => loadYouTube(ytUrlInput.value));
  ytUrlInput.addEventListener('keydown', e => { if (e.key === 'Enter') loadYouTube(ytUrlInput.value); });

  // ── Spotify (Authorization Code + PKCE, backend'siz) ────────
  let spPlayer = null;
  let spDeviceId = null;

  const redirectUri = () => location.origin + location.pathname;

  function b64url(bytes) {
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async function pkceChallenge(verifier) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return b64url(new Uint8Array(digest));
  }

  function saveTokens(j) {
    localStorage.setItem('valosim_sp_access', j.access_token);
    if (j.refresh_token) localStorage.setItem('valosim_sp_refresh', j.refresh_token);
    localStorage.setItem('valosim_sp_expires', String(Date.now() + (j.expires_in - 60) * 1000));
  }

  async function tokenRequest(params) {
    const r = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params)
    });
    if (!r.ok) throw new Error('spotify token ' + r.status);
    const j = await r.json();
    saveTokens(j);
    return j.access_token;
  }

  async function getAccessToken() {
    const expires = Number(localStorage.getItem('valosim_sp_expires') || 0);
    const token = localStorage.getItem('valosim_sp_access');
    if (token && Date.now() < expires) return token;
    const refresh = localStorage.getItem('valosim_sp_refresh');
    if (!refresh) return null;
    try {
      return await tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh, client_id: SPOTIFY_CLIENT_ID });
    } catch (e) {
      spotifyLogout();
      return null;
    }
  }

  async function spotifyConnect() {
    if (!SPOTIFY_CLIENT_ID) { show(spSetupNote); return; }
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
    localStorage.setItem('valosim_sp_verifier', verifier);
    const challenge = await pkceChallenge(verifier);
    const p = new URLSearchParams({
      client_id: SPOTIFY_CLIENT_ID,
      response_type: 'code',
      redirect_uri: redirectUri(),
      scope: 'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state',
      code_challenge_method: 'S256',
      code_challenge: challenge
    });
    location.href = 'https://accounts.spotify.com/authorize?' + p;
  }

  async function handleAuthRedirect() {
    const code = new URLSearchParams(location.search).get('code');
    if (!code || !SPOTIFY_CLIENT_ID) return;
    const verifier = localStorage.getItem('valosim_sp_verifier');
    history.replaceState({}, '', redirectUri());
    if (!verifier) return;
    try {
      await tokenRequest({
        grant_type: 'authorization_code', code,
        redirect_uri: redirectUri(),
        client_id: SPOTIFY_CLIENT_ID,
        code_verifier: verifier
      });
      await initSpotifySDK();
      show(musicPanel); // giriş dönüşünde paneli aç ki durum görünsün
    } catch (e) {
      spStatus.textContent = 'HATA';
    }
  }

  async function initSpotifySDK() {
    const token = await getAccessToken();
    if (!token) return;
    syncSpotifyUI(true);
    spStatus.textContent = 'BAĞLANIYOR...';
    await new Promise(resolve => {
      if (window.Spotify) return resolve();
      window.onSpotifyWebPlaybackSDKReady = resolve;
      const s = document.createElement('script');
      s.src = 'https://sdk.scdn.co/spotify-player.js';
      document.head.appendChild(s);
    });
    spPlayer = new Spotify.Player({
      name: 'VALOSIM',
      getOAuthToken: cb => getAccessToken().then(t => t && cb(t)),
      volume: Number(dockVolume.value) / 100
    });
    spPlayer.addListener('ready', ({ device_id }) => {
      spDeviceId = device_id;
      spStatus.textContent = 'HAZIR';
    });
    spPlayer.addListener('player_state_changed', st => {
      if (!st) return;
      const tr = st.track_window && st.track_window.current_track;
      const label = tr ? tr.name + ' — ' + tr.artists.map(a => a.name).join(', ') : '—';
      spTrack.textContent = label;
      if (activeSource === 'spotify') dockTitle.textContent = label;
    });
    spPlayer.addListener('authentication_error', () => spotifyLogout());
    spPlayer.addListener('account_error', () => { spStatus.textContent = 'PREMIUM GEREKLİ'; });
    spPlayer.connect();
  }

  async function spApi(path, body) {
    const t = await getAccessToken();
    if (!t) return;
    await fetch('https://api.spotify.com/v1' + path, {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }).catch(() => {});
  }

  function spotifyLogout() {
    ['valosim_sp_access', 'valosim_sp_refresh', 'valosim_sp_expires', 'valosim_sp_verifier']
      .forEach(k => localStorage.removeItem(k));
    if (spPlayer) { spPlayer.disconnect(); spPlayer = null; }
    spDeviceId = null;
    syncSpotifyUI(false);
    if (activeSource === 'spotify') { hide(musicDock); activeSource = null; }
  }

  function syncSpotifyUI(connected) {
    if (connected) {
      hide(spConnectBtn); hide(spSetupNote);
      show(spControls); show(spLogoutBtn);
    } else {
      show(spConnectBtn);
      hide(spControls); hide(spLogoutBtn);
      spStatus.textContent = SPOTIFY_CLIENT_ID ? '' : 'KURULUM BEKLİYOR';
    }
  }

  spConnectBtn.addEventListener('click', spotifyConnect);
  spLogoutBtn.addEventListener('click', spotifyLogout);
  document.getElementById('spPlay').addEventListener('click', () => spPlayer && spPlayer.togglePlay());
  document.getElementById('spPrev').addEventListener('click', () => spPlayer && spPlayer.previousTrack());
  document.getElementById('spNext').addEventListener('click', () => spPlayer && spPlayer.nextTrack());
  document.getElementById('spTransfer').addEventListener('click', () => {
    if (!spDeviceId) return;
    if (ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
    spApi('/me/player', { device_ids: [spDeviceId], play: true });
    setDockSource('spotify');
    dockTitle.textContent = spTrack.textContent;
  });

  // ── Dock controls (aktif kaynağa yönlenir) ───────────────────
  document.getElementById('dockPlay').addEventListener('click', () => {
    if (activeSource === 'yt' && ytPlayer) {
      ytPlayer.getPlayerState() === 1 ? ytPlayer.pauseVideo() : ytPlayer.playVideo();
    } else if (activeSource === 'spotify' && spPlayer) {
      spPlayer.togglePlay();
    }
  });
  document.getElementById('dockPrev').addEventListener('click', () => {
    if (activeSource === 'yt' && ytPlayer) ytPlayer.previousVideo();
    else if (activeSource === 'spotify' && spPlayer) spPlayer.previousTrack();
  });
  document.getElementById('dockNext').addEventListener('click', () => {
    if (activeSource === 'yt' && ytPlayer) ytPlayer.nextVideo();
    else if (activeSource === 'spotify' && spPlayer) spPlayer.nextTrack();
  });
  document.getElementById('dockMin').addEventListener('click', () => musicDock.classList.toggle('collapsed'));
  document.getElementById('dockClose').addEventListener('click', () => {
    if (ytPlayer && ytPlayer.stopVideo) ytPlayer.stopVideo();
    if (spPlayer) spPlayer.pause().catch(() => {});
    hide(musicDock);
    activeSource = null;
  });
  dockVolume.addEventListener('input', e => {
    const v = Number(e.target.value);
    if (ytPlayer && ytPlayer.setVolume) ytPlayer.setVolume(v);
    if (spPlayer) spPlayer.setVolume(v / 100);
  });

  // ── Panel açma/kapama ────────────────────────────────────────
  const openMusicPanel = () => {
    ytUrlInput.value = localStorage.getItem('valosim_yt_url') || '';
    show(musicPanel);
  };
  document.getElementById('musicBtn').addEventListener('click', openMusicPanel);
  document.getElementById('musicFromPauseBtn').addEventListener('click', openMusicPanel);
  document.getElementById('closeMusicBtn').addEventListener('click', () => hide(musicPanel));

  // ── Başlangıç ────────────────────────────────────────────────
  syncSpotifyUI(false);
  handleAuthRedirect();
  if (SPOTIFY_CLIENT_ID && localStorage.getItem('valosim_sp_refresh')) initSpotifySDK();
})();
