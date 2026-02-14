import React, { useState } from 'react';
import axios from 'axios';
import './Dashboard.css';

const SingleDashboard = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleAuthentication = async () => {
    if (!email) {
      setError('Please enter your email');
      return;
    }

    setIsLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await axios.post('http://localhost:3001/authenticate-face', {
        email: email
      });

      setResult({
        success: true,
        message: response.data.message,
        user: response.data.user
      });
    } catch (error) {
      setError(error.response?.data?.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>Single Face Authentication</h1>
        <p>Authenticate using your registered face</p>
      </div>

      <div className="dashboard-content">
        <div className="input-section">
          <label htmlFor="email">Enter your email:</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your.email@example.com"
            disabled={isLoading}
          />
        </div>

        <button 
          onClick={handleAuthentication}
          disabled={isLoading || !email}
          className="auth-button"
        >
          {isLoading ? 'Authenticating...' : 'Start Face Authentication'}
        </button>

        {error && (
          <div className="error-message">
            <p>{error}</p>
          </div>
        )}

        {result && (
          <div className={`result-message ${result.success ? 'success' : 'error'}`}>
            <h3>{result.success ? '✅ Authentication Successful!' : '❌ Authentication Failed'}</h3>
            <p>{result.message}</p>
            {result.user && (
              <div className="user-info">
                <p><strong>Welcome:</strong> {result.user.name}</p>
                <p><strong>Email:</strong> {result.user.email}</p>
              </div>
            )}
          </div>
        )}

        <div className="instructions">
          <h3>Instructions:</h3>
          <ul>
            <li>Make sure your webcam is connected and working</li>
            <li>Ensure good lighting for face detection</li>
            <li>Look directly at the camera when prompted</li>
            <li>Press 'q' to quit the authentication process</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default SingleDashboard;
