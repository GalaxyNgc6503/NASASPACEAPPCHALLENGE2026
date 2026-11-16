/* Runs before the page is drawn: marks that JavaScript works and applies the saved theme. */
(function () {
  var root = document.documentElement;
  root.classList.add("js");
  try {
    var saved = localStorage.getItem("ew-theme");
    if (saved === "light" || saved === "dark") { root.setAttribute("data-theme", saved); }
  } catch (e) { /* storage blocked: stay on the system theme */ }
})();
