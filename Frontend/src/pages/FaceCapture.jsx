import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "./FaceCapture.css";
import axios from 'axios';
import './CrowdCountingCamera.css';

function FaceCapture() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('initializing'); // initializing, capturing, completed, error
  const [message, setMessage] = useState('Preparing face capture...');
  const [userName, setUserName] = useState('');
  const [currentFrame, setCurrentFrame] = useState(null);
  const [progress, setProgress] = useState(0);
  const [finalStatus, setFinalStatus] = useState(null);
  const lastResultRef = useRef({ status: null, message: '' });
  const isUnmounted = useRef(false);

  // Helper to safely update final result
  function safeSetFinal(status, message) {
    lastResultRef.current = { status, message };
    setFinalStatus(status);
  }

  const API_BASE = 'http://localhost:3001';
  const statusIntervalRef = useRef(null);
  const frameIntervalRef = useRef(null);

  const cleanup = () => {
    if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
    statusIntervalRef.current = null;
    frameIntervalRef.current = null;
  };

  // Helper to safely update state only if mounted and not finalized
  const safeSetState = (setter) => {
    if (!isUnmounted.current && !finalStatus) setter();
  };

  const stopRegistration = async () => {
    cleanup();
    try {
      await axios.post(`${API_BASE}/register-face/stop`);
    } catch (error) {
      console.error("Error stopping registration:", error);
    }
  };

  const startRegistrationProcess = async () => {
    setStatus('initializing');
    setMessage('Preparing face capture...');
    setProgress(0);
    setFinalStatus(null);
    isUnmounted.current = false;

    const storedName = localStorage.getItem('userName');
    const storedEmail = localStorage.getItem('userEmail');
    if (!storedName || !storedEmail) {
      setStatus('error');
      setMessage('User information not found. Please register again.');
      return;
    }
    setUserName(storedName);

    try {
      await axios.post(`${API_BASE}/register-face/start`, { name: storedName, email: storedEmail });
      safeSetState(() => setStatus('capturing'));
      
      // Start polling for status and frames
      statusIntervalRef.current = setInterval(async () => {
        try {
          const { data } = await axios.get(`${API_BASE}/register-face/status`);
          if (!lastResultRef.current.status && !isUnmounted.current) {
            safeSetState(() => setStatus(data.status || 'capturing'));
            safeSetState(() => setMessage(data.message || '...'));
            safeSetState(() => setProgress(typeof data.progress === 'number' ? data.progress : 0));
            if (["completed", "error", "stopped"].includes(data.status)) {
              safeSetFinal(data.status, data.message || (data.status === 'completed' ? 'Registration complete.' : 'Registration failed.'));
              cleanup();
            }
          }
        } catch {
          if (!lastResultRef.current.status && !isUnmounted.current) {
            safeSetFinal('error', 'Connection to server lost.');
            cleanup();
          }
        }
      }, 1000);

      frameIntervalRef.current = setInterval(async () => {
        try {
          const { data } = await axios.get(`${API_BASE}/register-face/current-frame`);
          if (data.frame && !finalStatus && !isUnmounted.current) {
            setCurrentFrame(data.frame);
          }
        } catch {
          // Ignore frame errors silently, status poll will handle connection loss
        }
      }, 100);

    } catch (error) {
      setFinalStatus('error');
      lastResultRef.current = {
        status: 'error',
        message: error.response?.data?.message || 'Failed to start registration service.'
      };
      cleanup();
    }
  };

  useEffect(() => {
    isUnmounted.current = false;
    document.body.style.overflow = 'hidden';
    startRegistrationProcess();

    return () => {
      isUnmounted.current = true;
      document.body.style.overflow = 'auto';
      stopRegistration();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (lastResultRef.current.status === 'completed') {
      const storedEmail = localStorage.getItem('userEmail');
      if (storedEmail) {
        axios.post(`${API_BASE}/register-face/complete`, { email: storedEmail });
      }
    }
  }, [finalStatus]);

  const handleRetry = () => {
    cleanup();
      setStatus('initializing');
      setMessage('Preparing face capture...');
      setProgress(0);
      setFinalStatus(null);
      lastResultRef.current = { status: null, message: '' };
      setCurrentFrame(null);
      startRegistrationProcess();
  };

  const handleNavigate = (path) => {
    stopRegistration().then(() => navigate(path));
  };

  // Robustly handle missing progress/message fields
  const safeProgress = typeof progress === 'number' && !isNaN(progress) ? progress : 0;
  const safeMessage = message || (status === 'completed' ? 'Registration complete.' : '');

  return (
    <div className="crowd-camera-container">
      <div className="camera-header">
        <button onClick={() => handleNavigate('/signup')} className="back-button">← Back to Signup</button>
        <h1>Face Registration</h1>
      </div>

      <div className="camera-main">
        {['initializing', 'capturing'].includes(status) && !lastResultRef.current.status && (
          <div className={`camera-overlay ${status === 'capturing' ? 'active' : ''}`}>
            <div className="camera-feed-container square">
              {currentFrame ? (
                <img src={`data:image/jpeg;base64,${currentFrame}`} alt="Live registration feed" className="camera-feed square-feed" />
              ) : (
                <div className="multi-face-placeholder">
                  <div className="loading-spinner" />
                  <p>{status === 'initializing' ? 'Preparing Camera...' : 'Waiting for video stream...'}</p>
                </div>
              )}
              {status === 'capturing' && (
                <div className="registration-progress-bar">
                    <div className="progress-bar-inner" style={{ width: `${safeProgress * 100}%` }}></div>
                    <span>{safeMessage}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {lastResultRef.current.status === 'completed' && (
          <div className="camera-overlay">
            <div className="result-screen">
              <h2>✅ Registration Complete</h2>
              <div className="final-results">
                <div className="result-card">
                  <h3>Welcome, {userName}!</h3>
                  <p className="success-message">{lastResultRef.current.message || 'Registration complete.'}</p>
                </div>
              </div>
              <div className="result-actions">
                <button onClick={() => handleNavigate('/login')} className="dashboard-button">Go to Login</button>
              </div>
            </div>
          </div>
        )}

        {lastResultRef.current.status === 'error' && (
          <div className="camera-overlay">
            <div className="error-screen">
              <h2>❌ Registration Failed</h2>
              <p>{lastResultRef.current.message}</p>
              <div className="error-actions">
                <button onClick={handleRetry} className="retry-button">Try Again</button>
                <button onClick={() => handleNavigate('/signup')} className="dashboard-button">Back to Signup</button>
              </div>
            </div>
          </div>
        )}

        {lastResultRef.current.status === 'stopped' && (
          <div className="camera-overlay">
            <div className="error-screen">
              <h2>⏹️ Registration Stopped</h2>
              <p>{lastResultRef.current.message}</p>
              <div className="error-actions">
                <button onClick={handleRetry} className="retry-button">Try Again</button>
                <button onClick={() => handleNavigate('/signup')} className="dashboard-button">Back to Signup</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="camera-footer">
        <div className="instructions-bar">
          <div className="instruction-item"><span className="icon">🔒</span> Your data is securely stored</div>
          <div className="instruction-item"><span className="icon">⚡</span> Fast registration</div>
          <div className="instruction-item"><span className="icon">👤</span> Make sure only your face is visible</div>
        </div>
      </div>
    </div>
  );
}

export default FaceCapture;
