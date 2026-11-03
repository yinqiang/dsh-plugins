/**
 * Theme manager — client half.
 *
 * Two features, one Settings → General row:
 *
 *   1. THEME — chips for every installed theme pack plus a "default" chip;
 *      selection flips body[data-dsh-theme]. All pack stylesheets are already
 *      in the page (the host half injects them per render), so switching is a
 *      single attribute flip with no reload and no flash.
 *
 *   2. BACKGROUND IMAGE — one image behind the whole app. Text-bearing surfaces
 *      (cards, composer, menus) stay mostly the theme color, while the page base
 *      and the sidebar go translucent, so the image reads in the empty space
 *      without washing the message area out. A "dim" scrim sits on top of the
 *      image, which is the single knob that fixes "too bright / too dark".
 *
 * The catalogue arrives through globalThis.__DSH_THEME_MANAGER__, written by the
 * host boot script before the first paint. The background is client-only and
 * persists to localStorage, so it needs no host restart.
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
		const BG_KEY = "dsh-theme:background";
		const ATTRIBUTE = "data-dsh-theme";
		const SLOT = "settings.general.item";

		/**
		 * Surfaces we turn translucent while a background image is active.
		 * [css custom property, opacity kept from the theme color]
		 * Higher opacity = closer to the theme (more opaque); lower = more image.
		 */
		const BG_TOKENS = [
			["--dsw-alias-bg-base", 0.12],
			["--dsw-specific-sidebar-fill", 0.30],
			["--dsw-alias-bg-layer-1", 0.72],
			["--dsw-alias-bg-layer-2", 0.78],
			["--dsw-alias-bg-layer-3", 0.84],
			["--dsw-specific-input-major", 0.65],
			["--dsw-specific-menu", 0.72]
		];
		const BG_INLINE_PROPS = ["background-image", "background-color", "background-size", "background-position", "background-repeat", "background-attachment"];
		const BG_SCRIM_DEFAULT = 0.45;

		const DICTIONARIES = {
			zh: {
				title: "主题",
				description: "选择界面配色。所有已安装的主题都已加载，点一下立即切换，不用重启。",
				value: "当前：",
				fallback: "默认",
				empty: "还没有安装主题包。把带 dsh.theme 声明的包放进 profiles/node_modules 就会出现在这里。",
				light: "这套主题是深色的，建议把外观也切到深色。",
				bgTitle: "背景图",
				bgDesc: "铺一张图在界面后面：文字区块保持主题色，只有页面底和侧栏透出图片。太亮就把「压暗」调高。",
				bgPick: "选择图片…",
				bgUrl: "图片 URL",
				bgApply: "应用",
				bgScrim: "压暗",
				bgRemove: "移除背景",
				bgNone: "未设置背景",
				bgUrlPlaceholder: "粘贴 https://… 图片地址",
				bgSource: "来源",
				bingPreset: "每日必应",
				wallhavenPreset: "随机壁纸",
				bgSourceBing: "每日必应 · 每次启动自动换成当天图",
				bgSourceWallhaven: "随机壁纸 · 每次启动换一张（wallhaven）",
				bgNotReady: "来源还没准备好，稍后重试或刷新页面。"
			},
			en: {
				title: "Theme",
				description: "Pick an interface palette. Every installed theme is already loaded, so switching is instant.",
				value: "Current: ",
				fallback: "Default",
				empty: "No theme packs installed. Drop a package declaring dsh.theme into profiles/node_modules.",
				light: "This theme is dark; consider switching the appearance to dark too.",
				bgTitle: "Background image",
				bgDesc: "Put an image behind the interface. Text surfaces keep the theme color; only the page base and sidebar go translucent. Raise Dim if it reads too bright.",
				bgPick: "Choose image…",
				bgUrl: "Image URL",
				bgApply: "Apply",
				bgScrim: "Dim",
				bgRemove: "Remove background",
				bgNone: "No background",
				bgUrlPlaceholder: "Paste an https:// image URL",
				bgSource: "Source",
				bingPreset: "Daily Bing",
				wallhavenPreset: "Random",
				bgSourceBing: "Daily Bing · refreshed on every launch",
				bgSourceWallhaven: "Random (wallhaven) · new image on every launch",
				bgNotReady: "Source is still warming up — try again in a moment or refresh."
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
			".dsh-tm-native{display:flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:6px;border:.5px dashed var(--dsw-alias-border-l3);font-size:11px;color:var(--dsw-alias-label-tertiary)}",
			".dsh-tm-bg{margin-top:4px;padding-top:14px;border-top:.5px solid var(--dsw-alias-border-l2);display:flex;flex-direction:column;gap:8px}",
			".dsh-tm-bg-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}",
			".dsh-tm-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:5px 10px;border-radius:8px;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:20px;cursor:pointer;transition:background 120ms ease}",
			".dsh-tm-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}",
			".dsh-tm-btn:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4c6ef5));outline-offset:2px}",
			".dsh-tm-btn[data-danger=true]{color:var(--dsw-alias-state-danger-label,#ff6b6b);border-color:var(--dsw-alias-state-danger-fill,#ff6b6b55)}",
			".dsh-tm-btn[data-active=true]{border-color:var(--dsw-alias-brand-primary);box-shadow:inset 0 0 0 1px var(--dsw-alias-brand-primary)}",
			".dsh-tm-input{flex:1;min-width:160px;box-sizing:border-box;padding:5px 10px;border-radius:8px;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:20px}",
			".dsh-tm-input:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4c6ef5));outline-offset:0}",
			".dsh-tm-slider{display:flex;align-items:center;gap:8px}",
			".dsh-tm-sliderlabel{font-size:12px;line-height:20px;color:var(--dsw-alias-label-secondary);white-space:nowrap}",
			".dsh-tm-range{flex:1;min-width:120px;accent-color:var(--dsw-alias-brand-primary)}",
			".dsh-tm-slidervalue{font-size:12px;line-height:20px;color:var(--dsw-alias-label-tertiary);min-width:36px;text-align:right;font-variant-numeric:tabular-nums}",
		].join("\n");
		//#endregion

		//#region state
		/** Font roles a pack may carry. */
		const FONT_ROLES = ["text", "code", "terminal"];
		/** Roles this plugin has overridden, so switching away can hand them back. */
		let appliedFontRoles = {};
		/** Theme service, captured in apply(). */
		let themeService = null;

		/**
		 * Apply a pack's declared fonts through the theme service (the terminal
		 * reads fontFamilies from the service store, so a CSS variable cannot
		 * reach it). Roles the previous pack overrode but this one does not are
		 * handed back to the built-in stack.
		 */
		function applyPackFonts(activeId) {
			const service = themeService;
			if (service === null || typeof service.setFontFamily !== "function") return;
			const pack = activeId === null ? null : catalog.themes.filter((theme) => theme.id === activeId)[0];
			const fonts = (pack && pack.fonts) || {};
			const next = {};
			for (const role of FONT_ROLES) {
				if (typeof fonts[role] === "string" && fonts[role] !== "") next[role] = fonts[role];
			}
			for (const role of FONT_ROLES) {
				try {
					if (next[role] !== undefined) service.setFontFamily(role, next[role]);
					else if (appliedFontRoles[role]) service.setFontFamily(role, "");
				} catch (error) {
					/* the host may refuse a write; the palette still applies */
				}
			}
			appliedFontRoles = next;
		}

		function readCatalog() {
			const boot = globalThis.__DSH_THEME_MANAGER__;
			if (boot && Array.isArray(boot.themes)) {
				return { themes: boot.themes, active: typeof boot.active === "string" ? boot.active : null };
			}
			return { themes: [], active: null };
		}

		function clamp(value, min, max) {
			const num = Number(value);
			if (!Number.isFinite(num)) return min;
			return Math.min(max, Math.max(min, num));
		}

		function readBackground() {
			try {
				const raw = localStorage.getItem(BG_KEY);
				if (raw === null) return { url: null, scrim: BG_SCRIM_DEFAULT, source: null };
				const parsed = JSON.parse(raw);
				if (!parsed || typeof parsed.url !== "string" || parsed.url === "") return { url: null, scrim: BG_SCRIM_DEFAULT, source: null };
				const source = parsed.source === "bing" || parsed.source === "wallhaven" ? parsed.source : null;
				return { url: parsed.url, scrim: clamp(parsed.scrim, 0, 0.9), source };
			} catch (error) {
				return { url: null, scrim: BG_SCRIM_DEFAULT, source: null };
			}
		}

		const catalog = readCatalog();
		let state = { active: catalog.active, background: readBackground() };
		const listeners = new Set();
		let snapshot = { active: state.active, themes: catalog.themes, background: state.background };

		function emit() {
			snapshot = { active: state.active, themes: catalog.themes, background: state.background };
			for (const listener of [...listeners]) listener();
		}

		function subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		}

		function getSnapshot() {
			return snapshot;
		}

		function clearBodyStyles() {
			if (typeof document === "undefined" || !document.body) return;
			for (const prop of BG_INLINE_PROPS) document.body.style.removeProperty(prop);
			for (const entry of BG_TOKENS) document.body.style.removeProperty(entry[0]);
		}

		function applyBackground() {
			if (typeof document === "undefined" || !document.body) return;
			clearBodyStyles();
			const bg = state.background;
			if (bg.url === null) return;
			const scrim = clamp(bg.scrim, 0, 0.9);
			const scrimColor = "rgba(14, 15, 21, " + scrim + ")";
			const body = document.body;
			body.style.backgroundImage = "linear-gradient(" + scrimColor + ", " + scrimColor + "), url(" + JSON.stringify(bg.url) + ")";
			body.style.backgroundColor = "transparent";
			body.style.backgroundSize = "cover";
			body.style.backgroundPosition = "center";
			body.style.backgroundRepeat = "no-repeat";
			body.style.backgroundAttachment = "fixed";
			for (const entry of BG_TOKENS) {
				const name = entry[0];
				const alpha = entry[1];
				const original = getComputedStyle(body).getPropertyValue(name).trim();
				if (original === "") continue;
				body.style.setProperty(name, "color-mix(in srgb, " + original + " " + Math.round(alpha * 100) + "%, transparent)");
			}
		}

		function paint() {
			if (typeof document === "undefined" || !document.body) return;
			if (state.active === null) document.body.removeAttribute(ATTRIBUTE);
			else document.body.setAttribute(ATTRIBUTE, state.active);
			applyBackground();
			nudgeDesktopChrome();
		}

		function nudgeDesktopChrome() {
			try {
				if (typeof requestAnimationFrame !== "function") return;
				document.body.style.setProperty("--dsh-theme-tick", String(Date.now()));
				requestAnimationFrame(() => {
					try {
						document.body.style.removeProperty("--dsh-theme-tick");
					} catch (error) {
						/* already gone */
					}
				});
			} catch (error) {
				/* no DOM, no caption bar */
			}
		}

		function setActive(id) {
			const next = typeof id === "string" && catalog.themes.some((theme) => theme.id === id) ? id : null;
			state.active = next;
			try {
				if (next === null) localStorage.removeItem(STORAGE_KEY);
				else localStorage.setItem(STORAGE_KEY, next);
			} catch (error) {
				/* storage unavailable */
			}
			if (globalThis.__DSH_THEME_MANAGER__) globalThis.__DSH_THEME_MANAGER__.active = next;
			paint();
			applyPackFonts(next);
			emit();
		}

		function setBackground(url, scrim, source) {
			const clean = typeof url === "string" && url !== "" ? url : null;
			const src = source === "bing" || source === "wallhaven" ? source : null;
			state.background = clean === null ? { url: null, scrim: BG_SCRIM_DEFAULT, source: null } : { url: clean, scrim: clamp(scrim, 0, 0.9), source: src };
			try {
				if (clean === null) localStorage.removeItem(BG_KEY);
				else localStorage.setItem(BG_KEY, JSON.stringify(state.background));
			} catch (error) {
				/* storage unavailable */
			}
			applyBackground();
			emit();
		}

		function clearBackground() {
			setBackground(null, BG_SCRIM_DEFAULT);
		}

		function fileToDataUrl(file) {
			return new Promise((resolve, reject) => {
				const objectUrl = URL.createObjectURL(file);
				const image = new Image();
				image.onload = () => {
					try {
						const max = 1920;
						const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
						const width = Math.max(1, Math.round(image.naturalWidth * scale));
						const height = Math.max(1, Math.round(image.naturalHeight * scale));
						const canvas = document.createElement("canvas");
						canvas.width = width;
						canvas.height = height;
						const context = canvas.getContext("2d");
						context.drawImage(image, 0, 0, width, height);
						const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
						resolve(dataUrl);
					} catch (error) {
						reject(error);
					} finally {
						URL.revokeObjectURL(objectUrl);
					}
				};
				image.onerror = () => {
					URL.revokeObjectURL(objectUrl);
					reject(new Error("cannot decode image"));
				};
				image.src = objectUrl;
			});
		}

		function hostSource(source) {
			const boot = globalThis.__DSH_THEME_MANAGER__;
			if (!boot || !boot.sources) return null;
			const url = boot.sources[source];
			return typeof url === "string" && url !== "" ? url : null;
		}

		function pickSource(source) {
			if (source !== "bing" && source !== "wallhaven") return Promise.resolve();
			const url = hostSource(source);
			if (url === null) return Promise.reject(new Error("not-ready"));
			setBackground(url, state.background.scrim, source);
			return Promise.resolve();
		}

		function refreshSource() {
			if (state.background.source === null) return;
			const url = hostSource(state.background.source);
			if (url !== null) setBackground(url, state.background.scrim, state.background.source);
		}
		//#endregion

		//#region ui
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

		function BackgroundControls(props) {
			const translate = props.translate;
			const background = props.background;
			const fileRef = React.useRef(null);
			const [urlText, setUrlText] = React.useState("");
			const [busy, setBusy] = React.useState(false);
			const [error, setError] = React.useState(null);

			const applyUrl = () => {
				const value = urlText.trim();
				if (value === "") return;
				props.setBackground(value, background.scrim);
				setUrlText("");
			};

			const pickFile = (file) => {
				setBusy(true);
				setError(null);
				fileToDataUrl(file).then((dataUrl) => {
					props.setBackground(dataUrl, background.scrim);
					setBusy(false);
				}, (reason) => {
					setError(String((reason && reason.message) || reason));
					setBusy(false);
				});
			};

			const onPickSource = (source) => {
				setBusy(true);
				setError(null);
				props.pickSource(source).then(() => {
					setBusy(false);
				}, (reason) => {
					const message = String((reason && reason.message) || reason);
					setError(message === "not-ready" ? translate("bgNotReady") : message);
					setBusy(false);
				});
			};

			const children = [
				React.createElement("div", { key: "title", className: "dsh-tm-title" }, translate("bgTitle")),
				React.createElement("div", { key: "desc", className: "dsh-tm-description" }, translate("bgDesc")),
				React.createElement("input", {
					key: "file",
					type: "file",
					accept: "image/*",
					style: { display: "none" },
					ref: fileRef,
					onChange: (event) => {
						const file = event.target.files && event.target.files[0];
						if (file) pickFile(file);
						event.target.value = "";
					}
				})
			];

			const buttons = [
				React.createElement("button", {
					key: "pick",
					type: "button",
					className: "dsh-tm-btn",
					onClick: () => fileRef.current && fileRef.current.click()
				}, busy ? "…" : translate("bgPick")),
				React.createElement("input", {
					key: "url",
					type: "text",
					className: "dsh-tm-input",
					placeholder: translate("bgUrlPlaceholder"),
					value: urlText,
					onChange: (event) => setUrlText(event.target.value),
					onKeyDown: (event) => { if (event.key === "Enter") applyUrl(); }
				}),
				React.createElement("button", {
					key: "apply",
					type: "button",
					className: "dsh-tm-btn",
					onClick: applyUrl
				}, translate("bgApply")),
				background.url !== null
					? React.createElement("button", {
						key: "remove",
						type: "button",
						className: "dsh-tm-btn",
						"data-danger": "true",
						onClick: props.clearBackground
					}, translate("bgRemove"))
					: null
			];
			children.push(React.createElement("div", { key: "row", className: "dsh-tm-bg-row" }, buttons));
			children.push(React.createElement("div", { key: "source", className: "dsh-tm-bg-row" }, [
				React.createElement("span", { key: "label", className: "dsh-tm-sliderlabel" }, translate("bgSource")),
				React.createElement("button", { key: "bing", type: "button", className: "dsh-tm-btn", "data-active": background.source === "bing" ? "true" : "false", onClick: () => onPickSource("bing") }, translate("bingPreset")),
				React.createElement("button", { key: "wallhaven", type: "button", className: "dsh-tm-btn", "data-active": background.source === "wallhaven" ? "true" : "false", onClick: () => onPickSource("wallhaven") }, translate("wallhavenPreset"))
			]));
			if (background.source !== null) {
				children.push(React.createElement("div", { key: "auto", className: "dsh-tm-value" }, translate(background.source === "bing" ? "bgSourceBing" : "bgSourceWallhaven")));
			}

			const pct = Math.round(clamp(background.scrim, 0, 0.9) * 100);
			children.push(React.createElement("div", { key: "slider", className: "dsh-tm-slider" }, [
				React.createElement("span", { key: "label", className: "dsh-tm-sliderlabel" }, translate("bgScrim")),
				React.createElement("input", {
					key: "range",
					type: "range",
					className: "dsh-tm-range",
					min: "0",
					max: "0.9",
					step: "0.05",
					value: String(background.scrim),
					onChange: (event) => props.setBackground(background.url, Number(event.target.value))
				}),
				React.createElement("span", { key: "value", className: "dsh-tm-slidervalue" }, pct + "%")
			]));

			if (error !== null) children.push(React.createElement("div", { key: "error", className: "dsh-tm-hint" }, String(error)));
			if (background.url === null) children.push(React.createElement("div", { key: "none", className: "dsh-tm-value" }, translate("bgNone")));

			return React.createElement("div", { className: "dsh-tm-bg" }, children);
		}

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

			const children = [
				React.createElement("div", { key: "head", className: "dsh-tm-head" }, [
					React.createElement("div", { key: "text", className: "dsh-tm-text" }, [
						React.createElement("div", { key: "title", className: "dsh-tm-title" }, translate("title")),
						React.createElement("div", { key: "desc", className: "dsh-tm-description" }, translate("description")),
						hint
					]),
					React.createElement("div", { key: "value", className: "dsh-tm-value" }, translate("value") + (selected ? selected.name : translate("fallback")))
				]),
				React.createElement("div", { key: "grid", className: "dsh-tm-grid" }, chips),
				React.createElement(BackgroundControls, {
					key: "bg",
					translate,
					background: current.background,
					setBackground: props.setBackground,
					pickSource: props.pickSource,
					clearBackground: props.clearBackground
				})
			];

			return React.createElement("div", { className: "dsh-tm-row" }, children);
		}
		//#endregion

		//#region plugin
		const inject = ["slots", "locale", "theme"];

		function apply(ctx) {
			themeService = ctx.theme;
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
			applyPackFonts(state.active);
			refreshSource();
			ctx.on("theme/change", () => {
				applyBackground();
				emit();
			});

			ctx.slots.inject(SLOT, () => ctx.slots.register({
				name: SLOT,
				id: "theme-manager",
				order: 11,
				locale: NS,
				inject: () => ({
					subscribe: subscribe,
					getSnapshot: getSnapshot,
					setActive: setActive,
					setBackground: setBackground,
					pickSource: pickSource,
					clearBackground: clearBackground,
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
