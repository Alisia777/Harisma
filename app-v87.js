(function(){
  function applyImperialBranding(){
    try {
      document.body.classList.add('v87-imperial');
      const title = document.querySelector('.brand-title');
      if (title) title.textContent = 'Портал бренда Алтея';
      const sub = document.querySelector('.brand-sub');
      if (sub) sub.textContent = 'Тот, кто держит ритм, видит путь сквозь пески.';
      const h1 = document.querySelector('.topbar h1');
      if (h1) h1.textContent = 'Портал бренда Алтея';
      const p = document.querySelector('.topbar p');
      if (p) p.textContent = 'Имперский контур управления: цена, ритм, логистика и решения команды работают как единая система.';
      document.title = 'Портал бренда Алтея · v8.7 Imperial';
      const sync = document.getElementById('syncStatusBadge');
      if (sync) sync.classList.add('imperial-sync');
    } catch (e) {
      console.error(e);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyImperialBranding);
  } else {
    applyImperialBranding();
  }
})();
