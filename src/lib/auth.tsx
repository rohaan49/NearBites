import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, readSession, saveSession, type ApiUser } from "./api";

export type AuthRole = "buyer" | "seller";
export type TrainingModuleId =
  | "food-safety"
  | "packaging"
  | "allergens"
  | "portioning"
  | "fulfilment";

type AuthContext = {
  user: ApiUser | null;
  hydrated: boolean;
  signup: (input: { name: string; email: string; password: string; role: AuthRole }) => Promise<ApiUser>;
  login: (email: string, password: string) => Promise<ApiUser>;
  logout: () => Promise<void>;
  verifyEmail: (code: string) => Promise<void>;
  resendEmail: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

type SessionResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: ApiUser;
};

const AuthCtx = createContext<AuthContext | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    for (const legacyKey of ["nb-auth-users", "nb-auth-user", "nb-verif-subs", "nb-orders"]) {
      localStorage.removeItem(legacyKey);
    }
    if (!readSession()) {
      setHydrated(true);
      return;
    }
    api
      .get<ApiUser>("/users/me")
      .then(setUser)
      .catch(() => {
        saveSession(null);
        setUser(null);
      })
      .finally(() => setHydrated(true));
  }, []);

  const acceptSession = (session: SessionResponse) => {
    saveSession(session);
    setUser(session.user);
    return session.user;
  };

  const signup: AuthContext["signup"] = async ({ name, email, password, role }) => {
    const result = await api.post<SessionResponse>("/auth/register", {
      name,
      email,
      password,
      wants_to_sell: role === "seller",
    });
    return acceptSession(result);
  };

  const login: AuthContext["login"] = async (email, password) => {
    const result = await api.post<SessionResponse>("/auth/login", { email, password });
    return acceptSession(result);
  };

  const logout = async () => {
    const session = readSession();
    if (session) {
      try {
        await api.post<void>("/auth/logout", { refresh_token: session.refresh_token });
      } catch {
        // Clear this device even if the API is temporarily unavailable.
      }
    }
    saveSession(null);
    setUser(null);
  };

  const verifyEmail = async (code: string) => {
    await api.post("/auth/email/verify", { code });
    setUser((current) => (current ? { ...current, email_verified: true } : current));
  };

  const resendEmail = async () => {
    await api.post("/auth/email/resend", {});
  };

  const refreshUser = async () => {
    setUser(await api.get<ApiUser>("/users/me"));
  };

  return (
    <AuthCtx.Provider
      value={{ user, hydrated, signup, login, logout, verifyEmail, resendEmail, refreshUser }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthCtx);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
