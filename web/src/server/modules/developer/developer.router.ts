import { TRPCError } from "@trpc/server";
import { getServerEnv } from "../../../env.server";
import { createTRPCRouter, protectedProcedure } from "../../trpc";
import { InvalidPayAddressError } from "../profiles/profiles.errors";
import { requireUsername } from "../profiles/profiles.service";
import {
  ApiKeyNotFoundError,
  InvalidWebhookUrlError,
  PoolFullError,
} from "./developer.errors";
import {
  createKeyInput,
  keyIdInput,
  poolInput,
  webhookInput,
} from "./developer.schema";
import {
  addPoolAddresses,
  createApiKey,
  deleteWebhook,
  deliverEvent,
  getWebhook,
  listApiKeys,
  listDeliveries,
  POOL_TARGET,
  poolStatus,
  revokeApiKey,
  rotateWebhookSecret,
  setWebhook,
} from "./developer.service";

function mapError(e: unknown): never {
  if (
    e instanceof InvalidWebhookUrlError ||
    e instanceof InvalidPayAddressError ||
    e instanceof PoolFullError
  )
    throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
  if (e instanceof ApiKeyNotFoundError)
    throw new TRPCError({ code: "NOT_FOUND", message: e.message });
  throw e;
}

const owner = (ctx: { privyUserId: string }) =>
  requireUsername(ctx.privyUserId);

export const developerRouter = createTRPCRouter({
  /** Everything the Developers page shows, in one call. */
  overview: protectedProcedure.query(async ({ ctx }) => {
    const me = await owner(ctx);
    const [keys, webhook, deliveries, pool] = await Promise.all([
      listApiKeys(me),
      getWebhook(me),
      listDeliveries(me),
      poolStatus(me),
    ]);
    return {
      keys,
      webhook,
      deliveries,
      pool: { ...pool, target: POOL_TARGET },
      apiBase: `${(getServerEnv().APP_URL || "").replace(/\/$/, "")}/api/v1`,
    };
  }),
  createKey: protectedProcedure
    .input(createKeyInput)
    .mutation(async ({ ctx, input }) =>
      createApiKey(await owner(ctx), input.name),
    ),
  revokeKey: protectedProcedure
    .input(keyIdInput)
    .mutation(async ({ ctx, input }) =>
      revokeApiKey(await owner(ctx), input.id).catch(mapError),
    ),
  setWebhook: protectedProcedure
    .input(webhookInput)
    .mutation(async ({ ctx, input }) =>
      setWebhook(await owner(ctx), input.url).catch(mapError),
    ),
  rotateWebhookSecret: protectedProcedure.mutation(async ({ ctx }) =>
    rotateWebhookSecret(await owner(ctx)).catch(mapError),
  ),
  deleteWebhook: protectedProcedure.mutation(async ({ ctx }) =>
    deleteWebhook(await owner(ctx)),
  ),
  testWebhook: protectedProcedure.mutation(async ({ ctx }) => {
    const delivery = await deliverEvent(await owner(ctx), "test", {
      message: "Webhook test from Zua",
    });
    if (!delivery)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Set a webhook URL first.",
      });
    return delivery;
  }),
  /** Spare signed addresses from the owner's wallet, for API checkouts. */
  addPoolAddresses: protectedProcedure
    .input(poolInput)
    .mutation(async ({ ctx, input }) =>
      addPoolAddresses(await owner(ctx), input.addresses).catch(mapError),
    ),
  poolStatus: protectedProcedure.query(async ({ ctx }) => {
    const me = await owner(ctx);
    const [pool, keys] = await Promise.all([poolStatus(me), listApiKeys(me)]);
    return { ...pool, target: POOL_TARGET, usesApi: keys.length > 0 };
  }),
});
