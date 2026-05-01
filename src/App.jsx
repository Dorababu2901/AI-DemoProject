import { useState } from "react";
import "./App.css";

export default function App() {
  const [formData, setFormData] = useState({
    username: "",
    password: "",
  });

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    alert(`Welcome, ${formData.username || "User"}!`);
  }

  return (
    <main className="page">
      <section className="card" aria-label="Login form">
        <h1>Sign In</h1>
        <p className="subtitle">Enter your username and password</p>

        <form onSubmit={handleSubmit}>
          <label htmlFor="username">Username</label>
          <input
            id="username"
            name="username"
            type="text"
            value={formData.username}
            onChange={handleChange}
            placeholder="Enter username"
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            value={formData.password}
            onChange={handleChange}
            placeholder="Enter password"
            required
          />

          <button type="submit">Login</button>
        </form>
      </section>
    </main>
  );
}
