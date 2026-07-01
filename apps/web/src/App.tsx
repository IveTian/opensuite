import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AdminLayout } from "./components/AdminLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Home } from "./pages/Home";
import { Profile } from "./pages/Profile";
import { Contacts } from "./pages/contacts/Contacts";
import { Mailbox } from "./pages/mail/Mailbox";
import { Dashboard } from "./pages/admin/Dashboard";
import { Domains } from "./pages/admin/Domains";
import { Users } from "./pages/admin/Users";
import { Addresses } from "./pages/admin/Addresses";
import { Directory } from "./pages/admin/Directory";
import { Plans } from "./pages/admin/Plans";
import { Invites } from "./pages/admin/Invites";
import { Settings } from "./pages/admin/Settings";
import { Audit } from "./pages/admin/Audit";
import { ThemeProvider } from "./providers/theme";
import { BrandingProvider } from "./providers/branding";

export function App() {
  return (
    <ThemeProvider>
      <BrandingProvider>
        <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* 管理后台（需管理员） */}
          <Route element={<ProtectedRoute requireAdmin />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="domains" element={<Domains />} />
              <Route path="users" element={<Users />} />
              <Route path="addresses" element={<Addresses />} />
              <Route path="directory" element={<Directory />} />
              <Route path="plans" element={<Plans />} />
              <Route path="invites" element={<Invites />} />
              <Route path="settings" element={<Settings />} />
              <Route path="audit" element={<Audit />} />
            </Route>
          </Route>

          {/* 应用页（Launchpad）与用户自助页（需登录） */}
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Home />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/account" element={<Navigate to="/profile" replace />} />
            <Route path="/contacts" element={<Contacts />} />
            <Route path="/mail" element={<Mailbox />} />
          </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </BrandingProvider>
    </ThemeProvider>
  );
}
