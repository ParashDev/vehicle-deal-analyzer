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
      }
    } catch (e) { /* corrupted storage — start clean */ }
  }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        offers: state.offers, horizon: state.horizon, chartOfferId: state.chartOfferId,
      }))
    } catch (e) { /* storage blocked — session still works in memory */ }
  }

  function blankVehicle() {
    return { year: new Date().getFullYear(), make: "", model: "", trim: "", vin: "", stockNumber: "", daysOnLot: null }
  }

  function blankFinancing() {
    return { downPayment: 0, tradeInValue: 0, tradeInPayoff: 0, apr: 0, termMonths: 60, isSimpleInterest: true, hasPrepaymentPenalty: false }
  }

  function standardFees() {
    return [
      { id: uid("fee"), label: "Doc Fee", amount: 0, category: "doc", isTaxable: true },
      { id: uid("fee"), label: "Title", amount: 0, category: "government", isTaxable: false },
      { id: uid("fee"), label: "Registration", amount: 0, category: "government", isTaxable: false },
    ]
  }

  function detailedOffer() {
    return {
      id: uid("offer"), mode: "detailed", label: "New offer", dealerName: "",
      vehicle: blankVehicle(),
      msrp: 0, factoryDiscount: 0, dealerDiscount: 0, marketAdjustment: 0,
      rebates: [], accessories: [], fees: standardFees(),
      financing: blankFinancing(),
      taxJurisdiction: { stateCode: "TX", salesTaxRate: 0.0625, extraTaxes: [] },
      dealerStatedTax: null,
      scenarios: [
        { id: uid("sc"), label: "As quoted", apr: 0, termMonths: 60, rebatesApplied: [], bonusCash: 0 },
      ],
    }
  }

  // Quick offer: the entered OTD is authoritative — tax pinned at $0, the
  // whole MSRP→OTD gap lives in dealerDiscount/marketAdjustment so the
  // waterfall reproduces the OTD exactly.
  function quickOffer(q) {
    return {
      id: uid("offer"), mode: "quick", label: q.label || "Quick offer", dealerName: "",
      vehicle: blankVehicle(),
      msrp: q.msrp, factoryDiscount: 0,
      dealerDiscount: Math.max(0, q.msrp - q.otd), marketAdjustment: Math.max(0, q.otd - q.msrp),
      rebates: [], accessories: [], fees: [],
      financing: Object.assign(blankFinancing(), { downPayment: q.down, apr: q.apr, termMonths: q.term }),
      taxJurisdiction: { stateCode: "TX", salesTaxRate: 0, extraTaxes: [] },
      dealerStatedTax: 0,
      scenarios: [
        { id: uid("sc"), label: q.apr + "% for " + q.term + " mo", apr: q.apr, termMonths: q.term, rebatesApplied: [], bonusCash: 0 },
      ],
    }
  }

  // The Colorado demo deal — same numbers as the test fixture.
  function demoOffer() {
    const rebateId = uid("rb")
    return {
      id: uid("offer"), mode: "detailed", label: "Riverbend Chevrolet (demo)", dealerName: "Riverbend Chevrolet",
      vehicle: { year: 2026, make: "Chevrolet", model: "Colorado", trim: "LT Crew Cab 2WD", vin: "", stockNumber: "DEMO-0001", daysOnLot: 45 },
      msrp: 36490, factoryDiscount: 750, dealerDiscount: 3340, marketAdjustment: 0,
      rebates: [
        { id: rebateId, label: "Retail Bonus Cash", amount: 2000, requiresCaptiveFinancing: false, mutuallyExclusiveWith: [], conditional: false },
      ],
      accessories: [],
      fees: [
        { id: uid("fee"), label: "Doc Fee", amount: 250, category: "doc", isTaxable: true },
        { id: uid("fee"), label: "Title", amount: 15, category: "government", isTaxable: false },
        { id: uid("fee"), label: "Registration", amount: 66, category: "government", isTaxable: false },
        { id: uid("fee"), label: "Plate", amount: 4.5, category: "government", isTaxable: false },
        { id: uid("fee"), label: "Electronic Filing", amount: 14.5, category: "government", isTaxable: false },
      ],
      financing: { downPayment: 8000, tradeInValue: 0, tradeInPayoff: 0, apr: 5.99, termMonths: 72, isSimpleInterest: true, hasPrepaymentPenalty: false },
      taxJurisdiction: { stateCode: "OH", salesTaxRate: 0.075, extraTaxes: [] },
      dealerStatedTax: null,
      scenarios: [
        { id: uid("sc"), label: "Take $2,000 rebate @ 5.99%", apr: 5.99, termMonths: 72, rebatesApplied: [rebateId], bonusCash: 0 },
        { id: uid("sc"), label: "0% APR, forfeit rebates", apr: 0, termMonths: 60, rebatesApplied: [], bonusCash: 0 },
      ],
    }
  }

  // Second demo dealer: same truck, weaker discount, a junk add-on or two,
  // slightly higher rate — so the demo shows dealer-vs-dealer ranking, the
  // flags firing, and different scores, not just one clean worksheet.
  function demoOffer2() {
    const rebateId = uid("rb")
    return {
      id: uid("offer"), mode: "detailed", label: "Northgate Chevrolet (demo)", dealerName: "Northgate Chevrolet",
      vehicle: { year: 2026, make: "Chevrolet", model: "Colorado", trim: "LT Crew Cab 2WD", vin: "", stockNumber: "DEMO-0002", daysOnLot: 82 },
      msrp: 36490, factoryDiscount: 750, dealerDiscount: 2600, marketAdjustment: 0,
      rebates: [
        { id: rebateId, label: "Retail Bonus Cash", amount: 2000, requiresCaptiveFinancing: false, mutuallyExclusiveWith: [], conditional: false },
      ],
      accessories: [
        { id: uid("acc"), label: "Appearance Protection Package", charged: 499, retailValue: 50, isNegotiable: true, category: "junk" },
        { id: uid("acc"), label: "Nitrogen Fill", charged: 199, retailValue: 0, isNegotiable: true, category: "junk" },
      ],
      fees: [
        { id: uid("fee"), label: "Doc Fee", amount: 250, category: "doc", isTaxable: true },
        { id: uid("fee"), label: "Title", amount: 15, category: "government", isTaxable: false },
        { id: uid("fee"), label: "Registration", amount: 66, category: "government", isTaxable: false },
        { id: uid("fee"), label: "Plate", amount: 4.5, category: "government", isTaxable: false },
        { id: uid("fee"), label: "Electronic Filing", amount: 14.5, category: "government", isTaxable: false },
      ],
      financing: { downPayment: 8000, tradeInValue: 0, tradeInPayoff: 0, apr: 6.49, termMonths: 72, isSimpleInterest: true, hasPrepaymentPenalty: false },
      taxJurisdiction: { stateCode: "OH", salesTaxRate: 0.075, extraTaxes: [] },
      dealerStatedTax: null,
      scenarios: [
        { id: uid("sc"), label: "Take $2,000 rebate @ 6.49%", apr: 6.49, termMonths: 72, rebatesApplied: [rebateId], bonusCash: 0 },
        { id: uid("sc"), label: "0% APR, forfeit rebates", apr: 0, termMonths: 60, rebatesApplied: [], bonusCash: 0 },
      ],
    }
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
    if (!parsed || !Array.isArray(parsed.offers)) throw new Error("Not a Car Deal Analyzer export")
    state.offers = parsed.offers
    if (parsed.horizon) state.horizon = parsed.horizon
    state.chartOfferId = null
    persist()
  }

  Object.assign(CDA, { state, load, persist, detailedOffer, quickOffer, demoOffer, demoOffer2, setPath, getPath, exportJson, importJson })
})(window.CDA = window.CDA || {})
