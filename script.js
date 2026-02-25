console.log('Script loaded successfully');

// ----- SIMPLE CLIENT-SIDE AUTH -----
// Edit this array to control which emails are allowed to sign up
const ALLOWED_AUTH_EMAILS = [
  'matibagrodharley@gmail.com',
  'marielmendoza949@gmail.com',
  'engrcpe@gmail.com',
'myrellekayeuntiveros@gmail.com',
'janicecuevas@gmail.com',
'angeldejesus01@gmail.com',
'luzgenete21@gmail.com',
'EndozoRhen01@gmail.com',
'JanelynCatapat211@gmail.com',
'joshuamendoza388@yahoo.com',
'edwinmendoza02@gmail.com',
'cristinamendoza03@gmail.com',
'lestherpogi1@gmail.com',
'delenevielyn36@gmail.com',
'julius.pisig@deped.gov.ph',

];

const USERS_KEY = 'taptendance_users';
const CURRENT_USER_KEY = 'taptendance_current_user';

async function hashPassword(password) {
  const enc = new TextEncoder();
  const data = enc.encode(password);
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuf));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function getStoredUsers() {
  try { return JSON.parse(localStorage.getItem(USERS_KEY) || '{}'); } catch (e) { return {}; }
}

function saveUserToStore(email, passHash) {
  const users = getStoredUsers();
  users[email.toLowerCase()] = { hash: passHash, created: new Date().toISOString() };
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function getUserFromStore(email) {
  const users = getStoredUsers();
  return users[email.toLowerCase()] || null;
}

function setCurrentUser(email) {
  localStorage.setItem(CURRENT_USER_KEY, email.toLowerCase());
  document.querySelector('.header-title').textContent = `Taptendance — ${email.split('@')[0]}`;
}

function getCurrentUser() {
  return localStorage.getItem(CURRENT_USER_KEY) || null;
}

function clearCurrentUser() {
  localStorage.removeItem(CURRENT_USER_KEY);
  document.querySelector('.header-title').textContent = 'Taptendance';
}

// Show/hide auth modal helpers
function openAuthModal(showSignup = true) {
  // Do not show auth modal for students joining via session QR (suppress on student flow)
  if (window.location.hash && window.location.hash.startsWith('#session=')) {
    console.warn('Auth modal suppressed: running in student session mode');
    return;
  }
  document.getElementById('auth-modal').style.display = 'flex';
  document.getElementById('auth-signup-form').style.display = showSignup ? 'block' : 'none';
  document.getElementById('auth-login-form').style.display = showSignup ? 'none' : 'block';
}
function closeAuthModal() { document.getElementById('auth-modal').style.display = 'none'; }

// Setup auth form handlers
window.addEventListener('DOMContentLoaded', () => {
  // tab switching
  document.getElementById('auth-tab-signup')?.addEventListener('click', () => openAuthModal(true));
  document.getElementById('auth-tab-login')?.addEventListener('click', () => openAuthModal(false));

  // Signup submit
  document.getElementById('auth-signup-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = (document.getElementById('auth-email-signup').value || '').toLowerCase().trim();
    const pass = document.getElementById('auth-pass-signup').value;
    const passConfirm = document.getElementById('auth-pass-confirm').value;

    if (!email || !pass) { showToast('Invalid', 'Email and password are required', 'error'); return; }
    if (pass.length < 6) { showToast('Weak Password', 'Password must be at least 6 characters', 'error'); return; }
    if (pass !== passConfirm) { showToast('Mismatch', 'Passwords do not match', 'error'); return; }

    // allowed list check (case-insensitive)
    const allowed = ALLOWED_AUTH_EMAILS.map(x => x.toLowerCase());
    if (!allowed.includes(email)) {
      showToast('Invalid Email', 'This email address is not allowed', 'error');
      return;
    }

    try {
      const hash = await hashPassword(pass);
      saveUserToStore(email, hash);
      setCurrentUser(email);
      showToast('Account Created', 'You are now signed in', 'success');
      closeAuthModal();
    } catch (err) {
      console.error('Signup error', err);
      showToast('Error', 'Failed to create account', 'error');
    }
  });

  // Login submit
  document.getElementById('auth-login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = (document.getElementById('auth-email-login').value || '').toLowerCase().trim();
    const pass = document.getElementById('auth-pass-login').value;
    if (!email || !pass) { showToast('Invalid', 'Email and password are required', 'error'); return; }

    const user = getUserFromStore(email);
    if (!user) { showToast('Not Found', 'No account found for this email', 'error'); return; }
    try {
      const hash = await hashPassword(pass);
      if (hash !== user.hash) { showToast('Invalid', 'Incorrect password', 'error'); return; }
      setCurrentUser(email);
      showToast('Signed In', 'Welcome back', 'success');
      closeAuthModal();
    } catch (err) {
      console.error('Login error', err);
      showToast('Error', 'Login failed', 'error');
    }
  });

  // Logout button
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    if (!confirm('Sign out now?')) return;
    clearCurrentUser();
    showToast('Signed out', 'You have been signed out', 'success');
    // show login modal
    setTimeout(() => openAuthModal(false), 200);
  });

  // Auto-show auth modal only when NOT in student session (hash) and no current user
  const existing = getCurrentUser();
  const inStudentSession = window.location.hash && window.location.hash.startsWith('#session=');
  if (!existing && !inStudentSession) {
    // slight delay so page UI loads under modal
    setTimeout(() => openAuthModal(false), 300);
  } else if (existing) {
    // show username in header
    try { document.querySelector('.header-title').textContent = `Taptendance — ${existing.split('@')[0]}`; } catch {}
  }
});
// ----- END AUTH -----

