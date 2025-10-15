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
const loginForm = document.getElementById('loginForm');
const loadingState = document.getElementById('loadingState');
const userProfile = document.getElementById('userProfile');
const permissionRequest = document.getElementById('permissionRequest');
const roomControls = document.getElementById('roomControls');
const errorMessage = document.getElementById('errorMessage');
const logoutBtn = document.getElementById('logoutBtn');
const grantPermissionsBtn = document.getElementById('grantPermissionsBtn');
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

// Login form elements
const loginFormElement = document.getElementById('loginFormElement');
const nameInput = document.getElementById('nameInput');
const emailInput = document.getElementById('emailInput');

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  checkAuthStatus();
});

// Check if user is already authenticated
async function checkAuthStatus() {
  // Check for stored token
  const storedToken = localStorage.getItem('authToken');
  const storedUser = localStorage.getItem('currentUser');
  
  if (storedToken && storedUser) {
    try {
      authToken = storedToken;
      currentUser = JSON.parse(storedUser);
      
      // Verify token is still valid
      const response = await fetch('/auth/user', { 
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      
      if (response.ok) {
        showUserProfile();
        connectSocket();
        return;
      } else {
        // Token expired, clear storage
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentUser');
      }
    } catch (err) {
      console.error('Auth check error:', err);
      localStorage.removeItem('authToken');
      localStorage.removeItem('currentUser');
    }
  }
  
  showLoginForm();
}

// Show login form
function showLoginForm() {
  loginForm.classList.remove('hidden');
  loadingState.classList.add('hidden');
  userProfile.classList.add('hidden');
  roomControls.classList.add('hidden');
}

// Show user profile
function showUserProfile() {
  if (!currentUser) return;

  loginForm.classList.add('hidden');
  loadingState.classList.add('hidden');
  userProfile.classList.remove('hidden');

  // Check if permissions were previously granted
  const permissionsGranted = localStorage.getItem('permissionsGranted') === 'true';

  if (permissionsGranted) {
    permissionRequest.classList.add('hidden');
    roomControls.classList.remove('hidden');
  } else {
    permissionRequest.classList.remove('hidden');
    roomControls.classList.add('hidden');
  }

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
function showError(message, type = 'error') {
  errorMessage.textContent = message;
  errorMessage.classList.remove('hidden');

  // Change color based on type
  if (type === 'success') {
    errorMessage.classList.remove('bg-red-600');
    errorMessage.classList.add('bg-green-600');
  } else {
    errorMessage.classList.remove('bg-green-600');
    errorMessage.classList.add('bg-red-600');
  }

  setTimeout(() => {
    errorMessage.classList.add('hidden');
  }, 5000);
}

// Request camera and microphone permissions
async function requestPermissions() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    // Stop the stream immediately since we just needed permission
    stream.getTracks().forEach(track => track.stop());

    // Permissions granted, store in localStorage and show room controls
    localStorage.setItem('permissionsGranted', 'true');
    permissionRequest.classList.add('hidden');
    roomControls.classList.remove('hidden');
    showError('Permissions granted! You can now create or join rooms.', 'success');
  } catch (err) {
    console.error('Permission denied:', err);
    localStorage.removeItem('permissionsGranted'); // Ensure it's not set
    showError('Camera and microphone access is required for video calls. Please allow access and try again.');
  }
}

// Handle login
async function handleLogin(event) {
  event.preventDefault();
  
  const name = nameInput.value.trim();
  const email = emailInput.value.trim();
  
  if (!name || !email) {
    showError('Please enter both name and email');
    return;
  }
  
  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    showError('Please enter a valid email address');
    return;
  }
  
  showLoading();
  
  try {
    const response = await fetch('/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, email })
    });
    
    const data = await response.json();
    
    if (data.success) {
      authToken = data.token;
      currentUser = data.user;
      
      // Store in localStorage for persistence
      localStorage.setItem('authToken', authToken);
      localStorage.setItem('currentUser', JSON.stringify(currentUser));
      
      showUserProfile();
      connectSocket();
    } else {
      showError(data.error || 'Login failed');
      showLoginForm();
    }
  } catch (err) {
    console.error('Login error:', err);
    showError('Login failed. Please try again.');
    showLoginForm();
  }
}

