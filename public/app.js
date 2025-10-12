let socket = null;
let currentUser = null;
let currentRoom = null;
let localStream = null;
let localScreenStream = null;
const peerConnections = {};
let sharedFiles = [];
let uploadController = null;
let authToken = null;

// Generate unique ID
function generateUniqueId() {
  return 'user_' + Math.random().toString(36).substr(2, 9);
}

// DOM Elements
const homePage = document.getElementById('homePage');
const chatApp = document.getElementById('chatApp');
const googleSignInBtn = document.getElementById('googleSignInBtn');
const loadingState = document.getElementById('loadingState');
const userProfile = document.getElementById('userProfile');
const roomControls = document.getElementById('roomControls');
const errorMessage = document.getElementById('errorMessage');
const logoutBtn = document.getElementById('logoutBtn');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomCodeInput = document.getElementById('roomCodeInput');
const copyRoomCodeBtn = document.getElementById('copyRoomCode');
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const userList = document.getElementById('userList');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const messagesContainer = document.getElementById('messages');
const chatPanel = document.getElementById('chatPanel');
const localVideo = document.getElementById('localVideo');
const remoteVideos = document.getElementById('remoteVideos');
const admitAllBtn = document.getElementById('admitAllBtn');

// File sharing elements
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const toggleFilesBtn = document.getElementById('toggleFilesBtn');
const filesPanel = document.getElementById('filesPanel');
const closeFilesBtn = document.getElementById('closeFilesBtn');
const filesList = document.getElementById('filesList');
const uploadFilesBtn = document.getElementById('uploadFilesBtn');
const refreshFilesBtn = document.getElementById('refreshFilesBtn');
const uploadModal = document.getElementById('uploadModal');
const uploadProgressBar = document.getElementById('uploadProgressBar');
const uploadStatus = document.getElementById('uploadStatus');
const cancelUploadBtn = document.getElementById('cancelUploadBtn');

// Header user info elements
const headerUserInfo = document.getElementById('headerUserInfo');
const headerUserAvatar = document.getElementById('headerUserAvatar');
const headerUserName = document.getElementById('headerUserName');

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  checkAuthStatus();
});

// Check if user is already authenticated
async function checkAuthStatus() {
  // Check URL parameters for auth callback
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  const userParam = urlParams.get('user');
  
  if (token && userParam) {
    try {
      authToken = token;
      currentUser = JSON.parse(decodeURIComponent(userParam));
      
      // Clean URL
      window.history.replaceState({}, document.title, '/');
      
      showUserProfile();
      connectSocket();
    } catch (err) {
      console.error('Auth callback error:', err);
      showError('Authentication failed. Please try again.');
    }
    return;
  }

  // Check for existing session
  try {
    const response = await fetch('/auth/user', {
      credentials: 'include'
    });
    
    if (response.ok) {
      const data = await response.json();
      currentUser = data.user;
      showUserProfile();
      connectSocket();
    } else {
      showSignInButton();
    }
  } catch (err) {
    console.error('Auth check error:', err);
    showSignInButton();
  }
}

// Show sign in button
function showSignInButton() {
  document.getElementById('googleSignInContainer').classList.remove('hidden');
  loadingState.classList.add('hidden');
  userProfile.classList.add('hidden');
  roomControls.classList.add('hidden');
}

// Show user profile
function showUserProfile() {
  if (!currentUser) return;
  
  document.getElementById('googleSignInContainer').classList.add('hidden');
  loadingState.classList.add('hidden');
  userProfile.classList.remove('hidden');
  roomControls.classList.remove('hidden');
  
  // Update profile display
  document.getElementById('userAvatar').src = currentUser.picture || '/default-avatar.png';
  document.getElementById('userDisplayName').textContent = currentUser.name;
  document.getElementById('userEmail').textContent = currentUser.email;
  
  // Update header user info
  if (headerUserAvatar && headerUserName) {
    headerUserAvatar.src = currentUser.picture || '/default-avatar.png';
    headerUserName.textContent = currentUser.name;
  }
}

