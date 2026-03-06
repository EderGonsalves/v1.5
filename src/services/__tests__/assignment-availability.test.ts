import { describe, it, expect } from "vitest";
import {
  pickNextUser,
  pickNextUserWithAvailability,
  type QueueRecord,
} from "../assignment-queue";
import type { UserAvailabilityMap } from "../user-availability";
import type { UserPublicRow } from "../permissions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeUser = (
  id: number,
  name: string,
  overrides?: Partial<UserPublicRow>,
): UserPublicRow => ({
  id,
  name,
  email: `${name.toLowerCase()}@test.com`,
  phone: "",
  oab: "",
  isActive: true,
  isOfficeAdmin: false,
  receivesCases: true,
  agendaEnabled: true,
  ...overrides,
});

const makeQueueRecord = (
  userId: number,
  count: number,
  lastAssigned?: string,
): QueueRecord => ({
  id: userId,
  user_id: userId,
  institution_id: 1,
  last_assigned_at: lastAssigned ?? new Date().toISOString(),
  assignment_count: count,
});

// ---------------------------------------------------------------------------
// pickNextUserWithAvailability
// ---------------------------------------------------------------------------

describe("pickNextUserWithAvailability", () => {
  it("prioriza usuários disponíveis agora (ignora ocupados)", () => {
    const users = [makeUser(1, "Ana"), makeUser(2, "Bruno"), makeUser(3, "Carla")];
    const availability: UserAvailabilityMap = new Map([
      [1, { available: false, nextSlotStart: "2026-03-04T10:00:00Z" }],
      [2, { available: true }],
      [3, { available: false, nextSlotStart: "2026-03-04T14:00:00Z" }],
    ]);

    const picked = pickNextUserWithAvailability(users, [], availability);
    expect(picked?.id).toBe(2);
  });

  it("aplica round-robin entre os disponíveis", () => {
    const users = [makeUser(1, "Ana"), makeUser(2, "Bruno"), makeUser(3, "Carla")];
    const availability: UserAvailabilityMap = new Map([
      [1, { available: true }],
      [2, { available: true }],
      [3, { available: false }],
    ]);

    // Ana tem mais atribuições → Bruno deve ser priorizado
    const queueRecords = [
      makeQueueRecord(1, 10, "2026-03-03T12:00:00Z"),
      makeQueueRecord(2, 2, "2026-03-03T12:00:00Z"),
    ];

    const picked = pickNextUserWithAvailability(users, queueRecords, availability);
    expect(picked?.id).toBe(2);
  });

  it("quando ninguém disponível agora, escolhe quem tem o próximo slot mais cedo", () => {
    const users = [makeUser(1, "Ana"), makeUser(2, "Bruno")];
    const availability: UserAvailabilityMap = new Map([
      [1, { available: false, nextSlotStart: "2026-03-04T14:00:00Z" }],
      [2, { available: false, nextSlotStart: "2026-03-04T10:00:00Z" }],
    ]);

    const picked = pickNextUserWithAvailability(users, [], availability);
    expect(picked?.id).toBe(2); // Bruno fica livre antes
  });

  it("desempata por round-robin quando vários têm mesmo nextSlotStart", () => {
    const users = [makeUser(1, "Ana"), makeUser(2, "Bruno"), makeUser(3, "Carla")];
    const sameSlot = "2026-03-04T10:00:00Z";
    const availability: UserAvailabilityMap = new Map([
      [1, { available: false, nextSlotStart: sameSlot }],
      [2, { available: false, nextSlotStart: sameSlot }],
      [3, { available: false, nextSlotStart: "2026-03-04T16:00:00Z" }],
    ]);

    // Ana count=5, Bruno count=2 → round-robin pega Bruno
    const queueRecords = [
      makeQueueRecord(1, 5, "2026-03-03T12:00:00Z"),
      makeQueueRecord(2, 2, "2026-03-03T12:00:00Z"),
    ];

    const picked = pickNextUserWithAvailability(users, queueRecords, availability);
    expect(picked?.id).toBe(2);
  });

  it("retorna null quando ninguém tem slot futuro", () => {
    const users = [makeUser(1, "Ana"), makeUser(2, "Bruno")];
    const availability: UserAvailabilityMap = new Map([
      [1, { available: false }], // sem nextSlotStart
      [2, { available: false }],
    ]);

    const picked = pickNextUserWithAvailability(users, [], availability);
    expect(picked).toBeNull();
  });

  it("trata usuários sem entry no map como disponíveis", () => {
    const users = [makeUser(1, "Ana"), makeUser(2, "Bruno")];
    const availability: UserAvailabilityMap = new Map([
      [1, { available: false }],
      // Bruno sem entry → available !== false → disponível
    ]);

    const picked = pickNextUserWithAvailability(users, [], availability);
    expect(picked?.id).toBe(2);
  });

  it("retorna o único disponível mesmo com apenas 1 candidato", () => {
    const users = [makeUser(1, "Ana")];
    const availability: UserAvailabilityMap = new Map([
      [1, { available: true }],
    ]);

    const picked = pickNextUserWithAvailability(users, [], availability);
    expect(picked?.id).toBe(1);
  });

  it("consistência: chamadas consecutivas distribuem entre disponíveis", () => {
    const users = [makeUser(1, "Ana"), makeUser(2, "Bruno"), makeUser(3, "Carla")];
    const availability: UserAvailabilityMap = new Map([
      [1, { available: true }],
      [2, { available: true }],
      [3, { available: true }],
    ]);

    const queueRecords: QueueRecord[] = [];
    const picks: number[] = [];

    // Simula 6 atribuições consecutivas — queueRecords é mutado in-place por pickNextUser
    for (let i = 0; i < 6; i++) {
      const picked = pickNextUserWithAvailability(users, queueRecords, availability);
      expect(picked).not.toBeNull();
      picks.push(picked!.id);
    }

    // Cada usuário deve ter recebido 2 atribuições (round-robin justo)
    const counts = new Map<number, number>();
    for (const id of picks) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    expect(counts.get(1)).toBe(2);
    expect(counts.get(2)).toBe(2);
    expect(counts.get(3)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// pickNextUser (round-robin puro — regressão)
// ---------------------------------------------------------------------------

describe("pickNextUser (regressão round-robin)", () => {
  it("prioriza quem nunca recebeu caso (sem queue record)", () => {
    const users = [makeUser(1, "Ana"), makeUser(2, "Bruno")];
    const queueRecords = [makeQueueRecord(1, 3, "2026-03-03T10:00:00Z")];

    const picked = pickNextUser(users, queueRecords);
    expect(picked.id).toBe(2); // Bruno nunca recebeu
  });

  it("prioriza quem tem menos atribuições quando timestamps iguais", () => {
    const users = [makeUser(1, "Ana"), makeUser(2, "Bruno")];
    const ts = "2026-03-03T10:00:00Z";
    const queueRecords = [
      makeQueueRecord(1, 10, ts),
      makeQueueRecord(2, 3, ts),
    ];

    const picked = pickNextUser(users, queueRecords);
    expect(picked.id).toBe(2);
  });

  it("desempata por ID quando tudo igual", () => {
    const users = [makeUser(5, "Eve"), makeUser(3, "Carla")];
    const ts = "2026-03-03T10:00:00Z";
    const queueRecords = [
      makeQueueRecord(5, 1, ts),
      makeQueueRecord(3, 1, ts),
    ];

    const picked = pickNextUser(users, queueRecords);
    expect(picked.id).toBe(3); // menor ID
  });

  it("muta queueRecords in-place para batch consecutivo", () => {
    const users = [makeUser(1, "Ana"), makeUser(2, "Bruno")];
    const queueRecords: QueueRecord[] = [];

    const first = pickNextUser(users, queueRecords);
    const second = pickNextUser(users, queueRecords);

    expect(first.id).not.toBe(second.id);
  });
});
