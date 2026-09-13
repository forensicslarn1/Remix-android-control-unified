type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(_options?: UseAuthOptions) {
  return {
    user: { id: "local-user", name: "Device Operator", email: "analyst@local.desk" },
    loading: false,
    error: null,
    isAuthenticated: true,
    refresh: () => Promise.resolve(),
    logout: () => Promise.resolve(),
  };
}
