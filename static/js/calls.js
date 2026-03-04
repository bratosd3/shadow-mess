// ============================================================
// Shadow Mess v2.8 — WebRTC Calls (Full Rewrite)
// ============================================================

'use strict';

window.callsModule = (() => {
  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478'  },
    { urls: 'turn:a.relay.metered.ca:80',       username: 'e8dd65c92f3adb1d372bf5b6', credential: 'kCHFaVoXn6cjsRTo' },
    { urls: 'turn:a.relay.metered.ca:443',      username: 'e8dd65c92f3adb1d372bf5b6', credential: 'kCHFaVoXn6cjsRTo' },
    { urls: 'turn:a.relay.metered.ca:443?transport=tcp', username: 'e8dd65c92f3adb1d372bf5b6', credential: 'kCHFaVoXn6cjsRTo' },
  ];

  let pc             = null;
  let localStream    = null;
  let screenStream   = null;
  let remoteStream   = null;
  let currentPeer    = null;
  let isMuted        = false;
  let isVideoOff     = false;
  let isScreenSharing = false;
  let callType       = 'audio';
  let _hasRemoteVideo = false;

  const $ = id => document.getElementById(id);

  function getSocket() {
    return window.State?.socket || null;
  }

  // ── Show/hide video vs audio layer ─────────────────────
  function updateCallView() {
    const videoLayer = $('call-video-layer');
    const audioLayer = $('call-audio-layer');
    if (!videoLayer || !audioLayer) return;

    const showVideo = _hasRemoteVideo || isScreenSharing || (callType === 'video' && !isVideoOff);

    if (showVideo) {
      videoLayer.classList.add('active');
      audioLayer.classList.add('hidden-layer');
    } else {
      videoLayer.classList.remove('active');
      audioLayer.classList.remove('hidden-layer');
    }

    // Screen badge
    const badge = $('call-screen-badge');
    if (badge) badge.classList.toggle('hidden', !isScreenSharing && !_hasRemoteVideo);

    // PiP
    const pip = $('call-pip');
    const pipOff = $('call-pip-off');
    if (pip) {
      if (callType === 'video' || isScreenSharing) {
        pip.classList.remove('hidden');
        if (pipOff) pipOff.classList.toggle('hidden', !isVideoOff);
      } else {
        pip.classList.add('hidden');
      }
    }
  }

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

      const remoteVideo = $('remote-video');
      if (remoteVideo) {
        remoteVideo.srcObject = stream;
        remoteVideo.play().catch(() => {});
      }

      if (event.track.kind === 'audio') {
        let remoteAudio = $('remote-audio-hidden');
        if (!remoteAudio) {
          remoteAudio = document.createElement('audio');
          remoteAudio.id = 'remote-audio-hidden';
          remoteAudio.autoplay = true;
          remoteAudio.playsInline = true;
          remoteAudio.style.display = 'none';
          document.body.appendChild(remoteAudio);
        }
        remoteAudio.srcObject = stream;
        remoteAudio.play().catch(() => {});
      }

      if (event.track.kind === 'video') {
        event.track.onunmute = () => {
          _hasRemoteVideo = true;
          updateCallView();
        };
        event.track.onmute = () => {
          _hasRemoteVideo = false;
          updateCallView();
        };
        if (event.track.enabled && event.track.readyState === 'live') {
          _hasRemoteVideo = true;
          updateCallView();
        }
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc?.connectionState;
      if (state === 'failed' || state === 'disconnected' || state === 'closed') {
        endCall();
      }
    };

    return pc;
  }

  async function getLocalStream(type) {
    const constraints = {
      audio: true,
      video: type === 'video' ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } : false
    };

    try {
      localStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      if (type === 'video') {
        const isNotFound = err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError' ||
                           err.name === 'OverconstrainedError' || err.name === 'NotReadableError';
        const isDenied = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError';
        if (isNotFound) {
          window.showToast?.('📷 Камера не обнаружена — звонок без видео', 'warning');
        } else if (isDenied) {
          window.showToast?.('📷 Доступ к камере запрещён — звонок без видео', 'warning');
        } else {
          window.showToast?.('📷 Ошибка камеры — звонок без видео', 'warning');
        }
        try {
          localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          isVideoOff = true;
        } catch {
          window.showToast?.('🎤 Нет доступа к микрофону — вы без звука', 'warning');
          localStream = createSilentStream();
          isMuted = true;
          isVideoOff = true;
        }
      } else {
        window.showToast?.('🎤 Нет доступа к микрофону — вы в звонке без звука', 'warning');
        localStream = createSilentStream();
        isMuted = true;
      }
    }

    // Always have a video track for screen share replaceTrack
    if (!localStream.getVideoTracks().length) {
      const canvas = Object.assign(document.createElement('canvas'), { width: 2, height: 2 });
      canvas.getContext('2d').fillRect(0, 0, 2, 2);
      const dummyTrack = canvas.captureStream(1).getVideoTracks()[0];
      dummyTrack.enabled = false;
      localStream.addTrack(dummyTrack);
    }

    const localVideo = $('local-video');
    if (localVideo) {
      localVideo.srcObject = localStream;
    }
    updateCallView();
    return localStream;
  }

  function createSilentStream() {
    try {
      const ctx = new AudioContext();
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
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  }

  function stopLocalStream() {
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      localStream = null;
    }
    const lv = $('local-video');
    const rv = $('remote-video');
    if (lv) lv.srcObject = null;
    if (rv) rv.srcObject = null;
    const ra = $('remote-audio-hidden');
    if (ra) { ra.srcObject = null; ra.remove(); }
  }

  // ── Public API ─────────────────────────────────────────

  async function startCall(userId, type) {
    currentPeer = userId;
    callType    = type || 'audio';
    _hasRemoteVideo = false;

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
    } catch (err) {
      console.error('[calls] startCall error:', err);
      endCall();
      throw err;
    }
  }

  async function acceptCall(userId, offer, type) {
    currentPeer = userId;
    callType    = type || 'audio';
    _hasRemoteVideo = false;

    try {
      createPC();
      await getLocalStream(callType);
      attachLocalTracks();
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      getSocket()?.emit('call_answer', { to: userId, answer: pc.localDescription });
    } catch (err) {
      console.error('[calls] acceptCall error:', err);
      endCall();
      throw err;
    }
  }

  async function onAnswer({ from, answer }) {
    if (!pc) return;
    try { await pc.setRemoteDescription(new RTCSessionDescription(answer)); }
    catch (err) { console.error('[calls] onAnswer error:', err); }
  }

  async function onIce({ from, candidate }) {
    if (!pc) return;
    try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
    catch (err) { console.error('[calls] onIce error:', err); }
  }

  function onEnded() {
    endCall();
    window.showToast?.('Звонок завершён', 'info');
  }

  function endCall() {
    if (currentPeer) getSocket()?.emit('call_end', { to: currentPeer });
    if (pc) { try { pc.close(); } catch {} pc = null; }
    if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; }
    isScreenSharing = false;
    _hasRemoteVideo = false;
    stopLocalStream();
    currentPeer = null;
    isMuted = false;
    isVideoOff = false;

    $('active-call-overlay')?.classList.add('hidden');
    $('toggle-screen')?.classList.remove('sharing');
    clearInterval(window._callTimerInterval);

    const vl = $('call-video-layer');
    const al = $('call-audio-layer');
    if (vl) vl.classList.remove('active');
    if (al) al.classList.remove('hidden-layer');
  }

  function toggleMute() {
    if (!localStream) return isMuted;
    localStream.getAudioTracks().forEach(t => { t.enabled = isMuted; });
    isMuted = !isMuted;
    return isMuted;
  }

  function toggleVideo() {
    if (!localStream) return isVideoOff;
    const videoTracks = localStream.getVideoTracks();
    const hasDummyOnly = videoTracks.length === 1 && videoTracks[0].label === '';

    if (isVideoOff && hasDummyOnly) {
      navigator.mediaDevices.getUserMedia({ video: { width:{ideal:640}, height:{ideal:480}, facingMode:'user' } })
        .then(camStream => {
          const camTrack = camStream.getVideoTracks()[0];
          videoTracks.forEach(t => { t.stop(); localStream.removeTrack(t); });
          localStream.addTrack(camTrack);
          const sender = pc?.getSenders().find(s => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(camTrack);
          const lv = $('local-video');
          if (lv) { lv.srcObject = localStream; }
          isVideoOff = false;
          callType = 'video';
          updateCallView();
        })
        .catch(() => window.showToast?.('📷 Камера недоступна', 'warning'));
      return isVideoOff;
    }

    localStream.getVideoTracks().forEach(t => { t.enabled = isVideoOff; });
    isVideoOff = !isVideoOff;
    if (!isVideoOff) callType = 'video';
    updateCallView();
    return isVideoOff;
  }

  async function startScreenShare() {
    if (!pc) throw new Error('No active call');
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate:{ideal:60,max:60}, width:{ideal:1920}, height:{ideal:1080}, cursor:'always' },
        audio: false
      });
      isScreenSharing = true;
      const screenTrack = screenStream.getVideoTracks()[0];
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender) await sender.replaceTrack(screenTrack);
      else pc.addTrack(screenTrack, screenStream);

      updateCallView();
      const lv = $('local-video');
      if (lv) { lv.srcObject = screenStream; lv.style.display = ''; }

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
    updateCallView();
  }

  return {
    startCall, acceptCall, onAnswer, onIce, onEnded, endCall,
    toggleMute, toggleVideo, startScreenShare, stopScreenShare,
    isInCall: () => !!pc, updateCallView
  };
})();

