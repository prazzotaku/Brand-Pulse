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
        
        # -> Click the 'All Mentions' link in the left navigation to open the mentions list.
        # All Mentions link
        elem = page.get_by_role('link', name='All Mentions', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'All Mentions' link in the left navigation to open the mentions list.
        # All Mentions link
        elem = page.get_by_role('link', name='All Mentions', exact=True)
        await elem.click(timeout=10000)
        
        # -> Open the mention titled 'Storytelling Competition Bank Jakarta Menyemarakkan PRJ 2026 - JPNN.com' from the list by clicking its content link.
        # Storytelling Competition Bank Jakarta... link
        elem = page.locator('a[href="/mentions/cmrbsuj4d004i54tsq1mpr69t"]')
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Verify the mention detail page shows AI analysis
        # Assert: AI analysis shows Relevance score of 90.
        await expect(page.locator("xpath=/html/body/div[1]/div/main/div/div[3]/div[2]/div[2]/div[1]/div[1]/span[2]").nth(0)).to_have_text("90", timeout=15000), "AI analysis shows Relevance score of 90."
        # Assert: AI analysis shows Sentiment score of 70.
        await expect(page.locator("xpath=/html/body/div[1]/div/main/div/div[3]/div[2]/div[2]/div[2]/div[1]/span[2]").nth(0)).to_have_text("70", timeout=15000), "AI analysis shows Sentiment score of 70."
        # Assert: AI analysis shows Confidence score of 95.
        await expect(page.locator("xpath=/html/body/div[1]/div/main/div/div[3]/div[2]/div[2]/div[3]/div[1]/span[2]").nth(0)).to_have_text("95", timeout=15000), "AI analysis shows Confidence score of 95."
        # Assert: AI analysis section includes the Risk label.
        await expect(page.locator("xpath=/html/body/div[1]/div/main/div/div[3]/div[2]/div[2]/div[4]/div[1]/span[1]").nth(0)).to_have_text("Risk", timeout=15000), "AI analysis section includes the Risk label."
        
        # --> Verify the raw source payload and source link are visible
        await page.locator("xpath=/html/body/div[1]/div/main/div/div[4]/div[2]/pre").nth(0).scroll_into_view_if_needed()
        # Assert: Raw source payload JSON block is visible on the mention detail page.
        await expect(page.locator("xpath=/html/body/div[1]/div/main/div/div[4]/div[2]/pre").nth(0)).to_be_visible(timeout=15000), "Raw source payload JSON block is visible on the mention detail page."
        await page.locator("xpath=/html/body/div[1]/div/main/div/div[2]/div[2]/div[2]/a").nth(0).scroll_into_view_if_needed()
        # Assert: Source link 'Buka sumber asli' is visible on the mention detail page.
        await expect(page.locator("xpath=/html/body/div[1]/div/main/div/div[2]/div[2]/div[2]/a").nth(0)).to_be_visible(timeout=15000), "Source link 'Buka sumber asli' is visible on the mention detail page."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    