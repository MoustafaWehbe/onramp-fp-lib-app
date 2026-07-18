import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";
import { AppLayout } from "../layouts/AppLayout";
import { AuthLayout } from "../layouts/AuthLayout";
import { SharedLayout } from "../layouts/SharedLayout";
import { useAuth } from "../hooks/useAuth";
import { Welcome } from "../pages/Welcome";
import { Login } from "../pages/auth/Login";
import { Register } from "../pages/auth/Register";
import { Settings } from "../pages/dashboard/Settings";
import { Library } from "../pages/library/Library";
import { AddBook } from "../pages/library/AddBook";
import { BookDetail } from "../pages/library/BookDetail";
import { Journal } from "../pages/library/Journal";
import { Shelves } from "../pages/shelves/Shelves";
import { ShelfDetail } from "../pages/shelves/ShelfDetail";
import { Metrics } from "../pages/metrics/Metrics";
import { Discover } from "../pages/discover/Discover";
import { SharedShelves } from "../pages/shared/SharedShelves";
import { SharedShelfDetail } from "../pages/shared/SharedShelfDetail";
import { Admin } from "../pages/admin/Admin";
import { NotFound } from "../pages/NotFound";

/**
 * "/" is the public welcome (design A1), but a signed-in reader has no use for
 * the pitch — send them straight to their library.
 */
function Landing() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  return user ? <Navigate to="/library" replace /> : <Welcome />;
}

/** The server enforces the role on every /admin call; this guard just keeps
 *  non-admins from seeing an empty shell of the page. */
function AdminRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  return user?.role === "admin" ? <Admin /> : <Navigate to="/library" replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Landing />} />

      <Route element={<AuthLayout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>

      {/* Protected app routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          {/* The library is the home of the app — there's no separate dashboard
              in the design; "Library" is the first nav item. */}
          <Route
            path="/dashboard"
            element={<Navigate to="/library" replace />}
          />
          <Route path="/library" element={<Library />} />
          <Route path="/books/new" element={<AddBook />} />
          <Route path="/books/:id" element={<BookDetail />} />
          <Route path="/books/:id/journal" element={<Journal />} />
          <Route path="/shelves" element={<Shelves />} />
          <Route path="/shelves/:id" element={<ShelfDetail />} />
          <Route path="/discover" element={<Discover />} />
          <Route path="/metrics" element={<Metrics />} />
          <Route path="/settings" element={<Settings />} />
        </Route>

        {/* Shared shelves get the reduced "contributor view" chrome — the
            shrunken nav is the privacy boundary made visible (design E17). */}
        <Route element={<SharedLayout />}>
          <Route path="/shared" element={<SharedShelves />} />
          <Route path="/shared/:id" element={<SharedShelfDetail />} />
        </Route>

        {/* Admin is deliberately its own mode with its own chrome (F18). */}
        <Route path="/admin" element={<AdminRoute />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