// Show error message
function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.remove('hidden');
  setTimeout(() => {
    errorMessage.classList.add('hidden');
  }, 5000);
}

// Connect to Socket.IO with authentication
function connectSocket() {
  if (!authToken) return;
  
  socket = io({
    auth: {
      token: authToken
    }
  });

  // Socket event handlers
  socket.on('connect', () => {
    console.log('Connected to server');
  });

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
    showError('Connection failed. Please refresh the page.');
  });

  // Room events
  socket.on('room-created', async ({ roomCode, room, hostUser }) => {
    currentRoom = room;
    showChatApp();
    roomCodeDisplay.textContent = roomCode;
    
    await startLocalMedia();
    renderParticipants([currentUser]);
    renderMessages(room.messages || []);
    
    admitAllBtn.classList.remove('hidden');
    loadFiles();
    console.log('Room created successfully');
  });

  socket.on('room-joined', async ({ room, user, participants }) => {
    currentRoom = room;
    showChatApp();
    roomCodeDisplay.textContent = room.code;
    
    renderParticipants([currentUser, ...participants]);
    renderMessages(room.messages || []);
    
    await startLocalMedia();
    participants.forEach(p => startConnection(p.id));
    
    if (currentUser.name === room.hostName) {
      admitAllBtn.classList.remove('hidden');
    }
    
    loadFiles();
    console.log('Joined room successfully');
  });

  socket.on('waiting-for-admission', ({ message }) => {
    alert(message);
  });

  socket.on('admission-rejected', ({ message }) => {
    alert(message);
    showHomePage();
  });

  socket.on('admission-request', ({ user, waitingCount }) => {
    const shouldAdmit = confirm(`${user.name} wants to join the room. Allow them to enter?`);
    socket.emit('admit-user', {
      roomCode: currentRoom.code,
      userId: user.id,
      admit: shouldAdmit
    });
  });

  socket.on('waiting-list-updated', ({ count, waitingList }) => {
    if (count > 0) {
      admitAllBtn.textContent = `Admit All (${count})`;
      admitAllBtn.setAttribute('aria-label', `Admit all ${count} waiting users`);
      admitAllBtn.classList.remove('hidden');
    } else {
      admitAllBtn.textContent = 'Admit All';
      admitAllBtn.setAttribute('aria-label', 'Admit all waiting users');
      if (currentUser && currentRoom && currentUser.name !== currentRoom.hostName) {
        admitAllBtn.classList.add('hidden');
      }
    }
  });

  socket.on('user-joined', ({ id, name, picture }) => {
    console.log(`${name} joined the room`);
    addMessage({
      sender: 'System',
      message: `${name} joined the room`,
      type: 'system'
    });
    startConnection(id);
  });

  socket.on('user-left', ({ userId }) => {
    if (peerConnections[userId]) {
      peerConnections[userId].close();
      delete peerConnections[userId];
    }
    
    const videoElement = document.getElementById(userId);
    if (videoElement && videoElement.parentNode) {
      videoElement.parentNode.remove();
    }
  });

  socket.on('new-message', (messageData) => {
    addMessage(messageData);
  });

  // File sharing events
  socket.on('file-uploaded', ({ file, message }) => {
    addMessage({
      sender: 'System',
      message: message,
      type: 'system'
    });
    
    addMessage({
      sender: file.uploadedBy,
      message: `📎 ${file.originalName}`,
      type: 'file',
      fileData: file
    });
    
    loadFiles();
  });

  socket.on('file-deleted', ({ fileName, message }) => {
    addMessage({
      sender: 'System',
      message: message,
      type: 'system'
    });
    loadFiles();
  });

  socket.on('files-list', ({ files }) => {
    sharedFiles = files;
    renderFilesList();
    updateFilesButtonText();
  });

  socket.on('error', ({ message }) => {
    showError(message);
  });

  // WebRTC signaling
  socket.on('signal', async ({ from, description, candidate }) => {
    if (!peerConnections[from]) {
      await startConnection(from, false);
    }
    
    const pc = peerConnections[from];
    
    if (description) {
      await pc.setRemoteDescription(description);
      if (description.type === 'offer') {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('signal', { 
          to: from, 
          description: pc.localDescription 
        });
      }
    }
    
    if (candidate) {
      await pc.addIceCandidate(candidate);
    }
  });
}

