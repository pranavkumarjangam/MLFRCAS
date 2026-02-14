import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import "./ForgotPassword.css";
import email_icon from "../assets/email.png";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setError("");
    setLoading(true);

    try {
      const res = await axios.post("http://localhost:3001/forgot-password", { email });
      setMessage(res.data.message || "If this email is registered, a reset link has been sent.");
    } catch (err) {
      const msg = err.response?.data?.message || "An error occurred. Please try again.";
      setError(msg);
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
          <div className="text">Reset Password</div>
          <div className="underline"></div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="inputs">
            <div className="input">
              <img src={email_icon} alt="Email" />
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          {message && <div className="success-message">{message}</div>}
          {error && <div className="error-message">{error}</div>}

          <div className="submit-container">
            <button className="submit" type="submit" disabled={loading}>
              {loading ? "Sending..." : "Send Reset Link"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ForgotPassword;
