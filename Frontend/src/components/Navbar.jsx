import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import "./Navbar.css";

const Navbar = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');
  
  // Check login status and update state
  useEffect(() => {
    const checkLoginStatus = () => {
      const authToken = localStorage.getItem('authToken');
      const email = localStorage.getItem('userEmail');
      const name = localStorage.getItem('userName');
      
      console.log('Navbar - Auth Token:', authToken);
      console.log('Navbar - User Email:', email);
      console.log('Navbar - User Name:', name);
      
      setIsLoggedIn(authToken !== null);
      setUserEmail(email || '');
      setUserName(name || '');
    };
    
    checkLoginStatus();
    
    // Listen for storage changes
    window.addEventListener('storage', checkLoginStatus);
    
    // Custom event for same-tab localStorage changes
    window.addEventListener('localStorageChange', checkLoginStatus);
    
    return () => {
      window.removeEventListener('storage', checkLoginStatus);
      window.removeEventListener('localStorageChange', checkLoginStatus);
    };
  }, []);
  
  const homeLink = isLoggedIn ? '/home' : '/';

  const toggleMenu = () => {
    setMenuOpen(!menuOpen);
  };

  const toggleUserMenu = () => {
    setUserMenuOpen(!userMenuOpen);
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userName');
    setUserMenuOpen(false);
    
    // Dispatch custom event for same-tab updates
    window.dispatchEvent(new Event('localStorageChange'));
    
    window.location.href = '/';
  };

  return (
    <nav className="navbar">
      <div className="logo">
        <Link to={homeLink} className="logo-link">Synergy Sharks</Link>
      </div>

      {/* Hamburger Menu for Mobile */}
      <button className="menu-toggle" onClick={toggleMenu} aria-label="Toggle menu">
        <span></span>
        <span></span>
        <span></span>
      </button>

      {/* Right side container for nav links and user account */}
      <div className="navbar-right">
        {/* Navigation Links */}
        <ul className={`nav-links ${menuOpen ? "active" : ""}`}>
          <li>
            <Link to={homeLink} className="nav-item" onClick={() => setMenuOpen(false)}>Home</Link>
          </li>
          <li>
            <Link to="/features" className="nav-item" onClick={() => setMenuOpen(false)}>Features</Link>
          </li>
          <li>
            <Link to="/about" className="nav-item" onClick={() => setMenuOpen(false)}>About us</Link>
          </li>
          <li>
            <Link to="/contact" className="nav-item" onClick={() => setMenuOpen(false)}>Contact</Link>
          </li>
        </ul>

        {/* User Account Section */}
        {isLoggedIn && (
          <div className="user-account-section">
            <button className="user-account-button" onClick={toggleUserMenu}>
              <div className="user-icon-circle">
                <span className="user-icon">👤</span>
              </div>
              <span className="user-name">{userName || userEmail}</span>
              <span className="dropdown-arrow">{userMenuOpen ? '▲' : '▼'}</span>
            </button>
            
            {userMenuOpen && (
              <div className="user-dropdown">
                <div className="user-info">
                  <div className="user-detail">
                    <strong>Name:</strong> {userName || 'N/A'}
                  </div>
                  <div className="user-detail">
                    <strong>Email:</strong> {userEmail || 'N/A'}
                  </div>
                </div>
                <hr className="dropdown-divider" />
                <button className="logout-button" onClick={handleLogout}>
                  🚪 Logout
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
