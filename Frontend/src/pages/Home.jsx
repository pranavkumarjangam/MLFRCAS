// Home.jsx
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './Home.css';

function Home() {
  const [greeting, setGreeting] = useState('');
  const [userName, setUserName] = useState('');
  
  useEffect(() => {
    const hours = new Date().getHours();
    if (hours < 12) setGreeting('Good Morning');
    else if (hours < 18) setGreeting('Good Afternoon');
    else setGreeting('Good Evening');
    
    // Get user name from localStorage
    const storedUserName = localStorage.getItem('userName');
    if (storedUserName) {
      setUserName(storedUserName);
    }
  }, []);
  
  return (
    <div className="home-container">
      <h1 className="main-heading">{greeting}{userName ? ` ${userName}` : ''}, Welcome to the Facial Authentication System</h1>
      <p className="para">Please select the recognition mode you want to use:</p>
      
      <div className="options-container">
        <div className="option-card">
          <img 
            src="https://img.freepik.com/premium-photo/closeup-businesswoman39s-face-showing-determination-focus-while-working-project-with-clean-professional_1229213-60777.jpg" 
            alt="Single Face Recognition" 
            className="tab-image" 
          />
          <h2>Single Face Recognition</h2>
          <div className="buttons">
            <Link to="/face-dashboard" className="btn enter-btn">Enter</Link>
          </div>
        </div>
        
        <div className="option-card">
          <img 
            src="https://c4.wallpaperflare.com/wallpaper/365/399/678/music-bts-wallpaper-preview.jpg" 
            alt="Group Face Recognition" 
            className="tab-image" 
          />
          <h2>Group Face Recognition</h2>
          <div className="buttons">
            <Link to="/group-dashboard" className="btn enter-btn">Enter</Link>
          </div>
        </div>
        
        <div className="option-card">
          <img 
            src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRJc-dmaSdFkQDLOtefk3_zIqkTtrELukz0Mw&s" 
            alt="Crowd Analysis" 
            className="tab-image" 
          />
          <h2>Crowd Analysis</h2>
          <div className="buttons">
            <Link to="/crowd-dashboard" className="btn enter-btn">Enter</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Home;