import React from 'react';
import { Navigate } from 'react-router-dom';

// Component to protect routes that require authentication
const ProtectedRoute = ({ children }) => {
  const isAuthenticated = localStorage.getItem('authToken');
  
  if (!isAuthenticated) {
    // Redirect to login page if user is not authenticated
    return <Navigate to="/login" replace />;
  }
  
  // Render the protected component if authenticated
  return children;
};

export default ProtectedRoute;