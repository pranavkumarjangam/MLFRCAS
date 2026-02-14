// server.js
const express = require('express');
const { spawn } = require('child_process');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { MongoClient } = require('mongodb');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(bodyParser.json());
// Polyfill fetch for Node.js if not available
if (typeof fetch !== 'function') {
  global.fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
}

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.join(__dirname, '.env'));

// Best-effort request to stop the multi-face stream server if it's already running
async function stopMultiFaceServerIfRunning() {
  const stopUrl = 'http://localhost:5003/stop';
  try {
    // Prefer global fetch if available (Node 18+)
    if (typeof fetch === 'function') {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1500);
      try {
        await fetch(stopUrl, { method: 'POST', signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
    } else {
      // Fallback: fire-and-forget using http.request
      const http = require('http');
      const req = http.request(
        stopUrl,
        { method: 'POST', timeout: 1500 },
        () => {}
      );
      req.on('error', () => {});
      req.end();
    }
  } catch (_) {
    // Ignore errors – server may not be running
  }
}

async function callMultiFace(path, options = {}) {
  const url = `http://localhost:5003${path}`;
  const timeoutMs = options.timeoutMs ?? 1500;
  const method = options.method ?? 'GET';
  const body = options.body ? JSON.stringify(options.body) : undefined;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (typeof fetch === 'function') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { method, body, headers, signal: controller.signal });
      const json = await resp.json().catch(() => ({}));
      return { ok: resp.ok, status: resp.status, json };
    } catch (err) {
      // Normalize network/timeout errors into a non-throwing response
      return { ok: false, status: 0, json: { error: err?.message || 'fetch_failed' } };
    } finally {
      clearTimeout(timer);
    }
  } else {
    // Fallback: very simple http(s) request without JSON parsing robustness
    return new Promise((resolve) => {
      const http = require('http');
      const req = http.request(url, { method, timeout: timeoutMs, headers }, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk.toString()));
        res.on('end', () => {
          try { resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json: JSON.parse(data || '{}') }); }
          catch { resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json: {} }); }
        });
      });
      req.on('error', () => resolve({ ok: false, status: 0, json: {} }));
      if (body) req.write(body);
      req.end();
    });
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Utility: cap growing buffers to avoid OOM/RangeError when child processes are chatty
function appendCapped(current, chunk, cap = 20000) {
  const next = (current + chunk);
  // Keep only the last `cap` characters
  return next.length > cap ? next.slice(next.length - cap) : next;
}

// MongoDB connection
const mongoUri = process.env.MONGODB_URI;
const mongoDbName = process.env.MONGODB_DB_NAME || 'face_recognition';
const JWT_SECRET = process.env.JWT_SECRET;

if (!mongoUri || !JWT_SECRET) {
  console.error('Missing required environment variables. Please set MONGODB_URI and JWT_SECRET.');
  process.exit(1);
}

let db;
MongoClient.connect(mongoUri)
  .then(client => {
    console.log('Connected to MongoDB');
    db = client.db(mongoDbName);
  })
  .catch(error => console.error('MongoDB connection error:', error));

function ensureDbReady(res) {
  if (!db) {
    res.status(503).json({ message: 'Database connection is still initializing. Please retry.' });
    return false;
  }
  return true;
}