// Event Listeners
googleSignInBtn.addEventListener('click', () => {
  showLoading();
  window.location.href = '/auth/google';
});

logoutBtn.addEventListener('click', async () => {
  try {
    await fetch('/auth/logout', {
      method: 'POST',
      credentials: 'include'
    });
    
    // Disconnect socket
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    
    // Clear state
    currentUser = null;
    authToken = null;
    currentRoom = null;
    
    // Reset UI
    showSignInButton();
    showHomePage();
    
  } catch (err) {
    console.error('Logout error:', err);
    showError('Logout failed. Please try again.');
  }
});

createRoomBtn.addEventListener('click', () => {
  if (!socket || !currentUser) {
    showError('Please sign in first');
    return;
  }
  socket.emit('create-room', { hostProfile: currentUser });
});

joinRoomBtn.addEventListener('click', () => {
  if (!socket || !currentUser) {
    showError('Please sign in first');
    return;
  }
  
  const roomCode = roomCodeInput.value.trim().toUpperCase();
  if (!roomCode) {
    showError('Please enter a room code');
    return;
  }
  
  socket.emit('join-room', { roomCode });
});

copyRoomCodeBtn.addEventListener('click', async () => {
  const code = roomCodeDisplay.textContent;
  try {
    await navigator.clipboard.writeText(code);
    copyRoomCodeBtn.textContent = 'Copied!';
    copyRoomCodeBtn.classList.add('copied');
    setTimeout(() => {
      copyRoomCodeBtn.textContent = 'Copy Code';
      copyRoomCodeBtn.classList.remove('copied');
    }, 2000);
  } catch (err) {
    console.error('Failed to copy:', err);
  }
});

// Chat functionality
document.getElementById('chatToggleBtn').addEventListener('click', () => {
  chatPanel.classList.toggle('show');
});

document.getElementById('closeChatBtn').addEventListener('click', () => {
  chatPanel.classList.remove('show');
});

messageForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const message = messageInput.value.trim();
  if (!message || !currentRoom || !socket) return;
  
  socket.emit('send-message', { 
    roomCode: currentRoom.code, 
    message 
  });
  messageInput.value = '';
});

// File sharing functionality
uploadBtn.addEventListener('click', () => fileInput.click());
uploadFilesBtn.addEventListener('click', () => fileInput.click());

toggleFilesBtn.addEventListener('click', () => {
  filesPanel.classList.toggle('show');
  if (filesPanel.classList.contains('show')) {
    loadFiles();
  }
});

closeFilesBtn.addEventListener('click', () => {
  filesPanel.classList.remove('show');
});

refreshFilesBtn.addEventListener('click', () => {
  loadFiles();
});

fileInput.addEventListener('change', (e) => {
  const files = Array.from(e.target.files);
  if (files.length === 0) return;
  
  const maxSize = 100 * 1024 * 1024; // 100MB
  const oversizedFiles = files.filter(file => file.size > maxSize);
  
  if (oversizedFiles.length > 0) {
    showError('Some files are too large. Maximum size is 100MB per file.');
    return;
  }
  
  uploadFiles(files);
});

cancelUploadBtn.addEventListener('click', () => {
  if (uploadController) {
    uploadController.abort();
    uploadController = null;
  }
  hideUploadModal();
});

document.getElementById('leaveCallBtn').addEventListener('click', () => {
  if (confirm('Are you sure you want to leave the call?')) {
    leaveCall();
  }
});

admitAllBtn.addEventListener('click', () => {
  if (currentRoom && socket) {
    socket.emit('admit-all', { roomCode: currentRoom.code });
  }
});