let scannerIP = null;
let videoElement = null;
let canvasElement = null;
let canvasContext = null;
let isScannerRunning = false;
let scanInterval = null;
let selectedCameraId = null;
let attendanceRecords = [];
let currentFilter = 'all';
let lastScanTime = 0;
let scanAttempts = 0;
const SCAN_COOLDOWN = 7000; // 7 seconds

// NEW: detect GitHub Pages hosting so we can relax local-network checks
const HOSTED_ON_GHPAGES = (window.location.hostname && (window.location.hostname.endsWith('.github.io') || window.location.hostname.includes('github.io')));

async function initializeApp() {
  scannerIP = await getScannerIP();

  if (scannerIP) {
    console.log("Scanner IP detected:", scannerIP);
  } else {
    console.warn("Could not detect scanner IP - network verification may not work");
  }

  await loadCameras();

  document.getElementById('camera-select')?.addEventListener('change', (e) => {
    selectedCameraId = e.target.value;
    console.log('🔄 Camera changed to:', selectedCameraId);
    console.log('Label:', e.target.options[e.target.selectedIndex]?.text);
  });

  // default view for teacher: show Teacher + Records tabs only
  showTeacherRecordsTabs();

  checkSessionURL();
}

async function loadCameras() {
  try {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop());
    } catch (e) {
      console.log('Camera permission not granted yet');
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === 'videoinput');
    console.log('Cameras found:', videoDevices.length);

    const cameraSelect = document.getElementById('camera-select');
    if (!cameraSelect) {
      console.warn('camera-select not found in DOM');
      return;
    }
    cameraSelect.innerHTML = '';

    if (videoDevices.length > 0) {
      videoDevices.forEach((device, index) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.label || `Camera ${index + 1}`;
        cameraSelect.appendChild(option);
        console.log(`Camera ${index}: ${device.label || 'Unknown'}`);
      });

      selectedCameraId = videoDevices[0].deviceId;

      const backCameraIndex = videoDevices.findIndex(device =>
        (device.label || '').toLowerCase().includes('back') ||
        (device.label || '').toLowerCase().includes('rear') ||
        (device.label || '').toLowerCase().includes('environment')
      );

      if (backCameraIndex >= 0) {
        cameraSelect.selectedIndex = backCameraIndex;
        selectedCameraId = videoDevices[backCameraIndex].deviceId;
      }
    } else {
      cameraSelect.innerHTML = '<option value="">No cameras found - Click Refresh</option>';
      console.warn('No cameras detected');
    }
  } catch (err) {
    console.error('Failed to get cameras:', err);
    document.getElementById('camera-select') && (document.getElementById('camera-select').innerHTML = '<option value="">Error - Click Refresh</option>');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('refresh-cameras')?.addEventListener('click', async () => {
    console.log('Refreshing camera list...');
    showToast('Refreshing', 'Scanning for cameras...', 'success');
    await loadCameras();
  });
});

initializeApp();

window.addEventListener('load', () => {
  console.log('=== DIAGNOSTIC CHECK ===');
  console.log('jsQR loaded:', typeof jsQR !== 'undefined');
  console.log('QRCode loaded:', typeof QRCode !== 'undefined');
  console.log('XLSX loaded:', typeof XLSX !== 'undefined');
  console.log('Video element:', document.getElementById('scanner-video'));
  console.log('Canvas element:', document.getElementById('scanner-canvas'));
  console.log('========================');
});

let currentSessionData = null;

function checkSessionURL() {
  const hash = window.location.hash;
  console.log('Checking session URL, hash:', hash);
  if (hash.startsWith('#session=')) {
    try {
      const encodedData = hash.substring(9);
      const sessionData = JSON.parse(atob(encodedData));
      console.log('Session data detected:', sessionData);

      // When hosted on GitHub Pages we relax local IP/network enforcement
      if (!HOSTED_ON_GHPAGES && !scannerIP) {
        showToast('Network Error', 'Could not detect your network', 'error');
        return;
      }
      if (!HOSTED_ON_GHPAGES && !isSameNetwork(scannerIP, sessionData.adminIP)) {
        showModal('lan-modal');
        document.getElementById('modal-message').textContent = 'You must be on the same network as the admin to join this session.';
        return;
      }
      currentSessionData = sessionData;

      // switch to student screen and restrict tabs to student only for this client
      document.querySelector('.tab[data-screen="student"]')?.click();
      showStudentOnlyTab();

      // Ensure no auth/login UI is shown to students
      closeAuthModal();

      const formElement = document.getElementById('student-form');
      const noSessionMessage = document.getElementById('no-session-message');
      if (formElement && noSessionMessage) {
        noSessionMessage.style.display = 'none';
        formElement.style.display = 'block';
        document.getElementById('student-id').value = '';
        document.getElementById('student-name').value = '';
        document.getElementById('student-course').value = '';
        document.getElementById('student-year').value = '';
        document.getElementById('student-section').value = '';
      }
      showSessionInfo(sessionData);
    } catch (error) {
      console.error('Failed to parse session data:', error);
    }
  }
}

