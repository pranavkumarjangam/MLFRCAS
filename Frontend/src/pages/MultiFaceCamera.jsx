import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './CrowdCountingCamera.css';

const MultiFaceCamera = () => {
  const navigate = useNavigate();
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [authenticationStarted, setAuthenticationStarted] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(null);
  const [recognizedUsers, setRecognizedUsers] = useState([]);
  const [sessionId, setSessionId] = useState(() => Date.now());
  const [serverSessionId, setServerSessionId] = useState(null);

  // Refs to avoid stale closures inside setInterval callbacks
  const frameIntervalRef = useRef(null);
  const statusIntervalRef = useRef(null);
  const authTimeoutRef = useRef(null);
  const completionTimeoutRef = useRef(null);
  const serverSessionIdRef = useRef(null);
  const recognizedUsersRef = useRef([]);
  const isActiveRef = useRef(false);
  
  useEffect(() => { serverSessionIdRef.current = serverSessionId; }, [serverSessionId]);
  useEffect(() => { recognizedUsersRef.current = recognizedUsers; }, [recognizedUsers]);
  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);

  useEffect(() => {
    // Check if user is logged in
    const userEmail = localStorage.getItem('userEmail');
    if (!userEmail) {
      setError('Please login first to use multi-face authentication.');
      return;
    }

    // Ensure any prior backend session is stopped and local state cleared
    const abortPreviousSession = async () => {
      try {
        await axios.post('http://localhost:5003/stop');
      } catch (error) {
        void error;
        // ignore
      } finally {
        cleanupIntervals();
        setAuthenticationStarted(false);
        setCurrentFrame(null);
        setSessionId(Date.now());
        setServerSessionId(null);
      }
    };

    abortPreviousSession();

    // On unmount, stop any ongoing session
    return () => {
      if (authTimeoutRef.current) {
        clearTimeout(authTimeoutRef.current);
        authTimeoutRef.current = null;
      }
      if (completionTimeoutRef.current) {
        clearTimeout(completionTimeoutRef.current);
        completionTimeoutRef.current = null;
      }
      cleanupIntervals();
      axios.post('http://localhost:5003/stop').catch(() => {});
    };
  }, []);

  // Prevent background scroll to avoid overlay misalignment
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
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

  const fetchCurrentFrame = async () => {
    try {
      const response = await axios.get('http://localhost:5003/current-frame', {
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
          Expires: '0',
        },
        params: { t: Date.now() }
      });
      if (response.data) {
        // If server provided a session id and we don't have it yet, adopt it
        if (response.data.session_id && !serverSessionIdRef.current) {
          setServerSessionId(response.data.session_id);
        }
        // Ignore frames from an older/different server session
        if (serverSessionIdRef.current && response.data.session_id && response.data.session_id !== serverSessionIdRef.current) {
          return;
        }
        setCurrentFrame(response.data.frame || null);
        setIsActive(Boolean(response.data.active));
        if (response.data.recognized_count !== undefined) {
          // Update recognized users count if needed
        }
      }
      if (!response.data.active && isActiveRef.current) {
        cleanupIntervals();
        setCurrentFrame(null);
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
      const response = await axios.get('http://localhost:5003/status', {
        headers: {
          'Cache-Control': 'no-cache',
        },
        params: { t: Date.now() }
      });
      if (response.data.session_id && !serverSessionIdRef.current) {
        setServerSessionId(response.data.session_id);
      }
      if (serverSessionIdRef.current && response.data.session_id && response.data.session_id !== serverSessionIdRef.current) {
        return;
      }
      if (response.data.recognized_users) {
        setRecognizedUsers(response.data.recognized_users);
      }

      // Decide completion based on backend status/result only (avoid stale gating)
      const status = response.data.status;
      const backendHasResult = typeof response.data.success === 'boolean' && !!response.data.message;
      const shouldFinalize = backendHasResult || status === 'completed' || status === 'stopped' || status === 'failed';

      if (shouldFinalize) {
        const finalUsers = response.data.recognized_users || recognizedUsersRef.current;
        const success = backendHasResult
          ? response.data.success
          : (status === 'completed' || status === 'stopped') && finalUsers.length > 0;
        const message = response.data.message || (status === 'stopped'
          ? `Multi-face authentication completed. ${finalUsers.length} users recognized.`
          : 'Authentication completed');
        setResult({
          success,
          message,
          recognizedUsers: finalUsers,
          totalRecognized: finalUsers.length
        });
        setIsLoading(false);
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
    
    if (authTimeoutRef.current) {
      clearTimeout(authTimeoutRef.current);
      authTimeoutRef.current = null;
    }
    if (completionTimeoutRef.current) {
      clearTimeout(completionTimeoutRef.current);
      completionTimeoutRef.current = null;
    }
  };

  const startAuthentication = async () => {
    const userEmail = localStorage.getItem('userEmail');
    
    if (!userEmail) {
      setError('Please login first to use multi-face authentication.');
      return;
    }

    setIsLoading(true);
    setError('');
    setResult(null);
    setAuthenticationStarted(false);
    setRecognizedUsers([]);
    setCurrentFrame(null);

    try {
      // Ensure any previously stuck session is fully stopped before starting a new one
      try {
        await axios.post('http://localhost:5003/stop');
      } catch (error) {
        void error;
      }

      const response = await axios.post('http://localhost:3001/multi-face-auth', {
        email: userEmail
      });

      if (response.data.success) {
        if (response.data.sessionId) {
          setServerSessionId(response.data.sessionId);
        }
        // Only begin polling after backend acknowledges start
        setSessionId(Date.now());
        setAuthenticationStarted(true);
        setIsActive(true);
        setCurrentFrame(null); // ensure UI doesn't show a stale frame before the first fetch
        
        // Set a timeout to automatically complete authentication after 30 seconds
        const timeout = window.setTimeout(() => {
          completeAuthentication();
        }, 30000);
        authTimeoutRef.current = timeout;
        
        // Don't set result immediately, let the status polling handle it
      } else {
        throw new Error(response.data.message || 'Multi-face authentication failed');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Multi-face authentication failed. Please try again.');
      setIsActive(false);
      setAuthenticationStarted(false);
    } finally {
      setIsLoading(false);
    }
  };

  const completeAuthentication = async () => {
    // Clear auto-complete timer but keep polling until backend reports completion
    if (authTimeoutRef.current) {
      clearTimeout(authTimeoutRef.current);
      authTimeoutRef.current = null;
    }
    try {
      setIsLoading(true);
      // Ask backend to stop the stream; status polling will capture the final result
      await axios.post('http://localhost:5003/stop');
      // Start a completion timeout to avoid indefinite wait
      if (!completionTimeoutRef.current) {
        const timeoutId = window.setTimeout(() => {
          setIsLoading(false);
          setError('Completing authentication timed out. Please try again.');
          setAuthenticationStarted(false);
          setIsActive(false);
          cleanupIntervals();
        }, 15000);
        completionTimeoutRef.current = timeoutId;
      }
      // Do NOT cleanup or set result here; wait for /status to report completion
    } catch (error) {
      void error;
      // Don't fail immediately; keep polling for backend to finalize
      if (!completionTimeoutRef.current) {
        const timeoutId = window.setTimeout(() => {
          setIsLoading(false);
          setError('Completing authentication timed out. Please try again.');
          setAuthenticationStarted(false);
          setIsActive(false);
          cleanupIntervals();
        }, 15000);
        completionTimeoutRef.current = timeoutId;
      }
    }
  };

  const goBack = () => navigate('/group-dashboard');

  const tryAgain = () => {
    setError('');
    setResult(null);
    setIsActive(false);
    setAuthenticationStarted(false);
    if (completionTimeoutRef.current) {
      clearTimeout(completionTimeoutRef.current);
      completionTimeoutRef.current = null;
    }
    // Ensure backend is reset and clear any stale frame
    axios.post('http://localhost:5003/stop').catch(() => {});
    cleanupIntervals();
    setCurrentFrame(null);
    setSessionId(Date.now());
    setServerSessionId(null);
  };

  return (
    <div className="crowd-camera-container">
      <div className="camera-header">
        <button onClick={goBack} className="back-button">← Back</button>
        <h1>Multi-Face Authentication</h1>
      </div>

      <div className="camera-main">
        {isLoading && (
          <div className="camera-overlay">
            <div className="loading-spinner" />
            <p>{authenticationStarted ? 'Completing multi-face authentication...' : 'Starting multi-face authentication...'}</p>
            <p className="instruction">{authenticationStarted ? 'Finalizing results. Please wait…' : 'Camera window will open shortly'}</p>
            {!authenticationStarted && (
              <p className="instruction">Multiple registered users can be recognized simultaneously</p>
            )}
          </div>
        )}

        {!isLoading && !authenticationStarted && !result && !error && (
          <div className="camera-overlay">
            <div className="start-screen">
              <h2>Ready for Multi-Face Authentication</h2>
              <p>Multiple registered users can be authenticated at once</p>
              <div className="auth-instructions">
                <div className="instruction-item">
                  <span className="icon">💡</span> Ensure good lighting for all faces
                </div>
                <div className="instruction-item">
                  <span className="icon">👥</span> All users should be clearly visible
                </div>
                <div className="instruction-item">
                  <span className="icon">📷</span> Look directly at the camera
                </div>
                <div className="instruction-item">
                  <span className="icon">🔄</span> Only registered users will be recognized
                </div>
              </div>
              <button onClick={startAuthentication} className="start-button">
                Start Group Authentication
              </button>
            </div>
          </div>
        )}

        {authenticationStarted && !result && !error && (
          <div className="camera-overlay active">
            <div className="camera-feed-container square">
              {currentFrame ? (
                <img
                  key={`${sessionId}-${serverSessionId || 'na'}`}
                  src={`data:image/jpeg;base64,${currentFrame}`}
                  alt="Live Multi-Face Authentication"
                  className="camera-feed square-feed"
                />
              ) : (
                <div className="multi-face-placeholder">
                  <div className="loading-spinner" />
                  <p>Starting camera...</p>
                  <p className="instruction">Please stay still and look at the camera</p>
                  <p className="instruction">Multiple faces can be recognized simultaneously</p>
                </div>
              )}
            </div>
            
            {recognizedUsers.length > 0 && (
              <div className="recognized-users-sidebar">
                <h3>Recognized Users</h3>
                <div className="count-display">{recognizedUsers.length}</div>
                <ul className="user-list">
                  {recognizedUsers.map((user, index) => (
                    <li key={index} className="user-item">
                      <span className="user-name">{user.name}</span>
                      <span className="user-email">{user.email}</span>
                      {user.similarity && (
                        <span className="similarity">({(user.similarity * 100).toFixed(1)}%)</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            <div className="camera-controls">
              <button 
                onClick={completeAuthentication} 
                className="stop-button"
                disabled={isLoading}
              >
                {isLoading ? 'Completing Authentication...' : '🟥 Stop & Complete Authentication'}
              </button>
            </div>
          </div>
        )}

        {result && (
          <div className="camera-overlay">
            <div className="result-screen">
              <h2>✅ Authentication Complete!</h2>
              <div className="final-results">
                <div className="result-card">
                  <h3>Recognition Results</h3>
                  <div className="count-display final">{result.totalRecognized}</div>
                  <p>Users Recognized</p>
                  
                  {result.recognizedUsers && result.recognizedUsers.length > 0 && (
                    <div className="recognized-users">
                      <h4>Authenticated Users:</h4>
                      <ul className="final-user-list">
                        {result.recognizedUsers.map((user, index) => (
                          <li key={index} className="final-user-item">
                            <div className="user-info-card">
                              <span className="icon">✅</span>
                              <div className="user-details">
                                <span className="user-name">{typeof user === 'string' ? user : user.name}</span>
                                {typeof user === 'object' && user.email && (
                                  <span className="user-email">{user.email}</span>
                                )}
                                {typeof user === 'object' && user.similarity && (
                                  <span className="similarity">Confidence: {(user.similarity * 100).toFixed(1)}%</span>
                                )}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {result.totalRecognized === 0 && (
                    <div className="no-recognition">
                      <p>No registered users were recognized in the camera feed.</p>
                      <p>Please ensure registered users are clearly visible.</p>
                    </div>
                  )}
                  
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
          <div className="instruction-item"><span className="icon">👥</span> Multiple face recognition</div>
          <div className="instruction-item"><span className="icon">⚡</span> Simultaneous authentication</div>
          <div className="instruction-item"><span className="icon">🔒</span> Registered users only</div>
        </div>
      </div>
    </div>
  );
};

export default MultiFaceCamera;