// Helper functions
function showLoading() {
  document.getElementById('googleSignInContainer').classList.add('hidden');
  loadingState.classList.remove('hidden');
  userProfile.classList.add('hidden');
  roomControls.classList.add('hidden');
}

function showChatApp() {
  homePage.classList.add('hidden');
  chatApp.classList.remove('hidden');
  headerUserInfo.classList.remove('hidden');
}

function showHomePage() {
  chatApp.classList.add('hidden');
  homePage.classList.remove('hidden');
  admitAllBtn.classList.add('hidden');
  filesPanel.classList.remove('show');
  chatPanel.classList.remove('show');
  headerUserInfo.classList.add('hidden');
}

async function startLocalMedia() {
  try {
    if (!localStream) {
      localStream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      });
    }
    localVideo.srcObject = localStream;
    initializeMediaControls();
  } catch (err) {
    console.error('Error accessing media:', err);
    showError('Could not access camera/microphone. Please check permissions.');
  }
}

async function startConnection(peerId, isInitiator = true) {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });
  
  peerConnections[peerId] = pc;
  
  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream);
  });
  
  const remoteVideo = document.createElement('video');
  remoteVideo.id = peerId;
  remoteVideo.autoplay = true;
  remoteVideo.setAttribute('aria-label', 'Remote participant video');
  remoteVideo.className = 'w-full h-full rounded-lg bg-black object-cover';
  
  const videoContainer = document.createElement('div');
  videoContainer.className = 'relative bg-gray-700 rounded-lg overflow-hidden min-h-[200px]';
  videoContainer.appendChild(remoteVideo);
  
  remoteVideos.appendChild(videoContainer);
  
  pc.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };
  
  pc.onicecandidate = (event) => {
    if (event.candidate && socket) {
      socket.emit('signal', {
        to: peerId,
        candidate: event.candidate
      });
    }
  };
  
  if (isInitiator) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    if (socket) {
      socket.emit('signal', {
        to: peerId,
        description: pc.localDescription
      });
    }
  }
}

function renderParticipants(participants) {
  userList.innerHTML = '';
  participants.forEach(participant => {
    const li = document.createElement('li');
    li.className = 'p-2 bg-gray-800 rounded text-sm flex items-center space-x-2';
    li.setAttribute('role', 'listitem');
    
    if (participant.picture) {
      const img = document.createElement('img');
      img.src = participant.picture;
      img.alt = participant.name;
      img.className = 'w-6 h-6 rounded-full';
      li.appendChild(img);
    }
    
    const span = document.createElement('span');
    span.textContent = participant.name;
    li.appendChild(span);
    
    userList.appendChild(li);
  });
}

function renderMessages(messages) {
  messagesContainer.innerHTML = '';
  messages.forEach(message => addMessage(message));
}