function showSessionInfo(sessionData) {
  const infoContainer = document.getElementById('param-note-list');
  if (!infoContainer) {
    console.warn('Session info container not found');
    return;
  }
  infoContainer.innerHTML = `<p style="color: var(--text-secondary); margin: 0;">Session active. Please fill in your information below.</p>`;
}

// Centralized tab click handler
function tabClickHandler(evt) {
  // allow being used as event listener or direct call with 'this'
  const el = this && this.dataset ? this : (evt && evt.currentTarget) ? evt.currentTarget : null;
  if (!el) return;
  const target = el.dataset.screen;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  document.getElementById(`${target}-screen`)?.classList.add('active');
}

// Restrict tabs to student only for session-joined students
function showStudentOnlyTab() {
  const tabs = document.querySelectorAll('.tab');
  if (!tabs || tabs.length === 0) return;

  tabs.forEach(tab => {
    if (tab.dataset && tab.dataset.screen === 'student') {
      tab.style.display = ''; // visible
      tab.classList.add('active');
      tab.removeEventListener('click', tabClickHandler);
      tab.addEventListener('click', tabClickHandler);
    } else {
      tab.style.display = 'none';
      tab.classList.remove('active');
    }
  });

  // ensure student screen is active
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('student-screen')?.classList.add('active');

  const switcher = document.querySelector('.tab-switcher-content');
  if (switcher) switcher.style.justifyContent = 'center';
}

// Show only Teacher + Records tabs (used by teacher default view)
function showTeacherRecordsTabs() {
  const tabs = document.querySelectorAll('.tab');
  if (!tabs || tabs.length === 0) return;

  tabs.forEach(tab => {
    const screen = tab.dataset && tab.dataset.screen;
    if (screen === 'student') {
      tab.style.display = 'none';
      tab.classList.remove('active');
    } else {
      tab.style.display = '';
    }
  });

  // activate teacher screen by default
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const teacherTab = document.querySelector('.tab[data-screen="teacher"]');
  if (teacherTab) {
    teacherTab.classList.add('active');
    document.getElementById('teacher-screen')?.classList.add('active');
  } else {
    const recordsTab = document.querySelector('.tab[data-screen="records"]');
    if (recordsTab) {
      recordsTab.classList.add('active');
      document.getElementById('records-screen')?.classList.add('active');
    }
  }

  // keep the tab switcher centered
  const switcher = document.querySelector('.tab-switcher-content');
  if (switcher) switcher.style.justifyContent = 'center';
}

// Wire tabs to centralized handler at startup
document.querySelectorAll('.tab').forEach(tab => {
  tab.removeEventListener('click', tabClickHandler);
  tab.addEventListener('click', tabClickHandler);
});

const themeToggle = document.getElementById('theme-toggle');
const themeIcon = themeToggle?.querySelector('.theme-icon');

themeToggle?.addEventListener('click', () => {
  document.body.classList.toggle('dark-mode');
  if (themeIcon) themeIcon.textContent = document.body.classList.contains('dark-mode') ? '☀️' : '🌙';
});

async function getScannerIP() {
  try {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });
    pc.createDataChannel('');
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        pc.close();
        console.warn("IP detection timeout - using fallback");
        resolve('127.0.0.1');
      }, 3000);

      pc.onicecandidate = (ice) => {
        if (!ice || !ice.candidate || !ice.candidate.candidate) return;
        const ipRegex = /([0-9]{1,3}(\.[0-9]{1,3}){3})/;
        const match = ipRegex.exec(ice.candidate.candidate);
        if (match && match[1] !== '0.0.0.0') {
          clearTimeout(timeout);
          pc.close();
          console.log("IP detected via WebRTC:", match[1]);
          resolve(match[1]);
        }
      };
    });
  } catch (e) {
    console.error("Failed to get local IP:", e);
    return '127.0.0.1';
  }
}

function isSameNetwork(ip1, ip2) {
  // If hosted on GitHub Pages, skip strict local-network comparison
  if (HOSTED_ON_GHPAGES) return true;
  if (!ip1 || !ip2) return true;
  if (ip1 === '127.0.0.1' || ip2 === '127.0.0.1') return true;
  const p1 = ip1.split('.');
  const p2 = ip2.split('.');
  return p1[0] === p2[0] && p1[1] === p2[1] && p1[2] === p2[2];
}

