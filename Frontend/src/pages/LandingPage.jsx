import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './LandingPage.css';

function LandingPage() {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Add a small delay before showing content for smoother animation
    setTimeout(() => {
      setIsLoaded(true);
    }, 300);
  }, []);

  return (
    <div className={`landing-container ${isLoaded ? 'loaded' : ''}`}>
      {/* Background decorative elements */}
      <div className="blob blob-1"></div>
      <div className="blob blob-2"></div>
      
      <div className="floating-dots">
        <div className="dot"></div>
        <div className="dot"></div>
        <div className="dot"></div>
        <div className="dot"></div>
        <div className="dot"></div>
      </div>
      
      <div className="welcome-section">
        <h1 className="greeting-text">Welcome to Multi level Facial Authentication System</h1>
        <p className="subtitle">
          Unlock a new era of seamless identification and security. Our advanced AI ensures accuracy, 
          speed, and personalized experiences like never before.
        </p>
        
        <div className="cta-buttons">
          <Link to="/login" style={{ display: 'block', textAlign: 'center' }}>
            <button className="cta-button login-btn">Login</button>
          </Link>
          <Link to="/signup" style={{ display: 'block', textAlign: 'center' }}>
            <button className="cta-button signup-btn">Sign Up</button>
          </Link>
        </div>
      </div>
      
      
      
      <div className="decoration-element">
        <div className="animated-circle"></div>
        <div className="animated-square"></div>
      </div>
    </div>
  );
}

export default LandingPage;
