export const trpc: any = {
  useUtils: () => ({
    auth: { me: { setData: () => {}, invalidate: () => Promise.resolve() } },
  }),
  auth: {
    me: { useQuery: () => ({ data: null, isLoading: false, error: null, refetch: () => Promise.resolve() }) },
    logout: { useMutation: () => ({ mutateAsync: () => Promise.resolve(), isPending: false, error: null }) },
  },
};
