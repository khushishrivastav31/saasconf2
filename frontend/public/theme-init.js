(function () {
  var s = localStorage.getItem('theme-preference');
  if (s === 'dark' || (!s && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
})();
