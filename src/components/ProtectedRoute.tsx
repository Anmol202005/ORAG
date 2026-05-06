import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";

interface ProtectedRouteProps {
  children: ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const token = localStorage.getItem("auth_token");

  if (!token) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}