// The junk-fee / add-on detector. Warnings ranked by dollar impact.
// Government fees are checked for sanity but NOT called junk — the tool
// builds trust by correctly identifying what's legitimate.

;(function (CDA) {
  const { getStateRule, verifyDealerTax } = CDA

  const RED_FLAGS = [
    { match: /nitrogen/i, severity: "high", message: "Nitrogen fill is worth roughly $0. Ask for it to be removed." },
    { match: /vin\s*etch/i, severity: "high", message: "VIN etching costs the dealer under $25. Refuse it." },
    { match: /paint\s*(protection|sealant)|fabric\s*protection|appearance\s*protection|zaktek|xzilon|resistall|diamond\s*kote/i,
      severity: "high", message: "Appearance protection packages are near-pure margin. Refuse; a $20 bottle of sealant does the same job." },
    { match: /pinstripe|door\s*edge\s*guard|wheel\s*lock/i, severity: "medium", message: "Low-value accessory. Negotiable or removable." },
    { match: /theft\s*(protection|recovery)|lojack|kahu|tracker/i, severity: "medium",
      message: "Tracking devices are often pre-installed and billed at $500–1,500. Ask if there is a recurring subscription after delivery." },
    { match: /dealer\s*prep|reconditioning|make\s*ready/i, severity: "high",
      message: "Prep on a NEW vehicle is already covered by the destination charge. This is a duplicate charge." },
    { match: /market\s*adjust|additional\s*dealer\s*mark|\bADM\b/i, severity: "critical",
      message: "Market adjustment is pure markup above MSRP. Walk unless the vehicle is genuinely allocation-constrained." },
    { match: /advertising\s*fee|regional\s*ad/i, severity: "medium",
      message: "Ad fees are a manufacturer-to-dealer cost. Sometimes legitimate on the invoice, always worth challenging." },
    { match: /e-?filing|electronic\s*filing|processing/i, severity: "low",
      message: "Usually small and legitimate, but verify it is not duplicating the doc fee." },
    { match: /window\s*tint/i, severity: "medium",
      message: "Dealer tint is typically billed at 2–3× an independent shop's price. Negotiable or removable." },
  ]

  const GOV_FEE_RANGES = [
    { match: /title/i, max: 100 },
    { match: /regist/i, max: 400 },
    { match: /plate/i, max: 60 },
    { match: /inspect/i, max: 80 },
  ]

  // Doc fee — three outcomes: fine / negotiable / illegal (above cap).
  function checkDocFee(docFeeAmount, stateCode) {
    const rule = getStateRule(stateCode)
    if (!rule || docFeeAmount <= 0) return null
    if (rule.docFeeCap != null && docFeeAmount > rule.docFeeCap) {
      return {
        id: "doc-fee", kind: "doc-fee", severity: "critical", label: "Doc fee", amount: docFeeAmount,
        message: "The $" + docFeeAmount.toFixed(0) + " doc fee EXCEEDS " + rule.name + "'s statutory cap of $" + rule.docFeeCap.toFixed(0) + ". That's not a negotiation point — challenge it as illegal.",
      }
    }
    if (rule.docFeeCap != null && docFeeAmount === rule.docFeeCap) {
      return {
        id: "doc-fee", kind: "doc-fee", severity: "low", label: "Doc fee", amount: docFeeAmount,
        message: "The $" + docFeeAmount.toFixed(0) + " doc fee sits exactly at " + rule.name + "'s statutory cap. At cap, not negotiable — but it's legal and expected.",
      }
    }
    if (docFeeAmount > rule.docFeeTypical * 1.15) {
      return {
        id: "doc-fee", kind: "doc-fee", severity: "medium", label: "Doc fee", amount: docFeeAmount,
        message: "The $" + docFeeAmount.toFixed(0) + " doc fee is above the " + rule.name + " typical (~$" + rule.docFeeTypical.toFixed(0) + ")" + (rule.docFeeCap == null ? " and the state doesn't cap it" : "") + ". Legal, but treat it as part of the price and negotiate the total.",
      }
    }
    return null
  }

  function detectFlags(offer, computedTax) {
    const flags = []

    const lineItems = [
      ...offer.accessories.map((a) => ({ id: a.id, label: a.label, amount: a.charged })),
      ...offer.fees.filter((f) => f.category !== "government").map((f) => ({ id: f.id, label: f.label, amount: f.amount })),
    ]
    for (const item of lineItems) {
      if (item.label.toLowerCase().includes("doc")) continue
      for (const rule of RED_FLAGS) {
        if (rule.match.test(item.label)) {
          flags.push({ id: item.id, kind: "junk", severity: rule.severity, label: item.label, amount: item.amount, message: rule.message })
          break
        }
      }
    }

    if (offer.marketAdjustment > 0) {
      flags.push({
        id: "market-adjustment", kind: "adm", severity: "critical", label: "Market adjustment",
        amount: offer.marketAdjustment,
        message: "$" + offer.marketAdjustment.toFixed(0) + " of market adjustment is pure markup above MSRP. Walk unless the vehicle is genuinely allocation-constrained.",
      })
    }

    const docFee = offer.fees.find((f) => f.category === "doc")
    if (docFee) {
      const docFlag = checkDocFee(docFee.amount, offer.taxJurisdiction.stateCode)
      if (docFlag) flags.push(docFlag)
    }

    for (const fee of offer.fees.filter((f) => f.category === "government")) {
      const range = GOV_FEE_RANGES.find((r) => r.match.test(fee.label))
      if (range && fee.amount > range.max) {
        flags.push({
          id: fee.id, kind: "gov-fee", severity: "medium", label: fee.label, amount: fee.amount,
          message: fee.label + " of $" + fee.amount.toFixed(0) + " is above the usual statutory range (≤ ~$" + range.max + "). Ask for the state's fee schedule — these are fixed by law, not by the dealer.",
        })
      }
    }

    if (offer.dealerStatedTax != null) {
      const check = verifyDealerTax(computedTax, offer.dealerStatedTax)
      if (check.status !== "match") {
        flags.push({
          id: "tax-check", kind: "tax", severity: check.status === "dealer-higher" ? "high" : "low",
          label: "Sales tax", amount: Math.abs(check.delta), message: check.message,
        })
      }
    }

    flags.sort((a, b) => b.amount - a.amount)
    return flags
  }

  // Total dollars across junk flags (ADM + junk add-ons + illegal doc excess).
  function junkDollars(flags, stateCode) {
    const rule = getStateRule(stateCode)
    return flags.reduce((sum, f) => {
      if (f.kind === "junk" || f.kind === "adm") return sum + f.amount
      if (f.kind === "doc-fee" && f.severity === "critical" && rule && rule.docFeeCap != null) {
        return sum + (f.amount - rule.docFeeCap)
      }
      return sum
    }, 0)
  }

  Object.assign(CDA, { RED_FLAGS, checkDocFee, detectFlags, junkDollars })
})(window.CDA = window.CDA || {})
