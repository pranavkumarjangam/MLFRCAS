import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

import Navbar from "./components/Navbar";
import LandingPage from "./pages/LandingPage";
import Home from "./pages/Home";
import Features from './pages/Features';
import About from './pages/About';
import Contact from './pages/Contact';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import ProtectedRoute from "./components/ProtectedRoute";
import FaceCapture from './pages/FaceCapture';
import FaceDashboard from './pages/FaceDashboard';
import MultiFaceAuth from './pages/MultiFaceAuth';
import GroupDashboard from './pages/GroupDashboard';
import CrowdDashboard from './pages/CrowdDashboard';
import CrowdCountingCamera from './pages/CrowdCountingCamera';
import SingleFaceCamera from './pages/SingleFaceCamera';
import MultiFaceCamera from './pages/MultiFaceCamera';

const App = () => {
  return (
    <Router>
      <Navbar />
      <Routes>
        {/* Landing page as the default route */}
        <Route path="/" element={<LandingPage />} />
        
        {/* Protected Home route - only accessible after login */}
        <Route 
          path="/home" 
          element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          } 
        />
        
        {/* Other pages */}
        <Route path="/features" element={<Features />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        
        {/* Dashboard routes for recognition modes */}
        <Route 
          path="/face-dashboard" 
          element={
            <ProtectedRoute>
              <FaceDashboard />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/multi-face-auth" 
          element={
            <ProtectedRoute>
              <MultiFaceAuth />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/group-dashboard" 
          element={
            <ProtectedRoute>
              <GroupDashboard />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/crowd-dashboard" 
          element={
            <ProtectedRoute>
              <CrowdDashboard />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/crowd-camera" 
          element={
            <ProtectedRoute>
              <CrowdCountingCamera />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/single-face-camera" 
          element={
            <ProtectedRoute>
              <SingleFaceCamera />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/multi-face-camera" 
          element={
            <ProtectedRoute>
              <MultiFaceCamera />
            </ProtectedRoute>
          } 
        />
        <Route path="/face-capture" element={<FaceCapture />} />
        
        {/* Redirect to Landing Page for any unknown routes */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
};

export default App;