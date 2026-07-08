import { db } from "@/lib/db/db";
import type { Habit, HabitCadence } from "@/lib/db/types";
import { queueSync } from "@/lib/sync";
import { mondayOf, fromISO, toISO } from "@/lib/planner/dates";

export async function addHabit(plannerId: string, name: string, cadence: HabitCadence): Promise<Habit> {
  const order = await db.habits.where("plannerId").equals(plannerId).count();
  const habit: Habit = { id: crypto.randomUUID(), plannerId, name, cadence, order, active: true };
  await db.habits.add(habit);
  await queueSync("habits", habit.id, "put");
  return habit;
}

export async function renameHabit(id: string, name: string) {
  await db.habits.update(id, { name });
  await queueSync("habits", id, "put");
}

export async function setHabitCadence(id: string, cadence: HabitCadence) {
  await db.habits.update(id, { cadence });
  await queueSync("habits", id, "put");
}

/** Delete a habit and its checks. */
export async function deleteHabit(id: string) {
  await db.transaction("rw", db.habits, db.habitChecks, async () => {
    await db.habitChecks.where("habitId").equals(id).delete();
    await db.habits.delete(id);
  });
  await queueSync("habits", id, "delete");
}

/** Key date for a check: the day itself (daily) or the week's Monday (weekly). */
export function checkDate(habit: Habit, dayISO: string): string {
  return habit.cadence === "weekly" ? toISO(mondayOf(fromISO(dayISO))) : dayISO;
}

export async function toggleHabitCheck(habit: Habit, dayISO: string): Promise<boolean> {
  const date = checkDate(habit, dayISO);
  const { id, checked } = await db.transaction("rw", db.habitChecks, async () => {
    const existing = await db.habitChecks.where("[habitId+date]").equals([habit.id, date]).first();
    if (existing) {
      await db.habitChecks.update(existing.id, { checked: !existing.checked });
      return { id: existing.id, checked: !existing.checked };
    }
    const id = crypto.randomUUID();
    await db.habitChecks.add({ id, habitId: habit.id, date, checked: true });
    return { id, checked: true };
  });
  await queueSync("habit_checks", id, "put");
  return checked;
}
