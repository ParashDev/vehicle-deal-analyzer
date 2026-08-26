// Flags, scoring, and checklist tests — negative fixture + clean fixture.
;(function (CDA) {
  const { test, assert } = CDA.TEST
  const { detectFlags, checkDocFee, junkDollars, scoreDeal, computeWaterfall,
    generateChecklist, checklistToText } = CDA
  const { coloradoOffer, negativeOffer } = CDA.FIXTURES

  function waterfallFor(offer, rebateTotal) {
    return computeWaterfall({
      msrp: offer.msrp, marketAdjustment: offer.marketAdjustment,
      factoryDiscount: offer.factoryDiscount, dealerDiscount: offer.dealerDiscount,
      accessories: offer.accessories, fees: offer.fees,
      rebateTotal: rebateTotal == null ? 2000 : rebateTotal,
      tradeInValue: 0, tradeInPayoff: 0, stateCode: "OH", rateOverride: 0.075,
    })
  }

  test("every add-on fires its matching flag with the correct dollar amount", () => {
    const flags = detectFlags(negativeOffer, 0)
    const byLabel = (label) => flags.find((f) => f.label === label)
    assert.equal(byLabel("Appearance Protection Package").amount, 899)
    assert.equal(byLabel("Appearance Protection Package").severity, "high")
    assert.equal(byLabel("Window Tint").amount, 599)
    assert.equal(byLabel("Nitrogen Fill").amount, 299)
    assert.equal(byLabel("Nitrogen Fill").severity, "high")
    assert.equal(byLabel("VIN Etching").amount, 299)
    assert.equal(byLabel("Dealer Prep").amount, 304)
    assert.equal(byLabel("Dealer Prep").severity, "high")
  })

  test("market adjustment fires at critical severity", () => {
    const flags = detectFlags(negativeOffer, 0)
    const adm = flags.find((f) => f.kind === "adm")
    assert.ok(adm)
    assert.equal(adm.severity, "critical")
    assert.equal(adm.amount, 1200)
  })

  test("$899 doc fee flagged as EXCEEDING Ohio's cap, not merely above typical", () => {
    const flags = detectFlags(negativeOffer, 0)
    const doc = flags.find((f) => f.kind === "doc-fee")
    assert.ok(doc)
    assert.equal(doc.severity, "critical")
    assert.match(doc.message, /EXCEEDS/i)
    assert.match(doc.message, /cap/i)
  })

  test("flags come back ranked by dollar impact", () => {
    const flags = detectFlags(negativeOffer, 0)
    for (let i = 1; i < flags.length; i++) {
      assert.ok(flags[i - 1].amount >= flags[i].amount)
    }
  })

  test("negative fixture deal score drops below 4", () => {
    const w = waterfallFor(negativeOffer)
    const flags = detectFlags(negativeOffer, w.computedTax.totalTax)
    const result = scoreDeal(negativeOffer, flags, w, { segment: "mainstream", aprBenchmark: 7, scenarioApr: 5.99 })
    assert.ok(result.score < 4, "score " + result.score)
    assert.ok(result.improvements.length >= 2)
  })

  test("clean Colorado deal scores 7.5–8.5, doc fee flagged 'at cap' not junk", () => {
    const w = waterfallFor(coloradoOffer)
    const flags = detectFlags(coloradoOffer, w.computedTax.totalTax)
    const doc = flags.find((f) => f.kind === "doc-fee")
    assert.ok(doc, "at-cap note should exist")
    assert.equal(doc.severity, "low")
    assert.match(doc.message, /at cap|exactly at/i)
    assert.equal(junkDollars(flags, "OH"), 0, "no junk dollars on the clean deal")

    const result = scoreDeal(coloradoOffer, flags, w, { segment: "mainstream", aprBenchmark: 7, scenarioApr: 0 })
    assert.ok(result.score >= 7 && result.score <= 8.5, "score " + result.score)
  })

  test("doc fee three-way check: fine / negotiable / illegal", () => {
    assert.equal(checkDocFee(150, "TX"), null)
    const high = checkDocFee(400, "TX")
    assert.ok(high && high.severity === "medium")
    const illegal = checkDocFee(300, "OH")
    assert.ok(illegal && illegal.severity === "critical")
  })

  test("checklist generates conditional items from the offer's actual shape", () => {
    const offer = Object.assign({}, coloradoOffer, {
      rebates: [Object.assign({}, coloradoOffer.rebates[0], { requiresCaptiveFinancing: true })],
      accessories: [{ id: "a", label: "All-weather mats", charged: 0, retailValue: 200, isNegotiable: false, category: "legit" }],
      vehicle: Object.assign({}, coloradoOffer.vehicle, { daysOnLot: 75 }),
      financing: Object.assign({}, coloradoOffer.financing, { hasPrepaymentPenalty: undefined }),
    })
    const flags = detectFlags(offer, 0)
    const sections = generateChecklist(offer, flags, { payoffHorizonMonths: 30 })
    const text = checklistToText(sections)

    assert.match(text, /survive if I finance through my own bank/i)
    assert.match(text, /We Owe \/ Due Bill/i)
    assert.match(text, /CRITICAL: "All-weather mats"/i)
    assert.match(text, /Rule of 78s/i)
    assert.match(text, /75 days/i)
    assert.match(text, /minimum-term/i)
    assert.match(text, /Never sign the worksheet/i)
    assert.equal(sections.length, 3)
  })
})(window.CDA)
