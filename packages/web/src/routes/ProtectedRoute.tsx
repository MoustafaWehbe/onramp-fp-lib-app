import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Shimmer } from "../components/folio/Shimmer";

export function ProtectedRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Shimmer className="h-5 w-36" />
      </div>
    );
  }

  return user ? <Outlet /> : <Navigate to="/login" replace />;
}
