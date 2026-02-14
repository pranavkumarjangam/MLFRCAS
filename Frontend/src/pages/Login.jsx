import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import "./Login.css";
import email_icon from "../assets/email.png";
import password_icon from "../assets/password.png";

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [formErrors, setFormErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMessage("");
    setFormErrors({}); // Reset form errors
    setLoading(true);
    
    try {
      const res = await axios.post("http://localhost:3001/login", { email, password });
      const { token, user } = res.data;
      
      // Store the token and user info in localStorage
      localStorage.setItem("authToken", token);
      if (user?.name) {
        localStorage.setItem("userName", user.name);
      }
      if (user?.email) {
        localStorage.setItem("userEmail", user.email);
      }
      
      // Dispatch custom event for navbar update
      window.dispatchEvent(new Event('localStorageChange'));
      
      // Navigate to home page after successful login
      navigate("/home");
    } catch (err) {
      const { fieldErrors, message } = err.response?.data || {};
      setErrorMessage(message || "An error occurred during login. Please try again.");
      setFormErrors(fieldErrors || {}); // Handle specific field errors
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page-container">
      <button className="back-button" onClick={() => navigate("/")}>
        ← Back
      </button>
      
      <div className="container">
        <div className="header">
          <div className="text">Login</div>
          <div className="underline"></div>
        </div>
        
        <form onSubmit={handleLogin}>
          <div className="inputs">
            <div className="input">
              <img src={email_icon} alt="Email" />
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-label="Email"
                aria-invalid={!!formErrors.email}
                aria-describedby="email-error"
                required
              />
              {formErrors.email && (
                <span className="field-error" id="email-error">
                  {formErrors.email}
                </span>
              )}
            </div>
            
            <div className="input">
              <img src={password_icon} alt="Password" />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-label="Password"
                aria-invalid={!!formErrors.password}
                aria-describedby="password-error"
                required
              />
              {formErrors.password && (
                <span className="field-error" id="password-error">
                  {formErrors.password}
                </span>
              )}
            </div>
          </div>
          
          {errorMessage && (
            <div className="error-message" role="alert">
              {errorMessage}
            </div>
          )}
          
          <div className="forgot-password">
            Forgot Password?{" "}
            <Link to="/forgot-password">
              <span className="clickable-text">Click Here</span>
            </Link>
          </div>
          
          <div className="submit-container">
            <button
              type="submit"
              className="submit"
              disabled={loading}
            >
              {loading ? "Logging In..." : "Login"}
            </button>
            <Link to="/signup">
              <button type="button" className="submit gray">Sign Up</button>
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Login;