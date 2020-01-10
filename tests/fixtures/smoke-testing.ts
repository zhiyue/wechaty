#!/usr/bin/env ts-node

// tslint:disable:no-var-requires
const isPR = require('is-pr')

import {
  Wechaty,
  VERSION,
}           from 'wechaty'

function getBotList (): Wechaty[] {
  const botList = [
    new Wechaty({ puppet: 'wechaty-puppet-mock' }),
    new Wechaty({ puppet: 'wechaty-puppet-wechat4u' }),
    // new Wechaty({ puppet: 'wechaty-puppet-puppeteer' }),
  ]

  if (!isPR) {
    botList.push(
      new Wechaty({
        puppet: 'wechaty-puppet-padplus',
        // we use WECHATY_PUPPET_PADPLUS_TOKEN environment variable at here.
      })
    )
  }

  return botList
}

async function main () {
  if (VERSION === '0.0.0') {
    throw new Error('VERSION not set!')
  }

  const botList = getBotList()
  try {
    await Promise.all(
      botList.map(bot => bot.start()),
    )
    botList.forEach(
      bot => console.log(`Wechaty v${bot.version()} smoking test passed.`),
    )
  } catch (e) {
    console.error(e)
    // Error!
    return 1
  } finally {
    await Promise.all(
      botList.map(bot => bot.stop()),
    )
  }
  return 0
}

main()
  .then(process.exit)
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
