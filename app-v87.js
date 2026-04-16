(function(){
  function setNavSubtitle(view, value){
    const btn = document.querySelector(`.nav-btn[data-view="${view}"] small`);
    if (btn) btn.textContent = value;
  }
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
      document.title = 'Портал бренда Алтея · Имперский контур';
      const sync = document.getElementById('syncStatusBadge');
      if (sync) sync.classList.add('imperial-sync');
      setNavSubtitle('dashboard','Пульс · лидеры · сигналы');
      setNavSubtitle('documents','Регламенты · ссылки');
      setNavSubtitle('repricer','Цена · риски · рекомендации');
      setNavSubtitle('prices','Маржа · оборот · СПП');
      setNavSubtitle('order','Кластеры · склады · поставки');
      setNavSubtitle('control','Задачи · РОП · контроль');
      setNavSubtitle('skus','SKU · карточки · owner');
      setNavSubtitle('launches','Товар · новинки · экономика');
      setNavSubtitle('launch-control','Чек-листы · фазы · просрочки');
      setNavSubtitle('meetings','Weekly · Monthly · PMR');
      setNavSubtitle('executive','Риски · решения · итог');
      const footTitle = document.querySelector('.sidebar-foot h4');
      if (footTitle) footTitle.textContent = 'Дом Алтея';
      const footText = document.querySelector('.sidebar-foot p');
      if (footText) footText.textContent = 'Сначала порядок. Затем движение.';
    } catch (e) {
      console.error(e);
    }
  }
  const apply = () => requestAnimationFrame(applyImperialBranding);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
  const prevRerender = window.rerenderCurrentView;
  if (typeof prevRerender === 'function') {
    window.rerenderCurrentView = function(){
      const result = prevRerender.apply(this, arguments);
      apply();
      return result;
    };
  }
  const prevPull = window.pullRemoteState;
  if (typeof prevPull === 'function') {
    window.pullRemoteState = async function(){
      const result = await prevPull.apply(this, arguments);
      apply();
      return result;
    };
  }
  const prevPush = window.pushStateToRemote;
  if (typeof prevPush === 'function') {
    window.pushStateToRemote = async function(){
      const result = await prevPush.apply(this, arguments);
      apply();
      return result;
    };
  }
})();
