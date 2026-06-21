from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
THEMES=['dark', 'light', 'gray', 'emerald', 'hellforge', 'terminal', 'redalert']
ROUTES=['dashboard', 'executive', 'control', 'data-health', 'sku-plan-fact', 'repricer', 'prices', 'order', 'oos-control', 'sku-contour', 'launches', 'launch-control', 'iu-drr', 'wb-rating', 'product-leaderboard']
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1920,'height':1080},device_scale_factor=1)
    for theme in THEMES:
        out=ROOT/'themes'/theme/'routes';out.mkdir(parents=True,exist_ok=True)
        for i,route in enumerate(ROUTES,1):
            page.goto((ROOT/'altea-premium-portal-all-themes.html').as_uri()+f'?theme={theme}&route={route}&platform=all&capture=1')
            page.wait_for_timeout(250)
            page.screenshot(path=str(out/f'{i:02d}-{route}.jpg'), type='jpeg', quality=88)
    browser.close()