// Registration endpoint - Only creates user account
app.post('/register', async (req, res) => {
  if (!ensureDbReady(res)) return;
  try {
    const { name, email, password } = req.body;
    
    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({ 
        message: 'All fields are required',
        fieldErrors: {
          name: !name ? 'Name is required' : '',
          email: !email ? 'Email is required' : '',
          password: !password ? 'Password is required' : ''
        }
      });
    }

    // Check if user already exists
    const existingUser = await db.collection('users').findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        message: 'User already exists with this email',
        fieldErrors: { email: 'Email already registered' }
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Store user in database (without face embeddings initially)
    await db.collection('users').insertOne({
      name,
      email,
      password: hashedPassword,
      faceRegistered: false,
      createdAt: new Date()
    });
    
    res.status(200).json({ 
      message: 'User account created successfully. Please complete face registration.',
      success: true
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Login endpoint
app.post('/login', async (req, res) => {
  if (!ensureDbReady(res)) return;
  try {
    const { email, password } = req.body;
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ 
        message: 'Email and password are required',
        fieldErrors: {
          email: !email ? 'Email is required' : '',
          password: !password ? 'Password is required' : ''
        }
      });
    }

    // Find user in database
    const user = await db.collection('users').findOne({ email });
    if (!user) {
      return res.status(401).json({ 
        message: 'Invalid email or password',
        fieldErrors: { email: 'User not found' }
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ 
        message: 'Invalid email or password',
        fieldErrors: { password: 'Incorrect password' }
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        faceRegistered: user.faceRegistered || false
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// --- Face Registration Stream Endpoints ---
const REGISTRATION_PORT = 5001;

// Utility to communicate with the registration stream service
async function callRegistrationStream(path, options = {}) {
  const url = `http://localhost:${REGISTRATION_PORT}${path}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 2000);
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });
    clearTimeout(timeout);
    const json = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, json };
  } catch (error) {
    return { ok: false, status: 0, json: { error: error.message } };
  }
}

async function callCrowdStream(path, options = {}) {
  const url = `http://localhost:5004${path}`;
  const timeoutMs = options.timeoutMs ?? 2000;
  const method = options.method ?? 'GET';
  const body = options.body ? JSON.stringify(options.body) : undefined;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const resp = await fetch(url, { method, body, headers, signal: controller.signal });
    clearTimeout(timer);
    const json = await resp.json().catch(() => ({}));
    return { ok: resp.ok, status: resp.status, json };
  } catch (error) {
    return { ok: false, status: 0, json: { error: error.message } };
  }
}

// Endpoint to start the face registration stream
app.post('/register-face/start', async (req, res) => {
  if (!ensureDbReady(res)) return;
  const { email, name } = req.body;
  if (!email || !name) {
    return res.status(400).json({ message: 'Email and name are required.' });
  }

  // Prevent duplicate registration for the same user
  const user = await db.collection('users').findOne({ email });
  if (!user) {
    return res.status(404).json({ message: 'User not found.' });
  }
  if (user.faceRegistered) {
    return res.status(400).json({ message: 'Face already registered for this user.' });
  }

  // 1. Check if the service is already running and try to stop it gracefully.
  // This helps clean up orphaned processes from previous runs.
  const healthCheck = await callRegistrationStream('/health');
  if (healthCheck.ok) {
    await callRegistrationStream('/stop', { method: 'POST' });
    await sleep(300);
  }

  // 2. Start the new registration stream process
  const scriptPath = path.join(__dirname, 'face_registration_stream.py');
  let pythonProcess;
  try {
    pythonProcess = spawn('python', [scriptPath], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });
    pythonProcess.unref();
  } catch (err) {
    console.error('Failed to spawn face_registration_stream.py:', err);
    return res.status(500).json({ message: 'Failed to start face registration Python process.' });
  }

  // 3. Wait for the Python server to be ready
  let isReady = false;
  for (let i = 0; i < 15; i++) {
    await sleep(200);
    const health = await callRegistrationStream('/health');
    if (health.ok) {
      isReady = true;
      break;
    }
  }

  if (!isReady) {
    console.error('face_registration_stream.py did not start or is not healthy on port 5001');
    return res.status(503).json({ message: 'Face registration service failed to start. Please check that face_registration_stream.py runs without errors and port 5001 is available.' });
  }

  // 4. Tell the (now running) service to start capturing
  const startResponse = await callRegistrationStream('/start', {
    method: 'POST',
    body: { email, name },
  });

  if (!startResponse.ok) {
    console.error('face_registration_stream.py /start error:', startResponse.json);
    return res.status(startResponse.status || 500).json(startResponse.json);
  }

  res.status(202).json({ message: 'Face registration process initiated.' });
});

// Endpoint to get the status of the registration
app.get('/register-face/status', async (req, res) => {
  const result = await callRegistrationStream('/status');
  // Always return status, message, and progress fields for frontend robustness
  const status = result.json.status || 'unknown';
  const message = result.json.message || '';
  const progress = typeof result.json.progress === 'number' ? result.json.progress : 0;
  res.status(result.status || 500).json({ status, message, progress });
});

// Endpoint to get the current camera frame
app.get('/register-face/current-frame', async (req, res) => {
  const result = await callRegistrationStream('/current-frame');
  res.status(result.status || 500).json(result.json);
});

// Endpoint to stop the registration process (always return success)
app.post('/register-face/stop', async (req, res) => {
  try {
    await callRegistrationStream('/stop', { method: 'POST' });
    res.status(200).json({ success: true, message: 'Registration process stopped (or was not running).' });
  } catch (err) {
    // Always return success, even if the service is not running
    res.status(200).json({ success: true, message: 'Registration process stopped (or was not running).' });
  }
});

// Face authentication endpoint (single face)
app.post('/authenticate-face', async (req, res) => {
  if (!ensureDbReady(res)) return;
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }
    // Check if user exists and has face registered
    const user = await db.collection('users').findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    if (!user.faceRegistered) {
      return res.status(400).json({ message: 'Face not registered. Please register your face first.' });
    }
    // Call Python script for face authentication with streaming
    const python = spawn('python', ['single_face_stream.py', 'start', email], {
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });
    let output = '';
    let errorOutput = '';
    python.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write(`Authentication stdout: ${text}`);
    });
    python.stderr.on('data', (data) => {
      const text = data.toString();
      errorOutput += text;
      process.stderr.write(`Authentication stderr: ${text}`);
    });
    python.on('close', async (code) => {
      if (code === 0) {
        // Generate JWT token for successful authentication
        const token = jwt.sign(
          { email: user.email, name: user.name },
          JWT_SECRET,
          { expiresIn: '24h' }
        );
        res.status(200).json({ 
          message: 'Face authentication successful',
          authenticated: true,
          token,
          user: {
            name: user.name,
            email: user.email
          }
        });
      } else {
        res.status(401).json({ 
          message: 'Face authentication failed',
          authenticated: false,
          error: errorOutput
        });
      }
    });
  } catch (error) {
    console.error('Face authentication error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Forgot Password endpoint
app.post('/forgot-password', async (req, res) => {
  if (!ensureDbReady(res)) return;
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        message: 'Email is required',
        fieldErrors: { email: 'Email is required' }
      });
    }

    // Check if user exists
    const user = await db.collection('users').findOne({ email });
    if (!user) {
      return res.status(404).json({ 
        message: 'User not found with this email',
        fieldErrors: { email: 'Email not registered' }
      });
    }

    // In a real application, you would:
    // 1. Generate a password reset token
    // 2. Store it in the database with expiration
    // 3. Send an email with reset link
    // For now, we'll just return a success message
    
    res.status(200).json({ 
      message: 'Password reset instructions sent to your email',
      success: true
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Multi-Face Authentication endpoint
app.post('/multi-face-auth', async (req, res) => {
  if (!ensureDbReady(res)) return;
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: 'Email is required for session tracking' });
    }

    // Verify user is logged in (optional - for tracking who initiated)
    const user = await db.collection('users').findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    console.log(`Multi-face authentication initiated by: ${user.name}`);

    // Try to use existing Flask server if available
    const health = await callMultiFace('/health', { timeoutMs: 1000 });
    if (health.ok) {
      // Stop any running session then start a fresh one
      await callMultiFace('/stop', { method: 'POST', timeoutMs: 1500 });
      const startResp = await callMultiFace('/start', { method: 'POST', timeoutMs: 2000 });
      if (startResp.ok && (startResp.json?.success || startResp.json?.message)) {
        return res.status(200).json({ message: 'Multi-face authentication started', success: true, status: 'started', sessionId: startResp.json?.session_id });
      }
      // If start via HTTP failed, fall back to spawning
    }

    // Not healthy or start failed: ensure any previous server stops best-effort
    await stopMultiFaceServerIfRunning();

    // Spawn a persistent Flask server (no args) then start via HTTP
    const python = spawn('python', ['multi_face_stream.py'], {
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      detached: true,
      stdio: 'ignore'
    });
    python.unref?.();

    // Wait for health up to ~5 seconds
    let healthy = false;
    for (let i = 0; i < 10; i++) {
      const h = await callMultiFace('/health', { timeoutMs: 750 });
      if (h.ok) { healthy = true; break; }
      await sleep(300);
    }

    if (!healthy) {
      return res.status(500).json({ message: 'Failed to start multi-face service' });
    }

    const startResp = await callMultiFace('/start', { method: 'POST', timeoutMs: 2000 });
    if (startResp.ok && (startResp.json?.success || startResp.json?.message)) {
      return res.status(200).json({ message: 'Multi-face authentication started', success: true, status: 'started', sessionId: startResp.json?.session_id });
    }

    return res.status(500).json({ message: 'Failed to start authentication session' });
    
  } catch (error) {
    console.error('Multi-face authentication error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Start Crowd Counting
app.post('/crowd-counting/start', async (req, res) => {
  try {
    const health = await callCrowdStream('/health', { timeoutMs: 1000 });
    if (health.ok) {
      const status = await callCrowdStream('/status', { timeoutMs: 1000 });
      if (status.ok && status.json?.active) {
        return res.status(200).json({ message: 'Crowd counting already running', success: true, status: 'running' });
      }
      const startExisting = await callCrowdStream('/start', { method: 'POST', timeoutMs: 1500 });
      if (startExisting.ok) {
        return res.status(200).json({ message: 'Crowd counting started successfully', success: true, status: 'started' });
      }
    }

    const { email } = req.body; // Optional - for tracking who initiated
    
    if (email) {
      if (!ensureDbReady(res)) return;
      const user = await db.collection('users').findOne({ email });
      if (user) {
        console.log(`Crowd counting started by: ${user.name}`);
      }
    }

    // Start crowd counting stream service process
    const python = spawn('python', [path.join(__dirname, 'crowd_counting_stream.py'), 'start'], {
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      detached: true,
      stdio: 'ignore'
    });
    python.unref?.();

    // Wait briefly for service health
    let started = false;
    for (let i = 0; i < 12; i++) {
      await sleep(250);
      const h = await callCrowdStream('/health', { timeoutMs: 800 });
      if (h.ok) {
        const s = await callCrowdStream('/status', { timeoutMs: 800 });
        if (s.ok && s.json?.active) {
          started = true;
          break;
        }
      }
    }

    if (!started) {
      return res.status(500).json({ message: 'Failed to start crowd counting service', success: false });
    }

    res.status(200).json({ 
      message: 'Crowd counting started successfully',
      success: true,
      status: 'started'
    });
    
  } catch (error) {
    console.error('Crowd counting start error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Stop Crowd Counting
app.post('/crowd-counting/stop', async (req, res) => {
  try {
    const stopResp = await callCrowdStream('/stop', { method: 'POST', timeoutMs: 3000 });
    if (stopResp.ok) {
      return res.status(200).json({
        message: 'Crowd counting stopped successfully',
        success: true,
        status: 'stopped'
      });
    }
    return res.status(500).json({
      message: 'Failed to stop crowd counting',
      success: false,
      error: stopResp.json?.error || 'crowd_service_unreachable'
    });
  } catch (error) {
    console.error('Crowd counting stop error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Force Kill Crowd Counting (emergency stop)
app.post('/crowd-counting/force-stop', async (req, res) => {
  try {
    console.log('Force stop requested for crowd counting');

    // Try graceful stop first
    await callCrowdStream('/stop', { method: 'POST', timeoutMs: 2500 });

    const pidFile = path.join(__dirname, 'crowd_counting_stream.pid');
    if (!fs.existsSync(pidFile)) {
      return res.status(200).json({
        message: 'Force stop completed (no running crowd-counting process found)',
        success: true,
        status: 'force_stopped'
      });
    }

    const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
    if (!Number.isInteger(pid)) {
      return res.status(500).json({ message: 'Invalid PID file content', success: false });
    }

    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F']);
      killer.on('close', () => {
        res.status(200).json({
          message: 'Force stop completed',
          success: true,
          status: 'force_stopped'
        });
      });
      killer.on('error', (killError) => {
        console.error('Error force killing process:', killError);
        res.status(500).json({ message: 'Failed to force stop process', success: false });
      });
    } else {
      try {
        process.kill(pid, 'SIGKILL');
        res.status(200).json({
          message: 'Force stop completed',
          success: true,
          status: 'force_stopped'
        });
      } catch (killError) {
        console.error('Error force killing process:', killError);
        res.status(500).json({ message: 'Failed to force stop process', success: false });
      }
    }
  } catch (error) {
    console.error('Force stop error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get Crowd Counting Status
app.get('/crowd-counting/status', async (req, res) => {
  try {
    const statusResp = await callCrowdStream('/status', { timeoutMs: 1500 });
    if (statusResp.ok) {
      return res.status(200).json({ success: true, ...statusResp.json });
    }
    return res.status(200).json({
      success: true,
      active: false,
      current_count: 0,
      max_count: 0,
      status: 'inactive'
    });
  } catch (error) {
    console.error('Crowd counting status error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Legacy endpoint for backward compatibility
app.post('/crowd-counting', async (req, res) => {
  try {
    const health = await callCrowdStream('/health', { timeoutMs: 1000 });
    if (health.ok) {
      const status = await callCrowdStream('/status', { timeoutMs: 1000 });
      if (status.ok && status.json?.active) {
        return res.status(200).json({ message: 'Crowd counting already running', success: true, status: 'running' });
      }
      const startExisting = await callCrowdStream('/start', { method: 'POST', timeoutMs: 1500 });
      if (startExisting.ok) {
        return res.status(200).json({ message: 'Crowd counting started successfully', success: true, status: 'started' });
      }
    }

    const { email } = req.body; // Optional - for tracking who initiated
    
    if (email) {
      if (!ensureDbReady(res)) return;
      const user = await db.collection('users').findOne({ email });
      if (user) {
        console.log(`Crowd counting (legacy) initiated by: ${user.name}`);
      }
    }

    // Start crowd counting process
    const python = spawn('python', [path.join(__dirname, 'crowd_counting_stream.py'), 'start'], {
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      detached: true,
      stdio: 'ignore'
    });
    python.unref?.();

    res.status(200).json({ 
      message: 'Crowd counting started successfully',
      success: true,
      status: 'started'
    });
    
  } catch (error) {
    console.error('Crowd counting legacy error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get available recognition modes
app.get('/recognition-modes', (req, res) => {
  res.json({
    modes: [
      {
        id: 'single-face',
        name: 'Single Face Authentication',
        description: 'Authenticate a single registered user',
        requiresRegistration: true,
        endpoint: '/authenticate-face'
      },
      {
        id: 'multi-face',
        name: 'Multi-Face Authentication', 
        description: 'Authenticate multiple registered users simultaneously',
        requiresRegistration: true,
        endpoint: '/multi-face-auth'
      },
      {
        id: 'crowd-counting',
        name: 'Crowd Counting',
        description: 'Count number of people in real-time (no registration required)',
        requiresRegistration: false,
        endpoint: '/crowd-counting'
      }
    ]
  });
});

// Endpoint to mark face registration as complete
app.post('/register-face/complete', async (req, res) => {
  if (!ensureDbReady(res)) return;
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'Email is required.' });
  }
  try {
    const result = await db.collection('users').updateOne(
      { email },
      { $set: { faceRegistered: true } }
    );
    if (result.modifiedCount === 1) {
      res.status(200).json({ success: true, message: 'Face registration marked as complete.' });
    } else {
      res.status(404).json({ success: false, message: 'User not found.' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database error.' });
  }
});

app.listen(3001, () => {
  console.log('✅ Server running on http://localhost:3001');
  console.log('📊 Available Endpoints:');
  console.log('   Authentication:');
  console.log('   - POST /register - User signup');
  console.log('   - POST /login - User login');
  console.log('   - POST /forgot-password - Password reset');
  console.log('   Face Recognition:');
  console.log('   - POST /register-face - Register face after signup');
  console.log('   - POST /authenticate-face - Single face authentication');
  console.log('   - POST /multi-face-auth - Multi-face authentication');
  console.log('   Crowd Counting:');
  console.log('   - POST /crowd-counting/start - Start crowd counting');
  console.log('   - POST /crowd-counting/stop - Stop crowd counting');
  console.log('   - POST /crowd-counting/force-stop - Force stop crowd counting');
  console.log('   - GET /crowd-counting/status - Get crowd counting status');
  console.log('   - POST /crowd-counting - Legacy crowd counting endpoint');
  console.log('   Utility:');
  console.log('   - GET /recognition-modes - List available recognition modes');
});
