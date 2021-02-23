const puppeteer = require('puppeteer')
const fs = require('fs');

let config = {}

async function report (log) {
	currentTime = new Date();
	console.log(currentTime.toString().split('G')[0] + ': ' + log)
}

async function check_cart_count(page) {
	const countSelector = 'span.row-title-note'
	await page.waitForSelector(countSelector)
	let titleEl = await page.$(countSelector)
	let titleElContent = await page.evaluate(titleEl => titleEl.textContent, titleEl)
	let itemCount = parseInt(titleElContent.replace(/[^0-9]/g, ''));
	return itemCount
}

async function check_cart (page) {
	await page.waitForTimeout(250)
	await report("checking cart on page: " + page.url())
	let itemCount = await check_cart_count(page)

	if (itemCount < 1) {
		await report("no items found in cart")
		return false
	}

	await report(`there are ${itemCount} items in the shopping cart` )

	try {
		
		const itemCells = await page.$$('.item-cell')
		const priceSelector = '.price .price-current'
		await page.waitForSelector(priceSelector , { timeout: 500 })

		await report(itemCells)

		for(let item of itemCells) {
			// grab the orice
		    let price = await item.$eval('.price .price-current', p => parseFloat(p.innerText.replace(/[^0-9.]/g, '').trim()))
			// grab the title
		    let title = await item.$eval('.item-info a', t => t.innerText.trim())

			report(`found item ${title} for ${price} in cart`)

			if ( price > config.price_limit) {
				await report(`item ${title} for ${price} exceeds price limit ${config.price_limit}`)
				// tash the item
				await item.$eval('.fa-trash', b => b.click());
				// wait for item to be trashed
				await page.waitForTimeout(100)
			}
		}

		itemCount = await check_cart_count(page)
		if (itemCount < 1) {
			await report("no items left in cart")
			return false
		}
	
		return true
	} catch (err) {
		await report(`Card not in stock. Error: ${err}`)
		await page.waitForTimeout(config.refresh_time * 1000)
		return false
	}
}


async function run () {
	var configFile = './' + process.argv[2];
	await report("config file = " + configFile)

	let rawdata = fs.readFileSync(configFile);
	config = await JSON.parse(rawdata);

	await report("Started")
	const browser = await puppeteer.launch({
        	headless: false,
			product: 'firefox',
        	defaultViewport: { width: 1366, height: 768 }
    	})
    const page = await browser.newPage()
	
    while (true) {
		await page.goto('https://secure.newegg.com/NewMyAccount/AccountLogin.aspx?nextpage=https%3a%2f%2fwww.newegg.com%2f' , {waitUntil: 'load' })
		if (page.url().includes('signin')) {
			await page.waitForSelector('button.btn.btn-orange')
			await page.type('#labeled-input-signEmail', config.email)
			await page.click('button.btn.btn-orange')
			await page.waitForTimeout(1500)
			try {
				await page.waitForSelector('#labeled-input-signEmail', {timeout: 500})
			} catch (err) {
				try {
					await page.waitForSelector('#labeled-input-password' , {timeout: 2500})
					await page.waitForSelector('button.btn.btn-orange')
					await page.type('#labeled-input-password', config.password)
					await page.click('button.btn.btn-orange')
					await page.waitForTimeout(1500)
					try {
						await page.waitForSelector('#labeled-input-password', {timeout: 500})
					} catch (err) {
						break
					}
				} catch (err) {
					report("Manual authorization code required by Newegg.  This should only happen once.")
					while (page.url().includes('signin'))
					{
						await page.waitForTimeout(500)
					}
					break
				}
			}
		} else if (page.url().includes("areyouahuman")) {
			await page.waitForTimeout(1000)
		}
	}

	await report("Logged in")
	await report("Checking for card")

	while (true)
	{
		try {
			let targetUrl = 'https://secure.newegg.com/Shopping/AddtoCart.aspx?Submit=ADD&ItemList=' + config.item_number
			await page.goto(targetUrl, { waitUntil: 'load' })
			await report(targetUrl + " -> " + page.url())
			if (page.url().toLowerCase().includes("shop/cart")) {
				var check = await check_cart(page)
				if (check) {
					break
				}
			} else if (page.url().includes("areyouahuman")) {
				await page.waitForTimeout(1000)
			}
		} catch (err) {
			await report(err)
			continue
		}
	}
	try {
		// click the add to cart button
		await page.click('.summary-actions .btn.btn-primary')
		await page.waitForSelector('.checkout-step-action .btn.btn-primary', {timeout: 500})
		// checkout
		await page.click('.checkout-step-action .btn.btn-primary')
	} catch (err) {
	}
	
	while (true) {
		try {
			await page.waitForSelector('.retype-security-code input.form-text', {timeout: 500})
			await page.type('.retype-security-code input.form-text', config.cv2)
			break
		} catch (err) {
		}
		try {
			await page.waitForSelector('#creditCardCVV2' , {timeout: 500})
			await page.type('#creditCardCVV2', config.cv2)
			break
		} catch (err) {
		}
	}

	if (config.auto_submit == 'true') {
		// click the done button
		await page.click('.checkout-step-action-done')

		try {
			await page.waitForSelector('.form-text.is-wide.mask-cardnumber', {timeout: 100})
			report("need to confirm cc number")
			// type in the cc
			page.type('.form-text.is-wide.mask-cardnumber', config.cc)
			// click the save button
			await page.click('.modal-footer .btn.btn-primary')
		} catch(err) {}
		
		// checking out now
		await page.click(".summary-actions .btn.btn-primary")
		await report("Completed purchase")
	} else {
		await report("card ready for checkout")
	}
}


run()
