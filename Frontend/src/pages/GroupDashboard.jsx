import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';

const GroupDashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('instructions');

  const tabContent = {
    instructions: (
      <ul>
        <li>💡 Ensure good lighting for all faces</li>
        <li>👥 All users should be clearly visible</li>
        <li>📷 Look directly at the camera</li>
        <li>🔄 Only registered users will be recognized</li>
      </ul>
    ),
    features: (
      <ul>
        <li>👥 Group authentication in real-time</li>
        <li>⚡ Fast and accurate multi-face recognition</li>
        <li>📊 Session tracking for attendance</li>
        <li>💻 Works with standard webcams</li>
      </ul>
    ),
    usecases: (
      <ul>
        <li>🎓 Classroom attendance</li>
        <li>🎉 Event group check-in</li>
        <li>🏢 Meeting room access</li>
        <li>🧑‍🤝‍🧑 Family/group smart home entry</li>
      </ul>
    ),
  };

  return (
    <div className="dashboard-fullscreen">
      <div className="dashboard-header">
        <h1>Multi-Face Authentication</h1>
        <p>Authenticate multiple registered users simultaneously</p>
      </div>

      <div className="center-block">
        <button
          onClick={() => navigate('/multi-face-camera')}
          className="auth-button launch-button"
        >
          👥 Start Multi-Face Authentication
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

export default GroupDashboard;
