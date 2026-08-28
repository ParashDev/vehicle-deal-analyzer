// State + localStorage persistence + offer factories.

;(function (CDA) {
  const { uid } = CDA
  const KEY = "cars-compare.v1"

  const state = {
    horizon: 36,
    offers: [],
    expandedOfferId: null,
    chartOfferId: null,
    benchmark: 7,
    // Snapshot of a saved offer taken when its editor opens — Save commits,
    // Cancel (or a reload) restores it. {offerId, data} or null.
    editBackup: null,
    // Ticked checklist items, keyed offerId|itemText (a changed question
    // resets its tick — the question is different now)
    checklistDone: {},
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY)
      if (!raw) return
      const saved = JSON.parse(raw)
      if (saved && Array.isArray(saved.offers)) {
        state.offers = saved.offers
        state.horizon = saved.horizon || 36
        state.chartOfferId = saved.chartOfferId || null
        state.checklistDone = saved.checklistDone || {}
        // Migrate quick offers from before the rebate-aware model
        for (const o of state.offers) {
          if (o.mode === "quick" && o.quickOtd == null) {
            o.quickOtd = Math.max(0, o.msrp - o.dealerDiscount + o.marketAdjustment)
            if (!o.rebates || !o.rebates.length) {
              o.rebates = [{ id: uid("rb"), label: "Rebate", amount: 0, requiresCaptiveFinancing: false, mutuallyExclusiveWith: [], conditional: false }]
            }
          }
        }
        // An edit session that never got saved reverts on reload — "not
        // saved" means not saved
        if (saved.editBackup) {
          const idx = state.offers.findIndex((o) => o.id === saved.editBackup.offerId)
          if (idx >= 0) state.offers[idx] = saved.editBackup.data
        }
      }
    } catch (e) { /* corrupted storage — start clean */ }
  }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        offers: state.offers, horizon: state.horizon, chartOfferId: state.chartOfferId,
        editBackup: state.editBackup, checklistDone: state.checklistDone,
      }))
    } catch (e) { /* storage blocked — session still works in memory */ }
  }

  function blankVehicle() {
    return { year: new Date().getFullYear(), make: "", model: "", trim: "", vin: "", stockNumber: "", daysOnLot: null }
  }

  function blankFinancing() {
    // hasPrepaymentPenalty starts unknown so the checklist asks the
    // simple-interest / Rule-of-78s question until the buyer verifies it
    return { downPayment: 0, tradeInValue: 0, tradeInPayoff: 0, apr: 0, termMonths: 60, isSimpleInterest: true, hasPrepaymentPenalty: undefined }
  }

  // (The detailed worksheet mode was removed — quick compare IS the tool.)

  // Quick offer: the entered OTD is authoritative AND — as dealers quote it —
  // already includes any rebate. syncQuick() splits the MSRP→OTD gap so the
  // rebate lives in a real rebate entry: a way to pay that KEEPS it prices at
  // the quoted OTD, one that GIVES IT UP prices at quoted + rebate.
  function syncQuick(offer) {
    if (offer.mode !== "quick") return
    const rebateTotal = (offer.rebates || []).reduce((s, r) => s + (r.amount || 0), 0)
    const q = offer.quickOtd || 0
    offer.dealerDiscount = Math.max(0, offer.msrp - q - rebateTotal)
    offer.marketAdjustment = Math.max(0, q + rebateTotal - offer.msrp)
  }

  function quickOffer(q) {
    const offer = {
      id: uid("offer"), mode: "quick", label: q.label || "Quick offer", dealerName: "",
      vehicle: blankVehicle(),
      msrp: q.msrp, factoryDiscount: 0,
      quickOtd: q.otd,
      dealerDiscount: 0, marketAdjustment: 0,
      rebates: [
        { id: uid("rb"), label: "Rebate", amount: q.rebate || 0, requiresCaptiveFinancing: false, mutuallyExclusiveWith: [], conditional: false },
      ],
      accessories: [], fees: [],
      financing: Object.assign(blankFinancing(), { downPayment: q.down, apr: q.apr, termMonths: q.term }),
      taxJurisdiction: { stateCode: "TX", salesTaxRate: 0, extraTaxes: [] },
      dealerStatedTax: 0,
      scenarios: [],
    }
    syncQuick(offer)
    return offer
  }

  // Demo deals — pure quick offers. Riverbend's numbers reproduce the
  // hand-verified fixture: quoted $34,005 includes the $2,000 rebate, so the
  // rebate way prices at 34,005 and the 0% way at 36,005.
  function demoOffer() {
    const o = quickOffer({ label: "Riverbend Chevrolet (demo)", msrp: 36490, otd: 34005, rebate: 2000, down: 8000, apr: 5.99, term: 72 })
    o.dealerName = "Riverbend Chevrolet"
    o.vehicle.daysOnLot = 45
    o.rebates[0].label = "Retail Bonus Cash"
    o.accessories.push({ id: uid("acc"), label: "Spray-in bed liner (included)", charged: 0, retailValue: 450, isNegotiable: false, category: "legit" })
    o.scenarios = [
      { id: uid("sc"), label: "Take $2,000 rebate @ 5.99%", apr: 5.99, termMonths: 72, rebatesApplied: [o.rebates[0].id], bonusCash: 0 },
      { id: uid("sc"), label: "0% APR, give up rebate", apr: 0, termMonths: 60, rebatesApplied: [], bonusCash: 0 },
    ]
    return o
  }

  // Second demo dealer: same truck, higher quote, slightly worse rate, and
  // nothing thrown in — so the demo shows dealer-vs-dealer ranking and the
  // value story, not just one clean quote.
  function demoOffer2() {
    const o = quickOffer({ label: "Northgate Chevrolet (demo)", msrp: 36490, otd: 35100, rebate: 2000, down: 8000, apr: 6.49, term: 72 })
    o.dealerName = "Northgate Chevrolet"
    o.vehicle.daysOnLot = 82
    o.rebates[0].label = "Retail Bonus Cash"
    o.scenarios = [
      { id: uid("sc"), label: "Take $2,000 rebate @ 6.49%", apr: 6.49, termMonths: 72, rebatesApplied: [o.rebates[0].id], bonusCash: 0 },
      { id: uid("sc"), label: "0% APR, give up rebate", apr: 0, termMonths: 60, rebatesApplied: [], bonusCash: 0 },
    ]
    return o
  }

  function setPath(obj, path, value) {
    const parts = path.split(".")
    let target = obj
    for (let i = 0; i < parts.length - 1; i++) target = target[parts[i]]
    target[parts[parts.length - 1]] = value
  }

  function getPath(obj, path) {
    return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj)
  }

  function exportJson() {
    return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), horizon: state.horizon, offers: state.offers }, null, 2)
  }

  function importJson(raw) {
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.offers)) throw new Error("Not a Vehicle Deal Analyzer export")
    state.offers = parsed.offers
    if (parsed.horizon) state.horizon = parsed.horizon
    state.chartOfferId = null
    persist()
  }

  Object.assign(CDA, { state, load, persist, quickOffer, syncQuick, demoOffer, demoOffer2, setPath, getPath, exportJson, importJson })
})(window.CDA = window.CDA || {})
