/*
 * marketing-site: runtime of the single-file HTML draft. Plain JS, no dependencies.
 * scripts/assemble-draft.mjs inlines it. Pieces: hash router (#/page, #/alle), mobile menu,
 * sticky CTA, typing headline, funnel engine (config in <script type="application/json" id="funnel-config">),
 * dataLayer events (logged to the console in the draft).
 */
(function () {
	"use strict";

	window.dataLayer = window.dataLayer || [];
	function track(event, params) {
		var e = Object.assign({ event: event }, params || {});
		window.dataLayer.push(e);
		console.info("[track]", e);
	}

	/* ---------- router: #/<page>[?a=b], #/alle shows every page ---------- */
	var pages = Array.prototype.slice.call(document.querySelectorAll("[data-page]"));

	/* the closing block exists once (<section data-closing>); <div data-closing-slot></div> repeats it */
	var closing = document.querySelector("[data-closing]");
	if (closing) {
		document.querySelectorAll("[data-closing-slot]").forEach(function (slot) {
			slot.replaceWith(closing.cloneNode(true));
		});
	}
	function parseHash() {
		var raw = location.hash.replace(/^#\/?/, "");
		var parts = raw.split("?");
		var params = {};
		(parts[1] || "").split("&").forEach(function (kv) {
			if (!kv) return;
			var p = kv.split("=");
			params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || "");
		});
		return { page: parts[0] || pages[0].getAttribute("data-page"), params: params };
	}
	function route() {
		var r = parseHash();
		var all = r.page === "alle";
		document.body.classList.toggle("show-all", all);
		var found = false;
		pages.forEach(function (p) {
			var on = p.getAttribute("data-page") === r.page;
			found = found || on;
			p.classList.toggle("is-active", on);
		});
		if (!all && !found) {
			pages[0].classList.add("is-active");
			r.page = pages[0].getAttribute("data-page");
		}
		document.querySelectorAll('a[href^="#/"]').forEach(function (a) {
			var href = a.getAttribute("href").replace(/^#\//, "");
			// links to a section (?s=id) never mark the page as current
			if (href.split("?")[0] === r.page && href.indexOf("s=") === -1) a.setAttribute("aria-current", "page");
			else a.removeAttribute("aria-current");
		});
		document.querySelector(".site-header") && document.querySelector(".site-header").classList.remove("is-open");
		var active = document.querySelector('[data-page="' + r.page + '"]');
		// funnel pages (data-bare): no header, footer or sticky CTA, only their own "Schließen"
		document.body.classList.toggle("is-bare", Boolean(active && !all && active.hasAttribute("data-bare")));
		if (active && !all) {
			var title = active.getAttribute("data-title");
			if (title) document.title = title;
			// #/page?s=<id> scrolls to a section of that page (in-page anchors do not work with a hash router)
			var section = r.params.s && document.getElementById(r.params.s);
			if (section) section.scrollIntoView();
			else window.scrollTo(0, 0);
		}
		document.querySelectorAll("[data-funnel]").forEach(function (el) {
			if (all || el.closest('[data-page="' + r.page + '"]')) startFunnel(el, r.params);
		});
		watchSticky();
	}
	if (pages.length) {
		window.addEventListener("hashchange", route);
	}

	/* ---------- mobile menu ---------- */
	document.addEventListener("click", function (e) {
		var t = e.target.closest(".menu-toggle");
		var db = e.target.closest(".draft-bar__toggle");
		if (db) db.parentNode.classList.toggle("is-open");
		if (e.target.closest(".draft-bar a")) {
			var bar = e.target.closest(".draft-bar");
			bar.classList.remove("is-open");
		}
		if (t) {
			var h = t.closest(".site-header");
			var open = h.classList.toggle("is-open");
			t.setAttribute("aria-expanded", open ? "true" : "false");
		}
		var cta = e.target.closest("[data-cta]");
		if (cta) track("cta_click", { cta_position: cta.getAttribute("data-cta"), cta_text: cta.textContent.trim() });
	});

	/* ---------- sticky CTA: visible once the page's hero CTA has left the viewport ---------- */
	var observer;
	function watchSticky() {
		var sticky = document.querySelector(".sticky-cta");
		if (!sticky || !("IntersectionObserver" in window)) return;
		if (observer) observer.disconnect();
		var active = document.querySelector("[data-page].is-active") || document;
		var heroCta = active.querySelector('[data-cta="hero"]');
		if (document.body.classList.contains("is-bare")) {
			sticky.classList.remove("is-on");
			return;
		}
		if (!heroCta) {
			sticky.classList.add("is-on");
			return;
		}
		observer = new IntersectionObserver(function (entries) {
			sticky.classList.toggle("is-on", !entries[0].isIntersecting && entries[0].boundingClientRect.top < 0);
		});
		observer.observe(heroCta);
	}

	/* ---------- typing headline: <span data-typing='["Belege ordnet.","Angebote schreibt."]'> ---------- */
	document.querySelectorAll("[data-typing]").forEach(function (el) {
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		var words = JSON.parse(el.getAttribute("data-typing"));
		var i = 0,
			n = 0,
			del = false;
		var caret = document.createElement("i");
		caret.className = "caret";
		el.after(caret);
		(function tick() {
			var w = words[i];
			n += del ? -1 : 1;
			el.textContent = w.slice(0, n);
			var wait = del ? 35 : 70;
			if (!del && n === w.length) {
				del = true;
				wait = 1800;
			} else if (del && n === 0) {
				del = false;
				i = (i + 1) % words.length;
				wait = 300;
			}
			setTimeout(tick, wait);
		})();
	});

	/* ---------- funnel engine ---------- */
	var config = null;
	try {
		var node = document.getElementById("funnel-config");
		if (node) config = JSON.parse(node.textContent);
	} catch (err) {
		console.error("funnel-config is not valid JSON", err);
	}

	function esc(s) {
		return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
			return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
		});
	}
	function fill(tpl, ctx) {
		return String(tpl || "").replace(/\{([\w.]+)\}/g, function (_, k) {
			var p = k.split(".");
			var v = ctx[p[0]];
			if (p[1] && v) v = v[p[1]];
			return v == null ? "" : esc(v);
		});
	}
	function evalExpr(expr, vars) {
		var names = Object.keys(vars);
		var fn = Function.apply(null, names.concat('"use strict"; return (' + expr + ");"));
		return fn.apply(null, names.map(function (k) {
			return vars[k];
		}));
	}
	function fmt(n, digits) {
		return Number(n).toLocaleString("de-DE", { maximumFractionDigits: digits == null ? 0 : digits });
	}

	function startFunnel(root, params) {
		if (!config) return;
		if (root.__funnel) {
			// re-entering the page (maybe with new ?params): start fresh, drop old listeners
			var fresh = root.cloneNode(false);
			root.replaceWith(fresh);
			root = fresh;
		}
		root.__funnel = true;
		var steps = config.steps;
		var answers = {};
		var idx = 0;
		var started = false;
		Object.keys(params || {}).forEach(function (k) {
			var step = steps.filter(function (s) {
				return s.id === k;
			})[0];
			if (step && step.options.some(function (o) { return o.value === params[k]; })) {
				answers[k] = step.type === "multi" ? [params[k]] : params[k];
			}
		});
		// every other parameter (?paket=, ?modul=, ?rolle=, utm_*) travels with the lead as context
		var context = {};
		Object.keys(params || {}).forEach(function (k) {
			if (!steps.some(function (s) { return s.id === k; })) context[k] = params[k];
		});
		while (idx < steps.length && answers[steps[idx].id] && steps[idx].type !== "multi") idx++;

		function vars() {
			var v = {};
			steps.forEach(function (s) {
				var a = answers[s.id];
				var opt = s.options.filter(function (o) {
					return o.value === a;
				})[0];
				v[s.id] = opt && opt.n != null ? opt.n : null;
			});
			return v;
		}
		function labels() {
			var l = {};
			steps.forEach(function (s) {
				var a = answers[s.id];
				var vals = Array.isArray(a) ? a : a == null ? [] : [a];
				l[s.id] = {
					label: s.options
						.filter(function (o) {
							return vals.indexOf(o.value) > -1;
						})
						.map(function (o) {
							return o.label;
						})
						.join(", "),
				};
			});
			return l;
		}
		// questions + result + contact; the contact step is never 100 %, nothing is sent yet
		function progress() {
			var total = steps.length + 2;
			return Math.round((Math.min(idx, total - 1) / total) * 100);
		}
		function head() {
			return (
				'<div class="funnel__meta"><span>' + esc(config.name || "Check") + "</span><span>Fortschritt " + progress() + " %</span></div>" +
				'<div class="progress"><i style="width:' + progress() + '%"></i></div>'
			);
		}
		function nav(right) {
			return (
				'<div class="funnel__nav">' +
				(idx > 0 ? '<button type="button" class="link-btn" data-back>← zurück</button>' : "<span></span>") +
				"<span>" + right + "</span></div>"
			);
		}

		function render() {
			if (idx < steps.length) return renderStep(steps[idx]);
			if (idx === steps.length && config.result) return renderResult();
			return renderContact();
		}

		function renderStep(s) {
			if (!started) {
				started = true;
				track("funnel_start", { funnel: config.name });
			}
			var multi = s.type === "multi";
			var current = answers[s.id] || (multi ? [] : null);
			var html = head();
			html += "<h2>" + esc(s.question) + "</h2>";
			if (s.hint) html += '<p class="hint">' + esc(s.hint) + "</p>";
			html += '<div class="options">';
			s.options.forEach(function (o) {
				var on = multi ? current.indexOf(o.value) > -1 : current === o.value;
				html +=
					'<button type="button" class="option" data-value="' + esc(o.value) + '" aria-pressed="' + on + '"><b>' +
					esc(o.label) + "</b>" + (o.sub ? "<small>" + esc(o.sub) + "</small>" : "") + "</button>";
			});
			html += "</div>";
			if (multi) {
				html += '<button type="button" class="btn btn--primary btn--block" data-next style="margin-top:18px"' +
					(current.length < (s.min || 1) ? " disabled" : "") + '>Weiter <span class="arrow"></span></button>';
			}
			if (s.skippable) html += '<p class="hint"><button type="button" class="link-btn" data-skip>Frage überspringen →</button></p>';
			html += nav("Frage " + (idx + 1) + " von " + steps.length);
			root.innerHTML = html;
		}

		function renderResult() {
			var r = config.result;
			var v = vars();
			var value = null;
			try {
				value = r.expr ? evalExpr(r.expr, v) : null;
			} catch (err) {
				console.warn("result.expr failed", err);
			}
			var ctx = Object.assign({}, labels(), { value: value == null ? "–" : fmt(value, r.digits) });
			var notes = (r.notes || []).filter(function (n) {
				return Object.keys(n.when || {}).every(function (k) {
					var a = answers[k];
					var want = n.when[k];
					var list = Array.isArray(want) ? want : [want];
					return Array.isArray(a) ? a.some(function (x) { return list.indexOf(x) > -1; }) : list.indexOf(a) > -1;
				});
			});
			var html = head();
			html += "<h2>" + esc(r.title) + "</h2>";
			if (r.expr) {
				html += '<div class="result"><div class="card__label">' + esc(r.label) + '</div><div class="result__value">' +
					fill(r.valueTemplate || "{value}", ctx) + '</div><p class="hint">' + fill(r.explain, ctx) + "</p></div>";
			}
			notes.forEach(function (n) {
				html += '<p class="hint">' + fill(n.text, ctx) + "</p>";
			});
			html += '<dl class="summary" style="margin-top:18px">';
			steps.forEach(function (s) {
				html += "<dt>" + esc(s.short || s.id) + "</dt><dd>" + (ctx[s.id].label ? esc(ctx[s.id].label) : "–") + "</dd>";
			});
			html += "</dl>";
			html += '<button type="button" class="btn btn--primary btn--block" data-next style="margin-top:22px">' +
				esc(r.cta || "Weiter zur Kontaktangabe") + ' <span class="arrow"></span></button>';
			html += nav("");
			root.innerHTML = html;
			track("funnel_result_view", { funnel: config.name, estimate: value });
		}

		function renderContact() {
			var c = config.contact;
			var html = head();
			html += "<h2>" + esc(c.title) + "</h2>";
			if (c.promise) html += '<p class="hint">' + esc(c.promise) + "</p>";
			html += '<form class="form" novalidate>';
			c.fields.forEach(function (f) {
				var label = esc(f.label) + (f.required ? "" : " <small>(optional)</small>");
				var cls = "field" + (f.full ? " field--full" : "");
				var attrs = ' name="' + esc(f.name) + '"' + (f.required ? " required" : "") +
					(f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : "") + (f.autocomplete ? ' autocomplete="' + esc(f.autocomplete) + '"' : "");
				if (f.type === "select") {
					html += '<label class="' + cls + '">' + label + "<select" + attrs + ">" +
						f.options.map(function (o) { return "<option>" + esc(o) + "</option>"; }).join("") + "</select></label>";
				} else if (f.type === "textarea") {
					html += '<label class="' + cls + '">' + label + "<textarea" + attrs + "></textarea></label>";
				} else {
					html += '<label class="' + cls + '">' + label + '<input type="' + esc(f.type || "text") + '"' + attrs + "></label>";
				}
			});
			html += '<button type="submit" class="btn btn--primary">' + esc(c.submit || "Anfrage senden") + ' <span class="arrow"></span></button>';
			if (c.legal) html += '<p class="legal">' + c.legal + "</p>";
			html += "</form>";
			html += nav("Letzter Schritt: Kontakt");
			root.innerHTML = html;
		}

		function submit(form) {
			var data = {};
			new FormData(form).forEach(function (v, k) {
				data[k] = v;
			});
			var missing = config.contact.fields.filter(function (f) {
				return f.required && !String(data[f.name] || "").trim();
			});
			if (missing.length) {
				form.querySelector('[name="' + missing[0].name + '"]').focus();
				return;
			}
			var lead = {
				funnel: config.name,
				answers: answers,
				context: context,
				contact: data,
				page: location.href,
				utm: Object.fromEntries(new URLSearchParams(location.search)),
				created_at: new Date().toISOString(),
			};
			track("lead_submit", { funnel: config.name });
			var done = function () {
				root.innerHTML = '<div class="success"><h2>' + esc(config.contact.successTitle || "Danke, Ihre Anfrage ist da.") +
					'</h2><p class="hint">' + esc(config.contact.successText || "") + "</p></div>";
			};
			if (config.webhook) {
				fetch(config.webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(lead) })
					.then(done)
					.catch(function (err) {
						console.error("webhook failed", err);
						done();
					});
			} else {
				console.info("[lead] no webhook configured, lead not sent:", lead);
				done();
			}
		}

		root.addEventListener("click", function (e) {
			var s = steps[idx];
			var opt = e.target.closest(".option");
			if (opt && s) {
				var v = opt.getAttribute("data-value");
				if (s.type === "multi") {
					var list = answers[s.id] || [];
					var at = list.indexOf(v);
					if (at > -1) list.splice(at, 1);
					else list.push(v);
					answers[s.id] = list;
					render();
				} else {
					answers[s.id] = v;
					track("funnel_step", { funnel: config.name, step: s.id, step_index: idx + 1, answer: v });
					idx++;
					render();
				}
				return;
			}
			if (e.target.closest("[data-next]")) {
				if (s) track("funnel_step", { funnel: config.name, step: s.id, step_index: idx + 1, answer: answers[s.id] });
				idx++;
				render();
			} else if (e.target.closest("[data-skip]")) {
				delete answers[s.id];
				idx++;
				render();
			} else if (e.target.closest("[data-back]")) {
				idx = Math.max(0, idx - 1);
				render();
			}
		});
		root.addEventListener("submit", function (e) {
			e.preventDefault();
			submit(e.target);
		});
		render();
	}

	/* the closing block embeds the first question as links: href="#/anfrage?bereich=belege" */
	if (pages.length) route();
	else {
		document.querySelectorAll("[data-funnel]").forEach(function (el) {
			startFunnel(el, Object.fromEntries(new URLSearchParams(location.search)));
		});
		watchSticky();
	}
})();
