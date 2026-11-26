/** Pure helpers for the free-trial wording. No server imports: safe in client components and tests. */
export type TrialLocale = "en" | "ar";

/** "7 days" / "1 day" / "7 أيام" / "يوم واحد" / "يومان" / "11 يومًا". Zero gives a no-trial wording. */
export function trialLabel(days: number, locale: TrialLocale): string {
  const n = Math.max(0, Math.round(days));
  if (locale === "ar") {
    if (n === 0) return "بدون تجربة مجانية";
    if (n === 1) return "يوم واحد";
    if (n === 2) return "يومان";
    return n <= 10 ? `${n} أيام` : `${n} يومًا`;
  }
  if (n === 0) return "no free trial";
  return n === 1 ? "1 day" : `${n} days`;
}

/** Separator inside a dictionary string: `Text with {trialDays} ||0: text used when the trial is 0 days`. */
export const NO_TRIAL_SEP = " ||0: ";

/** Fills {trialDays} (the label) in one string; honours the `||0:` alternative when days = 0. */
export function fillTrialString(s: string, days: number, locale: TrialLocale): string {
  if (!s.includes("{trialDays}") && !s.includes(NO_TRIAL_SEP)) return s;
  const [main, zero] = s.split(NO_TRIAL_SEP);
  const body = days === 0 && zero !== undefined ? zero : main;
  return body.trim().replaceAll("{trialDays}", trialLabel(days, locale));
}

/** Text of the numeric home fact (the value itself is the day count, shown by CountUp). */
export function trialFact(days: number, locale: TrialLocale): { value: number; label: string } {
  if (locale === "ar") {
    if (days === 0) return { value: 0, label: "أيام انتظار: ابدأ الآن ويُخصم من بطاقتك اليوم" };
    if (days === 1) return { value: 1, label: "يوم مجاني في كل باقة، ولا يُخصم من البطاقة إلا بعد التجربة" };
    return { value: days, label: "يومًا مجانًا في كل باقة، ولا يُخصم من البطاقة إلا بعد التجربة" };
  }
  if (days === 0) return { value: 0, label: "days of waiting: start now, card charged today" };
  return { value: days, label: `${days === 1 ? "day" : "days"} free on every plan, card charged only after the trial` };
}