// ============================================================
// GROUP CALLS — Mesh Network Module
// ============================================================
window.groupCallModule = (() => {
  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'turn:a.relay.metered.ca:80', username: 'e8dd65c92f3adb1d372bf5b6', credential: 'kCHFaVoXn6cjsRTo' },
    { urls: 'turn:a.relay.metered.ca:443', username: 'e8dd65c92f3adb1d372bf5b6', credential: 'kCHFaVoXn6cjsRTo' },
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
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      return localStream;
    } catch {
      window.showToast?.('🎤 Нет доступа к микрофону — вы в звонке без звука', 'warning');
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const g = ctx.createGain(); g.gain.value = 0;
        osc.connect(g);
        const dest = ctx.createMediaStreamDestination();
        g.connect(dest); osc.start();
        localStream = dest.stream;
      } catch { localStream = new MediaStream(); }
      isMuted = true;
      return localStream;
    }
  }

  function createPeerConnection(targetUserId) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS, iceCandidatePoolSize: 3 });
    pc.onicecandidate = ({ candidate }) => {
      if (candidate && currentChatId) getSocket()?.emit('group_call_ice', { chatId: currentChatId, to: targetUserId, candidate });
    };
    pc.ontrack = (event) => {
      const pd = peers.get(targetUserId);
      if (pd && event.streams[0]) {
        pd.stream = event.streams[0];
        let a = document.getElementById(`gc-audio-${targetUserId}`);
        if (!a) { a = document.createElement('audio'); a.id = `gc-audio-${targetUserId}`; a.autoplay = true; a.style.display = 'none'; document.body.appendChild(a); }
        a.srcObject = event.streams[0];
      }
    };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') removePeer(targetUserId); };
    if (localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    peers.set(targetUserId, { pc, stream: null });
    return pc;
  }

  function removePeer(uid) {
    const pd = peers.get(uid);
    if (pd) { try { pd.pc.close(); } catch {} peers.delete(uid); const a = document.getElementById(`gc-audio-${uid}`); if (a) { a.srcObject = null; a.remove(); } }
  }

  async function joinGroupCall(chatId) { currentChatId = chatId; isMuted = false; await getLocalStream(); getSocket()?.emit('group_call_join', { chatId }); }

  async function onUserJoined({ chatId, user }) {
    if (chatId !== currentChatId) return;
    const pc = createPeerConnection(user.id);
    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);
    getSocket()?.emit('group_call_offer', { chatId, to: user.id, offer: pc.localDescription });
  }

  async function onJoined() {}

  async function onGroupOffer({ chatId, from, offer }) {
    if (chatId !== currentChatId) return;
    const pc = createPeerConnection(from);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    getSocket()?.emit('group_call_answer', { chatId, to: from, answer: pc.localDescription });
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
