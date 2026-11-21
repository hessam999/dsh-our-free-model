// Initialise the theme from a local external module to respect the management page's no-inline-script CSP.
let saved
try { saved = localStorage.getItem('ofm-theme') } catch {
  // When storage is unavailable, still render the page using the system preference.
}
document.documentElement.dataset.theme = saved === 'dark' || saved === 'light'
  ? saved : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
