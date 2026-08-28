// Wiring: event delegation, input binding, persistence, boot. Typing only
// re-renders derived output (never the form being typed in) so focus is
// never lost; structural changes rebuild both.

;(function (CDA) {
  const { state, load, persist, quickOffer, syncQuick, demoOffer, setPath, getPath,
    exportJson, importJson, renderAll, renderOffers, renderDerived, offerComputed,
    parseMoney, parsePercent, parseApr, parseInt10, uid, esc,
    generateChecklist, checklistToText } = CDA

  // ── In-app modal — replaces window.confirm/alert ──────────────
  function modal(opts) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div")
      overlay.className = "modal-overlay"
      overlay.innerHTML = `
        <div class="modal-box" role="dialog" aria-modal="true">
          <p class="font-mono text-[0.625rem] tracking-[0.14em] ${opts.danger ? "text-bad" : "text-ink-faint"}">${opts.title}</p>
          <p class="mt-2 text-[0.9375rem] leading-relaxed">${opts.message}</p>
          <div class="mt-5 flex justify-end gap-2">
            ${opts.cancelLabel ? `<button class="btn btn-ghost" data-modal="cancel">${opts.cancelLabel}</button>` : ""}
            <button class="btn ${opts.danger ? "btn-danger" : ""}" data-modal="ok">${opts.confirmLabel || "OK"}</button>
          </div>
        </div>`
      const done = (val) => { overlay.remove(); document.removeEventListener("keydown", onKey); resolve(val) }
      const onKey = (e) => { if (e.key === "Escape") done(false) }
      overlay.addEventListener("click", (e) => {
        const btn2 = e.target instanceof Element ? e.target.closest("[data-modal]") : null
        if (btn2) { done(btn2.dataset.modal === "ok"); return }
        if (e.target === overlay) done(false)
      })
      document.addEventListener("keydown", onKey)
      document.body.appendChild(overlay)
      overlay.querySelector("[data-modal='ok']").focus({ preventScroll: true })
    })
  }
  const confirmModal = (title, message, confirmLabel) =>
    modal({ title, message, confirmLabel: confirmLabel || "Yes", cancelLabel: "Cancel", danger: true })
  const notice = (title, message) => modal({ title, message, confirmLabel: "OK" })

  const offersHost = document.querySelector("#offers")
  if (offersHost) boot()

  function boot() {
    load()
    syncHorizonControl()
    renderAll()

    const slider = document.querySelector("#horizon")
    slider.addEventListener("input", () => {
      state.horizon = parseInt(slider.value, 10)
      updateHorizonReadout()
      scheduleDerived()
      schedulePersist()
    })

    document.addEventListener("click", onClick)
    document.addEventListener("input", onInput)
    document.addEventListener("change", onChange)
    // Numeric fields: focusing a 0 clears it (typing starts fresh); focusing
    // a real value selects it all so typing replaces instead of appending
    document.addEventListener("focusin", (e) => {
      const el = e.target
      if (!(el instanceof HTMLInputElement) || !el.dataset.path) return
      const numeric = ["money", "money-null", "pct", "apr", "int", "int-null"]
      if (!numeric.includes(el.dataset.type || "")) return
      if (parseMoney(el.value) === 0) {
        el.value = ""
      } else {
        requestAnimationFrame(() => el.select())
      }
    })
  }

  function syncHorizonControl() {
    const slider = document.querySelector("#horizon")
    const maxTerm = Math.max.apply(null, [72].concat(state.offers.flatMap((o) => o.scenarios.map((s) => s.termMonths))))
    slider.max = String(maxTerm)
    slider.value = String(Math.min(state.horizon, maxTerm))
    updateHorizonReadout()
  }

  function updateHorizonReadout() {
    const out = document.querySelector("#horizon-value")
    if (out) out.textContent = state.horizon + " MONTHS"
  }

  // rAF-coalesced derived re-render — the slider must feel instant
  let derivedQueued = false
  function scheduleDerived() {
    if (derivedQueued) return
    derivedQueued = true
    requestAnimationFrame(() => {
      derivedQueued = false
      renderDerived()
    })
  }

  let persistTimer = 0
  function schedulePersist() {
    clearTimeout(persistTimer)
    persistTimer = window.setTimeout(persist, 300)
  }

  function structuralRender() {
    syncHorizonControl()
    renderOffers()
    renderDerived()
    persist()
  }

  // ── Click actions ─────────────────────────────────────────────
  function onClick(e) {
    const btn = e.target instanceof Element ? e.target.closest("[data-action]") : null
    if (!btn || btn.tagName === "INPUT") return
    const action = btn.dataset.action
    const id = btn.dataset.id

    switch (action) {
      case "add-quick": {
        // New offers start as DRAFTS: excluded from every ranking until saved,
        // so half-typed zeros never produce a fake verdict
        const offer = quickOffer({ label: "Offer " + (state.offers.length + 1), msrp: 0, otd: 0, rebate: 0, down: 0, apr: 6.99, term: 60 })
        offer.draft = true
        state.offers.push(offer)
        state.expandedOfferId = offer.id
        structuralRender()
        focusFirstField()
        break
      }
      case "save-offer": {
        const offer = state.offers.find((o) => o.id === id)
        if (!offer) break
        if (!offer.msrp || offer.msrp <= 0) {
          notice("CAN'T SAVE YET", "Enter the Total MSRP from the window sticker first — everything is computed from it.")
          break
        }
        if (!(offer.quickOtd > 0)) {
          notice("CAN'T SAVE YET", "Enter the out-the-door price the dealer quoted first.")
          break
        }
        offer.draft = false
        if (state.editBackup && state.editBackup.offerId === offer.id) state.editBackup = null
        state.expandedOfferId = null
        structuralRender()
        break
      }
      case "discard-offer": {
        const offer = state.offers.find((o) => o.id === id)
        if (!offer) break
        confirmModal("DISCARD DRAFT", 'Throw away "' + esc(offer.label) + '" without saving?', "Discard").then((ok) => {
          if (!ok) return
          state.offers = state.offers.filter((o) => o.id !== id)
          if (state.expandedOfferId === id) state.expandedOfferId = null
          structuralRender()
        })
        break
      }
      case "load-demo": {
        // Two dealers, each with both ways to pay — shows the dealer-vs-dealer
        // banner, the flags, and the crossover chart all at once
        const first = demoOffer()
        state.offers.push(first)
        state.offers.push(CDA.demoOffer2())
        state.expandedOfferId = null
        state.chartOfferId = first.id
        structuralRender()
        break
      }
      case "toggle-offer": {
        const target = state.offers.find((o) => o.id === id)
        if (!target) break
        if (state.expandedOfferId === id) {
          // Collapsing a DRAFT keeps it as a draft; a saved offer's editor
          // has no plain "close" — its buttons are Save changes / Cancel
          state.expandedOfferId = null
        } else {
          // Switching away from a saved-offer edit with unsaved changes?
          const current = state.offers.find((o) => o.id === state.expandedOfferId)
          if (current && !current.draft && hasUnsavedEdit(current)) {
            confirmModal("UNSAVED CHANGES", 'Discard unsaved changes to "' + esc(current.label) + '"?', "Discard changes").then((ok) => {
              if (!ok) return
              restoreEditBackup()
              state.expandedOfferId = id
              if (!target.draft) beginEditBackup(target)
              structuralRender()
            })
            break
          }
          if (current && !current.draft) {
            state.editBackup = null
          }
          state.expandedOfferId = id
          if (!target.draft) beginEditBackup(target)
        }
        structuralRender()
        break
      }
      case "cancel-edit": {
        restoreEditBackup()
        state.expandedOfferId = null
        structuralRender()
        break
      }
      case "delete-offer": {
        const offer = state.offers.find((o) => o.id === id)
        if (!offer) break
        confirmModal("DELETE OFFER", 'Delete "' + esc(offer.label) + '"? This can\'t be undone.', "Delete").then((ok) => {
          if (!ok) return
          state.offers = state.offers.filter((o) => o.id !== id)
          if (state.chartOfferId === id) state.chartOfferId = null
          if (state.editBackup && state.editBackup.offerId === id) state.editBackup = null
          if (state.expandedOfferId === id) state.expandedOfferId = null
          structuralRender()
        })
        break
      }
      case "add-included":
        // Dealer add-on included in the quoted OTD — charged 0 so the price
        // never moves; retailValue is what it's worth to you
        withOffer(id, (o) => o.accessories.push({ id: uid("acc"), label: "", charged: 0, retailValue: 0, isNegotiable: false, category: "legit" }))
        break
      case "add-scenario":
        withOffer(id, (o) => o.scenarios.push({ id: uid("sc"), label: "Way to pay " + (o.scenarios.length + 1), apr: 0, termMonths: 60, rebatesApplied: [], bonusCash: 0 }))
        break
      case "add-scenario-preset":
        withOffer(id, (o) => {
          if (btn.dataset.preset === "zero") {
            o.scenarios.push({ id: uid("sc"), label: "0% APR, give up rebates", apr: 0, termMonths: 60, rebatesApplied: [], bonusCash: 0 })
          } else {
            // Keep every rebate entered so far, at the offer's quoted rate
            const apr = o.financing.apr || 6.99
            o.scenarios.push({
              id: uid("sc"),
              label: "Keep rebates @ " + apr + "%",
              apr,
              termMonths: o.financing.termMonths || 72,
              rebatesApplied: o.rebates.map((r) => r.id),
              bonusCash: 0,
            })
          }
        })
        break
      case "remove-item": {
        const list = getPath(state, btn.dataset.list || "")
        const index = parseInt(btn.dataset.index || "0", 10)
        if (Array.isArray(list)) { list.splice(index, 1); structuralRender() }
        break
      }
      case "focus-chart":
        state.chartOfferId = id || null
        scheduleDerived()
        schedulePersist()
        break
      case "export-json": {
        const blob = new Blob([exportJson()], { type: "application/json" })
        const a = document.createElement("a")
        a.href = URL.createObjectURL(blob)
        a.download = "vehicle-deals-" + new Date().toISOString().slice(0, 10) + ".json"
        a.click()
        URL.revokeObjectURL(a.href)
        break
      }
      case "clear-all":
        confirmModal("CLEAR EVERYTHING", "Remove every offer from this device? Export a JSON backup first if you might want them back.", "Clear all").then((ok) => {
          if (!ok) return
          state.offers = []
          state.expandedOfferId = null
          state.chartOfferId = null
          state.editBackup = null
          structuralRender()
        })
        break
      case "copy-checklist": {
        const text = state.offers.map((offer) => {
          const computed = offerComputed(offer)
          const sections = generateChecklist(
            Object.assign({}, offer, { otdForChecklist: computed.best ? computed.best.waterfall.outTheDoor : null }),
            computed.flags,
            { payoffHorizonMonths: state.horizon }
          )
          for (const s of sections) for (const item of s.items) {
            item.done = !!state.checklistDone[offer.id + "|" + item.text]
          }
          return "=== " + offer.label + " ===\n\n" + checklistToText(sections)
        }).join("\n\n")
        navigator.clipboard.writeText(text).then(() => {
          btn.textContent = "Copied ✓"
          setTimeout(() => { btn.textContent = "Copy as text" }, 1600)
        })
        break
      }
      case "print-checklist":
        window.print()
        break
      case "toggle-check": {
        const key = btn.dataset.key
        if (!key) break
        state.checklistDone[key] = !state.checklistDone[key]
        if (!state.checklistDone[key]) delete state.checklistDone[key]
        // In-place toggle — no re-render, so the page doesn't jump
        const done = !!state.checklistDone[key]
        btn.classList.toggle("checked", done)
        btn.setAttribute("aria-checked", String(done))
        const textSpan = btn.nextElementSibling
        if (textSpan) textSpan.classList.toggle("check-done-text", done)
        // Update the offer's n/total counter in place
        const panel = btn.closest(".panel")
        const counter = panel ? panel.querySelector(".tabular") : null
        if (panel && counter) {
          const total = panel.querySelectorAll(".check-btn").length
          const ticked = panel.querySelectorAll(".check-btn.checked").length
          counter.textContent = ticked + " / " + total + " DONE"
          counter.classList.toggle("text-good", ticked === total)
          counter.classList.toggle("text-ink-faint", ticked !== total)
        }
        schedulePersist()
        break
      }
    }
  }

  // ── Edit sessions on saved offers: snapshot on open, commit on Save,
  //    restore on Cancel ─────────────────────────────────────────
  function beginEditBackup(offer) {
    state.editBackup = { offerId: offer.id, data: JSON.parse(JSON.stringify(offer)) }
  }

  function restoreEditBackup() {
    const b = state.editBackup
    if (!b) return
    const idx = state.offers.findIndex((o) => o.id === b.offerId)
    if (idx >= 0) state.offers[idx] = b.data
    state.editBackup = null
  }

  function hasUnsavedEdit(offer) {
    const b = state.editBackup
    return !!b && b.offerId === offer.id && JSON.stringify(offer) !== JSON.stringify(b.data)
  }

  function withOffer(id, mutate) {
    const offer = state.offers.find((o) => o.id === id)
    if (!offer) return
    mutate(offer)
    structuralRender()
  }

  function focusFirstField() {
    requestAnimationFrame(() => {
      const el = document.querySelector('[data-path$=".label"]')
      if (el) { el.focus(); el.select && el.select() }
    })
  }

  // ── Field binding ─────────────────────────────────────────────
  function onInput(e) {
    const el = e.target
    if (!(el instanceof HTMLInputElement) || !el.dataset.path) return
    if (el.type === "checkbox" || el.type === "file" || el.type === "range") return
    applyField(el)
    scheduleDerived()
    schedulePersist()
  }

  function onChange(e) {
    const el = e.target

    if (el instanceof HTMLInputElement && el.dataset.action === "import-json" && el.files && el.files[0]) {
      el.files[0].text().then((raw) => {
        try { importJson(raw); structuralRender() }
        catch (err) { notice("IMPORT FAILED", "That file isn't a Vehicle Deal Analyzer export.") }
      })
      return
    }

    if (el instanceof HTMLInputElement && el.dataset.action === "toggle-scenario-rebate") {
      const scenario = getPath(state, el.dataset.scenario || "")
      const rid = el.dataset.rebate
      if (scenario && rid) {
        scenario.rebatesApplied = el.checked
          ? scenario.rebatesApplied.concat([rid])
          : scenario.rebatesApplied.filter((r) => r !== rid)
        scheduleDerived()
        schedulePersist()
      }
      return
    }

    if (!el.dataset || !el.dataset.path) return
    applyField(el)
    if (el instanceof HTMLSelectElement || (el instanceof HTMLInputElement && el.type === "checkbox")) {
      structuralRender()
    } else {
      scheduleDerived()
      schedulePersist()
    }
  }

  function applyField(el) {
    const path = el.dataset.path || ""
    const type = el.dataset.type || "text"
    const raw = el instanceof HTMLInputElement && el.type === "checkbox" ? el.checked : el.value

    // The quoted OTD is its own field; syncQuick keeps the synthetic
    // discount/markup split consistent with (msrp, quote, rebate)
    if (path.endsWith(".quickOtd")) {
      const offerPath = path.slice(0, -".quickOtd".length)
      const offer = getPath(state, offerPath)
      if (offer) {
        offer.quickOtd = parseMoney(String(raw))
        syncQuick(offer)
      }
      return
    }

    let value
    switch (type) {
      case "money": value = parseMoney(String(raw)); break
      case "money-null": value = String(raw).trim() === "" ? null : parseMoney(String(raw)); break
      case "pct": value = parsePercent(String(raw)); break
      case "apr": value = parseApr(String(raw)); break
      case "int": value = parseInt10(String(raw)); break
      case "int-null": value = String(raw).trim() === "" ? null : parseInt10(String(raw)); break
      case "bool": value = !!raw; break
      case "tristate": value = raw === "yes" ? true : raw === "no" ? false : undefined; break
      case "state": value = String(raw); break
      default: value = String(raw)
    }
    setPath(state, path, value)

    // MSRP or rebate edits shift how the quoted OTD splits into
    // discount/markup — keep the synthetic fields consistent
    if (path.includes(".msrp") || /\.rebates\.\d+\.amount$/.test(path)) {
      const offer = getPath(state, path.split(".").slice(0, 2).join("."))
      if (offer) syncQuick(offer)
    }
  }
})(window.CDA = window.CDA || {})
