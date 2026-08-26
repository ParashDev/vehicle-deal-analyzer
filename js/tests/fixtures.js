// Hand-verified fixtures: the 2026 Chevrolet Colorado LT deal (Riverbend
// Chevrolet, Franklin County OH @ 7.5%), its mirror (bigger rebate, shorter
// horizon — the rebate must win), and the negative fixture (add-ons + ADM +
// an illegal doc fee).

;(function (CDA) {
  const coloradoOffer = {
    id: "offer-colorado",
    label: "Riverbend Chevrolet",
    dealerName: "Riverbend Chevrolet",
    vehicle: { year: 2026, make: "Chevrolet", model: "Colorado", trim: "LT Crew Cab 2WD 2.7L Turbo", stockNumber: "DEMO-0001", daysOnLot: 45 },
    // Sticker: 37,240 before discounts; 750 factory cash on sticker → MSRP 36,490
    msrp: 36490,
    factoryDiscount: 750,
    // Worksheet "Customer Savings" 4,090 total − 750 factory = dealer's own 3,340
    dealerDiscount: 3340,
    marketAdjustment: 0,
    rebates: [
      { id: "rebate-retail", label: "Retail Bonus Cash", amount: 2000, requiresCaptiveFinancing: false, mutuallyExclusiveWith: ["scenario-zero-apr"], conditional: false },
    ],
    accessories: [],
    fees: [
      { id: "fee-doc", label: "Doc Fee", amount: 250, category: "doc", isTaxable: true },
      { id: "fee-title", label: "Title", amount: 15, category: "government", isTaxable: false },
      { id: "fee-reg", label: "Registration", amount: 66, category: "government", isTaxable: false },
      { id: "fee-plate", label: "Plate", amount: 4.5, category: "government", isTaxable: false },
      { id: "fee-efile", label: "Electronic Filing", amount: 14.5, category: "government", isTaxable: false },
    ],
    financing: { downPayment: 8000, tradeInValue: 0, tradeInPayoff: 0, apr: 5.99, termMonths: 72, isSimpleInterest: true, hasPrepaymentPenalty: false },
    taxJurisdiction: { stateCode: "OH", salesTaxRate: 0.075, extraTaxes: [] },
    scenarios: [
      { id: "scenario-rebate", label: "Take $2,000 rebate @ 5.99%", apr: 5.99, termMonths: 72, rebatesApplied: ["rebate-retail"], bonusCash: 0 },
      { id: "scenario-zero-apr", label: "0% APR, forfeit rebates", apr: 0, termMonths: 60, rebatesApplied: [], bonusCash: 0 },
    ],
  }

  const PAYOFF_HORIZON = 30

  const mirrorOffer = Object.assign({}, coloradoOffer, {
    id: "offer-mirror",
    rebates: [
      { id: "rebate-big", label: "Retail Bonus Cash", amount: 4500, requiresCaptiveFinancing: false, mutuallyExclusiveWith: ["scenario-zero-apr"], conditional: false },
    ],
    scenarios: [
      { id: "scenario-rebate", label: "Take $4,500 rebate @ 5.99%", apr: 5.99, termMonths: 72, rebatesApplied: ["rebate-big"], bonusCash: 0 },
      { id: "scenario-zero-apr", label: "0% APR, forfeit rebates", apr: 0, termMonths: 60, rebatesApplied: [], bonusCash: 0 },
    ],
  })

  const MIRROR_HORIZON = 24

  const negativeOffer = Object.assign({}, coloradoOffer, {
    id: "offer-negative",
    label: "Bad Deal Motors",
    marketAdjustment: 1200,
    accessories: [
      { id: "acc-1", label: "Appearance Protection Package", charged: 899, retailValue: 50, isNegotiable: true, category: "junk" },
      { id: "acc-2", label: "Window Tint", charged: 599, retailValue: 250, isNegotiable: true, category: "overpriced" },
      { id: "acc-3", label: "Nitrogen Fill", charged: 299, retailValue: 0, isNegotiable: true, category: "junk" },
      { id: "acc-4", label: "VIN Etching", charged: 299, retailValue: 25, isNegotiable: true, category: "junk" },
      { id: "acc-5", label: "Dealer Prep", charged: 304, retailValue: 0, isNegotiable: true, category: "junk" },
    ],
    fees: [
      { id: "fee-doc", label: "Doc Fee", amount: 899, category: "doc", isTaxable: true },
      { id: "fee-title", label: "Title", amount: 15, category: "government", isTaxable: false },
      { id: "fee-reg", label: "Registration", amount: 66, category: "government", isTaxable: false },
      { id: "fee-plate", label: "Plate", amount: 4.5, category: "government", isTaxable: false },
      { id: "fee-efile", label: "Electronic Filing", amount: 14.5, category: "government", isTaxable: false },
    ],
  })

  CDA.FIXTURES = { coloradoOffer, mirrorOffer, negativeOffer, PAYOFF_HORIZON, MIRROR_HORIZON }
})(window.CDA = window.CDA || {})