function addMessage({ sender, message, type = 'user', fileData, senderPicture }) {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'p-2 rounded';
  messageDiv.setAttribute('role', 'article');
  
  if (type === 'system') {
    messageDiv.className += ' text-gray-400 italic text-sm';
    messageDiv.textContent = message;
  } else if (type === 'file' && fileData) {
    messageDiv.className += ' bg-gray-800';
    messageDiv.innerHTML = `
      <div class="flex items-center space-x-2 mb-1">
        ${senderPicture ? `<img src="${escapeHtml(senderPicture)}" alt="${escapeHtml(sender)}" class="w-5 h-5 rounded-full">` : ''}
        <div class="font-semibold text-blue-400 text-sm">${escapeHtml(sender)}</div>
      </div>
      <div>
        <a href="${encodeURI(fileData.downloadUrl)}" 
           target="_blank" 
           download="${escapeHtml(fileData.originalName)}"
           aria-label="Download file: ${escapeHtml(fileData.originalName)}"
           class="text-purple-400 hover:text-purple-300 underline">
          ${escapeHtml(message)}
        </a>
        <div class="text-xs text-gray-400">${formatFileSize(fileData.size)}</div>
      </div>
    `;
  } else {
    messageDiv.className += ' bg-gray-800';
    messageDiv.innerHTML = `
      <div class="flex items-center space-x-2 mb-1">
        ${senderPicture ? `<img src="${escapeHtml(senderPicture)}" alt="${escapeHtml(sender)}" class="w-5 h-5 rounded-full">` : ''}
        <div class="font-semibold text-blue-400 text-sm">${escapeHtml(sender)}</div>
      </div>
      <div class="mt-1">${escapeHtml(message)}</div>
    `;
  }
  
  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// File upload functions
async function uploadFiles(files) {
  if (!currentRoom || !authToken) return;
  
  const formData = new FormData();
  files.forEach(file => {
    formData.append('files', file);
  });
  
  showUploadModal();
  uploadController = new AbortController();
  
  try {
    const response = await fetch(`/api/upload/${currentRoom.code}`, {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      credentials: 'include',
      signal: uploadController.signal
    });
    
    const result = await response.json();
    
    if (result.success) {
      loadFiles();
      fileInput.value = '';
    } else {
      throw new Error(result.error || 'Upload failed');
    }
    
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error('Upload error:', error);
      showError(`Upload failed: ${error.message}`);
    }
  } finally {
    hideUploadModal();
    uploadController = null;
  }
}

async function loadFiles() {
  if (!currentRoom || !authToken) return;
  
  try {
    const response = await fetch(`/api/files/${currentRoom.code}`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      credentials: 'include'
    });
    const result = await response.json();
    
    if (result.files) {
      sharedFiles = result.files;
      renderFilesList();
      updateFilesButtonText();
    }
  } catch (error) {
    console.error('Failed to load files:', error);
  }
}

async function deleteFile(fileId, fileName) {
  if (!currentRoom || !authToken) return;
  
  if (!confirm(`Delete "${fileName}"?`)) return;
  
  try {
    const response = await fetch(`/api/files/${currentRoom.code}/${fileId}`, {
      method: 'DELETE',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      credentials: 'include'
    });
    
    const result = await response.json();
    
    if (result.success) {
      loadFiles();
    } else {
      throw new Error(result.error || 'Delete failed');
    }
    
  } catch (error) {
    console.error('Delete error:', error);
    showError(`Delete failed: ${error.message}`);
  }
}

