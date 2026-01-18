import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { createTRPCApiContext } from '@/trpc/init';
import { appRouter } from '@/trpc/routers/_app';
const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createTRPCApiContext({ headers: req.headers }),
  });
export { handler as GET, handler as POST };