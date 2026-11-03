/**
 * Solar-term badge for the conversation header.
 *
 * Renders the current 24-solar-term name and the countdown to the next one in
 * \`conversation.header.leading\`, the resident top-left seat of the main panel,
 * above every Session.
 *
 * The bundle is hand-written in the lazy-CJS shape the client module system
 * expects: loading the file only registers this factory; every side effect —
 * the stylesheet included — runs when the factory is materialized.
 *
 * The term instants come from VSOP87D (Earth's heliocentric longitude, Meeus
 * Table 32.a) reduced to the Sun's apparent geocentric longitude, then solved
 * by Newton iteration for each multiple of 15°. Delta-T (TT − UT) is applied
 * so the printed clock times match published almanacs to about a minute.
 */
window.__ModuleLoader__.load({
	id: "dsh-solar-term",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");
		const h = React.createElement;

		//#region astronomy
		/** Degrees → radians. */
		const RAD = Math.PI / 180;
		/** Unix epoch as a Julian Day number. */
		const UNIX_EPOCH_JD = 2440587.5;
		/** Milliseconds in one day. */
		const DAY_MS = 86400000;
		/** TT − UT in seconds; flat enough around the 2020s for minute accuracy. */
		const DELTA_T = 69;
		/** Mean solar motion, degrees per day, used as the Newton step size. */
		const SUN_SPEED = 0.9856473;

		/** @param value - any angle in degrees. @returns the same angle in [0, 360). */
		function norm360(value) {
			const wrapped = value % 360;
			return wrapped < 0 ? wrapped + 360 : wrapped;
		}

		/** @param jd - Julian Day (UTC). @returns milliseconds since the Unix epoch. */
		function jdToMillis(jd) {
			return (jd - UNIX_EPOCH_JD) * DAY_MS;
		}

		/** @param millis - milliseconds since the Unix epoch. @returns the Julian Day. */
		function millisToJd(millis) {
			return millis / DAY_MS + UNIX_EPOCH_JD;
		}

		/** VSOP87D Earth heliocentric longitude, Meeus Table 32.a; amplitudes are 1e-8 rad. */
		const VSOP_L = [
			[[175347046,0,0],[3341656,4.6692568,6283.07585],[34894,4.6261,12566.1517],[3497,2.7441,5753.3849],
			 [3418,2.8289,3.5231],[3136,3.6277,77713.7715],[2676,4.4181,7860.4194],[2343,6.1352,3930.2097],
			 [1324,0.7425,11506.7698],[1273,2.0371,529.691],[1199,1.1096,1577.3435],[990,5.233,5884.927],
			 [902,2.045,26.298],[857,3.508,398.149],[780,1.179,5223.694],[753,2.533,5507.553],
			 [505,4.583,18849.228],[492,4.205,775.523],[357,2.92,0.067],[317,5.849,11790.629],
			 [284,1.899,796.298],[271,0.315,10977.079],[243,0.345,5486.778],[206,4.806,2544.314],
			 [205,1.869,5573.143],[202,2.458,6069.777],[156,0.833,213.299],[132,3.411,2942.463],
			 [126,1.083,20.775],[115,0.645,0.98],[103,0.636,4694.003],[102,0.976,15720.839],
			 [102,4.267,7.114],[99,6.21,2146.17],[98,0.68,155.42],[86,5.98,161000.69],
			 [85,1.3,6275.96],[85,3.67,71430.7],[80,1.81,17260.15],[79,3.04,12036.46],
			 [75,1.76,5088.63],[74,3.5,3154.69],[74,4.68,801.82],[70,0.83,9437.76],
			 [62,3.98,8827.39],[61,1.82,7084.9],[57,2.78,6286.6],[56,4.39,14143.5],
			 [56,3.47,6279.55],[52,0.19,12139.55],[52,1.33,1748.02],[51,0.28,5856.48],
			 [49,0.49,1194.45],[41,5.37,8429.24],[41,2.4,19651.05],[39,6.17,10447.39],
			 [37,6.04,10213.29],[37,2.57,1059.38],[36,1.71,2352.87],[36,1.78,6812.77],
			 [33,0.59,17789.85],[30,0.44,83996.85],[30,2.74,1349.87],[25,3.16,4690.48]],
			[[628331966747,0,0],[206059,2.678235,6283.07585],[4303,2.6351,12566.1517],[425,1.59,3.523],
			 [119,5.796,26.298],[109,2.966,1577.344],[93,2.59,18849.23],[72,1.14,529.69],
			 [68,1.87,398.15],[67,4.41,5507.55],[59,2.89,5223.69],[56,2.17,155.42],
			 [45,0.4,796.3],[36,0.47,775.52],[29,2.65,7.11],[21,5.34,0.98],
			 [19,1.85,5486.78],[19,4.97,213.3],[17,2.99,6275.96],[16,0.03,2544.31],
			 [16,1.43,2146.17],[15,1.21,10977.08],[12,2.83,1748.02],[12,3.26,5088.63],
			 [12,5.27,1194.45],[12,2.08,4694],[11,0.77,553.57],[10,1.3,6286.6],
			 [10,4.24,1349.87],[9,2.7,242.73],[9,5.64,951.72],[8,5.3,2352.87],
			 [6,2.65,9437.76],[6,4.67,4690.48]],
			[[52919,0,0],[8720,1.0721,6283.0758],[309,0.867,12566.152],[27,0.05,3.52],
			 [16,5.19,26.3],[16,3.68,155.42],[10,0.76,18849.23],[9,2.06,77713.77],
			 [7,0.83,775.52],[5,4.66,1577.34],[4,1.03,7.11],[4,3.44,5573.14],
			 [3,5.14,796.3],[3,6.05,5507.55],[3,1.19,242.73],[3,6.12,529.69],
			 [3,0.31,398.15],[3,2.28,553.57],[2,4.38,5223.69],[2,3.75,0.98]],
			[[289,5.844,6283.076],[35,0,0],[17,5.49,12566.15],[3,5.2,155.42],
			 [1,4.72,3.52],[1,5.3,18849.23],[1,5.97,242.73]],
			[[114,3.142,0],[8,4.13,6283.08],[1,3.84,12566.15]],
			[[1,3.14,0]]
		];

		/** The 24 terms in ecliptic-longitude order, starting at 315° (立春). */
		const TERMS = [
			{ deg: 315, zh: "立春", en: "Start of Spring" },
			{ deg: 330, zh: "雨水", en: "Rain Water" },
			{ deg: 345, zh: "惊蛰", en: "Awakening of Insects" },
			{ deg: 0,   zh: "春分", en: "Spring Equinox" },
			{ deg: 15,  zh: "清明", en: "Pure Brightness" },
			{ deg: 30,  zh: "谷雨", en: "Grain Rain" },
			{ deg: 45,  zh: "立夏", en: "Start of Summer" },
			{ deg: 60,  zh: "小满", en: "Grain Buds" },
			{ deg: 75,  zh: "芒种", en: "Grain in Ear" },
			{ deg: 90,  zh: "夏至", en: "Summer Solstice" },
			{ deg: 105, zh: "小暑", en: "Minor Heat" },
			{ deg: 120, zh: "大暑", en: "Major Heat" },
			{ deg: 135, zh: "立秋", en: "Start of Autumn" },
			{ deg: 150, zh: "处暑", en: "End of Heat" },
			{ deg: 165, zh: "白露", en: "White Dew" },
			{ deg: 180, zh: "秋分", en: "Autumn Equinox" },
			{ deg: 195, zh: "寒露", en: "Cold Dew" },
			{ deg: 210, zh: "霜降", en: "Frost Descent" },
			{ deg: 225, zh: "立冬", en: "Start of Winter" },
			{ deg: 240, zh: "小雪", en: "Minor Snow" },
			{ deg: 255, zh: "大雪", en: "Major Snow" },
			{ deg: 270, zh: "冬至", en: "Winter Solstice" },
			{ deg: 285, zh: "小寒", en: "Minor Cold" },
			{ deg: 300, zh: "大寒", en: "Major Cold" }
		];

		/** Accent colours per season, keyed by the term's position in the year. */
		const SEASON_COLORS = ["#5f9e6e", "#c99a3f", "#c9713f", "#5c86a8"];
		/** Season labels handed to the stylesheet as \`data-season\`. */
		const SEASON_NAMES = ["spring", "summer", "autumn", "winter"];

		/** @param terms - one VSOP87 series block. @param tau - Julian millennia from J2000.0. @returns the block's radians. */
		function vsopSum(terms, tau) {
			let total = 0;
			for (let i = 0; i < terms.length; i += 1) {
				const term = terms[i];
				total += term[0] * Math.cos(term[1] + term[2] * tau);
			}
			return total;
		}

		/**
		 * Apparent geocentric longitude of the Sun for a Julian Day in TT.
		 * @param jd - Julian Day on the TT scale.
		 * @returns degrees in [0, 360), true equinox of date.
		 */
		function sunLongitude(jd) {
			const tau = (jd - 2451545) / 365250;
			let longitude = 0;
			for (let i = VSOP_L.length - 1; i >= 0; i -= 1) {
				longitude = longitude * tau + vsopSum(VSOP_L[i], tau);
			}
			longitude = (longitude / 1e8) / RAD + 180;
			const centuries = tau * 10;
			const omega = (125.04452 - 1934.136261 * centuries) * RAD;
			const meanSun = (280.4665 + 36000.7698 * centuries) * RAD;
			const meanMoon = (218.3165 + 481267.8813 * centuries) * RAD;
			const nutation = -17.2 * Math.sin(omega) - 1.32 * Math.sin(2 * meanSun)
				- 0.23 * Math.sin(2 * meanMoon) + 0.21 * Math.sin(2 * omega);
			const aberration = -20.4898 / 1.000001018;
			const frame = -0.09033;
			return norm360(longitude + (nutation + aberration + frame) / 3600);
		}

		/**
		 * Solve the instant when the Sun's apparent longitude equals a target.
		 * @param target - target longitude in degrees.
		 * @param guess - Julian Day near the answer.
		 * @returns the Julian Day on the TT scale.
		 */
		function solveLongitude(target, guess) {
			let jd = guess;
			for (let step = 0; step < 10; step += 1) {
				let delta = sunLongitude(jd) - target;
				delta = ((delta + 180) % 360 + 360) % 360 - 180;
				const shift = delta / SUN_SPEED;
				jd -= shift;
				if (Math.abs(shift) < 1e-7) break;
			}
			return jd;
		}

		/** @param deg - the term's ecliptic longitude. @returns its index in TERMS. */
		function termIndex(deg) {
			return Math.round(norm360(deg - 315) / 15) % 24;
		}

		/** @param millis - local wall-clock instant in milliseconds. @returns the local calendar-day number. */
		function localDay(millis) {
			const date = new Date(millis);
			return Math.floor((millis - date.getTimezoneOffset() * 60000) / DAY_MS);
		}

		/**
		 * Current term, next term, and the local-day countdown between them.
		 * @param millis - the instant to describe.
		 * @returns current and next term records with their Date instants.
		 */
		function termWindow(millis) {
			const jdNow = millisToJd(millis);
			const lambda = sunLongitude(jdNow);
			const current = TERMS[termIndex(Math.floor(lambda / 15) * 15)];
			const next = TERMS[(termIndex(current.deg) + 1) % 24];
			const currentJd = solveLongitude(current.deg, jdNow - 1);
			const nextJd = solveLongitude(next.deg, jdNow + 14);
			const currentAt = jdToMillis(currentJd) - DELTA_T * 1000;
			const nextAt = jdToMillis(nextJd) - DELTA_T * 1000;
			return {
				current,
				next,
				currentAt,
				nextAt,
				season: Math.floor(termIndex(current.deg) / 6),
				days: localDay(nextAt) - localDay(millis),
				progress: Math.max(0, Math.min(1, (millis - currentAt) / Math.max(1, nextAt - currentAt)))
			};
		}
		//#endregion

		//#region styles
		const PLUGIN_ID = "dsh-solar-term";
		const STYLE_ID = PLUGIN_ID + "/style.css";
		const css = [
			".dsh-st{--dsh-st-accent:#c9713f;display:flex;align-items:center;gap:9px;box-sizing:border-box;min-width:128px;max-width:210px;margin:12px 0 10px;padding:5px 11px 5px 8px;border-radius:calc(var(--dsw-radius-md,8px) + 2px);border:1px solid color-mix(in oklab,var(--dsw-alias-label-primary,#111) 12%,transparent);background:color-mix(in oklab,var(--dsw-alias-bg-layer-1,#fff) 58%,transparent);-webkit-backdrop-filter:blur(16px) saturate(1.25);backdrop-filter:blur(16px) saturate(1.25);color:var(--dsw-alias-label-primary,#111);line-height:1.2;font-variant-numeric:tabular-nums;-webkit-user-select:none;user-select:none}",
			".dsh-st-ink{flex:none;width:3px;height:26px;border-radius:99px;background:var(--dsh-st-accent);box-shadow:0 0 9px color-mix(in oklab,var(--dsh-st-accent) 55%,transparent)}",
			".dsh-st-body{display:flex;flex-direction:column;gap:3px;min-width:0}",
			".dsh-st-top{display:flex;align-items:baseline;gap:10px;justify-content:space-between}",
			".dsh-st-name{font-size:16px;font-weight:650;letter-spacing:.09em;white-space:nowrap;color:var(--dsw-alias-label-primary,#111)}",
			".dsh-st-date{font-size:10px;letter-spacing:.02em;white-space:nowrap;color:var(--dsw-alias-label-tertiary,#8a8a92)}",
			".dsh-st-next{display:flex;align-items:baseline;gap:4px;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--dsw-alias-label-secondary,#6b6b73)}",
			".dsh-st-next-name{font-weight:600;letter-spacing:.05em;color:var(--dsw-alias-label-primary,#111)}",
			".dsh-st-days{font-weight:700;color:var(--dsh-st-accent)}",
			".dsh-st-today{font-weight:600;color:var(--dsh-st-accent)}",
			"@media (max-width:900px){.dsh-st{min-width:0}.dsh-st-date{display:none}}"
		].join("\n");

		/** Install the stylesheet once and hand back its removal. @returns the disposer. */
		function mountStyles() {
			if (typeof document === "undefined") return function () {};
			const existing = document.querySelector("style[data-plugin-css=" + JSON.stringify(STYLE_ID) + "]");
			if (existing !== null) return function () {};
			const tag = document.createElement("style");
			tag.dataset.plugin = PLUGIN_ID;
			tag.dataset.pluginCss = STYLE_ID;
			tag.textContent = css;
			document.head.appendChild(tag);
			return function () { tag.remove(); };
		}
		//#endregion

		//#region component
		/** @returns the active UI language tag, never empty. */
		function activeLanguage(ctx) {
			try {
				const snapshot = ctx.locale.getSnapshot();
				const active = snapshot && (snapshot.active || snapshot.locale || snapshot.language);
				if (typeof active === "string" && active !== "") return active.toLowerCase();
			} catch (error) {}
			try {
				if (typeof navigator !== "undefined" && typeof navigator.language === "string") return navigator.language.toLowerCase();
			} catch (error) {}
			return "en";
		}

		/** Copy for the two shipped UI languages. */
		const COPY = {
			zh: {
				next: "还有",
				days: "天",
				today: "就是今天",
				date: { month: "long", day: "numeric" },
				title: "二十四节气"
			},
			en: {
				next: "in",
				days: "days",
				today: "today",
				date: { month: "short", day: "numeric" },
				title: "Solar term"
			}
		};

		/** @param locale - a lowercase language tag. @returns its copy block. */
		function copyFor(locale) {
			return locale.indexOf("zh") === 0 ? COPY.zh : COPY.en;
		}

		/** @param locale - a lowercase language tag. @returns the BCP 47 tag Intl accepts. */
		function intlLocale(locale) {
			return locale.indexOf("zh") === 0 ? "zh-CN" : "en-US";
		}

		/** @param term - a TERMS entry. @param locale - active language tag. @returns the displayed name. */
		function termName(term, locale) {
			return locale.indexOf("zh") === 0 ? term.zh : term.en;
		}

		/** @param millis - an instant. @param locale - active language tag. @returns a short local date. */
		function shortDate(millis, locale) {
			try {
				return new Intl.DateTimeFormat(intlLocale(locale), copyFor(locale).date).format(new Date(millis));
			} catch (error) {
				return new Date(millis).toLocaleDateString();
			}
		}

		/** @param millis - an instant. @param locale - active language tag. @returns a local date and minute. */
		function stamp(millis, locale) {
			try {
				return new Intl.DateTimeFormat(intlLocale(locale), {
					month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false
				}).format(new Date(millis));
			} catch (error) {
				return new Date(millis).toLocaleString();
			}
		}

		/** @returns the UTC offset label, such as UTC+08:00. */
		function offsetLabel() {
			const minutes = -new Date().getTimezoneOffset();
			const sign = minutes < 0 ? "-" : "+";
			const absolute = Math.abs(minutes);
			return "UTC" + sign + String(Math.floor(absolute / 60)).padStart(2, "0") + ":" + String(absolute % 60).padStart(2, "0");
		}

		/** Build the header badge bound to one plugin context. @param ctx - client plugin context. @returns the React component. */
		function createBadge(ctx) {
			return function SolarTerm() {
				const [now, setNow] = React.useState(function () { return Date.now(); });

				React.useEffect(function () {
					const tick = function () { setNow(Date.now()); };
					const timer = window.setInterval(tick, 30000);
					const onVisible = function () {
						if (document.visibilityState === "visible") tick();
					};
					document.addEventListener("visibilitychange", onVisible);
					return function () {
						window.clearInterval(timer);
						document.removeEventListener("visibilitychange", onVisible);
					};
				}, []);

				const locale = activeLanguage(ctx);
				const copy = copyFor(locale);
				const info = termWindow(now);
				const name = termName(info.current, locale);
				const nextName = termName(info.next, locale);
				const accent = SEASON_COLORS[info.season];
				const days = info.days;
				const unit = copy.days;

				const countdown = days === 0
					? h("span", { className: "dsh-st-today", key: "today" }, copy.today)
					: h(React.Fragment, { key: "days" }, [
						h("span", { className: "dsh-st-next-name", key: "name" }, nextName),
						h("span", { key: "gap" }, copy.next),
						h("span", { className: "dsh-st-days", key: "count" }, String(days)),
						h("span", { key: "unit" }, unit)
					]);

				const title = [
					name + " · " + stamp(info.currentAt, locale),
					nextName + " · " + stamp(info.nextAt, locale),
					offsetLabel()
				].join("\n");

				return h("div", {
					className: "dsh-st",
					"data-season": SEASON_NAMES[info.season],
					style: { "--dsh-st-accent": accent },
					title: title,
					"aria-label": copy.title + ": " + name + ", " + nextName + " " + (days === 0 ? copy.today : copy.next + " " + days + " " + unit)
				}, [
					h("span", { className: "dsh-st-ink", key: "ink", "aria-hidden": true }),
					h("div", { className: "dsh-st-body", key: "body" }, [
						h("div", { className: "dsh-st-top", key: "top" }, [
							h("span", { className: "dsh-st-name", key: "name" }, name),
							h("span", { className: "dsh-st-date", key: "date" }, shortDate(info.currentAt, locale))
						]),
						h("div", { className: "dsh-st-next", key: "next" }, countdown)
					])
				]);
			};
		}
		//#endregion

		//#region plugin
		/** Services the badge needs before it may render. */
		const inject = ["slots", "locale"];

		/** Register the badge in the conversation header's leading seat. @param ctx - client plugin context. */
		function apply(ctx) {
			ctx.effect(mountStyles, PLUGIN_ID + ": styles");
			const Badge = createBadge(ctx);
			ctx.effect(function () {
				return ctx.slots.inject("conversation.header.leading", function () {
					return ctx.slots.register({
						name: "conversation.header.leading",
						id: "solar-term",
						order: 0
					}, Badge);
				});
			}, PLUGIN_ID + ": header badge");
		}
		//#endregion

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
