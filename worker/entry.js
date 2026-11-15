/**
 * EAC Dashboard sidebar entry injection script — served by gateway at {mount}/entry.js,
 * nginx injects it into every New API dashboard page (before </body>).
 *
 * It does one thing: wait for New API's admin sidebar to render, clone the entry
 * after "System Info" in the "Admin" group, rename it to "EAC Dashboard", point
 * to /eac/stats. The clone is detached DOM (no React events), click uses native
 * navigation; if panel updates cause React to re-render and remove the entry,
 * the observer re-adds it. No secrets embedded.
 */
(function () {
  if (location.pathname.indexOf('/eac/') === 0) return // dashboard itself doesn't inject
  var HREF = '/eac/stats'
  try {
    if (document.currentScript && document.currentScript.src) {
      HREF = new URL('../stats', document.currentScript.src).pathname
    }
  } catch (e) { /* keep default path */ }
  var done = false

  function textLeaf(el) {
    var all = el.querySelectorAll('*')
    for (var i = 0; i < all.length; i++) {
      if (all[i].children.length === 0 && all[i].textContent.trim() !== '') return all[i]
    }
    return null
  }

  function inject() {
    if (done || document.getElementById('eac-stats-entry')) { done = true; return }
    var candidates = document.querySelectorAll('aside a, aside div, nav a, nav div, [class*="sider"] a, [class*="sider"] div')
    var anchor = null
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i]
      if (el.childElementCount === 0) continue
      var leaf = textLeaf(el)
      if (leaf && leaf.textContent.trim() === 'System Info') { anchor = el; break }
    }
    if (!anchor) return
    var clone = anchor.cloneNode(true)
    clone.id = 'eac-stats-entry'
    if (clone.tagName === 'A') clone.setAttribute('href', HREF)
    else clone.addEventListener('click', function () { location.href = HREF })
    clone.style.cursor = 'pointer'
    var leaf = textLeaf(clone)
    if (leaf) leaf.textContent = 'EAC Dashboard'
    anchor.parentElement.insertBefore(clone, anchor.nextSibling)
    done = true
  }

  function start() {
    inject()
    if (!done) {
      var obs = new MutationObserver(function () { if (inject()) obs.disconnect() })
      obs.observe(document.body, { childList: true, subtree: true })
      setTimeout(function () { obs.disconnect() }, 60000)
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else start()
})()