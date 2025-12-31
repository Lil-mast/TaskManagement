
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./app/App.tsx";
import UserProfile from "./app/UserProfile.tsx";
import Signup from "./app/Signup.tsx";
import Login from "./app/Login.tsx";
import { AuthProvider } from "./lib/auth.tsx";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <AuthProvider>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/profile" element={<UserProfile />} />
      </Routes>
    </AuthProvider>
  </BrowserRouter>
);
  