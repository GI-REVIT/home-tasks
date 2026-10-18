// לוח עברי וחגי ישראל. החישוב נשען על הלוח העברי המובנה בדפדפן (Intl), החגים לפי כללים.
(function () {
  const enFormat = new Intl.DateTimeFormat("en-u-ca-hebrew", { day: "numeric", month: "long", year: "numeric" });
  const heMonthFormat = new Intl.DateTimeFormat("he-u-ca-hebrew", { month: "long" });
  const partsCache = new Map();

  const LETTERS = [
    [400, "ת"], [300, "ש"], [200, "ר"], [100, "ק"], [90, "צ"], [80, "פ"], [70, "ע"], [60, "ס"],
    [50, "נ"], [40, "מ"], [30, "ל"], [20, "כ"], [10, "י"], [9, "ט"], [8, "ח"], [7, "ז"],
    [6, "ו"], [5, "ה"], [4, "ד"], [3, "ג"], [2, "ב"], [1, "א"],
  ];

  // מספר באותיות עבריות, למשל 16 -> ט״ז, 787 -> תשפ״ז.
  function gematriya(n) {
    let s = "";
    let rest = n;
    while (rest > 0) {
      if (rest === 15) { s += "טו"; break; }
      if (rest === 16) { s += "טז"; break; }
      for (const [value, letter] of LETTERS) {
        if (rest >= value) { s += letter; rest -= value; break; }
      }
    }
    return s.length === 1 ? s + "׳" : s.slice(0, -1) + "״" + s.slice(-1);
  }

  function parts(iso) {
    let cached = partsCache.get(iso);
    if (cached) return cached;
    const dt = Dates.toDate(iso);
    const get = (type) => enFormat.formatToParts(dt).find((p) => p.type === type).value;
    cached = {
      day: Number(get("day")),
      month: get("month"), // Tishri, Heshvan, Kislev, Tevet, Shevat, Adar, Adar I, Adar II, Nisan, ...
      year: Number(get("year")),
      monthHe: heMonthFormat.format(dt),
      weekday: Dates.weekday(iso),
    };
    partsCache.set(iso, cached);
    return cached;
  }

  function dayLetters(iso) {
    return gematriya(parts(iso).day);
  }

  function yearLetters(iso) {
    return gematriya(parts(iso).year % 1000);
  }

  function monthYear(iso) {
    const p = parts(iso);
    return `${p.monthHe} ${gematriya(p.year % 1000)}`;
  }

  // "ט״ז בתשרי"
  function short(iso) {
    const p = parts(iso);
    return `${gematriya(p.day)} ב${p.monthHe}`;
  }

  // "ט״ז בתשרי תשפ״ז"
  function format(iso) {
    return `${short(iso)} ${yearLetters(iso)}`;
  }

  // ---------- חגים ומועדים (לפי לוח ישראל) ----------

  function holidays(iso) {
    const p = parts(iso);
    const d = p.day;
    const wd = p.weekday; // 0 = ראשון ... 6 = שבת
    const out = [];
    const add = (id, name, kind) => out.push({ id, name, kind });

    switch (p.month) {
      case "Elul":
        if (d === 29) add("erev-rosh-hashana", "ערב ראש השנה", "erev");
        break;
      case "Tishri":
        if (d === 1 || d === 2) add("rosh-hashana", "ראש השנה", "yomtov");
        if ((d === 3 && wd !== 6) || (d === 4 && wd === 0)) add("tzom-gedaliah", "צום גדליה", "fast");
        if (d === 9) add("erev-yom-kippur", "ערב יום כיפור", "erev");
        if (d === 10) add("yom-kippur", "יום כיפור", "yomtov");
        if (d === 14) add("erev-sukkot", "ערב סוכות", "erev");
        if (d === 15) add("sukkot-1", "סוכות", "yomtov");
        if (d >= 16 && d <= 20) add("sukkot-chol", "חול המועד סוכות", "chol");
        if (d === 21) add("hoshana-raba", "הושענא רבה", "chol");
        if (d === 22) add("shmini-atzeret", "שמיני עצרת ושמחת תורה", "yomtov");
        break;
      case "Kislev":
        if (d >= 25) add("chanukah", "חנוכה", "minor");
        break;
      case "Tevet": {
        if (d === 10) add("asara-btevet", "עשרה בטבת", "fast");
        if (d <= 3) {
          const kislevLength = parts(Dates.addDays(iso, -d)).day;
          if (kislevLength - 24 + d <= 8) add("chanukah", "חנוכה", "minor");
        }
        break;
      }
      case "Shevat":
        if (d === 15) add("tu-bishvat", "ט״ו בשבט", "minor");
        break;
      case "Adar I":
        if (d === 14) add("purim-katan", "פורים קטן", "minor");
        break;
      case "Adar":
      case "Adar II":
        if ((d === 13 && wd !== 6) || (d === 11 && wd === 4)) add("taanit-esther", "תענית אסתר", "fast");
        if (d === 14) add("purim", "פורים", "minor");
        if (d === 15) add("shushan-purim", "שושן פורים", "minor");
        break;
      case "Nisan":
        if (d === 14) add("erev-pesach", "ערב פסח", "erev");
        if (d === 15) add("pesach-1", "פסח", "yomtov");
        if (d >= 16 && d <= 20) add("pesach-chol", "חול המועד פסח", "chol");
        if (d === 21) add("pesach-7", "שביעי של פסח", "yomtov");
        // יום השואה: ב-27 בניסן; אם חל ביום שישי מוקדם ליום חמישי, ואם חל ביום ראשון נדחה ליום שני.
        if ((d === 27 && wd !== 5 && wd !== 0) || (d === 26 && wd === 4) || (d === 28 && wd === 1)) {
          add("yom-hashoah", "יום השואה", "memorial");
        }
        break;
      case "Iyar": {
        // יום העצמאות: ה' באייר, עם הקדמה או דחייה כשהוא חל בשישי, בשבת או בשני.
        const weekdayOfFifth = (((wd + (5 - d)) % 7) + 7) % 7;
        let independence = 5;
        if (weekdayOfFifth === 5) independence = 4;
        else if (weekdayOfFifth === 6) independence = 3;
        else if (weekdayOfFifth === 1) independence = 6;
        if (d === independence - 1) add("yom-hazikaron", "יום הזיכרון", "memorial");
        if (d === independence) add("yom-haatzmaut", "יום העצמאות", "memorial");
        if (d === 18) add("lag-baomer", "ל״ג בעומר", "minor");
        if (d === 28) add("yom-yerushalayim", "יום ירושלים", "memorial");
        break;
      }
      case "Sivan":
        if (d === 5) add("erev-shavuot", "ערב שבועות", "erev");
        if (d === 6) add("shavuot", "שבועות", "yomtov");
        break;
      case "Tamuz":
        if ((d === 17 && wd !== 6) || (d === 18 && wd === 0)) add("tzom-tammuz", "י״ז בתמוז", "fast");
        break;
      case "Av":
        if ((d === 9 && wd !== 6) || (d === 10 && wd === 0)) add("tisha-bav", "תשעה באב", "fast");
        if (d === 15) add("tu-bav", "ט״ו באב", "minor");
        break;
    }

    if (d === 30 || (d === 1 && p.month !== "Tishri")) add("rosh-chodesh", "ראש חודש", "rc");
    return out;
  }

  // ---------- ניווט בין חודשים עבריים ----------

  function monthStart(iso) {
    return Dates.addDays(iso, 1 - parts(iso).day);
  }

  function monthLength(startIso) {
    for (let i = 29; i <= 30; i++) {
      if (parts(Dates.addDays(startIso, i)).day === 1) return i;
    }
    return 30;
  }

  function nextMonthStart(iso) {
    return Dates.addDays(monthStart(iso), monthLength(monthStart(iso)));
  }

  function prevMonthStart(iso) {
    return monthStart(Dates.addDays(monthStart(iso), -1));
  }

  window.Hebrew = {
    gematriya, parts, dayLetters, yearLetters, monthYear, short, format, holidays,
    monthStart, monthLength, nextMonthStart, prevMonthStart,
  };
})();
