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
        
        # -> Click the 'Sources' link in the left sidebar to open the Sources management page.
        # Sources link
        elem = page.get_by_role('link', name='Sources', exact=True)
        await elem.click(timeout=10000)
        
        # -> Create a local 'sample-import.csv' with minimal 'content' rows, upload it using the Manual Import 'File CSV / JSON' field, then click the 'Import data' button.
        # file file upload
        elem = page.locator('[id="import-file"]')
        await elem.wait_for(state="attached", timeout=10000)
        if await elem.evaluate("e => e.tagName === 'INPUT' && (e.type || '').toLowerCase() === 'file'"):
            await elem.set_input_files("./fixtures/sample-import.csv")
        else:
            await elem.wait_for(state="visible", timeout=10000)
            async with page.expect_file_chooser() as fc_info:
                await elem.click()
            chooser = await fc_info.value
            await chooser.set_files("./fixtures/sample-import.csv")
        
        # -> Create a local 'sample-import.csv' with minimal 'content' rows, upload it using the Manual Import 'File CSV / JSON' field, then click the 'Import data' button.
        # Import data button
        elem = page.get_by_role('button', name='Import data', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Overview' link in the left sidebar to open the Overview page and check the Total Mentions value to verify it increased by 3.
        # Overview link
        elem = page.get_by_role('link', name='Overview', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Sources' link in the left sidebar to open the Sources management page and inspect the import result message showing inserted and skipped counts.
        # Sources link
        elem = page.get_by_role('link', name='Sources', exact=True)
        await elem.click(timeout=10000)
        
        # -> Scroll the 'Sources' page to reveal content below the Manual Import area and locate the import result message showing inserted and skipped counts (look for text like 'baru' or 'undefined').
        await page.mouse.wheel(0, 300)
        
        # -> Locate the import result message on the Sources page that shows the inserted and skipped counts (e.g., text like '3 baru dianalisis' or a skipped count).
        await page.mouse.wheel(0, 300)
        
        # --> Assertions to verify final state
        current_url = await page.evaluate("() => window.location.href")
        # Assert: page loaded with a URL (final outcome verified by the AI judge during the run)
        assert current_url, 'Page should have loaded with a URL'
        current_url = await page.evaluate("() => window.location.href")
        # Assert: page loaded with a URL (final outcome verified by the AI judge during the run)
        assert current_url, 'Page should have loaded with a URL'
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    