// Connect to Socket.IO with authentication
function connectSocket() {
  if (!authToken) return;

  socket = io({
    auth: { token: authToken }
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
loginFormElement.addEventListener('submit', handleLogin);
grantPermissionsBtn.addEventListener('click', requestPermissions);

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

    // Clear localStorage
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');

    // Clear state
    currentUser = null;
    authToken = null;
    currentRoom = null;

    // Reset UI
    showLoginForm();
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
  socket.emit('create-room', {
    hostProfile: currentUser
  });
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

  if (roomCode.length !== 6) {
    showError('Room code must be exactly 6 characters');
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
  loginForm.classList.add('hidden');
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
  } catch (err) {
    console.error('Error accessing media:', err);
    showError('Could not access camera/microphone. Please check permissions.');
  }
  initializeMediaControls();
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
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-2">
          ${senderPicture ? `<img src="${senderPicture}" alt="${sender}" class="w-6 h-6 rounded-full">` : ''}
          <span class="font-medium text-white">${sender}:</span>
          <span class="text-blue-300">${message}</span>
        </div>
        <div class="flex space-x-2">
          <a href="${fileData.downloadUrl}" download="${fileData.originalName}" 
             class="text-blue-400 hover:text-blue-300 text-sm">Download</a>
          <span class="text-gray-400 text-xs">${formatFileSize(fileData.size)}</span>
        </div>
      </div>
    `;
  } else {
    messageDiv.className += ' bg-gray-800';
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    messageDiv.innerHTML = `
      <div class="flex items-start space-x-2">
        ${senderPicture ? `<img src="${senderPicture}" alt="${sender}" class="w-6 h-6 rounded-full mt-1">` : ''}
        <div class="flex-1">
          <div class="flex items-center space-x-2">
            <span class="font-medium text-white">${sender}</span>
            <span class="text-gray-400 text-xs">${timestamp}</span>
          </div>
          <p class="text-gray-100 mt-1">${message}</p>
        </div>
      </div>
    `;
  }

  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// File upload functionality
async function uploadFiles(files) {
  if (!currentRoom || !authToken) {
    showError('Not in a room or not authenticated');
    return;
  }

  const formData = new FormData();
  files.forEach(file => {
    formData.append('files', file);
  });

  uploadController = new AbortController();
  showUploadModal();

  try {
    const response = await fetch(`/api/upload/${currentRoom.code}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      body: formData,
      signal: uploadController.signal
    });

    const result = await response.json();

    if (result.success) {
      hideUploadModal();
      showError(`${result.files.length} file(s) uploaded successfully`, 'success');
      fileInput.value = '';
    } else {
      hideUploadModal();
      showError(result.error || 'Upload failed');
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('Upload error:', err);
      hideUploadModal();
      showError('Upload failed. Please try again.');
    }
  }
}