function showToast(title, message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">×</button>
  `;
  document.getElementById('toast-container')?.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

function showModal(modalId) { document.getElementById(modalId)?.style && (document.getElementById(modalId).style.display = 'flex'); }
function hideModal(modalId) { document.getElementById(modalId)?.style && (document.getElementById(modalId).style.display = 'none'); }

// START SCANNER
document.getElementById('start-scanner')?.addEventListener('click', async () => {
  console.log('▶️ Start Scanner clicked');

  if (isScannerRunning) {
    showToast('Scanner Active', 'Scanner is already running', 'warning');
    return;
  }

  if (typeof jsQR === 'undefined') {
    console.error('jsQR library not loaded!');
    showToast('Library Error', 'QR scanner library not loaded. Please refresh the page.', 'error');
    return;
  }

  try {
    videoElement = document.getElementById('scanner-video') || document.createElement('video');
    canvasElement = document.getElementById('scanner-canvas') || document.createElement('canvas');
    canvasContext = canvasElement.getContext('2d');

    videoElement.setAttribute('playsinline', ''); // iOS safari
    videoElement.style.objectFit = 'cover';

    console.log('Starting camera stream...');

    const constraints = {
      video: {
        deviceId: selectedCameraId ? { exact: selectedCameraId } : undefined,
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: selectedCameraId ? undefined : 'environment'
      }
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    videoElement.srcObject = stream;

    await new Promise((resolve) => {
      videoElement.onloadedmetadata = () => {
        videoElement.play();
        resolve();
      };
    });

    const track = stream.getVideoTracks()[0];
    const settings = track.getSettings ? track.getSettings() : {};
    console.log(`✓ Camera started: ${settings.width || 'auto'}x${settings.height || 'auto'} @ ${settings.frameRate || 'auto'}fps`);

    // Ensure canvas sizing
    const vW = videoElement.videoWidth || videoElement.clientWidth || 640;
    const vH = videoElement.videoHeight || videoElement.clientHeight || 480;
    canvasElement.width = vW;
    canvasElement.height = vH;
    console.log(`✓ Canvas sized: ${canvasElement.width}x${canvasElement.height}`);

    document.getElementById('scanner-idle')?.classList.add('hidden');
    document.getElementById('start-scanner') && (document.getElementById('start-scanner').style.display = 'none');
    document.getElementById('stop-scanner') && (document.getElementById('stop-scanner').style.display = 'block');

    lastScanTime = 0;
    scanAttempts = 0;
    isScannerRunning = true;

    // Robust scanning loop
    scanInterval = setInterval(() => {
      try {
        if (!videoElement || videoElement.readyState < 2) return;

        scanAttempts++;

        // fallback create canvas if missing
        if (!canvasElement) {
          canvasElement = document.createElement('canvas');
          canvasContext = canvasElement.getContext('2d');
        }
        const w = videoElement.videoWidth || videoElement.clientWidth || 640;
        const h = videoElement.videoHeight || videoElement.clientHeight || 480;
        if (w === 0 || h === 0) return;

        if (canvasElement.width !== w || canvasElement.height !== h) {
          canvasElement.width = w;
          canvasElement.height = h;
        }

        canvasContext.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

        let imageData;
        try {
          imageData = canvasContext.getImageData(0, 0, canvasElement.width, canvasElement.height);
        } catch (err) {
          console.warn('getImageData failed this frame, will retry:', err);
          return;
        }

        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
        if (!code) return;

        const now = Date.now();
        console.log('✅ QR CODE DETECTED:', code.data);

        if (now - lastScanTime >= SCAN_COOLDOWN) {
          lastScanTime = now;
          // only call the handler — don't show a generic "QR Detected" toast here.
          // handleScan will show the appropriate "Attendance Recorded" toast.
          handleScan(code.data);
        } else {
          const remaining = Math.ceil((SCAN_COOLDOWN - (now - lastScanTime)) / 1000);
          console.log(`⏳ Cooldown: ${remaining}s remaining`);
        }
      } catch (err) {
        console.error('Scan loop error:', err);
      }
    }, 100); // 10 fps

    console.log('✓✓✓ Scanner started successfully');
    showToast('Scanner Started', 'Point camera at QR code', 'success');

    // Status logging
    const statusInterval = setInterval(() => {
      if (isScannerRunning) {
        console.log(`📊 Scanner active | Attempts: ${scanAttempts} | FPS est: ${Math.round(scanAttempts / 3)}`);
        scanAttempts = 0;
      } else {
        clearInterval(statusInterval);
      }
    }, 3000);

  } catch (err) {
    console.error('❌ Scanner start failed:', err);
    showToast('Scanner Error', err.message || 'Failed to start scanner', 'error');
    document.getElementById('scanner-idle')?.classList.remove('hidden');
    document.getElementById('start-scanner') && (document.getElementById('start-scanner').style.display = 'block');
    document.getElementById('stop-scanner') && (document.getElementById('stop-scanner').style.display = 'none');
    isScannerRunning = false;
  }
});

document.getElementById('stop-scanner')?.addEventListener('click', () => {
  console.log('⏹️ Stop Scanner clicked');

  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
  }

  if (videoElement && videoElement.srcObject) {
    videoElement.srcObject.getTracks().forEach(track => track.stop());
    videoElement.srcObject = null;
  }

  isScannerRunning = false;
  lastScanTime = 0;

  document.getElementById('scanner-idle')?.classList.remove('hidden');
  document.getElementById('start-scanner') && (document.getElementById('start-scanner').style.display = 'block');
  document.getElementById('stop-scanner') && (document.getElementById('stop-scanner').style.display = 'none');

  showToast('Scanner Stopped', 'Camera stopped', 'success');
  console.log('Scanner stopped');
});

// Test camera access
document.getElementById('test-camera')?.addEventListener('click', async () => {
  console.log('🔍 Testing camera access...');

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === 'videoinput');
    console.log('📹 Video devices found:', videoDevices);

    if (videoDevices.length === 0) {
      showToast('No Cameras', 'No camera devices found on this system', 'error');
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    console.log('✓ Camera access granted!');
    stream.getTracks().forEach(track => { track.stop(); console.log('✓ Track stopped:', track.label); });
    showToast('Camera Test Success', `Found ${videoDevices.length} camera(s) and successfully accessed them`, 'success');
    await loadCameras();

  } catch (err) {
    console.error('❌ Camera test failed:', err);
    let msg = 'Camera test failed: ' + (err.message || err.name || '');
    if (err.name === 'NotAllowedError') msg = 'Camera permission denied. Please allow camera access in browser settings.';
    else if (err.name === 'NotFoundError') msg = 'No camera found. Please connect a camera.';
    else if (err.name === 'NotReadableError') msg = 'Camera is in use by another application.';
    showToast('Camera Test Failed', msg, 'error');
  }
});

document.getElementById('scan-image-btn')?.addEventListener('click', () => {
  document.getElementById('qr-image-input')?.click();
});

document.getElementById('qr-image-input')?.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    showToast('Scanning', 'Analyzing image for QR code...', 'info');
    if (typeof jsQR === 'undefined') throw new Error('QR library not loaded');
    const img = new Image();
    const imageUrl = URL.createObjectURL(file);
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('Failed to load image')); img.src = imageUrl; });
    const canvas = document.createElement('canvas');
    canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    URL.revokeObjectURL(imageUrl);
    if (code) {
      console.log('=== QR CODE DETECTED IN IMAGE ===', code.data);
      // call handler only — let handler show the attendance toast (if applicable)
      handleScan(code.data);
    } else {
      console.log('No QR code found in image');
      showToast('No QR Code', 'No QR code found in this image', 'error');
    }
  } catch (err) {
    console.error('Image scan failed:', err);
    showToast('Scan Failed', 'Error scanning image: ' + (err.message || err), 'error');
  } finally {
    e.target.value = '';
  }
});

// HANDLE SCAN
function handleScan(data) {
  console.log('🔍 handleScan() called', data);
  if (!data || data.length === 0) {
    showToast('Invalid QR', 'QR code contains no data', 'error');
    return;
  }

  try {
    const parsed = JSON.parse(data);
    console.log('Parsed object:', parsed);

    if (parsed.type === 'attendance' && parsed.name && parsed.id) {
      const studentId = parsed.id || '';

      if (!parsed.ip) { showToast('Warning', 'QR code missing network info (test mode)', 'warning'); }
      if (!scannerIP) { showToast('Warning', 'Scanner network not detected (test mode)', 'warning'); }

      const sameNetwork = isSameNetwork(scannerIP, parsed.ip);
      if (!sameNetwork && scannerIP !== '127.0.0.1' && parsed.ip !== '127.0.0.1') {
        showModal('lan-modal');
        document.getElementById('modal-message').textContent = `Network mismatch: Scanner (${scannerIP}) vs Student (${parsed.ip})`;
        return;
      }

      // existing open record -> mark time out
      const existingOpenRecord = attendanceRecords.find(r => r.id === studentId && !r.timeOut);
      if (existingOpenRecord) {
        console.log('Marking time out for', studentId);
        existingOpenRecord.timeOut = new Date().toISOString();
        updateRecordsTable();
        showToast('Time Out Recorded', `${existingOpenRecord.name} marked out`, 'success');
        return;
      }

      // prevent duplicate full entries
      const anyRecord = attendanceRecords.find(r => r.id === studentId);
      if (anyRecord) {
        showToast('Already Recorded', `${anyRecord.name} already has an attendance entry`, 'warning');
        return;
      }

      const now = new Date();
      const record = {
        id: parsed.id || '',
        name: parsed.name,
        course: parsed.course || '',
        year: parsed.year || '',
        section: parsed.section || '',
        timestamp: now.toISOString(),
        timeIn: now.toISOString(),
        timeOut: null
      };

      attendanceRecords.push(record);
      updateRecordsTable();
      showToast('Time-in Recorded', `${parsed.name} added to records`, 'success');
      return;
    }

    // fallback handling for JSON but not attendance type
    if (parsed.name && parsed.id) {
      showToast('QR Scanned', 'Legacy format: ' + parsed.name, 'info');
    } else {
      showToast('QR Scanned', 'Data: ' + JSON.stringify(parsed).substring(0, 50), 'success');
    }
  } catch (e) {
    console.log('Not JSON - raw data:', data);
    if (String(data).startsWith('http://') || String(data).startsWith('https://')) {
      showToast('URL Scanned', String(data).substring(0, 50) + '...', 'success');
    } else {
      showToast('QR Code Scanned', 'Content: ' + String(data).substring(0, 50), 'success');
    }
  }
}

document.getElementById('modal-close')?.addEventListener('click', () => hideModal('lan-modal'));

document.getElementById('generate-qr-btn')?.addEventListener('click', async () => {
  if (!scannerIP) scannerIP = await getScannerIP();
  if (!scannerIP || scannerIP === '127.0.0.1') showToast('Network Detection', 'Using fallback network mode - all devices will be allowed', 'warning');

  const sessionData = { adminIP: scannerIP || '127.0.0.1', timestamp: new Date().toISOString() };
  const encodedData = btoa(JSON.stringify(sessionData));
  // Use the current page base (preserves repo path on GitHub Pages)
  const baseUrl = window.location.href.split('#')[0];
  const sessionUrl = `${baseUrl}#session=${encodedData}`;

  const qrContainer = document.getElementById('qr-preview');
  if (qrContainer) {
    qrContainer.innerHTML = '';
    const qr = new QRious({ element: document.createElement('canvas'), value: sessionUrl, size: 320, level: 'L' });
    qrContainer.appendChild(qr.canvas);
    document.getElementById('copy-url') && (document.getElementById('copy-url').disabled = false);
    document.getElementById('copy-url') && (document.getElementById('copy-url').dataset.url = sessionUrl);
    showToast('Session QR Created', 'Students can scan this to join', 'success');
  }
});

