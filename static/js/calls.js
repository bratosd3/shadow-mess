// ============================================================
// Shadow Mess v2.0 — WebRTC Calls
// ============================================================

'use strict';

window.callsModule = (() => {
  // Бесплатные TURN серверы для надёжного NAT traversal
  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478'  },
    // Metered TURN (бесплатный relay)
    { urls: 'turn:a.relay.metered.ca:80',       username: 'e8dd65c92f3adb1d372bf5b6', credential: 'kCHFaVoXn6cjsRTo' },
    { urls: 'turn:a.relay.metered.ca:443',      username: 'e8dd65c92f3adb1d372bf5b6', credential: 'kCHFaVoXn6cjsRTo' },
    { urls: 'turn:a.relay.metered.ca:443?transport=tcp', username: 'e8dd65c92f3adb1d372bf5b6', credential: 'kCHFaVoXn6cjsRTo' },
  ];

  let pc             = null;   // RTCPeerConnection
  let localStream    = null;
  let screenStream   = null;   // screen share stream
  let remoteStream   = null;
  let currentPeer    = null;   // userId of call partner
  let isMuted        = false;
  let isVideoOff     = false;
  let isScreenSharing = false;
  let callType       = 'audio'; // 'audio' | 'video'

  // ── Helpers ────────────────────────────────────────────────
  function getSocket() {
    return window.State?.socket || null;
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

      // Всегда привязываем remote video (для видео и демонстрации)
      const remoteVideo = document.getElementById('remote-video');
      if (remoteVideo) {
        remoteVideo.srcObject = stream;
        remoteVideo.play().catch(() => {});
      }

      // Для надёжного воспроизведения аудио создаём скрытый audio элемент
      if (event.track.kind === 'audio') {
        let remoteAudio = document.getElementById('remote-audio-hidden');
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

      // Если пришёл видео-трек (демонстрация или видео), переключаем на video view
      if (event.track.kind === 'video' && event.track.enabled) {
        event.track.onunmute = () => {
          const avView = document.getElementById('call-audio-view');
          const vdView = document.getElementById('call-video-view');
          if (avView && vdView) {
            avView.classList.add('hidden');
            vdView.classList.remove('hidden');
          }
        };
        event.track.onmute = () => {
          // Если видео-трек замьючен и это был аудио-звонок, вернуть audio view
          if (callType === 'audio') {
            const avView = document.getElementById('call-audio-view');
            const vdView = document.getElementById('call-video-view');
            if (avView && vdView) {
              avView.classList.remove('hidden');
              vdView.classList.add('hidden');
            }
          }
        };
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
      // Если видео запрошено, но камера недоступна — пробуем только аудио
      if (type === 'video') {
        const isNotFound = err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError' || 
                           err.name === 'OverconstrainedError' || err.name === 'NotReadableError';
        const isDenied = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError';
        if (isNotFound) {
          window.showToast?.('📷 Камера не обнаружена — звонок переключён на аудио', 'warning');
        } else if (isDenied) {
          window.showToast?.('📷 Доступ к камере запрещён — звонок переключён на аудио', 'warning');
        } else {
          window.showToast?.('📷 Ошибка камеры — звонок переключён на аудио', 'warning');
        }
        try {
          localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          callType = 'audio'; // переключаем тип звонка
          // Переключаем UI на audio view
          const avView = document.getElementById('call-audio-view');
          const vdView = document.getElementById('call-video-view');
          if (avView) avView.classList.remove('hidden');
          if (vdView) vdView.classList.add('hidden');
        } catch (audioErr) {
          window.showToast?.('Нет доступа к микрофону', 'error');
          throw audioErr;
        }
      } else {
        // Нет доступа к микрофону — создаём тихий поток вместо отключения
        window.showToast?.('🎤 Нет доступа к микрофону — вы в звонке без звука', 'warning');
        try {
          const silentCtx = new AudioContext();
          const oscillator = silentCtx.createOscillator();
          const gain = silentCtx.createGain();
          gain.gain.value = 0;
          oscillator.connect(gain);
          const dest = silentCtx.createMediaStreamDestination();
          gain.connect(dest);
          oscillator.start();
          localStream = dest.stream;
          isMuted = true;
        } catch (silentErr) {
          // Совсем не получилось — создаём пустой MediaStream
          localStream = new MediaStream();
          isMuted = true;
        }
      }
    }

    // Для аудио-звонков добавляем пустой video-трек чтобы демонстрация экрана работала
    if (callType !== 'video' || !localStream.getVideoTracks().length) {
      // Удаляем видео треки если были (для fallback случая)
      if (callType !== 'video') {
        localStream.getVideoTracks().forEach(t => { t.stop(); localStream.removeTrack(t); });
      }
      const canvas = Object.assign(document.createElement('canvas'), { width: 2, height: 2 });
      const ctx2d = canvas.getContext('2d');
      ctx2d.fillRect(0, 0, 2, 2);
      const dummyStream = canvas.captureStream(1);
      const dummyTrack = dummyStream.getVideoTracks()[0];
      dummyTrack.enabled = false;
      localStream.addTrack(dummyTrack);
    }

    // Only show local video for video calls
    const localVideo = document.getElementById('local-video');
    if (localVideo) {
      if (callType === 'video' && localStream.getVideoTracks().some(t => t.enabled)) {
        localVideo.srcObject = localStream;
        localVideo.style.display = '';
      } else {
        localVideo.srcObject = null;
        localVideo.style.display = 'none';
      }
    }
    return localStream;
  }

  function attachLocalTracks() {
    if (!localStream || !pc) return;
    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
    });
  }

  function stopLocalStream() {
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      localStream = null;
    }
    const lv = document.getElementById('local-video');
    const rv = document.getElementById('remote-video');
    if (lv) lv.srcObject = null;
    if (rv) rv.srcObject = null;
    // Убираем скрытый audio элемент
    const ra = document.getElementById('remote-audio-hidden');
    if (ra) { ra.srcObject = null; ra.remove(); }
  }

  // ── Public API ─────────────────────────────────────────────

  /**
   * Initiate an outgoing call
   * @param {string} userId - target user id
   * @param {'audio'|'video'} type
   */
  async function startCall(userId, type) {
    currentPeer = userId;
    callType    = type || 'audio';

    try {
      createPC();
      await getLocalStream(callType);
      attachLocalTracks();

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true    // всегда true для поддержки демонстрации
      });
      await pc.setLocalDescription(offer);

      const user = window.State?.user;
      getSocket()?.emit('call_offer', {
        to:              userId,
        offer:           pc.localDescription,
        callType,
        fromName:        user?.displayName || user?.username || '',
        fromAvatarColor: user?.avatarColor  || '#333333'
      });
    } catch (err) {
      console.error('[calls] startCall error:', err);
      endCall();
    }
  }

  /**
   * Accept incoming call (called when user clicks "Accept")
   * @param {string} userId - caller id
   * @param {RTCSessionDescriptionInit} offer - caller's SDP offer
   * @param {'audio'|'video'} type
   */
  async function acceptCall(userId, offer, type) {
    currentPeer = userId;
    callType    = type || 'audio';

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
    }
  }

  /**
   * Handle remote answer (offerer receives this)
   */
  async function onAnswer({ from, answer }) {
    if (!pc) return;
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
      console.error('[calls] onAnswer error:', err);
    }
  }

  /**
   * Handle incoming ICE candidate
   */
  async function onIce({ from, candidate }) {
    if (!pc) return;
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error('[calls] onIce error:', err);
    }
  }

  /**
   * Remote side ended the call
   */
  function onEnded() {
    endCall();
    window.showToast?.('Звонок завершён', 'info');
  }

  /**
   * End the current call
   */
  function endCall() {
    if (currentPeer) {
      getSocket()?.emit('call_end', { to: currentPeer });
    }
    if (pc) { try { pc.close(); } catch {} pc = null; }
    // Stop screen share if active
    if (screenStream) {
      screenStream.getTracks().forEach(t => t.stop());
      screenStream = null;
    }
    isScreenSharing = false;
    stopLocalStream();
    currentPeer  = null;
    isMuted      = false;
    isVideoOff   = false;

    document.getElementById('active-call-overlay')?.classList.add('hidden');
    // Reset screen share button
    const ssBtn = document.getElementById('toggle-screen');
    if (ssBtn) ssBtn.classList.remove('sharing');
    clearInterval(window._callTimerInterval);
  }

  /**
   * Toggle mute local audio
   * @returns {boolean} true=muted, false=unmuted
   */
  function toggleMute() {
    if (!localStream) return isMuted;
    localStream.getAudioTracks().forEach(t => { t.enabled = isMuted; }); // flip
    isMuted = !isMuted;
    return isMuted;
  }

  /**
   * Toggle local video
   * @returns {boolean} true=video off, false=video on
   */
  function toggleVideo() {
    if (!localStream) return isVideoOff;
    localStream.getVideoTracks().forEach(t => { t.enabled = isVideoOff; }); // flip
    isVideoOff = !isVideoOff;
    const lv = document.getElementById('local-video');
    if (lv) lv.style.display = isVideoOff ? 'none' : '';
    return isVideoOff;
  }

  /**
   * Start screen sharing at 60fps, replacing video track on peer connection
   */
  async function startScreenShare() {
    if (!pc) throw new Error('No active call');
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 60, max: 60 },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          cursor: 'always'
        },
        audio: false
      });
      isScreenSharing = true;

      const screenTrack = screenStream.getVideoTracks()[0];
      // Replace the video track on the peer connection sender
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender) {
        await sender.replaceTrack(screenTrack);
      } else {
        pc.addTrack(screenTrack, screenStream);
      }

      // Переключаем на video view для отображения демонстрации
      const avView = document.getElementById('call-audio-view');
      const vdView = document.getElementById('call-video-view');
      if (avView && vdView) {
        avView.classList.add('hidden');
        vdView.classList.remove('hidden');
      }

      // Show screen share in local preview
      const lv = document.getElementById('local-video');
      if (lv) {
        lv.srcObject = screenStream;
        lv.style.display = '';
      }

      // Auto-stop when user clicks browser's "Stop sharing"
      screenTrack.onended = () => {
        stopScreenShare();
        const btn = document.getElementById('toggle-screen');
        if (btn) btn.classList.remove('sharing');
        window.showToast?.('Демонстрация остановлена', 'info');
      };
    } catch (err) {
      isScreenSharing = false;
      screenStream = null;
      throw err;
    }
  }

  /**
   * Stop screen sharing, revert to camera
   */
  async function stopScreenShare() {
    if (!isScreenSharing || !pc) return;
    // Stop screen tracks
    if (screenStream) {
      screenStream.getTracks().forEach(t => t.stop());
      screenStream = null;
    }
    isScreenSharing = false;
    // Restore camera video track
    if (localStream) {
      const camTrack = localStream.getVideoTracks()[0];
      if (camTrack) {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(camTrack);
      }
      const lv = document.getElementById('local-video');
      if (lv) lv.srcObject = localStream;
    }
    // Если исходный звонок аудио — вернуть audio view
    if (callType === 'audio') {
      const avView = document.getElementById('call-audio-view');
      const vdView = document.getElementById('call-video-view');
      if (avView && vdView) {
        avView.classList.remove('hidden');
        vdView.classList.add('hidden');
      }
    }
  }

  // Public interface
  return { startCall, acceptCall, onAnswer, onIce, onEnded, endCall, toggleMute, toggleVideo, startScreenShare, stopScreenShare, isInCall: () => !!pc };
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
  const peers = new Map(); // userId → { pc, stream }
  let currentChatId = null;
  let members = []; // [{id, name, avatarColor, muted}]
  let isMuted = false;
  let isVideoOff = false;
  let onMembersChange = null; // callback

  function getSocket() { return window.State?.socket || null; }

  async function getLocalStream() {
    const constraints = { audio: true, video: false };
    try {
      localStream = await navigator.mediaDevices.getUserMedia(constraints);
      return localStream;
    } catch (err) {
      // Нет микрофона — создаём тихий поток, не отключаем пользователя
      window.showToast?.('🎤 Нет доступа к микрофону — вы в звонке без звука', 'warning');
      try {
        const silentCtx = new AudioContext();
        const oscillator = silentCtx.createOscillator();
        const gain = silentCtx.createGain();
        gain.gain.value = 0;
        oscillator.connect(gain);
        const dest = silentCtx.createMediaStreamDestination();
        gain.connect(dest);
        oscillator.start();
        localStream = dest.stream;
      } catch {
        localStream = new MediaStream();
      }
      isMuted = true;
      return localStream;
    }
  }

  function createPeerConnection(targetUserId) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS, iceCandidatePoolSize: 3 });

    pc.onicecandidate = ({ candidate }) => {
      if (candidate && currentChatId) {
        getSocket()?.emit('group_call_ice', { chatId: currentChatId, to: targetUserId, candidate });
      }
    };

    pc.ontrack = (event) => {
      const peerData = peers.get(targetUserId);
      if (peerData && event.streams[0]) {
        peerData.stream = event.streams[0];
        // Создаём/обновляем audio элемент для этого участника
        let audioEl = document.getElementById(`gc-audio-${targetUserId}`);
        if (!audioEl) {
          audioEl = document.createElement('audio');
          audioEl.id = `gc-audio-${targetUserId}`;
          audioEl.autoplay = true;
          audioEl.style.display = 'none';
          document.body.appendChild(audioEl);
        }
        audioEl.srcObject = event.streams[0];
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        removePeer(targetUserId);
      }
    };

    if (localStream) {
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    peers.set(targetUserId, { pc, stream: null });
    return pc;
  }

  function removePeer(userId) {
    const peerData = peers.get(userId);
    if (peerData) {
      try { peerData.pc.close(); } catch {}
      peers.delete(userId);
      const audioEl = document.getElementById(`gc-audio-${userId}`);
      if (audioEl) { audioEl.srcObject = null; audioEl.remove(); }
    }
  }

  async function joinGroupCall(chatId) {
    currentChatId = chatId;
    isMuted = false;
    isVideoOff = false;
    await getLocalStream();
    getSocket()?.emit('group_call_join', { chatId });
  }

  async function onUserJoined({ chatId, user }) {
    if (chatId !== currentChatId) return;
    // Создаём connection и отправляем offer новому участнику
    const pc = createPeerConnection(user.id);
    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);
    getSocket()?.emit('group_call_offer', { chatId, to: user.id, offer: pc.localDescription });
  }

  // Когда мы присоединились и получили список существующих участников
  async function onJoined({ chatId, members: existingMembers }) {
    // Ничего не делаем — ждём offer от существующих участников
  }

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
    const peerData = peers.get(from);
    if (peerData?.pc) {
      await peerData.pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
  }

  async function onGroupIce({ chatId, from, candidate }) {
    if (chatId !== currentChatId) return;
    const peerData = peers.get(from);
    if (peerData?.pc) {
      await peerData.pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  function onUserLeft({ chatId, userId }) {
    if (chatId !== currentChatId) return;
    removePeer(userId);
    members = members.filter(m => m.id !== userId);
    onMembersChange?.(members);
  }

  function onMembersUpdate({ chatId, members: newMembers }) {
    if (chatId !== currentChatId) return;
    members = newMembers.map(m => ({ ...m, muted: m.muted || false }));
    onMembersChange?.(members);
  }

  function onMicStatus({ chatId, userId, muted }) {
    if (chatId !== currentChatId) return;
    const m = members.find(x => x.id === userId);
    if (m) m.muted = muted;
    onMembersChange?.(members);
  }

  function leaveGroupCall() {
    if (currentChatId) {
      getSocket()?.emit('group_call_leave', { chatId: currentChatId });
    }
    peers.forEach((_, uid) => removePeer(uid));
    peers.clear();
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      localStream = null;
    }
    currentChatId = null;
    members = [];
    isMuted = false;
    isVideoOff = false;
  }

  function toggleMute() {
    if (!localStream) return isMuted;
    localStream.getAudioTracks().forEach(t => { t.enabled = isMuted; });
    isMuted = !isMuted;
    if (currentChatId) {
      getSocket()?.emit('group_call_toggle_mic', { chatId: currentChatId, muted: isMuted });
    }
    return isMuted;
  }

  function getMembers() { return members; }
  function isInGroupCall() { return !!currentChatId; }
  function setOnMembersChange(cb) { onMembersChange = cb; }

  return {
    joinGroupCall, leaveGroupCall, toggleMute,
    onUserJoined, onJoined, onGroupOffer, onGroupAnswer, onGroupIce,
    onUserLeft, onMembersUpdate, onMicStatus,
    getMembers, isInGroupCall, setOnMembersChange
  };
})();
