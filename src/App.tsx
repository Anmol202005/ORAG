import { BrowserRouter, Routes, Route } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import Dashboard from "./pages/Dashboard";
import Auth from "./pages/Auth";
import Landing from "./pages/Landing";
import Organizations from "./pages/Organizations";
import ProtectedRoute from "./components/ProtectedRoute";

export default function App() {
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0a0a0a", color: "white" }}>
      <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route
              path="/organizations"
              element={
                <ProtectedRoute>
                  <Organizations />
                </ProtectedRoute>
              }
            />
            <Route
              path="/org/:slug"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </GoogleOAuthProvider>
    </div>
  );
}