(function (global) {
  const { DateTime } = luxon;

  const monthNames = {
    JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
    JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12
  };

  const dayNames = {
    SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6
  };

  function range(min, max, step = 1) {
    const arr = [];
    for (let i = min; i <= max; i += step) arr.push(i);
    return arr;
  }

  function normalizeToken(token, names) {
    const upper = token.toUpperCase();
    if (names && names[upper] !== undefined) return names[upper];
    const n = parseInt(token, 10);
    if (!Number.isNaN(n)) return n;
    return token;
  }

  function parseField(field, { min, max, names, allowQuestion = false, allowLast = false, allowNth = false }) {
    const raw = field;
    if (field === undefined) return { any: true, values: new Set(range(min, max)), raw };
    if (field === "*" || (allowQuestion && field === "?")) {
      return { any: true, values: new Set(range(min, max)), ignore: field === "?", raw };
    }

    let last = false;
    if (allowLast && field === "L") {
      last = true;
    }

    let nth = null;
    if (allowNth && field.includes("#")) {
      const [w, n] = field.split("#");
      nth = { weekday: normalizeToken(w, names), nth: parseInt(n, 10) };
    }

    const values = new Set();
    field.split(",").forEach((part) => {
      if (!part) return;
      let token = part;
      let step = 1;
      if (part.includes("/")) {
        const [base, s] = part.split("/");
        token = base;
        step = parseInt(s, 10) || 1;
      }
      let start, end;
      if (token === "*") {
        start = min;
        end = max;
      } else if (token.includes("-")) {
        const [a, b] = token.split("-");
        start = normalizeToken(a, names);
        end = normalizeToken(b, names);
      } else {
        start = normalizeToken(token, names);
        end = start;
      }
      if (typeof start === "number" && typeof end === "number") {
        const stepRange = range(start, end, step).filter((v) => v >= min && v <= max);
        stepRange.forEach((v) => values.add(v === 7 && names === dayNames ? 0 : v));
      }
    });

    if (!values.size && !last && !nth) {
      // fallback to full range to avoid empty set breaking matching
      range(min, max).forEach((v) => values.add(v));
    }

    return { any: values.size === (max - min + 1), values, last, nth, raw };
  }

  function matches(dateTime, fields) {
    const sec = dateTime.second;
    const min = dateTime.minute;
    const hour = dateTime.hour;
    const dom = dateTime.day;
    const month = dateTime.month;
    const dow = dateTime.weekday % 7; // 0=Sunday
    const year = dateTime.year;

    const lastDay = dateTime.endOf("month").day;

    const check = (value, field, ctx) => {
      if (!field) return true;
      if (field.ignore) return true;
      if (field.last && ctx === "dom") return value === lastDay;
      if (field.nth && ctx === "dow") {
        const desired = field.nth.weekday === 7 ? 0 : field.nth.weekday;
        return isNthWeekday(dateTime, desired, field.nth.nth);
      }
      if (field.any) return true;
      return field.values.has(value);
    };

    return (
      check(sec, fields.second, "sec") &&
      check(min, fields.minute, "min") &&
      check(hour, fields.hour, "hour") &&
      check(dom, fields.dom, "dom") &&
      check(month, fields.month, "month") &&
      check(dow, fields.dow, "dow") &&
      check(year, fields.year, "year")
    );
  }

  function isNthWeekday(dateTime, weekday, nth) {
    const firstDay = dateTime.startOf("month");
    let firstWeekday = firstDay.weekday % 7;
    let day = 1 + ((weekday - firstWeekday + 7) % 7);
    day += (nth - 1) * 7;
    return day === dateTime.day;
  }

  function parseFields(expr) {
    const parts = expr.trim().split(/\s+/);
    if (parts.length < 5 || parts.length > 7) {
      throw new Error("欄位數不正確，請確認 Cron 格式");
    }
    let sec = "0", min, hour, dom, month, dow, year = "*";
    if (parts.length === 5) {
      [min, hour, dom, month, dow] = parts;
    } else if (parts.length === 6) {
      [sec, min, hour, dom, month, dow] = parts;
    } else {
      [sec, min, hour, dom, month, dow, year] = parts;
    }

    const fields = {
      second: parseField(sec, { min: 0, max: 59 }),
      minute: parseField(min, { min: 0, max: 59 }),
      hour: parseField(hour, { min: 0, max: 23 }),
      dom: parseField(dom, { min: 1, max: 31, allowQuestion: true, allowLast: true }),
      month: parseField(month, { min: 1, max: 12, names: monthNames }),
      dow: parseField(dow, { min: 0, max: 6, names: dayNames, allowQuestion: true, allowNth: true }),
      year: parseField(year, { min: 1970, max: 2099 })
    };

    const fieldStrings = {
      second: sec,
      minute: min,
      hour,
      dayOfMonth: dom,
      month,
      dayOfWeek: dow,
      year
    };

    return { fields, fieldStrings };
  }

  class SimpleCronIterator {
    constructor(expr, options = {}) {
      const { fields, fieldStrings } = parseFields(expr);
      this.fields = fieldStrings;
      this._fields = fields;
      this.tz = options.tz || "UTC";
      const start = options.currentDate ? options.currentDate : new Date();
      this.current = DateTime.fromJSDate(start, { zone: this.tz });
      this._limit = this.current.plus({ years: 2 }); // safety horizon

      const sortedValues = (field) => Array.from(field.values).sort((a, b) => a - b);
      this._allowed = {
        second: sortedValues(fields.second),
        minute: sortedValues(fields.minute),
        hour: sortedValues(fields.hour),
        dom: sortedValues(fields.dom),
        month: sortedValues(fields.month),
        dow: sortedValues(fields.dow),
        year: sortedValues(fields.year)
      };
    }

    next() {
      const check = (dt, field, ctx) => {
        if (!field) return true;
        const lastDay = dt.endOf("month").day;
        const valueMap = {
          sec: dt.second,
          min: dt.minute,
          hour: dt.hour,
          dom: dt.day,
          month: dt.month,
          dow: dt.weekday % 7,
          year: dt.year
        };
        const value = valueMap[ctx];
        if (field.ignore) return true;
        if (field.last && ctx === "dom") return value === lastDay;
        if (field.nth && ctx === "dow") {
          const desired = field.nth.weekday === 7 ? 0 : field.nth.weekday;
          return isNthWeekday(dt, desired, field.nth.nth);
        }
        if (field.any) return true;
        return field.values.has(value);
      };

      let candidate = this.current.plus({ second: 1 });
      let attempts = 0;
      while (candidate < this._limit && attempts < 200000) {
        attempts++;

        if (!check(candidate, this._fields.year, "year")) {
          candidate = candidate.plus({ years: 1 }).startOf("year");
          continue;
        }
        if (!check(candidate, this._fields.month, "month")) {
          candidate = candidate.plus({ months: 1 }).startOf("month");
          continue;
        }
        if (!check(candidate, this._fields.dom, "dom") || !check(candidate, this._fields.dow, "dow")) {
          candidate = candidate.plus({ days: 1 }).startOf("day");
          continue;
        }
        if (!check(candidate, this._fields.hour, "hour")) {
          candidate = candidate.plus({ hours: 1 }).set({ minute: 0, second: 0 });
          continue;
        }
        if (!check(candidate, this._fields.minute, "min")) {
          candidate = candidate.plus({ minutes: 1 }).set({ second: 0 });
          continue;
        }

        const nextSec = this._allowed.second.find((s) => s >= candidate.second);
        if (nextSec === undefined) {
          candidate = candidate.plus({ minutes: 1 }).set({ second: 0 });
          continue;
        }

        candidate = candidate.set({ second: nextSec });
        if (matches(candidate, this._fields)) {
          this.current = candidate;
          return { value: { toDate: () => candidate.toJSDate(), getTime: () => candidate.toMillis() }, done: false };
        }

        candidate = candidate.plus({ second: 1 });
      }

      throw new Error("找不到下一個時間，請檢查表達式或改用較短的週期");
    }
  }

  const cronLite = {
    parseExpression: (expr, options = {}) => new SimpleCronIterator(expr, options)
  };

  global.cronParser = cronLite;
})(window);
