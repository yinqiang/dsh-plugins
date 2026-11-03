/**
 * Sidebar balance floater.
 *
 * Renders the account balance in the sidebar foot row (directly above the
 * settings / account entry) and floats a game-style damage number whenever the
 * balance drops, a heal number whenever it rises.
 *
 * The bundle is hand-written in the lazy-CJS shape the client module system
 * expects: loading the file only registers this factory; every side effect —
 * the stylesheet included — runs when the factory is materialized.
 */
window.__ModuleLoader__.load({
	id: "dsh-balance-floater",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");

		//#region styles
		const PLUGIN_ID = "dsh-balance-floater";
		const css = [
			".dsh-bf-pill{width:100%;box-sizing:border-box;display:flex;align-items:center;gap:6px;margin:0 2px 2px;padding:3px 8px;border:0;border-radius:var(--dsw-radius-md,8px);background:0 0;color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-primary,#6e6e73));font:inherit;font-variant-numeric:tabular-nums;line-height:20px;text-align:left;cursor:pointer;transition:background 120ms ease,color 120ms ease}",
			".dsh-bf-pill:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}",
			".dsh-bf-pill:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4c6ef5));outline-offset:-2px}",
			".dsh-bf-dot{flex:none;width:6px;height:6px;border-radius:50%;background:#35d07f;box-shadow:0 0 6px rgba(53,208,127,.65);transition:background 120ms ease}",
			".dsh-bf-dot[data-state=stale]{background:#c9c9cf;box-shadow:none}",
			".dsh-bf-dot[data-state=error]{background:#ff9f43;box-shadow:0 0 6px rgba(255,159,67,.6)}",
			".dsh-bf-amount{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}",
			".dsh-bf-note{margin-left:auto;font-size:11px;line-height:1.4;color:var(--dsw-alias-label-tertiary,#9a9aa2);white-space:nowrap}",
			".dsh-bf-pill.dsh-bf-shake{animation:dsh-bf-shake 300ms cubic-bezier(.36,.07,.19,.97)}",
			"@keyframes dsh-bf-shake{10%,90%{transform:translateX(-1px)}20%,80%{transform:translateX(2px)}30%,50%,70%{transform:translateX(-3px)}40%,60%{transform:translateX(3px)}100%{transform:none}}",
			".dsh-bf-layer{position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:2147483000}",
			".dsh-bf-float{position:fixed;transform-origin:50% 100%;font:800 26px/1 ui-rounded,Segoe UI Black,PingFang SC,Microsoft YaHei,system-ui,sans-serif;font-variant-numeric:tabular-nums;letter-spacing:.4px;white-space:nowrap;will-change:transform,opacity;animation:dsh-bf-rise 1150ms cubic-bezier(.17,.84,.28,1) forwards}",
			".dsh-bf-hit{color:#ff5a5f;text-shadow:0 1px 0 #5a0d10,0 2px 0 #4a0a0d,0 3px 10px rgba(0,0,0,.5),0 0 22px rgba(255,90,95,.6)}",
			".dsh-bf-heal{color:#3ddc84;text-shadow:0 1px 0 #0d3d22,0 2px 0 #0a2f1a,0 3px 10px rgba(0,0,0,.5),0 0 22px rgba(61,220,132,.6)}",
			".dsh-bf-crit{font-size:34px}",
			"@keyframes dsh-bf-rise{0%{opacity:0;transform:translate(-50%,8px) scale(.55) rotate(var(--dsh-bf-rot,0deg))}16%{opacity:1;transform:translate(-50%,-10px) scale(1.22) rotate(var(--dsh-bf-rot,0deg))}28%{transform:translate(-50%,-16px) scale(1) rotate(var(--dsh-bf-rot,0deg))}100%{opacity:0;transform:translate(calc(-50% + var(--dsh-bf-dx,0px)),-104px) scale(.9) rotate(var(--dsh-bf-rot,0deg))}}",
			"@media (prefers-reduced-motion:reduce){.dsh-bf-float{animation:dsh-bf-fade 700ms ease-out forwards}.dsh-bf-pill.dsh-bf-shake{animation:none}}",
			"@keyframes dsh-bf-fade{0%{opacity:0;transform:translate(-50%,0)}30%{opacity:1}100%{opacity:0;transform:translate(-50%,-28px)}}"
		].join("\n");
		const tagId = PLUGIN_ID + "/style.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = PLUGIN_ID;
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion

		//#region helpers
		/** How often the balance is re-read, in milliseconds. */
		const POLL_MS = 15000;
		/** Build version carried by account calls when the boot payload does not provide one. */
		const FALLBACK_VERSION = "0.2.1-rc.5";
		/** Last mounted pill element, used as the damage-number origin. */
		let pillElement = null;

		/** @returns the client build version the account Remote expects. */
		function readVersion() {
			try {
				const boot = window.__DSH_BOOT__;
				const version = boot && boot.release && boot.release.version;
				if (typeof version === "string" && version) return version;
			} catch (error) {}
			return FALLBACK_VERSION;
		}

		/** @returns the active UI language, never empty. */
		function readLocale(ctx) {
			try {
				const snapshot = ctx.locale.getSnapshot();
				const active = snapshot && (snapshot.active || snapshot.locale || snapshot.language);
				if (typeof active === "string" && active) return active;
			} catch (error) {}
			return (typeof navigator !== "undefined" && navigator.language) || "zh-CN";
		}

		/** Parse a decimal amount string into integer cents.
		 * @param text - platform decimal string.
		 * @returns integer cents, or null when the string is not a number.
		 */
		function toCents(text) {
			if (typeof text !== "string" && typeof text !== "number") return null;
			const value = Number(text);
			if (!Number.isFinite(value)) return null;
			return Math.round(value * 100);
		}

		/** @returns the currency symbol for a platform currency code. */
		function symbolOf(currency) {
			return currency === "USD" ? "$" : "¥";
		}

		/** Render cents as a fixed two-decimal currency string.
		 * @param cents - integer cents.
		 * @param currency - platform currency code.
		 * @returns display text such as ¥41.82.
		 */
		function formatMoney(cents, currency) {
			const abs = Math.abs(cents);
			const whole = Math.floor(abs / 100);
			const fraction = String(abs % 100).padStart(2, "0");
			return (cents < 0 ? "-" : "") + symbolOf(currency) + whole + "." + fraction;
		}

		/** @returns the fixed overlay that owns every floating number. */
		function ensureLayer() {
			let layer = document.getElementById("dsh-bf-layer");
			if (layer === null) {
				layer = document.createElement("div");
				layer.id = "dsh-bf-layer";
				layer.className = "dsh-bf-layer";
				document.body.appendChild(layer);
			}
			return layer;
		}

		/** Float one signed delta from the pill, arcade style.
		 * @param deltaCents - signed change in cents.
		 * @param currency - platform currency code.
		 */
		function spawnFloater(deltaCents, currency) {
			if (typeof document === "undefined" || deltaCents === 0) return;
			const layer = ensureLayer();
			const up = deltaCents > 0;
			const amount = Math.abs(deltaCents) / 100;
			const node = document.createElement("div");
			node.className = "dsh-bf-float " + (up ? "dsh-bf-heal" : "dsh-bf-hit");
			node.textContent = (up ? "+" : "-") + symbolOf(currency) + amount.toFixed(2);
			if (!up && amount >= 1) node.classList.add("dsh-bf-crit");

			let x = window.innerWidth * 0.5;
			let y = window.innerHeight - 96;
			if (pillElement !== null && pillElement.isConnected) {
				const rect = pillElement.getBoundingClientRect();
				x = rect.left + rect.width * 0.45;
				y = rect.top + 2;
			}
			node.style.left = x + "px";
			node.style.top = y + "px";
			node.style.setProperty("--dsh-bf-dx", ((Math.random() - 0.5) * 56).toFixed(1) + "px");
			node.style.setProperty("--dsh-bf-rot", ((Math.random() - 0.5) * 14).toFixed(1) + "deg");
			layer.appendChild(node);

			const drop = function () { node.remove(); };
			node.addEventListener("animationend", drop, { once: true });
			window.setTimeout(drop, 2000);

			if (pillElement !== null && pillElement.isConnected) {
				pillElement.classList.add("dsh-bf-shake");
				window.setTimeout(function () {
					if (pillElement !== null) pillElement.classList.remove("dsh-bf-shake");
				}, 320);
			}
		}
		//#endregion

		//#region component
		/** Build the footer action component bound to one plugin context.
		 * @param ctx - client plugin context.
		 * @returns the React component registered into the sidebar foot slot.
		 */
		function createBalanceAction(ctx) {
			return function BalanceAction(props) {
				const wide = !props || props.wide !== false;
				const [state, setState] = React.useState({ status: "loading", currency: "CNY", cents: null, bonusCents: 0, error: false, updatedAt: 0 });
				const previous = React.useRef(null);
				const refreshRef = React.useRef(null);

				React.useEffect(function () {
					let alive = true;
					const read = async function () {
						let result;
						try {
							result = await ctx.remote.account.getBalance({
								version: readVersion(),
								locale: readLocale(ctx),
								timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60
							});
						} catch (error) {
							if (alive) setState(function (s) { return Object.assign({}, s, { error: true }); });
							return;
						}
						if (!alive) return;
						if (!result || result.ok !== true) {
							setState(function (s) { return Object.assign({}, s, { error: true }); });
							return;
						}
						const payload = result.value;
						if (!payload || payload.status !== "ready") {
							previous.current = null;
							setState({ status: "signed-out", currency: "CNY", cents: null, bonusCents: 0, error: false, updatedAt: Date.now() });
							return;
						}
						const wallets = Array.isArray(payload.value) ? payload.value : [];
						const primary = wallets.filter(function (w) { return w && w.currency === "CNY"; })[0] || wallets[0];
						if (!primary) {
							previous.current = null;
							setState({ status: "signed-out", currency: "CNY", cents: null, bonusCents: 0, error: false, updatedAt: Date.now() });
							return;
						}
						const cents = toCents(primary.balance);
						if (cents === null) {
							setState(function (s) { return Object.assign({}, s, { error: true }); });
							return;
						}
						const bonusWallets = Array.isArray(payload.bonusWallets) ? payload.bonusWallets : [];
						let bonusCents = 0;
						for (const wallet of bonusWallets) {
							if (!wallet || wallet.currency !== primary.currency) continue;
							const value = toCents(wallet.balance);
							if (value !== null) bonusCents += value;
						}
						const prev = previous.current;
						previous.current = cents;
						if (prev !== null && cents !== prev) spawnFloater(cents - prev, primary.currency);
						setState({ status: "ready", currency: primary.currency, cents: cents, bonusCents: bonusCents, error: false, updatedAt: Date.now() });
					};

					refreshRef.current = read;
					read();
					const timer = window.setInterval(read, POLL_MS);
					const onVisibility = function () {
						if (document.visibilityState === "visible") read();
					};
					document.addEventListener("visibilitychange", onVisibility);
					return function () {
						alive = false;
						refreshRef.current = null;
						window.clearInterval(timer);
						document.removeEventListener("visibilitychange", onVisibility);
					};
				}, []);

				const money = state.cents === null ? "—" : formatMoney(state.cents, state.currency);
				const dotState = state.error ? "error" : state.status === "ready" ? "live" : "stale";
				const titleParts = [];
				titleParts.push(state.status === "signed-out" ? "尚未登录 DeepSeek 账号" : "余额 " + money);
				if (state.bonusCents > 0) titleParts.push("赠金 " + formatMoney(state.bonusCents, state.currency));
				if (state.error) titleParts.push("最近一次读取失败，显示的是上一次结果");
				if (state.updatedAt > 0) titleParts.push("更新于 " + new Date(state.updatedAt).toLocaleTimeString());
				titleParts.push("点击立即刷新");

				const children = [
					React.createElement("span", { key: "dot", className: "dsh-bf-dot", "data-state": dotState })
				];
				if (wide) {
					children.push(React.createElement("span", { key: "amount", className: "dsh-bf-amount" }, state.status === "signed-out" ? "未登录" : money));
					if (state.bonusCents > 0) {
						children.push(React.createElement("span", { key: "bonus", className: "dsh-bf-note" }, "赠金 " + Math.round(state.bonusCents / 100)));
					}
				}

				return React.createElement("button", {
					type: "button",
					className: "dsh-bf-pill",
					title: titleParts.join(" · "),
					"aria-label": "账户余额 " + (state.status === "signed-out" ? "未登录" : money),
					ref: function (node) { pillElement = node; },
					onClick: function () { if (refreshRef.current !== null) refreshRef.current(); }
				}, children);
			};
		}
		//#endregion

		//#region plugin
		/** Services the footer action needs before it may render. */
		const inject = ["slots", "locale", "remote", "remote.account"];
		/** Register the balance pill in the sidebar foot row, above Settings. */
		function apply(ctx) {
			const BalanceAction = createBalanceAction(ctx);
			ctx.slots.inject("sidebar.footer.action", function () {
				return ctx.slots.register({
					name: "sidebar.footer.action",
					id: "balance-floater",
					order: -1
				}, BalanceAction);
			});
		}
		//#endregion

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
