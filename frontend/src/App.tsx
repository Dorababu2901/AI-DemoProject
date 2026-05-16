import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState, type JSX } from "react";
import LoginPage from "./pages/LoginPage";
import ChatPage from "./pages/ChatPage";
import ConnectionsPage from "./pages/sql/ConnectionsPage";
import AskPage from "./pages/sql/AskPage";
import SheetsHomePage from "./pages/sheets/SheetsHomePage";
import SheetsAskPage from "./pages/sheets/SheetsAskPage";
import ResearchPage from "./pages/research/ResearchPage";
import TicTacToePage from "./pages/tictactoe/TicTacToePage";
import { api, ApiError } from "./lib/api";

function RequireAuth({ children }: { children: JSX.Element }) {
  const [state, setState] = useState<"checking" | "ok" | "no">("checking");

  useEffect(() => {
    let cancelled = false;
    api
      .get("/api/v1/auth/me")
      .then(() => !cancelled && setState("ok"))
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) setState("no");
        else setState("no");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "checking") {
    return (
      <div className="flex h-screen items-center justify-center text-slate-500">
        Loading…
      </div>
    );
  }
  if (state === "no") return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <ChatPage />
            </RequireAuth>
          }
        />
        <Route
          path="/sql/connections"
          element={
            <RequireAuth>
              <ConnectionsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/sql/ask"
          element={
            <RequireAuth>
              <AskPage />
            </RequireAuth>
          }
        />
        <Route
          path="/sheets"
          element={
            <RequireAuth>
              <SheetsHomePage />
            </RequireAuth>
          }
        />
        <Route
          path="/sheets/:id/ask"
          element={
            <RequireAuth>
              <SheetsAskPage />
            </RequireAuth>
          }
        />
        <Route
          path="/research"
          element={
            <RequireAuth>
              <ResearchPage />
            </RequireAuth>
          }
        />
        <Route
          path="/tictactoe"
          element={
            <RequireAuth>
              <TicTacToePage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