async function loadFiles() {
  if (!currentRoom || !authToken) return;

  try {
    const response = await fetch(`/api/files/${currentRoom.code}`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    const result = await response.json();
    if (result.files) {
      sharedFiles = result.files;
      renderFilesList();
      updateFilesButtonText();
    }
  } catch (err) {
    console.error('Load files error:', err);
  }
}

function renderFilesList() {
  filesList.innerHTML = '';

  if (sharedFiles.length === 0) {
    filesList.innerHTML = '<p class="text-gray-400 text-center py-4">No files shared yet</p>';
    return;
  }

  sharedFiles.forEach(file => {
    const fileItem = document.createElement('div');
    fileItem.className = 'p-3 bg-gray-800 rounded flex items-center justify-between';
    fileItem.innerHTML = `
      <div class="flex-1">
        <p class="font-medium text-white truncate">${file.originalName}</p>
        <p class="text-sm text-gray-400">${formatFileSize(file.size)} • by ${file.uploadedBy}</p>
        <p class="text-xs text-gray-500">${new Date(file.uploadedAt).toLocaleString()}</p>
      </div>
      <div class="flex space-x-2">
        <a href="${file.downloadUrl}" download="${file.originalName}" 
           class="text-blue-400 hover:text-blue-300 text-sm">Download</a>
        ${(currentUser && (file.uploadedBy === currentUser.name || (currentRoom && currentRoom.hostName === currentUser.name))) ? 
          `<button onclick="deleteFile('${file.id}')" class="text-red-400 hover:text-red-300 text-sm">Delete</button>` : ''}
      </div>
    `;
    filesList.appendChild(fileItem);
  });
}

async function deleteFile(fileId) {
  if (!currentRoom || !authToken) return;

  if (!confirm('Are you sure you want to delete this file?')) return;

  try {
    const response = await fetch(`/api/files/${currentRoom.code}/${fileId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    const result = await response.json();
    if (result.success) {
      loadFiles();
    } else {
      showError(result.error || 'Delete failed');
    }
  } catch (err) {
    console.error('Delete file error:', err);
    showError('Delete failed. Please try again.');
  }
}

function updateFilesButtonText() {
  const count = sharedFiles.length;
  const baseText = 'Files';
  toggleFilesBtn.textContent = count > 0 ? `${baseText} (${count})` : baseText;
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showUploadModal() {
  uploadModal.classList.remove('hidden');
  uploadProgressBar.style.width = '0%';
  uploadStatus.textContent = 'Uploading...';
}

function hideUploadModal() {
  uploadModal.classList.add('hidden');
}

// Media controls functionality
function initializeMediaControls() {
  const muteBtn = document.getElementById('muteBtn');
  const cameraBtn = document.getElementById('cameraBtn');
  const screenShareBtn = document.getElementById('screenShareBtn');

  if (muteBtn) {
    muteBtn.addEventListener('click', toggleMute);
  }
  if (cameraBtn) {
    cameraBtn.addEventListener('click', toggleCamera);
  }
  if (screenShareBtn) {
    screenShareBtn.addEventListener('click', toggleScreenShare);
  }
}

function toggleMute() {
  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      const muteBtn = document.getElementById('muteBtn');
      muteBtn.innerHTML = audioTrack.enabled ? 
        '<i class="fas fa-microphone"></i>' : 
        '<i class="fas fa-microphone-slash"></i>';
      muteBtn.classList.toggle('muted', !audioTrack.enabled);
    }
  }
}

function toggleCamera() {
  if (localStream) {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      const cameraBtn = document.getElementById('cameraBtn');
      cameraBtn.innerHTML = videoTrack.enabled ? 
        '<i class="fas fa-video"></i>' : 
        '<i class="fas fa-video-slash"></i>';
      cameraBtn.classList.toggle('camera-off', !videoTrack.enabled);
    }
  }
}

async function toggleScreenShare() {
  const screenShareBtn = document.getElementById('screenShareBtn');
  
  if (localScreenStream) {
    // Stop screen sharing
    localScreenStream.getTracks().forEach(track => track.stop());
    localScreenStream = null;
    
    // Switch back to camera
    if (localStream) {
      localVideo.srcObject = localStream;
      // Update all peer connections
      Object.values(peerConnections).forEach(pc => {
        const sender = pc.getSenders().find(s => 
          s.track && s.track.kind === 'video'
        );
        if (sender && localStream.getVideoTracks()[0]) {
          sender.replaceTrack(localStream.getVideoTracks()[0]);
        }
      });
    }
    
    screenShareBtn.innerHTML = '<i class="fas fa-desktop"></i>';
    screenShareBtn.classList.remove('sharing');
  } else {
    // Start screen sharing
    try {
      localScreenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });
      
      localVideo.srcObject = localScreenStream;
      
      // Update all peer connections
      Object.values(peerConnections).forEach(pc => {
        const sender = pc.getSenders().find(s => 
          s.track && s.track.kind === 'video'
        );
        if (sender) {
          sender.replaceTrack(localScreenStream.getVideoTracks()[0]);
        }
      });
      
      screenShareBtn.innerHTML = '<i class="fas fa-stop"></i>';
      screenShareBtn.classList.add('sharing');
      
      // Handle screen share end
      localScreenStream.getVideoTracks()[0].onended = () => {
        toggleScreenShare();
      };
    } catch (err) {
      console.error('Error starting screen share:', err);
      showError('Could not start screen sharing');
    }
  }
}

function leaveCall() {
  // Close all peer connections
  Object.values(peerConnections).forEach(pc => pc.close());
  Object.keys(peerConnections).forEach(key => delete peerConnections[key]);

  // Stop local streams
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  if (localScreenStream) {
    localScreenStream.getTracks().forEach(track => track.stop());
    localScreenStream = null;
  }

  // Clear video elements
  localVideo.srcObject = null;
  remoteVideos.innerHTML = '';

  // Disconnect socket
  if (socket) {
    socket.disconnect();
  }

  // Reset state
  currentRoom = null;
  sharedFiles = [];

  // Return to home
  showHomePage();
}

// Make deleteFile available globally
window.deleteFile = deleteFile;