// תאריכים וחוקי חזרתיות. כל התאריכים הם מחרוזות "YYYY-MM-DD" בשעון המקומי.
(function () {
  const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function parse(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return { y, m, d };
  }

  function daysInMonth(y, m) {
    return new Date(y, m, 0).getDate();
  }

  // בונה תאריך; חודש שחורג מ-1..12 מנורמל, ויום שחורג מסוף החודש מוקטן לסוף החודש.
  function build(y, m, d) {
    const total = y * 12 + (m - 1);
    const yy = Math.floor(total / 12);
    const mm = (total % 12) + 1;
    return `${yy}-${pad(mm)}-${pad(Math.min(d, daysInMonth(yy, mm)))}`;
  }

  // תאריך בשעה 12:00, כדי שמעבר שעון קיץ לא יזיז יום.
  function toDate(iso) {
    const { y, m, d } = parse(iso);
    return new Date(y, m - 1, d, 12);
  }

  function fromDate(dt) {
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  }

  function todayISO() {
    return fromDate(new Date());
  }

  function addDays(iso, n) {
    const dt = toDate(iso);
    dt.setDate(dt.getDate() + n);
    return fromDate(dt);
  }

  function addMonths(iso, n) {
    const { y, m, d } = parse(iso);
    return build(y, m + n, d);
  }

  function addYears(iso, n) {
    const { y, m, d } = parse(iso);
    return build(y + n, m, d);
  }

  function daysBetween(a, b) {
    return Math.round((toDate(b) - toDate(a)) / 86400000);
  }

  function weekday(iso) {
    return toDate(iso).getDay(); // 0 = ראשון
  }

  function formatDate(iso) {
    const { y, m, d } = parse(iso);
    return `${pad(d)}/${pad(m)}/${y}`;
  }

  function dayLabel(iso) {
    const { m, d } = parse(iso);
    return `יום ${DAY_NAMES[weekday(iso)]}, ${pad(d)}/${pad(m)}`;
  }

  // התאריך הראשון בסדרת המשימה שגדול ממש מ-after. הסדרה מעוגנת בתאריך היעד הנוכחי.
  function nextScheduled(task, after) {
    const start = task.due_date;
    const from = after < start ? addDays(start, -1) : after;
    const every = task.recurrence_every || 1;

    switch (task.recurrence_kind) {
      case "daily":
        return addDays(from, 1);
      case "interval": {
        if (after < start) return start;
        const k = Math.floor(daysBetween(start, after) / every) + 1;
        return addDays(start, k * every);
      }
      case "weekly": {
        const days = task.recurrence_days || [];
        if (days.length === 0) return addDays(from, 7);
        for (let i = 1; i <= 7; i++) {
          const d = addDays(from, i);
          if (days.includes(weekday(d))) return d;
        }
        return null;
      }
      case "monthly": {
        if (task.recurrence_calendar === "hebrew") {
          const hebrewDay = task.recurrence_month_day || window.Hebrew.parts(start).day;
          return window.Hebrew.nextMonthlyOccurrence(hebrewDay, from);
        }
        const s = parse(start);
        const day = task.recurrence_month_day || s.d;
        for (let i = 0; i < 1200; i++) {
          const cand = build(s.y, s.m + i, day);
          if (cand > from) return cand;
        }
        return null;
      }
      case "yearly": {
        if (task.recurrence_calendar === "hebrew") {
          const H = window.Hebrew;
          const key = task.recurrence_hebrew_month || H.monthKey(start);
          const day = task.recurrence_month_day || H.parts(start).day;
          return H.nextYearlyOccurrence(key, day, from);
        }
        const s = parse(start);
        for (let i = 0; i < 200; i++) {
          const cand = build(s.y + i, s.m, s.d);
          if (cand > from) return cand;
        }
        return null;
      }
      default:
        return null;
    }
  }

  // המועד הראשון מהיום והלאה (כולל היום) לפי יום בשבוע או יום בחודש שנבחרו.
  function firstOnOrAfter(rule, from) {
    return nextScheduled({ ...rule, due_date: from }, addDays(from, -1));
  }

  // האם תאריך מתאים לבחירה של יום בשבוע או יום בחודש.
  function matchesRule(rule, iso) {
    if (rule.recurrence_kind === "weekly") return (rule.recurrence_days || []).includes(weekday(iso));
    if (rule.recurrence_kind === "monthly") {
      if (rule.recurrence_calendar === "hebrew") return window.Hebrew.matchesMonthDay(rule.recurrence_month_day, iso);
      const { y, m, d } = parse(iso);
      return d === Math.min(rule.recurrence_month_day, daysInMonth(y, m));
    }
    if (rule.recurrence_kind === "yearly" && rule.recurrence_calendar === "hebrew") {
      return window.Hebrew.matchesYearly(rule.recurrence_hebrew_month, rule.recurrence_month_day, iso);
    }
    return false;
  }

  // תאריך היעד החדש אחרי סימון "בוצע" במשימה חוזרת.
  function nextDueDate(task, today) {
    if (task.recurrence_mode === "after_completion") {
      switch (task.recurrence_kind) {
        case "daily":
          return addDays(today, 1);
        case "interval":
          return addDays(today, task.recurrence_every || 1);
        case "weekly":
          return nextScheduled({ ...task, due_date: today }, today);
        case "monthly":
          return addMonths(today, 1);
        case "yearly":
          return addYears(today, 1);
        default:
          return null;
      }
    }
    // לפי לוח: המועד הבא אחרי התאריך המתוכנן וגם אחרי היום. מועדים שהוחמצו מדולגים.
    const after = task.due_date > today ? task.due_date : today;
    return nextScheduled(task, after);
  }

  // כל המועדים של משימה בטווח [from, to]. בחישוב "לפי ביצוע" המועד העתידי לא ידוע, ולכן רק הנוכחי.
  function occurrences(task, from, to) {
    const single = task.due_date >= from && task.due_date <= to ? [task.due_date] : [];
    if (task.type !== "recurring" || task.recurrence_mode === "after_completion" || !task.recurrence_kind) {
      return single;
    }
    const out = [];
    let d = task.due_date >= from ? task.due_date : nextScheduled(task, addDays(from, -1));
    for (let guard = 0; d && d <= to && guard < 500; guard++) {
      out.push(d);
      d = nextScheduled(task, d);
    }
    return out;
  }

  window.Dates = {
    todayISO, addDays, addMonths, addYears, daysBetween, weekday, toDate, daysInMonth,
    formatDate, dayLabel, nextScheduled, nextDueDate, occurrences, firstOnOrAfter, matchesRule, parse,
  };
})();
