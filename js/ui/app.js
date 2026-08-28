// Wiring: event delegation, input binding, persistence, boot. Typing only
// re-renders derived output (never the form being typed in) so focus is
// never lost; structural changes rebuild both.

;(function (CDA) {
  const { state, load, persist, detailedOffer, quickOffer, demoOffer, setPath, getPath,
    exportJson, importJson, renderAll, renderOffers, renderDerived, offerComputed,
    parseMoney, parsePercent, parseApr, parseInt10, uid, getStateRule,
    generateChecklist, checklistToText } = CDA

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
        const offer = quickOffer({ label: "Offer " + (state.offers.length + 1), msrp: 0, otd: 0, down: 0, apr: 6.99, term: 60 })
        state.offers.push(offer)
        state.expandedOfferId = offer.id
        structuralRender()
        focusFirstField()
        break
      }
      case "add-detailed": {
        const offer = detailedOffer()
        offer.label = "Offer " + (state.offers.length + 1)
        state.offers.push(offer)
        state.expandedOfferId = offer.id
        structuralRender()
        focusFirstField()
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
      case "toggle-offer":
        state.expandedOfferId = state.expandedOfferId === id ? null : id || null
        structuralRender()
        break
      case "delete-offer": {
        const offer = state.offers.find((o) => o.id === id)
        if (offer && confirm('Delete "' + offer.label + '"? This can\'t be undone.')) {
          state.offers = state.offers.filter((o) => o.id !== id)
          if (state.chartOfferId === id) state.chartOfferId = null
          structuralRender()
        }
        break
      }
      case "add-rebate":
        withOffer(id, (o) => o.rebates.push({ id: uid("rb"), label: "", amount: 0, requiresCaptiveFinancing: false, mutuallyExclusiveWith: [], conditional: false }))
        break
      case "add-accessory":
        withOffer(id, (o) => o.accessories.push({ id: uid("acc"), label: "", charged: 0, retailValue: 0, isNegotiable: true, category: "overpriced" }))
        break
      case "add-included":
        // Quick mode: dealer add-on included in the quoted OTD — charged 0
        // so the price never moves; retailValue is what it's worth to you
        withOffer(id, (o) => o.accessories.push({ id: uid("acc"), label: "", charged: 0, retailValue: 0, isNegotiable: false, category: "legit" }))
        break
      case "add-fee":
        withOffer(id, (o) => o.fees.push({ id: uid("fee"), label: "", amount: 0, category: "dealer-junk", isTaxable: true }))
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
        if (confirm("Clear every offer from this device?")) {
          state.offers = []
          state.expandedOfferId = null
          state.chartOfferId = null
          structuralRender()
        }
        break
      case "copy-checklist": {
        const text = state.offers.map((offer) => {
          const computed = offerComputed(offer)
          const sections = generateChecklist(
            Object.assign({}, offer, { otdForChecklist: computed.best ? computed.best.waterfall.outTheDoor : null }),
            computed.flags,
            { payoffHorizonMonths: state.horizon }
          )
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
    }
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
        catch (err) { alert("That file isn't a Vehicle Deal Analyzer export.") }
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

    // Quick-mode synthetic OTD: distribute into discount/adjustment vs MSRP
    if (path.endsWith(".quickOtd")) {
      const offerPath = path.slice(0, -".quickOtd".length)
      const offer = getPath(state, offerPath)
      if (offer) {
        const otd = parseMoney(String(raw))
        offer.dealerDiscount = Math.max(0, offer.msrp - otd)
        offer.marketAdjustment = Math.max(0, otd - offer.msrp)
        offer.dealerStatedTax = 0
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

    // Changing the state ALWAYS resets the rate to that state's base rate —
    // a rate typed for another state is meaningless here, and the previous
    // only-if-empty seeding left the old state's rate silently in place.
    // The user then adds their county/city % on top if there is one.
    if (type === "state") {
      const offerPath = path.split(".").slice(0, 2).join(".")
      const offer = getPath(state, offerPath)
      if (offer) {
        const rule = getStateRule(String(value))
        if (rule) {
          offer.taxJurisdiction.salesTaxRate = rule.baseRate
          // Title/registration re-seed to the new state's typical statutory
          // amounts — the user overwrites with the dealer's exact numbers
          for (const fee of offer.fees) {
            if (fee.category !== "government") continue
            if (/title/i.test(fee.label)) fee.amount = rule.titleFee
            else if (/regist/i.test(fee.label)) fee.amount = rule.regTypical
          }
        }
      }
    }
  }
})(window.CDA = window.CDA || {})
