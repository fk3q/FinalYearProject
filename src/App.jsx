import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import MainPage from './MainPage';
import Login from './Login';
import Signup from './Signup';
import ForgotPassword from './ForgotPassword';
import UploadPage from './UploadPage';
import ChatPage from './ChatPage';
import ProfilePage from './ProfilePage';
import AdminLogin from './AdminLogin';
import AdminDashboard from './AdminDashboard';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/"        element={<MainPage />} />
        <Route path="/login"   element={<Login />} />
        <Route path="/signup"  element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/upload"  element={<UploadPage />} />
        <Route path="/chat"    element={<ChatPage />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin"       element={<AdminDashboard />} />
      </Routes>
    </Router>
  );
}

export default App;
