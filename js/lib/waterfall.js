// The MSRP → out-the-door waterfall. Every intermediate value is exposed so
// the UI can render the whole ladder against the dealer's worksheet.
//
// NOTE on factory discounts: the sticker's TOTAL MSRP is ALREADY net of
// on-sticker factory cash, so the waterfall does NOT subtract factoryDiscount
// again — it only reconstructs the pre-discount sticker total for display.

;(function (CDA) {
  const { computeTax, round2 } = CDA

  function computeWaterfall(input) {
    const stickerBeforeDiscounts = round2(input.msrp + input.factoryDiscount)
    const sellingPrice = round2(input.msrp + input.marketAdjustment - input.dealerDiscount)

    const accessoriesCharged = round2(input.accessories.reduce((sum, a) => sum + a.charged, 0))
    const taxableFees = round2(input.fees.filter((f) => f.isTaxable).reduce((sum, f) => sum + f.amount, 0))
    const nonTaxableFees = round2(input.fees.filter((f) => !f.isTaxable).reduce((sum, f) => sum + f.amount, 0))

    const taxableSubtotal = round2(sellingPrice + accessoriesCharged + taxableFees)
    const cashPrice = round2(taxableSubtotal - input.rebateTotal)

    const tax = computeTax({
      taxableSubtotal,
      rebateTotal: input.rebateTotal,
      tradeInValue: input.tradeInValue,
      tradeInPayoff: input.tradeInPayoff,
      stateCode: input.stateCode,
      rateOverride: input.rateOverride,
      extraTaxes: input.extraTaxes,
    })

    const taxUsed = input.dealerStatedTax != null ? round2(input.dealerStatedTax) : tax.totalTax
    const outTheDoor = round2(cashPrice + taxUsed + nonTaxableFees)

    return {
      stickerBeforeDiscounts,
      msrp: round2(input.msrp),
      marketAdjustment: round2(input.marketAdjustment),
      factoryDiscount: round2(input.factoryDiscount),
      dealerDiscount: round2(input.dealerDiscount),
      sellingPrice,
      accessoriesCharged,
      taxableFees,
      taxableSubtotal,
      rebateTotal: round2(input.rebateTotal),
      cashPrice,
      computedTax: tax,
      dealerStatedTax: input.dealerStatedTax != null ? round2(input.dealerStatedTax) : null,
      taxUsed,
      nonTaxableFees,
      outTheDoor,
    }
  }

  // Dealer discount excludes on-sticker factory money; otd/msrp is the
  // cleanest single cross-deal figure.
  function discountMetrics(w, accessories) {
    const dealerDiscountPct = w.msrp > 0 ? w.dealerDiscount / w.msrp : 0
    const totalSavings = round2(w.factoryDiscount + w.dealerDiscount + w.rebateTotal - w.marketAdjustment)
    const totalSavingsPct = w.msrp > 0 ? totalSavings / w.msrp : 0
    const includedValue = round2(
      accessories.filter((a) => a.charged === 0 && a.retailValue > 0).reduce((sum, a) => sum + a.retailValue, 0)
    )
    return {
      dealerDiscount: w.dealerDiscount,
      dealerDiscountPct,
      totalSavings,
      totalSavingsPct,
      otdToMsrp: w.msrp > 0 ? round2((w.outTheDoor / w.msrp) * 10000) / 10000 : 0,
      includedValue,
    }
  }

  Object.assign(CDA, { computeWaterfall, discountMetrics })
})(window.CDA = window.CDA || {})
