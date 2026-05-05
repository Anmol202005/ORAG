import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children }) {
  const token = localStorage.getItem("auth_token");

  if (!token) {
    return <Navigate to="/auth" replace />;
  }

  return children;
}