document.getElementById('copy-url')?.addEventListener('click', () => {
  const url = document.getElementById('copy-url')?.dataset.url || window.location.href;
  navigator.clipboard.writeText(url).then(() => showToast('Copied', 'Join URL copied to clipboard', 'success')).catch(() => showToast('Error', 'Failed to copy URL', 'error'));
});

document.getElementById('student-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentSessionData) { showToast('No Session', 'No active session detected', 'error'); return; }
  const studentIP = await getScannerIP();
  if (!studentIP) { showToast('Network Error', 'Could not detect your network', 'error'); return; }

  const studentId = document.getElementById('student-id')?.value.trim();
  const studentName = document.getElementById('student-name')?.value.trim();
  const studentCourse = document.getElementById('student-course')?.value.trim();
  const studentYear = document.getElementById('student-year')?.value.trim();
  const studentSection = document.getElementById('student-section')?.value.trim();

  if (!studentId || !studentName || !studentCourse || !studentYear || !studentSection) {
    showToast('Missing Information', 'Please fill in all fields', 'error');
    return;
  }

  const attendanceData = {
    type: 'attendance',
    id: studentId,
    name: studentName,
    course: studentCourse,
    year: studentYear,
    section: studentSection,
    ip: studentIP,
    timestamp: new Date().toISOString(),
    sessionTimestamp: currentSessionData ? currentSessionData.timestamp : null
  };

  const qrData = JSON.stringify(attendanceData);
  const studentQRContainer = document.createElement('div');
  studentQRContainer.style.cssText = `position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:10000; padding:24px;`;
  const qrCard = document.createElement('div');
  qrCard.style.cssText = `background:white; padding:32px; border-radius:16px; text-align:center; max-width:600px; width:100%;`;
  qrCard.innerHTML = `<h3 style="margin:0 0 24px 0;">Your Attendance QR</h3><div id="student-qr-display" style="display:inline-block; padding:16px; background:white; border-radius:12px;"></div><p style="margin:24px 0 8px 0;">Show this to the admin scanner</p><div style="display:flex; gap:12px; justify-content:center;"><button id="download-qr-btn" style="padding:12px 32px; background:#10b981; color:white; border:none; border-radius:10px; cursor:pointer;">Download QR</button><button id="close-student-qr" style="padding:12px 32px; background:#667eea; color:white; border:none; border-radius:10px; cursor:pointer;">Close</button></div>`;
  studentQRContainer.appendChild(qrCard);
  document.body.appendChild(studentQRContainer);
  const qr = new QRious({ element: document.createElement('canvas'), value: qrData, size: 500, level: 'L' });
  document.getElementById('student-qr-display')?.appendChild(qr.canvas);

  document.getElementById('download-qr-btn')?.addEventListener('click', () => {
    const canvas = document.querySelector('#student-qr-display canvas');
    if (canvas) {
      const link = document.createElement('a');
      link.download = `attendance-${studentId || Date.now()}.png`;
      link.href = canvas.toDataURL();
      link.click();
      showToast('Downloaded', 'QR code saved successfully', 'success');
    }
  });

  document.getElementById('close-student-qr')?.addEventListener('click', () => studentQRContainer.remove());
  studentQRContainer.addEventListener('click', (ev) => { if (ev.target === studentQRContainer) studentQRContainer.remove(); });
  showToast('QR Generated', 'Show this QR to the admin scanner', 'success');
});

