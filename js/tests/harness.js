// Tiny browser test harness. The suite runs at /tests.html — plain scripts,
// no tooling. Open the page: green means the math engine is verified against
// the hand-checked fixtures.

;(function (CDA) {
  const results = []

  function test(name, fn) {
    try {
      fn()
      results.push({ name, ok: true })
    } catch (e) {
      results.push({ name, ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  }

  function fail(message) {
    throw new Error(message)
  }

  const assert = {
    equal(a, b, msg) {
      if (a !== b) fail(msg || "Expected " + JSON.stringify(b) + ", got " + JSON.stringify(a))
    },
    ok(v, msg) {
      if (!v) fail(msg || "Expected truthy, got " + JSON.stringify(v))
    },
    match(s, re, msg) {
      if (!re.test(String(s))) fail(msg || "Expected " + JSON.stringify(String(s).slice(0, 120)) + " to match " + re)
    },
  }

  CDA.TEST = { results, test, assert }
})(window.CDA = window.CDA || {})
