/**
 * Sidebar balance chip.
 *
 * Sits INSIDE the sidebar foot row, to the right of the account button: the
 * account launcher is registered into the single "settings.launcher" slot by
 * client-ui-settings-account, and that slot's row (SettingsRoot's triggerRow,
 * a flex row) is the only place in the foot that already lays children out
 * horizontally. So the chip is appended there as a sibling rather than into
 * "sidebar.footer.action", which is a separate block stacked above it.
 *
 * Re-appends itself if React drops the row on a route change, and hides itself
 * on the collapsed rail, where a 56px rail has no room beside the avatar.
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

		//#region styles
		const PLUGIN_ID = "dsh-balance-floater";
		/** The account button's row. The hash prefix changes per build; the suffix does not. */
		const HOST_SELECTOR = '[class*="_triggerRow"]';
		const css = [
			".dsh-bf-pill{flex:none;display:inline-flex;align-items:center;gap:5px;height:24px;margin:0 2px 0 auto;padding:0 8px;border:0;border-radius:var(--dsw-radius-md,8px);background:0 0;color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-primary,#6e6e73));font-family:inherit;font-size:12px;line-height:1;font-variant-numeric:tabular-nums;white-space:nowrap;cursor:pointer;transition:background 120ms ease,color 120ms ease}",
			".dsh-bf-pill:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12));color:var(--dsw-alias-label-primary,#1c1c1e)}",
			".dsh-bf-pill:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4c6ef5));outline-offset:1px}",
			".dsh-bf-dot{flex:none;width:6px;height:6px;border-radius:50%;background:#35d07f;box-shadow:0 0 6px rgba(53,208,127,.65);transition:background 120ms ease}",
			".dsh-bf-dot[data-state=stale]{background:#c9c9cf;box-shadow:none}",
			".dsh-bf-dot[data-state=error]{background:#ff9f43;box-shadow:0 0 6px rgba(255,159,67,.6)}",
			".dsh-bf-amount{font-weight:600}",
			".dsh-bf-bonus{flex:none;padding:1px 5px;border-radius:999px;background:rgba(53,208,127,.16);font-size:10px;font-weight:600;letter-spacing:.2px;color:inherit;opacity:.85}",
			".dsh-bf-pill.dsh-bf-shake{animation:dsh-bf-shake 300ms cubic-bezier(.36,.07,.19,.97)}",
			"@keyframes dsh-bf-shake{10%,90%{transform:translateX(-1px)}20%,80%{transform:translateX(2px)}30%,50%,70%{transform:translateX(-3px)}40%,60%{transform:translateX(3px)}100%{transform:none}}",
			// the collapsed rail is 36px wide: the avatar alone fills it
			'[class*="_triggerRow"][class*="_railRow"] .dsh-bf-pill,[data-sidebar-collapsed=true] .dsh-bf-pill{display:none}',
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
		const POLL_MS = 3 * 60 * 1000;
		/** Build version carried by account calls when the boot payload does not provide one. */
		const FALLBACK_VERSION = "0.2.1-rc.5";

		let pill = null;
		let dotNode = null;
		let amountNode = null;
		let bonusNode = null;
		let layer = null;
		let previousCents = null;
		let disposed = false;
		let refresh = null;

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

		/** @returns integer cents, or null when the platform string is not a number. */
		function toCents(text) {
			if (typeof text !== "string" && typeof text !== "number") return null;
			const value = Number(text);
			if (!Number.isFinite(value)) return null;
			return Math.round(value * 100);
		}

		function symbolOf(currency) {
			return currency === "USD" ? "$" : "¥";
		}

		/** @returns display text such as ¥41.82. */
		function formatMoney(cents, currency) {
			const abs = Math.abs(cents);
			const whole = Math.floor(abs / 100);
			const fraction = String(abs % 100).padStart(2, "0");
			return (cents < 0 ? "-" : "") + symbolOf(currency) + whole + "." + fraction;
		}

		/** @returns the fixed overlay that owns every floating number. */
		function ensureLayer() {
			if (layer !== null && layer.isConnected) return layer;
			layer = document.getElementById("dsh-bf-layer");
			if (layer === null) {
				layer = document.createElement("div");
				layer.id = "dsh-bf-layer";
				layer.className = "dsh-bf-layer";
				document.body.appendChild(layer);
			}
			return layer;
		}

		/** Float one signed delta from the chip, arcade style. */
		function spawnFloater(deltaCents, currency) {
			if (typeof document === "undefined" || deltaCents === 0) return;
			const host = ensureLayer();
			const up = deltaCents > 0;
			const amount = Math.abs(deltaCents) / 100;
			const node = document.createElement("div");
			node.className = "dsh-bf-float " + (up ? "dsh-bf-heal" : "dsh-bf-hit");
			node.textContent = (up ? "+" : "-") + symbolOf(currency) + amount.toFixed(2);
			if (!up && amount >= 1) node.classList.add("dsh-bf-crit");

			let x = window.innerWidth * 0.5;
			let y = window.innerHeight - 96;
			if (pill !== null && pill.isConnected) {
				const rect = pill.getBoundingClientRect();
				x = rect.left + rect.width * 0.5;
				y = rect.top - 2;
			}
			node.style.left = x + "px";
			node.style.top = y + "px";
			node.style.setProperty("--dsh-bf-dx", ((Math.random() - 0.5) * 56).toFixed(1) + "px");
			node.style.setProperty("--dsh-bf-rot", ((Math.random() - 0.5) * 14).toFixed(1) + "deg");
			host.appendChild(node);

			const drop = function () { node.remove(); };
			node.addEventListener("animationend", drop, { once: true });
			window.setTimeout(drop, 2000);

			if (pill !== null && pill.isConnected) {
				pill.classList.add("dsh-bf-shake");
				window.setTimeout(function () {
					if (pill !== null) pill.classList.remove("dsh-bf-shake");
				}, 320);
			}
		}
		//#endregion

		//#region the chip
		/** Build the chip once; later calls return the same node. */
		function buildPill() {
			const button = document.createElement("button");
			button.type = "button";
			button.className = "dsh-bf-pill";
			dotNode = document.createElement("span");
			dotNode.className = "dsh-bf-dot";
			dotNode.dataset.state = "stale";
			amountNode = document.createElement("span");
			amountNode.className = "dsh-bf-amount";
			amountNode.textContent = "—";
			bonusNode = document.createElement("span");
			bonusNode.className = "dsh-bf-bonus";
			bonusNode.hidden = true;
			button.appendChild(dotNode);
			button.appendChild(amountNode);
			button.appendChild(bonusNode);
			button.addEventListener("click", function () {
				if (refresh !== null) refresh();
			});
			pill = button;
			return button;
		}

		/** Put the chip in the account row, left of nothing and right of the avatar. */
		function mount() {
			if (disposed) return;
			const host = document.querySelector(HOST_SELECTOR);
			if (host === null) return;
			const node = pill !== null ? pill : buildPill();
			if (node.parentElement !== host) host.appendChild(node);
		}

		/** Paint one snapshot into the chip. */
		function paint(state) {
			if (pill === null || amountNode === null || dotNode === null) return;
			const signedOut = state.status === "signed-out";
			const money = state.cents === null ? "—" : formatMoney(state.cents, state.currency);
			amountNode.textContent = signedOut ? "未登录" : money;
			dotNode.dataset.state = state.error ? "error" : state.status === "ready" ? "live" : "stale";
			if (bonusNode !== null) {
				const showBonus = !signedOut && state.bonusCents > 0;
				bonusNode.hidden = !showBonus;
				bonusNode.textContent = showBonus ? "赠" + formatMoney(state.bonusCents, state.currency) : "";
			}

			const parts = [signedOut ? "尚未登录 DeepSeek 账号" : "余额 " + money];
			if (state.bonusCents > 0) parts.push("赠金 " + formatMoney(state.bonusCents, state.currency));
			if (state.error) parts.push("最近一次读取失败，显示的是上一次结果");
			if (state.updatedAt > 0) parts.push("更新于 " + new Date(state.updatedAt).toLocaleTimeString());
			parts.push("每 3 分钟自动刷新 · 点击立即刷新");
			pill.title = parts.join(" · ");
			pill.setAttribute("aria-label", "账户余额 " + (signedOut ? "未登录" : money));
		}
		//#endregion

		//#region plugin
		/** Services the chip needs before it may poll. */
		const inject = ["locale", "remote", "remote.account"];

		/** Mount the chip into the account row and keep the balance fresh. */
		function apply(ctx) {
			const state = { status: "loading", currency: "CNY", cents: null, bonusCents: 0, error: false, updatedAt: 0 };

			refresh = async function () {
				if (disposed) return;
				let result;
				try {
					result = await ctx.remote.account.getBalance({
						version: readVersion(),
						locale: readLocale(ctx),
						timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60
					});
				} catch (error) {
					state.error = true;
					paint(state);
					return;
				}
				if (disposed) return;
				if (!result || result.ok !== true) {
					state.error = true;
					paint(state);
					return;
				}
				const payload = result.value;
				const wallets = payload && payload.status === "ready" && Array.isArray(payload.value) ? payload.value : [];
				const primary = wallets.filter(function (w) { return w && w.currency === "CNY"; })[0] || wallets[0];
				if (!primary) {
					previousCents = null;
					Object.assign(state, { status: "signed-out", cents: null, bonusCents: 0, error: false, updatedAt: Date.now() });
					paint(state);
					return;
				}
				const cents = toCents(primary.balance);
				if (cents === null) {
					state.error = true;
					paint(state);
					return;
				}
				const bonusWallets = payload && Array.isArray(payload.bonusWallets) ? payload.bonusWallets : [];
				let bonusCents = 0;
				for (const wallet of bonusWallets) {
					if (!wallet || wallet.currency !== primary.currency) continue;
					const value = toCents(wallet.balance);
					if (value !== null) bonusCents += value;
				}
				const previous = previousCents;
				previousCents = cents;
				if (previous !== null && cents !== previous) spawnFloater(cents - previous, primary.currency);
				Object.assign(state, { status: "ready", currency: primary.currency, cents: cents, bonusCents: bonusCents, error: false, updatedAt: Date.now() });
				paint(state);
			};

			ctx.effect(function () {
				disposed = false;
				mount();

				// React replaces the foot subtree on route changes; follow it back in.
				const observer = new MutationObserver(function () {
					if (disposed) return;
					if (pill === null || !pill.isConnected) mount();
				});
				if (document.body !== null) observer.observe(document.body, { childList: true, subtree: true });

				const onVisible = function () {
					if (document.visibilityState === "visible") refresh();
				};
				document.addEventListener("visibilitychange", onVisible);

				refresh();
				const timer = window.setInterval(refresh, POLL_MS);

				return function () {
					disposed = true;
					observer.disconnect();
					window.clearInterval(timer);
					document.removeEventListener("visibilitychange", onVisible);
					if (pill !== null) pill.remove();
					if (layer !== null) layer.remove();
					pill = null;
					layer = null;
					dotNode = null;
					amountNode = null;
					bonusNode = null;
					refresh = null;
				};
			}, "dsh-balance-floater: account chip");
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
