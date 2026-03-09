// ============================================================
// Shadow Mess v2.9 — WebRTC Calls (Telegram-style)
// Noise suppression · Mobile audio fix · Mic/Cam indicators
// ============================================================
'use strict';

window.callsModule = (() => {
  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'turn:a.relay.metered.ca:80',       username: 'e8dd65c92f3adb1d372bf5b6', credential: 'kCHFaVoXn6cjsRTo' },
    { urls: 'turn:a.relay.metered.ca:443',      username: 'e8dd65c92f3adb1d372bf5b6', credential: 'kCHFaVoXn6cjsRTo' },
    { urls: 'turn:a.relay.metered.ca:443?transport=tcp', username: 'e8dd65c92f3adb1d372bf5b6', credential: 'kCHFaVoXn6cjsRTo' },
  ];

  let pc              = null;
  let localStream     = null;
  let screenStream    = null;
  let remoteStream    = null;
  let currentPeer     = null;
  let isMuted         = false;
  let isVideoOff      = true;
  let isScreenSharing = false;
  let callType        = 'audio';
  let _hasRemoteVideo = false;
  let _audioCtx       = null;       // for noise suppression
  let _noiseNode      = null;
  let _reconnectTimer = null;

  const $ = id => document.getElementById(id);

  function getSocket() { return window.State?.socket || null; }
  function isMobile()  { return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent); }

  function isIOS() { return /iPhone|iPad|iPod/i.test(navigator.userAgent); }

  // ── Noise suppression via Web Audio ────────────────────
  function applyNoiseSuppression(stream) {
    if (!stream || !stream.getAudioTracks().length) return stream;

    // Skip Web Audio processing on iOS — causes audio crackling and glitches
    if (isIOS()) return stream;

    try {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();

      if (_audioCtx.state === 'suspended') {
        _audioCtx.resume().catch(() => {});
      }

      const source = _audioCtx.createMediaStreamSource(stream);
      const dest = _audioCtx.createMediaStreamDestination();

      // ── Stage 1: Subsonic rumble removal (4th order) ──
      const hp1 = _audioCtx.createBiquadFilter();
      hp1.type = 'highpass'; hp1.frequency.value = 75; hp1.Q.value = 0.5;
      const hp2 = _audioCtx.createBiquadFilter();
      hp2.type = 'highpass'; hp2.frequency.value = 100; hp2.Q.value = 0.7;
      const hp3 = _audioCtx.createBiquadFilter();
      hp3.type = 'highpass'; hp3.frequency.value = 150; hp3.Q.value = 0.5;

      // ── Stage 2: Mains hum removal (50 + 60 Hz + harmonics) ──
      const notch50 = _audioCtx.createBiquadFilter();
      notch50.type = 'notch'; notch50.frequency.value = 50; notch50.Q.value = 15;
      const notch60 = _audioCtx.createBiquadFilter();
      notch60.type = 'notch'; notch60.frequency.value = 60; notch60.Q.value = 15;
      const notch100 = _audioCtx.createBiquadFilter();
      notch100.type = 'notch'; notch100.frequency.value = 100; notch100.Q.value = 12;
      const notch120 = _audioCtx.createBiquadFilter();
      notch120.type = 'notch'; notch120.frequency.value = 120; notch120.Q.value = 12;

      // ── Stage 3: High-frequency hiss removal ──
      const lp1 = _audioCtx.createBiquadFilter();
      lp1.type = 'lowpass'; lp1.frequency.value = 8000; lp1.Q.value = 0.5;
      const lp2 = _audioCtx.createBiquadFilter();
      lp2.type = 'lowpass'; lp2.frequency.value = 10000; lp2.Q.value = 0.7;

      // ── Stage 4: De-emphasize non-voice bands ──
      // Cut muddy low-mids (200-400Hz)
      const cutMud = _audioCtx.createBiquadFilter();
      cutMud.type = 'peaking'; cutMud.frequency.value = 300; cutMud.gain.value = -3; cutMud.Q.value = 0.8;
      // Cut nasal resonance (~800Hz)
      const cutNasal = _audioCtx.createBiquadFilter();
      cutNasal.type = 'peaking'; cutNasal.frequency.value = 800; cutNasal.gain.value = -1.5; cutNasal.Q.value = 1;

      // ── Stage 5: Voice clarity enhancement ──
      // Presence boost (2-4kHz) for articulation
      const presence = _audioCtx.createBiquadFilter();
      presence.type = 'peaking'; presence.frequency.value = 2800; presence.gain.value = 4; presence.Q.value = 0.8;
      // Warmth (fundamental voice range)
      const warmth = _audioCtx.createBiquadFilter();
      warmth.type = 'peaking'; warmth.frequency.value = 500; warmth.gain.value = 1.5; warmth.Q.value = 1;

      // ── Stage 6: Noise gate / compressor ──
      // Expander-like behavior: aggressive compression to suppress low-level noise
      const gate = _audioCtx.createDynamicsCompressor();
      gate.threshold.value = -40;
      gate.knee.value = 6;
      gate.ratio.value = 12;
      gate.attack.value = 0.001;
      gate.release.value = 0.08;

      // Secondary gentle compressor for voice leveling
      const comp = _audioCtx.createDynamicsCompressor();
      comp.threshold.value = -20;
      comp.knee.value = 20;
      comp.ratio.value = 3;
      comp.attack.value = 0.003;
      comp.release.value = 0.25;

      // ── Stage 7: Output gain ──
      const outGain = _audioCtx.createGain();
      outGain.gain.value = 1.5;

      // Chain: source → hp1 → hp2 → hp3 → notch50 → notch60 → notch100 → notch120
      //        → cutMud → warmth → cutNasal → presence → lp1 → lp2 → gate → comp → outGain → dest
      source.connect(hp1);
      hp1.connect(hp2);
      hp2.connect(hp3);
      hp3.connect(notch50);
      notch50.connect(notch60);
      notch60.connect(notch100);
      notch100.connect(notch120);
      notch120.connect(cutMud);
      cutMud.connect(warmth);
      warmth.connect(cutNasal);
      cutNasal.connect(presence);
      presence.connect(lp1);
      lp1.connect(lp2);
      lp2.connect(gate);
      gate.connect(comp);
      comp.connect(outGain);
      outGain.connect(dest);

      // Replace audio track
      const processedTrack = dest.stream.getAudioTracks()[0];
      const origTrack = stream.getAudioTracks()[0];
      stream.removeTrack(origTrack);
      stream.addTrack(processedTrack);

      processedTrack._origTrack = origTrack;
      _noiseNode = { source, dest, hp1, hp2, hp3, notch50, notch60, notch100, notch120, cutMud, warmth, cutNasal, presence, lp1, lp2, gate, comp, outGain };
    } catch (e) {
      console.warn('[calls] Noise suppression failed:', e);
    }
    return stream;
  }

  // ── Update call UI layers ──────────────────────────────
  function updateCallView() {
    const videoLayer = $('call-video-layer');
    const audioLayer = $('call-audio-layer');
    if (!videoLayer || !audioLayer) return;

    const showVideo = _hasRemoteVideo || isScreenSharing;

    if (showVideo) {
      videoLayer.classList.remove('hidden');
      videoLayer.classList.add('active');
      audioLayer.classList.add('hidden-layer');
    } else {
      videoLayer.classList.remove('active');
      videoLayer.classList.add('hidden');
      audioLayer.classList.remove('hidden-layer');
    }

    // Screen badge
    const badge = $('call-screen-badge');
    if (badge) badge.classList.toggle('hidden', !isScreenSharing);

    // PiP local video
    const pip = $('call-pip');
    const pipOff = $('call-pip-off');
    if (pip) {
      const showPip = !isVideoOff || isScreenSharing;
      pip.classList.toggle('hidden', !showPip);
      if (pipOff) pipOff.classList.toggle('hidden', !isVideoOff);
    }

    // Mic/video status indicators
    _updateMicIndicator('my-mic-status', isMuted);
    _updateCamIndicator('my-cam-status', isVideoOff);

    // Peer mute indicator
    const peerMic = $('peer-mic-status');
    if (peerMic) {
      // We don't know remote mic status through WebRTC alone; 
      // it's signaled separately through socket
    }
  }

  function _updateMicIndicator(id, muted) {
    const el = $(id);
    if (!el) return;
    el.classList.toggle('indicator-off', muted);
    el.title = muted ? 'Микрофон выключен' : 'Микрофон включён';
    const icon = el.querySelector('i, svg');
    if (icon) {
      if (muted) {
        icon.outerHTML = '<i class="fas fa-microphone-slash"></i>';
      } else {
        icon.outerHTML = '<i class="fas fa-microphone"></i>';
      }
    }
  }

  function _updateCamIndicator(id, off) {
    const el = $(id);
    if (!el) return;
    el.classList.toggle('indicator-off', off);
    el.title = off ? 'Камера выключена' : 'Камера включена';
  }

  // ── Peer Connection ────────────────────────────────────
  function createPC() {
    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS, iceCandidatePoolSize: 5 });

    pc.onicecandidate = ({ candidate }) => {
      if (candidate && currentPeer) {
        getSocket()?.emit('call_ice', { to: currentPeer, candidate });
      }
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (!stream) return;
      remoteStream = stream;

      // Remote video element
      const remoteVideo = $('remote-video');
      if (remoteVideo) {
        remoteVideo.srcObject = stream;
        remoteVideo.play().catch(() => {});
      }

      // Dedicated audio playback — critical for mobile
      if (event.track.kind === 'audio') {
        let remoteAudio = $('remote-audio-hidden');
        if (!remoteAudio) {
          remoteAudio = document.createElement('audio');
          remoteAudio.id = 'remote-audio-hidden';
          remoteAudio.autoplay = true;
          remoteAudio.playsInline = true;
          remoteAudio.setAttribute('playsinline', '');
          remoteAudio.volume = 1.0;
          remoteAudio.style.display = 'none';
          document.body.appendChild(remoteAudio);
        }
        // Create new MediaStream with just audio track for reliable playback on mobile
        const audioOnlyStream = new MediaStream([event.track]);
        remoteAudio.srcObject = audioOnlyStream;
        remoteAudio.volume = 1.0;
        remoteAudio.muted = false;

        // Force play on mobile — user gesture may be needed
        const tryPlay = () => {
          if (!remoteAudio.srcObject) return;
          remoteAudio.play().then(() => {
            remoteAudio.volume = 1.0;
            console.log('[calls] Remote audio playing');
          }).catch(e => {
            console.warn('[calls] Audio play failed, retrying:', e.message);
            setTimeout(tryPlay, 500);
          });
        };
        tryPlay();

        // Also try Web Audio API approach as fallback for mobile
        try {
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          if (audioCtx.state === 'suspended') audioCtx.resume();
          const source = audioCtx.createMediaStreamSource(audioOnlyStream);
          source.connect(audioCtx.destination);
        } catch (e) {
          console.warn('[calls] Web Audio fallback failed:', e.message);
        }

        // iOS: resume AudioContext if suspended
        if (_audioCtx?.state === 'suspended') {
          _audioCtx.resume().catch(() => {});
        }
      }

      if (event.track.kind === 'video') {
        event.track.onunmute = () => { _hasRemoteVideo = true; updateCallView(); };
        event.track.onmute = () => { _hasRemoteVideo = false; updateCallView(); };
        if (event.track.enabled && event.track.readyState === 'live') {
          _hasRemoteVideo = true;
          updateCallView();
        }
      }
    };

    pc.onconnectionstatechange = () => {
      const st = pc?.connectionState;
      console.log('[calls] connectionState:', st);
      if (st === 'connected') {
        // Reset reconnect timer
        if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
        // Emit mic/cam status to peer
        getSocket()?.emit('call_status', {
          to: currentPeer,
          micMuted: isMuted,
          camOff: isVideoOff
        });
      }
      if (st === 'disconnected') {
        // Temporary disconnect — wait before ending call (common on mobile)
        if (!_reconnectTimer) {
          _reconnectTimer = setTimeout(() => {
            if (pc?.connectionState === 'disconnected' || pc?.connectionState === 'failed') {
              if (_onConnectionLost) _onConnectionLost();
              else endCall();
            }
            _reconnectTimer = null;
          }, 10000); // wait 10 seconds before giving up
        }
      }
      if (st === 'failed') {
        if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
        if (_onConnectionLost) _onConnectionLost();
        else endCall();
      }
      // Ignore 'closed' — that's from our own endCall() cleanup
    };

    return pc;
  }

  // ── Get local media stream (with fallbacks) ────────────
  async function getLocalStream(type) {
    // For mobile: Use echoCancellation, noiseSuppression, autoGainControl
    const audioConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };

    // Mobile-specific: set sample rate for better compatibility
    if (isMobile()) {
      audioConstraints.sampleRate = 48000;
      audioConstraints.channelCount = 1;
    }

    const wantVideo = type === 'video';
    const videoConstraints = wantVideo
      ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
      : false;

    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: videoConstraints
      });
      isVideoOff = !wantVideo;
    } catch (err) {
      console.warn('[calls] getUserMedia failed:', err.name, err.message);

      if (wantVideo) {
        // Fallback: try audio-only
        window.showToast?.('📷 Камера недоступна — звонок без видео', 'warning');
        try {
          localStream = await navigator.mediaDevices.getUserMedia({
            audio: audioConstraints, video: false
          });
          isVideoOff = true;
        } catch {
          window.showToast?.('🎤 Нет доступа к микрофону — вы без звука', 'warning');
          localStream = createSilentStream();
          isMuted = true;
          isVideoOff = true;
        }
      } else {
        window.showToast?.('🎤 Нет доступа к микрофону — подключаемся без звука', 'warning');
        localStream = createSilentStream();
        isMuted = true;
      }
    }

    // Apply noise suppression
    localStream = applyNoiseSuppression(localStream);

    // Ensure we have a video track for later camera toggle / screen share
    if (!localStream.getVideoTracks().length) {
      const canvas = Object.assign(document.createElement('canvas'), { width: 2, height: 2 });
      canvas.getContext('2d').fillRect(0, 0, 2, 2);
      const dummyTrack = canvas.captureStream(1).getVideoTracks()[0];
      dummyTrack.enabled = false;
      localStream.addTrack(dummyTrack);
    }

    const lv = $('local-video');
    if (lv) lv.srcObject = localStream;

    updateCallView();
    return localStream;
  }

  function createSilentStream() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      const dest = ctx.createMediaStreamDestination();
      gain.connect(dest);
      osc.start();
      return dest.stream;
    } catch {
      return new MediaStream();
    }
  }

  function attachLocalTracks() {
    if (!localStream || !pc) return;
    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
    });
  }

  function stopLocalStream() {
    if (localStream) {
      localStream.getTracks().forEach(t => {
        if (t._origTrack) t._origTrack.stop();
        t.stop();
      });
      localStream = null;
    }
    if (_audioCtx) {
      _audioCtx.close().catch(() => {});
      _audioCtx = null;
      _noiseNode = null;
    }
    const lv = $('local-video');
    const rv = $('remote-video');
    if (lv) lv.srcObject = null;
    if (rv) rv.srcObject = null;
    const ra = $('remote-audio-hidden');
    if (ra) { ra.srcObject = null; ra.remove(); }
  }

  // ── Call API ───────────────────────────────────────────
  async function startCall(userId, type) {
    currentPeer     = userId;
    callType        = type || 'audio';
    _hasRemoteVideo = false;
    isMuted         = false;
    isVideoOff      = type !== 'video';

    try {
      createPC();
      await getLocalStream(callType);
      attachLocalTracks();

      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);

      const user = window.State?.user;
      getSocket()?.emit('call_offer', {
        to: userId, offer: pc.localDescription, callType,
        fromName: user?.displayName || user?.username || '',
        fromAvatarColor: user?.avatarColor || '#333333'
      });

      // Show active call overlay
      $('active-call-overlay')?.classList.remove('hidden');
    } catch (err) {
      console.error('[calls] startCall error:', err);
      endCall();
      throw err;
    }
  }

  async function acceptCall(userId, offer, type) {
    currentPeer     = userId;
    callType        = type || 'audio';
    _hasRemoteVideo = false;
    isMuted         = false;
    isVideoOff      = type !== 'video';

    try {
      createPC();
      await getLocalStream(callType);
      attachLocalTracks();
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      getSocket()?.emit('call_answer', { to: userId, answer: pc.localDescription });

      // Show active call overlay
      $('active-call-overlay')?.classList.remove('hidden');
    } catch (err) {
      console.error('[calls] acceptCall error:', err);
      endCall();
      throw err;
    }
  }

  async function onAnswer({ from, answer }) {
    if (!pc) return;
    try { await pc.setRemoteDescription(new RTCSessionDescription(answer)); }
    catch (e) { console.error('[calls] onAnswer error:', e); }
  }

  async function onIce({ from, candidate }) {
    if (!pc) return;
    try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
    catch (e) { console.error('[calls] onIce error:', e); }
  }

  // Handle peer mic/cam status
  function onPeerStatus({ micMuted, camOff }) {
    _updateMicIndicator('peer-mic-status', micMuted);
    _updateCamIndicator('peer-cam-status', camOff);
  }

  // Called when the remote peer ended the call
  function onEnded() {
    endCall(true);
  }

  // Called when connection itself fails/disconnects
  let _onConnectionLost = null;

  function endCall(skipEmit = false) {
    const peerToNotify = currentPeer;
    if (pc) { try { pc.close(); } catch {} pc = null; }
    if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; }
    isScreenSharing = false;
    _hasRemoteVideo = false;
    stopLocalStream();
    currentPeer = null;
    isMuted = false;
    isVideoOff = true;

    // Emit call_end AFTER clearing currentPeer to prevent re-entry
    if (!skipEmit && peerToNotify) {
      getSocket()?.emit('call_end', { to: peerToNotify });
    }

    // Don't hide overlay here — let app.js handleCallEnded() control UI
    $('toggle-screen')?.classList.remove('sharing');
    $('toggle-mute')?.classList.remove('vk-ctrl-off');
    $('toggle-video')?.classList.remove('vk-ctrl-off');
    clearInterval(window._callTimerInterval);

    const vl = $('call-video-layer');
    const al = $('call-audio-layer');
    if (vl) { vl.classList.remove('active'); vl.classList.add('hidden'); }
    if (al) al.classList.remove('hidden-layer');
  }

  function toggleMute() {
    if (!localStream) return isMuted;
    isMuted = !isMuted;

    // Use gain node mute when noise suppression is active to keep AudioContext alive
    // (disabling tracks can kill the audio session on mobile, muting remote audio too)
    if (_noiseNode && _noiseNode.gain) {
      _noiseNode.gain.gain.value = isMuted ? 0 : 1.2;
    } else {
      // Fallback: toggle track.enabled when no noise suppression chain
      localStream.getAudioTracks().forEach(t => { t.enabled = !isMuted; });
    }

    // Notify peer about mic status
    if (currentPeer) {
      getSocket()?.emit('call_status', { to: currentPeer, micMuted: isMuted, camOff: isVideoOff });
    }
    updateCallView();
    return isMuted;
  }

  async function toggleVideo() {
    if (!localStream || !pc) return isVideoOff;

    const videoTracks = localStream.getVideoTracks();
    const hasDummyOnly = videoTracks.length === 1 && (videoTracks[0].label === '' || !videoTracks[0].label);

    if (isVideoOff) {
      // Turning camera ON
      if (hasDummyOnly) {
        try {
          const camStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
          });
          const camTrack = camStream.getVideoTracks()[0];

          // Remove dummy track
          videoTracks.forEach(t => { t.stop(); localStream.removeTrack(t); });
          localStream.addTrack(camTrack);

          // Replace track in peer connection
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            await sender.replaceTrack(camTrack);
          } else {
            pc.addTrack(camTrack, localStream);
          }

          const lv = $('local-video');
          if (lv) lv.srcObject = localStream;

          isVideoOff = false;
          callType = 'video';

          // Trigger renegotiation so remote peer sees video
          await _renegotiate();
        } catch (e) {
          console.error('[calls] toggleVideo ON error:', e);
          window.showToast?.('📷 Камера недоступна', 'warning');
          return isVideoOff;
        }
      } else {
        // Re-enable existing video track
        videoTracks.forEach(t => { t.enabled = true; });
        isVideoOff = false;
        callType = 'video';
      }
    } else {
      // Turning camera OFF — just disable track, don't stop/remove
      videoTracks.forEach(t => { t.enabled = false; });
      isVideoOff = true;
    }

    // Notify peer
    if (currentPeer) {
      getSocket()?.emit('call_status', { to: currentPeer, micMuted: isMuted, camOff: isVideoOff });
    }
    updateCallView();
    return isVideoOff;
  }

  // ── Renegotiation helper ──
  async function _renegotiate() {
    if (!pc || !currentPeer) return;
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      getSocket()?.emit('call_offer', {
        to: currentPeer,
        offer: pc.localDescription,
        callType,
        renegotiate: true
      });
    } catch (e) {
      console.warn('[calls] renegotiation error:', e);
    }
  }

  async function startScreenShare() {
    if (!pc) throw new Error('No active call');
    if (!navigator.mediaDevices.getDisplayMedia) {
      window.showToast?.('Демонстрация экрана недоступна на этом устройстве', 'warning');
      return;
    }
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 60 }, width: { ideal: 1920 }, height: { ideal: 1080 }, cursor: 'always' },
        audio: false
      });
      isScreenSharing = true;
      const screenTrack = screenStream.getVideoTracks()[0];
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender) await sender.replaceTrack(screenTrack);
      else pc.addTrack(screenTrack, screenStream);

      // Signal peer about screen share via renegotiation
      await _renegotiate();

      updateCallView();
      const lv = $('local-video');
      if (lv) lv.srcObject = screenStream;

      screenTrack.onended = () => {
        stopScreenShare();
        $('toggle-screen')?.classList.remove('sharing');
        window.showToast?.('Демонстрация остановлена', 'info');
      };
    } catch (err) {
      isScreenSharing = false;
      screenStream = null;
      throw err;
    }
  }

  async function stopScreenShare() {
    if (!isScreenSharing || !pc) return;
    if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; }
    isScreenSharing = false;
    if (localStream) {
      const camTrack = localStream.getVideoTracks()[0];
      if (camTrack) {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(camTrack);
      }
      const lv = $('local-video');
      if (lv) lv.srcObject = localStream;
    }
    // Renegotiate to signal peer about stop
    await _renegotiate();
    updateCallView();
  }

  // ── Handle renegotiation offer from peer (e.g. camera toggled on) ─
  async function onRenegotiate({ from, offer }) {
    if (!pc || from !== currentPeer) return;
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      getSocket()?.emit('call_answer', { to: from, answer: pc.localDescription });
    } catch (e) {
      console.warn('[calls] renegotiation answer error:', e);
    }
  }

  return {
    startCall, acceptCall, onAnswer, onIce, onEnded, endCall,
    toggleMute, toggleVideo, startScreenShare, stopScreenShare,
    onPeerStatus, onRenegotiate,
    setOnConnectionLost: cb => { _onConnectionLost = cb; },
    isInCall: () => !!pc,
    isMuted: () => isMuted,
    isVideoOff: () => isVideoOff,
    updateCallView,
  };
})();

