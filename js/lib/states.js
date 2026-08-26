// State sales-tax rules for vehicle purchases — all 50 states + DC.
// Classic script: everything hangs off window.CDA so the site runs from a
// double-clicked file or any static host, no build, no server required.
//
// baseRate is the STATE rate only; local/county add-ons vary by address, so
// the UI lets the user override the combined rate while showing what the
// table expected. rebateIsTaxable: most states tax the pre-rebate price.
// tradeInReducesTaxableAmount: whether trade-in value comes off the taxable
// base. docFeeCap null = uncapped. specialCase marks states where a flat /
// ad-valorem regime replaces ordinary sales tax and our estimate is rougher.
// Rates are point-in-time seeds, not law.

;(function (CDA) {
  const STATE_TAX_RULES = [
    { stateCode: "AL", name: "Alabama", baseRate: 0.02, rebateIsTaxable: true, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: null, docFeeTypical: 485, specialCase: false, notes: "2% state automotive rate; county/city add-ons are common." },
    { stateCode: "AK", name: "Alaska", baseRate: 0, rebateIsTaxable: false, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: null, docFeeTypical: 200, specialCase: false, notes: "No state sales tax; some boroughs levy a local tax." },
    { stateCode: "AZ", name: "Arizona", baseRate: 0.056, rebateIsTaxable: false, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: null, docFeeTypical: 499, specialCase: false, notes: "Rebates are NOT taxed. Local rates add on top of the 5.6% state TPT." },
    { stateCode: "AR", name: "Arkansas", baseRate: 0.065, rebateIsTaxable: true, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: 129, docFeeTypical: 129, specialCase: false, notes: "Doc fee capped by rule; local rates add on." },
    { stateCode: "CA", name: "California", baseRate: 0.0725, rebateIsTaxable: true, tradeInReducesTaxableAmount: false, tradeInCreditCap: null, docFeeCap: 85, docFeeTypical: 85, specialCase: false, notes: "NO trade-in tax credit — you pay tax on the full price. Doc fee capped (~$85). District taxes add to the 7.25% base." },
    { stateCode: "CO", name: "Colorado", baseRate: 0.029, rebateIsTaxable: false, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: null, docFeeTypical: 699, specialCase: false, notes: "Rebates are NOT taxed. Local rates vary widely on top of 2.9%." },
    { stateCode: "CT", name: "Connecticut", baseRate: 0.0635, rebateIsTaxable: true, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: null, docFeeTypical: 599, specialCase: false, notes: "7.75% on vehicles over $50k." },
    { stateCode: "DE", name: "Delaware", baseRate: 0.0425, rebateIsTaxable: false, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: null, docFeeTypical: 300, specialCase: true, notes: "No sales tax; a 4.25% document fee on purchase price acts like one. Estimate is rough." },
    { stateCode: "DC", name: "District of Columbia", baseRate: 0.06, rebateIsTaxable: true, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: null, docFeeTypical: 300, specialCase: true, notes: "Excise tax tiered by weight/MPG (6–8%+). Estimate is rough." },
    { stateCode: "FL", name: "Florida", baseRate: 0.06, rebateIsTaxable: true, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: null, docFeeTypical: 899, specialCase: false, notes: "County surtax applies to the first $5,000. Doc fees among the highest in the country — commonly $800+." },
    { stateCode: "GA", name: "Georgia", baseRate: 0.07, rebateIsTaxable: true, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: null, docFeeTypical: 599, specialCase: true, notes: "TAVT: one-time 7% ad valorem title tax on fair market value INSTEAD of sales tax. Manufacturer rebates do not reduce TAVT; dealer discounts and trade-ins do. Estimate is rough." },
    { stateCode: "HI", name: "Hawaii", baseRate: 0.04, rebateIsTaxable: true, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: null, docFeeTypical: 245, specialCase: false, notes: "GET 4% (4.5% Oahu); technically levied on the seller." },
    { stateCode: "ID", name: "Idaho", baseRate: 0.06, rebateIsTaxable: false, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: null, docFeeTypical: 399, specialCase: false, notes: "Manufacturer rebates assigned at sale reduce the taxable price." },
    { stateCode: "IL", name: "Illinois", baseRate: 0.0625, rebateIsTaxable: true, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: 347, docFeeTypical: 347, specialCase: false, notes: "Doc fee capped (indexed annually, ~$347). Chicago-area local rates are steep." },
    { stateCode: "IN", name: "Indiana", baseRate: 0.07, rebateIsTaxable: false, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: null, docFeeTypical: 249, specialCase: false, notes: "Rebates assigned to the dealer reduce the taxable price." },
    { stateCode: "IA", name: "Iowa", baseRate: 0.05, rebateIsTaxable: true, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: 180, docFeeTypical: 180, specialCase: false, notes: "5% one-time registration fee in lieu of sales tax; doc fee capped $180." },
    { stateCode: "KS", name: "Kansas", baseRate: 0.065, rebateIsTaxable: true, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: null, docFeeTypical: 499, specialCase: false, notes: "Local rates add on." },
    { stateCode: "KY", name: "Kentucky", baseRate: 0.06, rebateIsTaxable: true, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: null, docFeeTypical: 450, specialCase: false, notes: "6% motor vehicle usage tax; trade-in credit applies on new vehicles." },
    { stateCode: "LA", name: "Louisiana", baseRate: 0.05, rebateIsTaxable: true, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: 425, docFeeTypical: 425, specialCase: false, notes: "State rate 5%; parish taxes add on. Doc fee capped ~$425." },
    { stateCode: "ME", name: "Maine", baseRate: 0.055, rebateIsTaxable: true, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: null, docFeeTypical: 499, specialCase: false, notes: "" },
    { stateCode: "MD", name: "Maryland", baseRate: 0.06, rebateIsTaxable: false, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: 500, docFeeTypical: 499, specialCase: false, notes: "6% titling excise tax; manufacturer rebates reduce the taxable price. Doc fee capped $500." },
    { stateCode: "MA", name: "Massachusetts", baseRate: 0.0625, rebateIsTaxable: true, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: null, docFeeTypical: 459, specialCase: false, notes: "" },
    { stateCode: "MI", name: "Michigan", baseRate: 0.06, rebateIsTaxable: true, tradeInReducesTaxableAmount: true, tradeInCreditCap: 11000, docFeeCap: 260, docFeeTypical: 260, specialCase: false, notes: "Trade-in credit CAPPED (phasing up yearly, ~$11k). Doc fee capped (5% of price up to ~$260)." },
    { stateCode: "MN", name: "Minnesota", baseRate: 0.06875, rebateIsTaxable: false, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: 125, docFeeTypical: 125, specialCase: false, notes: "Rebates reduce the taxable price. Doc fee capped ~$125." },
    { stateCode: "MS", name: "Mississippi", baseRate: 0.05, rebateIsTaxable: true, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: null, docFeeTypical: 425, specialCase: false, notes: "5% on vehicles." },
    { stateCode: "MO", name: "Missouri", baseRate: 0.04225, rebateIsTaxable: true, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: 565, docFeeTypical: 565, specialCase: false, notes: "Local rates add on; doc fee capped (indexed, ~$565)." },
    { stateCode: "MT", name: "Montana", baseRate: 0, rebateIsTaxable: false, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: null, docFeeTypical: 299, specialCase: false, notes: "No sales tax." },
    { stateCode: "NE", name: "Nebraska", baseRate: 0.055, rebateIsTaxable: true, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: null, docFeeTypical: 299, specialCase: false, notes: "" },
    { stateCode: "NV", name: "Nevada", baseRate: 0.0685, rebateIsTaxable: false, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: null, docFeeTypical: 499, specialCase: false, notes: "Rebates reduce the taxable price; county rates add on." },
    { stateCode: "NH", name: "New Hampshire", baseRate: 0, rebateIsTaxable: false, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: null, docFeeTypical: 399, specialCase: false, notes: "No sales tax." },
    { stateCode: "NJ", name: "New Jersey", baseRate: 0.06625, rebateIsTaxable: true, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: null, docFeeTypical: 599, specialCase: false, notes: "" },
    { stateCode: "NM", name: "New Mexico", baseRate: 0.04, rebateIsTaxable: true, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: null, docFeeTypical: 339, specialCase: false, notes: "4% motor vehicle excise tax." },
    { stateCode: "NY", name: "New York", baseRate: 0.04, rebateIsTaxable: true, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: 175, docFeeTypical: 175, specialCase: false, notes: "Local rates add 4%+ in most counties. Doc fee capped $175." },
    { stateCode: "NC", name: "North Carolina", baseRate: 0.03, rebateIsTaxable: true, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: null, docFeeTypical: 699, specialCase: true, notes: "3% Highway Use Tax instead of sales tax. Estimate is rough." },
    { stateCode: "ND", name: "North Dakota", baseRate: 0.05, rebateIsTaxable: true, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: null, docFeeTypical: 299, specialCase: false, notes: "5% motor vehicle excise tax." },
    { stateCode: "OH", name: "Ohio", baseRate: 0.0575, rebateIsTaxable: true, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: 250, docFeeTypical: 250, specialCase: false, notes: "County rates add on (combined 6.5–8%). Doc fee capped — effectively $250. Rebates are taxed (tax on pre-rebate price)." },
    { stateCode: "OK", name: "Oklahoma", baseRate: 0.045, rebateIsTaxable: true, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: null, docFeeTypical: 399, specialCase: false, notes: "3.25% excise + 1.25% sales tax on vehicles." },
    { stateCode: "OR", name: "Oregon", baseRate: 0.005, rebateIsTaxable: false, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: 250, docFeeTypical: 175, specialCase: false, notes: "No general sales tax; 0.5% vehicle privilege/use tax on new vehicles. Doc fee capped ($175/$250 e-title)." },
    { stateCode: "PA", name: "Pennsylvania", baseRate: 0.06, rebateIsTaxable: true, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: 465, docFeeTypical: 449, specialCase: false, notes: "7% Allegheny County, 8% Philadelphia. Doc fee capped (indexed, ~$465 e-title)." },
    { stateCode: "RI", name: "Rhode Island", baseRate: 0.07, rebateIsTaxable: true, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: null, docFeeTypical: 399, specialCase: false, notes: "" },
    { stateCode: "SC", name: "South Carolina", baseRate: 0.05, rebateIsTaxable: true, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: null, docFeeTypical: 400, specialCase: true, notes: "IMF capped at $500 total — the effective rate collapses above $10k price. Estimate is rough." },
    { stateCode: "SD", name: "South Dakota", baseRate: 0.04, rebateIsTaxable: true, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: null, docFeeTypical: 249, specialCase: false, notes: "4% motor vehicle excise tax." },
    { stateCode: "TN", name: "Tennessee", baseRate: 0.07, rebateIsTaxable: true, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: null, docFeeTypical: 599, specialCase: false, notes: "Local single-article tax adds on the first $1,600–3,200." },
    { stateCode: "TX", name: "Texas", baseRate: 0.0625, rebateIsTaxable: true, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: null, docFeeTypical: 200, specialCase: false, notes: "Flat 6.25% statewide on vehicles, no local add-on. Typical doc fee $150–225." },
    { stateCode: "UT", name: "Utah", baseRate: 0.0485, rebateIsTaxable: true, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: null, docFeeTypical: 299, specialCase: false, notes: "Local rates add on." },
    { stateCode: "VT", name: "Vermont", baseRate: 0.06, rebateIsTaxable: true, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: null, docFeeTypical: 250, specialCase: false, notes: "6% purchase and use tax." },
    { stateCode: "VA", name: "Virginia", baseRate: 0.0415, rebateIsTaxable: true, tradeInReducesTaxableAmount: false, tradeInCreditCap: null, docFeeCap: null, docFeeTypical: 799, specialCase: true, notes: "4.15% Motor Vehicle Sales & Use Tax on the FULL sale price — no trade-in credit. Estimate is rough." },
    { stateCode: "WA", name: "Washington", baseRate: 0.065, rebateIsTaxable: true, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: 200, docFeeTypical: 200, specialCase: false, notes: "Local rates + 0.3% motor vehicle tax add on. Doc fee capped $200." },
    { stateCode: "WV", name: "West Virginia", baseRate: 0.06, rebateIsTaxable: true, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: null, docFeeTypical: 399, specialCase: false, notes: "6% titling privilege tax." },
    { stateCode: "WI", name: "Wisconsin", baseRate: 0.05, rebateIsTaxable: true, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: null, docFeeTypical: 299, specialCase: false, notes: "County 0.5% common." },
    { stateCode: "WY", name: "Wyoming", baseRate: 0.04, rebateIsTaxable: true, tradeInReducesTaxableAmount: true, tradeInCreditCap: null, docFeeCap: null, docFeeTypical: 500, specialCase: false, notes: "County rates add on." },
  ]

  function getStateRule(stateCode) {
    return STATE_TAX_RULES.find((r) => r.stateCode === String(stateCode).toUpperCase())
  }

  Object.assign(CDA, { STATE_TAX_RULES, getStateRule })
})(window.CDA = window.CDA || {})
