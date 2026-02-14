import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';

const FaceDashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('instructions');

  const tabContent = {
    instructions: (
      <ul>
        <li>💡 Ensure good lighting for your face</li>
        <li>👤 Position yourself clearly in frame</li>
        <li>📷 Look directly at the camera</li>
        <li>🔄 Only registered users will be recognized</li>
      </ul>
    ),
    features: (
      <ul>
        <li>🔒 Secure single-user authentication</li>
        <li>⚡ Fast and accurate face recognition</li>
        <li>🛡️ Privacy-first: no data stored locally</li>
        <li>💻 Works with standard webcams</li>
      </ul>
    ),
    usecases: (
      <ul>
        <li>🔐 Secure login to your account</li>
        <li>👨‍💼 Employee check-in systems</li>
        <li>🏠 Smart home access</li>
        <li>📚 Exam proctoring</li>
      </ul>
    ),
  };



  return (
    <div className="dashboard-fullscreen">
      <div className="dashboard-header">
        <h1>Single Face Authentication</h1>
        <p>Authenticate securely using your registered face</p>
      </div>

      <div className="center-block">
        <button
          onClick={() => navigate('/single-face-camera')}
          className="auth-button launch-button"
        >
          🧑‍💻 Start Face Authentication
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

export default FaceDashboard;
