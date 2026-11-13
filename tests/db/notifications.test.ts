import { beforeAll, describe, expect, it } from "vitest";
import { addMember, as, call, createBusiness, createTestDb, createUser, type Db } from "./harness";

describe("telegram notifications", () => {
  let db: Db;
  let owner: string;
  let staff: string;
  let rival: string;
  let org: { id: string; slug: string };
  let rivalOrg: { id: string; slug: string };

  const startLink = async (user: string, organizationId: string) =>
    (await call(db, user, `select public.start_telegram_link($1) as code`, [organizationId]))[0].code as string;
  const complete = async (code: string, chatId: number, title = "Depot group") =>
    (
      await as(db, null, (s) =>
        s.query<{ name: string | null }>(`select public.complete_telegram_link($1, $2, $3) as name`, [code, chatId, title])
      )
    )[0].name;
  const target = (user: string, organizationId: string) =>
    call(db, user, `select chat_id::text, actor_name from public.get_notification_target($1)`, [organizationId]);

  beforeAll(async () => {
    db = await createTestDb();
    owner = await createUser(db, "owner@example.com", "Ada Obi");
    staff = await createUser(db, "staff@example.com", "Chidi Eze");
    rival = await createUser(db, "rival@example.com", "Bola");
    org = await createBusiness(db, owner, "Depot One");
    rivalOrg = await createBusiness(db, rival, "Rival Depot");
    await addMember(db, owner, org.id, { id: staff, email: "staff@example.com" }, "staff");
  });

  it("has no target until a chat is linked", async () => {
    expect(await target(owner, org.id)).toEqual([]);
  });

  it("only lets an owner or admin start a link", async () => {
    await expect(startLink(staff, org.id)).rejects.toThrow(/do not have permission/);
    await expect(startLink(rival, org.id)).rejects.toThrow(/do not have permission/);
  });

  it("links the chat that presents the code, once", async () => {
    const code = await startLink(owner, org.id);
    expect(code).toMatch(/^[0-9a-f]{32}$/);

    expect(await complete("0".repeat(32), -100123)).toBeNull(); // wrong code
    expect(await complete("not-a-code", -100123)).toBeNull();
    expect(await complete(code, -100123, "Depot One staff")).toBe("Depot One");
    expect(await complete(code, -100999)).toBeNull(); // already used

    expect(await target(owner, org.id)).toEqual([{ chat_id: "-100123", actor_name: "Ada Obi" }]);
    expect(await target(staff, org.id)).toEqual([{ chat_id: "-100123", actor_name: "Chidi Eze" }]);
  });

  it("never gives one business's chat to another", async () => {
    expect(await target(rival, org.id)).toEqual([]);
    expect(await target(rival, rivalOrg.id)).toEqual([]);

    const theirCode = await startLink(rival, rivalOrg.id);
    expect(await complete(theirCode, -200456, "Rival group")).toBe("Rival Depot");
    expect(await target(rival, rivalOrg.id)).toEqual([{ chat_id: "-200456", actor_name: "Bola" }]);
    expect(await target(owner, org.id)).toEqual([{ chat_id: "-100123", actor_name: "Ada Obi" }]);
  });

  it("refuses an expired code", async () => {
    const code = await startLink(owner, org.id);
    await db.query(
      `update public.organization_notifications set link_code_expires_at = now() - interval '1 minute'
       where organization_id = $1`,
      [org.id]
    );
    expect(await complete(code, -100777)).toBeNull();
    expect(await target(owner, org.id)).toEqual([{ chat_id: "-100123", actor_name: "Ada Obi" }]);
  });

  it("hides the chat id and code hash from everyone, and all settings from staff", async () => {
    await expect(
      call(db, owner, `select telegram_chat_id from public.organization_notifications`)
    ).rejects.toThrow(/permission denied/);
    await expect(
      call(db, owner, `select link_code_hash from public.organization_notifications`)
    ).rejects.toThrow(/permission denied/);

    const forOwner = await call(db, owner, `select telegram_chat_title, is_enabled from public.organization_notifications`);
    const forStaff = await call(db, staff, `select telegram_chat_title, is_enabled from public.organization_notifications`);
    expect(forOwner).toEqual([{ telegram_chat_title: "Depot One staff", is_enabled: true }]);
    expect(forStaff).toEqual([]);
  });

  it("stops sending when switched off or disconnected", async () => {
    await expect(call(db, staff, `select public.set_notifications_enabled($1, false)`, [org.id])).rejects.toThrow(
      /do not have permission/
    );
    await call(db, owner, `select public.set_notifications_enabled($1, false)`, [org.id]);
    expect(await target(owner, org.id)).toEqual([]);
    await call(db, owner, `select public.set_notifications_enabled($1, true)`, [org.id]);
    expect(await target(owner, org.id)).toHaveLength(1);

    await expect(call(db, staff, `select public.disconnect_telegram($1)`, [org.id])).rejects.toThrow(/do not have permission/);
    await call(db, owner, `select public.disconnect_telegram($1)`, [org.id]);
    expect(await target(owner, org.id)).toEqual([]);
    expect(await target(rival, rivalOrg.id)).toHaveLength(1);
  });
});
