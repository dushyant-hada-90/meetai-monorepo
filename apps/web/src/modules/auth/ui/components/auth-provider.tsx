"use client";

import { authClient } from "@/lib/auth-client";
import { createContext, useContext, ReactNode } from "react";

type Session = typeof authClient.$Infer.Session;

interface AuthContextType {
    session: Session | null;
    isPending: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const { data: session, isPending } = authClient.useSession();

    return (
        <AuthContext.Provider value={{ session, isPending }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
};
