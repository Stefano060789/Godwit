import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getLoginReturnPath } from "../lib/startGuide";
import { useTranslation } from "react-i18next";

export default function Register() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const returnPath = getLoginReturnPath(location.state?.returnTo);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleRegister(e) {
    e.preventDefault();
    setError("");
    setMessage("");

    const { data, error } = await supabase.auth.signUp({
      email,
      password
    });

    if (error) {
      setError(error.message);
      return;
    }

    if (data.session) {
      navigate(returnPath);
      return;
    }

    setMessage("Registration successful. Check your email to confirm your account.");
    navigate("/login", { state: { returnTo: returnPath } });
  }

  return (
    <div className="app-page auth-page max-w-md mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6 text-center">Create your Godwit account</h1>
      <section className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        <h2 className="font-bold">{t("trial.signupTitle")}</h2>
        <p className="mt-1 leading-6">{t("trial.signupBody")}</p>
      </section>

      {error && <p className="text-red-600 mb-4">{error}</p>}
      {message && <p className="text-green-600 mb-4">{message}</p>}

      <form onSubmit={handleRegister} className="space-y-4">
        <label htmlFor="register-email">Email</label>
        <input
          id="register-email"
          autoComplete="email"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border p-2 rounded text-black"
          required
        />

        <label htmlFor="register-password">Password</label>
        <input
          id="register-password"
          autoComplete="new-password"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border p-2 rounded text-black"
          required
        />

        <button
          type="submit"
          className="auth-primary"
        >
          Create account
        </button>
      </form>
      <p className="auth-footer"><Link to="/login" state={{ returnTo: returnPath }}>Already have an account? Sign in</Link></p>
    </div>
  );
}