function renderFilesList() {
  if (sharedFiles.length === 0) {
    filesList.innerHTML = '<div id="noFilesMessage" class="text-gray-400 text-center py-8">No files shared yet</div>';
    return;
  }
  
  filesList.innerHTML = '';
  
  sharedFiles.forEach(file => {
    const fileDiv = document.createElement('div');
    fileDiv.className = 'bg-gray-800 p-3 rounded-lg';
    
    const sizeStr = formatFileSize(file.size);
    const dateStr = new Date(file.uploadedAt).toLocaleString();
    
    fileDiv.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="flex-1 min-w-0">
          <div class="font-medium text-white truncate">${escapeHtml(file.originalName)}</div>
          <div class="text-xs text-gray-400">
            ${sizeStr} • by ${escapeHtml(file.uploadedBy)} • ${dateStr}
          </div>
        </div>
        <div class="ml-2 flex space-x-2">
          <button 
            onclick="downloadFile('${encodeURIComponent(file.downloadUrl)}', '${encodeURIComponent(file.originalName)}')"
            class="text-blue-400 hover:text-blue-300 text-sm"
            title="Download ${escapeHtml(file.originalName)}"
            aria-label="Download ${escapeHtml(file.originalName)}"
          >
            ⬇️
          </button>
          ${(file.uploadedBy === currentUser?.name || (currentRoom && currentRoom.hostName === currentUser?.name)) ? 
            `<button 
              onclick="deleteFile('${encodeURIComponent(file.id)}', '${encodeURIComponent(file.originalName)}')"
              class="text-red-400 hover:text-red-300 text-sm"
              title="Delete ${escapeHtml(file.originalName)}"
              aria-label="Delete ${escapeHtml(file.originalName)}"
            >
              🗑️
            </button>` : ''
          }
        </div>
      </div>
    `;
    
    filesList.appendChild(fileDiv);
  });
}

function downloadFile(encodedUrl, encodedFilename) {
  const url = decodeURIComponent(encodedUrl);
  const filename = decodeURIComponent(encodedFilename);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function updateFilesButtonText() {
  toggleFilesBtn.textContent = `📁 View Files (${sharedFiles.length})`;
}

function showUploadModal() {
  uploadModal.classList.add('show');
  uploadProgressBar.style.width = '0%';
  uploadStatus.textContent = 'Uploading...';
}

function hideUploadModal() {
  uploadModal.classList.remove('show');
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

// Media controls
let isAudioMuted = false;
let isVideoMuted = false;
let isScreenSharing = false;

function initializeMediaControls() {
  document.getElementById('micBtn').addEventListener('click', toggleMicrophone);
  document.getElementById('cameraBtn').addEventListener('click', toggleCamera);
  document.getElementById('screenShareBtn').addEventListener('click', toggleScreenShare);
}

function toggleMicrophone() {
  if (!localStream) return;
  
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    isAudioMuted = !isAudioMuted;
    audioTrack.enabled = !isAudioMuted;
    
    const micBtn = document.getElementById('micBtn');
    micBtn.classList.toggle('bg-red-500', isAudioMuted);
    micBtn.classList.toggle('bg-green-500', !isAudioMuted);
  }
}

function toggleCamera() {
  if (!localStream) return;
  
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    isVideoMuted = !isVideoMuted;
    videoTrack.enabled = !isVideoMuted;
    
    const cameraBtn = document.getElementById('cameraBtn');
    cameraBtn.classList.toggle('bg-red-500', isVideoMuted);
    cameraBtn.classList.toggle('bg-blue-500', !isVideoMuted);
    
    localVideo.style.display = isVideoMuted ? 'none' : 'block';
  }
}

async function toggleScreenShare() {
  const screenBtn = document.getElementById('screenShareBtn');
  
  try {
    if (!isScreenSharing) {
      localScreenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });
      
      const videoTrack = localScreenStream.getVideoTracks()[0];
      
      Object.values(peerConnections).forEach(pc => {
        const sender = pc.getSenders().find(s => 
          s.track && s.track.kind === 'video'
        );
        if (sender) {
          sender.replaceTrack(videoTrack);
        }
      });
      
      localVideo.srcObject = localScreenStream;
      isScreenSharing = true;
      screenBtn.classList.add('bg-orange-500');
      
      videoTrack.onended = stopScreenShare;
    } else {
      stopScreenShare();
    }
  } catch (err) {
    console.error('Error sharing screen:', err);
  }
}

function stopScreenShare() {
  if (localScreenStream) {
    localScreenStream.getTracks().forEach(track => track.stop());
  }
  
  const videoTrack = localStream.getVideoTracks()[0];
  Object.values(peerConnections).forEach(pc => {
    const sender = pc.getSenders().find(s => 
      s.track && s.track.kind === 'video'
    );
    if (sender) {
      sender.replaceTrack(videoTrack);
    }
  });
  
  localVideo.srcObject = localStream;
  isScreenSharing = false;
  
  const screenBtn = document.getElementById('screenShareBtn');
  screenBtn.classList.remove('bg-orange-500');
}

function leaveCall() {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
  if (localScreenStream) {
    localScreenStream.getTracks().forEach(track => track.stop());
  }
  
  Object.values(peerConnections).forEach(pc => pc.close());
  
  localStream = null;
  localScreenStream = null;
  currentRoom = null;
  sharedFiles = [];
  
  remoteVideos.innerHTML = '';
  messagesContainer.innerHTML = '';
  userList.innerHTML = '';
  roomCodeInput.value = '';
  filesList.innerHTML = '<div id="noFilesMessage" class="text-gray-400 text-center py-8">No files shared yet</div>';
  updateFilesButtonText();
  
  showHomePage();
}