import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './CrowdCountingCamera.css';

const SingleFaceCamera = () => {
  const navigate = useNavigate();
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [authenticationStarted, setAuthenticationStarted] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(null);
  const frameIntervalRef = useRef(null);
  const statusIntervalRef = useRef(null);
  const isActiveRef = useRef(false);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    // Check if user is logged in
    const userEmail = localStorage.getItem('userEmail');
    if (!userEmail) {
      setError('Please login first to use face authentication.');
      return;
    }
  }, []);

  useEffect(() => {
    if (authenticationStarted) {
      // Start polling for frames
      const interval = setInterval(fetchCurrentFrame, 200);
      frameIntervalRef.current = interval;
      
      // Start checking authentication status
      const statusInt = setInterval(checkAuthStatus, 2000);
      statusIntervalRef.current = statusInt;
      
      return () => {
        if (interval) clearInterval(interval);
        if (statusInt) clearInterval(statusInt);
      };
    }
  }, [authenticationStarted]);

  useEffect(() => {
    return () => {
      cleanupIntervals();
      axios.post('http://localhost:5002/stop').catch(() => {});
    };
  }, []);

  const fetchCurrentFrame = async () => {
    try {
      const response = await axios.get('http://localhost:5002/current-frame');
      if (response.data.frame) {
        setCurrentFrame(response.data.frame);
        setIsActive(response.data.active);
      }
      if (!response.data.active && isActiveRef.current) {
        cleanupIntervals();
      }
    } catch (err) {
      console.error('Frame fetch error:', err);
      // If frame fetching fails consistently, stop trying
      if (isActiveRef.current && err.code === 'ECONNREFUSED') {
        console.log('Stream server not responding, cleaning up...');
        cleanupIntervals();
        setError('Connection lost to authentication server');
      }
    }
  };

  const checkAuthStatus = async () => {
    try {
      const response = await axios.get('http://localhost:5002/status');
      if (response.data.success) {
        setResult({
          success: true,
          message: response.data.message,
          user: response.data.user
        });
        setAuthenticationStarted(false);
        setIsActive(false);
        cleanupIntervals();
      }
    } catch (err) {
      console.error('Error checking status:', err);
      // Only cleanup if it's a connection error and we're supposed to be active
      if (isActiveRef.current && (err.code === 'ECONNREFUSED' || err.response?.status === 404)) {
        console.log('Authentication server not responding, cleaning up...');
        cleanupIntervals();
        setError('Connection lost to authentication server');
      }
    }
  };

  const cleanupIntervals = () => {
    setIsActive(false);
    if (statusIntervalRef.current) {
      clearInterval(statusIntervalRef.current);
      statusIntervalRef.current = null;
    }
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    setCurrentFrame(null);
  };

  const startAuthentication = async () => {
    const userEmail = localStorage.getItem('userEmail');
    
    if (!userEmail) {
      setError('Please login first to use face authentication.');
      return;
    }

    setIsLoading(true);
    setError('');
    setResult(null);
    setAuthenticationStarted(true);

    try {
      const response = await axios.post('http://localhost:3001/authenticate-face', {
        email: userEmail
      });

      if (response.data.success || response.data.authenticated) {
        cleanupIntervals();
        setAuthenticationStarted(false);
        setResult({
          success: true,
          message: response.data.message,
          user: response.data.user
        });
      } else {
        throw new Error(response.data.message || 'Face authentication failed');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Face authentication failed. Please try again.');
      setIsActive(false);
      setAuthenticationStarted(false);
    } finally {
      setIsLoading(false);
    }
  };

  const stopAuthentication = async () => {
    setIsLoading(true);
    try {
      await axios.post('http://localhost:5002/stop');
      cleanupIntervals();
      setAuthenticationStarted(false);
      setResult({
        success: false,
        message: 'Authentication stopped by user'
      });
    } catch {
      setError('Failed to stop authentication');
    } finally {
      setIsLoading(false);
    }
  };

  const goBack = () => navigate('/face-dashboard');

  const tryAgain = () => {
    setError('');
    setResult(null);
    setIsActive(false);
    setAuthenticationStarted(false);
  };

  return (
    <div className="crowd-camera-container">
      <div className="camera-header">
        <button onClick={goBack} className="back-button">← Back</button>
        <h1>Single Face Authentication</h1>
      </div>

      <div className="camera-main">
        {isLoading && (
          <div className="camera-overlay">
            <div className="loading-spinner" />
            <p>Starting face authentication...</p>
            <p className="instruction">Camera window will open shortly</p>
            <p className="instruction">Please position your face clearly in the camera</p>
          </div>
        )}

        {!isLoading && !authenticationStarted && !result && !error && (
          <div className="camera-overlay">
            <div className="start-screen">
              <h2>Ready for Face Authentication</h2>
              <p>Position yourself in front of the camera</p>
              <div className="auth-instructions">
                <div className="instruction-item">
                  <span className="icon">💡</span> Ensure good lighting
                </div>
                <div className="instruction-item">
                  <span className="icon">👤</span> Only you should be visible
                </div>
                <div className="instruction-item">
                  <span className="icon">📷</span> Look directly at the camera
                </div>
              </div>
              <button onClick={startAuthentication} className="start-button">
                Start Authentication
              </button>
            </div>
          </div>
        )}

        {authenticationStarted && !result && !error && (
          <div className="camera-overlay active">
            <div className="camera-feed-container square">
              {currentFrame ? (
                <img 
                  src={`data:image/jpeg;base64,${currentFrame}`} 
                  alt="Live Authentication" 
                  className="camera-feed square-feed" 
                />
              ) : (
                <div className="multi-face-placeholder">
                  <div className="loading-spinner" />
                  <p>Starting camera...</p>
                  <p className="instruction">Please stay still and look at the camera</p>
                  <p className="instruction">Single face authentication in progress</p>
                </div>
              )}
            </div>
            
            <div className="camera-controls">
              <button 
                onClick={stopAuthentication} 
                className="stop-button"
                disabled={isLoading}
              >
                {isLoading ? 'Stopping...' : '🟥 Stop'}
              </button>
            </div>
          </div>
        )}

        {result && (
          <div className="camera-overlay">
            <div className="result-screen">
              <h2>✅ Authentication Successful!</h2>
              <div className="final-results">
                <div className="result-card">
                  <h3>Welcome Back!</h3>
                  <div>
                    <p><strong>Name:</strong> {result.user?.name}</p>
                    <p><strong>Email:</strong> {result.user?.email}</p>
                  </div>
                  <p className="success-message">{result.message}</p>
                </div>
              </div>
              <div className="result-actions">
                <button onClick={tryAgain} className="restart-button">Authenticate Again</button>
                <button onClick={goBack} className="dashboard-button">Back to Dashboard</button>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="camera-overlay">
            <div className="error-screen">
              <h2>❌ Authentication Failed</h2>
              <p>{error}</p>
              <div className="error-actions">
                <button onClick={tryAgain} className="retry-button">Try Again</button>
                <button onClick={goBack} className="dashboard-button">Back to Dashboard</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="camera-footer">
        <div className="instructions-bar">
          <div className="instruction-item"><span className="icon">🔒</span> Secure face recognition</div>
          <div className="instruction-item"><span className="icon">⚡</span> Fast authentication</div>
          <div className="instruction-item"><span className="icon">👤</span> Single user only</div>
        </div>
      </div>
    </div>
  );
};

export default SingleFaceCamera;
