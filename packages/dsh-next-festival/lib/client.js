/**
 * Next-festival badge and its own plugin-page setting.
 *
 * Two slots, one bundle:
 *
 *   - `shell.overlay` (its own list entry): an independent floating badge
 *     with the next festival for the chosen region, its date, and the days
 *     left. `conversation.header.leading` is a single slot already owned by
 *     dsh-solar-term, so this plugin never registers there: the two plugins
 *     render independently and cannot displace each other.
 *   - `plugins.bundle.config` (keyed by the package name): "Festival region",
 *     shown on this bundle's own page in the sidebar Plugins panel. The page
 *     declares that slot only while it is open, so ctx.slots.inject waits.
 *
 * Everything is local. Fixed, lunar, Islamic, weekday, Easter and solar-term
 * dates are computed here; ethnic and religious festivals that depend on a
 * Tibetan, Dai, Tamil or observational calendar use a published year table and
 * are marked approximate. The region choice lives in localStorage, shared by
 * the two components through a tiny external store.
 *
 * The bundle is hand-written in the lazy-CJS shape the client module system
 * expects: loading the file only registers this factory; every side effect —
 * the stylesheet, listeners, slots — runs when the factory is materialized.
 */
window.__ModuleLoader__.load({
	id: "dsh-next-festival",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");
		const h = React.createElement;

		//#region constants
		const PLUGIN_ID = "dsh-next-festival";
		const NS = "next-festival";
		const STORAGE_KEY = "dsh-next-festival:region";
		const STYLE_ID = PLUGIN_ID + "/style.css";
		const OVERLAY_SLOT = "shell.overlay";
		const CONFIG_SLOT = "plugins.bundle.config";
		const DAY_MS = 86400000;
		const UNIX_EPOCH_JD = 2440587.5;
		const J2000_JD = 2451545.0;
		const RAD = Math.PI / 180;

		const REGIONS = [
			{ id: "cn", name: "中国大陆", en: "Mainland China", zone: "Asia/Shanghai", group: "cn" },
			{ id: "hk", name: "香港", en: "Hong Kong", zone: "Asia/Hong_Kong", group: "cn" },
			{ id: "mo", name: "澳门", en: "Macau", zone: "Asia/Macau", group: "cn" },
			{ id: "tw", name: "台湾", en: "Taiwan", zone: "Asia/Taipei", group: "cn" },
			{ id: "us", name: "美国", en: "United States", zone: "America/New_York", group: "other" },
			{ id: "gb", name: "英国", en: "United Kingdom", zone: "Europe/London", group: "other" },
			{ id: "sg", name: "新加坡", en: "Singapore", zone: "Asia/Singapore", group: "other" },
			{ id: "my", name: "马来西亚", en: "Malaysia", zone: "Asia/Kuala_Lumpur", group: "other" }
		];
		const REGION_IDS = REGIONS.map(function (r) { return r.id; });
		const DEFAULT_REGION = "cn";
		const KIND_RANK = { public: 0, traditional: 1, ethnic: 2, religious: 3 };
		const KIND_COLORS = { public: "#c94f45", traditional: "#c99a3f", ethnic: "#5f9e6e", religious: "#8a72b5" };
		//#endregion

		//#region festival data
		/**
		 * Gregorian dates for calendars we do not compute: Tibetan, Tamil,
		 * Buddhist and observational festivals, plus festival seasons whose date
		 * varies by locality. 2026/2027 entries are published official holiday
		 * dates; later years are third-party calendar estimates. Every entry is
		 * rendered as approximate with "check the official calendar" in the
		 * hover text. A missing year falls back to the festival's `fallback`
		 * rule, if any, or hides the festival rather than inventing a date.
		 *
		 * Sources: Xizang tourism bureau and Lhasa holiday notices, China Tibet
		 * News, Malaysia JPA and PM's Department HKA_2027, Singapore MOM public
		 * holidays, Taiwan Gazette; estimates from gjlysy.com, nongli.info,
		 * udaya.app and holidayfyi. See README.md for the full list.
		 */
		const TABLE_DATES = {
			losar: {
				"2026": "2026-02-18",
				"2027": "2027-02-07",
				"2028": "2028-02-26",
				"2029": "2029-02-12",
				"2030": "2030-03-05"
			},
			shoton: {
				"2026": "2026-08-12",
				"2027": "2027-08-31"
			},
			naadam: {},
			harvest: {},
			thaipusam: {
				"2026": "2026-02-01",
				"2027": "2027-01-22",
				"2028": "2028-02-09",
				"2029": "2029-01-30"
			},
			vesak: {
				"2026": "2026-05-31",
				"2027": "2027-05-20"
			},
			deepavali: {
				"2026": "2026-11-08", // official (MOM / PM's Department)
				"2027": "2027-10-28", // official
				"2028": "2028-10-17", // estimate
				"2029": "2029-11-05", // estimate
				"2030": "2030-10-26"  // estimate
			},
			hkBoxing: {
				"2026": "2026-12-26", // official: first weekday after Christmas
				"2027": "2027-12-27"  // official
			}
		};

		/* Official moon-sighting announcements override the Umm al-Qura estimate. */
		const ISLAMIC_DATES = {
			eid: { "2026": "2026-03-21", "2027": "2027-03-10" },
			adha: { "2027": "2027-05-17" }
		};

		/** Compact festival row: id, local name, English name, kind, rule, extras. */
		function f(id, name, en, kind, rule, extra) {
			return Object.assign({ id: id, name: name, en: en, kind: kind, rule: rule }, extra || {});
		}

		const FESTIVALS = {
			cn: [
				f("ny", "元旦", "New Year's Day", "public", "fixed:01-01"),
				f("cny", "春节", "Chinese New Year", "traditional", "lunar:1-1"),
				f("lantern", "元宵节", "Lantern Festival", "traditional", "lunar:1-15"),
				f("longtaitou", "二月二", "Longtaitou Festival", "traditional", "lunar:2-2"),
				f("qingming", "清明节", "Qingming Festival", "traditional", "solar:qingming"),
				f("sanyuesan", "三月三", "Zhuang Sanyuesan Festival", "ethnic", "lunar:3-3"),
				f("labour", "劳动节", "Labour Day", "public", "fixed:05-01"),
				f("dragonboat", "端午节", "Dragon Boat Festival", "traditional", "lunar:5-5"),
				f("qixi", "七夕", "Qixi Festival", "traditional", "lunar:7-7"),
				f("zhongyuan", "中元节", "Ghost Festival", "traditional", "lunar:7-15"),
				f("torch", "火把节", "Torch Festival", "ethnic", "lunar:6-24"),
				f("midautumn", "中秋节", "Mid-Autumn Festival", "traditional", "lunar:8-15"),
				f("national", "国庆节", "National Day", "public", "fixed:10-01"),
				f("chongyang", "重阳节", "Double Ninth Festival", "traditional", "lunar:9-9"),
				f("laba", "腊八节", "Laba Festival", "traditional", "lunar:12-8"),
				f("dongzhi", "冬至", "Winter Solstice", "traditional", "solar:dongzhi"),
				f("eve", "除夕", "Chinese New Year's Eve", "traditional", "lunarEve"),
				f("eid", "开斋节", "Eid al-Fitr", "ethnic", "islamic:10-1", { years: ISLAMIC_DATES.eid, approx: false }),
				f("adha", "古尔邦节", "Eid al-Adha", "ethnic", "islamic:12-10", { years: ISLAMIC_DATES.adha, approx: false }),
				f("losar", "藏历新年", "Tibetan New Year (Losar)", "ethnic", "table", { years: TABLE_DATES.losar, approx: true }),
				f("water", "泼水节", "Water-Sprinkling Festival", "ethnic", "fixed:04-13", { approx: true }),
				f("naadam", "那达慕", "Naadam Festival", "ethnic", "table", { years: TABLE_DATES.naadam, fallback: "fixed:07-11", approx: true }),
				f("shoton", "雪顿节", "Shoton Festival", "ethnic", "table", { years: TABLE_DATES.shoton, approx: true })
			],
			hk: [
				f("ny", "元旦", "New Year's Day", "public", "fixed:01-01"),
				f("cny", "農曆新年", "Lunar New Year", "public", "lunar:1-1"),
				f("cny2", "年初二", "Second Day of Lunar New Year", "public", "lunar:1-2"),
				f("lantern", "元宵節", "Lantern Festival", "traditional", "lunar:1-15"),
				f("tinhau", "天后誕", "Tin Hau Festival", "traditional", "lunar:3-23"),
				f("qingming", "清明節", "Ching Ming Festival", "public", "solar:qingming"),
				f("goodfriday", "耶穌受難節", "Good Friday", "public", "easter:-2"),
				f("eastermonday", "復活節星期一", "Easter Monday", "public", "easter:1"),
				f("buddha", "佛誕", "Buddha's Birthday", "public", "lunar:4-8"),
				f("cheungchau", "長洲太平清醮", "Cheung Chau Bun Festival", "traditional", "lunar:4-8"),
				f("labour", "勞動節", "Labour Day", "public", "fixed:05-01"),
				f("dragonboat", "端午節", "Tuen Ng Festival", "public", "lunar:5-5"),
				f("handover", "香港特別行政區成立紀念日", "HKSAR Establishment Day", "public", "fixed:07-01"),
				f("yulan", "盂蘭節", "Yulan Festival", "traditional", "lunar:7-15"),
				f("midautumn", "中秋節", "Mid-Autumn Festival", "traditional", "lunar:8-15"),
				f("midautumn2", "中秋節翌日", "Day after Mid-Autumn Festival", "public", "lunar:8-16"),
				f("national", "國慶日", "National Day", "public", "fixed:10-01"),
				f("chungyeung", "重陽節", "Chung Yeung Festival", "public", "lunar:9-9"),
				f("christmas", "聖誕節", "Christmas Day", "public", "fixed:12-25"),
				f("boxing", "節禮日", "Boxing Day", "public", "table", { years: TABLE_DATES.hkBoxing, fallback: "fixed:12-26", approx: false }),
				f("dongzhi", "冬至", "Winter Solstice", "traditional", "solar:dongzhi"),
				f("eve", "除夕", "Lunar New Year's Eve", "traditional", "lunarEve")
			],
			mo: [
				f("ny", "元旦", "New Year's Day", "public", "fixed:01-01"),
				f("cny", "春節", "Lunar New Year", "public", "lunar:1-1"),
				f("lantern", "元宵節", "Lantern Festival", "traditional", "lunar:1-15"),
				f("goodfriday", "耶穌受難日", "Good Friday", "public", "easter:-2"),
				f("holysat", "復活節前日", "Holy Saturday", "public", "easter:-1"),
				f("qingming", "清明節", "Ching Ming Festival", "public", "solar:qingming"),
				f("buddha", "佛誕", "Buddha's Birthday", "public", "lunar:4-8"),
				f("labour", "勞動節", "Labour Day", "public", "fixed:05-01"),
				f("dragonboat", "端午節", "Tuen Ng Festival", "public", "lunar:5-5"),
				f("midautumn2", "中秋節翌日", "Day after Mid-Autumn Festival", "public", "lunar:8-16"),
				f("chungyeung", "重陽節", "Chung Yeung Festival", "public", "lunar:9-9"),
				f("national", "國慶日", "National Day", "public", "fixed:10-01"),
				f("allsouls", "追思節", "All Souls' Day", "public", "fixed:11-02"),
				f("immaculate", "聖母無原罪瞻禮", "Feast of the Immaculate Conception", "public", "fixed:12-08"),
				f("msar", "澳門特別行政區成立紀念日", "Macao SAR Establishment Day", "public", "fixed:12-20"),
				f("dongzhi", "冬至", "Winter Solstice", "public", "solar:dongzhi"),
				f("christmas", "聖誕節", "Christmas Day", "public", "fixed:12-25"),
				f("eve", "除夕", "Lunar New Year's Eve", "traditional", "lunarEve")
			],
			tw: [
				f("ny", "元旦", "New Year's Day", "public", "fixed:01-01"),
				f("cny", "春節", "Lunar New Year", "public", "lunar:1-1"),
				f("lantern", "元宵燈節", "Lantern Festival", "traditional", "lunar:1-15"),
				f("tianchuan", "天穿日", "Tianchuan Day", "ethnic", "lunar:1-20"),
				f("peace", "和平紀念日", "Peace Memorial Day", "public", "fixed:02-28"),
				f("labour", "勞動節", "Labour Day", "public", "fixed:05-01"),
				f("mazu", "媽祖誕辰", "Mazu's Birthday", "traditional", "lunar:3-23"),
				f("children", "兒童節", "Children's Day", "public", "fixed:04-04"),
				f("qingming", "清明節", "Tomb-Sweeping Day", "public", "solar:qingming"),
				f("dragonboat", "端午節", "Dragon Boat Festival", "public", "lunar:5-5"),
				f("zhongyuan", "中元普渡", "Ghost Festival", "traditional", "lunar:7-15"),
				f("midautumn", "中秋節", "Mid-Autumn Festival", "public", "lunar:8-15"),
				f("indigenous", "原住民族日", "Indigenous Peoples' Day", "ethnic", "fixed:08-01"),
				f("teachers", "教師節", "Teachers' Day / Confucius' Birthday", "public", "fixed:09-28"),
				f("harvest", "原住民族豐年祭", "Indigenous Harvest Festival", "ethnic", "table", { years: TABLE_DATES.harvest, fallback: "fixed:07-15", approx: true }),
				f("double10", "雙十節", "Double Tenth Day", "public", "fixed:10-10"),
				f("retrocession", "臺灣光復節", "Taiwan Retrocession Day", "traditional", "fixed:10-25"),
				f("constitution", "行憲紀念日", "Constitution Day", "public", "fixed:12-25"),
				f("dongzhi", "冬至", "Winter Solstice", "traditional", "solar:dongzhi"),
				f("eve", "除夕", "Lunar New Year's Eve", "public", "lunarEve")
			],
			us: [
				f("ny", "元旦", "New Year's Day", "public", "fixed:01-01"),
				f("mlk", "马丁·路德·金纪念日", "Martin Luther King Jr. Day", "public", "nth:1:1:3"),
				f("presidents", "总统日", "Presidents' Day", "public", "nth:2:1:3"),
				f("stpatrick", "圣帕特里克节", "St. Patrick's Day", "traditional", "fixed:03-17"),
				f("easter", "复活节", "Easter Sunday", "religious", "easter:0"),
				f("mother", "母亲节", "Mother's Day", "traditional", "nth:5:0:2"),
				f("memorial", "阵亡将士纪念日", "Memorial Day", "public", "nth:5:1:-1"),
				f("juneteenth", "六月节", "Juneteenth", "public", "fixed:06-19"),
				f("independence", "独立日", "Independence Day", "public", "fixed:07-04"),
				f("father", "父亲节", "Father's Day", "traditional", "nth:6:0:3"),
				f("labor", "劳动节", "Labor Day", "public", "nth:9:1:1"),
				f("columbus", "哥伦布日", "Columbus Day", "public", "nth:10:1:2"),
				f("halloween", "万圣节前夜", "Halloween", "traditional", "fixed:10-31"),
				f("veterans", "退伍军人节", "Veterans Day", "public", "fixed:11-11"),
				f("thanksgiving", "感恩节", "Thanksgiving Day", "public", "nth:11:4:4"),
				f("christmas", "圣诞节", "Christmas Day", "public", "fixed:12-25"),
				f("nye", "跨年夜", "New Year's Eve", "traditional", "fixed:12-31")
			],
			gb: [
				f("ny", "元旦", "New Year's Day", "public", "fixed:01-01"),
				f("mothering", "母亲节", "Mothering Sunday", "traditional", "easter:-21"),
				f("goodfriday", "耶稣受难日", "Good Friday", "public", "easter:-2"),
				f("easter", "复活节", "Easter Sunday", "religious", "easter:0"),
				f("eastermonday", "复活节星期一", "Easter Monday", "public", "easter:1"),
				f("stgeorge", "圣乔治日", "St George's Day", "traditional", "fixed:04-23"),
				f("earlymay", "五月初银行假日", "Early May Bank Holiday", "public", "nth:5:1:1"),
				f("spring", "春季银行假日", "Spring Bank Holiday", "public", "nth:5:1:-1"),
				f("father", "父亲节", "Father's Day", "traditional", "nth:6:0:3"),
				f("summer", "夏季银行假日", "Summer Bank Holiday", "public", "nth:8:1:-1"),
				f("halloween", "万圣节前夜", "Halloween", "traditional", "fixed:10-31"),
				f("bonfire", "篝火之夜", "Bonfire Night", "traditional", "fixed:11-05"),
				f("remembrance", "國殤紀念日", "Remembrance Sunday", "traditional", "nth:11:0:2"),
				f("christmas", "圣诞节", "Christmas Day", "public", "fixed:12-25"),
				f("boxing", "节礼日", "Boxing Day", "public", "fixed:12-26"),
				f("nye", "跨年夜", "New Year's Eve", "traditional", "fixed:12-31")
			],
			sg: [
				f("ny", "元旦", "New Year's Day", "public", "fixed:01-01"),
				f("cny", "农历新年", "Chinese New Year", "public", "lunar:1-1"),
				f("cny2", "农历新年初二", "Chinese New Year (Day 2)", "public", "lunar:1-2"),
				f("thaipusam", "大宝森节", "Thaipusam", "religious", "table", { years: TABLE_DATES.thaipusam, approx: true }),
				f("eid", "开斋节", "Hari Raya Puasa", "public", "islamic:10-1", { years: ISLAMIC_DATES.eid, approx: false }),
				f("goodfriday", "耶稣受难日", "Good Friday", "public", "easter:-2"),
				f("labour", "劳动节", "Labour Day", "public", "fixed:05-01"),
				f("vesak", "卫塞节", "Vesak Day", "public", "table", { years: TABLE_DATES.vesak, fallback: "lunar:4-15", approx: true }),
				f("qingming", "清明节", "Qingming Festival", "traditional", "solar:qingming"),
				f("zhongyuan", "中元节", "Hungry Ghost Festival", "traditional", "lunar:7-15"),
				f("national", "国庆日", "National Day", "public", "fixed:08-09"),
				f("midautumn", "中秋节", "Mid-Autumn Festival", "traditional", "lunar:8-15"),
				f("deepavali", "屠妖节", "Deepavali", "public", "table", { years: TABLE_DATES.deepavali, approx: true }),
				f("christmas", "圣诞节", "Christmas Day", "public", "fixed:12-25")
			],
			my: [
				f("ny", "元旦", "New Year's Day", "public", "fixed:01-01"),
				f("cny", "农历新年", "Chinese New Year", "public", "lunar:1-1"),
				f("cny2", "农历新年初二", "Chinese New Year (Day 2)", "public", "lunar:1-2"),
				f("thaipusam", "大宝森节", "Thaipusam", "religious", "table", { years: TABLE_DATES.thaipusam, approx: true }),
				f("eid", "开斋节", "Hari Raya Aidilfitri", "public", "islamic:10-1", { years: ISLAMIC_DATES.eid, approx: false }),
				f("labour", "劳动节", "Labour Day", "public", "fixed:05-01"),
				f("wesak", "卫塞节", "Wesak Day", "public", "table", { years: TABLE_DATES.vesak, fallback: "lunar:4-15", approx: true }),
				f("agong", "最高元首诞辰", "Agong's Birthday", "public", "nth:6:1:1"),
				f("haji", "哈芝节", "Hari Raya Haji", "public", "islamic:12-10", { years: ISLAMIC_DATES.adha, approx: false }),
				f("muharram", "伊斯兰历新年", "Awal Muharram", "public", "islamic:1-1"),
				f("maulidur", "先知诞辰", "Prophet Muhammad's Birthday", "public", "islamic:3-12"),
				f("nuzul", "可蘭經降世日", "Nuzul Al-Quran", "public", "islamic:9-17"),
				f("merdeka", "国庆日", "National Day", "public", "fixed:08-31"),
				f("malaysia", "马来西亚日", "Malaysia Day", "public", "fixed:09-16"),
				f("midautumn", "中秋节", "Mid-Autumn Festival", "traditional", "lunar:8-15"),
				f("deepavali", "屠妖节", "Deepavali", "public", "table", { years: TABLE_DATES.deepavali, approx: true }),
				f("christmas", "圣诞节", "Christmas Day", "public", "fixed:12-25")
			]
		};
		//#endregion

		//#region calendar
		const zoneFormatters = new Map();
		const calendarCache = new Map();
		const yearCache = new Map();

		function pad2(n) { return String(n).padStart(2, "0"); }
		function key(y, m, d) { return y + "-" + pad2(m) + "-" + pad2(d); }
		function fromKey(s) {
			const parts = String(s).split("-");
			return { y: Number(parts[0]), m: Number(parts[1]), d: Number(parts[2]) };
		}
		function dayOf(s) {
			const p = fromKey(s);
			return Math.floor(Date.UTC(p.y, p.m - 1, p.d) / DAY_MS);
		}
		function addDays(s, n) {
			return new Date((dayOf(s) + n) * DAY_MS).toISOString().slice(0, 10);
		}
		function norm360(v) {
			const wrapped = v % 360;
			return wrapped < 0 ? wrapped + 360 : wrapped;
		}

		/** The local calendar day in an IANA zone, as YYYY-MM-DD. */
		function zoneDay(zone, millis) {
			try {
				let fmt = zoneFormatters.get(zone);
				if (fmt === undefined) {
					fmt = new Intl.DateTimeFormat("en-CA", {
						timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit"
					});
					zoneFormatters.set(zone, fmt);
				}
				const parts = fmt.formatToParts(new Date(millis));
				const value = {};
				for (const part of parts) if (part.type !== "literal") value[part.type] = part.value;
				return key(Number(value.year), Number(value.month), Number(value.day));
			} catch (error) {
				const d = new Date(millis);
				return key(d.getFullYear(), d.getMonth() + 1, d.getDate());
			}
		}

		/**
		 * Map non-leap calendar month-day to its Gregorian date inside one
		 * Gregorian year. Leap Chinese months are reported as "6bis" and are
		 * skipped, so a festival is never celebrated twice in a leap year.
		 */
		function buildCalendarMap(year, calendar, timeZone) {
			const cacheKey = calendar + ":" + timeZone + ":" + year;
			if (calendarCache.has(cacheKey)) return calendarCache.get(cacheKey);
			let fmt;
			try {
				fmt = new Intl.DateTimeFormat("en-u-ca-" + calendar, {
					timeZone: timeZone, month: "numeric", day: "numeric"
				});
			} catch (error) {
				calendarCache.set(cacheKey, null);
				return null;
			}
			const map = {};
			const start = Date.UTC(year, 0, 1, 12);
			const daysInYear = Math.round((Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / DAY_MS);
			for (let i = 0; i < daysInYear; i += 1) {
				const millis = start + i * DAY_MS;
				const parts = fmt.formatToParts(new Date(millis));
				let month = "";
				let day = "";
				for (const part of parts) {
					if (part.type === "month") month = part.value;
					else if (part.type === "day") day = part.value;
				}
				if (month.indexOf("bis") !== -1 || month === "" || day === "") continue;
				const m = Number(month);
				const d = Number(day);
				if (!Number.isFinite(m) || !Number.isFinite(d)) continue;
				const id = m + "-" + d;
				if (map[id] === undefined) map[id] = new Date(millis).toISOString().slice(0, 10);
			}
			calendarCache.set(cacheKey, map);
			return map;
		}

		/** Gregorian (Western) Easter, Meeus/Jones/Butcher algorithm. */
		function easter(year) {
			const a = year % 19;
			const b = Math.floor(year / 100);
			const c = year % 100;
			const d = Math.floor(b / 4);
			const e = b % 4;
			const g = Math.floor((b + 8) / 25);
			const h2 = Math.floor((b - g + 1) / 3);
			const i = (19 * a + b - d - h2 + 15) % 30;
			const j = Math.floor(c / 4);
			const k = c % 4;
			const l = (32 + 2 * e + 2 * j - i - k) % 7;
			const m = Math.floor((a + 11 * i + 22 * l) / 451);
			const offset = i + l - 7 * m + 114;
			return key(year, Math.floor(offset / 31), (offset % 31) + 1);
		}

		/** Nth (or last, nth = -1) weekday of a month; weekday 0 = Sunday. */
		function nthWeekday(year, month, weekday, nth) {
			if (nth > 0) {
				const first = 1 + ((weekday - new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 7) % 7);
				const day = first + (nth - 1) * 7;
				return day <= new Date(Date.UTC(year, month, 0)).getUTCDate() ? key(year, month, day) : null;
			}
			const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
			const back = (new Date(Date.UTC(year, month - 1, last)).getUTCDay() - weekday + 7) % 7;
			return key(year, month, last - back);
		}

		/** Low-precision geometric solar longitude, in degrees, for a Julian Day. */
		function solarLongitude(jd) {
			const n = jd - J2000_JD;
			const mean = 280.460 + 0.9856474 * n;
			const anomaly = (357.528 + 0.9856003 * n) * RAD;
			return norm360(mean + 1.915 * Math.sin(anomaly) + 0.020 * Math.sin(2 * anomaly));
		}

		/** Local calendar day when the sun reaches a target longitude. */
		function solarTermDay(year, target, zone) {
			const guessMonth = target < 90 ? 3 : 11;
			const guessDay = target < 90 ? 20 : 21;
			let jd = Date.UTC(year, guessMonth, guessDay, 12) / DAY_MS + UNIX_EPOCH_JD;
			for (let step = 0; step < 12; step += 1) {
				let delta = norm360(solarLongitude(jd) - target);
				if (delta > 180) delta -= 360;
				jd -= delta / 0.9856474;
			}
			return zoneDay(zone, (jd - UNIX_EPOCH_JD) * DAY_MS);
		}

		/** Resolve one festival's rule for a Gregorian year. */
		function dateFor(festival, year, zone, allowFallback) {
			/* A published official date (moon sighting, government calendar) beats any rule. */
			const published = festival.years && festival.years[String(year)];
			if (typeof published === "string" && published !== "") {
				return { date: published, approx: festival.approx !== false };
			}
			const rule = festival.rule;
			const parts = rule.split(":");
			const kind = parts[0];
			if (kind === "fixed") {
				const md = parts[1].split("-");
				return { date: key(year, Number(md[0]), Number(md[1])), approx: false };
			}
			if (kind === "lunar") {
				const map = buildCalendarMap(year, "chinese", "Asia/Shanghai");
				const date = map === null ? undefined : map[parts[1]];
				return date === undefined ? null : { date: date, approx: false };
			}
			if (kind === "lunarEve") {
				const map = buildCalendarMap(year, "chinese", "Asia/Shanghai");
				const cny = map === null ? undefined : map["1-1"];
				return cny === undefined ? null : { date: addDays(cny, -1), approx: false };
			}
			if (kind === "islamic") {
				const map = buildCalendarMap(year, "islamic-umalqura", "UTC");
				const date = map === null ? undefined : map[parts[1]];
				return date === undefined ? null : { date: date, approx: true };
			}
			if (kind === "nth") {
				const date = nthWeekday(year, Number(parts[1]), Number(parts[2]), Number(parts[3]));
				return date === null ? null : { date: date, approx: false };
			}
			if (kind === "easter") {
				return { date: addDays(easter(year), Number(parts[1])), approx: false };
			}
			if (kind === "solar") {
				return { date: solarTermDay(year, parts[1] === "qingming" ? 15 : 270, zone), approx: false };
			}
			if (kind === "table") {
				const date = festival.years && festival.years[String(year)];
				if (typeof date === "string" && date !== "") return { date: date, approx: festival.approx !== false };
				if (allowFallback && typeof festival.fallback === "string") {
					const estimate = dateFor({ rule: festival.fallback }, year, zone, false);
					return estimate === null ? null : { date: estimate.date, approx: true };
				}
				return null;
			}
			return null;
		}

		/** All festival occurrences in one Gregorian year, date-ordered. */
		function expandYear(regionId, year) {
			const cacheKey = regionId + ":" + year;
			if (yearCache.has(cacheKey)) return yearCache.get(cacheKey);
			const region = REGIONS.filter(function (r) { return r.id === regionId; })[0] || REGIONS[0];
			const list = [];
			for (const festival of FESTIVALS[regionId] || []) {
				const resolved = dateFor(festival, year, region.zone, true);
				if (resolved === null) continue;
				list.push({
					festival: festival,
					date: resolved.date,
					approx: Boolean(resolved.approx || festival.approx)
				});
			}
			list.sort(function (a, b) {
				return a.date.localeCompare(b.date) || KIND_RANK[a.festival.kind] - KIND_RANK[b.festival.kind];
			});
			yearCache.set(cacheKey, list);
			return list;
		}

		/** The next festival at or after "today" in the region's own calendar. */
		function nextFestival(regionId, millis) {
			const region = REGIONS.filter(function (r) { return r.id === regionId; })[0] || REGIONS[0];
			const today = zoneDay(region.zone, millis);
			const year = Number(today.slice(0, 4));
			const upcoming = expandYear(region.id, year).concat(expandYear(region.id, year + 1))
				.filter(function (entry) { return entry.date >= today; });
			const next = upcoming[0] || null;
			return {
				region: region,
				today: today,
				next: next,
				days: next === null ? -1 : dayOf(next.date) - dayOf(today),
				upcoming: upcoming.slice(0, 3),
				sameDay: next === null ? [] : upcoming.filter(function (e) { return e.date === next.date; })
			};
		}
		//#endregion

		//#region copy
		const COPY = {
			zh: {
				title: "下一个节日",
				region: "节日地区",
				regionDesc: "选择要显示哪个国家或地区的节日，保存后对话页左上角的徽标会立即更新。",
				groupCn: "中国大陆与港澳台",
				groupOther: "其它国家",
				save: "保存",
				saved: "已保存",
				savedNote: "已保存，徽标已更新。",
				unsaved: "有未保存的修改，按「保存」后生效。",
				externalNote: "设置已在其它标签页更改；未保存的修改仍保留。",
				sameDay: "同日还有",
				localDay: "按当地日期",
				current: "当前：",
				preview: "当前设置下的下一个节日：",
				days: "天",
				inDays: "还有",
				today: "就是今天",
				approx: "约",
				approxNote: "日期为估算，以当地官方公告为准",
				kindPublic: "法定假日",
				kindTraditional: "传统节日",
				kindEthnic: "民族节日",
				kindReligious: "宗教节日",
				date: "日期",
				kind: "类别",
				regionLabel: "地区",
				timezone: "时区",
				after: "之后",
				storageNote: "选择只保存在当前浏览器，不随账号同步。",
				localOnly: "本浏览器无法保存设置，选择仅在本次会话有效。",
				none: "当前浏览器无法计算该地区的节日日期",
				dateFormat: { month: "long", day: "numeric" }
			},
			en: {
				title: "Next festival",
				region: "Festival region",
				regionDesc: "Pick which country or region's festivals to show. Saving updates the badge at the top-left of the conversation immediately.",
				groupCn: "Mainland China, Hong Kong, Macau and Taiwan",
				groupOther: "Other countries",
				save: "Save",
				saved: "Saved",
				savedNote: "Saved — the badge has updated.",
				unsaved: "Unsaved changes — press Save to apply.",
				externalNote: "The setting changed in another tab; your unsaved choice is kept.",
				sameDay: "Also on this day",
				localDay: "Local date",
				current: "Current: ",
				preview: "Next festival with the current setting: ",
				days: "days",
				inDays: "in",
				today: "today",
				approx: "approx.",
				approxNote: "Approximate date — check the local official calendar",
				kindPublic: "Public holiday",
				kindTraditional: "Traditional festival",
				kindEthnic: "Ethnic festival",
				kindReligious: "Religious festival",
				date: "Date",
				kind: "Kind",
				regionLabel: "Region",
				timezone: "Time zone",
				after: "Afterwards",
				storageNote: "Saved in this browser only, not synced with your profile.",
				localOnly: "This browser cannot save the setting; it lasts for this session only.",
				none: "No festival dates can be computed in this browser",
				dateFormat: { month: "short", day: "numeric" }
			}
		};

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
		function copyFor(locale) { return locale.indexOf("zh") === 0 ? COPY.zh : COPY.en; }
		function intlLocale(locale) { return locale.indexOf("zh") === 0 ? "zh-CN" : "en-US"; }
		function nameFor(festival, locale) { return locale.indexOf("zh") === 0 ? festival.name : festival.en; }
		function kindName(kind, locale) {
			const copy = copyFor(locale);
			return copy[kind === "public" ? "kindPublic" : kind === "traditional" ? "kindTraditional" : kind === "ethnic" ? "kindEthnic" : "kindReligious"];
		}
		function shortDate(dateKey, locale) {
			const p = fromKey(dateKey);
			try {
				return new Intl.DateTimeFormat(intlLocale(locale), Object.assign({ timeZone: "UTC" }, copyFor(locale).dateFormat))
					.format(new Date(Date.UTC(p.y, p.m - 1, p.d, 12)));
			} catch (error) {
				return p.m + "/" + p.d;
			}
		}
		/** Prefer the slot's locale-bound `t`, but keep the built-in copy as a fallback. */
		function translator(props, locale) {
			const copy = copyFor(locale);
			if (props && typeof props.t === "function") {
				return function (k) {
					try {
						const value = props.t(k);
						if (typeof value === "string" && value !== "" && value !== k) return value;
					} catch (error) {}
					return copy[k] || k;
				};
			}
			return function (k) { return copy[k] || k; };
		}
		//#endregion

		//#region preference store
		function readStored() {
			try {
				const value = localStorage.getItem(STORAGE_KEY);
				return REGION_IDS.indexOf(value) === -1 ? DEFAULT_REGION : value;
			} catch (error) {
				return DEFAULT_REGION;
			}
		}
		function storageWritable() {
			try {
				localStorage.setItem(STORAGE_KEY + ":probe", "1");
				localStorage.removeItem(STORAGE_KEY + ":probe");
				return true;
			} catch (error) {
				return false;
			}
		}
		let state = { region: readStored(), persistent: storageWritable(), externalAt: 0 };
		let snapshot = { region: state.region, persistent: state.persistent, externalAt: state.externalAt };
		const listeners = new Set();
		function emit() {
			snapshot = { region: state.region, persistent: state.persistent, externalAt: state.externalAt };
			for (const listener of [...listeners]) listener();
		}
		function subscribe(listener) {
			listeners.add(listener);
			return function () { listeners.delete(listener); };
		}
		function getSnapshot() { return snapshot; }
		function setRegion(id) {
			if (REGION_IDS.indexOf(id) === -1 || id === state.region) return;
			state.region = id;
			try { localStorage.setItem(STORAGE_KEY, id); }
			catch (error) { state.persistent = false; }
			emit();
		}
		function reloadRegion() {
			const stored = readStored();
			if (stored !== state.region) {
				state.region = stored;
				state.externalAt = Date.now();
				emit();
			}
		}
		//#endregion

		//#region styles
		const css = [
			"[data-dsh-next-festival].dsh-nf{--dsh-nf-accent:#c94f45;position:fixed;right:18px;bottom:18px;z-index:1000;display:flex;align-items:center;gap:9px;box-sizing:border-box;min-width:132px;max-width:212px;margin:0;padding:5px 11px 5px 8px;border-radius:calc(var(--dsw-radius-md,8px) + 2px);border:1px solid color-mix(in oklab,var(--dsw-alias-label-primary,#111) 12%,transparent);background:color-mix(in oklab,var(--dsw-alias-bg-layer-1,#fff) 78%,transparent);box-shadow:0 2px 14px color-mix(in oklab,var(--dsw-alias-label-primary,#111) 14%,transparent);-webkit-backdrop-filter:blur(16px) saturate(1.25);backdrop-filter:blur(16px) saturate(1.25);color:var(--dsw-alias-label-primary,#111);line-height:1.2;font-variant-numeric:tabular-nums;pointer-events:auto;-webkit-user-select:none;user-select:none}",
			".dsh-nf-ink{flex:none;width:3px;height:26px;border-radius:99px;background:var(--dsh-nf-accent);box-shadow:0 0 9px color-mix(in oklab,var(--dsh-nf-accent) 55%,transparent)}",
			".dsh-nf-body{display:flex;flex-direction:column;gap:3px;min-width:0}",
			".dsh-nf-top{display:flex;align-items:baseline;gap:10px;justify-content:space-between}",
			".dsh-nf-name{font-size:15px;font-weight:650;letter-spacing:.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--dsw-alias-label-primary,#111)}",
			".dsh-nf-date{font-size:10px;white-space:nowrap;color:var(--dsw-alias-label-tertiary,#8a8a92)}",
			".dsh-nf-next{display:flex;align-items:baseline;gap:4px;font-size:11px;white-space:nowrap;color:var(--dsw-alias-label-secondary,#6b6b73)}",
			".dsh-nf-days{font-weight:700;color:var(--dsh-nf-accent)}",
			".dsh-nf-today{font-weight:600;color:var(--dsh-nf-accent)}",
			".dsh-nf-region{font-size:10px;color:var(--dsw-alias-label-tertiary,#8a8a92);white-space:nowrap}",
			"[data-dsh-next-festival].dsh-nf:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4c6ef5));outline-offset:2px}",
			"[data-dsh-next-festival].dsh-nf-row{display:flex;flex-direction:column;gap:12px;padding:16px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}",
			".dsh-nf-head{display:flex;justify-content:space-between;align-items:baseline;gap:24px}",
			".dsh-nf-text{min-width:0}",
			".dsh-nf-title{font-size:14px;line-height:20px;color:var(--dsw-alias-label-primary)}",
			".dsh-nf-desc{margin-top:4px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}",
			".dsh-nf-value{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}",
			".dsh-nf-groups{display:flex;flex-direction:column;gap:10px}",
			".dsh-nf-label{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}",
			".dsh-nf-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}",
			".dsh-nf-chip{display:inline-flex;align-items:center;padding:5px 11px;border-radius:10px;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:20px;cursor:pointer;transition:border-color 120ms ease,background 120ms ease}",
			".dsh-nf-chip:hover{background:var(--dsw-alias-interactive-bg-hover)}",
			".dsh-nf-chip:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4c6ef5));outline-offset:2px}",
			".dsh-nf-chip[data-active=true]{border-color:var(--dsw-alias-brand-primary);box-shadow:inset 0 0 0 1px var(--dsw-alias-brand-primary)}",
			".dsh-nf-preview{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}",
			".dsh-nf-preview b{font-weight:650;color:var(--dsw-alias-label-primary)}",
			".dsh-nf-foot{display:flex;align-items:center;gap:12px;flex-wrap:wrap}",
			".dsh-nf-note{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}",
			".dsh-nf-note[data-notice=unsaved]{color:var(--dsw-alias-state-warn-label,#ffb86c)}",
			".dsh-nf-save{display:inline-flex;align-items:center;justify-content:center;padding:5px 14px;border-radius:8px;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:20px;cursor:pointer;transition:background 120ms ease}",
			".dsh-nf-save:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}",
			".dsh-nf-save:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4c6ef5));outline-offset:2px}",
			".dsh-nf-save[data-active=true]{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}",
			".dsh-nf-save:disabled{opacity:.5;cursor:default}",
			"@media (max-width:900px){.dsh-nf{min-width:0;max-width:172px}.dsh-nf-name{font-size:13px}.dsh-nf-date{font-size:9px}.dsh-nf-next{font-size:10px}}"
		].join("\n");

		/** Install the stylesheet once and hand back its removal. */
		function mountStyles() {
			if (typeof document === "undefined") return function () {};
			if (document.querySelector("style[data-plugin-css=" + JSON.stringify(STYLE_ID) + "]") !== null) return function () {};
			const tag = document.createElement("style");
			tag.dataset.plugin = PLUGIN_ID;
			tag.dataset.pluginCss = STYLE_ID;
			tag.textContent = css;
			document.head.appendChild(tag);
			return function () { tag.remove(); };
		}
		//#endregion

		//#region components
		/** Build the header badge bound to one plugin context. */
		function createBadge(ctx) {
			return function FestivalBadge() {
				const [now, setNow] = React.useState(function () { return Date.now(); });
				React.useEffect(function () {
					const tick = function () { setNow(Date.now()); };
					const timer = window.setInterval(tick, 30000);
					const onVisible = function () { if (document.visibilityState === "visible") tick(); };
					document.addEventListener("visibilitychange", onVisible);
					return function () {
						window.clearInterval(timer);
						document.removeEventListener("visibilitychange", onVisible);
					};
				}, []);
				const current = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
				const locale = activeLanguage(ctx);
				const copy = copyFor(locale);
				const info = nextFestival(current.region, now);
				const entry = info.next;

				if (entry === null) {
					return h("div", {
						className: "dsh-nf", "data-dsh-next-festival": "badge",
						style: { "--dsh-nf-accent": KIND_COLORS.traditional }
					}, h("span", { className: "dsh-nf-next" }, copy.none));
				}

				const festival = entry.festival;
				const name = nameFor(festival, locale);
				const accent = KIND_COLORS[festival.kind] || KIND_COLORS.traditional;
			const zh = locale.indexOf("zh") === 0;
			const colon = zh ? "：" : ": ";
			const paren = zh ? ["（", "）"] : [" (", ")"];
			const regionName = zh ? info.region.name : info.region.en;
			const approxDate = (entry.approx ? copy.approx + " " : "") + shortDate(entry.date, locale);
				const countdown = info.days === 0
					? h("span", { className: "dsh-nf-today", key: "today" }, copy.today)
					: h(React.Fragment, { key: "days" }, [
						h("span", { key: "in" }, copy.inDays),
						h("span", { className: "dsh-nf-days", key: "count" }, String(info.days)),
						h("span", { key: "unit" }, copy.days)
					]);
				const title = [
					copy.regionLabel + colon + regionName,
					copy.kind + colon + kindName(festival.kind, locale),
					copy.date + colon + entry.date + (entry.approx ? paren[0] + copy.approx + paren[1] : ""),
					info.days === 0 ? copy.today : copy.inDays + " " + info.days + " " + copy.days
				];
				title.push(copy.localDay + colon + info.today);
			if (entry.approx) title.push(copy.approxNote);
				if (info.upcoming.length > 1) {
					title.push(copy.after + colon + info.upcoming.slice(1).map(function (e) {
						return nameFor(e.festival, locale) + " " + e.date;
					}).join(" · "));
				}
				if (info.sameDay.length > 1) {
					title.push(copy.sameDay + colon + info.sameDay.slice(1).map(function (e) {
						return nameFor(e.festival, locale);
					}).join(" · "));
				}
				title.push(copy.timezone + colon + info.region.zone);

			const aria = [
				copy.title, name, approxDate,
				info.days === 0 ? copy.today : copy.inDays + " " + info.days + " " + copy.days,
				copy.regionLabel + " " + regionName,
				copy.kind + " " + kindName(festival.kind, locale),
				copy.localDay + " " + info.today
			];
			if (entry.approx) aria.push(copy.approxNote);
			if (info.upcoming.length > 1) aria.push(copy.after + " " + info.upcoming.slice(1).map(function (e) {
				return nameFor(e.festival, locale) + " " + e.date;
			}).join(", "));

				return h("div", {
					className: "dsh-nf",
					"data-dsh-next-festival": "badge",
					"data-kind": festival.kind,
				"data-approx": entry.approx ? "true" : "false",
				role: "group",
				tabIndex: 0,
					style: { "--dsh-nf-accent": accent },
					title: title.join("\n"),
					"aria-label": aria.join(". ")
				}, [
					h("span", { className: "dsh-nf-ink", key: "ink", "aria-hidden": true }),
					h("div", { className: "dsh-nf-body", key: "body" }, [
						h("div", { className: "dsh-nf-top", key: "top" }, [
							h("span", { className: "dsh-nf-name", key: "name" }, name),
							h("span", { className: "dsh-nf-date", key: "date" }, approxDate)
						]),
						h("div", { className: "dsh-nf-next", key: "next" }, [
							h("span", { className: "dsh-nf-region", key: "region" }, regionName + " · "),
							countdown
						])
					])
				]);
			};
		}

		/** Build the region picker shown on this bundle's own Plugins page. */
		function createSettings(ctx) {
			return function FestivalSettings(props) {
				const current = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
				const locale = activeLanguage(ctx);
				const t = translator(props, locale);
				const [draft, setDraft] = React.useState(current.region);
				const [notice, setNotice] = React.useState(null);
			const dirty = draft !== current.region;
			const dirtyRef = React.useRef(false);
			dirtyRef.current = dirty;
			const regionRef = React.useRef(current.region);
			const externalRef = React.useRef(current.externalAt);
				React.useEffect(function () {
				if (regionRef.current !== current.region) {
					regionRef.current = current.region;
					if (!dirtyRef.current) setDraft(current.region);
				}
			}, [current.region]);
			React.useEffect(function () {
				if (externalRef.current !== current.externalAt) {
					externalRef.current = current.externalAt;
					setNotice("external");
				}
			}, [current.externalAt]);
			React.useEffect(function () {
				if (notice === null) return;
				const timer = window.setTimeout(function () { setNotice(null); }, 3500);
				return function () { window.clearTimeout(timer); };
			}, [notice]);

				const info = nextFestival(current.region, Date.now());
				const region = REGIONS.filter(function (r) { return r.id === current.region; })[0] || REGIONS[0];
				const regionName = locale.indexOf("zh") === 0 ? region.name : region.en;
				const groups = [
					{ key: "cn", label: t("groupCn"), items: REGIONS.filter(function (r) { return r.group === "cn"; }) },
					{ key: "other", label: t("groupOther"), items: REGIONS.filter(function (r) { return r.group === "other"; }) }
				];
				const children = [
					h("div", { className: "dsh-nf-head", key: "head" }, [
						h("div", { className: "dsh-nf-text", key: "text" }, [
							h("div", { className: "dsh-nf-title", key: "title" }, t("region")),
							h("div", { className: "dsh-nf-desc", key: "desc" }, t("regionDesc"))
						]),
						h("div", { className: "dsh-nf-value", key: "value" }, t("current") + regionName)
					]),
					h("div", { className: "dsh-nf-groups", key: "groups" }, groups.map(function (group) {
						return h("div", { className: "dsh-nf-group", key: group.key }, [
							h("div", { className: "dsh-nf-label", key: "label" }, group.label),
							h("div", { className: "dsh-nf-chips", key: "chips" }, group.items.map(function (item) {
								return h("button", {
									key: item.id,
									type: "button",
									className: "dsh-nf-chip",
									"data-active": draft === item.id ? "true" : "false",
									"aria-pressed": draft === item.id ? "true" : "false",
									title: item.zone,
									onClick: function () { setDraft(item.id); }
								}, locale.indexOf("zh") === 0 ? item.name : item.en);
							}))
						]);
					}))
				];

				if (info.next !== null) {
					children.push(h("div", { className: "dsh-nf-preview", key: "preview" },
						t("preview"),
						h("b", { key: "name" }, nameFor(info.next.festival, locale) + " " + info.next.date),
						info.days === 0 ? " · " + t("today") : " · " + t("inDays") + " " + info.days + " " + t("days")
					));
				}

				const note = dirty
				? t("unsaved")
				: notice === "saved" ? t("savedNote")
				: notice === "external" ? t("externalNote")
				: current.persistent ? t("storageNote") : t("localOnly");

			children.push(h("div", { className: "dsh-nf-foot", key: "foot" }, [
					h("button", {
						key: "save",
						type: "button",
						className: "dsh-nf-save",
						disabled: !dirty,
						onClick: function () { setRegion(draft); setNotice("saved"); }
					}, t("save")),
					h("span", { className: "dsh-nf-note", key: "note", "data-notice": dirty ? "unsaved" : (notice || "none"), role: "status" }, note)
				]));

				return h("div", { className: "dsh-nf-row", "data-dsh-next-festival": "settings" }, children);
			};
		}
		//#endregion

		//#region plugin
		const inject = ["slots", "locale"];

		/** Install styles, dictionaries and both slot registrations. */
		function apply(ctx) {
			ctx.effect(mountStyles, PLUGIN_ID + ": styles");
			ctx.effect(function () {
				/* The locale service takes string dictionaries; COPY also holds a date-format object. */
				const dictionaries = {};
				for (const lang of Object.keys(COPY)) {
					const strings = {};
					for (const key of Object.keys(COPY[lang])) {
						if (typeof COPY[lang][key] === "string") strings[key] = COPY[lang][key];
					}
					dictionaries[lang] = strings;
				}
				return ctx.locale.register(NS, dictionaries);
			}, PLUGIN_ID + ": locale");
			ctx.effect(function () {
				const onStorage = function (event) {
					if (event.key === STORAGE_KEY || event.key === null) reloadRegion();
				};
				window.addEventListener("storage", onStorage);
				return function () { window.removeEventListener("storage", onStorage); };
			}, PLUGIN_ID + ": cross-tab preference");

			const Badge = createBadge(ctx);
			ctx.effect(function () {
				try {
					return ctx.slots.inject(OVERLAY_SLOT, function () {
						return ctx.slots.register({
							name: OVERLAY_SLOT,
							id: "next-festival",
							order: 5
						}, Badge);
					});
				} catch (error) {
					console.warn(PLUGIN_ID + ": floating badge registration failed", error);
					return function () {};
				}
			}, PLUGIN_ID + ": floating badge");

			const Settings = createSettings(ctx);
			ctx.effect(function () {
				try {
					return ctx.slots.inject(CONFIG_SLOT, function () {
						return ctx.slots.register({
							name: CONFIG_SLOT,
							key: PLUGIN_ID,
							locale: NS
						}, Settings);
					});
				} catch (error) {
					console.warn(PLUGIN_ID + ": plugin-page region picker registration failed", error);
					return function () {};
				}
			}, PLUGIN_ID + ": plugin-page region picker");
		}
		//#endregion

		exports.apply = apply;
		exports.inject = inject;
		/* Pure calendar helpers, exported so an offline Node check can verify dates. */
		exports.calendar = {
			REGIONS: REGIONS,
			FESTIVALS: FESTIVALS,
			TABLE_DATES: TABLE_DATES,
			zoneDay: zoneDay,
			easter: easter,
			nthWeekday: nthWeekday,
			solarTermDay: solarTermDay,
			buildCalendarMap: buildCalendarMap,
			expandYear: expandYear,
			nextFestival: nextFestival
		};
		return module.exports;
	}
});
