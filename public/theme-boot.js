// Sets the visitor's day/night choice before the page paints (no white flash at night).
// A separate file because the security policy blocks inline scripts.
try {
  if (localStorage.getItem('site-theme') === 'night') document.documentElement.dataset.theme = 'night';
} catch (e) {}