// generate three informational QR codes under the export card
function generateInfoQRCodes() {
  if (typeof QRious === 'undefined') return;

  // content for each QR - update links/text as needed
  const howToUrl = 'mailto:https://drive.google.com/file/d/1KVUd74mg31V0T5XtKLWx9D78JQsrS06j/view?usp=drive_link?subject=Taptendance%20How to use';
  const suggestionsUrl = 'mailto:verdienentech@gmail.com?subject=Taptendance%20Suggestion';
  const contactUrl = 'mailto:keancurveyintoyuntiveros@gmail.com?subject=Contact%20Taptendance';

  const map = [
    { id: 'qr-howto', value: howToUrl, size: 140 },
    { id: 'qr-suggestions', value: suggestionsUrl, size: 140 },
    { id: 'qr-contact', value: contactUrl, size: 140 }
  ];

  map.forEach(item => {
    const el = document.getElementById(item.id);
    if (!el) return;
    el.innerHTML = '';
    try {
      const canvas = document.createElement('canvas');
      new QRious({ element: canvas, value: item.value, size: item.size, level: 'M' });
      el.appendChild(canvas);
    } catch (e) {
      // fallback: show plain text if QR generation fails
      const p = document.createElement('pre');
      p.textContent = item.value;
      p.style.fontSize = '12px';
      p.style.whiteSpace = 'pre-wrap';
      el.appendChild(p);
    }
  });
}

