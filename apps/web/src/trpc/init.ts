import { auth } from '@/lib/auth';
import { initTRPC, TRPCError } from '@trpc/server';
import { headers } from 'next/headers';
import { cache } from 'react';

type CreateContextOptions = {
  headers?: Headers;
};

type SessionPayload = Awaited<ReturnType<typeof auth.api.getSession>>;

type TRPCContext = {
  session: SessionPayload;
  auth?: NonNullable<SessionPayload>;
};

const createContextInner = async (
  opts?: CreateContextOptions,
): Promise<TRPCContext> => {
  const headerList = opts?.headers ?? (await headers());
  const session = await auth.api.getSession({ headers: headerList });
  return { session };
};

export const createTRPCContext = cache(() => createContextInner());

export const createTRPCApiContext = (opts: CreateContextOptions) =>
  createContextInner(opts);

const t = initTRPC.context<TRPCContext>().create({
  /**
   * @see https://trpc.io/docs/server/data-transformers
   */
  // transformer: superjson,
});
// Base router and procedure helpers
export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const baseProcedure = t.procedure;

export const protectedProcedure = baseProcedure.use(({ ctx, next }) => {
  const session = ctx.session;
  if (!session) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'unauthorized' });
  }
  return next({ ctx: { ...ctx, auth: session } });
});