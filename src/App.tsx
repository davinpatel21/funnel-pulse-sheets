import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import Index from "./pages/Index";
import Leads from "./pages/Leads";
import Appointments from "./pages/Appointments";
import Calls from "./pages/Calls";
import Deals from "./pages/Deals";
import Team from "./pages/Team";
import Settings from "./pages/Settings";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Protected route wrapper
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null);
      
      // Store Google OAuth tokens if present
      if (session?.provider_token && session?.provider_refresh_token) {
        await storeGoogleTokens(session);
      }
      
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user ?? null);
      
      // Store Google OAuth tokens on sign-in
      if (event === 'SIGNED_IN' && session?.provider_token && session?.provider_refresh_token) {
        setTimeout(async () => {
          await storeGoogleTokens(session);
        }, 0);
      }
      
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Helper function to store Google OAuth tokens
  const storeGoogleTokens = async (session: any) => {
    try {
      const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
      
      await supabase
        .from('google_sheets_credentials')
        .upsert({
          user_id: session.user.id,
          access_token: session.provider_token,
          refresh_token: session.provider_refresh_token,
          expires_at: expiresAt,
        }, {
          onConflict: 'user_id'
        });
    } catch (error) {
      console.error('Failed to store Google tokens:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <SidebarProvider>
                  <div className="flex min-h-screen w-full">
                    <AppSidebar />
                    <main className="flex-1">
                      <div className="border-b p-4">
                        <SidebarTrigger />
                      </div>
                      <Routes>
                        <Route path="/" element={<Index />} />
                        <Route path="/leads" element={<Leads />} />
                        <Route path="/appointments" element={<Appointments />} />
                        <Route path="/calls" element={<Calls />} />
                        <Route path="/deals" element={<Deals />} />
                        <Route path="/team" element={<Team />} />
                        <Route path="/settings" element={<Settings />} />
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </main>
                  </div>
                </SidebarProvider>
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