// ensure QR codes are generated after DOM ready
window.addEventListener('DOMContentLoaded', () => {
  generateInfoQRCodes();
});

// Date/time helpers
function parseToDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (!isNaN(d.getTime())) return d;
  const alt = new Date(String(value).replace(' ', 'T'));
  return isNaN(alt.getTime()) ? null : alt;
}

// Convert Date -> decimal hours in 24-hour format (e.g. 13.75)
function formatTimeDecimal(date) {
  const d = parseToDate(date);
  if (!d) return '-';
  const h = d.getHours();
  const m = d.getMinutes();
  const s = d.getSeconds();
  const decimal = h + (m / 60) + (s / 3600);
  return decimal.toFixed(2);
}

// compute decimal duration (hours) between timeIn and timeOut
function computeDurationDecimal(timeIn, timeOut) {
  const tIn = parseToDate(timeIn);
  const tOut = parseToDate(timeOut);
  if (!tIn || !tOut) return null;
  const diffMs = tOut.getTime() - tIn.getTime();
  if (diffMs <= 0) return 0;
  const hours = diffMs / (1000 * 60 * 60);
  return Number(hours.toFixed(2));
}

function markTimeOut(index) {
  const filteredRecords = filterRecords();
  const record = filteredRecords[index];
  if (!record) return;
  const actualIndex = attendanceRecords.findIndex(r => r.id === record.id && r.timestamp === record.timestamp);
  if (actualIndex !== -1) {
    attendanceRecords[actualIndex].timeOut = new Date().toISOString();
    updateRecordsTable();
    showToast('Time Out Recorded', `${record.name} marked as timed out`, 'success');
  }
}

// Mark all open (timeOut === null) records as timed out
function markAllOut() {
  const nowIso = new Date().toISOString();
  let changed = 0;
  for (let i = 0; i < attendanceRecords.length; i++) {
    if (!attendanceRecords[i].timeOut) {
      attendanceRecords[i].timeOut = nowIso;
      changed++;
    }
  }

  if (changed === 0) {
    showToast('No Open Records', 'There are no open records to mark out', 'info');
    return;
  }

  updateRecordsTable();
  showToast('Time Out Recorded', `Marked ${changed} record${changed > 1 ? 's' : ''} as timed out`, 'success');
}

// wire up button (runs on load)
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('mark-all-out')?.addEventListener('click', () => {
    // simple confirmation to avoid accidental bulk changes
    if (confirm('Mark all currently open records as timed out now?')) {
      markAllOut();
    }
  });
});

function filterRecords() {
  const search = (document.getElementById('search-records')?.value || '').toLowerCase().trim();
  const now = new Date();
  return attendanceRecords.filter(r => {
    if (!r) return false;
    // filter by time window
    if (currentFilter === 'today') {
      const d = parseToDate(r.timestamp || r.timeIn);
      if (!d) return false;
      if (d.toDateString() !== now.toDateString()) return false;
    } else if (currentFilter === 'this-week' || currentFilter === 'week') {
      const d = parseToDate(r.timestamp || r.timeIn);
      if (!d) return false;
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      if (d < startOfWeek) return false;
    }
    // search by id or name
    if (search) {
      const hay = `${r.id} ${r.name}`.toLowerCase();
      return hay.includes(search);
    }
    return true;
  });
}

