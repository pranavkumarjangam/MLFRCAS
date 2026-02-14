import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';

const MultiFaceAuth = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState('');

  const handleMultiFaceAuth = async () => {
    if (!email) {
      setError('Please enter your email for session tracking');
      return;
    }

    setIsAuthenticating(true);
    setError('');

    try {
      const response = await fetch('http://localhost:3001/multi-face-auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email })
      });

      const data = await response.json();
      
      if (response.ok) {
        // Persist email for the camera flow and navigate to the live auth screen
        localStorage.setItem('userEmail', email);
        navigate('/multi-face-camera');
      } else {
        throw new Error(data.message || 'Multi-face authentication failed');
      }
    } catch (error) {
      console.error('Multi-face auth error:', error);
      setError(error.message || 'Multi-face authentication failed. Please try again.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <div className="dashboard-fullscreen">
      <div className="dashboard-header">
        <h1>Multi-Face Authentication</h1>
        <p>Authenticate multiple registered users simultaneously</p>
      </div>

      <div className="center-block">
        <div className="input-section">
          <label htmlFor="email">Enter your email (for session tracking):</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your.email@example.com"
            disabled={isAuthenticating}
          />
        </div>

        <button 
          onClick={handleMultiFaceAuth}
          disabled={isAuthenticating || !email}
          className="auth-button launch-button"
        >
          {isAuthenticating ? 'Authenticating...' : '👥 Start Multi-Face Authentication'}
        </button>

        {error && (
          <div className="error-message">
            <p>{error}</p>
          </div>
        )}

        {/* Do not show final result on this screen; we navigate to camera and wait for completion there */}

        <div className="instructions">
          <h3>Instructions:</h3>
          <ul>
            <li>Make sure your webcam is connected and working</li>
            <li>Ensure good lighting for face detection</li>
            <li>Multiple people can be in the camera view</li>
            <li>Only registered users will be authenticated</li>
            <li>Press 'q' to quit the authentication process</li>
            <li>Green boxes indicate authenticated users</li>
            <li>Red boxes indicate unknown faces</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default MultiFaceAuth;
