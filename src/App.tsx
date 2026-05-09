import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { UserProfileProvider } from "@/hooks/useUserProfile";
import ErrorBoundary from "@/components/ErrorBoundary";
import Index from "./pages/Index.tsx";
import CharacterProfile from "./pages/CharacterProfile.tsx";
import Chat from "./pages/Chat.tsx";
import Auth from "./pages/Auth.tsx";
import History from "./pages/History.tsx";
import Settings from "./pages/Settings.tsx";
import AdminDebug from "./pages/AdminDebug.tsx";

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <UserProfileProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <HashRouter>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/history" element={<History />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/admin-debug" element={<AdminDebug />} />
                <Route path="/character/:id" element={<CharacterProfile />} />
                <Route path="/chat/:characterId/:asmrType" element={<Chat />} />
                <Route path="/chat/:characterId" element={<Chat />} />
                {/* Catch-all: redirect any unknown path back to home */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </HashRouter>
          </TooltipProvider>
        </UserProfileProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
