import type { Request, Response } from "@/lib/api/contracts";

// API timestamps are UTC. Preserve sub-millisecond precision at the snapshot boundary.
const instantKey = (value: string) =>
  value.replace(
    /(?:\.(\d+))?Z$/,
    (_, fraction: string | undefined) => "." + (fraction ?? "").padEnd(9, "0") + "Z",
  );
const atOrBefore = (value: string, cutoff: string) => instantKey(value) <= instantKey(cutoff);
type ReadOperation = "readNotification" | "readAllNotifications";

export function applyOptimisticNotificationRead(
  data: Response<"notifications"> | undefined,
  filter: Request<"notifications"> | undefined,
  notificationId: string,
  readAt: string,
) {
  if (!data || !filter) return data;
  const target = data.items.find((item) => item.id === notificationId);
  if (!target || target.readAt) return data;
  const items = data.items.map((item) => (item.id === notificationId ? { ...item, readAt } : item));
  return {
    ...data,
    items: filter.unreadOnly ? items.filter((item) => !item.readAt) : items,
    unreadCount: Math.max(0, data.unreadCount - 1),
    total: filter.unreadOnly ? Math.max(0, data.total - 1) : data.total,
  };
}

export function applyNotificationRead(
  data: Response<"notifications"> | undefined,
  filter: Request<"notifications"> | undefined,
  operation: ReadOperation,
  input: Request<ReadOperation>,
  ack: Response<ReadOperation>,
) {
  if (
    !data ||
    !filter ||
    !ack.readAt ||
    !ack.asOf ||
    ack.unreadCount === undefined ||
    !ack.recipientId ||
    ack.recipientId !== data.recipientId
  )
    return data;
  if (!atOrBefore(data.asOf, ack.asOf)) return data;
  if (operation === "readAllNotifications" && !ack.before) return data;
  if (
    operation === "readNotification" &&
    ack.notificationId &&
    ack.notificationId !== (input as Request<"readNotification">).notificationId
  )
    return data;
  const cutoff =
    operation === "readAllNotifications"
      ? (ack.before ?? (input as Request<"readAllNotifications">).before)
      : null;
  let changed = 0;
  const patched = data.items.map((item) => {
    const applies =
      operation === "readNotification"
        ? item.id === (input as Request<"readNotification">).notificationId
        : cutoff !== null && atOrBefore(item.createdAt, cutoff);
    if (!item.readAt && applies) {
      changed++;
      return { ...item, readAt: ack.readAt! };
    }
    return item;
  });
  const covered =
    operation === "readAllNotifications" && cutoff !== null && atOrBefore(data.asOf, cutoff);
  const unreadCount = ack.unreadCount;
  return {
    ...data,
    items: filter.unreadOnly ? patched.filter((item) => !item.readAt) : patched,
    unreadCount,
    total: filter.unreadOnly
      ? !filter.category
        ? ack.unreadCount
        : covered
          ? 0
          : Math.max(0, data.total - changed)
      : data.total,
  };
}