function updateRecordsTable() {
  const tbody = document.getElementById('records-tbody');
  if (!tbody) {
    console.warn('records-tbody not found in DOM');
    return;
  }
  const filteredRecords = filterRecords();
  tbody.innerHTML = '';
  if (filteredRecords.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="9"><div class="empty-state"><p>No records found</p></div></td></tr>`;
    return;
  }
  filteredRecords.forEach((record, index) => {
    const row = document.createElement('tr');
    const idCell = document.createElement('td'); idCell.textContent = record.id || '';
    const nameCell = document.createElement('td'); nameCell.textContent = record.name || '';
    const courseCell = document.createElement('td'); courseCell.textContent = record.course || '-';
    const yearCell = document.createElement('td'); yearCell.textContent = record.year || '-';
    const sectionCell = document.createElement('td'); sectionCell.textContent = record.section || '-';

    const dateCell = document.createElement('td');
    const dateSource = record.timestamp || record.timeIn || record.timeOut;
    const dateObj = parseToDate(dateSource);
    dateCell.textContent = dateObj ? dateObj.toLocaleDateString() : '-';
    dateCell.style.fontSize = '14px';

    const timeInCell = document.createElement('td');
    timeInCell.textContent = formatTimeDecimal(record.timeIn || record.timestamp);
    timeInCell.style.fontSize = '14px';

    const timeOutCell = document.createElement('td');
    if (record.timeOut) {
      timeOutCell.textContent = formatTimeDecimal(record.timeOut);
      // removed inline color so cell inherits the table's default text color
      timeOutCell.style.fontSize = '14px';
    } else {
      const timeoutBtn = document.createElement('button');
      timeoutBtn.className = 'btn-timeout';
      timeoutBtn.textContent = 'Mark Out';
      timeoutBtn.onclick = () => markTimeOut(index);
      timeOutCell.appendChild(timeoutBtn);
    }

    // Remarks column: decimal hours between timeIn and timeOut
    const remarksCell = document.createElement('td');
    const duration = computeDurationDecimal(record.timeIn || record.timestamp, record.timeOut);
    if (duration === null) {
      remarksCell.textContent = record.timeOut ? '0.00 hrs' : '-';
      // inherit color from .records-table td
    } else {
      remarksCell.textContent = `${duration} hrs`;
      // inherit color from .records-table td
    }
    remarksCell.style.fontSize = '14px';

    row.appendChild(idCell);
    row.appendChild(nameCell);
    row.appendChild(courseCell);
    row.appendChild(yearCell);
    row.appendChild(sectionCell);
    row.appendChild(dateCell);
    row.appendChild(timeInCell);
    row.appendChild(timeOutCell);
    row.appendChild(remarksCell);
    tbody.appendChild(row);
  });
}

// Export
document.getElementById('export-records')?.addEventListener('click', () => {
  if (attendanceRecords.length === 0) {
    showToast('No Records', 'No attendance records to export', 'error');
    return;
  }

  const exportTitleInput = document.getElementById('export-title');
  const rawTitle = (exportTitleInput?.value || '').trim();
  const today = new Date().toISOString().split('T')[0];

  const exportTitle = rawTitle || `Attendance Records - ${today}`;
  const safeTitle = exportTitle.replace(/[<>:"\/\\|?*\x00-\x1F]/g, '').slice(0, 80).trim().replace(/\s+/g, '_') || `attendance_${today}`;

  const exportData = attendanceRecords.map(record => {
    const duration = computeDurationDecimal(record.timeIn || record.timestamp, record.timeOut);
    return {
      ID: record.id,
      Name: record.name,
      Course: record.course,
      Year: record.year,
      Section: record.section,
      Date: parseToDate(record.timestamp || record.timeIn || record.timeOut) ? parseToDate(record.timestamp || record.timeIn || record.timeOut).toLocaleDateString() : '-',
      'Time In': formatTimeDecimal(record.timeIn || record.timestamp),
      'Time Out': record.timeOut ? formatTimeDecimal(record.timeOut) : 'Not marked',
      Remarks: duration !== null ? `${duration} hrs` : (record.timeOut ? '0.00 hrs' : '-')
    };
  });

  // helper: compute optimal column widths (wch) from content length
  function computeColWidths(rows) {
    if (!rows || rows.length === 0) return [];
    const keys = Object.keys(rows[0]);
    const widths = keys.map(key => {
      let maxLen = key.length;
      for (let i = 0; i < rows.length; i++) {
        const val = rows[i][key];
        const len = String(val ?? '').length;
        if (len > maxLen) maxLen = len;
      }
      // scale: character width (wch). Tweak multipliers to taste.
      const scaled = Math.ceil(maxLen * 1.15) + 2; // +2 padding
      // clamp to avoid extremely wide columns
      const wch = Math.min(Math.max(scaled, 10), 60);
      return { wch };
    });
    return widths;
  }

  // create worksheet with JSON starting at row 3 (origin: 2) so title can occupy top rows
  const ws = XLSX.utils.json_to_sheet(exportData, { origin: 2 });

  // add title and empty spacer row
  XLSX.utils.sheet_add_aoa(ws, [[exportTitle]], { origin: 0 });
  XLSX.utils.sheet_add_aoa(ws, [['']], { origin: 1 });

  // merge title across all columns
  const colCount = Object.keys(exportData[0] || {}).length;
  if (colCount > 1) {
    ws['!merges'] = ws['!merges'] || [];
    ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } });
  }

  // set column widths so Excel will auto-stretch columns based on content
  ws['!cols'] = computeColWidths(exportData);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance');

  const filename = `${safeTitle}_${today}.xlsx`;
  XLSX.writeFile(wb, filename);
  // Notification without the count number
  showToast('Records Exported', `Records exported to ${filename}`, 'success');
});

// Filters/search wiring
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter || 'all';
    updateRecordsTable();
  });
});

document.getElementById('search-records')?.addEventListener('input', () => updateRecordsTable());
