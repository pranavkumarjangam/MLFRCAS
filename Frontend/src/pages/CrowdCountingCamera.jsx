import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './CrowdCountingCamera.css';

const CrowdCountingCamera = () => {
  const navigate = useNavigate();
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [currentFrame, setCurrentFrame] = useState(null);
  const [maxCount, setMaxCount] = useState(0);
  const statusIntervalRef = useRef(null);
  const frameIntervalRef = useRef(null);
  const isActiveRef = useRef(false);
  const maxCountRef = useRef(0);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    maxCountRef.current = maxCount;
  }, [maxCount]);

  useEffect(() => {
    checkStatus();
    return () => {
      if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
      if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - only run on mount/unmount

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

  const startCrowdCounting = async () => {
    setIsLoading(true);
    setError('');
    setResult(null);
    try {
      const email = localStorage.getItem('userEmail') || 'anonymous@example.com';
      const response = await axios.post('http://localhost:3001/crowd-counting/start', { email });
      if (response.data.success) {
        cleanupIntervals();
        setIsActive(true);
        const statInt = setInterval(checkStatus, 2000);
        const frameInt = setInterval(fetchCurrentFrame, 200);
        statusIntervalRef.current = statInt;
        frameIntervalRef.current = frameInt;
      } else {
        setError('Failed to start crowd counting');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to start crowd counting');
    } finally {
      setIsLoading(false);
    }
  };

  const forceStopCounting = async () => {
    setIsLoading(true);
    try {
      const response = await axios.post('http://localhost:3001/crowd-counting/force-stop');
      if (response.data.success) {
        cleanupIntervals();
        setResult({
          success: true,
          message: 'Counting stopped. Camera feed closed.',
          final_count: maxCountRef.current
        });
      } else {
        setError('Failed to stop crowd counting');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to stop crowd counting');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCurrentFrame = async () => {
    try {
      const response = await axios.get('http://localhost:5004/current-frame');
      if (response.data.frame) {
        setCurrentFrame(response.data.frame);
        setMaxCount(response.data.max_count || 0);
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
      }
    }
  };

  const checkStatus = async () => {
    try {
      const response = await axios.get('http://localhost:3001/crowd-counting/status');
      if (response.data.success) {
        setMaxCount(response.data.max_count || 0);
        if (['completed', 'stopped'].includes(response.data.status)) {
          cleanupIntervals();
          setResult({
            success: true,
            message: response.data.message || 'Counting completed',
            final_count: response.data.max_count || maxCountRef.current
          });
        }
      }
    } catch (err) {
      console.error('Status check failed:', err);
      // Only cleanup if it's a connection error and we're supposed to be active
      if (isActiveRef.current && (err.code === 'ECONNREFUSED' || err.response?.status === 404)) {
        console.log('Backend not responding, cleaning up...');
        cleanupIntervals();
        setError('Connection lost to backend server');
      }
    }
  };

  const goBack = () => navigate('/crowd-dashboard');

  return (
    <div className="crowd-camera-container">
      <div className="camera-header">
        <button onClick={goBack} className="back-button">← Back</button>
        <h1>Live Crowd Counting</h1>
      </div>

      <div className="camera-main">
        {isLoading && (
          <div className="camera-overlay">
            <div className="loading-spinner" />
            <p>Starting crowd counting system...</p>
            <p className="instruction">Camera window will open shortly</p>
          </div>
        )}

        {!isLoading && !isActive && !result && (
          <div className="camera-overlay">
            <div className="start-screen">
              <h2>Ready for Crowd Counting</h2>
              <p>Real-time people detection using AI technology</p>
              
              <div className="auth-instructions">
                <div className="instruction-item">
                  <span className="icon">💡</span> Ensure good lighting for accurate detection
                </div>
                <div className="instruction-item">
                  <span className="icon">👥</span> All people should be clearly visible in frame
                </div>
                <div className="instruction-item">
                  <span className="icon">📷</span> Position camera to capture the entire area
                </div>
                <div className="instruction-item">
                  <span className="icon">🔄</span> Real-time count updates automatically
                </div>
              </div>
              
              <button onClick={startCrowdCounting} className="start-button">
                Start Counting
              </button>
            </div>
          </div>
        )}

        {isActive && (
          <div className="camera-overlay active">
            <div className="camera-feed-container square">
              {currentFrame ? (
                <>
                  <img 
                    src={`data:image/jpeg;base64,${currentFrame}`} 
                    alt="Live Feed" 
                    className="camera-feed square-feed" 
                  />
                  <div className="count-overlay">
                    <h4>Max Count</h4>
                    <div className="count-display">{maxCount}</div>
                  </div>
                </>
              ) : (
                <div className="multi-face-placeholder">
                  <div className="loading-spinner" />
                  <p>Loading camera feed...</p>
                  <p className="instruction">Initializing crowd counting system</p>
                  <p className="instruction">Real-time people detection starting</p>
                </div>
              )}
            </div>

            <div className="camera-controls">
              <button 
                onClick={forceStopCounting} 
                className="force-stop-button"
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
              <h2>📊 Done!</h2>
              <div className="final-results">
                <div className="result-card">
                  <h3>Final Count</h3>
                  <div className="count-display final">{result.final_count}</div>
                  <p>{result.message}</p>
                </div>
              </div>
              <div className="result-actions">
                <button onClick={startCrowdCounting} className="restart-button">Count Again</button>
                <button onClick={goBack} className="dashboard-button">Back to Dashboard</button>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="camera-overlay">
            <div className="error-screen">
              <h2>❌ Error</h2>
              <p>{error}</p>
              <div className="error-actions">
                <button onClick={startCrowdCounting} className="retry-button">Try Again</button>
                <button onClick={goBack} className="dashboard-button">Back to Dashboard</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="camera-footer">
        <div className="instructions-bar">
          <div className="instruction-item"><span className="icon">🎯</span> Real-time people detection</div>
          <div className="instruction-item"><span className="icon">📹</span> Embedded camera feed</div>
          <div className="instruction-item"><span className="icon">🟥</span> Use Stop to finish</div>
        </div>
      </div>
    </div>
  );
};

export default CrowdCountingCamera;
