/**
 * Theme manager — client half.
 *
 * Renders one Settings → General row listing every installed palette plus a
 * "default" chip, and flips `body[data-dsh-theme]` on selection. The stylesheets
 * for all packs are already in the page (the host half injects them per render),
 * so switching is instant and needs no reload.
 *
 * The catalogue arrives through `globalThis.__DSH_THEME_MANAGER__`, written by
 * the host boot script before the first paint.
 */
window.__ModuleLoader__.load({
	id: "dsh-theme-picker",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");

		//#region constants
		const NS = "theme-picker";
		const STORAGE_KEY = "dsh-theme:active";
		const ATTRIBUTE = "data-dsh-theme";
		const SLOT = "settings.general.item";

		const DICTIONARIES = {
			zh: {
				title: "主题",
				description: "选择界面配色。所有已安装的主题都已加载，点一下立即切换，不用重启。",
				value: "当前：",
				fallback: "默认",
				empty: "还没有安装主题包。把带 dsh.theme 声明的包放进 profiles/node_modules 就会出现在这里。",
				light: "这套主题是深色的，建议把外观也切到深色。"
			},
			en: {
				title: "Theme",
				description: "Pick an interface palette. Every installed theme is already loaded, so switching is instant.",
				value: "Current: ",
				fallback: "Default",
				empty: "No theme packs installed. Drop a package declaring dsh.theme into profiles/node_modules.",
				light: "This theme is dark; consider switching the appearance to dark too."
			}
		};

		const ROW_CSS = [
			".dsh-tm-row{display:flex;flex-direction:column;gap:10px;padding:16px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}",
			".dsh-tm-head{display:flex;justify-content:space-between;align-items:baseline;gap:24px}",
			".dsh-tm-text{min-width:0}",
			".dsh-tm-title{font-size:14px;line-height:20px;color:var(--dsw-alias-label-primary)}",
			".dsh-tm-description{margin-top:4px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}",
			".dsh-tm-hint{margin-top:4px;font-size:12px;line-height:18px;color:var(--dsw-alias-state-warn-label,#ffb86c)}",
			".dsh-tm-value{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}",
			".dsh-tm-grid{display:flex;flex-wrap:wrap;gap:8px}",
			".dsh-tm-chip{display:inline-flex;align-items:center;gap:8px;padding:5px 10px 5px 6px;border-radius:10px;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:20px;cursor:pointer;transition:border-color 120ms ease,background 120ms ease}",
			".dsh-tm-chip:hover{background:var(--dsw-alias-interactive-bg-hover)}",
			".dsh-tm-chip:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4c6ef5));outline-offset:2px}",
			".dsh-tm-chip[data-active=true]{border-color:var(--dsw-alias-brand-primary);box-shadow:inset 0 0 0 1px var(--dsw-alias-brand-primary)}",
			".dsh-tm-swatches{display:flex;gap:2px}",
			".dsh-tm-dot{width:10px;height:10px;border-radius:50%;box-shadow:inset 0 0 0 .5px #00000055}",
			".dsh-tm-native{display:flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:6px;border:.5px dashed var(--dsw-alias-border-l3);font-size:11px;color:var(--dsw-alias-label-tertiary)}"
		].join("\n");
		//#endregion

		//#region state
		/** Catalogue published by the host boot script. */
		function readCatalog() {
			const boot = globalThis.__DSH_THEME_MANAGER__;
			if (boot && Array.isArray(boot.themes)) {
				return { themes: boot.themes, active: typeof boot.active === "string" ? boot.active : null };
			}
			return { themes: [], active: null };
		}

		const catalog = readCatalog();
		let state = { active: catalog.active };
		const listeners = new Set();
		let snapshot = { active: state.active, themes: catalog.themes };

		function emit() {
			snapshot = { active: state.active, themes: catalog.themes };
			for (const listener of [...listeners]) listener();
		}

		function subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		}

		function getSnapshot() {
			return snapshot;
		}

		/** Apply one theme id to the document, or clear it for the default. */
		function paint() {
			if (typeof document === "undefined" || !document.body) return;
			if (state.active === null) document.body.removeAttribute(ATTRIBUTE);
			else document.body.setAttribute(ATTRIBUTE, state.active);
			nudgeDesktopChrome();
		}

		/**
		 * Force the Desktop shell to re-measure the Windows caption palette.
		 *
		 * The three window buttons are drawn by Electron's titleBarOverlay, and the
		 * shell preload derives their colors from a hidden probe reading
		 * `--dsw-specific-sidebar-fill` and `--dsw-alias-label-primary`. Its
		 * MutationObserver watches only `data-ds-dark-theme` and `style` on <body>,
		 * so flipping `data-dsh-theme` alone leaves the caption strip on the previous
		 * palette. Writing one throwaway inline custom property trips that observer;
		 * the next frame removes it so the DOM carries no leftovers.
		 */
		function nudgeDesktopChrome() {
			try {
				if (typeof requestAnimationFrame !== "function") return;
				document.body.style.setProperty("--dsh-theme-tick", String(Date.now()));
				requestAnimationFrame(() => {
					try {
						document.body.style.removeProperty("--dsh-theme-tick");
					} catch (error) {
						/* already gone: nothing to undo */
					}
				});
			} catch (error) {
				/* no DOM, no caption bar */
			}
		}

		/** Select a theme id (or null for the shipped palette) and persist it. */
		function setActive(id) {
			const next = typeof id === "string" && catalog.themes.some((theme) => theme.id === id) ? id : null;
			state.active = next;
			try {
				if (next === null) localStorage.removeItem(STORAGE_KEY);
				else localStorage.setItem(STORAGE_KEY, next);
			} catch (error) {
				/* storage unavailable: the choice lasts for this page only */
			}
			if (globalThis.__DSH_THEME_MANAGER__) globalThis.__DSH_THEME_MANAGER__.active = next;
			paint();
			emit();
		}
		//#endregion

		//#region ui
		/** One palette chip: swatches plus the theme name. */
		function chip(theme, active, onSelect) {
			const swatches = Array.isArray(theme.swatches) ? theme.swatches.slice(0, 4) : [];
			const children = [];
			if (swatches.length > 0) {
				children.push(React.createElement(
					"span",
					{ key: "swatches", className: "dsh-tm-swatches", "aria-hidden": "true" },
					swatches.map((color) => React.createElement("span", { key: color, className: "dsh-tm-dot", style: { backgroundColor: color } }))
				));
			} else {
				children.push(React.createElement("span", { key: "native", className: "dsh-tm-native", "aria-hidden": "true" }, "A"));
			}
			children.push(React.createElement("span", { key: "name" }, theme.name));
			return React.createElement("button", {
				key: theme.id,
				type: "button",
				className: "dsh-tm-chip",
				"data-active": active ? "true" : "false",
				"aria-pressed": active ? "true" : "false",
				title: theme.description || theme.name,
				onClick: () => onSelect(theme.id)
			}, children);
		}

		/** Settings → General row. */
		function ThemeRow(props) {
			const current = React.useSyncExternalStore(props.subscribe, props.getSnapshot, props.getSnapshot);
			const translate = typeof props.t === "function" ? props.t : (key) => DICTIONARIES.en[key] || key;
			const themes = current.themes;
			const selected = themes.filter((theme) => theme.id === current.active)[0];
			const chips = [];
			chips.push(React.createElement("button", {
				key: "__default__",
				type: "button",
				className: "dsh-tm-chip",
				"data-active": current.active === null ? "true" : "false",
				"aria-pressed": current.active === null ? "true" : "false",
				onClick: () => props.setActive(null)
			}, [
				React.createElement("span", { key: "native", className: "dsh-tm-native", "aria-hidden": "true" }, "A"),
				React.createElement("span", { key: "name" }, translate("fallback"))
			]));
			for (const theme of themes) chips.push(chip(theme, theme.id === current.active, props.setActive));

			const hint = selected && selected.colorScheme === "dark" && props.light === true
				? React.createElement("div", { className: "dsh-tm-hint" }, translate("light"))
				: null;

			return React.createElement("div", { className: "dsh-tm-row" }, [
				React.createElement("div", { key: "head", className: "dsh-tm-head" }, [
					React.createElement("div", { key: "text", className: "dsh-tm-text" }, [
						React.createElement("div", { key: "title", className: "dsh-tm-title" }, translate("title")),
						React.createElement("div", { key: "desc", className: "dsh-tm-description" }, translate("description")),
						hint
					]),
					React.createElement("div", { key: "value", className: "dsh-tm-value" }, translate("value") + (selected ? selected.name : translate("fallback")))
				]),
				React.createElement("div", { key: "grid", className: "dsh-tm-grid" }, chips),
				themes.length === 0 && current.active === null ? null : null
			]);
		}
		//#endregion

		//#region plugin
		const inject = ["slots", "locale", "theme"];

		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, DICTIONARIES), "theme-manager: locale");

			ctx.effect(() => {
				if (typeof document === "undefined") return () => {};
				if (document.querySelector("style[data-plugin=\"dsh-theme-picker\"]")) return () => {};
				const tag = document.createElement("style");
				tag.dataset.plugin = "dsh-theme-picker";
				tag.textContent = ROW_CSS;
				document.head.appendChild(tag);
				return () => tag.remove();
			}, "theme-manager: row styles");

			paint();
			ctx.on("theme/change", () => emit());

			ctx.slots.inject(SLOT, () => ctx.slots.register({
				name: SLOT,
				id: "theme-manager",
				order: 11,
				locale: NS,
				inject: () => ({
					subscribe: subscribe,
					getSnapshot: getSnapshot,
					setActive: setActive,
					get light() { return ctx.theme.getTheme().active.colorScheme === "light"; }
				})
			}, ThemeRow));
		}
		//#endregion

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