// ============================================================
// GROUP CALLS — Mesh Network Module
// ============================================================
window.groupCallModule = (() => {
  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'turn:a.relay.metered.ca:80',       username: 'e8dd65c92f3adb1d372bf5b6', credential: 'kCHFaVoXn6cjsRTo' },
    { urls: 'turn:a.relay.metered.ca:443',      username: 'e8dd65c92f3adb1d372bf5b6', credential: 'kCHFaVoXn6cjsRTo' },
    { urls: 'turn:a.relay.metered.ca:443?transport=tcp', username: 'e8dd65c92f3adb1d372bf5b6', credential: 'kCHFaVoXn6cjsRTo' },
  ];

  let localStream = null;
  const peers = new Map();
  let currentChatId = null;
  let members = [];
  let isMuted = false;
  let onMembersChange = null;

  function getSocket() { return window.State?.socket || null; }

  async function getLocalStream() {
    const audioConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
    } catch {
      window.showToast?.('🎤 Нет доступа к микрофону — вы без звука', 'warning');
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const g = ctx.createGain(); g.gain.value = 0;
        osc.connect(g);
        const dest = ctx.createMediaStreamDestination();
        g.connect(dest); osc.start();
        localStream = dest.stream;
      } catch { localStream = new MediaStream(); }
      isMuted = true;
    }
    return localStream;
  }

  function createPeerConnection(targetUserId) {
    const peerPC = new RTCPeerConnection({ iceServers: ICE_SERVERS, iceCandidatePoolSize: 3 });
    peerPC.onicecandidate = ({ candidate }) => {
      if (candidate && currentChatId) {
        getSocket()?.emit('group_call_ice', { chatId: currentChatId, to: targetUserId, candidate });
      }
    };
    peerPC.ontrack = (event) => {
      const pd = peers.get(targetUserId);
      if (pd && event.streams[0]) {
        pd.stream = event.streams[0];
        let a = document.getElementById(`gc-audio-${targetUserId}`);
        if (!a) {
          a = document.createElement('audio');
          a.id = `gc-audio-${targetUserId}`;
          a.autoplay = true;
          a.playsInline = true;
          a.setAttribute('playsinline', '');
          a.style.display = 'none';
          document.body.appendChild(a);
        }
        const audioStream = new MediaStream([event.track]);
        a.srcObject = audioStream;
        a.play().catch(() => setTimeout(() => a.play().catch(() => {}), 500));
      }
    };
    peerPC.onconnectionstatechange = () => {
      if (peerPC.connectionState === 'failed' || peerPC.connectionState === 'disconnected') {
        removePeer(targetUserId);
      }
    };
    if (localStream) localStream.getTracks().forEach(t => peerPC.addTrack(t, localStream));
    peers.set(targetUserId, { pc: peerPC, stream: null });
    return peerPC;
  }

  function removePeer(uid) {
    const pd = peers.get(uid);
    if (pd) {
      try { pd.pc.close(); } catch {}
      peers.delete(uid);
      const a = document.getElementById(`gc-audio-${uid}`);
      if (a) { a.srcObject = null; a.remove(); }
    }
  }

  async function joinGroupCall(chatId) {
    currentChatId = chatId;
    isMuted = false;
    await getLocalStream();
    getSocket()?.emit('group_call_join', { chatId });
  }

  async function onUserJoined({ chatId, user }) {
    if (chatId !== currentChatId) return;
    const peerPC = createPeerConnection(user.id);
    const offer = await peerPC.createOffer({ offerToReceiveAudio: true });
    await peerPC.setLocalDescription(offer);
    getSocket()?.emit('group_call_offer', { chatId, to: user.id, offer: peerPC.localDescription });
  }

  async function onJoined() {}

  async function onGroupOffer({ chatId, from, offer }) {
    if (chatId !== currentChatId) return;
    const peerPC = createPeerConnection(from);
    await peerPC.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerPC.createAnswer();
    await peerPC.setLocalDescription(answer);
    getSocket()?.emit('group_call_answer', { chatId, to: from, answer: peerPC.localDescription });
  }

  async function onGroupAnswer({ chatId, from, answer }) {
    if (chatId !== currentChatId) return;
    const pd = peers.get(from);
    if (pd?.pc) await pd.pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  async function onGroupIce({ chatId, from, candidate }) {
    if (chatId !== currentChatId) return;
    const pd = peers.get(from);
    if (pd?.pc) await pd.pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  function onUserLeft({ chatId, userId }) {
    if (chatId !== currentChatId) return;
    removePeer(userId);
    members = members.filter(m => m.id !== userId);
    onMembersChange?.(members);
  }

  function onMembersUpdate({ chatId, members: nm }) {
    if (chatId !== currentChatId) return;
    members = nm.map(m => ({ ...m, muted: m.muted || false }));
    onMembersChange?.(members);
  }

  function onMicStatus({ chatId, userId, muted }) {
    if (chatId !== currentChatId) return;
    const m = members.find(x => x.id === userId);
    if (m) m.muted = muted;
    onMembersChange?.(members);
  }

  function leaveGroupCall() {
    if (currentChatId) getSocket()?.emit('group_call_leave', { chatId: currentChatId });
    peers.forEach((_, uid) => removePeer(uid));
    peers.clear();
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    currentChatId = null; members = []; isMuted = false;
  }

  function toggleMute() {
    if (!localStream) return isMuted;
    localStream.getAudioTracks().forEach(t => { t.enabled = isMuted; });
    isMuted = !isMuted;
    if (currentChatId) getSocket()?.emit('group_call_toggle_mic', { chatId: currentChatId, muted: isMuted });
    return isMuted;
  }

  return {
    joinGroupCall, leaveGroupCall, toggleMute,
    onUserJoined, onJoined, onGroupOffer, onGroupAnswer, onGroupIce,
    onUserLeft, onMembersUpdate, onMicStatus,
    getMembers: () => members, isInGroupCall: () => !!currentChatId,
    setOnMembersChange: cb => { onMembersChange = cb; }
  };
})();
