import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';

const CrowdDashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('instructions');

  const tabContent = {
    instructions: (
      <ul>
        <li>💡 Ensure good lighting for accurate detection</li>
        <li>👥 All people should be clearly visible in frame</li>
        <li>📷 Position camera to capture the entire area</li>
        <li>🔄 Real-time count updates automatically</li>
      </ul>
    ),
    features: (
      <ul>
        <li>🤖 AI-powered YOLO detection</li>
        <li>📊 Real-time people counting</li>
        <li>📈 Maximum count tracking</li>
        <li>🚫 No registration required</li>
      </ul>
    ),
    usecases: (
      <ul>
        <li>🏢 Office occupancy</li>
        <li>🎪 Event crowd control</li>
        <li>🏪 Retail foot traffic</li>
        <li>🚌 Public transport capacity</li>
      </ul>
    ),
  };

  return (
    <div className="dashboard-fullscreen">
      <div className="dashboard-header">
        <h1>Crowd Counting System</h1>
        <p>Real-time people counting using AI</p>
      </div>

      <div className="center-block">
        <button
          onClick={() => navigate('/crowd-camera')}
          className="auth-button launch-button"
        >
          🎥 Launch Live Crowd Camera
        </button>

        <div className="tab-buttons">
          <button onClick={() => setActiveTab('instructions')} className={activeTab === 'instructions' ? 'active' : ''}>Instructions</button>
          <button onClick={() => setActiveTab('features')} className={activeTab === 'features' ? 'active' : ''}>Features</button>
          <button onClick={() => setActiveTab('usecases')} className={activeTab === 'usecases' ? 'active' : ''}>Use Cases</button>
        </div>

        <div className="tab-content">
          {tabContent[activeTab]}
        </div>
      </div>
    </div>
  );
};

export default CrowdDashboard;
