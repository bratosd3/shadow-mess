// ============================================================
// Shadow Mess v2.0 — WebRTC Calls
// ============================================================

'use strict';

window.callsModule = (() => {
  const STUN_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478'  },
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
    pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });

    pc.onicecandidate = ({ candidate }) => {
      if (candidate && currentPeer) {
        getSocket()?.emit('call_ice', { to: currentPeer, candidate });
      }
    };

    pc.ontrack = (event) => {
      const remoteVideo = document.getElementById('remote-video');
      if (remoteVideo && event.streams[0]) {
        remoteStream = event.streams[0];
        remoteVideo.srcObject = remoteStream;
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
      video: type === 'video' ? { width: { ideal: 640 }, height: { ideal: 480 } } : false
    };
    try {
      localStream = await navigator.mediaDevices.getUserMedia(constraints);
      const localVideo = document.getElementById('local-video');
      if (localVideo) localVideo.srcObject = localStream;
      return localStream;
    } catch (err) {
      window.showToast?.('Нет доступа к микрофону/камере', 'error');
      throw err;
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
      localStream.getTracks().forEach(t => t.stop());
      localStream = null;
    }
    const lv = document.getElementById('local-video');
    const rv = document.getElementById('remote-video');
    if (lv) lv.srcObject = null;
    if (rv) rv.srcObject = null;
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
        offerToReceiveVideo: type === 'video'
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
      // Show screen share in local preview
      const lv = document.getElementById('local-video');
      if (lv) lv.srcObject = screenStream;

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
  }

  // Public interface
  return { startCall, acceptCall, onAnswer, onIce, onEnded, endCall, toggleMute, toggleVideo, startScreenShare, stopScreenShare };
})();
