import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import "./Signup.css";
import user_icon from "../assets/person.png";
import email_icon from "../assets/email.png";
import password_icon from "../assets/password.png";

function Signup() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ name: "", email: "", password: "" });
  const [formErrors, setFormErrors] = useState({});
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const validateForm = () => {
    const errors = {};

    if (!formData.name.trim()) errors.name = "Name is required.";
    if (!formData.email) {
      errors.email = "Email is required.";
    } else if (!/^\S+@\S+\.\S+$/.test(formData.email)) {
      errors.email = "Invalid email format.";
    }
    if (!formData.password) {
      errors.password = "Password is required.";
    } else if (formData.password.length < 6) {
      errors.password = "Password must be at least 6 characters.";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({ ...prevData, [name]: value }));
    setFormErrors((prevErrors) => ({ ...prevErrors, [name]: "" })); // Clear specific field errors
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setSuccessMessage("");

    try {
      await axios.post("http://localhost:3001/register", formData);
      setSuccessMessage("Registration successful! Redirecting to face capture...");
      
      // Store the user's name and email for face registration
      localStorage.setItem("userName", formData.name);
      localStorage.setItem("userEmail", formData.email);
      
      // Dispatch custom event for navbar update
      window.dispatchEvent(new Event('localStorageChange'));
      
      // Simulate a delay before redirecting
      setTimeout(() => navigate("/face-capture"), 2000);

    } catch (err) {
      const message = err.response?.data?.message || "Registration failed. Please try again.";
      setFormErrors({ general: message });
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
          <div className="text">Sign Up</div>
          <div className="underline"></div>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="inputs">
            <div className="input">
              <img src={user_icon} alt="Name" />
              <input
                type="text"
                name="name"
                placeholder="Name"
                value={formData.name}
                onChange={handleInputChange}
                aria-label="Name"
                aria-invalid={!!formErrors.name}
                aria-describedby="name-error"
              />
              {formErrors.name && (
                <span className="field-error" id="name-error">
                  {formErrors.name}
                </span>
              )}
            </div>
            
            <div className="input">
              <img src={email_icon} alt="Email" />
              <input
                type="email"
                name="email"
                placeholder="Email"
                value={formData.email}
                onChange={handleInputChange}
                aria-label="Email"
                aria-invalid={!!formErrors.email}
                aria-describedby="email-error"
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
                name="password"
                placeholder="Password"
                value={formData.password}
                onChange={handleInputChange}
                aria-label="Password"
                aria-invalid={!!formErrors.password}
                aria-describedby="password-error"
              />
              {formErrors.password && (
                <span className="field-error" id="password-error">
                  {formErrors.password}
                </span>
              )}
            </div>
          </div>
          
          {formErrors.general && (
            <div className="error-message" role="alert">
              {formErrors.general}
            </div>
          )}
          
          {successMessage && (
            <div className="success-message" role="alert">
              {successMessage}
            </div>
          )}
          
          <div className="submit-container">
            <button
              type="submit"
              className="submit"
              disabled={loading}
            >
              {loading ? "Signing Up..." : "Sign Up"}
            </button>
            <Link to="/login">
              <button type="button" className="submit gray">Login</button>
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Signup;