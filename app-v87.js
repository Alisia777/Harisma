(function(){
  function applyImperialBranding(){
    try {
      document.body.classList.add('v87-imperial');
      const title = document.querySelector('.brand-title');
      if (title) title.textContent = 'Портал бренда Алтея';
      const sub = document.querySelector('.brand-sub');
      if (sub) sub.textContent = 'Порядок рождается из воли.';
      const h1 = document.querySelector('.topbar h1');
      if (h1) h1.textContent = 'Портал бренда Алтея';
      const p = document.querySelector('.topbar p');
      if (p) p.textContent = 'Истина в том, что правых нет. Есть лишь те, кто выдержал цену решений и не потерял курс во тьме.';
      document.title = 'Портал бренда Алтея · v8.7.1 Imperial';
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
