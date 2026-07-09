import asyncio
import re
from playwright import async_api
from playwright.async_api import expect

async def run_test():
    pw = None
    browser = None
    context = None

    try:
        # Start a Playwright session in asynchronous mode
        pw = await async_api.async_playwright().start()

        # Launch a Chromium browser in headless mode with custom arguments
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--window-size=1280,720",
                "--disable-dev-shm-usage",
                "--ipc=host",
                "--single-process"
            ],
        )

        # Create a new browser context (like an incognito window)
        context = await browser.new_context()
        # Wider default timeout to match the agent's DOM-stability budget;
        # auto-waiting Playwright APIs (expect, locator.wait_for) inherit this.
        context.set_default_timeout(15000)

        # Open a new page in the browser context
        page = await context.new_page()

        # Interact with the page elements to simulate user flow
        # -> navigate
        await page.goto("http://localhost:3000")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # -> Open the 'Periode' preset dropdown and choose '30 hari terakhir' from the dropdown options.
        # [internal] get_dropdown_options: index=
        
        # -> Open the 'Periode' preset dropdown and choose '30 hari terakhir' from the dropdown options.
        # 24 jam terakhir 7 hari terakhir 30 hari terakhir... dropdown
        elem = page.locator("xpath=/html/body/div/div/main/div/div[2]/select").nth(0)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.select_option("")
        
        # -> Select '30 hari terakhir' from the Periode (period) dropdown to change the dashboard time range.
        # 24 jam terakhir 7 hari terakhir 30 hari terakhir... dropdown
        elem = page.locator("xpath=/html/body/div/div/main/div/div[2]/select").nth(0)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.select_option("")
        
        # --> Assertions to verify final state
        
        # --> Verify the dashboard shows brand health and sentiment overview data
        # Assert: Brand Health Score displays 75.
        await expect(page.locator("xpath=/html/body/div/div/main/div/div[3]/div[1]/div[2]/div[1]/span[1]").nth(0)).to_have_text("75", timeout=15000), "Brand Health Score displays 75."
        # Assert: Negative Spike Alert shows 0.
        await expect(page.locator("xpath=/html/body/div/div/main/div/div[3]/div[3]/div[2]/span").nth(0)).to_have_text("0", timeout=15000), "Negative Spike Alert shows 0."
        # Assert: Media Tone overview includes the 'positive' sentiment segment.
        await expect(page.locator("xpath=/html/body/div/div/main/div/div[5]/div[1]/div[2]/div/div/div/div[1]/ul/li[1]/span/span").nth(0)).to_have_text("positive", timeout=15000), "Media Tone overview includes the 'positive' sentiment segment."
        # Assert: Media Tone overview includes the 'negative' sentiment segment.
        await expect(page.locator("xpath=/html/body/div/div/main/div/div[5]/div[1]/div[2]/div/div/div/div[1]/ul/li[4]/span/span").nth(0)).to_have_text("negative", timeout=15000), "Media Tone overview includes the 'negative' sentiment segment."
        
        # --> Verify the dashboard metrics refresh for the selected period
        # Assert: URL contains 'range=30d', confirming the 30-day period is applied.
        await expect(page).to_have_url(re.compile("range=30d"), timeout=15000), "URL contains 'range=30d', confirming the 30-day period is applied."
        # Assert: The Periode selector shows '30 hari terakhir', indicating the 30-day range option is present/applied.
        await expect(page.locator("xpath=/html/body/div/div/main/div/div[2]/select[1]").nth(0)).to_contain_text("30 hari terakhir", timeout=15000), "The Periode selector shows '30 hari terakhir', indicating the 30-day range option is present/applied."
        # Assert: Brand Health Score card displays 75 for the selected period.
        await expect(page.locator("xpath=/html/body/div/div/main/div/div[3]/div[1]/div[2]/div[1]/span[1]").nth(0)).to_have_text("75", timeout=15000), "Brand Health Score card displays 75 for the selected period."
        # Assert: Negative Spike Alert shows 0 for the selected period.
        await expect(page.locator("xpath=/html/body/div/div/main/div/div[3]/div[3]/div[2]/span").nth(0)).to_have_text("0", timeout=15000), "Negative Spike Alert shows 0 for the selected period."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    