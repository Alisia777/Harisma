(function(){
  const VALID_THEMES=new Set(['dark','light','gray','emerald','hellforge','terminal','redalert']);
  const VALID_PLATFORMS=new Set(['all','wb','ozon','ym','goldapple','letu','magnit']);
  function applyTheme(theme,{persist=true}={}){theme=VALID_THEMES.has(theme)?theme:'dark';document.documentElement.dataset.portalTheme=theme;document.body.dataset.portalTheme=theme;if(persist)try{localStorage.setItem('altea.portal.theme',theme)}catch(e){};window.dispatchEvent(new CustomEvent('altea:themechange',{detail:{theme}}));}
  function applyPlatform(platform,{persist=true}={}){platform=VALID_PLATFORMS.has(platform)?platform:'all';document.documentElement.dataset.platform=platform;document.body.dataset.platform=platform;if(persist)try{localStorage.setItem('altea.portal.platform',platform)}catch(e){};window.dispatchEvent(new CustomEvent('altea:platformchange',{detail:{platform}}));}
  window.AlteaPremiumTheme={applyTheme,applyPlatform};
})();
